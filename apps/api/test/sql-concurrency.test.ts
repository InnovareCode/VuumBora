/**
 * Concorrência REAL no banco: `rotate_refresh_token`, `consume_email_code`,
 * `reset_password_with_code` e `issue_email_code` chamadas por VÁRIAS CONEXÕES
 * independentes (um `pg.Client` por chamador, não o pool da aplicação).
 *
 * Duas famílias de prova, de propósito:
 *  - ESTRESSE: N conexões disparam no mesmo instante; o que vale é o invariante
 *    (uma só rotação/uso, contagem de tentativas exata). Sozinho NÃO prova o
 *    lock — o Postgres local pode serializar por acaso (a Vega já mediu isso).
 *  - DETERMINÍSTICO: a conexão A segura a transação aberta, a conexão B tem de
 *    FICAR ESPERANDO (conferido em `pg_stat_activity`, sem `sleep` cego) e,
 *    quando A confirma, B tem de enxergar o resultado de A. Sem `FOR UPDATE`
 *    na função, B leria o estado antigo e este teste falha (mutação feita pela
 *    Íris em cópia do projeto, ver docs/veredito-iris-s1.md).
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
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Conn {
  readonly client: pg.Client;
  readonly pid: number;
}

async function openConns(n: number): Promise<Conn[]> {
  return Promise.all(
    Array.from({ length: n }, async () => {
      const client = new pg.Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      const pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      return { client, pid };
    }),
  );
}
const closeConns = (conns: Conn[]) => Promise.all(conns.map((c) => c.client.end().catch(() => undefined)));

type Settled<T> = { ok: true; rows: T[] } | { ok: false; code: string | undefined; message: string };

/** Dispara a MESMA consulta em todas as conexões no mesmo tick; erro vira resultado (não rejeita). */
function fireAll<T = Record<string, any>>(conns: Conn[], sql: string, params: (i: number) => unknown[]): Promise<Settled<T>[]> {
  return Promise.all(
    conns.map((c, i) =>
      c.client.query(sql, params(i)).then(
        (r) => ({ ok: true as const, rows: r.rows as T[] }),
        (err: { code?: string; message: string }) => ({ ok: false as const, code: err.code, message: err.message }),
      ),
    ),
  );
}

/** Espera (sem tempo fixo) o backend `pid` aparecer bloqueado num lock; falha se isso não acontecer em 5 s. */
async function waitUntilBlocked(pid: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const r = await pool.query<{ wait_event_type: string | null }>('SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1', [pid]);
    if (r.rows[0]?.wait_event_type === 'Lock') return;
    await sleep(15);
  }
  assert.fail(`a conexão ${pid} não ficou esperando o lock: a função não serializa quem chama junto`);
}

async function newAccount(options: { verified?: boolean; status?: string } = {}): Promise<string> {
  const { verified = true, status = 'active' } = options;
  const email = `conc-${randomUUID()}@teste.vuumbora.dev`;
  const deleted = status === 'deleted';
  const r = await pool.query<{ id: string }>(
    `INSERT INTO accounts (account_type, email, email_verified_at, full_name, status, deleted_at, birth_date)
     VALUES ('passenger', $1, $2, 'Conc Teste', $3, $4, '1990-01-01') RETURNING id`,
    [email, verified ? new Date() : null, status, deleted ? new Date() : null],
  );
  const id = r.rows[0]!.id;
  await pool.query(`INSERT INTO account_credentials (account_id, password_hash) VALUES ($1, $2)`, [id, OLD_HASH]);
  return id;
}

async function newFamilyWithToken(accountId: string, tokenHash: string): Promise<string> {
  const f = await pool.query<{ id: string }>(
    `INSERT INTO refresh_token_families (account_id, expires_at) VALUES ($1, now() + interval '30 days') RETURNING id`,
    [accountId],
  );
  await pool.query(`INSERT INTO refresh_tokens (family_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '7 days')`, [f.rows[0]!.id, tokenHash]);
  return f.rows[0]!.id;
}

async function newCode(accountId: string, purpose: 'verify_email' | 'password_reset', code: string): Promise<void> {
  await pool.query(
    `INSERT INTO account_email_codes (account_id, purpose, code_hash, expires_at) VALUES ($1, $2, $3, now() + interval '15 minutes')`,
    [accountId, purpose, sha(`${accountId}|${purpose}|${code}`)],
  );
}
const codeHash = (accountId: string, purpose: string, code: string) => sha(`${accountId}|${purpose}|${code}`);

