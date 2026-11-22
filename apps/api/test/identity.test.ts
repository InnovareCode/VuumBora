import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import { loadAuthConfig } from '../src/lib/auth-config.js';
import { drainBackgroundTasks } from '../src/lib/background-tasks.js';
import { DEFAULT_DELAY_SCHEDULE, LOGIN_FAILURE_MEMORY_HOURS } from '../src/lib/progressive-delay.js';
import { reserveDelayedAttempt } from '../src/repositories/identity-repository.js';
import { sha256Hex, signAccessToken, verifyAccessToken } from '../src/lib/token-crypto.js';
import { pool, prepareDatabase, shutdown } from './helpers/harness.js';
import {
  containsCode, DEVICE, dumpTables, JWT_SECRET, makeClient, PASSWORD, randomIp, REGISTER_EXTRAS, startIdentityApp, uniqueEmail, type Harness,
} from './helpers/identity-kit.js';

let h: Harness;
let api!: ReturnType<typeof makeClient>;

before(async () => {
  await prepareDatabase();
  h = await startIdentityApp();
  api = makeClient(h);
});
after(async () => {
  await h.t.app.close();
  await shutdown();
});
beforeEach(async () => {
  await pool.query('TRUNCATE accounts CASCADE');
  await pool.query('TRUNCATE login_attempts');
  h.mailbox.sent.length = 0;
  h.mailbox.failing = false;
});

const call: typeof api.call = (...args) => api.call(...args);
const register: typeof api.register = (...args) => api.register(...args);
const registerAndLogin: typeof api.registerAndLogin = (...args) => api.registerAndLogin(...args);

