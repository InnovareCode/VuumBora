/**
 * Gestão de usuários do painel (F07): listar, criar, desativar, reativar, trocar papel — só `dono` — e o primeiro
 * acesso de quem é criado (ativação por token, reaproveitando o mecanismo da 0016).
 */
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { AdminRole } from '../src/domain/admin.js';
import { encryptSecret, parseEncryptionKey } from '../src/lib/secret-box.js';
import { base32Encode } from '../src/lib/totp.js';
import { startAdminSession } from '../src/services/admin-auth-service.js';
import { PASSWORD, createAdmin, pool, prepareDatabase, send, shutdown, startApp, type TestApp } from './helpers/harness.js';

let t: TestApp;
before(async () => {
  await prepareDatabase();
  t = await startApp();
});
after(async () => {
  await t.app.close();
  await shutdown();
});

const TOTP_SECRET = Buffer.alloc(20, 9);
const KEY = parseEncryptionKey(Buffer.alloc(32, 7).toString('base64')); // mesma chave padrão de `helpers/setup.ts`

/** Sessão com 2FA JÁ confirmado — bypassa login/2FA (mesmo padrão de `email-settings.test.ts`), já que `dono` exige 2FA. */
async function session(role: AdminRole = 'dono', label?: string) {
  const admin = await createAdmin(role, label);
  await pool.query(`INSERT INTO admin_totp (admin_id, secret_encrypted, confirmed_at) VALUES ($1, $2, now())`, [admin.id, encryptSecret(base32Encode(TOTP_SECRET), KEY, admin.id)]);
  const grant = await startAdminSession(pool, { id: admin.id, name: 'x', email: admin.email, role }, { ttlHours: 1, absoluteTtlHours: 2, ipAddress: '127.0.0.1', userAgent: 'test' });
  return { admin, cookie: grant.rawToken, csrf: grant.csrfToken };
}

type Session = Awaited<ReturnType<typeof session>>;

const get = (s: Session, url: string) => send(t.app, 'GET', url, { cookie: s.cookie });
const post = (s: Session, url: string, body: unknown) => send(t.app, 'POST', url, { cookie: s.cookie, csrf: s.csrf, body });
const postNoCsrf = (s: Session, url: string, body: unknown) => send(t.app, 'POST', url, { cookie: s.cookie, body });

describe('autorização por papel: só dono', () => {
  test('os outros quatro papéis recebem 403 em listar e criar', async () => {
    for (const role of ['operacao', 'revisor_documentos', 'financeiro', 'suporte'] as const) {
      const s = await session(role, `papel-${role}`);
      const listed = await get(s, '/users');
      assert.equal(listed.status, 403, `${role}: listar`);
      assert.equal(listed.body.error.code, 'forbidden');

      const created = await post(s, '/users', { name: 'Alguém', email: `x-${role}@teste.vuumbora.dev`, role: 'suporte', password: PASSWORD });
      assert.equal(created.status, 403, `${role}: criar`);
    }
  });

  test('dono passa', async () => {
    const owner = await session('dono', 'owner-list');
    const listed = await get(owner, '/users');
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    assert.ok(Array.isArray(listed.body.data.items));
  });
});

describe('criar', () => {
  test('cria com sucesso, devolve activationToken uma única vez, e audita', async () => {
    const owner = await session('dono', 'owner-create');
    const email = `novo-${Date.now()}@teste.vuumbora.dev`;
    const created = await post(owner, '/users', { name: 'Pessoa Nova', email, role: 'suporte', password: PASSWORD });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.email, email);
    assert.equal(created.body.data.role, 'suporte');
    assert.equal(created.body.data.deactivatedAt, null);
    assert.ok(typeof created.body.data.activationToken === 'string' && created.body.data.activationToken.length > 10);

    const audited = await pool.query(`SELECT action FROM admin_audit_log WHERE target_id = $1 AND action = 'admin.user.created'`, [created.body.data.id]);
    assert.equal(audited.rowCount, 1);
  });

  test('e-mail duplicado: 409 email_taken', async () => {
    const owner = await session('dono', 'owner-dup');
    const email = `dup-${Date.now()}@teste.vuumbora.dev`;
    const first = await post(owner, '/users', { name: 'Pessoa A', email, role: 'suporte', password: PASSWORD });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const second = await post(owner, '/users', { name: 'Pessoa B', email, role: 'suporte', password: PASSWORD });
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'email_taken');
  });

  test('senha do ator errada: 401 password_invalid; sem CSRF: 403', async () => {
    const owner = await session('dono', 'owner-badpw');
    const wrongPassword = await post(owner, '/users', { name: 'Pessoa A', email: `x-${Date.now()}@teste.vuumbora.dev`, role: 'suporte', password: 'senha-errada-123' });
    assert.equal(wrongPassword.status, 401, JSON.stringify(wrongPassword.body));
    assert.equal(wrongPassword.body.error.code, 'password_invalid');

    const noCsrf = await postNoCsrf(owner, '/users', { name: 'Pessoa A', email: `x2-${Date.now()}@teste.vuumbora.dev`, role: 'suporte', password: PASSWORD });
    assert.equal(noCsrf.status, 403);
    assert.equal(noCsrf.body.error.code, 'csrf_token_invalid');
  });
});

