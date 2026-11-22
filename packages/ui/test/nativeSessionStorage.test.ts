/**
 * `createNativeSessionStorage` com um SecureStore e um NSUserDefaults FALSOS (`helpers/fakes.ts`): a decisão sobre o
 * Keychain do iOS na reinstalação, a acessibilidade do item e as chaves que chegam ao módulo.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createNativeSessionStorage } from '../src/device/nativeSessionStorage';
import { installMarkerKey } from '../src/device/sessionKeys';
import { AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY, FakeIos, FakeKeychain } from './helpers/fakes';

const SESSION = 'vuumbora.passenger.session';
const INSTALLATION = 'vuumbora.passenger.installation_id';
const PENDING = 'vuumbora.passenger.pending_revocations';

const openApp = (ios: FakeIos, accountType: 'passenger' | 'driver' = 'passenger') =>
  createNativeSessionStorage({
    accountType,
    secureStore: ios.keychain,
    keychainAccessible: AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    settings: ios.userDefaults,
  });

describe('iOS: o Keychain sobrevive à desinstalação, o app descarta o que ficou', () => {
  it('instalação nova com Keychain vazio: grava o marcador e funciona', async () => {
    const ios = new FakeIos();
    const storage = openApp(ios);
    await storage.setItem(SESSION, 'tokens-1');
    assert.equal(await storage.getItem(SESSION), 'tokens-1');
    assert.equal(ios.userDefaults.get(installMarkerKey('passenger')), '1');
  });

  it('reabrir o app mantém a sessão (fechar à força e abrir de novo)', async () => {
    const ios = new FakeIos();
    await openApp(ios).setItem(SESSION, 'tokens-1');
    await openApp(ios).setItem(INSTALLATION, 'instalacao-1');
    // processo novo, mesmo aparelho, mesma instalação
    const reopened = openApp(ios);
    assert.equal(await reopened.getItem(SESSION), 'tokens-1');
    assert.equal(await reopened.getItem(INSTALLATION), 'instalacao-1');
  });

  it('DESINSTALAR e instalar de novo: o Keychain ainda tem a sessão antiga, mas o app a descarta', async () => {
    const ios = new FakeIos();
    const first = openApp(ios);
    await first.setItem(SESSION, 'tokens-da-instalacao-1');
    await first.setItem(INSTALLATION, 'instalacao-1');
    await first.setItem(PENDING, 'fila-1');

    ios.reinstall();
    assert.equal(ios.keychain.items.get(SESSION), 'tokens-da-instalacao-1', 'premissa do iOS: o Keychain sobreviveu');
    assert.equal(ios.userDefaults.get(installMarkerKey('passenger')), undefined, 'premissa do iOS: o marcador sumiu');

    const second = openApp(ios);
    assert.equal(await second.getItem(SESSION), null, 'a sessão da instalação anterior NÃO é entregue');
    assert.equal(await second.getItem(INSTALLATION), null, 'o installationId também é da instalação');
    assert.equal(await second.getItem(PENDING), null);
    assert.equal(ios.keychain.items.size, 0, 'e foi apagada de verdade, não só escondida');

    // A instalação nova funciona normalmente e a abertura seguinte a mantém.
    await second.setItem(SESSION, 'tokens-da-instalacao-2');
    assert.equal(await openApp(ios).getItem(SESSION), 'tokens-da-instalacao-2');
  });

  it('reinstalar duas vezes seguidas apaga nas duas', async () => {
    const ios = new FakeIos();
    await openApp(ios).setItem(SESSION, 'a');
    ios.reinstall();
    await openApp(ios).setItem(SESSION, 'b');
    ios.reinstall();
    assert.equal(await openApp(ios).getItem(SESSION), null);
  });

  it('a reinstalação de UM app não apaga o cofre do OUTRO perfil', async () => {
    const ios = new FakeIos();
    await openApp(ios, 'driver').setItem('vuumbora.driver.session', 'do-motorista');
    await openApp(ios, 'passenger').setItem(SESSION, 'do-passageiro');
    ios.reinstall();
    await openApp(ios, 'passenger').ready();
    assert.equal(ios.keychain.items.get('vuumbora.driver.session'), 'do-motorista');
    assert.equal(ios.keychain.items.has(SESSION), false);
  });

  it('o app aberto antes de a verificação acabar não vê nem apaga uma sessão nova (ordem sob atraso do cofre)', async () => {
    const ios = new FakeIos();
    ios.keychain.items.set(SESSION, 'velha');
    ios.keychain.delayMs = 5;
    const storage = openApp(ios);
    const [read] = await Promise.all([storage.getItem(SESSION), storage.setItem(SESSION, 'nova')]);
    assert.equal(read, null);
    assert.equal(ios.keychain.items.get(SESSION), 'nova');
  });
});

describe('Android: sem marcador, o cofre é repassado', () => {
  it('não mexe no cofre na abertura (nada a limpar: desinstalar apaga o arquivo do SecureStore)', async () => {
    const keychain = new FakeKeychain();
    keychain.items.set(SESSION, 'sessao');
    const storage = createNativeSessionStorage({
      accountType: 'passenger',
      secureStore: keychain,
      keychainAccessible: AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      settings: null,
    });
    assert.equal(await storage.getItem(SESSION), 'sessao');
    assert.equal(keychain.count('delete'), 0);
  });
});

describe('o que chega ao módulo do SecureStore', () => {
  it('toda gravação leva a acessibilidade AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY', async () => {
    const ios = new FakeIos();
    const storage = openApp(ios);
    await storage.setItem(SESSION, 'a');
    await storage.setItem(INSTALLATION, 'b');
    await storage.setItem(PENDING, 'c');
    for (const key of [SESSION, INSTALLATION, PENDING]) {
      assert.equal(ios.keychain.accessibleOf.get(key), AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY, key);
    }
  });

  it('as chaves do api-client são válidas para o SecureStore real (alfanumérico, ".", "-", "_")', async () => {
    const ios = new FakeIos(); // o fake rejeita chave inválida como o módulo real
    const storage = openApp(ios);
    await storage.setItem(SESSION, 'a');
    await storage.setItem(INSTALLATION, 'b');
    await storage.setItem(PENDING, 'c');
    await storage.removeItem(PENDING);
    assert.equal(ios.keychain.items.size, 2);
  });

  it('erro do cofre chega a quem chamou (o api-client o reporta sem derrubar a sessão em memória)', async () => {
    const ios = new FakeIos();
    const storage = openApp(ios);
    await storage.ready();
    ios.keychain.failing.add(`set:${SESSION}`);
    await assert.rejects(() => storage.setItem(SESSION, 'x'), /falha injetada/);
  });
});