const ROTATE = 'SELECT * FROM rotate_refresh_token($1, $2, now() + interval \'7 days\')';
const CONSUME = 'SELECT * FROM consume_email_code($1::uuid, $2::text, $3::text)';
const RESET = 'SELECT * FROM reset_password_with_code($1::uuid, $2::text, $3::text)';

before(prepareDatabase);
after(shutdown);

// ================================================================== rotate_refresh_token

describe('rotate_refresh_token com várias conexões', () => {
  test('ESTRESSE: 12 conexões rodando o MESMO token no mesmo instante => 1 rotated, 1 reuse_detected, o resto revoked, zero erro, família revogada (10 rodadas)', async () => {
    const conns = await openConns(12);
    try {
      for (let round = 0; round < 10; round += 1) {
        const accountId = await newAccount();
        const oldHash = sha(`old-${randomUUID()}`);
        const familyId = await newFamilyWithToken(accountId, oldHash);
        const results = await fireAll<{ outcome: string }>(conns, ROTATE, (i) => [oldHash, sha(`new-${round}-${i}-${randomUUID()}`)]);

        const errors = results.filter((r) => !r.ok);
        assert.deepEqual(errors, [], `rodada ${round}: nenhuma chamada pode estourar exceção (ex.: unique violation)`);
        const outcomes = results.map((r) => (r.ok ? r.rows[0]!.outcome : 'erro'));
        assert.equal(outcomes.filter((o) => o === 'rotated').length, 1, `rodada ${round}: exatamente UMA rotação (${outcomes.join(',')})`);
        assert.equal(outcomes.filter((o) => o === 'reuse_detected').length, 1, `rodada ${round}: exatamente UM reuso detectado`);
        assert.equal(outcomes.filter((o) => o === 'revoked').length, 10, `rodada ${round}: o resto encontra a família já revogada`);

        const family = (await pool.query(`SELECT revoked_at, revoke_reason FROM refresh_token_families WHERE id = $1`, [familyId])).rows[0];
        assert.equal(family.revoke_reason, 'reuse_detected');
        const live = (await pool.query(`SELECT count(*)::int AS n FROM refresh_tokens WHERE family_id = $1 AND used_at IS NULL`, [familyId])).rows[0].n;
        assert.ok(live <= 1, 'a família nunca bifurca em dois tokens vivos');
      }
    } finally {
      await closeConns(conns);
    }
  });

  test('DETERMINÍSTICO: B espera o lock de A e, depois do commit de A, vê o token JÁ CONSUMIDO (reuse_detected), sem exceção', async () => {
    const [a, b] = await openConns(2);
    try {
      const accountId = await newAccount();
      const oldHash = sha(`old-${randomUUID()}`);
      const familyId = await newFamilyWithToken(accountId, oldHash);

      await a!.client.query('BEGIN');
      const first = await a!.client.query(ROTATE, [oldHash, sha(`a-${randomUUID()}`)]);
      assert.equal(first.rows[0].outcome, 'rotated');

      const pendingB = fireAll<{ outcome: string }>([b!], ROTATE, () => [oldHash, sha(`b-${randomUUID()}`)]);
      await waitUntilBlocked(b!.pid);
      await a!.client.query('COMMIT');

      const [resultB] = await pendingB;
      assert.ok(resultB!.ok, `B não pode estourar exceção: ${resultB && !resultB.ok ? resultB.message : ''}`);
      assert.equal(resultB!.ok && resultB!.rows[0]!.outcome, 'reuse_detected');
      const family = (await pool.query(`SELECT revoke_reason FROM refresh_token_families WHERE id = $1`, [familyId])).rows[0];
      assert.equal(family.revoke_reason, 'reuse_detected');
    } finally {
      await closeConns([a!, b!]);
    }
  });

  test('revogar a família (sair de todos os aparelhos) enquanto uma rotação está aberta: a rotação não ressuscita a família', async () => {
    const [a, b] = await openConns(2);
    try {
      const accountId = await newAccount();
      const oldHash = sha(`old-${randomUUID()}`);
      const familyId = await newFamilyWithToken(accountId, oldHash);

      await a!.client.query('BEGIN');
      assert.equal((await a!.client.query(ROTATE, [oldHash, sha(`a-${randomUUID()}`)])).rows[0].outcome, 'rotated');

      // Mesma instrução que o logout-all / reset de senha usam: revoga as famílias vivas da conta.
      const pendingRevoke = b!.client.query(
        `UPDATE refresh_token_families SET revoked_at = now(), revoke_reason = 'logout_all' WHERE account_id = $1 AND revoked_at IS NULL`,
        [accountId],
      );
      await waitUntilBlocked(b!.pid);
      await a!.client.query('COMMIT');
      await pendingRevoke;

      const family = (await pool.query(`SELECT revoked_at, revoke_reason FROM refresh_token_families WHERE id = $1`, [familyId])).rows[0];
      assert.notEqual(family.revoked_at, null, 'depois do commit da rotação a revogação ainda alcança a família');
      assert.equal(family.revoke_reason, 'logout_all');
    } finally {
      await closeConns([a!, b!]);
    }
  });

  test('conta des-verificada/bloqueada no meio do caminho: recusa e revoga a família (account_inactive), sem exceção, mesmo sob 6 conexões', async () => {
    const conns = await openConns(6);
    try {
      const accountId = await newAccount();
      const oldHash = sha(`old-${randomUUID()}`);
      const familyId = await newFamilyWithToken(accountId, oldHash);
      await pool.query(`UPDATE accounts SET status = 'blocked' WHERE id = $1`, [accountId]);
      const results = await fireAll<{ outcome: string }>(conns, ROTATE, (i) => [oldHash, sha(`n-${i}-${randomUUID()}`)]);
      assert.deepEqual(results.filter((r) => !r.ok), []);
      const outcomes = results.map((r) => (r.ok ? r.rows[0]!.outcome : 'erro'));
      assert.equal(outcomes.filter((o) => o === 'account_inactive').length, 1, 'a primeira revoga por conta inativa');
      assert.equal(outcomes.filter((o) => o === 'revoked').length, 5, 'as demais encontram a família já revogada');
      assert.equal((await pool.query(`SELECT revoke_reason FROM refresh_token_families WHERE id = $1`, [familyId])).rows[0].revoke_reason, 'account_inactive');
    } finally {
      await closeConns(conns);
    }
  });
});

