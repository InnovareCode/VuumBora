/**
 * Exclusão de conta de ponta a ponta (item 3 das pendências jurídicas, `docs/juridico/pendencias-para-o-advogado.md`):
 * `POST /v1/auth/delete-account` — reautenticação por senha, revogação de TODAS as sessões, anonimização do dado
 * pessoal mantendo só o que a lei obriga (aceite em `account_consents`, auditoria em `access_log`), `status = 'deleted'`.
 * Contrato: `docs/contrato-identidade-apps.md`.
 */
import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { deleteAccountRow } from '../src/repositories/identity-repository.js';
import { pool, prepareDatabase, shutdown } from './helpers/harness.js';
import { DEVICE, makeClient, PASSWORD, randomIp, startIdentityApp, uniqueEmail, type Harness } from './helpers/identity-kit.js';

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
});

const call: typeof api.call = (...args) => api.call(...args);
const registerAndLogin: typeof api.registerAndLogin = (...args) => api.registerAndLogin(...args);
const deleteAccount = (bearer: string, password: string, ip?: string) =>
  call('POST', '/v1/auth/delete-account', { bearer, body: { password }, ...(ip ? { ip } : {}) });
/** "Passa o tempo": a espera progressiva do par `delete_account:<id>|ip:<balde>` é medida contra a última falha. */
const rewind = (seconds: number) =>
  pool.query(`UPDATE login_attempts SET attempted_at = attempted_at - make_interval(secs => $1) WHERE scope = 'login'`, [seconds]);
const accountRow = (id: string) => pool.query(`SELECT * FROM accounts WHERE id = $1`, [id]).then((r) => r.rows[0]);

describe('POST /v1/auth/delete-account — contrato básico', () => {
  test('sem Bearer: 401; corpo sem senha: 400 (e nenhuma sessão cai)', async () => {
    const session = await registerAndLogin();
    assert.equal((await call('POST', '/v1/auth/delete-account', { body: { password: PASSWORD } })).status, 401);
    const noPassword = await deleteAccount(session.accessToken, undefined as unknown as string);
    assert.equal(noPassword.status, 400);
    assert.equal(noPassword.body.error.code, 'invalid_body');
    assert.equal((await call('GET', '/v1/auth/me', { bearer: session.accessToken })).status, 200, 'a sessão não caiu com corpo inválido');
  });

  test('senha errada: 403 wrong_password (não 401 — decisão do Atlas em 22/11/2026, conferência PP-12 da Nova: 401 colidia com "token inválido" e o cliente renovava a sessão e repetia a chamada sozinho); a conta e as sessões continuam vivas', async () => {
    const session = await registerAndLogin();
    const wrong = await deleteAccount(session.accessToken, 'senha-errada-xyz');
    assert.equal(wrong.status, 403);
    assert.equal(wrong.body.error.code, 'wrong_password');
    assert.equal((await call('GET', '/v1/auth/me', { bearer: session.accessToken })).status, 200);
    assert.equal((await accountRow(session.account.id)).status, 'active');
  });

  test('senha certa: 200, revoga a sessão usada na hora, e access_log grava account_deleted sem revelar e-mail/senha', async () => {
    const session = await registerAndLogin();
    const ok = await deleteAccount(session.accessToken, PASSWORD);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.deepEqual(ok.body.data, { accountDeleted: true });
    assert.equal((await call('GET', '/v1/auth/me', { bearer: session.accessToken })).status, 401, 'a própria sessão usada na exclusão também cai');
    const log = await pool.query(`SELECT event FROM access_log WHERE account_id = $1 ORDER BY id`, [session.account.id]);
    assert.ok(log.rows.some((r) => r.event === 'account_deleted'));
    const dump = JSON.stringify(log.rows);
    assert.ok(!dump.includes(session.email) && !dump.includes(PASSWORD));
  });
});

