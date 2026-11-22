/**
 * Limites por IP da identidade dos apps, em duas classes (`src/lib/ip-rate-limits.ts`, revisão S1 rodada 3c, A1):
 *   - credenciais e códigos: cota por rota por endereço IPv4 ou /64, mais um teto por /48 IPv6;
 *   - sessão (refresh, logout, logout-all, reaceite): sem cota por rota, só o limite global (por /64) e um teto por /48.
 * E o código PRÓPRIO do 400 do refresh (B5): `invalid_refresh_body`, nunca o `invalid_body` genérico de transporte.
 *
 * Tudo medido com o app real (`app.inject`, banco real). Cada teste sobe um app novo: os contadores são em memória e vivem por
 * instância. O limite GLOBAL (100/min por /64) é o padrão de produção: não há variável de teste para ele de propósito.
 */
import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { loadAuthConfig } from '../src/lib/auth-config.js';
import { prepareDatabase, shutdown } from './helpers/harness.js';
import { DEVICE, makeClient, PEPPER, JWT_SECRET, startIdentityApp, type Harness } from './helpers/identity-kit.js';

before(prepareDatabase);
after(shutdown);

/** Sobe um app com variáveis próprias (as rotas as leem ao montar) e restaura o ambiente no fim. */
async function withApp(overrides: Record<string, string>, body: (harness: Harness, client: ReturnType<typeof makeClient>) => Promise<void>): Promise<void> {
  const saved = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  const harness = await startIdentityApp();
  try {
    await body(harness, makeClient(harness));
  } finally {
    await harness.t.app.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const JUNK_REFRESH = 'x'.repeat(43);
const RUN = Math.random().toString(36).slice(2, 8);
type Client = ReturnType<typeof makeClient>;
const refresh = (client: Client, ip: string) => client.call('POST', '/v1/auth/refresh', { ip, body: { refreshToken: JUNK_REFRESH } });
const logoutOne = (client: Client, ip: string) => client.call('POST', '/v1/auth/logout', { ip, body: { refreshToken: JUNK_REFRESH } });
let identifierSeq = 0;
/** Identificador NOVO a cada chamada: o par (identificador + IP) tem espera progressiva própria (I-6) e o 2º erro do mesmo par seria 429 por ELA, não pela cota por IP. */
const loginUnknown = (client: Client, ip: string) =>
  client.call('POST', '/v1/auth/login', { ip, body: { accountType: 'passenger', identifier: 'ninguem' + String((identifierSeq += 1)) + '-' + RUN + '@teste.vuumbora.dev', password: 'Senha-qualquer-1', device: DEVICE } });

/** Estas rotas podem responder 401/200 normalmente; o que NÃO pode acontecer sem motivo é o 429. */
const statusesOf = async (count: number, send: (index: number) => Promise<{ status: number }>): Promise<number[]> => {
  const statuses: number[] = [];
  for (let index = 0; index < count; index += 1) statuses.push((await send(index)).status);
  return statuses;
};

describe('padrões da configuração (sem variável nenhuma)', () => {
  test('credenciais: 100 por rota em 15 min (endereço ou /64), teto de 1000 por /48; sessão: teto de 3000 por minuto por /48', () => {
    const config = loadAuthConfig({ NODE_ENV: 'test', AUTH_PEPPER: PEPPER, AUTH_JWT_SECRET: JWT_SECRET });
    assert.ok(config);
    assert.equal(config.ipRateLimitMax, 100);
    assert.equal(config.ipRateLimitWindowMs, 15 * 60 * 1000);
    assert.equal(config.ipRateLimitBlockMax, 1000);
    assert.equal(config.sessionBlockRateLimitMax, 3000);
  });

  test('tudo configurável por variável de ambiente', () => {
    const config = loadAuthConfig({
      NODE_ENV: 'test', AUTH_PEPPER: PEPPER, AUTH_JWT_SECRET: JWT_SECRET,
      AUTH_IP_RATE_LIMIT_MAX: '7', AUTH_IP_RATE_LIMIT_WINDOW_MINUTES: '5', AUTH_IP_RATE_LIMIT_BLOCK_MAX: '70', AUTH_SESSION_BLOCK_RATE_LIMIT_MAX: '700',
    });
    assert.ok(config);
    assert.deepEqual([config.ipRateLimitMax, config.ipRateLimitWindowMs, config.ipRateLimitBlockMax, config.sessionBlockRateLimitMax], [7, 5 * 60 * 1000, 70, 700]);
  });
});

describe('A1 — refresh, logout, logout-all e reaceite saem da cota por rota', () => {
  test('o 31º refresh do MESMO IPv4 não dá 429 (a cota por rota, aqui 3, vale para o login e não para a sessão)', async () => {
    await withApp({ AUTH_IP_RATE_LIMIT_MAX: '3' }, async (_harness, client) => {
      const ip = '203.0.113.31';
      const statuses = await statusesOf(35, () => refresh(client, ip));
      assert.deepEqual(statuses.filter((status) => status !== 401), [], '35 refresh do mesmo IPv4: nenhum 429 (todos 401, token lixo)');
      assert.equal(statuses[30], 401, 'o 31º');

      // Controle positivo na MESMA instância e no MESMO IP: a cota por rota de um login ainda morde na 4ª.
      const logins = await statusesOf(5, () => loginUnknown(client, ip));
      assert.deepEqual(logins, [401, 401, 401, 429, 429], 'a classe de credenciais segue com a cota (3 aqui)');
    });
  });

  test('logout, logout-all e reaceite também: 35 pedidos do mesmo IPv4, nenhum 429', async () => {
    await withApp({ AUTH_IP_RATE_LIMIT_MAX: '3' }, async (_harness, client) => {
      // Um IPv4 por rota: somados, os 105 pedidos passariam do limite GLOBAL (100/min), que vale para todas elas juntas.
      const ip = '203.0.113.32';
      const logout = await statusesOf(35, () => logoutOne(client, ip));
      assert.deepEqual([...new Set(logout)], [200], 'logout idempotente: sempre 200');
      const logoutAll = await statusesOf(35, () => client.call('POST', '/v1/auth/logout-all', { ip: '203.0.113.36', bearer: 'token-lixo' }));
      assert.deepEqual([...new Set(logoutAll)], [401]);
      const consents = await statusesOf(35, () => client.call('POST', '/v1/auth/consents', { ip: '203.0.113.37', bearer: 'token-lixo', body: { termsVersion: 'v1' } }));
      assert.deepEqual([...new Set(consents)], [401]);
    });
  });

  test('o limite GLOBAL (100/min por /64) segue valendo para a sessão; dois /64 do MESMO /48 NÃO dividem a cota', async () => {
    await withApp({}, async (_harness, client) => {
      const a = '2001:db8:aa01:1::1';
      const b = '2001:db8:aa01:2::2'; // outro /64, mesmo /48
      const first = await statusesOf(100, () => refresh(client, a));
      assert.deepEqual(first.filter((status) => status !== 401), [], 'os 100 primeiros do /64 A passam');
      const over = await refresh(client, a);
      assert.equal(over.status, 429, 'o 101º do mesmo /64 é limitado pelo GLOBAL: a sessão não ficou sem limite nenhum');
      assert.equal(over.body.error.code, 'rate_limited');

      const other = await refresh(client, b);
      assert.equal(other.status, 401, 'o /64 B tem a PRÓPRIA cota: não herda os 100 do /64 A');
      assert.deepEqual((await statusesOf(99, () => refresh(client, b))).filter((status) => status !== 401), [], 'e a cota inteira dele (100)');
      assert.equal((await refresh(client, b)).status, 429, 'o 101º do /64 B');
    });
  });

  test('o IPv4 também respeita o global (100/min), sem o teto de /48: o 101º é 429 e outro IPv4 não é afetado', async () => {
    await withApp({ AUTH_SESSION_BLOCK_RATE_LIMIT_MAX: '5' }, async (_harness, client) => {
      const ip = '203.0.113.33';
      assert.deepEqual((await statusesOf(100, () => refresh(client, ip))).filter((status) => status !== 401), [], 'o teto de /48 (5) não vale para IPv4');
      assert.equal((await refresh(client, ip)).status, 429);
      assert.equal((await refresh(client, '203.0.113.34')).status, 401);
    });
  });

  test('teto por /48 da sessão: quem gira o /64 dentro do bloco não passa dele; outro /48 e o IPv4 não são afetados', async () => {
    await withApp({ AUTH_SESSION_BLOCK_RATE_LIMIT_MAX: '6' }, async (_harness, client) => {
      const block = ['2001:db8:bb01:1::1', '2001:db8:bb01:2::1', '2001:db8:bb01:3::1', '2001:db8:bb01:ffff:9::1'];
      const statuses: number[] = [];
      for (const ip of block) for (let i = 0; i < 2; i += 1) statuses.push((await refresh(client, ip)).status);
      assert.deepEqual(statuses, [401, 401, 401, 401, 401, 401, 429, 429], '4 /64 do mesmo /48, 2 cada: o 7º pedido passa do teto de 6');
      const limited = await refresh(client, block[0]!);
      assert.equal(limited.status, 429);
      assert.equal(limited.body.error.code, 'rate_limited', 'o mesmo corpo estruturado do limite do plugin');
      assert.ok(Number(limited.headers['retry-after']) >= 1, 'com Retry-After');
      assert.equal((await refresh(client, '2001:db8:bb02:1::1')).status, 401, 'outro /48 tem o próprio teto');
      assert.deepEqual((await statusesOf(12, () => refresh(client, '203.0.113.35'))).filter((status) => status !== 401), [], 'IPv4 não tem teto de /48');
    });
  });

  test('o /64 que o GLOBAL já recusou não gasta o teto do /48 da sessão (os vizinhos do bloco seguem atendidos)', async () => {
    await withApp({ AUTH_SESSION_BLOCK_RATE_LIMIT_MAX: '120' }, async (_harness, client) => {
      const abusive = await statusesOf(130, () => refresh(client, '2001:db8:bb04:1::1'));
      assert.equal(abusive.filter((status) => status === 429).length, 30, '100 passam, 30 caem no global');
      assert.deepEqual((await statusesOf(20, () => refresh(client, '2001:db8:bb04:2::1'))).filter((status) => status !== 401), [], 'o vizinho gastou 20 e o bloco está em 120 (100 + 20)');
      assert.equal((await refresh(client, '2001:db8:bb04:2::1')).status, 429, 'o 121º aceito: o teto de 120 do /48 (o vizinho está longe do próprio global)');
    });
  });

  test('o teto do /48 é POR ROTA: esgotado no refresh, o logout do mesmo bloco ainda passa', async () => {
    await withApp({ AUTH_SESSION_BLOCK_RATE_LIMIT_MAX: '2' }, async (_harness, client) => {
      const ip = '2001:db8:bb03:1::1';
      assert.deepEqual(await statusesOf(3, () => refresh(client, ip)), [401, 401, 429]);
      assert.equal((await logoutOne(client, ip)).status, 200);
    });
  });
});

describe('A1 — credenciais e códigos: cota por endereço/64 e teto por /48', () => {
  test('IPv4: a cota da rota (3) morde na 4ª; outro IPv4 e outra rota têm a própria; cada 429 vira UMA linha de log com a rota (sem IP)', async () => {
    await withApp({ AUTH_IP_RATE_LIMIT_MAX: '3' }, async (harness, client) => {
      const ip = '203.0.113.41';
      assert.deepEqual(await statusesOf(5, () => loginUnknown(client, ip)), [401, 401, 401, 429, 429]);
      const blocked = await loginUnknown(client, ip);
      assert.equal(blocked.body.error.code, 'rate_limited');
      assert.ok(blocked.headers['retry-after']);
      assert.equal((await loginUnknown(client, '203.0.113.42')).status, 401, 'outro IPv4');
      const forgot = await client.call('POST', '/v1/auth/forgot-password', { ip, body: { accountType: 'passenger', email: 'ninguem@teste.vuumbora.dev' } });
      assert.equal(forgot.status, 200, 'o contador é por ROTA: o esgotado do login não derruba o esqueci a senha');

      const limited = harness.t.logs().split('\n').filter((line) => line.includes('"event":"rate_limited"')).map((line) => JSON.parse(line) as Record<string, unknown>);
      assert.equal(limited.length, 3, 'os 429 do login: 2 da sequência, 1 do pedido extra');
      assert.deepEqual([...new Set(limited.map((line) => line['route']))], ['/v1/auth/login'], 'a rota (padrão), contável por rota');
      assert.ok(!harness.t.logs().includes(ip), 'o IP não vai para o log da identidade');
    });
  });

  test('IPv6: cada /64 do mesmo /48 tem a PRÓPRIA cota; o teto do /48 (7) fecha o bloco inteiro', async () => {
    await withApp({ AUTH_IP_RATE_LIMIT_MAX: '3', AUTH_IP_RATE_LIMIT_BLOCK_MAX: '7' }, async (_harness, client) => {
      const a = '2001:db8:cc01:1::1';
      const b = '2001:db8:cc01:2::1';
      const c = '2001:db8:cc01:3::1';
      assert.deepEqual(await statusesOf(3, () => loginUnknown(client, a)), [401, 401, 401], '/64 A: a cota de 3');
      assert.deepEqual(await statusesOf(3, () => loginUnknown(client, b)), [401, 401, 401], '/64 B: o MESMO /48 NÃO divide a cota do A (com a chave no /48 seria 429)');
      assert.equal((await loginUnknown(client, a)).status, 429, 'a cota do /64 A acabou (este pedido recusado NÃO conta no teto do bloco)');
      // O bloco já aceitou 6 pedidos. O /64 C é novo (0 usado): o 7º passa e o 8º é barrado SÓ pelo teto do /48 (7), nunca pela cota de C (3).
      assert.equal((await loginUnknown(client, c)).status, 401, '7º pedido aceito do bloco');
      assert.equal((await loginUnknown(client, c)).status, 429, '8º: o teto do /48 fecha o bloco, com o /64 C longe da própria cota');
      assert.equal((await loginUnknown(client, '2001:db8:cc02:1::1')).status, 401, 'outro /48 tem a cota e o teto próprios');
    });
  });

  test('o teto do /48 sozinho (cota por /64 alta): rotacionar o /64 dentro do bloco não abre cota nova', async () => {
    await withApp({ AUTH_IP_RATE_LIMIT_MAX: '1000', AUTH_IP_RATE_LIMIT_BLOCK_MAX: '3' }, async (_harness, client) => {
      const statuses: number[] = [];
      for (const ip of ['2001:db8:cd01:1::1', '2001:db8:cd01:2::2', '2001:db8:cd01:3:5::3', '2001:db8:cd01:4:6::4', '2001:db8:cd01:ffff:7::5']) statuses.push((await loginUnknown(client, ip)).status);
      assert.deepEqual(statuses, [401, 401, 401, 429, 429], 'cinco /64 do mesmo /48 dividem UM teto de 3');
      assert.equal((await loginUnknown(client, '2001:db8:cd02:1::1')).status, 401, 'outro /48');
      assert.deepEqual((await statusesOf(8, () => loginUnknown(client, '203.0.113.43'))).filter((status) => status !== 401), [], 'IPv4 não tem teto de /48');
    });
  });

  test('um /64 abusivo NÃO gasta o teto do bloco: o que a cota dele recusa não conta, e os vizinhos seguem atendidos', async () => {
    await withApp({ AUTH_IP_RATE_LIMIT_MAX: '3', AUTH_IP_RATE_LIMIT_BLOCK_MAX: '7' }, async (_harness, client) => {
      const abusive = await statusesOf(40, () => loginUnknown(client, '2001:db8:ce01:1::1'));
      assert.deepEqual(abusive.filter((status) => status === 401).length, 3, 'o /64 abusivo teve a cota dele (3)');
      assert.equal(abusive.filter((status) => status === 429).length, 37);
      assert.deepEqual(await statusesOf(3, () => loginUnknown(client, '2001:db8:ce01:2::1')), [401, 401, 401], 'o vizinho do mesmo /48 não pagou pelos 37 recusados');
      assert.deepEqual(await statusesOf(1, () => loginUnknown(client, '2001:db8:ce01:3::1')), [401], '3 + 3 + 1 = 7: o teto ainda não fechou');
      assert.equal((await loginUnknown(client, '2001:db8:ce01:3::1')).status, 429, 'o 8º aceito do bloco');
    });
  });

  test('os padrões (100 por endereço): o 100º login do mesmo IPv4 passa e o 101º é 429', async () => {
    await withApp({ AUTH_IP_RATE_LIMIT_MAX: '100' }, async (_harness, client) => {
      const ip = '203.0.113.44';
      const statuses = await statusesOf(101, () => loginUnknown(client, ip));
      assert.deepEqual(statuses.slice(0, 100).filter((status) => status !== 401), [], 'os 100 primeiros passam');
      assert.equal(statuses[100], 429);
    });
  });
});

describe('A1 — TODA rota da classe tem a própria cota e o próprio teto (uma rota que escapasse não seria vista pelos testes acima)', () => {
  type Hit = (client: Client, ip: string) => Promise<{ status: number }>;
  const post = (url: string, extra: { bearer?: string } = {}): Hit => (client, ip) => client.call('POST', url, { ip, ...extra, body: {} });
  const credentialRoutes: ReadonlyArray<[string, Hit]> = [
    ['register', post('/v1/auth/register')],
    ['login', post('/v1/auth/login')],
    ['verify-email', post('/v1/auth/verify-email')],
    ['resend-verification', post('/v1/auth/resend-verification')],
    ['forgot-password', post('/v1/auth/forgot-password')],
    ['reset-password', post('/v1/auth/reset-password')],
  ];
  const sessionRoutes: ReadonlyArray<[string, Hit]> = [
    ['refresh', post('/v1/auth/refresh')],
    ['logout', post('/v1/auth/logout')],
    ['logout-all', post('/v1/auth/logout-all', { bearer: 'token-lixo' })],
    ['consents', post('/v1/auth/consents', { bearer: 'token-lixo' })],
  ];

  for (const [position, [name, hit]] of credentialRoutes.entries()) {
    test(`${name}: a cota por endereço (2) morde na 3ª, e o teto do /48 (2) fecha o bloco na 3ª entre /64 diferentes`, async () => {
      await withApp({ AUTH_IP_RATE_LIMIT_MAX: '2', AUTH_IP_RATE_LIMIT_BLOCK_MAX: '2' }, async (_harness, client) => {
        const v4 = await statusesOf(3, () => hit(client, '203.0.113.61'));
        assert.deepEqual(v4.map((status) => status === 429), [false, false, true], `${name} IPv4: ${v4.join(',')}`);
        const v6 = await statusesOf(3, (index) => hit(client, `2001:db8:d0${position}:${index + 1}::1`));
        assert.deepEqual(v6.map((status) => status === 429), [false, false, true], `${name} IPv6, um /64 por pedido: ${v6.join(',')}`);
      });
    });
  }

  for (const [position, [name, hit]] of sessionRoutes.entries()) {
    test(`${name}: SEM cota por endereço (6 pedidos do mesmo IPv4 passam) e COM teto do /48 (2) entre /64 diferentes`, async () => {
      await withApp({ AUTH_IP_RATE_LIMIT_MAX: '2', AUTH_SESSION_BLOCK_RATE_LIMIT_MAX: '2' }, async (_harness, client) => {
        const v4 = await statusesOf(6, () => hit(client, '203.0.113.62'));
        assert.deepEqual(v4.filter((status) => status === 429), [], `${name} IPv4: ${v4.join(',')}`);
        const v6 = await statusesOf(3, (index) => hit(client, `2001:db8:e0${position}:${index + 1}::1`));
        assert.deepEqual(v6.map((status) => status === 429), [false, false, true], `${name} IPv6, um /64 por pedido: ${v6.join(',')}`);
      });
    });
  }
});

describe('F01-M1 — GET /v1/legal/current e GET /v1/auth/me têm contador PRÓPRIO, fora do global da sessão', () => {
  const legalCurrent = (client: Client, ip: string) => client.call('GET', '/v1/legal/current?audience=passenger', { ip });
  const me = (client: Client, ip: string) => client.call('GET', '/v1/auth/me', { ip, bearer: 'token-lixo' });

  test('esgotar /v1/legal/current (100/min) não dá 429 no refresh do MESMO /64; o 101º de legal/current é 429', async () => {
    await withApp({}, async (_harness, client) => {
      const ip = '2001:db8:f001:1::1';
      const statuses = await statusesOf(100, () => legalCurrent(client, ip));
      assert.deepEqual(statuses.filter((status) => status !== 200), [], `os 100 primeiros de legal/current: ${statuses.join(',')}`);
      const over = await legalCurrent(client, ip);
      assert.equal(over.status, 429, 'o 101º de legal/current nesse /64 estoura o contador PRÓPRIO dela');
      assert.equal(over.body.error.code, 'rate_limited');

      // A prova do achado: o refresh do MESMO IP não herda o estouro de legal/current.
      const refreshed = await refresh(client, ip);
      assert.equal(refreshed.status, 401, 'refresh ainda funciona (401 de token inválido, não 429): não compartilha o balde com legal/current');
    });
  });

  test('o mesmo vale para GET /v1/auth/me: esgotar o contador dela não derruba o refresh do mesmo /64', async () => {
    await withApp({}, async (_harness, client) => {
      const ip = '2001:db8:f002:1::1';
      const statuses = await statusesOf(100, () => me(client, ip));
      assert.deepEqual(statuses.filter((status) => status !== 401), [], `/me com bearer inválido é sempre 401: ${statuses.join(',')}`);
      assert.equal((await me(client, ip)).status, 429, 'o 101º de /me nesse /64');
      assert.equal((await refresh(client, ip)).status, 401, 'refresh do mesmo /64 não herda o estouro de /me');
    });
  });

  test('legal/current e /me também têm contadores SEPARADOS entre si, e do logout (classe sessão, global)', async () => {
    await withApp({}, async (_harness, client) => {
      const ip = '2001:db8:f003:1::1';
      await statusesOf(100, () => legalCurrent(client, ip));
      assert.equal((await legalCurrent(client, ip)).status, 429, 'legal/current esgotada');
      assert.equal((await me(client, ip)).status, 401, '/me, mesmo /64, tem o PRÓPRIO contador — não herda o estouro de legal/current');
      assert.equal((await logoutOne(client, ip)).status, 200, 'logout (classe sessão, global) também intacto');
    });
  });
});

describe('B5 — o 400 do refresh tem código PRÓPRIO', () => {
  test('corpo malformado do refresh: 400 invalid_refresh_body (ausente, curto, longo, tipo errado)', async () => {
    await withApp({}, async (_harness, client) => {
      for (const body of [{}, { refreshToken: '' }, { refreshToken: 'curto' }, { refreshToken: 'x'.repeat(500) }, { refreshToken: 42 }]) {
        const reply = await client.call('POST', '/v1/auth/refresh', { ip: '203.0.113.51', body });
        assert.equal(reply.status, 400, JSON.stringify(body));
        assert.equal(reply.body.error.code, 'invalid_refresh_body', JSON.stringify(body));
      }
    });
  });

  test('4xx de TRANSPORTE no refresh (corpo grande demais, tipo de conteúdo, JSON ilegível) segue sendo o invalid_body GENÉRICO', async () => {
    await withApp({}, async (harness) => {
      const send = (headers: Record<string, string>, payload: string) =>
        harness.t.app.inject({ method: 'POST', url: '/v1/auth/refresh', headers: { 'x-forwarded-for': '203.0.113.52', ...headers }, payload });
      const tooBig = await send({ 'content-type': 'application/json' }, JSON.stringify({ refreshToken: 'x'.repeat(20_000) }));
      const wrongType = await send({ 'content-type': 'application/xml' }, '<refreshToken>x</refreshToken>');
      const unreadable = await send({ 'content-type': 'application/json' }, '{"refreshToken": ');
      for (const [name, reply] of [['corpo grande (413)', tooBig], ['tipo de conteúdo (415)', wrongType], ['JSON ilegível', unreadable]] as const) {
        assert.equal(reply.statusCode, 400, name);
        assert.equal(JSON.parse(reply.body).error.code, 'invalid_body', `${name}: o código genérico NÃO é o que encerra sessão`);
      }
    });
  });

  test('Q2 (passada 6): corpo que NEM chegou a ser objeto JSON (text/plain; sem corpo e sem Content-Type) também é invalid_body genérico, não invalid_refresh_body', async () => {
    await withApp({}, async (harness) => {
      const textPlain = await harness.t.app.inject({
        method: 'POST', url: '/v1/auth/refresh',
        headers: { 'x-forwarded-for': '203.0.113.54', 'content-type': 'text/plain' },
        payload: 'eyJyZWZyZXNoVG9rZW4iOiJ4In0=',
      });
      const noBody = await harness.t.app.inject({ method: 'POST', url: '/v1/auth/refresh', headers: { 'x-forwarded-for': '203.0.113.55' } });
      for (const [name, reply] of [['text/plain', textPlain], ['sem corpo e sem Content-Type', noBody]] as const) {
        assert.equal(reply.statusCode, 400, name);
        assert.equal(JSON.parse(reply.body).error.code, 'invalid_body', `${name}: um intermediário que troca o tipo ou tira o corpo não pode encerrar a sessão`);
      }
    });
  });

  // O caso "corpo JSON de OBJETO válido com refreshToken no formato errado continua invalid_refresh_body" já está
  // coberto pelo teste anterior (`{}, {refreshToken:''}, ...`, todos objetos JSON válidos via `client.call`).

  test('o refresh de verdade recusado segue sendo 401 invalid_refresh_token', async () => {
    await withApp({}, async (_harness, client) => {
      const reply = await refresh(client, '203.0.113.53');
      assert.equal(reply.status, 401);
      assert.equal(reply.body.error.code, 'invalid_refresh_token');
    });
  });
});
