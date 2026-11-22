/**
 * Privilégio mínimo do papel de runtime da API (migração 0017, revisão S1 rodada 2, I-3).
 *
 * Este arquivo roda o app conectado COMO `vuumbora_api` (ver helpers/runtime-role-env.ts).
 * Dois lados da mesma prova:
 *   - o que a API precisa continua funcionando (fluxos reais pela HTTP: admin, formulários
 *     públicos, identidade dos apps) — se a 0017 tirar privilégio demais, estes quebram;
 *   - o que a API NÃO deve poder fazer é recusado pelo banco (42501) — se a 0017 for
 *     removida, estes quebram. A matriz abaixo é o contrato: tabela nova sem linha aqui
 *     reprova o teste.
 */
import './helpers/auth-env.js';
import './helpers/runtime-role-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { after, before, describe, test } from 'node:test';
import { env } from '../src/env.js';
import { prepararBanco } from '../src/migrate.js';
import { encryptSecret, parseEncryptionKey } from '../src/lib/secret-box.js';
import { base32Encode, hotp, totpStep } from '../src/lib/totp.js';
import { DEVICE, makeClient, PASSWORD, startIdentityApp, type Harness } from './helpers/identity-kit.js';
import { pool, send, shutdown } from './helpers/harness.js';
import { OWNER_DATABASE_URL } from './helpers/runtime-role-env.js';
import { ensureBaseline } from './helpers/legal-kit.js';

const owner = new pg.Pool({ connectionString: OWNER_DATABASE_URL, max: 2 });
const TOTP_SECRET = Buffer.alloc(20, 5);
const KEY = parseEncryptionKey(Buffer.alloc(32, 7).toString('base64'));

/** O que a API pode ESCREVER em cada tabela do banco (SELECT existe em todas, exceto schema_migrations). */
const WRITES: Record<string, readonly ('INSERT' | 'UPDATE' | 'DELETE')[]> = {
  access_log: ['INSERT'],
  account_consents: ['INSERT'],
  account_credentials: ['INSERT', 'UPDATE'],
  account_email_codes: ['INSERT', 'UPDATE'],
  accounts: ['INSERT', 'UPDATE'],
  admin_audit_log: ['INSERT'],
  admin_enrollment_tokens: ['UPDATE'],
  admin_login_challenges: ['INSERT', 'DELETE'],
  admin_login_failures: ['INSERT', 'DELETE'],
  admin_recovery_codes: ['INSERT', 'UPDATE', 'DELETE'],
  admin_sessions: ['INSERT', 'UPDATE', 'DELETE'],
  admin_totp: ['INSERT', 'UPDATE', 'DELETE'],
  admin_users: [],
  devices: ['INSERT', 'UPDATE'],
  driver_applications: ['INSERT', 'UPDATE'],
  email_settings: ['INSERT', 'UPDATE'],
  // Catálogo de versões dos Termos/Política (0021): a API só LÊ; quem publica é o operador (`npm run legal:publish`, credencial dona).
  legal_document_versions: [],
  login_attempts: ['INSERT'],
  refresh_token_families: ['INSERT', 'UPDATE'],
  refresh_tokens: ['INSERT', 'UPDATE'],
  schema_migrations: [],
  waitlist_signups: ['INSERT'],
};

let h: Harness;

before(async () => {
  // Migra como DONO (o papel da API não faz DDL); depois o app conecta como `vuumbora_api`.
  await prepararBanco({ databaseUrl: OWNER_DATABASE_URL, pool: owner, log: () => undefined });
  // O cadastro exige versão publicada (0021): catálogo baseline, publicado com a credencial dona.
  await ensureBaseline(owner);
  h = await startIdentityApp();
});
after(async () => {
  await h.t.app.close();
  await shutdown();
  await owner.end();
});