describe('cadastro (sem sessão) e e-mail repetido', () => {
  test('cadastra SEM abrir sessão, grava só o hash do código e manda o código por e-mail', async () => {
    const email = uniqueEmail('maria');
    const created = await register(email, 'driver');
    const data = created.response.body.data;
    assert.equal(data.account.accountType, 'driver');
    assert.match(data.account.publicId, /^[0-9A-F]{10}$/);
    assert.deepEqual(Object.keys(data).sort(), ['account', 'verification']);
    assert.deepEqual({ ...data.verification }, { required: true, emailSent: true, resendAfterSeconds: 60 });
    assert.match(created.code, /^\d{6}$/);

    assert.equal((await pool.query('SELECT count(*)::int AS n FROM refresh_token_families')).rows[0].n, 0, 'cadastro não abre sessão');
    const stored = await pool.query(`SELECT purpose, code_hash, closed_at, expires_at - created_at AS ttl FROM account_email_codes`);
    assert.equal(stored.rowCount, 1);
    assert.equal(stored.rows[0].purpose, 'verify_email');
    assert.match(stored.rows[0].code_hash, /^[0-9a-f]{64}$/);
    assert.equal(stored.rows[0].closed_at, null);
    assert.equal(h.mailbox.to(email).length, 1);
    const log = await pool.query(`SELECT event FROM access_log ORDER BY id`);
    assert.deepEqual(log.rows.map((r) => r.event), ['register', 'email_code_sent']);
  });

  test('e-mail JÁ VERIFICADO no mesmo tipo (em qualquer caixa): 409 explícito; em outro tipo: permitido', async () => {
    // Conta verificada: nunca é tocada pelo cadastro. (Conta NÃO verificada é reaproveitada: identity-hardening.test.ts, I-4.)
    await registerAndLogin('Maria.Teste@Teste.Vuumbora.dev', 'passenger');
    const dup = await call('POST', '/v1/auth/register', {
      body: { accountType: 'passenger', fullName: 'Outra', email: 'maria.teste@teste.vuumbora.dev', password: PASSWORD, ...REGISTER_EXTRAS },
    });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'email_taken');
    assert.equal(dup.body.error.message, 'Este e-mail já está cadastrado.');
    const other = await call('POST', '/v1/auth/register', {
      body: { accountType: 'driver', fullName: 'Maria Motorista', email: 'maria.teste@teste.vuumbora.dev', password: PASSWORD, ...REGISTER_EXTRAS },
    });
    assert.equal(other.status, 201, 'mesmo e-mail, outro tipo de conta: contas separadas');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n, 2);
  });

  test('valida entrada: senha curta/longa, e-mail ruim, tipo admin/ausente, telefone inválido', async () => {
    const base = { accountType: 'passenger', fullName: 'X', email: 'a@teste.vuumbora.dev', password: PASSWORD, ...REGISTER_EXTRAS };
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...base, password: 'curta' }, 'invalid_password'],
      [{ ...base, password: 'a'.repeat(73) }, 'invalid_password'],
      [{ ...base, email: 'nao-e-email' }, 'invalid_email'],
      [{ ...base, accountType: 'admin' }, 'invalid_body'],
      [{ ...base, accountType: undefined }, 'invalid_body'],
      [{ ...base, phone: '123' }, 'invalid_phone'],
    ];
    for (const [body, code] of cases) {
      const response = await call('POST', '/v1/auth/register', { body });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, code);
    }
  });

  test('se o envio do e-mail falha, a conta existe e a resposta diz emailSent:false (sem 500)', async () => {
    h.mailbox.failing = true;
    const email = uniqueEmail('falha');
    const response = await call('POST', '/v1/auth/register', { body: { accountType: 'passenger', fullName: 'Pessoa', email, password: PASSWORD, ...REGISTER_EXTRAS } });
    assert.equal(response.status, 201);
    assert.equal(response.body.data.verification.emailSent, false);
    assert.ok(h.t.logs().includes('auth_mail_send_failed'));
    assert.ok(!h.t.logs().includes(email), 'o destinatário não vai para o log');
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM access_log WHERE event = 'email_code_sent'`)).rows[0].n, 0);
  });

  test('limite do escopo register: por e-mail (mesmo vindo de IPs diferentes) e por IP', async () => {
    const email = uniqueEmail('alvo');
    // O 1º cadastro (conta verificada em seguida) gasta 1 das 5 consultas; as seguintes recebem 409 e, esgotado o teto, 429.
    await registerAndLogin(email);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await call('POST', '/v1/auth/register', { body: { accountType: 'passenger', fullName: 'Pessoa', email, password: PASSWORD, ...REGISTER_EXTRAS } })).status);
    }
    assert.deepEqual(statuses, [409, 409, 409, 409, 429, 429]);

    const ip = randomIp();
    const perIp: number[] = [];
    for (let i = 0; i < 32; i += 1) {
      perIp.push((await call('POST', '/v1/auth/register', { ip, body: { accountType: 'passenger', fullName: 'Pessoa', email: uniqueEmail('scan'), password: PASSWORD, ...REGISTER_EXTRAS } })).status);
    }
    assert.equal(perIp.filter((s) => s === 201).length, 30);
    assert.deepEqual(perIp.slice(30), [429, 429]);
    const blocked = await call('POST', '/v1/auth/register', { ip, body: { accountType: 'passenger', fullName: 'Pessoa', email: uniqueEmail('scan'), password: PASSWORD, ...REGISTER_EXTRAS } });
    assert.ok(blocked.headers['retry-after']);
    assert.equal(blocked.body.error.code, 'too_many_attempts');
    const rows = await pool.query(`SELECT count(*)::int AS n FROM login_attempts WHERE scope = 'register' AND ip_hash IS NOT NULL AND succeeded`);
    assert.equal(rows.rows[0].n, 0, 'toda consulta conta como tentativa (succeeded=false)');
  });
});

describe('login: contas separadas e e-mail verificado', () => {
  test('login por e-mail (qualquer caixa) e por ID público (minúsculo também), dentro do tipo', async () => {
    const created = await registerAndLogin();
    const byEmail = await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: created.email.toUpperCase(), password: PASSWORD, device: DEVICE } });
    assert.equal(byEmail.status, 200);
    const byId = await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: created.account.publicId.toLowerCase(), password: PASSWORD } });
    assert.equal(byId.status, 200);
    assert.equal(byId.body.data.account.id, created.account.id);
    const devices = await pool.query('SELECT count(*)::int AS n FROM devices');
    assert.equal(devices.rows[0].n, 1, 'mesmo aparelho em dois logins = uma linha só');
  });

  test('MESMO e-mail, duas contas: cada uma entra só com o próprio tipo e a própria senha', async () => {
    const email = uniqueEmail('dupla');
    const passenger = await register(email, 'passenger', { password: 'Senha-do-passageiro-1' });
    const driver = await register(email, 'driver', { password: 'Senha-do-motorista-1' });
    for (const [type, created] of [['passenger', passenger], ['driver', driver]] as const) {
      const password = type === 'passenger' ? 'Senha-do-passageiro-1' : 'Senha-do-motorista-1';
      const verified = await call('POST', '/v1/auth/verify-email', { body: { accountType: type, identifier: email, code: created.code, password } });
      assert.equal(verified.status, 200);
    }
    const asPassenger = await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: email, password: 'Senha-do-passageiro-1' } });
    const asDriver = await call('POST', '/v1/auth/login', { body: { accountType: 'driver', identifier: email, password: 'Senha-do-motorista-1' } });
    assert.equal(asPassenger.status, 200);
    assert.equal(asDriver.status, 200);
    assert.equal(asPassenger.body.data.account.accountType, 'passenger');
    assert.equal(asDriver.body.data.account.accountType, 'driver');
    assert.notEqual(asPassenger.body.data.account.id, asDriver.body.data.account.id);
    // Senha de uma conta não abre a outra; ID público de uma não serve no tipo da outra.
    assert.equal((await call('POST', '/v1/auth/login', { body: { accountType: 'driver', identifier: email, password: 'Senha-do-passageiro-1' } })).status, 401);
    assert.equal((await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: driver.account.publicId, password: 'Senha-do-motorista-1' } })).status, 401);
  });

  test('errar a senha de um tipo NÃO atrasa o outro tipo de mesmo e-mail (espera escopada pelo tipo)', async () => {
    const email = uniqueEmail('escopo');
    const passenger = await register(email, 'passenger');
    const driver = await register(email, 'driver');
    for (const [type, created] of [['passenger', passenger], ['driver', driver]] as const) {
      await call('POST', '/v1/auth/verify-email', { body: { accountType: type, identifier: email, code: created.code, password: PASSWORD } });
    }
    const ip = randomIp();
    assert.equal((await call('POST', '/v1/auth/login', { ip, body: { accountType: 'passenger', identifier: email, password: 'errada-1-xxxx' } })).status, 401);
    assert.equal((await call('POST', '/v1/auth/login', { ip, body: { accountType: 'passenger', identifier: email, password: PASSWORD } })).status, 429, 'passageiro espera 1 s');
    assert.equal((await call('POST', '/v1/auth/login', { ip, body: { accountType: 'driver', identifier: email, password: PASSWORD } })).status, 200);
  });

  test('conta NÃO verificada: senha certa dá 403 email_not_verified e NENHUMA sessão nasce; senha errada segue genérica', async () => {
    const created = await register();
    const response = await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: created.email, password: PASSWORD, device: DEVICE } });
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'email_not_verified');
    assert.equal(response.body.data, undefined);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM refresh_token_families')).rows[0].n, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM devices')).rows[0].n, 0, 'nem aparelho é gravado antes da verificação');
    const wrong = await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: created.email, password: 'errada-xxxx' } });
    assert.equal(wrong.status, 401, 'quem não sabe a senha não descobre que o e-mail está pendente');
    assert.equal(wrong.body.error.code, 'invalid_credentials');
  });

  test('e-mail inexistente, senha errada e tipo errado: resposta idêntica (status e corpo)', async () => {
    const created = await registerAndLogin();
    const wrongPassword = await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: created.email, password: 'senha-errada-1' } });
    const unknownEmail = await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: 'ninguem@teste.vuumbora.dev', password: 'senha-errada-1' } });
    const unknownId = await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: 'ABCDEF1234', password: 'senha-errada-1' } });
    const wrongType = await call('POST', '/v1/auth/login', { body: { accountType: 'driver', identifier: created.email, password: PASSWORD } });
    assert.equal(wrongPassword.status, 401);
    for (const other of [unknownEmail, unknownId, wrongType]) {
      assert.equal(other.status, 401);
      assert.deepEqual(other.body, wrongPassword.body);
    }
  });

  test('conta bloqueada não entra, com a mesma resposta genérica; login exige accountType', async () => {
    const created = await registerAndLogin();
    await pool.query(`UPDATE accounts SET status = 'blocked' WHERE id = $1`, [created.account.id]);
    const response = await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: created.email, password: PASSWORD } });
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'invalid_credentials');
    assert.equal((await call('POST', '/v1/auth/login', { body: { identifier: created.email, password: PASSWORD } })).status, 400);
  });
});

describe('login: atraso progressivo por par (I-6) — não tranca a vítima de fora', () => {
  const login = (ip: string, email: string, password: string) =>
    call('POST', '/v1/auth/login', { ip, body: { accountType: 'passenger', identifier: email, password } });
  /** "Passa o tempo": recua as tentativas já gravadas (a espera é medida contra a hora da última falha). */
  const rewind = (seconds: number) =>
    pool.query(`UPDATE login_attempts SET attempted_at = attempted_at - make_interval(secs => $1) WHERE scope = 'login'`, [seconds]);
  const failureRows = async () => (await pool.query(`SELECT count(*)::int AS n FROM login_attempts WHERE scope = 'login' AND NOT succeeded`)).rows[0].n as number;

  test('a espera DOBRA a cada erro (1 s, 2 s, 4 s...); antes dela vale 429 + Retry-After, até com a senha certa', async () => {
    const created = await registerAndLogin();
    const ip = randomIp();
    let waited = 0;
    for (const expectedWait of [1, 2, 4, 8]) {
      assert.equal((await login(ip, created.email, `errada-${expectedWait}-xxxx`)).status, 401, `falha que gera espera de ${expectedWait} s`);
      const blocked = await login(ip, created.email, `errada-de-novo-${expectedWait}`);
      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.error.code, 'too_many_attempts');
      assert.equal(blocked.headers['retry-after'], String(expectedWait), `Retry-After da espera de ${expectedWait} s`);
      assert.equal(blocked.body.error.retryAfterSeconds, expectedWait);
      assert.equal((await login(ip, created.email, PASSWORD)).status, 429, 'a senha certa também espera o relógio do par');
      waited += expectedWait;
      await rewind(expectedWait); // a espera passou
    }
    assert.equal(waited, 15);
    assert.equal((await login(ip, created.email, PASSWORD)).status, 200, 'passada a espera, a senha certa entra');
  });

  test('o 429 NÃO alonga a espera: martelar a rota não empurra o relógio nem grava falha', async () => {
    const created = await registerAndLogin();
    const ip = randomIp();
    assert.equal((await login(ip, created.email, 'errada-1-xxxx')).status, 401);
    const before = await failureRows();
    for (let i = 0; i < 6; i += 1) assert.equal((await login(ip, created.email, `martelo-${i}-xxxx`)).status, 429);
    assert.equal(await failureRows(), before, 'tentativa recusada não grava falha');
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM access_log WHERE event = 'login_blocked'`)).rows[0].n, 6);
  });

  test('a espera tem TETO de 15 min (Retry-After nunca passa de 900 s), por mais que o par erre', async () => {
    const created = await registerAndLogin();
    const ip = randomIp();
    for (let i = 0; i < 14; i += 1) {
      await rewind(1000); // sempre depois da espera (a maior vale 900 s)
      assert.equal((await login(ip, created.email, `errada-${i}-xxxxx`)).status, 401);
    }
    const blocked = await login(ip, created.email, 'errada-15-xxxxx');
    assert.equal(blocked.status, 429);
    const retry = Number(blocked.headers['retry-after']);
    assert.ok(retry > 880 && retry <= 900, `Retry-After ${retry}`);
  });

  test('M-1: o atacante paga SÓ no par dele; a vítima, de outro IP, entra sem espera nenhuma', async () => {
    const victim = await registerAndLogin();
    const attacker = randomIp();
    for (let i = 0; i < 6; i += 1) {
      await login(attacker, victim.email, `chute-${i}-xxxxx`);
      await rewind(1000);
    }
    assert.equal((await login(attacker, victim.email, 'chute-7-xxxxx')).status, 401);
    assert.equal((await login(attacker, victim.email, 'chute-8-xxxxx')).status, 429, 'o atacante espera');
    const legit = await login(randomIp(), victim.email, PASSWORD);
    assert.equal(legit.status, 200, 'a vítima não pode ser trancada de fora por quem só sabe o e-mail dela');
  });

  test('ataque DISTRIBUÍDO (30 IPs) não tranca a conta: nenhum bloqueio global, e o titular entra no meio do ataque', async () => {
    const victim = await registerAndLogin();
    const statuses: number[] = [];
    for (let i = 0; i < 30; i += 1) statuses.push((await login(randomIp(), victim.email, `chute-${i}-xxxxx`)).status);
    assert.deepEqual(statuses, Array(30).fill(401), 'cada IP é um par novo: 1ª tentativa livre');
    assert.equal((await login(randomIp(), victim.email, PASSWORD)).status, 200);
  });

  test('conta inexistente tem o MESMO comportamento (sem oráculo de existência)', async () => {
    const ip = randomIp();
    const ghost = 'fantasma@teste.vuumbora.dev';
    assert.equal((await login(ip, ghost, 'qualquer-coisa')).status, 401);
    const blocked = await login(ip, ghost, 'qualquer-coisa');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers['retry-after'], '1');
  });

  test('12 reservas paralelas do mesmo par não furam a espera (reserva sob lock): só UMA é concedida e UMA falha é gravada', async () => {
    // No repositório e não pela HTTP: depois do M-1 (rodada 3b) um mesmo IP não coloca mais de 2 requisições ao mesmo tempo na fila
    // do bcrypt (a 3ª já recebe 503 `server_busy`), e o par é por definição o mesmo IP. O que se prova aqui é o lock do par.
    const identifierHash = 'a'.repeat(63) + Math.floor(Math.random() * 16).toString(16);
    const before = await failureRows();
    const outcomes = await Promise.all(Array.from({ length: 12 }, () => reserveDelayedAttempt(pool, { scope: 'login', identifierHash, ipHash: null, schedule: DEFAULT_DELAY_SCHEDULE, memoryHours: LOGIN_FAILURE_MEMORY_HOURS })));
    assert.equal(outcomes.filter((o) => o.allowed).length, 1);
    assert.equal(outcomes.filter((o) => !o.allowed).length, 11);
    assert.equal(await failureRows() - before, 1, 'uma única falha gravada');
  });

  test('2 tentativas simultâneas do mesmo par pela HTTP (o que um IP pode ter na fila do bcrypt): UMA compara (401) e a outra espera (429)', async () => {
    const created = await registerAndLogin();
    const ip = randomIp();
    const before = await failureRows();
    const results = await Promise.all(Array.from({ length: 2 }, (_, i) => login(ip, created.email, `errada-${i}-xxxx`)));
    assert.deepEqual(results.map((r) => r.status).sort(), [401, 429]);
    assert.equal(await failureRows() - before, 1, 'uma única falha gravada');
  });

  test('um login certo zera a contagem do par (a próxima falha volta a esperar 1 s)', async () => {
    const created = await registerAndLogin();
    const ip = randomIp();
    for (let i = 0; i < 3; i += 1) {
      await login(ip, created.email, 'errada-xxxx');
      await rewind(100);
    }
    assert.equal((await login(ip, created.email, PASSWORD)).status, 200);
    assert.equal((await login(ip, created.email, 'errada-xxxx')).status, 401);
    const blocked = await login(ip, created.email, 'errada-xxxx');
    assert.equal(blocked.headers['retry-after'], '1', 'recomeçou do zero: 1ª falha = 1 s, não 8 s');
  });

  test('as falhas "evaporam" depois de 24 h sem errar', async () => {
    const created = await registerAndLogin();
    const ip = randomIp();
    for (let i = 0; i < 12; i += 1) {
      await rewind(1000);
      await login(ip, created.email, `errada-${i}-xxxxx`);
    }
    assert.equal((await login(ip, created.email, `errada-x-xxxxx`)).status, 429);
    await rewind(25 * 3600);
    assert.equal((await login(ip, created.email, `errada-y-xxxxx`)).status, 401, 'par limpo: a 1ª falha de novo');
    assert.equal((await login(ip, created.email, PASSWORD)).headers['retry-after'], '1');
  });

  test('IPv6: trocar os últimos 64 bits NÃO abre um par novo (o par é o /64)', async () => {
    const created = await registerAndLogin();
    assert.equal((await login('2001:db8:cccc:1::1', created.email, 'errada-1-xxxx')).status, 401);
    assert.equal((await login('2001:db8:cccc:1:9:8:7:6', created.email, 'errada-2-xxxx')).status, 429, 'mesmo /64');
    assert.equal((await login('2001:db8:cccc:2::1', created.email, 'errada-3-xxxx')).status, 401, 'outro /64 = par novo');
  });
});

