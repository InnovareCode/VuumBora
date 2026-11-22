/**
 * Decisão do admin sobre candidatura de motorista (F-da9db50): aprovar e recusar, com CSRF, Idempotency-Key
 * obrigatório e a concorrência resolvida pela mesma query (`UPDATE ... WHERE status = 'pending'`).
 *
 * Passada 9 da Íris (aprovação com ressalva): estas rotas não tinham teste automatizado próprio — a prova era só
 * manual contra a API real. Este arquivo cobre o caminho feliz, idempotência, transição inválida, 404, motivo
 * curto, cabeçalho ausente e a corrida real (aprovar e recusar ao mesmo tempo a mesma candidatura).
 */
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { AdminRole } from '../src/domain/admin.js';
import { startAdminSession } from '../src/services/admin-auth-service.js';
import { createAdmin, pool, prepareDatabase, send, shutdown, startApp, type TestApp } from './helpers/harness.js';

let t: TestApp;
before(async () => {
  await prepareDatabase();
  t = await startApp();
});
after(async () => {
  await t.app.close();
  await shutdown();
});

/**
 * Sessão sem passar por login/2FA (mesmo bypass de `admin-user-management.test.ts`). `operacao` basta — a matriz
 * de acesso desta rota é `dono`/`operacao`, e `operacao` não exige 2FA, o que mantém o fixture simples.
 */
async function session(role: AdminRole = 'operacao', label?: string) {
  const admin = await createAdmin(role, label);
  const grant = await startAdminSession(pool, { id: admin.id, name: 'Admin Teste', email: admin.email, role }, { ttlHours: 1, absoluteTtlHours: 2, ipAddress: '127.0.0.1', userAgent: 'test' });
  return { admin, cookie: grant.rawToken, csrf: grant.csrfToken };
}

type Session = Awaited<ReturnType<typeof session>>;

/** Candidatura `pending` nova — mesmas colunas obrigatórias do formulário público (`driver_applications`, migração 0002). */
async function createApplication(label = 'cand'): Promise<{ readonly id: string; readonly email: string }> {
  const email = `${label}-${Math.random().toString(36).slice(2, 8)}@teste.vuumbora.dev`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO driver_applications (name, email, phone, city, state) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    ['Candidato Teste', email, '84988887777', 'Natal', 'RN'],
  );
  return { id: result.rows[0]!.id, email };
}

const approve = (s: Session, id: string, idempotencyKey: string = randomUUID()) =>
  send(t.app, 'POST', `/driver-applications/${id}/approve`, { cookie: s.cookie, csrf: s.csrf, headers: { 'idempotency-key': idempotencyKey } });

const reject = (s: Session, id: string, reason: string, idempotencyKey: string = randomUUID()) =>
  send(t.app, 'POST', `/driver-applications/${id}/reject`, { cookie: s.cookie, csrf: s.csrf, body: { reason }, headers: { 'idempotency-key': idempotencyKey } });

const REASON = 'Documentação incompleta no envio.';

describe('caminho feliz', () => {
  test('aprovar: 200, grava decidido por/quando, e audita', async () => {
    const admin = await session('operacao', 'approve-happy');
    const application = await createApplication('approve-happy');

    const reply = await approve(admin, application.id);
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.equal(reply.body.data.id, application.id);
    assert.equal(reply.body.data.status, 'approved');
    assert.equal(reply.body.data.decidedBy.id, admin.admin.id);
    assert.ok(reply.body.data.decidedAt);
    assert.equal(reply.body.data.decisionReason, undefined, 'aprovação não leva decisionReason no corpo');

    const audited = await pool.query(`SELECT action FROM admin_audit_log WHERE target_id = $1 AND action = 'driver_application.approved'`, [application.id]);
    assert.equal(audited.rowCount, 1);
  });

  test('recusar: 200 com decisionReason, e audita', async () => {
    const admin = await session('operacao', 'reject-happy');
    const application = await createApplication('reject-happy');

    const reply = await reject(admin, application.id, REASON);
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.equal(reply.body.data.status, 'rejected');
    assert.equal(reply.body.data.decisionReason, REASON);

    const audited = await pool.query(`SELECT after FROM admin_audit_log WHERE target_id = $1 AND action = 'driver_application.rejected'`, [application.id]);
    assert.equal(audited.rowCount, 1);
    assert.equal(audited.rows[0].after.reason, REASON);
  });
});

