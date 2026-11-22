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
import { createMemorySessionStorage, parseStoredSession, storageKeys } from '../src/identity/session-storage';
import type { RegisterInput } from '../src/identity/types';
import { ACCOUNT, CONSENT_UP_TO_DATE, EMAIL, FakeIdentityServer, LEGAL, legalCurrentBody, PASSWORD } from './helpers/fake-identity-server';
import { waitFor, waitForAsync } from './helpers/session-kit';

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
  server.legal = { ...LEGAL };
  server.expireAccessTokens();
});

// O servidor falso fala http em 127.0.0.1: os testes ligam allowInsecureHttp (a regra que o recusa tem testes próprios).
function adapter(overrides: { baseUrl?: string; timeoutMs?: number } = {}) {
  return createIdentityHttpAdapter({
    baseUrl: overrides.baseUrl ?? server.url,
    accountType: 'passenger',
    appVersion: APP_VERSION,
    allowInsecureHttp: true,
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
    allowInsecureHttp: true,
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
  // O que a tela "exibiu": vem do servidor falso (`LEGAL`), nunca de uma constante do pacote.
  termsVersion: LEGAL.terms,
  privacyVersion: LEGAL.privacy,
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
    assert.deepEqual(Object.keys(body).sort(), ['accountType', 'birthDate', 'email', 'fullName', 'password', 'phone', 'privacyAccepted', 'privacyVersion', 'termsAccepted', 'termsVersion']);
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
    server.script('GET /api/v1/auth/me', okReply({ ...ACCOUNT, consent: CONSENT_UP_TO_DATE }));
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
      assert.throws(() => createIdentityHttpAdapter({ ...base, baseUrl: server.url, appVersion, allowInsecureHttp: true }), /appVersion/);
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
    server.script('GET /v1/auth/me', okReply({ ...ACCOUNT, accountType: 'driver', consent: CONSENT_UP_TO_DATE }));
    const result = await adapter().me('x');
    assert.ok(!result.ok && result.error.kind === 'unknown');
  });
});