describe('renovação (rotate_refresh_token)', () => {
  test('renova, o token novo funciona e o antigo é recusado', async () => {
    const created = await registerAndLogin();
    const first = await call('POST', '/v1/auth/refresh', { body: { refreshToken: created.refreshToken } });
    assert.equal(first.status, 200);
    assert.notEqual(first.body.data.refreshToken, created.refreshToken);
    assert.equal((await call('GET', '/v1/auth/me', { bearer: first.body.data.accessToken })).status, 200);
    assert.equal((await call('POST', '/v1/auth/refresh', { body: { refreshToken: first.body.data.refreshToken } })).status, 200);
  });

  test('REUSO: apresentar o token já consumido revoga a família inteira e grava token_reuse_detected', async () => {
    const created = await registerAndLogin();
    const rotated = await call('POST', '/v1/auth/refresh', { body: { refreshToken: created.refreshToken } });
    assert.equal(rotated.status, 200);
    const reuse = await call('POST', '/v1/auth/refresh', { body: { refreshToken: created.refreshToken } });
    assert.equal(reuse.status, 401);
    assert.equal(reuse.body.error.code, 'invalid_refresh_token');
    const family = await pool.query(`SELECT revoked_at, revoke_reason FROM refresh_token_families WHERE account_id = $1`, [created.account.id]);
    assert.equal(family.rows[0].revoke_reason, 'reuse_detected');
    assert.equal((await call('POST', '/v1/auth/refresh', { body: { refreshToken: rotated.body.data.refreshToken } })).status, 401);
    assert.equal((await call('GET', '/v1/auth/me', { bearer: rotated.body.data.accessToken })).status, 401);
    const log = await pool.query(`SELECT account_id FROM access_log WHERE event = 'token_reuse_detected'`);
    assert.equal(log.rowCount, 1);
  });

  test('CONCORRÊNCIA: duas renovações simultâneas com o mesmo token — uma passa, a outra é reuso e a família cai', async () => {
    const created = await registerAndLogin();
    const [a, b] = await Promise.all([
      call('POST', '/v1/auth/refresh', { body: { refreshToken: created.refreshToken } }),
      call('POST', '/v1/auth/refresh', { body: { refreshToken: created.refreshToken } }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 401]);
    const live = await pool.query(`SELECT count(*)::int AS n FROM refresh_tokens WHERE used_at IS NULL AND family_id IN (SELECT id FROM refresh_token_families WHERE account_id = $1)`, [created.account.id]);
    assert.ok(live.rows[0].n <= 1);
    const winner = a.status === 200 ? a : b;
    assert.equal((await call('POST', '/v1/auth/refresh', { body: { refreshToken: winner.body.data.refreshToken } })).status, 401);
  });

  test('tudo que não é "rotated" vira 401 igual: desconhecido, expirado, revogada, bloqueada, e-mail "des-verificado"', async () => {
    const unknown = await call('POST', '/v1/auth/refresh', { body: { refreshToken: 'x'.repeat(43) } });
    assert.equal(unknown.status, 401);
    const expired = await registerAndLogin();
    await pool.query(`UPDATE refresh_tokens SET expires_at = now() - interval '1 minute' WHERE token_hash = $1`, [sha256Hex(expired.refreshToken)]);
    const loggedOut = await registerAndLogin();
    await call('POST', '/v1/auth/logout', { body: { refreshToken: loggedOut.refreshToken } });
    const blocked = await registerAndLogin();
    await pool.query(`UPDATE accounts SET status = 'blocked' WHERE id = $1`, [blocked.account.id]);
    const unverified = await registerAndLogin();
    await pool.query(`UPDATE accounts SET email_verified_at = NULL WHERE id = $1`, [unverified.account.id]);
    for (const session of [expired, loggedOut, blocked, unverified]) {
      const response = await call('POST', '/v1/auth/refresh', { body: { refreshToken: session.refreshToken } });
      assert.equal(response.status, 401);
      assert.deepEqual(response.body, unknown.body, 'o cliente não distingue o motivo');
    }
    assert.equal((await call('GET', '/v1/auth/me', { bearer: unverified.accessToken })).status, 401, 'token de acesso também cai sem e-mail verificado');
  });

  test('refresh só em corpo válido; a rota não aceita o token de acesso no lugar', async () => {
    assert.equal((await call('POST', '/v1/auth/refresh', { body: {} })).status, 400);
    const created = await registerAndLogin();
    assert.ok([400, 401].includes((await call('POST', '/v1/auth/refresh', { body: { refreshToken: created.accessToken } })).status));
  });
});

describe('logout, /me e cabeçalhos', () => {
  test('logout encerra só aquela sessão, é idempotente e vale na hora para o token de acesso', async () => {
    const created = await registerAndLogin();
    const other = await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: created.email, password: PASSWORD } });
    assert.equal((await call('POST', '/v1/auth/logout', { body: { refreshToken: created.refreshToken } })).status, 200);
    assert.equal((await call('POST', '/v1/auth/logout', { body: { refreshToken: created.refreshToken } })).status, 200);
    assert.equal((await call('GET', '/v1/auth/me', { bearer: created.accessToken })).status, 401);
    assert.equal((await call('GET', '/v1/auth/me', { bearer: other.body.data.accessToken })).status, 200);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM access_log WHERE event = 'logout'`)).rows[0].n, 1);
  });

  test('logout-all derruba todas as sessões da conta e só dela', async () => {
    const mine = await registerAndLogin();
    const second = await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: mine.email, password: PASSWORD } });
    const stranger = await registerAndLogin();
    const response = await call('POST', '/v1/auth/logout-all', { bearer: mine.accessToken, body: {} });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.revokedSessions, 2);
    assert.equal((await call('POST', '/v1/auth/refresh', { body: { refreshToken: second.body.data.refreshToken } })).status, 401);
    assert.equal((await call('GET', '/v1/auth/me', { bearer: stranger.accessToken })).status, 200);
    assert.equal((await call('POST', '/v1/auth/logout-all', { body: {} })).status, 401);
  });

  test('/me devolve o tipo da conta e recusa token ausente, adulterado, alg:none e expirado', async () => {
    const created = await registerAndLogin(uniqueEmail(), 'driver');
    const me = await call('GET', '/v1/auth/me', { bearer: created.accessToken });
    assert.equal(me.body.data.accountType, 'driver');
    assert.equal((await call('GET', '/v1/auth/me')).status, 401);
    const [header, payload, signature] = created.accessToken.split('.');
    assert.equal((await call('GET', '/v1/auth/me', { bearer: `${header}.${payload}.${signature.slice(0, -2)}AA` })).status, 401);
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${payload}.`;
    assert.equal((await call('GET', '/v1/auth/me', { bearer: none })).status, 401);
    const claims = verifyAccessToken(JWT_SECRET, created.accessToken)!;
    assert.equal((await call('GET', '/v1/auth/me', { bearer: signAccessToken(JWT_SECRET, claims, 60, Date.now() - 3_600_000).token })).status, 401);
  });

  test('toda resposta de /v1/auth/* sai com Cache-Control: no-store (sucesso, erro, 401, 404)', async () => {
    const created = await registerAndLogin();
    const responses = [
      await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: created.email, password: 'errada-xxxx' } }),
      await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: created.email, password: PASSWORD } }),
      await call('GET', '/v1/auth/me', { bearer: created.accessToken }),
      await call('GET', '/v1/auth/me'),
      await call('POST', '/v1/auth/register', { body: { nada: 1 } }),
      await call('POST', '/v1/auth/forgot-password', { body: { accountType: 'passenger', email: created.email } }),
    ];
    for (const response of responses) assert.equal(response.headers['cache-control'], 'no-store', `status ${response.status}`);
  });
});