// ================================================================== consume_email_code

describe('consume_email_code com várias conexões', () => {
  test('ESTRESSE: o MESMO código certo em 10 conexões => um ok só, o resto no_code; e-mail verificado uma vez (10 rodadas)', async () => {
    const conns = await openConns(10);
    try {
      for (let round = 0; round < 10; round += 1) {
        const accountId = await newAccount({ verified: false });
        await newCode(accountId, 'verify_email', '123456');
        const right = codeHash(accountId, 'verify_email', '123456');
        const results = await fireAll<{ outcome: string }>(conns, CONSUME, () => [accountId, 'verify_email', right]);
        assert.deepEqual(results.filter((r) => !r.ok), []);
        const outcomes = results.map((r) => (r.ok ? r.rows[0]!.outcome : 'erro'));
        assert.equal(outcomes.filter((o) => o === 'ok').length, 1, `rodada ${round}: ${outcomes.join(',')}`);
        assert.equal(outcomes.filter((o) => o === 'no_code').length, 9);
        const row = (await pool.query(`SELECT close_reason FROM account_email_codes WHERE account_id = $1`, [accountId])).rows[0];
        assert.equal(row.close_reason, 'used');
        assert.notEqual((await pool.query(`SELECT email_verified_at FROM accounts WHERE id = $1`, [accountId])).rows[0].email_verified_at, null);
      }
    } finally {
      await closeConns(conns);
    }
  });

  test('ESTRESSE: 20 chutes errados simultâneos => exatamente 4 invalid + 1 locked + 15 no_code; attempts = 5 (10 rodadas)', async () => {
    const conns = await openConns(20);
    try {
      for (let round = 0; round < 10; round += 1) {
        const accountId = await newAccount({ verified: false });
        await newCode(accountId, 'verify_email', '123456');
        const wrong = codeHash(accountId, 'verify_email', '000000');
        const results = await fireAll<{ outcome: string }>(conns, CONSUME, () => [accountId, 'verify_email', wrong]);
        assert.deepEqual(results.filter((r) => !r.ok), []);
        const outcomes = results.map((r) => (r.ok ? r.rows[0]!.outcome : 'erro'));
        assert.equal(outcomes.filter((o) => o === 'invalid').length, 4, `rodada ${round}: ${outcomes.join(',')}`);
        assert.equal(outcomes.filter((o) => o === 'locked').length, 1);
        assert.equal(outcomes.filter((o) => o === 'no_code').length, 15);
        const row = (await pool.query(`SELECT attempts, close_reason FROM account_email_codes WHERE account_id = $1`, [accountId])).rows[0];
        assert.equal(row.attempts, 5);
        assert.equal(row.close_reason, 'too_many_attempts');
      }
    } finally {
      await closeConns(conns);
    }
  });

  test('ESTRESSE: 1 chute certo no meio de 11 errados — nunca mais de um ok, nunca mais de 5 tentativas gastas, e a conta termina com UM desfecho (30 rodadas)', async () => {
    const conns = await openConns(12);
    try {
      for (let round = 0; round < 30; round += 1) {
        const accountId = await newAccount({ verified: false });
        await newCode(accountId, 'verify_email', '123456');
        const right = codeHash(accountId, 'verify_email', '123456');
        const wrong = codeHash(accountId, 'verify_email', '000000');
        const results = await fireAll<{ outcome: string }>(conns, CONSUME, (i) => [accountId, 'verify_email', i === round % 12 ? right : wrong]);
        assert.deepEqual(results.filter((r) => !r.ok), []);
        const outcomes = results.map((r) => (r.ok ? r.rows[0]!.outcome : 'erro'));
        const ok = outcomes.filter((o) => o === 'ok').length;
        const spent = outcomes.filter((o) => o === 'invalid' || o === 'locked').length;
        assert.ok(ok <= 1, `rodada ${round}: dois ok (${outcomes.join(',')})`);
        assert.ok(spent <= 5, `rodada ${round}: ${spent} tentativas erradas contadas (${outcomes.join(',')})`);
        const row = (await pool.query(`SELECT close_reason FROM account_email_codes WHERE account_id = $1`, [accountId])).rows[0];
        assert.ok(['used', 'too_many_attempts'].includes(row.close_reason), `desfecho único, achei ${row.close_reason}`);
        const verified = (await pool.query(`SELECT email_verified_at FROM accounts WHERE id = $1`, [accountId])).rows[0].email_verified_at;
        assert.equal(verified !== null, ok === 1, 'e-mail verificado se, e somente se, houve um ok');
      }
    } finally {
      await closeConns(conns);
    }
  });

  test('DETERMINÍSTICO (uso único): B espera o lock de A e, depois do commit, encontra o código já usado (no_code)', async () => {
    const [a, b] = await openConns(2);
    try {
      const accountId = await newAccount({ verified: false });
      await newCode(accountId, 'verify_email', '123456');
      const right = codeHash(accountId, 'verify_email', '123456');

      await a!.client.query('BEGIN');
      assert.equal((await a!.client.query(CONSUME, [accountId, 'verify_email', right])).rows[0].outcome, 'ok');

      const pendingB = fireAll<{ outcome: string }>([b!], CONSUME, () => [accountId, 'verify_email', right]);
      await waitUntilBlocked(b!.pid);
      await a!.client.query('COMMIT');

      const [resultB] = await pendingB;
      assert.ok(resultB!.ok);
      assert.equal(resultB!.ok && resultB!.rows[0]!.outcome, 'no_code', 'o código certo NÃO pode valer duas vezes');
    } finally {
      await closeConns([a!, b!]);
    }
  });

  test('DETERMINÍSTICO (tentativas): dois chutes errados em sequência travada contam 2 — o segundo vê attempts_left = 3, não 4', async () => {
    const [a, b] = await openConns(2);
    try {
      const accountId = await newAccount({ verified: false });
      await newCode(accountId, 'verify_email', '123456');
      const wrong = codeHash(accountId, 'verify_email', '000000');

      await a!.client.query('BEGIN');
      const first = await a!.client.query(CONSUME, [accountId, 'verify_email', wrong]);
      assert.equal(first.rows[0].outcome, 'invalid');
      assert.equal(first.rows[0].attempts_left, 4);

      const pendingB = fireAll<{ outcome: string; attempts_left: number }>([b!], CONSUME, () => [accountId, 'verify_email', wrong]);
      await waitUntilBlocked(b!.pid);
      await a!.client.query('COMMIT');

      const [resultB] = await pendingB;
      assert.ok(resultB!.ok);
      assert.equal(resultB!.ok && resultB!.rows[0]!.attempts_left, 3, 'sem o lock, a atualização perdida devolveria 4 e daria tentativas de graça ao atacante');
      assert.equal((await pool.query(`SELECT attempts FROM account_email_codes WHERE account_id = $1`, [accountId])).rows[0].attempts, 2);
    } finally {
      await closeConns([a!, b!]);
    }
  });
});

