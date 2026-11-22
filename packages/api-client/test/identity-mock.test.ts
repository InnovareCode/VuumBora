/**
 * Adaptador `mock` da identidade: mesmas regras e mesmos códigos de erro do contrato (docs/contrato-identidade-apps.md).
 * Dois tipos de prova: cenários que a UI vai viver (cada `code` do contrato aparece por um caminho natural) e uma
 * conferência contra o próprio documento (todo código que o mock emite está escrito no contrato).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { createIdentityClient } from '../src/identity/client';
import { createMockIdentityApi } from '../src/identity/mock-adapter';
import type { IdentityApi, RegisterInput } from '../src/identity/types';
import type { ApiError, Result } from '../src/index';

const EMAIL = 'ana@example.com';
const PASSWORD = 'senha-segura-1';
const DEVICE = { installationId: 'install-12345678', platform: 'android' } as const;
const NOW = Date.UTC(2026, 10, 21, 15, 0, 0); // 21/11/2026 12:00 em Natal

const REGISTER: RegisterInput = {
  fullName: 'Ana Souza',
  email: EMAIL,
  password: PASSWORD,
  birthDate: '1990-05-15',
  termsAccepted: true,
  privacyAccepted: true,
};

const emitted = new Set<string>();

/** Registra todo `code` que o mock devolveu (para a conferência contra o contrato, no fim). */
function track<T>(result: Result<T>): Result<T> {
  if (!result.ok && result.error.code) emitted.add(result.error.code);
  return result;
}

function fresh(options: { now?: () => number } = {}): IdentityApi {
  const raw = createMockIdentityApi('passenger', { clock: options.now ?? (() => NOW) });
  const wrap = <A extends unknown[], T>(fn: (...args: A) => Promise<Result<T>>) => async (...args: A) => track(await fn(...args));
  return {
    register: wrap(raw.register),
    verifyEmail: wrap(raw.verifyEmail),
    resendVerification: wrap(raw.resendVerification),
    forgotPassword: wrap(raw.forgotPassword),
    resetPassword: wrap(raw.resetPassword),
    login: wrap(raw.login),
    refresh: wrap(raw.refresh),
    logout: wrap(raw.logout),
    logoutAll: wrap(raw.logoutAll),
    me: wrap(raw.me),
  };
}

function expectError(result: Result<unknown>, expected: Readonly<Record<string, unknown>>): ApiError {
  assert.ok(!result.ok, 'esperava erro');
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual((result.error as unknown as Record<string, unknown>)[key], value, key);
  }
  return result.error;
}

async function registered(api: IdentityApi, overrides: Partial<RegisterInput> = {}) {
  const result = await api.register({ ...REGISTER, ...overrides });
  assert.ok(result.ok, 'cadastro de apoio deveria passar');
  return result.data;
}

async function verified(api: IdentityApi) {
  await registered(api);
  assert.ok((await api.verifyEmail({ identifier: EMAIL, code: '123456', password: PASSWORD })).ok);
}