describe('privacidade: nada sensível em tabela ou log', () => {
  test('nenhum e-mail, IP, senha, token ou CÓDIGO aparece em tabela de tentativas/trilha/códigos nem no log', async () => {
    const ip = '203.0.113.77';
    const email = 'sigilo.total@teste.vuumbora.dev';
    const bodies: string[] = [];
    const record = async <T extends { body: unknown }>(promise: Promise<T>): Promise<T> => {
      const response = await promise;
      bodies.push(JSON.stringify(response.body));
      return response;
    };
    const created = await record(call('POST', '/v1/auth/register', {
      ip, body: { accountType: 'passenger', fullName: 'Pessoa Sigilosa', email, password: PASSWORD, ...REGISTER_EXTRAS, phone: '(84) 99988-7766' },
    }));
    assert.equal(created.status, 201);
    const verifyCode = h.mailbox.lastCode(email);
    await record(call('POST', '/v1/auth/verify-email', { ip, body: { accountType: 'passenger', identifier: email, code: verifyCode === '000000' ? '000001' : '000000', password: PASSWORD } }));
    await record(call('POST', '/v1/auth/verify-email', { ip, body: { accountType: 'passenger', identifier: email, code: verifyCode, password: PASSWORD } }));
    await record(call('POST', '/v1/auth/login', { ip, body: { accountType: 'passenger', identifier: email, password: 'errada-xxxx' } }));
    // A falha acima impõe 1 s de espera ao par (I-6): "passa o tempo" para o login certo não ser recusado.
    await pool.query(`UPDATE login_attempts SET attempted_at = attempted_at - interval '1 minute' WHERE scope = 'login'`);
    const login = await record(call('POST', '/v1/auth/login', { ip, body: { accountType: 'passenger', identifier: email.toUpperCase(), password: PASSWORD, device: DEVICE } }));
    await record(call('POST', '/v1/auth/login', { ip, body: { accountType: 'passenger', identifier: 'naoexiste.sigilo@teste.vuumbora.dev', password: 'errada-xxxx' } }));
    const { refreshToken, accessToken } = login.body.data;
    await record(call('POST', '/v1/auth/forgot-password', { ip, body: { accountType: 'passenger', email } }));
    await drainBackgroundTasks();
    const resetCode = h.mailbox.lastCode(email);
    await record(call('POST', '/v1/auth/reset-password', { ip, body: { accountType: 'passenger', email, code: resetCode, newPassword: 'Nova-senha-sigilo-9' } }));
    await record(call('POST', '/v1/auth/refresh', { ip, body: { refreshToken } }));
    await record(call('POST', '/v1/auth/malformado', { ip, body: { x: email } }));
    await record(call('GET', '/v1/auth/me', { ip, bearer: accessToken }));
    h.mailbox.failing = true;
    await record(call('POST', '/v1/auth/resend-verification', { ip, body: { accountType: 'passenger', identifier: 'outro.sigilo@teste.vuumbora.dev' } }));

    const publicId = created.body.data.account.publicId;
    const dump = await dumpTables(['login_attempts', 'access_log', 'account_email_codes', 'devices', 'refresh_token_families', 'refresh_tokens', 'account_credentials']);
    const logs = h.t.logs();
    const secrets = [email, 'sigilo.total', 'naoexiste.sigilo', ip, PASSWORD, 'Nova-senha-sigilo-9', 'errada-xxxx', refreshToken, accessToken, '999887766', publicId];

    for (const [label, haystack] of [['tabelas', dump], ['log', logs]] as const) {
      for (const secret of secrets) assert.ok(!haystack.toLowerCase().includes(secret.toLowerCase()), `"${secret.slice(0, 8)}…" vazou em ${label}`);
      for (const code of [verifyCode, resetCode]) assert.ok(!containsCode(haystack, code), `o código ${label === 'log' ? 'foi logado' : 'está em claro na tabela'}`);
    }
    // Nem o corpo de qualquer resposta devolve o código (ele só viaja por e-mail).
    for (const body of bodies) for (const code of [verifyCode, resetCode]) assert.ok(!containsCode(body, code), 'código na resposta HTTP');

    assert.ok(!dump.includes(refreshToken) && dump.includes(sha256Hex(refreshToken)), 'só o sha256 do token de renovação é guardado');
    const hashes = await pool.query(`SELECT code_hash FROM account_email_codes`);
    assert.ok(hashes.rowCount! >= 2);
    for (const row of hashes.rows) assert.match(row.code_hash, /^[0-9a-f]{64}$/);
    const attempts = await pool.query(`SELECT identifier_hash, ip_hash FROM login_attempts`);
    assert.ok(attempts.rowCount! >= 3);
    for (const row of attempts.rows) {
      assert.match(row.identifier_hash, /^[0-9a-f]{64}$/);
      assert.match(row.ip_hash, /^[0-9a-f]{64}$/);
    }
    assert.ok(logs.includes('auth_login_failed'), 'o log segue existindo (observabilidade)');
    assert.ok(logs.includes('auth_mail_send_failed'));
  });

  test('e-mail e IP também não vazam num erro da camada de dados', async () => {
    const original = pool.connect.bind(pool);
    const email = 'erro.interno@teste.vuumbora.dev';
    (pool as any).connect = () => Promise.reject(Object.assign(new Error(`falha com ${email}`), { code: 'XX000' }));
    try {
      const response = await call('POST', '/v1/auth/login', { ip: '203.0.113.99', body: { accountType: 'passenger', identifier: email, password: 'qualquer-xxxx' } });
      assert.ok(response.status === 503 || response.status === 500);
    } finally {
      (pool as any).connect = original;
    }
    assert.ok(!h.t.logs().includes(email));
    assert.ok(!h.t.logs().includes('203.0.113.99'));
  });
});

