import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { drainBackgroundTasks } from '../src/lib/background-tasks.js';
import { hashEmailCode } from '../src/lib/email-code.js';
import { DEFAULT_RETENTION, runIdentityRetention } from '../src/lib/identity-retention.js';
import { pool, prepareDatabase, shutdown } from './helpers/harness.js';
import { ageCodes, makeClient, PASSWORD, PEPPER, startIdentityApp, uniqueEmail, type Harness } from './helpers/identity-kit.js';

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
const verify = (email: string, code: string, accountType = 'passenger', password = PASSWORD) =>
  call('POST', '/v1/auth/verify-email', { body: { accountType, identifier: email, code, password } });
const wrongCode = (real: string) => (real === '000000' ? '000001' : '000000');

describe('verificar e-mail', () => {
  test('código errado conta tentativa; o certo verifica e libera o login (sem abrir sessão na verificação)', async () => {
    const created = await register();
    const wrong = await verify(created.email, wrongCode(created.code));
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.error.code, 'invalid_code');
    assert.equal(wrong.body.error.attemptsLeft, 4);
    const ok = await verify(created.email, created.code);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { ok: true, data: { verified: true } });
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM refresh_token_families')).rows[0].n, 0);
    const login = await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: created.email, password: PASSWORD } });
    assert.equal(login.status, 200);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM access_log WHERE event = 'email_verified'`)).rows[0].n, 1);
  });

  test('por ID público também; código de uso único (segunda vez é "expirado/inexistente")', async () => {
    const created = await register();
    assert.equal((await call('POST', '/v1/auth/verify-email', { body: { accountType: 'passenger', identifier: created.account.publicId.toLowerCase(), code: created.code, password: PASSWORD } })).status, 200);
    const again = await verify(created.email, created.code);
    assert.equal(again.status, 400);
    assert.equal(again.body.error.code, 'code_expired');
  });

  test('5 erros travam o código (429 code_locked); depois nem o certo vale — é preciso pedir outro', async () => {
    const created = await register();
    const bad = wrongCode(created.code);
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await verify(created.email, bad)).status);
    assert.deepEqual(statuses, [400, 400, 400, 400, 429]);
    const right = await verify(created.email, created.code);
    assert.equal(right.status, 400);
    assert.equal(right.body.error.code, 'code_expired');
    assert.equal((await pool.query(`SELECT close_reason FROM account_email_codes`)).rows[0].close_reason, 'too_many_attempts');
  });

  test('código vencido é recusado e fechado; conta desconhecida responde igual ao "sem código"', async () => {
    const created = await register();
    await pool.query(`UPDATE account_email_codes SET created_at = now() - interval '30 minutes', expires_at = now() - interval '1 minute'`);
    const expired = await verify(created.email, created.code);
    assert.equal(expired.status, 400);
    assert.equal(expired.body.error.code, 'code_expired');
    const unknown = await verify('ninguem@teste.vuumbora.dev', '123456');
    assert.deepEqual(unknown.body, expired.body);
    const wrongType = await verify(created.email, created.code, 'driver');
    assert.deepEqual(wrongType.body, expired.body);
  });

  test('corpo inválido (código não numérico, 5 dígitos) é 400 invalid_body', async () => {
    for (const code of ['12345', 'abcdef', '1234567', 123456]) {
      const response = await call('POST', '/v1/auth/verify-email', { body: { accountType: 'passenger', identifier: 'a@teste.vuumbora.dev', code, password: PASSWORD } });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'invalid_body');
    }
  });

  test('CONCORRÊNCIA: 12 chutes simultâneos errados não passam do limite de 5 tentativas', async () => {
    const created = await register();
    const bad = wrongCode(created.code);
    const results = await Promise.all(Array.from({ length: 12 }, () => verify(created.email, bad)));
    const codes = results.map((r) => r.body.error.code);
    assert.equal(codes.filter((c) => c === 'invalid_code').length, 4);
    assert.equal(results.filter((r) => r.status === 429).length, 1, 'exatamente um chute vê o travamento');
    assert.equal(codes.filter((c) => c === 'code_expired').length, 7);
    const row = (await pool.query(`SELECT attempts, max_attempts, close_reason FROM account_email_codes`)).rows[0];
    assert.equal(row.attempts, 5);
    assert.equal(row.close_reason, 'too_many_attempts');
    assert.equal((await verify(created.email, created.code)).status, 400, 'depois do travamento o certo também falha');
  });

  test('CONCORRÊNCIA: o mesmo código certo em 6 requisições simultâneas passa UMA vez só', async () => {
    const created = await register();
    const results = await Promise.all(Array.from({ length: 6 }, () => verify(created.email, created.code)));
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(results.filter((r) => r.body.error?.code === 'code_expired').length, 5);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM access_log WHERE event = 'email_verified'`)).rows[0].n, 1);
  });
});