// ================================================================== reset_password_with_code

describe('reset_password_with_code com várias conexões', () => {
  const bcryptLike = (tag: string) => `$2b$04$${tag.padEnd(53, 'b').slice(0, 53)}`;

  test('ESTRESSE: 8 redefinições com o mesmo código certo => UMA troca; a senha final é a do vencedor; todas as sessões da conta caem (10 rodadas)', async () => {
    const conns = await openConns(8);
    try {
      for (let round = 0; round < 10; round += 1) {
        const accountId = await newAccount();
        await newCode(accountId, 'password_reset', '654321');
        const familyA = await newFamilyWithToken(accountId, sha(`fa-${randomUUID()}`));
        const familyB = await newFamilyWithToken(accountId, sha(`fb-${randomUUID()}`));
        const right = codeHash(accountId, 'password_reset', '654321');

        const results = await fireAll<{ outcome: string }>(conns, RESET, (i) => [accountId, right, bcryptLike(`novo${i}x`)]);
        assert.deepEqual(results.filter((r) => !r.ok), []);
        const winners = results.flatMap((r, i) => (r.ok && r.rows[0]!.outcome === 'ok' ? [i] : []));
        assert.equal(winners.length, 1, `rodada ${round}: exatamente uma troca de senha`);
        assert.equal(results.filter((r) => r.ok && r.rows[0]!.outcome === 'no_code').length, 7);

        const stored = (await pool.query(`SELECT password_hash FROM account_credentials WHERE account_id = $1`, [accountId])).rows[0].password_hash;
        assert.equal(stored, bcryptLike(`novo${winners[0]}x`), 'a senha gravada é a do conector que ganhou, não a do último a escrever');
        const fams = (await pool.query(`SELECT id, revoke_reason FROM refresh_token_families WHERE id = ANY($1)`, [[familyA, familyB]])).rows;
        assert.equal(fams.length, 2);
        assert.ok(fams.every((f) => f.revoke_reason === 'password_changed'), 'toda sessão viva da conta foi revogada');
      }
    } finally {
      await closeConns(conns);
    }
  });

  test('DETERMINÍSTICO: B espera A; depois do commit de A, B recebe no_code e NÃO sobrescreve a senha', async () => {
    const [a, b] = await openConns(2);
    try {
      const accountId = await newAccount();
      await newCode(accountId, 'password_reset', '654321');
      const right = codeHash(accountId, 'password_reset', '654321');

      await a!.client.query('BEGIN');
      assert.equal((await a!.client.query(RESET, [accountId, right, bcryptLike('vencedorA')])).rows[0].outcome, 'ok');
      const pendingB = fireAll<{ outcome: string }>([b!], RESET, () => [accountId, right, bcryptLike('atacanteB')]);
      await waitUntilBlocked(b!.pid);
      await a!.client.query('COMMIT');

      const [resultB] = await pendingB;
      assert.ok(resultB!.ok);
      assert.equal(resultB!.ok && resultB!.rows[0]!.outcome, 'no_code');
      assert.equal((await pool.query(`SELECT password_hash FROM account_credentials WHERE account_id = $1`, [accountId])).rows[0].password_hash, bcryptLike('vencedorA'));
    } finally {
      await closeConns([a!, b!]);
    }
  });

  test('ATOMICIDADE: hash inválido (não é bcrypt/argon2id) estoura o CHECK e desfaz TUDO — o código segue vivo, sem tentativa gasta, sessões intactas', async () => {
    const accountId = await newAccount();
    await newCode(accountId, 'password_reset', '654321');
    const family = await newFamilyWithToken(accountId, sha(`f-${randomUUID()}`));
    const right = codeHash(accountId, 'password_reset', '654321');

    await assert.rejects(pool.query(RESET, [accountId, right, 'senha-em-claro-nao-e-hash']), (err: { code?: string }) => err.code === '23514');

    const row = (await pool.query(`SELECT attempts, closed_at FROM account_email_codes WHERE account_id = $1`, [accountId])).rows[0];
    assert.equal(row.closed_at, null, 'o código não pode ser queimado por uma troca que falhou');
    assert.equal(row.attempts, 0);
    assert.equal((await pool.query(`SELECT revoked_at FROM refresh_token_families WHERE id = $1`, [family])).rows[0].revoked_at, null);
    assert.equal((await pool.query(`SELECT password_hash FROM account_credentials WHERE account_id = $1`, [accountId])).rows[0].password_hash, OLD_HASH);
  });
});