describe('mock — cadastro', () => {
  test('caminho feliz: 201-equivalente, sem token, e-mail "enviado"; origin mock', async () => {
    const result = await fresh().register(REGISTER);
    assert.ok(result.ok);
    assert.equal(result.origin, 'mock');
    assert.deepEqual(result.data.verification, { required: true, emailSent: true, resendAfterSeconds: 60 });
    assert.equal(result.data.account.accountType, 'passenger');
    assert.ok(!('accessToken' in result.data), 'cadastro não abre sessão');
  });

  const invalid: ReadonlyArray<[string, Partial<RegisterInput> | Record<string, unknown>, Readonly<Record<string, unknown>>]> = [
    ['e-mail inválido', { email: 'sem-arroba' }, { kind: 'validation', code: 'invalid_email', fields: { email: 'E-mail inválido.' } }],
    ['senha curta', { password: '1234567' }, { kind: 'validation', code: 'invalid_password' }],
    ['senha acima de 72 BYTES (36 acentuadas = 72 bytes passa; 37 não)', { password: 'é'.repeat(37) }, { kind: 'validation', code: 'invalid_password' }],
    ['telefone inválido', { phone: '123' }, { kind: 'validation', code: 'invalid_phone' }],
    ['data em formato errado', { birthDate: '15/05/1990' }, { kind: 'validation', code: 'invalid_birth_date' }],
    ['data impossível', { birthDate: '1990-02-30' }, { kind: 'validation', code: 'invalid_birth_date' }],
    ['data futura', { birthDate: '2030-01-01' }, { kind: 'validation', code: 'invalid_birth_date' }],
    ['antes de 1900', { birthDate: '1899-12-31' }, { kind: 'validation', code: 'invalid_birth_date' }],
    ['menor de 18 (faltando 1 dia)', { birthDate: '2008-11-22' }, { kind: 'forbidden', code: 'underage' }],
    ['sem aceite dos termos', { termsAccepted: false }, { kind: 'validation', code: 'consent_required', fields: { consent: 'É preciso aceitar os Termos de Uso e a Política de Privacidade.' } }],
    ['sem aceite da privacidade', { privacyAccepted: undefined }, { kind: 'validation', code: 'consent_required' }],
    ['nome vazio', { fullName: '   ' }, { kind: 'validation', code: 'invalid_body' }],
  ];
  for (const [name, patch, expected] of invalid) {
    test(`recusa: ${name}`, async () => {
      expectError(await fresh().register({ ...REGISTER, ...patch } as RegisterInput), expected);
    });
  }

  test('18 anos completos hoje no fuso de Natal passa; 36 acentuadas (72 bytes) passa', async () => {
    assert.ok((await fresh().register({ ...REGISTER, birthDate: '2008-11-21' })).ok, 'faz 18 hoje');
    assert.ok((await fresh().register({ ...REGISTER, password: 'é'.repeat(36) })).ok);
  });

  test('29/02: nos anos não bissextos completa 18 em 01/03', async () => {
    const before = fresh({ now: () => Date.UTC(2026, 1, 28, 15, 0, 0) }); // 28/02/2026
    const after = fresh({ now: () => Date.UTC(2026, 2, 1, 15, 0, 0) }); // 01/03/2026
    expectError(await before.register({ ...REGISTER, birthDate: '2008-02-29' }), { kind: 'forbidden', code: 'underage' });
    assert.ok((await after.register({ ...REGISTER, birthDate: '2008-02-29' })).ok);
  });

  test('a ordem do servidor vale: erro de campo vem antes de idade e telefone', async () => {
    expectError(await fresh().register({ ...REGISTER, email: 'x', birthDate: '2020-01-01' }), { code: 'invalid_email' });
    expectError(await fresh().register({ ...REGISTER, birthDate: '2020-01-01', phone: '1' }), { code: 'underage' });
  });

  test('e-mail já VERIFICADO = 409 email_taken; não verificado = substituído por conta nova (ids novos)', async () => {
    const api = fresh();
    const first = await registered(api);
    const second = await registered(api, { fullName: 'Outra Pessoa' });
    assert.notEqual(second.account.id, first.account.id, 'a conta pendente foi substituída, não editada');
    assert.notEqual(second.account.publicId, first.account.publicId);

    assert.ok((await api.verifyEmail({ identifier: EMAIL, code: '123456', password: PASSWORD })).ok);
    expectError(await api.register(REGISTER), { kind: 'conflict', reason: 'email_taken', code: 'email_taken' });
  });

  test('o mesmo e-mail pode existir como passageiro e como motorista (contas separadas)', async () => {
    const passenger = createMockIdentityApi('passenger');
    const driver = createMockIdentityApi('driver');
    assert.ok((await passenger.register(REGISTER)).ok);
    const asDriver = await driver.register(REGISTER);
    assert.ok(asDriver.ok && asDriver.data.account.accountType === 'driver');
  });
});