describe('adaptador http — Termos e Política com a versão exibida (M-2)', () => {
  const registered = { status: 201, body: { ok: true, data: { account: ACCOUNT, verification: { required: true, emailSent: true, resendAfterSeconds: 60 } } } };
  const envelope = (code: string, extras: Record<string, unknown> = {}) => ({ ok: false, error: { code, message: `msg ${code}`, ...extras } });
  const NEW_VERSIONS = { terms: 'termos-v4', privacy: 'privacidade-v6' };

  test('o cadastro leva as versões que a tela exibiu, exatamente como vieram (nunca uma constante do pacote)', async () => {
    server.script('POST /v1/auth/register', registered);
    // Dois pares diferentes, ambos com formato válido: uma constante no pacote só acertaria um deles.
    for (const shown of [{ terms: 'termos-v3', privacy: 'privacidade-v5' }, { terms: '2027.01.15', privacy: 'p:9+b_x' }]) {
      const result = await adapter().register({ ...REGISTER, termsVersion: shown.terms, privacyVersion: shown.privacy });
      assert.ok(result.ok);
      const body = server.last('POST', '/v1/auth/register')?.body as Record<string, unknown>;
      assert.equal(body['termsVersion'], shown.terms);
      assert.equal(body['privacyVersion'], shown.privacy);
      assert.equal(body['termsAccepted'], true, 'as caixas de seleção continuam indo');
    }
  });

  test('legalCurrent: GET com o perfil do app na querystring, sem Bearer nem corpo; devolve os dois documentos', async () => {
    const result = await adapter().legalCurrent();

    assert.ok(result.ok);
    assert.equal(result.origin, 'real');
    assert.deepEqual(result.data, legalCurrentBody('passenger'));
    const request = server.last('GET', '/v1/legal/current');
    assert.equal(request?.query, 'audience=passenger');
    assert.equal(request?.headers['authorization'], undefined, 'texto legal é público: sem sessão');
    assert.equal(request?.headers['x-app-version'], APP_VERSION);
    assert.equal(request?.rawBody, '');

    const driver = await createIdentityHttpAdapter({ baseUrl: server.url, accountType: 'driver', appVersion: APP_VERSION, allowInsecureHttp: true }).legalCurrent();
    assert.ok(driver.ok && driver.data.audience === 'driver');
    assert.equal(server.last('GET', '/v1/legal/current')?.query, 'audience=driver');
  });

  test('legalCurrent: o servidor sem textos (503 consent_unavailable) e o erro de perfil chegam como erro, não como documento', async () => {
    server.script('GET /v1/legal/current', { status: 503, body: envelope('consent_unavailable') });
    const down = await adapter().legalCurrent();
    assert.ok(!down.ok && down.error.kind === 'unavailable' && down.error.code === 'consent_unavailable');
  });

  const view = (version = 'termos-v3') => ({ version, sha256: 'a'.repeat(64), publishedAt: '2026-11-20T12:00:00.000Z', url: `https://textos.example.com/t/${version}` });
  const badCurrent: ReadonlyArray<[string, unknown]> = [
    ['perfil de OUTRO app', { ...legalCurrentBody('driver') }],
    ['sem a Política', { audience: 'passenger', terms: view() }],
    ['sem audience', { terms: view(), privacy: view('p1') }],
    ['versão com espaço', { audience: 'passenger', terms: view('termos v3'), privacy: view('p1') }],
    ['versão vazia', { audience: 'passenger', terms: view(''), privacy: view('p1') }],
    ['sha256 curto', { audience: 'passenger', terms: { ...view(), sha256: 'a'.repeat(63) }, privacy: view('p1') }],
    ['sha256 em maiúsculas', { audience: 'passenger', terms: { ...view(), sha256: 'A'.repeat(64) }, privacy: view('p1') }],
    ['url javascript:', { audience: 'passenger', terms: { ...view(), url: 'javascript:alert(1)' }, privacy: view('p1') }],
    ['url relativa', { audience: 'passenger', terms: { ...view(), url: '/textos/termos-v3' }, privacy: view('p1') }],
    ['url com credencial embutida', { audience: 'passenger', terms: { ...view(), url: 'https://user:pw@textos.example.com/t' }, privacy: view('p1') }],
    ['publishedAt inválido', { audience: 'passenger', terms: { ...view(), publishedAt: 'ontem' }, privacy: view('p1') }],
    ['lista em vez de objeto', []],
    ['texto', 'Termos de Uso'],
  ];
  for (const [name, data] of badCurrent) {
    test(`legalCurrent: corpo fora do contrato (${name}) vira unknown, não texto para a tela`, async () => {
      server.script('GET /v1/legal/current', okReply(data));
      const result = await adapter().legalCurrent();
      assert.ok(!result.ok && result.error.kind === 'unknown');
    });
  }

  test('me traz o consent: com pendências, em dia, ou null (API sem os textos)', async () => {
    const pending = [{ document: 'terms', ...view('termos-v4') }, { document: 'privacy', ...view('privacidade-v6') }];
    server.script('GET /v1/auth/me', okReply({ ...ACCOUNT, consent: { upToDate: false, pending } }));
    const withPending = await adapter().me('x');
    assert.ok(withPending.ok && withPending.data.consent?.upToDate === false);
    assert.deepEqual(withPending.data.consent?.pending.map((item) => `${item.document}:${item.version}`), ['terms:termos-v4', 'privacy:privacidade-v6']);

    server.script('GET /v1/auth/me', okReply({ ...ACCOUNT, consent: CONSENT_UP_TO_DATE }));
    const upToDate = await adapter().me('x');
    assert.ok(upToDate.ok && upToDate.data.consent?.upToDate === true && upToDate.data.consent.pending.length === 0);
    assert.equal(upToDate.data.id, ACCOUNT.id, 'a conta continua igual');

    server.script('GET /v1/auth/me', okReply({ ...ACCOUNT, consent: null }));
    const unavailable = await adapter().me('x');
    assert.ok(unavailable.ok && unavailable.data.consent === null, 'null = textos indisponíveis na API; a sessão vale');
  });

  const badConsent: ReadonlyArray<[string, Record<string, unknown>]> = [
    ['consent ausente (resposta fora do contrato, não "em dia")', { ...ACCOUNT }],
    ['upToDate verdadeiro com pendência', { ...ACCOUNT, consent: { upToDate: true, pending: [{ document: 'terms', ...view() }] } }],
    ['upToDate falso sem pendência', { ...ACCOUNT, consent: { upToDate: false, pending: [] } }],
    ['documento repetido', { ...ACCOUNT, consent: { upToDate: false, pending: [{ document: 'terms', ...view() }, { document: 'terms', ...view('v2') }] } }],
    ['documento desconhecido', { ...ACCOUNT, consent: { upToDate: false, pending: [{ document: 'cookies', ...view() }] } }],
    ['consent texto', { ...ACCOUNT, consent: 'em dia' }],
    ['upToDate não booleano', { ...ACCOUNT, consent: { upToDate: 'sim', pending: [] } }],
  ];
  for (const [name, data] of badConsent) {
    test(`me: ${name} vira unknown`, async () => {
      server.script('GET /v1/auth/me', okReply(data));
      const result = await adapter().me('x');
      assert.ok(!result.ok && result.error.kind === 'unknown');
    });
  }

  test('acceptConsents: POST com Bearer e SÓ as versões enviadas; devolve o estado do aceite', async () => {
    server.script('POST /v1/auth/consents', okReply({ consent: { upToDate: false, pending: [{ document: 'privacy', ...view('privacidade-v5') }] } }));
    const only = await adapter().acceptConsents('tok-de-acesso', { termsVersion: 'termos-v3' });
    assert.ok(only.ok && only.data.upToDate === false && only.data.pending[0]?.document === 'privacy');
    let request = server.last('POST', '/v1/auth/consents');
    assert.deepEqual(request?.body, { termsVersion: 'termos-v3' }, 'só o que a tela exibiu: nenhum campo extra, nenhuma versão inventada');
    assert.equal(request?.headers['authorization'], 'Bearer tok-de-acesso');

    server.script('POST /v1/auth/consents', okReply({ consent: CONSENT_UP_TO_DATE }));
    const both = await adapter().acceptConsents('tok', { termsVersion: 'termos-v3', privacyVersion: 'privacidade-v5', ...({ role: 'admin' } as object) });
    assert.ok(both.ok && both.data.upToDate);
    request = server.last('POST', '/v1/auth/consents');
    assert.deepEqual(Object.keys(request?.body as object).sort(), ['privacyVersion', 'termsVersion']);

    server.script('POST /v1/auth/consents', okReply({ semConsent: true }));
    const strange = await adapter().acceptConsents('tok', { termsVersion: 'x' });
    assert.ok(!strange.ok && strange.error.kind === 'unknown');
  });

  for (const route of ['register', 'consents'] as const) {
    test(`409 consent_outdated em ${route}: error.current vem completo e do perfil do app`, async () => {
      const path = route === 'register' ? 'POST /v1/auth/register' : 'POST /v1/auth/consents';
      server.script(path, { status: 409, body: envelope('consent_outdated', { current: legalCurrentBody('passenger', NEW_VERSIONS) }) });
      const result = route === 'register'
        ? await adapter().register(REGISTER)
        : await adapter().acceptConsents('x', { termsVersion: 'termos-v3', privacyVersion: 'privacidade-v5' });

      assert.ok(!result.ok);
      assert.equal(result.error.kind, 'conflict');
      assert.equal(result.error.kind === 'conflict' && result.error.reason, 'consent_outdated');
      assert.equal(result.error.code, 'consent_outdated');
      assert.deepEqual(result.error.current, legalCurrentBody('passenger', NEW_VERSIONS), 'a tela mostra ESTES textos e reenvia');
    });
  }

  test('409 consent_outdated com current inválido, de outro perfil ou ausente sai SEM current (a tela chama legalCurrent)', async () => {
    for (const current of [undefined, null, 'x', { audience: 'passenger' }, legalCurrentBody('driver', NEW_VERSIONS), { ...legalCurrentBody('passenger'), terms: view('com espaço') }]) {
      server.script('POST /v1/auth/register', { status: 409, body: envelope('consent_outdated', current === undefined ? {} : { current }) });
      const result = await adapter().register(REGISTER);
      assert.ok(!result.ok && result.error.code === 'consent_outdated' && result.error.kind === 'conflict');
      assert.equal(result.error.current, undefined, JSON.stringify(current));
    }
  });

  test('só o consent_outdated carrega current: o mesmo campo em outro erro é ignorado', async () => {
    server.script('POST /v1/auth/register', { status: 409, body: envelope('email_taken', { current: legalCurrentBody('passenger', NEW_VERSIONS) }) });
    const result = await adapter().register(REGISTER);
    assert.ok(!result.ok && result.error.current === undefined);
  });
});

