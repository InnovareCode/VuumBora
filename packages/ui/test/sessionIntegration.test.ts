/**
 * O cofre nativo (com SecureStore e NSUserDefaults falsos) POR BAIXO do cliente de identidade de verdade
 * (`createIdentityClient`, modo mock): login grava no Keychain falso sob as chaves do contrato, reabrir restaura a sessão,
 * reinstalar não a restaura, logout apaga. É a prova de que a porta encaixa no api-client — e não só consigo mesma.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createIdentityClient, type IdentityClient } from '@vuumbora/api-client/identity';
import { createNativeSessionStorage } from '../src/device/nativeSessionStorage';
import { AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY, FakeIos } from './helpers/fakes';

const SESSION_KEY = 'vuumbora.passenger.session';
const INSTALLATION_KEY = 'vuumbora.passenger.installation_id';

let uuidCounter = 0;
const storageErrors: unknown[] = [];

/** Um "processo" do app: cliente novo sobre o mesmo aparelho. O servidor mock é por cliente, então a sessão é restaurada só do cofre. */
function openApp(ios: FakeIos): IdentityClient {
  return createIdentityClient({
    mode: 'mock',
    accountType: 'passenger',
    platform: 'ios',
    storage: createNativeSessionStorage({
      accountType: 'passenger',
      secureStore: ios.keychain,
      keychainAccessible: AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      settings: ios.userDefaults,
    }),
    randomId: () => `00000000-0000-4000-8000-${String((uuidCounter += 1)).padStart(12, '0')}`,
    mock: { latencyMs: 0 },
    onStorageError: (error) => storageErrors.push(error),
  });
}

async function registerAndLogin(identity: IdentityClient): Promise<void> {
  const legal = await identity.legalCurrent();
  assert.ok(legal.ok);
  const registered = await identity.register({
    fullName: 'Ana Souza',
    email: 'ana@example.com',
    password: 'senha-segura-1',
    birthDate: '1990-05-17',
    termsAccepted: true,
    privacyAccepted: true,
    termsVersion: legal.data.terms.version,
    privacyVersion: legal.data.privacy.version,
  });
  assert.ok(registered.ok, JSON.stringify(registered));
  const verified = await identity.verifyEmail({ identifier: 'ana@example.com', code: '123456', password: 'senha-segura-1' });
  assert.ok(verified.ok, JSON.stringify(verified));
  const login = await identity.login({ identifier: 'ana@example.com', password: 'senha-segura-1' });
  assert.ok(login.ok, JSON.stringify(login));
}

describe('cofre nativo sob o cliente de identidade', () => {
  it('login grava a sessão e o installationId nas chaves do contrato, com a acessibilidade certa', async () => {
    const ios = new FakeIos();
    const identity = openApp(ios);
    await registerAndLogin(identity);
    await identity.session.restore();

    const stored = ios.keychain.items.get(SESSION_KEY);
    assert.ok(stored, 'a sessão está no cofre');
    assert.match(stored, /"refreshToken":"mock-refresh-token-/);
    assert.ok(ios.keychain.items.get(INSTALLATION_KEY), 'o installationId está no cofre');
    assert.equal(ios.keychain.accessibleOf.get(SESSION_KEY), AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY);
    assert.equal(ios.keychain.accessibleOf.get(INSTALLATION_KEY), AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY);
    assert.deepEqual(storageErrors, []);
  });

  it('reabrir o app (processo novo, mesma instalação) restaura a sessão', async () => {
    const ios = new FakeIos();
    await registerAndLogin(openApp(ios));

    const reopened = openApp(ios);
    const state = await reopened.session.restore();
    assert.equal(state.status, 'signed_in');
  });

  it('reinstalar o app (Keychain mantido, marcador perdido) abre DESLOGADO e sem o installationId antigo', async () => {
    const ios = new FakeIos();
    await registerAndLogin(openApp(ios));
    const previousInstallation = ios.keychain.items.get(INSTALLATION_KEY);
    assert.ok(previousInstallation);

    ios.reinstall();
    const reinstalled = openApp(ios);
    const state = await reinstalled.session.restore();
    assert.equal(state.status, 'signed_out');
    assert.equal(ios.keychain.items.has(SESSION_KEY), false, 'a sessão antiga foi apagada do Keychain');
    assert.notEqual(ios.keychain.items.get(INSTALLATION_KEY), previousInstallation);
  });

  it('LIMITAÇÃO DO MOCK: reaberto, o app restaura a sessão do cofre, mas o servidor simulado (que vive na memória do processo) não a reconhece', async () => {
    // Em `mode: 'http'` (B4) isto não acontece: o servidor é o mesmo entre aberturas. Aqui documenta o que quem testa o
    // modo simulado num aparelho vai ver: a sessão persiste no Keychain, mas a primeira chamada autenticada a derruba.
    const ios = new FakeIos();
    await registerAndLogin(openApp(ios));

    const reopened = openApp(ios);
    assert.equal((await reopened.session.restore()).status, 'signed_in');
    const me = await reopened.me();
    assert.equal(me.ok, false);
    assert.deepEqual(reopened.session.getState(), { status: 'signed_out', reason: 'session_expired' });
    assert.equal(ios.keychain.items.has(SESSION_KEY), false, 'a sessão rejeitada também sai do cofre');
  });

  it('sair da conta apaga a sessão do cofre (o installationId fica: é da instalação)', async () => {
    const ios = new FakeIos();
    const identity = openApp(ios);
    await registerAndLogin(identity);
    const installation = ios.keychain.items.get(INSTALLATION_KEY);

    await identity.logout();
    assert.equal(ios.keychain.items.has(SESSION_KEY), false);
    assert.equal(ios.keychain.items.get(INSTALLATION_KEY), installation);
  });

  it('cofre que falha ao LER na abertura não derruba o app: abre deslogado e reporta o erro, sem o conteúdo', async () => {
    const ios = new FakeIos();
    await registerAndLogin(openApp(ios));
    storageErrors.length = 0;

    ios.keychain.failing.add(`get:${SESSION_KEY}`);
    const state = await openApp(ios).session.restore();
    assert.equal(state.status, 'signed_out');
    assert.ok(storageErrors.length >= 1, 'o erro foi reportado');
    assert.equal(JSON.stringify(storageErrors.map((error) => (error instanceof Error ? error.message : error))).includes('mock-refresh-token'), false);
    assert.ok(ios.keychain.items.has(SESSION_KEY), 'a sessão não foi apagada por causa de um erro de leitura');
  });
});