describe('mock — código de e-mail', () => {
  test('verificação: código certo + senha do cadastro; depois já não vale (code_expired)', async () => {
    const api = fresh();
    await registered(api);
    assert.ok((await api.verifyEmail({ identifier: EMAIL, code: '123456', password: PASSWORD })).ok);
    expectError(await api.verifyEmail({ identifier: EMAIL, code: '123456', password: PASSWORD }), { kind: 'validation', code: 'code_expired' });
  });

  test('código errado e SENHA errada dão a mesma resposta e gastam a mesma tentativa; a 6ª trava', async () => {
    const api = fresh();
    await registered(api);
    expectError(await api.verifyEmail({ identifier: EMAIL, code: '000000', password: PASSWORD }), { kind: 'validation', code: 'invalid_code', attemptsLeft: 4 });
    const wrongPassword = expectError(await api.verifyEmail({ identifier: EMAIL, code: '123456', password: 'outra-senha-xx' }), { kind: 'validation', code: 'invalid_code', attemptsLeft: 3 });
    assert.equal((wrongPassword as { fields: Record<string, string> }).fields['code'], 'Código ou senha incorretos.');
    for (const left of [2, 1, 0]) {
      expectError(await api.verifyEmail({ identifier: EMAIL, code: '000000', password: PASSWORD }), { code: 'invalid_code', attemptsLeft: left });
    }
    expectError(await api.verifyEmail({ identifier: EMAIL, code: '123456', password: PASSWORD }), { kind: 'rate_limited', code: 'code_locked' });

    // "Peça outro código": o reenvio devolve as tentativas e o código certo volta a valer.
    assert.ok((await api.resendVerification({ identifier: EMAIL })).ok);
    assert.ok((await api.verifyEmail({ identifier: EMAIL, code: '123456', password: PASSWORD })).ok);
  });

  test('conta inexistente e conta já verificada: code_expired (indistinguíveis)', async () => {
    const api = fresh();
    expectError(await api.verifyEmail({ identifier: 'ninguem@example.com', code: '123456', password: PASSWORD }), { code: 'code_expired' });
  });

  test('reenvio e esqueci a senha respondem 200 igual exista a conta ou não', async () => {
    const api = fresh();
    for (const call of [() => api.resendVerification({ identifier: 'ninguem@example.com' }), () => api.forgotPassword({ email: 'ninguem@example.com' })]) {
      const result = await call();
      assert.ok(result.ok);
      assert.deepEqual(result.data, { resendAfterSeconds: 60 });
    }
  });

  test('redefinição: troca a senha, REVOGA as sessões (refresh e access caem) e não exige login prévio', async () => {
    let now = NOW;
    const api = fresh({ now: () => now });
    await verified(api);
    const session = await api.login({ identifier: EMAIL, password: PASSWORD }, DEVICE);
    assert.ok(session.ok);

    assert.ok((await api.forgotPassword({ email: EMAIL })).ok);
    const reset = await api.resetPassword({ email: EMAIL, code: '123456', newPassword: 'nova-senha-123' });
    assert.ok(reset.ok && reset.data.sessionsRevoked);

    expectError(await api.refresh(session.data.refreshToken), { kind: 'unauthorized', code: 'invalid_refresh_token' });
    expectError(await api.me(session.data.accessToken), { kind: 'unauthorized', code: 'unauthorized' });
    expectError(await api.login({ identifier: EMAIL, password: PASSWORD }, DEVICE), { code: 'invalid_credentials' });
    now += 2_000; // a falha acima abriu a espera progressiva (1 s)
    assert.ok((await api.login({ identifier: EMAIL, password: 'nova-senha-123' }, DEVICE)).ok);
  });

  test('redefinição: senha nova inválida, código errado com tentativas, e o teto cumulativo reset_locked (nem o código certo vale)', async () => {
    const api = fresh();
    await verified(api);
    await api.forgotPassword({ email: EMAIL });
    expectError(await api.resetPassword({ email: EMAIL, code: '123456', newPassword: 'curta' }), { kind: 'validation', code: 'invalid_password' });

    // 10 falhas somam entre códigos (cada código aguenta 5): 5 + pede outro + 5.
    for (let i = 0; i < 5; i += 1) expectError(await api.resetPassword({ email: EMAIL, code: '000000', newPassword: 'nova-senha-123' }), { code: 'invalid_code' });
    expectError(await api.resetPassword({ email: EMAIL, code: '123456', newPassword: 'nova-senha-123' }), { kind: 'rate_limited', code: 'code_locked' });
    await api.forgotPassword({ email: EMAIL });
    for (let i = 0; i < 5; i += 1) expectError(await api.resetPassword({ email: EMAIL, code: '000000', newPassword: 'nova-senha-123' }), { code: 'invalid_code' });

    const locked = expectError(await api.resetPassword({ email: EMAIL, code: '123456', newPassword: 'nova-senha-123' }), { kind: 'rate_limited', code: 'reset_locked', retryAfterSeconds: 86400 });
    assert.equal(locked.kind, 'rate_limited');
  });

  test('redefinir para e-mail desconhecido = code_expired (não revela nada)', async () => {
    expectError(await fresh().resetPassword({ email: 'ninguem@example.com', code: '123456', newPassword: 'nova-senha-123' }), { code: 'code_expired' });
  });
});