describe('reenviar código de verificação', () => {
  const resend = (email: string, accountType = 'passenger') =>
    call('POST', '/v1/auth/resend-verification', { body: { accountType, identifier: email } });

  test('reenvio dentro do intervalo mínimo é silencioso; depois dele, o código novo vale e o antigo morre', async () => {
    const created = await register();
    const tooSoon = await resend(created.email);
    await drainBackgroundTasks();
    assert.equal(tooSoon.status, 200);
    assert.equal(h.mailbox.to(created.email).length, 1, 'intervalo mínimo: nada novo foi enviado');

    await ageCodes(created.account.id);
    const again = await resend(created.email);
    await drainBackgroundTasks();
    assert.equal(again.status, 200);
    assert.deepEqual(again.body, tooSoon.body);
    assert.equal(h.mailbox.to(created.email).length, 2);
    const fresh = h.mailbox.lastCode(created.email);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM account_email_codes WHERE closed_at IS NULL`)).rows[0].n, 1, 'um só código vivo');
    if (fresh !== created.code) {
      const old = await verify(created.email, created.code);
      assert.equal(old.status, 400);
      assert.equal(old.body.error.code, 'invalid_code', 'o código antigo foi substituído');
    }
    assert.equal((await verify(created.email, fresh)).status, 200);
  });

  test('resposta idêntica e NENHUM e-mail para conta inexistente, já verificada ou de outro tipo', async () => {
    const pending = await register();
    const verified = await registerAndLogin();
    await ageCodes(pending.account.id);
    const before = h.mailbox.sent.length;
    const base = await resend('ninguem@teste.vuumbora.dev');
    for (const response of [await resend(verified.email), await resend(pending.email, 'driver'), await resend(pending.account.publicId)]) {
      assert.deepEqual(response, { ...response, status: 200, body: base.body });
    }
    await drainBackgroundTasks();
    // Só o último (ID público da conta pendente, tipo certo, intervalo vencido) é legítimo.
    assert.equal(h.mailbox.sent.length, before + 1);
  });

  test('teto de pedidos por e-mail: o 6º vira 429 (sem revelar existência)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await resend('alvo.reenvio@teste.vuumbora.dev')).status);
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
  });

  test('o teto por hora do banco (5 envios) vale mesmo com o intervalo vencido', async () => {
    const created = await register();
    for (let i = 0; i < 6; i += 1) {
      await ageCodes(created.account.id, 70);
      await call('POST', '/v1/auth/resend-verification', { ip: `10.200.0.${i + 1}`, body: { accountType: 'passenger', identifier: created.email } });
      await drainBackgroundTasks();
    }
    assert.equal(h.mailbox.to(created.email).length, 5, '1 do cadastro + 4 reenvios; o 6º pedido bateu no teto por hora');
  });
});

describe('esqueci a senha e redefinir', () => {
  const forgot = (email: string, accountType = 'passenger') =>
    call('POST', '/v1/auth/forgot-password', { body: { accountType, email } });
  const reset = (email: string, code: string, newPassword = 'Nova-senha-123', accountType = 'passenger') =>
    call('POST', '/v1/auth/reset-password', { body: { accountType, email, code, newPassword } });

  test('responde IGUAL para conta existente, inexistente, não verificada e de outro tipo; só a verificada recebe e-mail', async () => {
    const verified = await registerAndLogin();
    const pending = await register();
    h.mailbox.sent.length = 0;
    const known = await forgot(verified.email);
    const unknown = await forgot('ninguem@teste.vuumbora.dev');
    const unverified = await forgot(pending.email);
    const otherType = await forgot(verified.email, 'driver');
    await drainBackgroundTasks();
    for (const response of [unknown, unverified, otherType]) assert.deepEqual({ status: response.status, body: response.body }, { status: known.status, body: known.body });
    assert.equal(known.status, 200);
    assert.equal(h.mailbox.sent.length, 1);
    assert.equal(h.mailbox.sent[0]!.to, verified.email);
    assert.match(h.mailbox.sent[0]!.subject, /Redefinição de senha/);
  });

  test('redefinir: troca a senha, REVOGA todas as sessões, a antiga senha morre e o código é de uso único', async () => {
    const session = await registerAndLogin();
    const second = await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: session.email, password: PASSWORD } });
    await forgot(session.email);
    await drainBackgroundTasks();
    const code = h.mailbox.lastCode(session.email);

    const wrong = await reset(session.email, wrongCode(code));
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.error.code, 'invalid_code');
    assert.equal(wrong.body.error.attemptsLeft, 4);
    assert.equal((await call('GET', '/v1/auth/me', { bearer: session.accessToken })).status, 200, 'chute errado não derruba sessão');

    const ok = await reset(session.email, code);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { ok: true, data: { passwordChanged: true, sessionsRevoked: true } });
    for (const s of [session, second.body.data]) {
      assert.equal((await call('GET', '/v1/auth/me', { bearer: s.accessToken })).status, 401, 'token de acesso cai na hora');
      assert.equal((await call('POST', '/v1/auth/refresh', { body: { refreshToken: s.refreshToken } })).status, 401);
    }
    assert.equal((await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: session.email, password: PASSWORD } })).status, 401);
    assert.equal((await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: session.email, password: 'Nova-senha-123' } })).status, 200);
    const reuse = await reset(session.email, code, 'Outra-senha-456');
    assert.equal(reuse.status, 400);
    assert.equal(reuse.body.error.code, 'code_expired');
    const events = await pool.query(`SELECT event FROM access_log WHERE event IN ('password_changed','password_reset_completed','password_reset_requested') ORDER BY id`);
    assert.deepEqual(events.rows.map((r) => r.event), ['password_reset_requested', 'password_changed', 'password_reset_completed']);
  });

  test('redefinir NÃO marca o e-mail como verificado (conta pendente com código de redefinição forjado no banco)', async () => {
    const pending = await register();
    const code = '482913';
    await pool.query(
      `INSERT INTO account_email_codes (account_id, purpose, code_hash, expires_at) VALUES ($1, 'password_reset', $2, now() + interval '10 minutes')`,
      [pending.account.id, hashEmailCode(PEPPER, 'password_reset', pending.account.id, code)],
    );
    const ok = await reset(pending.email, code);
    assert.equal(ok.status, 200);
    const account = await pool.query(`SELECT email_verified_at FROM accounts WHERE id = $1`, [pending.account.id]);
    assert.equal(account.rows[0].email_verified_at, null, 'quem recebeu código de senha ainda não provou o e-mail');
    const login = await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: pending.email, password: 'Nova-senha-123' } });
    assert.equal(login.status, 403);
    assert.equal(login.body.error.code, 'email_not_verified');
  });

  test('o código de redefinição de um tipo não abre a conta do outro tipo (mesmo e-mail)', async () => {
    const email = uniqueEmail('tipos');
    const passenger = await register(email, 'passenger');
    const driver = await register(email, 'driver');
    for (const [type, created] of [['passenger', passenger], ['driver', driver]] as const) await verify(email, created.code, type);
    h.mailbox.sent.length = 0;
    await forgot(email, 'passenger');
    await drainBackgroundTasks();
    const code = h.mailbox.lastCode(email);
    const crossed = await reset(email, code, 'Nova-senha-123', 'driver');
    assert.equal(crossed.status, 400);
    assert.equal(crossed.body.error.code, 'code_expired');
    assert.equal((await call('POST', '/v1/auth/login', { body: { accountType: 'driver', identifier: email, password: PASSWORD } })).status, 200, 'a conta do motorista segue intacta');
    assert.equal((await reset(email, code, 'Nova-senha-123', 'passenger')).status, 200);
  });

  test('CONCORRÊNCIA: o mesmo código certo em 5 redefinições simultâneas troca a senha UMA vez só', async () => {
    const session = await registerAndLogin();
    await forgot(session.email);
    await drainBackgroundTasks();
    const code = h.mailbox.lastCode(session.email);
    const passwords = ['Senha-A-111111', 'Senha-B-222222', 'Senha-C-333333', 'Senha-D-444444', 'Senha-E-555555'];
    const results = await Promise.all(passwords.map((p) => reset(session.email, code, p)));
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(results.filter((r) => r.body.error?.code === 'code_expired').length, 4);
    const logins = await Promise.all(passwords.map((p, i) => call('POST', '/v1/auth/login', { ip: `10.210.0.${i + 1}`, body: { accountType: 'passenger', identifier: session.email, password: p } })));
    assert.equal(logins.filter((r) => r.status === 200).length, 1, 'exatamente uma das senhas ficou valendo');
  });

  test('chutes de redefinição: 5 erros travam; depois do travamento é preciso pedir outro código', async () => {
    const session = await registerAndLogin();
    await forgot(session.email);
    await drainBackgroundTasks();
    const code = h.mailbox.lastCode(session.email);
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await reset(session.email, wrongCode(code))).status);
    assert.deepEqual(statuses, [400, 400, 400, 400, 429]);
    assert.equal((await reset(session.email, code)).body.error.code, 'code_expired');
    assert.equal((await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: session.email, password: PASSWORD } })).status, 200, 'a senha antiga segue valendo');
  });

  test('valida: nova senha curta/longa é 400 invalid_password; conta desconhecida responde igual a "sem código"', async () => {
    assert.equal((await reset('a@teste.vuumbora.dev', '123456', 'curta')).body.error.code, 'invalid_password');
    assert.equal((await reset('a@teste.vuumbora.dev', '123456', 'x'.repeat(73))).body.error.code, 'invalid_password');
    const unknown = await reset('ninguem@teste.vuumbora.dev', '123456');
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.code, 'code_expired');
  });

  test('falha do e-mail em "esqueci a senha" não muda a resposta e não vaza o destinatário no log', async () => {
    const session = await registerAndLogin();
    h.mailbox.failing = true;
    const response = await forgot(session.email);
    await drainBackgroundTasks();
    assert.equal(response.status, 200);
    assert.ok(h.t.logs().includes('auth_mail_send_failed'));
    assert.ok(!h.t.logs().includes(session.email));
  });
});

describe('retenção (M-5): função rodada com a credencial dona', () => {
  test('apaga só o que passou do prazo, em cada tabela, e devolve a contagem', async () => {
    const live = await registerAndLogin();
    const old = await registerAndLogin();
    // login_attempts / access_log
    await pool.query(`INSERT INTO login_attempts (identifier_hash, succeeded, attempted_at) VALUES (repeat('a',64), false, now() - interval '3 days'), (repeat('b',64), false, now() - interval '1 hour')`);
    await pool.query(`INSERT INTO access_log (event, account_id, occurred_at) VALUES ('logout', $1, now() - interval '91 days'), ('logout', $1, now() - interval '89 days')`, [old.account.id]);
    // famílias: vencida há 8 dias (apaga), revogada há 8 dias (apaga), viva (fica)
    await pool.query(`UPDATE refresh_token_families SET expires_at = now() - interval '8 days' WHERE account_id = $1`, [old.account.id]);
    await pool.query(`INSERT INTO refresh_token_families (account_id, expires_at, revoked_at, revoke_reason) VALUES ($1, now() + interval '1 day', now() - interval '8 days', 'logout')`, [live.account.id]);
    // códigos: fechado há 8 dias (apaga) e vivo (fica)
    await pool.query(
      `INSERT INTO account_email_codes (account_id, purpose, code_hash, created_at, expires_at, closed_at, close_reason)
       VALUES ($1, 'password_reset', repeat('c',64), now() - interval '9 days', now() - interval '9 days' + interval '15 minutes', now() - interval '8 days', 'used')`,
      [live.account.id],
    );
    await pool.query(`INSERT INTO account_email_codes (account_id, purpose, code_hash, expires_at) VALUES ($1, 'password_reset', repeat('d',64), now() + interval '10 minutes')`, [live.account.id]);

    const familiesBefore = (await pool.query('SELECT count(*)::int AS n FROM refresh_token_families')).rows[0].n;
    const report = await runIdentityRetention(pool, DEFAULT_RETENTION);
    assert.equal(report.loginAttempts, 1);
    assert.equal(report.accessLog, 1);
    assert.equal(report.sessionFamilies, 2);
    assert.equal(report.emailCodes, 1);

    assert.equal((await pool.query('SELECT count(*)::int AS n FROM refresh_token_families')).rows[0].n, familiesBefore - 2);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM login_attempts WHERE identifier_hash = repeat('b',64)`)).rows[0].n, 1, 'recente fica');
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM access_log WHERE occurred_at > now() - interval '90 days' AND event = 'logout'`)).rows[0].n, 1);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM account_email_codes WHERE code_hash = repeat('d',64)`)).rows[0].n, 1, 'código vivo fica');
    const orphans = await pool.query(`SELECT count(*)::int AS n FROM refresh_tokens t WHERE NOT EXISTS (SELECT 1 FROM refresh_token_families f WHERE f.id = t.family_id)`);
    assert.equal(orphans.rows[0].n, 0, 'a cascata levou os tokens das famílias apagadas');
    await assert.rejects(runIdentityRetention(pool, { ...DEFAULT_RETENTION, accessLogDays: 0 }), /retention_policy_invalid/);
  });
});
