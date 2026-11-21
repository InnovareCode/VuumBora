/**
 * Invariantes que o BANCO e a camada de dados garantem sozinhos, provados direto
 * (sem passar pela rota). Existem porque a Íris fez mutação nessas regras e a
 * suíte inteira continuava verde sem elas — cada teste abaixo mata uma mutação
 * que sobreviveu (ver docs/veredito-iris-s1.md):
 *  - gatilho que impede sessão para conta sem e-mail verificado (camada 2: o serviço é a 1ª);
 *  - trilha de auditoria inviolável (UPDATE/DELETE/TRUNCATE recusados — o gatilho NUNCA é desligado aqui);
 *  - token de enrolamento de uso único sob concorrência (o UPDATE atômico é o portão);
 *  - o contador de erros do TOTP recomeça do zero depois do bloqueio.
 */
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { markTotpFailure } from '../src/repositories/admin-two-factor-repository.js';
import { consumeEnrollmentToken } from '../src/repositories/admin-enrollment-token-repository.js';
import { hashEnrollmentToken, issueEnrollmentToken } from '../src/services/admin-enrollment-token-service.js';
import { createAdmin, pool, prepareDatabase, shutdown } from './helpers/harness.js';

before(prepareDatabase);
after(shutdown);

async function newAccount(verified: boolean): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO accounts (account_type, email, email_verified_at, full_name, birth_date) VALUES ('passenger', $1, $2, 'Invariante', '1990-01-01')  RETURNING id`,
    [`inv-${randomUUID()}@teste.vuumbora.dev`, verified ? new Date() : null],
  );
  return r.rows[0]!.id;
}

describe('conta sem e-mail verificado nunca abre sessão — também no banco', () => {
  test('o gatilho recusa a família de renovação de conta não verificada (23514) e aceita a de conta verificada', async () => {
    const pending = await newAccount(false);
    await assert.rejects(
      pool.query(`INSERT INTO refresh_token_families (account_id, expires_at) VALUES ($1, now() + interval '1 day')`, [pending]),
      (err: { code?: string }) => err.code === '23514',
    );
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM refresh_token_families WHERE account_id = $1`, [pending])).rows[0].n, 0);

    const verified = await newAccount(true);
    await pool.query(`INSERT INTO refresh_token_families (account_id, expires_at) VALUES ($1, now() + interval '1 day')`, [verified]);
  });
});

describe('trilha de auditoria inviolável (gatilho ativo; este teste não o desliga)', () => {
  test('UPDATE, DELETE e TRUNCATE em admin_audit_log são recusados com 42501 e a linha continua igual', async () => {
    const admin = await createAdmin('suporte');
    const row = await pool.query<{ id: string }>(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id) VALUES ($1, 'teste.invariante', 'admin_user', $2) RETURNING id`,
      [admin.id, admin.id],
    );
    const id = row.rows[0]!.id;
    for (const sql of [
      `UPDATE admin_audit_log SET action = 'adulterado' WHERE id = '${id}'`,
      `DELETE FROM admin_audit_log WHERE id = '${id}'`,
      `TRUNCATE admin_audit_log`,
    ]) {
      await assert.rejects(pool.query(sql), (err: { code?: string }) => err.code === '42501', sql);
    }
    assert.equal((await pool.query(`SELECT action FROM admin_audit_log WHERE id = $1`, [id])).rows[0].action, 'teste.invariante');
  });
});

describe('token de enrolamento: uso único sob concorrência', () => {
  test('8 chamadas simultâneas gastam o MESMO token uma vez só; depois, nunca mais; token de outro admin não vale', async () => {
    const admin = await createAdmin('dono');
    const other = await createAdmin('financeiro');
    const { token } = await issueEnrollmentToken(pool, admin.id);
    const hash = hashEnrollmentToken(token);

    const results = await Promise.all(Array.from({ length: 8 }, () => consumeEnrollmentToken(pool, admin.id, hash)));
    assert.equal(results.filter(Boolean).length, 1, `exatamente um consumo (${results.join(',')})`);
    assert.equal(await consumeEnrollmentToken(pool, admin.id, hash), false, 'depois de gasto, nunca mais');
    assert.equal(await consumeEnrollmentToken(pool, other.id, hash), false, 'token de um admin não serve a outro');
  });

  test('token vencido não é consumido', async () => {
    const admin = await createAdmin('dono');
    const { token } = await issueEnrollmentToken(pool, admin.id);
    await pool.query(`UPDATE admin_enrollment_tokens SET expires_at = now() - interval '1 second' WHERE admin_id = $1`, [admin.id]);
    assert.equal(await consumeEnrollmentToken(pool, admin.id, hashEnrollmentToken(token)), false);
  });
});

describe('TOTP: contador de erros', () => {
  test('o 5º erro trava e ZERA o contador; passado o bloqueio, 4 erros não travam de novo (só o 5º)', async () => {
    const admin = await createAdmin('dono');
    await pool.query(`INSERT INTO admin_totp (admin_id, secret_encrypted, confirmed_at) VALUES ($1, 'v1.segredo-de-teste', now())`, [admin.id]);
    const state = async () => (await pool.query(`SELECT failed_attempts, locked_until FROM admin_totp WHERE admin_id = $1`, [admin.id])).rows[0];

    for (let i = 1; i <= 4; i += 1) assert.equal((await markTotpFailure(pool, admin.id, 5, 15)).locked, false, `erro ${i} ainda não trava`);
    assert.equal((await state()).failed_attempts, 4);
    const fifth = await markTotpFailure(pool, admin.id, 5, 15);
    assert.equal(fifth.locked, true);
    assert.ok(fifth.lockedForSeconds > 0 && fifth.lockedForSeconds <= 15 * 60);
    assert.equal((await state()).failed_attempts, 0, 'travou: o contador recomeça do zero');

    // O bloqueio vence: começa do zero, então 4 erros seguidos NÃO travam.
    await pool.query(`UPDATE admin_totp SET locked_until = now() - interval '1 second' WHERE admin_id = $1`, [admin.id]);
    for (let i = 1; i <= 4; i += 1) assert.equal((await markTotpFailure(pool, admin.id, 5, 15)).locked, false, `depois do bloqueio, erro ${i} não trava`);
    assert.equal((await markTotpFailure(pool, admin.id, 5, 15)).locked, true, 'o 5º trava de novo');
  });
});