describe('matriz de privilégios do papel vuumbora_api', () => {
  test('cada tabela do banco tem exatamente os privilégios da matriz (e toda tabela está na matriz)', async () => {
    const tables = await owner.query<{ relname: string; s: boolean; i: boolean; u: boolean; d: boolean; t: boolean }>(
      `SELECT c.relname,
              has_table_privilege('vuumbora_api', c.oid, 'SELECT') AS s,
              has_table_privilege('vuumbora_api', c.oid, 'INSERT') AS i,
              has_table_privilege('vuumbora_api', c.oid, 'UPDATE') AS u,
              has_table_privilege('vuumbora_api', c.oid, 'DELETE') AS d,
              has_table_privilege('vuumbora_api', c.oid, 'TRUNCATE') AS t
         FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' ORDER BY 1`,
    );
    assert.deepEqual(tables.rows.map((r) => r.relname).sort(), Object.keys(WRITES).sort(), 'tabela nova precisa entrar na matriz (e fazer o próprio REVOKE)');
    for (const row of tables.rows) {
      const allowed = WRITES[row.relname]!;
      assert.equal(row.i, allowed.includes('INSERT'), `${row.relname}: INSERT`);
      assert.equal(row.u, allowed.includes('UPDATE'), `${row.relname}: UPDATE`);
      assert.equal(row.d, allowed.includes('DELETE'), `${row.relname}: DELETE`);
      assert.equal(row.t, false, `${row.relname}: TRUNCATE`);
      assert.equal(row.s, row.relname !== 'schema_migrations', `${row.relname}: SELECT`);
    }
  });

  // A matriz acima só olha `relkind = 'r'` (tabelas): a view e a função da 0021 têm asserção própria.
  test('0021: a view legal_current_versions é só leitura e a função legal_pending_for_account só executa para o papel da API', async () => {
    const view = await owner.query<{ s: boolean; i: boolean; u: boolean; d: boolean; t: boolean; kind: string }>(
      `SELECT c.relkind AS kind,
              has_table_privilege('vuumbora_api', c.oid, 'SELECT') AS s,
              has_table_privilege('vuumbora_api', c.oid, 'INSERT') AS i,
              has_table_privilege('vuumbora_api', c.oid, 'UPDATE') AS u,
              has_table_privilege('vuumbora_api', c.oid, 'DELETE') AS d,
              has_table_privilege('vuumbora_api', c.oid, 'TRUNCATE') AS t
         FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname = 'legal_current_versions'`,
    );
    assert.deepEqual(view.rows, [{ kind: 'v', s: true, i: false, u: false, d: false, t: false }], 'a view existe e a API só lê');
    const fn = await owner.query<{ api: boolean; pub: boolean }>(
      `SELECT has_function_privilege('vuumbora_api', 'legal_pending_for_account(uuid)', 'EXECUTE') AS api,
              has_function_privilege('public', 'legal_pending_for_account(uuid)', 'EXECUTE') AS pub`,
    );
    assert.deepEqual(fn.rows[0], { api: true, pub: false }, 'EXECUTE só para o papel da API');
    // E funcionam de verdade COM o papel restrito (leitura do catálogo e da pendência).
    assert.ok((await pool.query('SELECT 1 FROM legal_current_versions LIMIT 1')).rowCount === 1, 'a API lê a view');
    assert.equal((await pool.query('SELECT * FROM legal_pending_for_account(gen_random_uuid())')).rowCount, 0);
  });

  test('a conexão do app é de fato o papel restrito', async () => {
    const who = await pool.query('SELECT current_user AS u');
    assert.equal(who.rows[0].u, 'vuumbora_api');
  });

  test('o que a API não escreve é recusado pelo banco com 42501 (criar administrador, token de ativação, apagar contas...)', async () => {
    const denied = async (sql: string, params: unknown[] = []) => {
      await assert.rejects(pool.query(sql, params), (err: { code?: string }) => err.code === '42501', sql);
    };
    const hash = await bcrypt.hash('x', 4);
    await denied(`INSERT INTO admin_users (name, email, password_hash, role) VALUES ('Invasor', 'invasor@x.com', $1, 'dono')`, [hash]);
    await denied(`UPDATE admin_users SET role = 'dono'`);
    await denied(`UPDATE admin_users SET password_hash = $1`, [hash]);
    await denied(`DELETE FROM admin_users`);
    await denied(`INSERT INTO admin_enrollment_tokens (admin_id, token_hash, expires_at) VALUES (gen_random_uuid(), repeat('a', 64), now() + interval '1 day')`);
    await denied(`DELETE FROM admin_enrollment_tokens`);
    await denied(`UPDATE admin_login_failures SET admin_id = NULL`);
    await denied(`DELETE FROM accounts`);
    await denied(`DELETE FROM account_credentials`);
    await denied(`DELETE FROM account_email_codes`);
    await denied(`UPDATE account_consents SET version = 'adulterada'`);
    await denied(`DELETE FROM account_consents`);
    await denied(`TRUNCATE account_consents`);
    await denied(`INSERT INTO legal_document_versions (document, audience, version, text_sha256) VALUES ('terms_of_use', 'passenger', 'forjada', repeat('a', 64))`);
    await denied(`UPDATE legal_document_versions SET text_sha256 = repeat('b', 64)`);
    await denied(`DELETE FROM legal_document_versions`);
    await denied(`TRUNCATE legal_document_versions`);
    await denied(`DELETE FROM refresh_tokens`);
    await denied(`UPDATE login_attempts SET succeeded = true`);
    await denied(`DELETE FROM login_attempts`);
    await denied(`UPDATE waitlist_signups SET email = 'x@x.com'`);
    await denied(`DELETE FROM waitlist_signups`);
    await denied(`DELETE FROM driver_applications`);
    await denied(`DELETE FROM email_settings`);
    await denied(`UPDATE admin_audit_log SET action = 'x'`);
    await denied(`DELETE FROM admin_audit_log`);
    await denied(`TRUNCATE admin_audit_log`);
    await denied(`INSERT INTO schema_migrations (id) VALUES ('0999_x.sql')`);
  });
});