describe('primeiro acesso (ativação)', () => {
  test('token certo define a senha; papel sem 2FA obrigatório consegue logar direto', async () => {
    const owner = await session('dono', 'owner-activate-1');
    const email = `ativa-${Date.now()}@teste.vuumbora.dev`;
    const created = await post(owner, '/users', { name: 'Ativa', email, role: 'suporte', password: PASSWORD });
    assert.equal(created.status, 201);
    const token = created.body.data.activationToken as string;

    const activated = await send(t.app, 'POST', '/auth/activate', { body: { email, token, newPassword: 'Senha-Nova-Definida-1' } });
    assert.equal(activated.status, 200, JSON.stringify(activated.body));
    assert.equal(activated.body.data.role, 'suporte');
    assert.equal(activated.body.data.requiresTwoFactorEnrollment, false);
    assert.equal(activated.body.data.enrollmentToken, undefined);

    const login = await send(t.app, 'POST', '/auth/login', { body: { email, password: 'Senha-Nova-Definida-1' } });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.ok(login.sessionCookie);
  });

  test('papel que exige 2FA (financeiro) recebe o enrollmentToken JUNTO na ativação, e o login seguinte pede enrolamento', async () => {
    const owner = await session('dono', 'owner-activate-2');
    const email = `ativa-fin-${Date.now()}@teste.vuumbora.dev`;
    const created = await post(owner, '/users', { name: 'Financeira', email, role: 'financeiro', password: PASSWORD });
    const token = created.body.data.activationToken as string;

    const activated = await send(t.app, 'POST', '/auth/activate', { body: { email, token, newPassword: 'Senha-Nova-Definida-2' } });
    assert.equal(activated.status, 200, JSON.stringify(activated.body));
    assert.equal(activated.body.data.requiresTwoFactorEnrollment, true);
    assert.ok(typeof activated.body.data.enrollmentToken === 'string' && activated.body.data.enrollmentToken.length > 10);

    const login = await send(t.app, 'POST', '/auth/login', { body: { email, password: 'Senha-Nova-Definida-2' } });
    assert.equal(login.status, 200);
    assert.equal(login.body.data.status, 'enrollment_required');
    assert.equal(login.sessionCookie, null);
  });

  test('token errado, vencido-por-reuso, e e-mail inexistente: sempre a MESMA resposta (sem oráculo)', async () => {
    const owner = await session('dono', 'owner-activate-3');
    const email = `ativa-reuso-${Date.now()}@teste.vuumbora.dev`;
    const created = await post(owner, '/users', { name: 'Reuso', email, role: 'suporte', password: PASSWORD });
    const token = created.body.data.activationToken as string;

    const wrongToken = await send(t.app, 'POST', '/auth/activate', { body: { email, token: 'TOKEN-ERRADO-QUALQUER', newPassword: 'Senha-Nova-Definida-3' } });
    assert.equal(wrongToken.status, 400);
    assert.equal(wrongToken.body.error.code, 'activation_token_invalid');

    const inexistente = await send(t.app, 'POST', '/auth/activate', { body: { email: 'nao-existe-nenhum@teste.vuumbora.dev', token, newPassword: 'Senha-Nova-Definida-3' } });
    assert.equal(inexistente.status, 400);
    assert.equal(inexistente.body.error.code, 'activation_token_invalid');

    const ok = await send(t.app, 'POST', '/auth/activate', { body: { email, token, newPassword: 'Senha-Nova-Definida-3' } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));

    // Reusar o MESMO token depois de já ter sido gasto: também inválido (uso único).
    const reused = await send(t.app, 'POST', '/auth/activate', { body: { email, token, newPassword: 'Outra-Senha-Qualquer-4' } });
    assert.equal(reused.status, 400);
    assert.equal(reused.body.error.code, 'activation_token_invalid');
  });
});