describe('POST /v1/auth/delete-account — revogação de TODAS as sessões (não só a usada)', () => {
  test('duas sessões (dois logins) da mesma conta: as duas caem, e uma sessão de OUTRA conta não é afetada', async () => {
    const mine = await registerAndLogin();
    const second = await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: mine.email, password: PASSWORD, device: { ...DEVICE, installationId: 'instalacao-0002' } } });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    const stranger = await registerAndLogin();

    const result = await deleteAccount(mine.accessToken, PASSWORD);
    assert.equal(result.status, 200, JSON.stringify(result.body));

    assert.equal((await call('GET', '/v1/auth/me', { bearer: mine.accessToken })).status, 401);
    assert.equal((await call('GET', '/v1/auth/me', { bearer: second.body.data.accessToken })).status, 401, 'a SEGUNDA sessão também caiu');
    assert.equal((await call('POST', '/v1/auth/refresh', { body: { refreshToken: second.body.data.refreshToken } })).status, 401);
    assert.equal((await call('GET', '/v1/auth/me', { bearer: stranger.accessToken })).status, 200, 'conta de outra pessoa não é tocada');

    const families = await pool.query(`SELECT revoke_reason FROM refresh_token_families WHERE account_id = $1`, [mine.account.id]);
    assert.ok(families.rows.length >= 2);
    assert.ok(families.rows.every((r) => r.revoke_reason === 'account_deleted'));
  });
});

describe('POST /v1/auth/delete-account — anonimização (mantém só o que a lei obriga)', () => {
  test('accounts: status=deleted, deleted_at preenchido, e-mail/nome/telefone/data de nascimento substituídos; o e-mail original fica livre para recadastro', async () => {
    const original = uniqueEmail('apagar');
    const session = await registerAndLogin(original);
    await pool.query(`UPDATE accounts SET phone = '+5584999990000' WHERE id = $1`, [session.account.id]);

    const before = await accountRow(session.account.id);
    assert.equal(before.email, original);
    assert.ok(before.birth_date, 'nasceu com data de nascimento (cadastro exige)');

    assert.equal((await deleteAccount(session.accessToken, PASSWORD)).status, 200);

    const after = await accountRow(session.account.id);
    assert.equal(after.status, 'deleted');
    assert.ok(after.deleted_at);
    assert.notEqual(after.email, original);
    assert.match(after.email, /^excluida-.*@excluida\.vuumbora\.invalid$/);
    assert.equal(after.full_name, 'Conta excluída');
    assert.equal(after.phone, null);
    assert.equal(after.birth_date, null);
    assert.equal(after.account_type, 'passenger', 'o tipo é imutável — a exclusão não tenta mudá-lo');
    assert.equal(after.public_id, before.public_id, 'o ID público também é imutável');

    // O e-mail original está livre: um recadastro com ele funciona como se fosse novo (conta nova, id novo).
    const reRegistered = await api.register(original);
    assert.notEqual(reRegistered.account.id, session.account.id);
  });

  test('account_credentials: o hash é SOBRESCRITO (descartável) — a senha antiga nunca mais autentica nada', async () => {
    const session = await registerAndLogin();
    const hashBefore = (await pool.query(`SELECT password_hash FROM account_credentials WHERE account_id = $1`, [session.account.id])).rows[0].password_hash;
    assert.equal((await deleteAccount(session.accessToken, PASSWORD)).status, 200);
    const row = await pool.query(`SELECT password_hash FROM account_credentials WHERE account_id = $1`, [session.account.id]);
    assert.equal(row.rowCount, 1, 'a linha continua existindo (a API não tem DELETE; é UPDATE)');
    assert.notEqual(row.rows[0].password_hash, hashBefore);
    assert.match(row.rows[0].password_hash, /^\$2[aby]\$/, 'continua um hash bcrypt válido (CHECK do banco)');
  });

  test('devices: rótulo vira NULL e o aparelho é revogado', async () => {
    const session = await registerAndLogin();
    const before = await pool.query(`SELECT device_label, revoked_at FROM devices WHERE account_id = $1`, [session.account.id]);
    assert.equal(before.rows[0].device_label, DEVICE.label);
    assert.equal(before.rows[0].revoked_at, null);
    assert.equal((await deleteAccount(session.accessToken, PASSWORD)).status, 200);
    const after = await pool.query(`SELECT device_label, revoked_at FROM devices WHERE account_id = $1`, [session.account.id]);
    assert.equal(after.rows[0].device_label, null);
    assert.ok(after.rows[0].revoked_at);
  });

  test('account_consents (prova do aceite, LGPD art. 8º §2º) NUNCA é tocado — nem apagado, nem alterado', async () => {
    const session = await registerAndLogin();
    const before = await pool.query(`SELECT id, document, version, accepted_at FROM account_consents WHERE account_id = $1 ORDER BY document`, [session.account.id]);
    assert.equal(before.rowCount, 2, 'Termos + Política');
    assert.equal((await deleteAccount(session.accessToken, PASSWORD)).status, 200);
    const after = await pool.query(`SELECT id, document, version, accepted_at FROM account_consents WHERE account_id = $1 ORDER BY document`, [session.account.id]);
    assert.deepEqual(after.rows, before.rows, 'a prova do aceite é idêntica, byte a byte');
  });
});