describe('o que a API precisa continua funcionando COM o papel restrito', () => {
  test('admin: login com 2FA, e-mail do painel (reautenticação), candidatura (aprovar) e logout', async () => {
    // Fixture com a credencial DONA: a API não cria administrador.
    const email = `dono-${randomUUID().slice(0, 8)}@teste.vuumbora.dev`;
    const created = await owner.query<{ id: string }>(
      `INSERT INTO admin_users (name, email, password_hash, role) VALUES ('Dono', $1, $2, 'dono') RETURNING id`,
      [email, await bcrypt.hash(PASSWORD, 4)],
    );
    const adminId = created.rows[0]!.id;
    await owner.query(`INSERT INTO admin_totp (admin_id, secret_encrypted, confirmed_at) VALUES ($1, $2, now())`, [adminId, encryptSecret(base32Encode(TOTP_SECRET), KEY, adminId)]);

    const first = await send(h.t.app, 'POST', '/auth/login', { body: { email, password: PASSWORD } });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.data.status, 'second_factor_required');
    const verified = await send(h.t.app, 'POST', '/auth/2fa/verify', { body: { challengeToken: first.body.data.challengeToken, code: hotp(TOTP_SECRET, totpStep(Date.now())) } });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    const session = { cookie: verified.sessionCookie!, csrf: verified.body.data.csrfToken as string };
    assert.equal((await send(h.t.app, 'GET', '/me', { cookie: session.cookie })).status, 200);

    // E-mail do painel: upsert em email_settings + auditoria; o código TOTP do passo seguinte (anti-replay).
    await owner.query('UPDATE admin_totp SET last_used_step = NULL WHERE admin_id = $1', [adminId]);
    const saved = await send(h.t.app, 'POST', '/settings/email', {
      ...session,
      body: { host: '8.8.8.8', port: 587, user: 'u', from: 'a@exemplo.com.br', password: 'segredo-smtp', stepUp: { password: PASSWORD, code: hotp(TOTP_SECRET, totpStep(Date.now())) } },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    await owner.query('UPDATE admin_totp SET last_used_step = NULL WHERE admin_id = $1', [adminId]);
    const removed = await send(h.t.app, 'POST', '/settings/email/password/remove', { ...session, body: { stepUp: { password: PASSWORD, code: hotp(TOTP_SECRET, totpStep(Date.now())) } } });
    assert.equal(removed.status, 200, JSON.stringify(removed.body));

    // Formulários públicos (INSERT ... ON CONFLICT DO NOTHING) e a decisão do admin (UPDATE).
    const candidateEmail = `cand-${randomUUID().slice(0, 8)}@teste.vuumbora.dev`;
    const application = await h.t.app.inject({
      method: 'POST',
      url: '/v1/driver-applications',
      payload: { name: 'Motorista de Teste', phone: '84988887777', email: candidateEmail, city: 'Natal', state: 'RN' },
    });
    assert.equal(application.statusCode, 200, application.body);
    const waitlist = await h.t.app.inject({ method: 'POST', url: '/v1/waitlist', payload: { email: `fila-${randomUUID().slice(0, 8)}@teste.vuumbora.dev`, profile: 'passenger' } });
    assert.equal(waitlist.statusCode, 200, waitlist.body);

    const row = await owner.query<{ id: string }>('SELECT id FROM driver_applications WHERE email = $1', [candidateEmail]);
    const approved = await send(h.t.app, 'POST', `/driver-applications/${row.rows[0]!.id}/approve`, { ...session, headers: { 'idempotency-key': randomUUID() } });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));

    const out = await send(h.t.app, 'POST', '/auth/logout', { cookie: session.cookie, csrf: session.csrf });
    assert.equal(out.status, 200, JSON.stringify(out.body));
  });

  test('identidade dos apps: cadastro, verificação, login, renovação, redefinição de senha e logout', async () => {
    const api = makeClient(h);
    const email = `papel-${randomUUID().slice(0, 8)}@teste.vuumbora.dev`; // aleatório: o banco persiste entre execuções
    const created = await api.register(email);
    const verified = await api.call('POST', '/v1/auth/verify-email', { body: { accountType: 'passenger', identifier: email, code: created.code, password: PASSWORD } });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));

    const login = await api.call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: email, password: PASSWORD, device: DEVICE } });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    const refreshed = await api.call('POST', '/v1/auth/refresh', { body: { refreshToken: login.body.data.refreshToken } });
    assert.equal(refreshed.status, 200, JSON.stringify(refreshed.body));
    const me = await api.call('GET', '/v1/auth/me', { bearer: refreshed.body.data.accessToken });
    assert.equal(me.status, 200);

    const forgot = await api.call('POST', '/v1/auth/forgot-password', { body: { accountType: 'passenger', email } });
    assert.equal(forgot.status, 200);
    await (await import('../src/lib/background-tasks.js')).drainBackgroundTasks();
    const reset = await api.call('POST', '/v1/auth/reset-password', { body: { accountType: 'passenger', email, code: h.mailbox.lastCode(email), newPassword: 'Nova-senha-9876' } });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));
    const again = await api.call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: email, password: 'Nova-senha-9876', device: DEVICE } });
    assert.equal(again.status, 200, JSON.stringify(again.body));

    const out = await api.call('POST', '/v1/auth/logout', { body: { refreshToken: again.body.data.refreshToken } });
    assert.equal(out.status, 200, JSON.stringify(out.body));
    const outAll = await api.call('POST', '/v1/auth/logout-all', { bearer: again.body.data.accessToken });
    assert.ok([200, 401].includes(outAll.status), 'logout-all (a sessão já foi encerrada acima)');
  });

  test('exclusão de conta (delete_account, SECURITY INVOKER) funciona COM o papel restrito: a API só tem UPDATE, nunca DELETE', async () => {
    const api = makeClient(h);
    const session = await api.registerAndLogin(`exclui-${randomUUID().slice(0, 8)}@teste.vuumbora.dev`);
    const deleted = await api.call('POST', '/v1/auth/delete-account', { bearer: session.accessToken, body: { password: PASSWORD } });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
    assert.deepEqual(deleted.body.data, { accountDeleted: true });
    assert.equal((await api.call('GET', '/v1/auth/me', { bearer: session.accessToken })).status, 401, 'a sessão caiu junto');
    const row = await owner.query<{ status: string; email: string }>('SELECT status, email FROM accounts WHERE email = $1', [session.email]);
    assert.equal(row.rowCount, 0, 'o e-mail de verdade não mora mais em accounts (foi anonimizado)');
  });

  test('recadastro sobre conta não verificada funciona COM o papel restrito (função SECURITY DEFINER da 0020), e a função não toca conta verificada', async () => {
    const api = makeClient(h);
    const email = `substitui-${randomUUID().slice(0, 8)}@teste.vuumbora.dev`;
    const first = await api.register(email, 'passenger', { password: 'Senha-do-invasor-1' });
    const second = await api.register(email, 'passenger', { password: 'Senha-da-dona-22' });
    assert.notEqual(first.account.id, second.account.id, 'a conta foi substituída (a API não tem DELETE: quem apaga é a função do dono)');
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM accounts WHERE email = $1', [email])).rows[0].n, 1);
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM account_consents WHERE account_id = $1', [second.account.id])).rows[0].n, 2);
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM account_consents WHERE account_id = $1', [first.account.id])).rows[0].n, 0);

    // A função, chamada pelo papel da API, recusa conta verificada e não deixa a API apagar outra coisa.
    // e-mail aleatório: o banco persiste entre execuções e o contador do kit repetiria e-mails já verificados
    const verified = await api.registerAndLogin(`verif-${randomUUID().slice(0, 8)}@teste.vuumbora.dev`);
    const reclaim = await pool.query<{ ok: boolean }>('SELECT reclaim_unverified_account($1, $2) AS ok', ['passenger', verified.email]);
    assert.equal(reclaim.rows[0]!.ok, false);
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM accounts WHERE email = $1', [verified.email])).rows[0].n, 1);
    const grants = await owner.query<{ api: boolean; pub: boolean }>(
      `SELECT has_function_privilege('vuumbora_api', 'reclaim_unverified_account(text, text)', 'EXECUTE') AS api,
              has_function_privilege('public', 'reclaim_unverified_account(text, text)', 'EXECUTE') AS pub`,
    );
    assert.deepEqual(grants.rows[0], { api: true, pub: false }, 'EXECUTE só para o papel da API');
  });

  test('banco de teste e app apontam para o mesmo banco (sanidade da fixture)', () => {
    assert.ok(env.DATABASE_URL.includes('options='), 'o app deve conectar com a opção de papel');
  });
});