describe('desativar / reativar: idempotente, derruba sessão', () => {
  test('desativa, é idempotente (sem auditar de novo), derruba sessão existente, e reativa', async () => {
    const owner = await session('dono', 'owner-deactivate');
    const targetSession = await session('suporte', 'target-deactivate');

    // A sessão do alvo funciona ANTES de ser desativado.
    assert.equal((await get(targetSession, '/me')).status, 200);

    const first = await post(owner, `/users/${targetSession.admin.id}/deactivate`, { password: PASSWORD });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.ok(first.body.data.deactivatedAt);

    // A sessão que o alvo tinha ANTES de ser desativado não serve mais.
    assert.equal((await get(targetSession, '/me')).status, 401);

    const second = await post(owner, `/users/${targetSession.admin.id}/deactivate`, { password: PASSWORD });
    assert.equal(second.status, 200);
    const audited = await pool.query(`SELECT count(*)::int AS n FROM admin_audit_log WHERE target_id = $1 AND action = 'admin.user.deactivated'`, [targetSession.admin.id]);
    assert.equal(audited.rows[0].n, 1, 'a segunda chamada (idempotente) não deveria auditar de novo');

    const reactivated = await post(owner, `/users/${targetSession.admin.id}/reactivate`, { password: PASSWORD });
    assert.equal(reactivated.status, 200);
    assert.equal(reactivated.body.data.deactivatedAt, null);
  });

  test('id inexistente: 404', async () => {
    const owner = await session('dono', 'owner-404');
    const reply = await post(owner, `/users/00000000-0000-4000-8000-000000000000/deactivate`, { password: PASSWORD });
    assert.equal(reply.status, 404);
  });
});

describe('último dono ativo: nunca pode ficar sem nenhum', () => {
  test('desativar ou rebaixar o ÚNICO dono ativo é recusado (409 last_owner)', async () => {
    const owner = await session('dono', 'owner-last');
    // Torna este dono o ÚNICO ativo no banco — determinístico, independe do que outros arquivos de teste deixaram
    // para trás (banco de teste descartável desta tarefa, nunca compartilhado com produção).
    await pool.query(`UPDATE admin_users SET deactivated_at = now() WHERE role = 'dono' AND deactivated_at IS NULL AND id <> $1`, [owner.admin.id]);

    const deactivated = await post(owner, `/users/${owner.admin.id}/deactivate`, { password: PASSWORD });
    assert.equal(deactivated.status, 409, JSON.stringify(deactivated.body));
    assert.equal(deactivated.body.error.code, 'last_owner');

    const demoted = await post(owner, `/users/${owner.admin.id}/role`, { role: 'suporte', password: PASSWORD });
    assert.equal(demoted.status, 409);
    assert.equal(demoted.body.error.code, 'last_owner');
  });

  test('com outro dono ativo, desativar/rebaixar funciona normalmente', async () => {
    const owner = await session('dono', 'owner-notlast');
    const other = await createAdmin('dono', 'other-dono');

    const deactivated = await post(owner, `/users/${other.id}/deactivate`, { password: PASSWORD });
    assert.equal(deactivated.status, 200, JSON.stringify(deactivated.body));

    const target2 = await createAdmin('dono', 'other-dono-2');
    const demoted = await post(owner, `/users/${target2.id}/role`, { role: 'operacao', password: PASSWORD });
    assert.equal(demoted.status, 200, JSON.stringify(demoted.body));
    assert.equal(demoted.body.data.role, 'operacao');

    const audited = await pool.query(`SELECT before, after FROM admin_audit_log WHERE target_id = $1 AND action = 'admin.user.role_changed'`, [target2.id]);
    assert.equal(audited.rowCount, 1);
    assert.deepEqual(audited.rows[0].before, { role: 'dono' });
    assert.deepEqual(audited.rows[0].after, { role: 'operacao' });
  });

  test('trocar para o MESMO papel é idempotente (sem auditar de novo, sem acionar a trava)', async () => {
    const owner = await session('dono', 'owner-same-role');
    const target = await createAdmin('suporte', 'same-role-target');
    const first = await post(owner, `/users/${target.id}/role`, { role: 'suporte', password: PASSWORD });
    assert.equal(first.status, 200);
    const audited = await pool.query(`SELECT count(*)::int AS n FROM admin_audit_log WHERE target_id = $1 AND action = 'admin.user.role_changed'`, [target.id]);
    assert.equal(audited.rows[0].n, 0, 'trocar para o papel que já era não deveria gerar auditoria');
  });
});