describe('POST /v1/auth/delete-account — adivinhação de senha é freada (espera progressiva, I-6)', () => {
  test('senha errada repetidas vezes no mesmo par (conta+IP): 429 too_many_attempts, igual ao login; a senha certa some do limite depois que o relógio passa', async () => {
    const session = await registerAndLogin();
    const ip = randomIp();
    const first = await deleteAccount(session.accessToken, 'errada-1', ip);
    assert.equal(first.status, 403);
    const second = await deleteAccount(session.accessToken, 'errada-2', ip);
    assert.equal(second.status, 429);
    assert.equal(second.body.error.code, 'too_many_attempts');
    assert.equal(second.body.error.retryAfterSeconds, 1);
    assert.equal(second.headers['retry-after'], '1');
    assert.equal((await accountRow(session.account.id)).status, 'active', 'nada foi apagado enquanto a espera não passou');

    await rewind(1);
    const ok = await deleteAccount(session.accessToken, PASSWORD, ip);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
  });

  test('o par é PRÓPRIO da exclusão: errar a senha aqui não atrasa o login da mesma conta, e vice-versa', async () => {
    const session = await registerAndLogin();
    const ip = randomIp();
    assert.equal((await deleteAccount(session.accessToken, 'errada-delete', ip)).status, 403);
    const login = await call('POST', '/v1/auth/login', { ip, body: { accountType: 'passenger', identifier: session.email, password: PASSWORD } });
    assert.equal(login.status, 200, 'o par do login está limpo: a falha foi só na exclusão');
  });
});

describe('delete_account(): idempotência e concorrência no banco', () => {
  test('chamar duas vezes: a 2ª devolve already_deleted, sem erro e sem mudar deleted_at de novo', async () => {
    const session = await registerAndLogin();
    const first = await deleteAccountRow(pool, session.account.id, '$2b$04$' + 'x'.repeat(53));
    assert.equal(first, 'ok');
    const deletedAtFirst = (await accountRow(session.account.id)).deleted_at;
    const second = await deleteAccountRow(pool, session.account.id, '$2b$04$' + 'y'.repeat(53));
    assert.equal(second, 'already_deleted');
    assert.deepEqual((await accountRow(session.account.id)).deleted_at, deletedAtFirst, 'não reescreveu deleted_at nem o hash (already_deleted não toca em nada)');
  });

  test('id desconhecido: not_found', async () => {
    assert.equal(await deleteAccountRow(pool, '00000000-0000-4000-8000-000000000001', '$2b$04$' + 'z'.repeat(53)), 'not_found');
  });

  test('duas chamadas SIMULTÂNEAS para a mesma conta: o lock serializa, uma vê "ok" e a outra "already_deleted" (nunca as duas "ok", nunca erro)', async () => {
    const session = await registerAndLogin();
    const results = await Promise.all([
      deleteAccountRow(pool, session.account.id, '$2b$04$' + 'a'.repeat(53)),
      deleteAccountRow(pool, session.account.id, '$2b$04$' + 'b'.repeat(53)),
    ]);
    assert.deepEqual([...results].sort(), ['already_deleted', 'ok']);
  });
});
