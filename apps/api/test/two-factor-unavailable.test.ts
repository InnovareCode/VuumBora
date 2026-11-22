import './helpers/no-key.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
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

test('sem ADMIN_TOTP_ENCRYPTION_KEY: dono recebe 503 e NENHUMA sessão (falha fechada)', async () => {
  const owner = await createAdmin('dono');
  const reply = await send(t.app, 'POST', '/auth/login', { body: { email: owner.email, password: PASSWORD } });
  assert.equal(reply.status, 503);
  assert.equal(reply.body.error.code, 'two_factor_unavailable');
  assert.equal(reply.sessionCookie, null);
});

test('sem a chave, papel com 2FA opcional continua entrando normalmente', async () => {
  const support = await createAdmin('suporte');
  const reply = await send(t.app, 'POST', '/auth/login', { body: { email: support.email, password: PASSWORD } });
  assert.equal(reply.status, 200);
  assert.ok(reply.sessionCookie);
});

test('sem a chave, mutação sensível (dono/financeiro, ponto 3 da revisão S1 rodada 3g) falha fechada (503), nunca aberta', async () => {
  // Sem `/auth/login` aqui: um dono JÁ logado antes da chave cair (ou via bypass, como este) é quem bate nesta
  // regra — login de dono já é bloqueado à parte (teste acima). `startAdminSession` dá a sessão direto, sem 2FA.
  const owner = await createAdmin('dono');
  const grant = await startAdminSession(pool, { id: owner.id, name: 'x', email: owner.email, role: 'dono' }, { ttlHours: 1, absoluteTtlHours: 2, ipAddress: '127.0.0.1', userAgent: 'test' });

  const email = `no-key-sensitive-${Date.now()}@teste.vuumbora.dev`;
  const created = await send(t.app, 'POST', '/users', {
    cookie: grant.rawToken,
    csrf: grant.csrfToken,
    body: { name: 'Sem Chave', email, role: 'dono', password: PASSWORD, code: '000000' },
  });
  assert.equal(created.status, 503, JSON.stringify(created.body));
  assert.equal(created.body.error.code, 'two_factor_unavailable');

  const row = await pool.query(`SELECT 1 FROM admin_users WHERE email = $1`, [email]);
  assert.equal(row.rowCount, 0, 'sem a chave de 2FA, nada deveria ter sido criado');
});