describe('repetição idempotente (mesma Idempotency-Key)', () => {
  test('repetir aprovar com a MESMA chave devolve a MESMA resposta, sem auditar de novo', async () => {
    const admin = await session('operacao', 'approve-replay');
    const application = await createApplication('approve-replay');
    const key = randomUUID();

    const first = await approve(admin, application.id, key);
    assert.equal(first.status, 200, JSON.stringify(first.body));

    const second = await approve(admin, application.id, key);
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.deepEqual(second.body.data, first.body.data);

    const audited = await pool.query(`SELECT count(*)::int AS n FROM admin_audit_log WHERE target_id = $1 AND action = 'driver_application.approved'`, [application.id]);
    assert.equal(audited.rows[0].n, 1, 'o replay não deveria gravar uma segunda auditoria');
  });

  test('repetir recusar com a MESMA chave devolve a MESMA resposta, sem auditar de novo', async () => {
    const admin = await session('operacao', 'reject-replay');
    const application = await createApplication('reject-replay');
    const key = randomUUID();

    const first = await reject(admin, application.id, REASON, key);
    assert.equal(first.status, 200, JSON.stringify(first.body));

    const second = await reject(admin, application.id, REASON, key);
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.deepEqual(second.body.data, first.body.data);

    const audited = await pool.query(`SELECT count(*)::int AS n FROM admin_audit_log WHERE target_id = $1 AND action = 'driver_application.rejected'`, [application.id]);
    assert.equal(audited.rows[0].n, 1);
  });
});

describe('transição inválida (409)', () => {
  test('aprovar quem já foi recusado: 409 invalid_transition', async () => {
    const admin = await session('operacao', 'invalid-transition-1');
    const application = await createApplication('invalid-transition-1');
    await reject(admin, application.id, REASON);

    const reply = await approve(admin, application.id);
    assert.equal(reply.status, 409, JSON.stringify(reply.body));
    assert.equal(reply.body.error.code, 'invalid_transition');
    assert.equal(reply.body.error.reason, 'invalid_transition');
  });

  test('repetir a MESMA ação com chave de idempotência DIFERENTE: 409 (não é replay)', async () => {
    const admin = await session('operacao', 'invalid-transition-2');
    const application = await createApplication('invalid-transition-2');
    await approve(admin, application.id, randomUUID());

    const reply = await approve(admin, application.id, randomUUID());
    assert.equal(reply.status, 409, JSON.stringify(reply.body));
    assert.equal(reply.body.error.code, 'invalid_transition');
  });
});

describe('404 e validação', () => {
  test('id inexistente: 404 not_found', async () => {
    const admin = await session('operacao', 'not-found');
    const reply = await approve(admin, '00000000-0000-4000-8000-000000000000');
    assert.equal(reply.status, 404, JSON.stringify(reply.body));
    assert.equal(reply.body.error.code, 'not_found');
  });

  test('motivo de recusa curto demais: 400 validation_failed, e nada muda', async () => {
    const admin = await session('operacao', 'short-reason');
    const application = await createApplication('short-reason');

    const reply = await reject(admin, application.id, 'curto');
    assert.equal(reply.status, 400, JSON.stringify(reply.body));
    assert.equal(reply.body.error.code, 'validation_failed');

    const row = await pool.query(`SELECT status FROM driver_applications WHERE id = $1`, [application.id]);
    assert.equal(row.rows[0].status, 'pending', 'motivo inválido não deveria ter decidido a candidatura');
  });

  test('sem o cabeçalho Idempotency-Key: 400 idempotency_key_required, e nada muda', async () => {
    const admin = await session('operacao', 'missing-header');
    const application = await createApplication('missing-header');

    const reply = await send(t.app, 'POST', `/driver-applications/${application.id}/approve`, { cookie: admin.cookie, csrf: admin.csrf });
    assert.equal(reply.status, 400, JSON.stringify(reply.body));
    assert.equal(reply.body.error.code, 'idempotency_key_required');

    const row = await pool.query(`SELECT status FROM driver_applications WHERE id = $1`, [application.id]);
    assert.equal(row.rows[0].status, 'pending');
  });
});

describe('concorrência real: aprovar e recusar ao mesmo tempo a mesma candidatura', () => {
  test('um 200, um 409, e exatamente UMA linha de auditoria', async () => {
    const admin = await session('operacao', 'race');
    const application = await createApplication('race');

    const [approved, rejected] = await Promise.all([approve(admin, application.id), reject(admin, application.id, REASON)]);

    const statuses = [approved.status, rejected.status].sort();
    assert.deepEqual(statuses, [200, 409], `esperado um 200 e um 409; veio ${JSON.stringify(statuses)} (aprovar=${JSON.stringify(approved.body)}, recusar=${JSON.stringify(rejected.body)})`);

    const loser = approved.status === 409 ? approved : rejected;
    assert.equal(loser.body.error.code, 'invalid_transition');

    const audited = await pool.query(`SELECT action FROM admin_audit_log WHERE target_id = $1 AND action IN ('driver_application.approved', 'driver_application.rejected')`, [application.id]);
    assert.equal(audited.rowCount, 1, 'só a decisão que venceu a corrida deveria auditar');

    // O estado final da candidatura bate com quem venceu (200), nunca com um meio-termo.
    const row = await pool.query<{ status: string }>(`SELECT status FROM driver_applications WHERE id = $1`, [application.id]);
    const winner = approved.status === 200 ? 'approved' : 'rejected';
    assert.equal(row.rows[0]!.status, winner);
  });
});
