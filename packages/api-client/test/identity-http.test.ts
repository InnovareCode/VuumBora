/**
 * Adaptador `http` e `IdentityClient` contra um servidor HTTP FALSO em processo (`helpers/fake-identity-server.ts`).
 * Fetch real, sockets reais, porta efêmera: o que é provado aqui é o que vai no fio (cabeçalhos, corpo, mapeamento
 * de erro, timeout) e a renovação serializada pelo caminho completo. A prova contra a API REAL é outra (ver relatório).
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { ApiError } from '../src/index';
import { createIdentityClient, type IdentityClient } from '../src/identity/client';
import { createIdentityHttpAdapter } from '../src/identity/http-adapter';
import { createMemorySessionStorage, storageKeys } from '../src/identity/session-storage';
import type { RegisterInput } from '../src/identity/types';
import { ACCOUNT, EMAIL, FakeIdentityServer, PASSWORD } from './helpers/fake-identity-server';

const APP_VERSION = '2.3.4';
const KEYS = storageKeys('passenger');

const server = new FakeIdentityServer();
before(() => server.start());
after(() => server.stop());
beforeEach(() => {
  server.requests.length = 0;
  server.clearScripts();
  server.refreshDelayMs = 0;
  server.meDelayMs = () => 0;
  server.refreshOverride = null;
  server.expireAccessTokens();
});

function adapter(overrides: { baseUrl?: string; timeoutMs?: number } = {}) {
  return createIdentityHttpAdapter({
    baseUrl: overrides.baseUrl ?? server.url,
    accountType: 'passenger',
    appVersion: APP_VERSION,
    ...(overrides.timeoutMs !== undefined ? { timeoutMs: overrides.timeoutMs } : {}),
  });
}

function client(extra: Partial<Parameters<typeof createIdentityClient>[0]> = {}): IdentityClient {
  return createIdentityClient({
    mode: 'http',
    baseUrl: server.url,
    accountType: 'passenger',
    platform: 'android',
    appVersion: APP_VERSION,
    ...extra,
  });
}

const REGISTER: RegisterInput = {
  fullName: 'Ana Souza',
  email: EMAIL,
  password: PASSWORD,
  birthDate: '1990-05-15',
  termsAccepted: true,
  privacyAccepted: true,
};

const okReply = (data?: unknown) => ({ status: 200, body: data === undefined ? { ok: true } : { ok: true, data } });

describe('adaptador http — o que vai no fio', () => {
  test('X-App-Version em TODA chamada; Authorization só onde há Bearer; JSON só onde há corpo', async () => {
    server.script('POST /v1/auth/register', { status: 201, body: { ok: true, data: { account: ACCOUNT, verification: { required: true, emailSent: true, resendAfterSeconds: 60 } } } });
    server.script('POST /v1/auth/verify-email', okReply({ verified: true }));
    server.script('POST /v1/auth/resend-verification', okReply({ resendAfterSeconds: 60 }));
    server.script('POST /v1/auth/forgot-password', okReply({ resendAfterSeconds: 60 }));
    server.script('POST /v1/auth/reset-password', okReply({ passwordChanged: true, sessionsRevoked: true }));
    const api = adapter();

    const registered = await api.register(REGISTER);
    await api.verifyEmail({ identifier: EMAIL, code: '123456', password: PASSWORD });
    await api.resendVerification({ identifier: EMAIL });
    await api.forgotPassword({ email: EMAIL });
    await api.resetPassword({ email: EMAIL, code: '123456', newPassword: 'outra-senha-2' });
    const login = await api.login({ identifier: EMAIL, password: PASSWORD }, { installationId: 'install-12345678', platform: 'android' });
    assert.ok(registered.ok && login.ok);
    const refreshed = await api.refresh(login.data.refreshToken);
    await api.me(login.data.accessToken);
    await api.logoutAll(login.data.accessToken);
    assert.ok(refreshed.ok);
    await api.logout(refreshed.data.refreshToken);

    const routes = server.requests.map((r) => `${r.method} ${r.path}`);
    assert.deepEqual(routes, [
      'POST /v1/auth/register',
      'POST /v1/auth/verify-email',
      'POST /v1/auth/resend-verification',
      'POST /v1/auth/forgot-password',
      'POST /v1/auth/reset-password',
      'POST /v1/auth/login',
      'POST /v1/auth/refresh',
      'GET /v1/auth/me',
      'POST /v1/auth/logout-all',
      'POST /v1/auth/logout',
    ]);
    for (const request of server.requests) {
      assert.equal(request.headers['x-app-version'], APP_VERSION, `${request.method} ${request.path}`);
      assert.equal(request.headers['accept'], 'application/json');
      assert.equal(request.headers['content-type'], request.method === 'POST' ? 'application/json' : undefined);
      const wantsBearer = request.path === '/v1/auth/me' || request.path === '/v1/auth/logout-all';
      assert.equal(typeof request.headers['authorization'] === 'string', wantsBearer, request.path);
    }
    // logout-all sem corpo útil ainda manda JSON válido (corpo vazio com Content-Type JSON é 400 no Fastify).
    assert.equal(server.last('POST', '/v1/auth/logout-all')?.rawBody, '{}');
  });

  test('o corpo leva só os campos do contrato: sobras do formulário não vão, e accountType não é trocável', async () => {
    server.script('POST /v1/auth/register', { status: 201, body: { ok: true, data: { account: ACCOUNT, verification: { required: true, emailSent: false, resendAfterSeconds: 60 } } } });
    const api = adapter();
    const sloppy = { ...REGISTER, confirmPassword: 'repetida', accountType: 'driver', role: 'admin', phone: '(84) 99999-0000' } as unknown as RegisterInput;

    const result = await api.register(sloppy);

    assert.ok(result.ok && result.data.verification.emailSent === false);
    const body = server.last('POST', '/v1/auth/register')?.body as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ['accountType', 'birthDate', 'email', 'fullName', 'password', 'phone', 'privacyAccepted', 'termsAccepted']);
    assert.equal(body['accountType'], 'passenger');
  });

  test('login manda o device (instalação, plataforma, versão do app) e o identificador como veio', async () => {
    await adapter().login({ identifier: EMAIL, password: PASSWORD }, { installationId: 'install-12345678', platform: 'ios', label: 'iPhone da Ana' });
    assert.deepEqual(server.last('POST', '/v1/auth/login')?.body, {
      accountType: 'passenger',
      identifier: EMAIL,
      password: PASSWORD,
      device: { installationId: 'install-12345678', platform: 'ios', label: 'iPhone da Ana', appVersion: APP_VERSION },
    });
  });

  test('baseUrl com prefixo de caminho e barra final funciona', async () => {
    server.script('GET /api/v1/auth/me', okReply(ACCOUNT));
    const result = await adapter({ baseUrl: `${server.url}/api/` }).me('qualquer');
    assert.ok(result.ok);
  });

  test('sucesso sai com origin real', async () => {
    const result = await adapter().login({ identifier: EMAIL, password: PASSWORD }, { installationId: 'install-12345678', platform: 'web' });
    assert.ok(result.ok);
    assert.equal(result.origin, 'real');
  });

  test('configuração inválida falha na montagem, não na primeira chamada', () => {
    const base = { accountType: 'passenger', appVersion: APP_VERSION } as const;
    for (const baseUrl of ['não é url', 'ftp://exemplo.com', 'http://exemplo.com/?a=1', 'http://exemplo.com/#x']) {
      assert.throws(() => createIdentityHttpAdapter({ ...base, baseUrl }), /baseUrl/, baseUrl);
    }
    for (const appVersion of ['', '1.0 beta', 'a\r\nX-Evil: 1', 'x'.repeat(41)]) {
      assert.throws(() => createIdentityHttpAdapter({ ...base, baseUrl: server.url, appVersion }), /appVersion/);
    }
  });
});

describe('adaptador http — mapeamento de erro (kind estável + code do servidor)', () => {
  const envelope = (code: string, extras: Record<string, unknown> = {}) => ({ ok: false, error: { code, message: `msg ${code}`, ...extras } });

  const table: ReadonlyArray<{
    name: string;
    status: number;
    body?: unknown;
    headers?: Record<string, string>;
    expect: Partial<ApiError> & { kind: ApiError['kind'] };
  }> = [
    { name: 'invalid_email', status: 400, body: envelope('invalid_email'), expect: { kind: 'validation', code: 'invalid_email', fields: { email: 'msg invalid_email' } } },
    { name: 'invalid_password', status: 400, body: envelope('invalid_password'), expect: { kind: 'validation', fields: { password: 'msg invalid_password' } } },
    { name: 'invalid_phone', status: 400, body: envelope('invalid_phone'), expect: { kind: 'validation', fields: { phone: 'msg invalid_phone' } } },
    { name: 'invalid_birth_date', status: 400, body: envelope('invalid_birth_date'), expect: { kind: 'validation', fields: { birthDate: 'msg invalid_birth_date' } } },
    { name: 'consent_required', status: 400, body: envelope('consent_required'), expect: { kind: 'validation', fields: { consent: 'msg consent_required' } } },
    { name: 'invalid_code com tentativas', status: 400, body: envelope('invalid_code', { attemptsLeft: 3 }), expect: { kind: 'validation', code: 'invalid_code', attemptsLeft: 3, fields: { code: 'msg invalid_code' } } },
    { name: 'invalid_code zerado', status: 400, body: envelope('invalid_code', { attemptsLeft: 0 }), expect: { kind: 'validation', attemptsLeft: 0 } },
    { name: 'code_expired', status: 400, body: envelope('code_expired'), expect: { kind: 'validation', code: 'code_expired', fields: { code: 'msg code_expired' } } },
    { name: 'invalid_body', status: 400, body: envelope('invalid_body'), expect: { kind: 'validation', code: 'invalid_body', fields: { form: 'msg invalid_body' } } },
    { name: 'invalid_credentials', status: 401, body: envelope('invalid_credentials'), expect: { kind: 'unauthorized', code: 'invalid_credentials' } },
    { name: 'invalid_refresh_token', status: 401, body: envelope('invalid_refresh_token'), expect: { kind: 'unauthorized', code: 'invalid_refresh_token' } },
    { name: 'unauthorized', status: 401, body: envelope('unauthorized'), expect: { kind: 'unauthorized', code: 'unauthorized' } },
    { name: 'email_not_verified', status: 403, body: envelope('email_not_verified'), expect: { kind: 'forbidden', code: 'email_not_verified' } },
    { name: 'underage', status: 403, body: envelope('underage'), expect: { kind: 'forbidden', code: 'underage' } },
    { name: 'email_taken', status: 409, body: envelope('email_taken'), expect: { kind: 'conflict', reason: 'email_taken', code: 'email_taken' } },
    { name: 'too_many_attempts (corpo)', status: 429, body: envelope('too_many_attempts', { retryAfterSeconds: 8 }), headers: { 'Retry-After': '8' }, expect: { kind: 'rate_limited', code: 'too_many_attempts', retryAfterSeconds: 8 } },
    { name: 'rate_limited só com o cabeçalho', status: 429, body: envelope('rate_limited'), headers: { 'Retry-After': '12' }, expect: { kind: 'rate_limited', code: 'rate_limited', retryAfterSeconds: 12 } },
    { name: 'code_locked', status: 429, body: envelope('code_locked'), expect: { kind: 'rate_limited', code: 'code_locked' } },
    { name: 'reset_locked', status: 429, body: envelope('reset_locked', { retryAfterSeconds: 86400 }), headers: { 'Retry-After': '86400' }, expect: { kind: 'rate_limited', code: 'reset_locked', retryAfterSeconds: 86400 } },
    { name: 'auth_unavailable', status: 503, body: envelope('auth_unavailable'), expect: { kind: 'unavailable', retryable: true, code: 'auth_unavailable' } },
    { name: 'consent_unavailable', status: 503, body: envelope('consent_unavailable'), expect: { kind: 'unavailable', code: 'consent_unavailable' } },
    { name: '500 do handler genérico', status: 500, body: envelope('unknown'), expect: { kind: 'unavailable', retryable: true, code: 'unknown' } },
    { name: '502 de proxy com HTML', status: 502, body: undefined, expect: { kind: 'unavailable', retryable: true } },
    { name: '404', status: 404, body: envelope('not_found'), expect: { kind: 'not_found', code: 'not_found' } },
    { name: 'status estranho', status: 418, body: envelope('teapot'), expect: { kind: 'unknown', message: 'msg teapot', code: 'teapot' } },
  ];

  for (const row of table) {
    test(row.name, async () => {
      server.script('POST /v1/auth/login', { status: row.status, ...(row.body !== undefined ? { body: row.body } : { rawBody: '<html>bad gateway</html>' }), ...(row.headers ? { headers: row.headers } : {}) });
      const result = await adapter().login({ identifier: EMAIL, password: PASSWORD }, { installationId: 'install-12345678', platform: 'android' });
      assert.ok(!result.ok);
      for (const [key, value] of Object.entries(row.expect)) {
        assert.deepEqual((result.error as unknown as Record<string, unknown>)[key], value, `${row.name}: ${key}`);
      }
      if (row.status === 502) assert.equal(result.error.code, undefined, 'sem envelope não inventa code');
    });
  }

  test('extras malformados são ignorados (nunca viram NaN, negativo ou texto na UI)', async () => {
    for (const bad of [-1, 'três', null, Number.NaN, 2.5e999]) {
      server.script('POST /v1/auth/login', { status: 400, body: envelope('invalid_code', { attemptsLeft: bad }) });
      const result = await adapter().login({ identifier: EMAIL, password: PASSWORD }, { installationId: 'install-12345678', platform: 'android' });
      assert.ok(!result.ok);
      assert.equal(result.error.attemptsLeft, undefined, String(bad));
    }
    server.script('POST /v1/auth/login', { status: 401, body: { ok: false, error: { code: 'Código Com Espaço', message: 'x' } } });
    const odd = await adapter().login({ identifier: EMAIL, password: PASSWORD }, { installationId: 'install-12345678', platform: 'android' });
    assert.ok(!odd.ok);
    assert.equal(odd.error.code, undefined, 'code fora do padrão não passa');
    assert.equal(odd.error.kind, 'unauthorized', 'mas o kind sai do status');
  });

  test('2xx que não tem a forma do contrato (portal cativo) vira unknown, não sessão', async () => {
    for (const rawBody of ['<html>entre no wifi</html>', '', '{"ok":true}', '{"ok":true,"data":{"account":{"id":"x"}}}']) {
      server.script('POST /v1/auth/login', { status: 200, rawBody });
      const result = await adapter().login({ identifier: EMAIL, password: PASSWORD }, { installationId: 'install-12345678', platform: 'android' });
      assert.ok(!result.ok && result.error.kind === 'unknown', rawBody);
    }
  });

  test('conta de OUTRO tipo na resposta não entra na sessão (accountType é fixo por app)', async () => {
    server.script('GET /v1/auth/me', okReply({ ...ACCOUNT, accountType: 'driver' }));
    const result = await adapter().me('x');
    assert.ok(!result.ok && result.error.kind === 'unknown');
  });
});

describe('adaptador http — rede e tempo', () => {
  test('timeout vira network (retryable) sem esperar a resposta', async () => {
    server.script('GET /v1/auth/me', { ...okReply(ACCOUNT), stallMs: 400 });
    const started = Date.now();
    const result = await adapter({ timeoutMs: 60 }).me('x');
    assert.ok(!result.ok && result.error.kind === 'network' && result.error.retryable);
    assert.ok(Date.now() - started < 300, 'não esperou os 400 ms do servidor');
  });

  test('servidor fora do ar vira network', async () => {
    const dead = new FakeIdentityServer();
    await dead.start();
    const url = dead.url;
    await dead.stop();
    const result = await adapter({ baseUrl: url }).me('x');
    assert.ok(!result.ok && result.error.kind === 'network');
  });
});

describe('IdentityClient sobre http — sessão e renovação de ponta a ponta', () => {
  test('login devolve só a conta (tokens nunca saem) e grava a sessão antes de devolver', async () => {
    const storage = createMemorySessionStorage();
    const identity = client({ storage });

    const result = await identity.login({ identifier: EMAIL, password: PASSWORD });

    assert.ok(result.ok);
    assert.deepEqual(result.data, ACCOUNT);
    assert.ok(!JSON.stringify(result).includes('access-token'), 'nenhum token no resultado');
    assert.ok((await storage.getItem(KEYS.session))?.includes('refresh-token-number'), 'sessão já gravada');
    assert.deepEqual(identity.session.getState(), { status: 'signed_in' });
    const me = await identity.me();
    assert.ok(me.ok && me.data.publicId === ACCOUNT.publicId);
  });

  test('20 chamadas concorrentes com 401 geram exatamente 1 POST /refresh (pelo fio, com 401 tardios)', async () => {
    const identity = client();
    assert.ok((await identity.login({ identifier: EMAIL, password: PASSWORD })).ok);
    server.requests.length = 0;
    server.expireAccessTokens(); // o access token venceu; o refresh segue valendo
    server.refreshDelayMs = 30;
    server.meDelayMs = (arrival) => arrival * 4; // as últimas respostas 401 chegam depois do fim da renovação

    const results = await Promise.all(Array.from({ length: 20 }, () => identity.me()));

    assert.ok(results.every((r) => r.ok), 'todas terminam bem depois da repetição');
    assert.equal(server.count('POST', '/v1/auth/refresh'), 1, 'exatamente UM /refresh');
    assert.equal(server.count('GET', '/v1/auth/me'), 40, '20 tentativas + 20 repetições, nem uma a mais');
    const again = await identity.me();
    assert.ok(again.ok, 'a família segue viva: um reuso a teria matado');
    assert.equal(server.count('POST', '/v1/auth/refresh'), 1);
  });

  test('refresh recusado: UM logout local e as 20 pendentes recebem unauthorized (pelo fio)', async () => {
    const storage = createMemorySessionStorage();
    const identity = client({ storage });
    assert.ok((await identity.login({ identifier: EMAIL, password: PASSWORD })).ok);
    const states: string[] = [];
    identity.session.subscribe((s) => states.push(s.status === 'signed_out' ? `signed_out:${s.reason}` : s.status));
    server.requests.length = 0;
    server.expireAccessTokens();
    server.refreshDelayMs = 30;
    server.refreshOverride = { status: 401, body: { ok: false, error: { code: 'invalid_refresh_token', message: 'Sessão expirada.' } } };

    const results = await Promise.all(Array.from({ length: 20 }, () => identity.me()));

    for (const result of results) assert.ok(!result.ok && result.error.kind === 'unauthorized' && result.error.code === 'invalid_refresh_token');
    assert.equal(server.count('POST', '/v1/auth/refresh'), 1);
    assert.deepEqual(states, ['signed_out:session_expired'], 'UM logout local');
    assert.equal(await storage.getItem(KEYS.session), null);

    const meCallsBefore = server.count('GET', '/v1/auth/me');
    const afterwards = await identity.me();
    assert.ok(!afterwards.ok && afterwards.error.kind === 'unauthorized' && afterwards.error.code === 'no_session');
    assert.equal(server.count('GET', '/v1/auth/me'), meCallsBefore, 'sem sessão nem chega ao servidor');
  });

  test('refresh com servidor fora (503) NÃO desloga; passado o descanso, renova e segue', async () => {
    let now = Date.now();
    const identity = client({ clock: () => now });
    assert.ok((await identity.login({ identifier: EMAIL, password: PASSWORD })).ok);
    server.expireAccessTokens();
    server.refreshOverride = { status: 503, body: { ok: false, error: { code: 'unavailable', message: 'x' } } };

    const down = await Promise.all(Array.from({ length: 5 }, () => identity.me()));
    for (const result of down) assert.ok(!result.ok && result.error.kind === 'unavailable');
    assert.deepEqual(identity.session.getState(), { status: 'signed_in' });

    server.refreshOverride = null;
    now += 61_000;
    const back = await identity.me();
    assert.ok(back.ok, 'o refresh que não rotacionou ainda vale');
  });

  test('logout: revoga no servidor com o refresh, sai do local e MANTÉM o installationId', async () => {
    const storage = createMemorySessionStorage();
    const identity = client({ storage });
    assert.ok((await identity.login({ identifier: EMAIL, password: PASSWORD })).ok);
    const installationBefore = await storage.getItem(KEYS.installationId);

    const result = await identity.logout();

    assert.ok(result.ok && result.data.serverRevoked);
    assert.match(String((server.last('POST', '/v1/auth/logout')?.body as { refreshToken: string }).refreshToken), /^refresh-token-number-/);
    assert.deepEqual(identity.session.getState(), { status: 'signed_out', reason: 'user' });
    assert.equal(await storage.getItem(KEYS.session), null);
    assert.equal(await storage.getItem(KEYS.installationId), installationBefore, 'o id é da instalação, não da conta');
    assert.equal((await identity.me()).ok, false);
  });

  test('logout com o servidor inalcançável ainda sai do local e diz que o servidor não confirmou', async () => {
    const identity = client();
    assert.ok((await identity.login({ identifier: EMAIL, password: PASSWORD })).ok);
    server.script('POST /v1/auth/logout', { status: 503, body: { ok: false, error: { code: 'unavailable', message: 'x' } } }, { once: true });

    const result = await identity.logout();

    assert.ok(result.ok && result.data.serverRevoked === false);
    assert.equal(identity.session.getState().status, 'signed_out');
  });

  test('logoutAll revoga tudo no servidor e sai deste aparelho', async () => {
    const identity = client();
    assert.ok((await identity.login({ identifier: EMAIL, password: PASSWORD })).ok);
    const result = await identity.logoutAll();
    assert.ok(result.ok && result.data.revokedSessions === 1);
    assert.deepEqual(identity.session.getState(), { status: 'signed_out', reason: 'user' });
  });

  test('login que falha não abre sessão e devolve o erro do servidor', async () => {
    const identity = client();
    const wrong = await identity.login({ identifier: EMAIL, password: 'errada-errada' });
    assert.ok(!wrong.ok && wrong.error.kind === 'unauthorized' && wrong.error.code === 'invalid_credentials');
    const pending = await identity.login({ identifier: 'pendente@example.com', password: PASSWORD });
    assert.ok(!pending.ok && pending.error.kind === 'forbidden' && pending.error.code === 'email_not_verified');
    assert.notEqual(identity.session.getState().status, 'signed_in');
  });

  test('X-App-Version também vai nas chamadas que o próprio cliente faz sozinho (refresh)', async () => {
    const identity = client();
    assert.ok((await identity.login({ identifier: EMAIL, password: PASSWORD })).ok);
    server.expireAccessTokens();
    assert.ok((await identity.me()).ok);
    assert.equal(server.count('POST', '/v1/auth/refresh'), 1);
    for (const request of server.requests) assert.equal(request.headers['x-app-version'], APP_VERSION, request.path);
  });
});

describe('installationId', () => {
  test('é gerado UMA vez, persistido pela porta e reaproveitado por outro cliente com o mesmo cofre', async () => {
    const storage = createMemorySessionStorage();
    let generated = 0;
    const randomId = () => `install-${(generated += 1)}-abcdefgh`;

    const first = client({ storage, randomId });
    await Promise.all([
      first.login({ identifier: EMAIL, password: PASSWORD }),
      first.login({ identifier: EMAIL, password: PASSWORD }),
    ]);
    const idsSent = server.requests.filter((r) => r.path === '/v1/auth/login').map((r) => (r.body as { device: { installationId: string } }).device.installationId);
    assert.equal(idsSent.length, 2);
    assert.equal(new Set(idsSent).size, 1, 'logins simultâneos usam o MESMO id');
    assert.equal(generated, 1, 'e só um foi gerado');

    await first.logout();
    const second = client({ storage, randomId }); // "reabriu o app"
    await second.login({ identifier: EMAIL, password: PASSWORD });
    const last = (server.last('POST', '/v1/auth/login')?.body as { device: { installationId: string } }).device.installationId;
    assert.equal(last, idsSent[0], 'persistido entre aberturas e depois do logout');
    assert.equal(generated, 1);

    const fresh = client({ storage: createMemorySessionStorage(), randomId });
    await fresh.login({ identifier: EMAIL, password: PASSWORD });
    const other = (server.last('POST', '/v1/auth/login')?.body as { device: { installationId: string } }).device.installationId;
    assert.notEqual(other, last, 'instalação nova, id novo');
  });

  test('valor guardado inválido é descartado e regenerado; cofre que falha não impede o login', async () => {
    const storage = createMemorySessionStorage({ [KEYS.installationId]: 'curto' });
    const errors: unknown[] = [];
    const identity = client({ storage, onStorageError: (e) => errors.push(e), randomId: () => 'install-valido-123' });
    assert.ok((await identity.login({ identifier: EMAIL, password: PASSWORD })).ok);
    assert.equal(await storage.getItem(KEYS.installationId), 'install-valido-123');

    const broken = {
      getItem: async () => {
        throw new Error('cofre bloqueado');
      },
      setItem: async () => {
        throw new Error('cofre bloqueado');
      },
      removeItem: async () => undefined,
    };
    const resilient = client({ storage: broken, onStorageError: (e) => errors.push(e), randomId: () => 'install-memoria-1' });
    const result = await resilient.login({ identifier: EMAIL, password: PASSWORD });
    assert.ok(result.ok, 'login funciona mesmo com o cofre quebrado');
    assert.ok(errors.length >= 2);
  });
});

describe('createIdentityClient — configuração', () => {
  test('falha alto na montagem: modo, tipo de conta, versão, plataforma e baseUrl', () => {
    const base = { mode: 'http', baseUrl: server.url, accountType: 'passenger', platform: 'android', appVersion: APP_VERSION } as const;
    assert.throws(() => createIdentityClient({ ...base, mode: 'qualquer' as 'http' }), /mode/);
    assert.throws(() => createIdentityClient({ ...base, accountType: 'admin' as 'driver' }), /accountType/);
    assert.throws(() => createIdentityClient({ ...base, appVersion: '1 2' }), /appVersion/);
    assert.throws(() => createIdentityClient({ mode: 'http', accountType: 'driver', platform: 'ios', appVersion: APP_VERSION }), /baseUrl/);
    // Fora do navegador e sem `platform`: o pacote não adivinha android x ios.
    const { platform: _omit, ...withoutPlatform } = base;
    void _omit;
    assert.throws(() => createIdentityClient(withoutPlatform), /platform/);
  });

  test('sem appVersion o cabeçalho sai como "unknown" (visível, nunca uma versão inventada)', async () => {
    const { appVersion: _omit, ...rest } = { mode: 'http', baseUrl: server.url, accountType: 'passenger', platform: 'android', appVersion: 'x' } as const;
    void _omit;
    await createIdentityClient(rest).login({ identifier: EMAIL, password: PASSWORD });
    assert.equal(server.last('POST', '/v1/auth/login')?.headers['x-app-version'], 'unknown');
  });
});