// ================================================================== issue_email_code

describe('issue_email_code com várias conexões', () => {
  const ISSUE = 'SELECT * FROM issue_email_code($1::uuid, $2::text, $3::text)';

  test('ESTRESSE: 10 pedidos simultâneos de código => UM emitido, 9 too_soon; um único código vivo (10 rodadas)', async () => {
    const conns = await openConns(10);
    try {
      for (let round = 0; round < 10; round += 1) {
        const accountId = await newAccount({ verified: false });
        const results = await fireAll<{ outcome: string }>(conns, ISSUE, (i) => [accountId, 'verify_email', sha(`h-${round}-${i}-${randomUUID()}`)]);
        assert.deepEqual(results.filter((r) => !r.ok), []);
        const outcomes = results.map((r) => (r.ok ? r.rows[0]!.outcome : 'erro'));
        assert.equal(outcomes.filter((o) => o === 'issued').length, 1, `rodada ${round}: ${outcomes.join(',')}`);
        assert.equal(outcomes.filter((o) => o === 'too_soon').length, 9);
        const live = (await pool.query(`SELECT count(*)::int AS n FROM account_email_codes WHERE account_id = $1 AND closed_at IS NULL`, [accountId])).rows[0].n;
        assert.equal(live, 1);
      }
    } finally {
      await closeConns(conns);
    }
  });

  test('ESTRESSE: com 4 envios já feitos na última hora, 12 pedidos simultâneos (sem intervalo mínimo) emitem UM só — o teto de 5 por hora vale sob concorrência', async () => {
    const conns = await openConns(12);
    try {
      const accountId = await newAccount({ verified: false });
      // 4 envios antigos (já fechados) dentro da janela de 1 hora.
      for (let i = 0; i < 4; i += 1) {
        await pool.query(
          `INSERT INTO account_email_codes (account_id, purpose, code_hash, created_at, expires_at, closed_at, close_reason)
           VALUES ($1, 'verify_email', $2, now() - interval '30 minutes', now() - interval '15 minutes', now() - interval '20 minutes', 'superseded')`,
          [accountId, sha(`antigo-${i}-${randomUUID()}`)],
        );
      }
      const results = await fireAll<{ outcome: string }>(
        conns,
        `SELECT * FROM issue_email_code($1::uuid, $2::text, $3::text, interval '15 minutes', interval '0 seconds', 5)`,
        (i) => [accountId, 'verify_email', sha(`b-${i}-${randomUUID()}`)],
      );
      assert.deepEqual(results.filter((r) => !r.ok), []);
      const outcomes = results.map((r) => (r.ok ? r.rows[0]!.outcome : 'erro'));
      assert.equal(outcomes.filter((o) => o === 'issued').length, 1, outcomes.join(','));
      // `rate_limited` ou `too_soon`: o `now()` de quem entra depois da trava pode ser anterior ao `created_at` de quem acabou de emitir. Ambos são recusa.
      assert.equal(outcomes.filter((o) => o === 'rate_limited' || o === 'too_soon').length, 11, outcomes.join(','));
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM account_email_codes WHERE account_id = $1`, [accountId])).rows[0].n, 5);
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM account_email_codes WHERE account_id = $1 AND closed_at IS NULL`, [accountId])).rows[0].n, 1);
    } finally {
      await closeConns(conns);
    }
  });
});