describe('mock — login, tokens e sessão', () => {
  test('conta não verificada com senha CERTA = 403 email_not_verified; senha errada = invalid_credentials (não revela)', async () => {
    const api = fresh();
    await registered(api);
    expectError(await api.login({ identifier: EMAIL, password: PASSWORD }, DEVICE), { kind: 'forbidden', code: 'email_not_verified' });
    expectError(await api.login({ identifier: EMAIL, password: 'errada-errada' }, DEVICE), { kind: 'unauthorized', code: 'invalid_credentials' });
    expectError(await api.login({ identifier: 'ninguem@example.com', password: PASSWORD }, DEVICE), { kind: 'unauthorized', code: 'invalid_credentials' });
  });

  test('login por e-mail (qualquer caixa) ou por ID público (qualquer caixa)', async () => {
    const api = fresh();
    const { account } = await registered(api);
    await api.verifyEmail({ identifier: EMAIL, code: '123456', password: PASSWORD });
    assert.ok((await api.login({ identifier: '  ANA@Example.COM ', password: PASSWORD }, DEVICE)).ok);
    assert.ok((await api.login({ identifier: account.publicId.toLowerCase(), password: PASSWORD }, DEVICE)).ok);
  });

  test('espera progressiva por identificador: 1 s, 2 s, 4 s...; durante a espera nem a senha certa entra e a recusa não alonga', async () => {
    let now = NOW;
    const api = fresh({ now: () => now });
    await verified(api);
    const wrong = () => api.login({ identifier: EMAIL, password: 'errada-errada' }, DEVICE);
    const right = () => api.login({ identifier: EMAIL, password: PASSWORD }, DEVICE);

    expectError(await wrong(), { code: 'invalid_credentials' });
    expectError(await right(), { kind: 'rate_limited', code: 'too_many_attempts', retryAfterSeconds: 1 });
    now += 1_000;
    expectError(await wrong(), { code: 'invalid_credentials' }); // 2ª falha → espera de 2 s
    now += 1_000;
    expectError(await right(), { kind: 'rate_limited', retryAfterSeconds: 1 }); // sobra 1 s: a recusa anterior não alongou
    now += 1_000;
    assert.ok((await right()).ok, 'passada a espera, a senha certa entra e zera as falhas');
    expectError(await wrong(), { code: 'invalid_credentials' });
    expectError(await right(), { retryAfterSeconds: 1 });
  });

  test('refresh rotaciona: o velho morre; reusar o velho derruba a FAMÍLIA inteira (como a API)', async () => {
    const api = fresh();
    await verified(api);
    const login = await api.login({ identifier: EMAIL, password: PASSWORD }, DEVICE);
    assert.ok(login.ok);

    const rotated = await api.refresh(login.data.refreshToken);
    assert.ok(rotated.ok);
    assert.notEqual(rotated.data.refreshToken, login.data.refreshToken);

    expectError(await api.refresh(login.data.refreshToken), { kind: 'unauthorized', code: 'invalid_refresh_token' }); // reuso
    expectError(await api.refresh(rotated.data.refreshToken), { code: 'invalid_refresh_token' }); // e o sucessor caiu junto
    expectError(await api.me(rotated.data.accessToken), { code: 'unauthorized' });
  });

  test('token de acesso vence em 15 min; refresh de lixo/curto é invalid_body, desconhecido é invalid_refresh_token', async () => {
    let now = NOW;
    const api = fresh({ now: () => now });
    await verified(api);
    const login = await api.login({ identifier: EMAIL, password: PASSWORD }, DEVICE);
    assert.ok(login.ok);
    assert.ok((await api.me(login.data.accessToken)).ok);
    now += 15 * 60_000 + 1;
    expectError(await api.me(login.data.accessToken), { kind: 'unauthorized', code: 'unauthorized' });
    expectError(await api.refresh('curto'), { kind: 'validation', code: 'invalid_body' });
    expectError(await api.refresh('x'.repeat(40)), { kind: 'unauthorized', code: 'invalid_refresh_token' });
  });

  test('logout é idempotente (refresh desconhecido também dá sucesso) e revoga a sessão; logout-all conta as sessões', async () => {
    const api = fresh();
    await verified(api);
    const a = await api.login({ identifier: EMAIL, password: PASSWORD }, DEVICE);
    const b = await api.login({ identifier: EMAIL, password: PASSWORD }, DEVICE);
    assert.ok(a.ok && b.ok);

    assert.ok((await api.logout(a.data.refreshToken)).ok);
    assert.ok((await api.logout(a.data.refreshToken)).ok, 'de novo: ainda sucesso');
    assert.ok((await api.logout('x'.repeat(40))).ok);
    expectError(await api.me(a.data.accessToken), { code: 'unauthorized' });

    const all = await api.logoutAll(b.data.accessToken);
    assert.ok(all.ok && all.data.revokedSessions === 1, 'só a sessão b ainda estava viva');
    expectError(await api.logoutAll(b.data.accessToken), { kind: 'unauthorized' });
  });

  test('device inválido no login é recusado (o mock pega o bug do cliente que o servidor pegaria)', async () => {
    const api = fresh();
    await verified(api);
    expectError(await api.login({ identifier: EMAIL, password: PASSWORD }, { installationId: 'curto', platform: 'android' }), { kind: 'validation', code: 'invalid_body' });
    expectError(await api.login({ identifier: EMAIL, password: PASSWORD }, { installationId: 'install-12345678', platform: 'windows' as 'ios' }), { code: 'invalid_body' });
  });
});

