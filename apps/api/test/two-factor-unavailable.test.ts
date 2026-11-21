import './helpers/no-key.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PASSWORD, createAdmin, prepareDatabase, send, shutdown, startApp, type TestApp } from './helpers/harness.js';

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