describe('IdentityClient sobre http — fluxo dos Termos (M-2)', () => {
  test('a tela lê legalCurrent, cadastra com as versões que leu e, depois de uma publicação, o 409 devolve o que mostrar de novo', async () => {
    server.legal = { terms: 'termos-v7', privacy: 'privacidade-v9' };
    const identity = client();

    const shown = await identity.legalCurrent();
    assert.ok(shown.ok);
    const first = await identity.register({ ...REGISTER, termsVersion: shown.data.terms.version, privacyVersion: shown.data.privacy.version });
    assert.ok(first.ok, 'a versão exibida era a vigente');
    assert.equal((server.last('POST', '/v1/auth/register')?.body as Record<string, unknown>)['termsVersion'], 'termos-v7');

    server.legal = { terms: 'termos-v8', privacy: 'privacidade-v9' }; // o jurídico publicou enquanto a pessoa lia
    const stale = await identity.register({ ...REGISTER, termsVersion: shown.data.terms.version, privacyVersion: shown.data.privacy.version });
    assert.ok(!stale.ok && stale.error.code === 'consent_outdated' && stale.error.kind === 'conflict');
    assert.equal(stale.error.current?.terms.version, 'termos-v8');
    assert.equal(server.count('POST', '/v1/auth/register'), 2, 'o cliente NÃO reenviou sozinho com a versão nova: quem aceita tem de ver o texto');

    const reshown = stale.error.current;
    assert.ok(reshown);
    const again = await identity.register({ ...REGISTER, termsVersion: reshown.terms.version, privacyVersion: reshown.privacy.version });
    assert.ok(again.ok, 'depois de a tela mostrar de novo, o reenvio passa');
  });

  test('acceptConsents usa a sessão: com o access token vencido renova UMA vez e repete', async () => {
    const identity = client();
    assert.ok((await identity.login({ identifier: EMAIL, password: PASSWORD })).ok);
    server.requests.length = 0;
    server.expireAccessTokens();

    const result = await identity.acceptConsents({ termsVersion: LEGAL.terms, privacyVersion: LEGAL.privacy });

    assert.ok(result.ok && result.data.upToDate);
    assert.equal(server.count('POST', '/v1/auth/refresh'), 1);
    assert.equal(server.count('POST', '/v1/auth/consents'), 2, 'a tentativa com o token vencido e a repetição');
  });

  test('reaceite com versão que deixou de ser a vigente: 409 com a vigente, sem repetir sozinho', async () => {
    const identity = client();
    assert.ok((await identity.login({ identifier: EMAIL, password: PASSWORD })).ok);
    server.legal = { terms: 'termos-v8', privacy: LEGAL.privacy };

    const result = await identity.acceptConsents({ termsVersion: LEGAL.terms, privacyVersion: LEGAL.privacy });

    assert.ok(!result.ok && result.error.kind === 'conflict' && result.error.code === 'consent_outdated');
    assert.equal(result.error.current?.terms.version, 'termos-v8');
    assert.equal(server.count('POST', '/v1/auth/consents'), 1);
    assert.deepEqual(identity.session.getState(), { status: 'signed_in' }, 'um 409 de aceite não derruba a sessão');
  });

  test('sem sessão, acceptConsents não chega ao servidor', async () => {
    const result = await client().acceptConsents({ termsVersion: LEGAL.terms });
    assert.ok(!result.ok && result.error.code === 'no_session');
    assert.equal(server.count('POST', '/v1/auth/consents'), 0);
  });

  test('me devolve a conta e o consent pelo cliente', async () => {
    const identity = client();
    assert.ok((await identity.login({ identifier: EMAIL, password: PASSWORD })).ok);
    const me = await identity.me();
    assert.ok(me.ok && me.data.publicId === ACCOUNT.publicId && me.data.consent?.upToDate === true);
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

describe('IdentityClient sobre http — M-4: um intermediário não derruba a sessão', () => {
  // O que um WAF, CDN ou regra de proxy devolve em /refresh quando muda a configuração ou marca o IP.
  const intermediaries: ReadonlyArray<[string, { status: number; body?: unknown; rawBody?: string }]> = [
    ['403 de WAF com HTML', { status: 403, rawBody: '<html><h1>Access denied</h1></html>' }],
    ['401 de proxy sem corpo', { status: 401, rawBody: '' }],
    ['401 com envelope que não é do refresh', { status: 401, body: { ok: false, error: { code: 'unauthorized', message: 'x' } } }],
    ['400 de proxy', { status: 400, rawBody: 'Bad Request' }],
    ['403 JSON de desafio anti-bot', { status: 403, body: { ok: false, error: { code: 'bot_challenge', message: 'x' } } }],
  ];
  for (const [name, reply] of intermediaries) {
    test(`${name}: ninguém é deslogado e, quando o intermediário sai do caminho, a MESMA sessão renova`, async () => {
      let now = Date.now();
      const storage = createMemorySessionStorage();
      const identity = client({ storage, clock: () => now });
      assert.ok((await identity.login({ identifier: EMAIL, password: PASSWORD })).ok);
      const before = await storage.getItem(KEYS.session);
      server.expireAccessTokens();
      server.refreshOverride = reply;

      const blocked = await Promise.all(Array.from({ length: 3 }, () => identity.me()));

      for (const result of blocked) assert.ok(!result.ok && result.error.kind === 'unavailable' && result.error.code === undefined);
      assert.deepEqual(identity.session.getState(), { status: 'signed_in' });
      assert.equal(await storage.getItem(KEYS.session), before, 'a sessão guardada não foi tocada');
      assert.equal(server.count('POST', '/v1/auth/refresh'), 1, 'um pedido só: o descanso vale');

      server.refreshOverride = null;
      now += 61_000;
      const recovered = await identity.me();
      assert.ok(recovered.ok, 'o refresh nunca foi rotacionado pelo intermediário: continua valendo no servidor');
      assert.equal(server.count('POST', '/v1/auth/refresh'), 2);
    });
  }

  test('controle positivo: o 401 invalid_refresh_token DE VERDADE ainda encerra a sessão', async () => {
    const storage = createMemorySessionStorage();
    const identity = client({ storage });
    assert.ok((await identity.login({ identifier: EMAIL, password: PASSWORD })).ok);
    server.expireAccessTokens();
    server.refreshOverride = { status: 401, body: { ok: false, error: { code: 'invalid_refresh_token', message: 'Sessão expirada.' } } };

    const result = await identity.me();

    assert.ok(!result.ok && result.error.kind === 'unauthorized' && result.error.code === 'invalid_refresh_token');
    assert.deepEqual(identity.session.getState(), { status: 'signed_out', reason: 'session_expired' });
    assert.equal(await storage.getItem(KEYS.session), null);
  });
});

describe('IdentityClient sobre http — B-8: pontas soltas de sessão', () => {
  const credentials = { identifier: EMAIL, password: PASSWORD };
  const storedRefresh = async (storage: ReturnType<typeof createMemorySessionStorage>): Promise<string> => {
    const session = parseStoredSession(await storage.getItem(KEYS.session));
    assert.ok(session, 'há sessão guardada');
    return session.refreshToken;
  };

  test('login por cima de uma sessão aberta revoga a anterior NO SERVIDOR (sem sessão órfã)', async () => {
    const storage = createMemorySessionStorage();
    const identity = client({ storage });
    assert.ok((await identity.login(credentials)).ok);
    const first = await storedRefresh(storage);

    assert.ok((await identity.login(credentials)).ok); // segunda sessão, por cima da primeira
    await waitFor(() => server.count('POST', '/v1/auth/logout') === 1, 'a revogação da primeira sessão chegar ao servidor');

    assert.equal((server.last('POST', '/v1/auth/logout')?.body as Record<string, unknown>)['refreshToken'], first);
    const probe = await adapter().refresh(first);
    assert.ok(!probe.ok && probe.error.code === 'invalid_refresh_token', 'a família da primeira sessão morreu no servidor');
    const me = await identity.me();
    assert.ok(me.ok, 'e a sessão nova segue viva');
    assert.notEqual(await storedRefresh(storage), first);
  });

  test('login logo na abertura do app (antes de restore) também revoga a sessão que estava guardada', async () => {
    const storage = createMemorySessionStorage();
    assert.ok((await client({ storage }).login(credentials)).ok);
    const first = await storedRefresh(storage);

    const reopened = client({ storage }); // outra abertura: a sessão está no cofre, mas ninguém leu ainda
    assert.deepEqual(reopened.session.getState(), { status: 'unknown' }, 'pré-condição: restore ainda não rodou');
    assert.ok((await reopened.login(credentials)).ok);
    await waitFor(() => server.count('POST', '/v1/auth/logout') === 1, 'a revogação da sessão guardada chegar ao servidor');

    assert.equal((server.last('POST', '/v1/auth/logout')?.body as Record<string, unknown>)['refreshToken'], first);
  });

  test('logout sem o servidor: sai do local, e na abertura seguinte a revogação é repetida e a sessão morre no servidor', async () => {
    const storage = createMemorySessionStorage();
    const identity = client({ storage });
    assert.ok((await identity.login(credentials)).ok);
    const refreshToken = await storedRefresh(storage);
    server.script('POST /v1/auth/logout', { status: 503, body: { ok: false, error: { code: 'unavailable', message: 'x' } } }, { once: true });

    const out = await identity.logout();

    assert.ok(out.ok && out.data.serverRevoked === false);
    assert.equal(await storage.getItem(KEYS.session), null);
    assert.ok((await storage.getItem(KEYS.pendingRevocations))?.includes(refreshToken), 'a revogação ficou guardada');

    const reopened = client({ storage }); // o app abre de novo, agora com o servidor de volta
    await reopened.session.restore();
    await waitFor(() => server.count('POST', '/v1/auth/logout') === 2, 'a revogação ser repetida na abertura');

    assert.equal((server.last('POST', '/v1/auth/logout')?.body as Record<string, unknown>)['refreshToken'], refreshToken);
    const probe = await adapter().refresh(refreshToken);
    assert.ok(!probe.ok && probe.error.code === 'invalid_refresh_token', 'agora o servidor também revogou');
    await waitForAsync(async () => (await storage.getItem(KEYS.pendingRevocations)) === null, 'a fila esvaziar');
  });
});

describe('adaptador http — B-8d: http só em desenvolvimento', () => {
  const base = { accountType: 'passenger', appVersion: APP_VERSION } as const;

  test('http: é recusado na montagem, em qualquer host, sem allowInsecureHttp', () => {
    for (const baseUrl of ['http://api.exemplo.com', 'http://192.168.0.10:3000', 'http://localhost:3000', 'HTTP://API.EXEMPLO.COM/v1', 'http://10.0.2.2:3000/api']) {
      assert.throws(() => createIdentityHttpAdapter({ ...base, baseUrl }), /https/, baseUrl);
      assert.throws(() => createIdentityHttpAdapter({ ...base, baseUrl, allowInsecureHttp: false }), /https/, `${baseUrl} (false explícito)`);
      assert.throws(
        () => createIdentityClient({ mode: 'http', baseUrl, accountType: 'passenger', platform: 'android', appVersion: APP_VERSION }),
        /https/,
        `${baseUrl} (pelo cliente)`,
      );
    }
  });

  test('allowInsecureHttp: true libera o http (desenvolvimento) e https nunca precisa dele', () => {
    assert.doesNotThrow(() => createIdentityHttpAdapter({ ...base, baseUrl: 'http://10.0.2.2:3000', allowInsecureHttp: true }));
    assert.doesNotThrow(() => createIdentityClient({ mode: 'http', baseUrl: 'http://localhost:3000', accountType: 'passenger', platform: 'android', appVersion: APP_VERSION, allowInsecureHttp: true }));
    assert.doesNotThrow(() => createIdentityHttpAdapter({ ...base, baseUrl: 'https://api.exemplo.com' }));
    assert.doesNotThrow(() => createIdentityClient({ mode: 'http', baseUrl: 'https://api.exemplo.com/v1', accountType: 'passenger', platform: 'ios', appVersion: APP_VERSION }));
  });

  test('allowInsecureHttp não afrouxa o resto: outro esquema, query e fragmento seguem recusados', () => {
    for (const baseUrl of ['ftp://exemplo.com', 'http://exemplo.com/?a=1', 'https://exemplo.com/#x', 'não é url']) {
      assert.throws(() => createIdentityHttpAdapter({ ...base, baseUrl, allowInsecureHttp: true }), /baseUrl/, baseUrl);
    }
  });

  test('o modo mock não tem baseUrl e portanto nada a recusar', () => {
    assert.doesNotThrow(() => createIdentityClient({ mode: 'mock', accountType: 'passenger', platform: 'android', appVersion: APP_VERSION }));
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
    const base = { mode: 'http', baseUrl: server.url, accountType: 'passenger', platform: 'android', appVersion: APP_VERSION, allowInsecureHttp: true } as const;
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
    const { appVersion: _omit, ...rest } = { mode: 'http', baseUrl: server.url, accountType: 'passenger', platform: 'android', appVersion: 'x', allowInsecureHttp: true } as const;
    void _omit;
    await createIdentityClient(rest).login({ identifier: EMAIL, password: PASSWORD });
    assert.equal(server.last('POST', '/v1/auth/login')?.headers['x-app-version'], 'unknown');
  });
});
