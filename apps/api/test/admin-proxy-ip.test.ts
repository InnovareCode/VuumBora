/**
 * Achado A-1: `TRUST_PROXY` confiava em qualquer `X-Forwarded-For`, então o
 * atacante escolhia o próprio IP a cada requisição e o limite por IP não valia.
 */
import './helpers/ip-limit-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import { accountKey } from '../src/repositories/admin-login-failure-repository.js';
import { parseTrustProxy } from '../src/lib/trust-proxy.js';
import { PASSWORD, pool, prepareDatabase, send, shutdown, startApp, type TestApp } from './helpers/harness.js';

describe('parseTrustProxy', () => {
  test('nunca devolve "confie em tudo"; padrão e `true` viram 1 salto', () => {
    for (const raw of [undefined, '', 'true', 'TRUE', '1']) {
      const setting = parseTrustProxy(raw);
      assert.equal(typeof setting, 'function', `${String(raw)} -> função de saltos, não boolean`);
      const trusts = setting as (address: string, hop: number) => boolean;
      assert.equal(trusts('10.0.0.1', 0), true, 'confia no vizinho direto');
      assert.equal(trusts('1.2.3.4', 1), false, 'não confia no que vem depois do primeiro salto');
    }
    assert.notEqual(parseTrustProxy('true'), true);
  });

  test('número de saltos, false, lista de CIDR e formatos inválidos', () => {
    const two = parseTrustProxy('2') as (address: string, hop: number) => boolean;
    assert.equal(two('x', 1), true);
    assert.equal(two('x', 2), false);
    assert.equal(parseTrustProxy('false'), false);
    assert.equal(parseTrustProxy('0'), false);
    assert.deepEqual(parseTrustProxy('10.0.0.0/8, 172.16.0.0/12,::1'), ['10.0.0.0/8', '172.16.0.0/12', '::1']);
    for (const bad of ['11', '999', 'abc', '10.0.0.0/33', '10.0.0.0/8/1', '1.2.3', ',']) {
      assert.throws(() => parseTrustProxy(bad), /TRUST_PROXY/, `deveria recusar ${bad}`);
    }
  });
});

let t: TestApp;
before(prepareDatabase);
after(shutdown);
beforeEach(async () => {
  t = await startApp();
});
afterEach(() => t.app.close());

describe('X-Forwarded-For forjado não escolhe o IP', () => {
  const attempt = (email: string, forwardedFor: string) =>
    send(t.app, 'POST', '/auth/login', { body: { email, password: 'errada-123456' }, headers: { 'x-forwarded-for': forwardedFor } });

  test('o limite por IP vale mesmo com um IP falso à esquerda a cada requisição (6ª = 429)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      // O cliente escreve o IP falso; o proxy de borda ACRESCENTA o IP real (198.51.100.7) à direita.
      const reply = await attempt(`nao-existe-${i}-${Math.random().toString(36).slice(2, 6)}@teste.vuumbora.dev`, `203.0.113.${i + 1}, 198.51.100.7`);
      statuses.push(reply.status);
    }
    assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);
  });

  test('o IP gravado na tentativa é o do proxy de borda, não o escrito pelo cliente', async () => {
    const email = `ip-${Math.random().toString(36).slice(2, 8)}@teste.vuumbora.dev`;
    await attempt(email, '203.0.113.99, 198.51.100.7');
    const row = await pool.query<{ ip_address: string }>('SELECT ip_address FROM admin_login_failures WHERE email_hash = $1', [accountKey(email)]);
    assert.equal(row.rows[0]!.ip_address, '198.51.100.7');
    assert.ok(PASSWORD);
  });
});
