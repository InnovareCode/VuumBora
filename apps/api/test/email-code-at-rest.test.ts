/**
 * O código de e-mail nunca fica em claro: o banco guarda HMAC-SHA256(pepper, finalidade|conta|código),
 * recalculado AQUI de forma independente (não importa `hashEmailCode` do código de produção — se
 * importasse, trocar o hash por "o próprio código" faria o teste passar junto; a Íris provou isso por
 * mutação: a suíte inteira seguia verde).
 */
import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, beforeEach, afterEach, describe, test } from 'node:test';
import { drainBackgroundTasks } from '../src/lib/background-tasks.js';
import { pool, prepareDatabase, shutdown } from './helpers/harness.js';
import { makeClient, PEPPER, startIdentityApp, type Harness } from './helpers/identity-kit.js';

let h: Harness;
let client: ReturnType<typeof makeClient>;
before(prepareDatabase);
after(shutdown);
beforeEach(async () => {
  h = await startIdentityApp();
  client = makeClient(h);
});
afterEach(() => h.t.app.close());

const independentHash = (purpose: string, accountId: string, code: string) =>
  createHmac('sha256', PEPPER).update(`${purpose}|${accountId}|${code}`).digest('hex');

describe('código de e-mail em repouso', () => {
  test('verificação: code_hash é o HMAC independente (e não o código, nem preenchido com zeros)', async () => {
    const created = await client.register();
    const row = (await pool.query(`SELECT purpose, code_hash FROM account_email_codes WHERE account_id = $1`, [created.account.id])).rows[0];
    assert.equal(row.purpose, 'verify_email');
    assert.equal(row.code_hash, independentHash('verify_email', created.account.id, created.code));
    assert.ok(!row.code_hash.includes(created.code), 'o código não aparece dentro do hash armazenado');
    assert.notEqual(row.code_hash, created.code.padStart(64, '0'));
  });

  test('redefinição de senha: idem, com a finalidade amarrada no hash', async () => {
    const verified = await client.registerAndLogin();
    const accountId = verified.account.id as string;
    await pool.query(`UPDATE account_email_codes SET closed_at = now(), close_reason = 'used' WHERE account_id = $1 AND closed_at IS NULL`, [accountId]);
    const res = await client.call('POST', '/v1/auth/forgot-password', { body: { accountType: 'passenger', email: verified.email } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    await drainBackgroundTasks();
    const code = h.mailbox.lastCode(verified.email);
    const row = (await pool.query(`SELECT purpose, code_hash FROM account_email_codes WHERE account_id = $1 AND closed_at IS NULL`, [accountId])).rows[0];
    assert.equal(row.purpose, 'password_reset');
    assert.equal(row.code_hash, independentHash('password_reset', accountId, code));
    assert.notEqual(row.code_hash, independentHash('verify_email', accountId, code), 'o mesmo código em outra finalidade dá outro hash');
  });
});
