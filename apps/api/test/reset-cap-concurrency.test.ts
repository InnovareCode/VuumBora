/**
 * Teto CUMULATIVO de falhas do código de redefinição de senha (migração 0018, achado I-7), com várias
 * conexões: as falhas dos códigos de redefinição da conta nas últimas 24 h se somam; atingido o teto,
 * nem o código certo passa e nenhuma tentativa é gasta. A soma é lida depois do lock da linha do
 * código vivo, então chutes simultâneos não driblam o teto.
 */
import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { after, before, describe, test } from 'node:test';
import { env } from '../src/env.js';
import { pool, prepareDatabase, shutdown } from './helpers/harness.js';

const OLD_HASH = `$2b$04$${'a'.repeat(53)}`;
const sha = (label: string) => createHash('sha256').update(label).digest('hex');
const codeHash = (accountId: string, purpose: string, code: string) => sha(`${accountId}|${purpose}|${code}`);
const CONSUME = 'SELECT * FROM consume_email_code($1::uuid, $2::text, $3::text, $4::int)';
const RESET = 'SELECT * FROM reset_password_with_code($1::uuid, $2::text, $3::text, $4::text, $5::int)';

before(prepareDatabase);
after(shutdown);

async function newAccount(verified = true): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO accounts (account_type, email, email_verified_at, full_name, birth_date)
     VALUES ('passenger', $1, $2, 'Teto Teste', '1990-01-01') RETURNING id`,
    [`cap-${randomUUID()}@teste.vuumbora.dev`, verified ? new Date() : null],
  );
  const id = r.rows[0]!.id;
  await pool.query(`INSERT INTO account_credentials (account_id, password_hash) VALUES ($1, $2)`, [id, OLD_HASH]);
  return id;
}

async function liveCode(accountId: string, purpose: 'verify_email' | 'password_reset', code: string): Promise<void> {
  await pool.query(`INSERT INTO account_email_codes (account_id, purpose, code_hash, expires_at) VALUES ($1, $2, $3, now() + interval '15 minutes')`, [accountId, purpose, codeHash(accountId, purpose, code)]);
}

/** Códigos de redefinição JÁ FECHADOS, com `attempts` erros cada, criados `hoursAgo` horas atrás. */
async function spentCodes(accountId: string, attemptsEach: number[], hoursAgo = 1): Promise<void> {
  for (const [i, attempts] of attemptsEach.entries()) {
    await pool.query(
      `INSERT INTO account_email_codes (account_id, purpose, code_hash, created_at, expires_at, attempts, closed_at, close_reason)
       VALUES ($1, 'password_reset', $2, now() - make_interval(hours => $3::int), now() - make_interval(hours => $3::int) + interval '15 minutes', $4,
               now() - make_interval(hours => $3::int) + interval '10 minutes', 'too_many_attempts')`,
      [accountId, sha(`gasto-${i}-${randomUUID()}`), hoursAgo, attempts],
    );
  }
}

describe('teto cumulativo de falhas do código de redefinição (24 h, por conta)', () => {
  test('teto atingido: nem o código CERTO passa (account_locked), sem gastar tentativa; a senha não muda; sem o parâmetro o código vale', async () => {
    const accountId = await newAccount();
    await spentCodes(accountId, [5, 5]);
    await liveCode(accountId, 'password_reset', '654321');
    const right = codeHash(accountId, 'password_reset', '654321');

    assert.equal((await pool.query(CONSUME, [accountId, 'password_reset', right, 10])).rows[0].outcome, 'account_locked');
    const reset = await pool.query(RESET, [accountId, right, `$2b$04$${'n'.repeat(53)}`, 'bcrypt', 10]);
    assert.equal(reset.rows[0].outcome, 'account_locked');
    const live = (await pool.query(`SELECT attempts FROM account_email_codes WHERE account_id = $1 AND closed_at IS NULL`, [accountId])).rows[0];
    assert.equal(live.attempts, 0, 'nenhuma tentativa gasta');
    assert.equal((await pool.query(`SELECT password_hash FROM account_credentials WHERE account_id = $1`, [accountId])).rows[0].password_hash, OLD_HASH);
    assert.equal((await pool.query(CONSUME, [accountId, 'password_reset', right, null])).rows[0].outcome, 'ok', 'o bloqueio vem do parâmetro de teto');
  });

  test('falhas com mais de 24 h não contam: o teto rola com a janela', async () => {
    const accountId = await newAccount();
    await spentCodes(accountId, [5, 5], 30);
    await liveCode(accountId, 'password_reset', '654321');
    assert.equal((await pool.query(CONSUME, [accountId, 'password_reset', codeHash(accountId, 'password_reset', '654321'), 10])).rows[0].outcome, 'ok');
  });

  test('ESTRESSE: com 9 falhas no dia, 12 chutes errados simultâneos gastam UMA tentativa e 11 viram account_locked (8 rodadas)', async () => {
    const conns = await Promise.all(Array.from({ length: 12 }, async () => {
      const client = new pg.Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      return client;
    }));
    try {
      for (let round = 0; round < 8; round += 1) {
        const accountId = await newAccount();
        await spentCodes(accountId, [5, 4]);
        await liveCode(accountId, 'password_reset', '654321');
        const wrong = codeHash(accountId, 'password_reset', '000000');
        const outcomes = await Promise.all(conns.map((c) => c.query(CONSUME, [accountId, 'password_reset', wrong, 10]).then((r) => r.rows[0].outcome as string, () => 'erro')));
        assert.equal(outcomes.filter((o) => o === 'invalid').length, 1, `rodada ${round}: ${outcomes.join(',')}`);
        assert.equal(outcomes.filter((o) => o === 'account_locked').length, 11, `rodada ${round}: ${outcomes.join(',')}`);
        const total = (await pool.query(`SELECT sum(attempts)::int AS n FROM account_email_codes WHERE account_id = $1 AND purpose = 'password_reset'`, [accountId])).rows[0].n;
        assert.equal(total, 10, 'o total de falhas do dia para exatamente no teto');
      }
    } finally {
      await Promise.all(conns.map((c) => c.end().catch(() => undefined)));
    }
  });

  test('o teto vale só para redefinição: a verificação de e-mail não é afetada por falhas de redefinição', async () => {
    const accountId = await newAccount(false);
    await spentCodes(accountId, [5, 5]);
    await liveCode(accountId, 'verify_email', '123456');
    assert.equal((await pool.query(CONSUME, [accountId, 'verify_email', codeHash(accountId, 'verify_email', '123456'), 10])).rows[0].outcome, 'ok');
  });
});