describe('configuração (B-3: entropia e segredos distintos)', () => {
  const good = () => randomBytes(48).toString('base64');

  test('sem segredos, curtos, repetidos, de baixa entropia ou IGUAIS entre si: configuração nula (503)', () => {
    assert.equal(loadAuthConfig({}), null);
    assert.equal(loadAuthConfig({ AUTH_PEPPER: 'curto', AUTH_JWT_SECRET: 'curto' }), null);
    assert.equal(loadAuthConfig({ AUTH_PEPPER: 'a'.repeat(32), AUTH_JWT_SECRET: 'b'.repeat(32) }), null, '32 letras iguais não valem');
    assert.equal(loadAuthConfig({ AUTH_PEPPER: 'ab'.repeat(20), AUTH_JWT_SECRET: good() }), null, 'poucos caracteres distintos');
    const same = good();
    assert.equal(loadAuthConfig({ AUTH_PEPPER: same, AUTH_JWT_SECRET: same }), null, 'pepper e JWT iguais');
  });

  test('segredos gerados com `openssl rand -base64` passam, e o teto da espera de login nunca fica abaixo da base', () => {
    const config = loadAuthConfig({ AUTH_PEPPER: good(), AUTH_JWT_SECRET: good(), AUTH_LOGIN_DELAY_BASE_SECONDS: '30', AUTH_LOGIN_DELAY_MAX_SECONDS: '10' });
    assert.ok(config);
    assert.deepEqual(config.loginDelay, { baseSeconds: 30, maxSeconds: 30 });
    assert.deepEqual(loadAuthConfig({ AUTH_PEPPER: good(), AUTH_JWT_SECRET: good() })!.loginDelay, { baseSeconds: 1, maxSeconds: 900 });
  });
});