describe('mock — pelo IdentityClient (a forma que as telas usam)', () => {
  test('jornada completa em modo mock: cadastro → código → login → me → 15 min depois renova sozinho → logout', async () => {
    let now = NOW;
    const identity = createIdentityClient({ mode: 'mock', accountType: 'passenger', platform: 'ios', appVersion: '1.0.0', clock: () => now });

    assert.ok((await identity.register(REGISTER)).ok);
    assert.ok((await identity.verifyEmail({ identifier: EMAIL, code: '123456', password: PASSWORD })).ok);
    const login = await identity.login({ identifier: EMAIL, password: PASSWORD });
    assert.ok(login.ok && login.origin === 'mock');
    assert.deepEqual(identity.session.getState(), { status: 'signed_in' });

    now += 16 * 60_000; // o access token venceu
    const results = await Promise.all(Array.from({ length: 10 }, () => identity.me()));
    assert.ok(results.every((r) => r.ok), 'o gerenciador renovou sozinho (um voo só, senão o reuso derrubaria a família do mock)');

    const out = await identity.logout();
    assert.ok(out.ok && out.data.serverRevoked);
    assert.equal((await identity.me()).ok, false);
  });

  test('modo mock não precisa de baseUrl; http precisa', () => {
    assert.doesNotThrow(() => createIdentityClient({ mode: 'mock', accountType: 'driver', platform: 'android' }));
    assert.throws(() => createIdentityClient({ mode: 'http', accountType: 'driver', platform: 'android' }), /baseUrl/);
  });
});

describe('mock x contrato', () => {
  test('todo code que o mock emitiu nesta suíte está escrito em docs/contrato-identidade-apps.md', () => {
    const contract = readFileSync(new URL('../../../docs/contrato-identidade-apps.md', import.meta.url), 'utf8');
    // `unauthorized` (401 das rotas com Bearer: /me e /logout-all) existe na API (hooks/require-account.ts) mas o contrato
    // não o escreve — lacuna do DOCUMENTO, registrada no relatório, não do mock.
    const realButUndocumented = new Set(['unauthorized']);
    const missing = [...emitted].filter((code) => !realButUndocumented.has(code) && !new RegExp(`\\b${code}\\b`).test(contract));
    assert.deepEqual(missing, [], `o mock inventou códigos que o contrato não tem: ${missing.join(', ')}`);
    // Sanidade: a suíte exercitou a maior parte do vocabulário do contrato (senão a conferência acima é vazia).
    for (const code of ['invalid_email', 'invalid_password', 'invalid_phone', 'invalid_birth_date', 'underage', 'consent_required', 'email_taken', 'invalid_code', 'code_locked', 'code_expired', 'reset_locked', 'invalid_credentials', 'email_not_verified', 'too_many_attempts', 'invalid_refresh_token', 'invalid_body']) {
      assert.ok(emitted.has(code), `a suíte nunca provocou ${code}`);
    }
  });
});
