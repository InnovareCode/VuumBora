/**
 * Catálogo de versões legais (migração 0021), no banco real: os 10 testes de privilégio e de regra que o Cronos provou
 * por SQL (docs/sql/testes-privilegio-0021.md), portados para a suíte. Aqui o app conecta COMO `vuumbora_api`
 * (helpers/runtime-role-env.ts) e o dono é a conexão `owner`: é a prova das DUAS camadas (REVOKE e gatilho).
 *
 * Fixture do catálogo imutável: ver o cabeçalho de helpers/legal-kit.ts (TRUNCATE com gatilhos desligados, só em banco `_test`).
 */
import './helpers/auth-env.js';
import './helpers/runtime-role-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import pg from 'pg';
import { after, before, beforeEach, describe, test } from 'node:test';
import { prepararBanco } from '../src/migrate.js';
import { pool, shutdown } from './helpers/harness.js';
import { ensureBaseline, insertAccount, publishAll, publishVersion, resetLegalCatalog, sha256For, STORED_DOCUMENTS } from './helpers/legal-kit.js';
import { OWNER_DATABASE_URL } from './helpers/runtime-role-env.js';

// 12 conexões: o teste de publicação simultânea precisa de 12 sessões de verdade (com menos, o pool serializaria as inserções).
const owner = new pg.Pool({ connectionString: OWNER_DATABASE_URL, max: 16 });
/** HMAC do IP tem 64 caracteres (CHECK `account_consents_ip_len`). */
const IP_HASH = 'c'.repeat(64);
const NO_GRANTS_ROLE = `vuumbora_sem_grants_${Math.random().toString(36).slice(2, 8)}`;

type Failure = { code?: string; constraint?: string };
/** A promessa tem de falhar com este SQLSTATE (e, se dito, esta restrição): nunca "falhou por qualquer motivo". */
async function rejectsWith(promise: Promise<unknown>, code: string, constraint?: string): Promise<void> {
  await assert.rejects(promise, (err: Failure) => {
    assert.equal(err.code, code, `SQLSTATE esperado ${code}, veio ${err.code}`);
    if (constraint !== undefined) assert.equal(err.constraint, constraint);
    return true;
  });
}

before(async () => {
  await prepararBanco({ databaseUrl: OWNER_DATABASE_URL, pool: owner, log: () => undefined });
  await owner.query(`CREATE ROLE ${NO_GRANTS_ROLE} NOLOGIN`);
});
after(async () => {
  await owner.query(`DROP ROLE IF EXISTS ${NO_GRANTS_ROLE}`);
  await ensureBaseline(owner); // devolve o catálogo conhecido aos arquivos seguintes
  await shutdown();
  await owner.end();
});
// Cada teste começa de catálogo vazio: as versões que ele publica não vazam para o seguinte.
beforeEach(async () => {
  await resetLegalCatalog(owner);
});

const count = async (db: Pick<pg.Pool, 'query'>, sql: string, params: unknown[] = []) => (await db.query<{ n: number }>(sql, params)).rows[0]!.n;

describe('privilégios do papel da API sobre o catálogo (camada 1: REVOKE)', () => {
  test('1. has_table_privilege: SELECT sim; INSERT, UPDATE, DELETE e TRUNCATE não — no catálogo e na view', async () => {
    for (const relation of ['legal_document_versions', 'legal_current_versions']) {
      const row = (
        await owner.query(
          `SELECT has_table_privilege('vuumbora_api', $1, 'SELECT') AS s, has_table_privilege('vuumbora_api', $1, 'INSERT') AS i,
                  has_table_privilege('vuumbora_api', $1, 'UPDATE') AS u, has_table_privilege('vuumbora_api', $1, 'DELETE') AS d,
                  has_table_privilege('vuumbora_api', $1, 'TRUNCATE') AS t`,
          [relation],
        )
      ).rows[0];
      assert.deepEqual(row, { s: true, i: false, u: false, d: false, t: false }, relation);
    }
  });

  test('2. EXECUTE em legal_pending_for_account: sim para a API; um papel NOLOGIN sem grants recebe 42501', async () => {
    const grants = (await owner.query(`SELECT has_function_privilege('vuumbora_api', 'legal_pending_for_account(uuid)', 'EXECUTE') AS api,
                                              has_function_privilege($1::name, 'legal_pending_for_account(uuid)', 'EXECUTE') AS nobody`, [NO_GRANTS_ROLE])).rows[0];
    assert.deepEqual(grants, { api: true, nobody: false });
    const client = await owner.connect();
    try {
      await client.query(`SET ROLE ${NO_GRANTS_ROLE}`);
      await rejectsWith(client.query('SELECT * FROM legal_pending_for_account(gen_random_uuid())'), '42501');
    } finally {
      await client.query('RESET ROLE').catch(() => undefined);
      client.release();
    }
    await pool.query('SELECT * FROM legal_pending_for_account(gen_random_uuid())'); // a API executa
  });

  test('3. pool real da API (vuumbora_api): INSERT, UPDATE, DELETE e TRUNCATE no catálogo dão 42501', async () => {
    assert.equal((await pool.query('SELECT current_user AS u')).rows[0].u, 'vuumbora_api');
    await publishVersion(owner, { document: 'terms_of_use', audience: 'passenger', version: 'v1' });
    await rejectsWith(pool.query(`INSERT INTO legal_document_versions (document, audience, version, text_sha256) VALUES ('terms_of_use', 'passenger', 'v-forjada', repeat('a', 64))`), '42501');
    await rejectsWith(pool.query(`UPDATE legal_document_versions SET text_sha256 = repeat('b', 64)`), '42501');
    await rejectsWith(pool.query(`DELETE FROM legal_document_versions`), '42501');
    await rejectsWith(pool.query(`TRUNCATE legal_document_versions`), '42501');
    assert.equal(await count(owner, 'SELECT count(*)::int AS n FROM legal_document_versions'), 1, 'a linha publicada segue intacta');
  });
});

describe('imutabilidade do catálogo (camada 2: gatilho, vale até para o dono)', () => {
  test('4. dono: UPDATE e DELETE dão 42501 pelo gatilho; TRUNCATE CASCADE 42501; TRUNCATE simples 0A000 (a FK recusa antes); linhas intactas', async () => {
    await publishAll(owner, 'v1');
    const before = (await owner.query('SELECT document, audience, version, text_sha256, published_at FROM legal_document_versions ORDER BY 1, 2, 3')).rows;
    assert.equal(before.length, 4);
    await rejectsWith(owner.query(`UPDATE legal_document_versions SET text_sha256 = repeat('b', 64)`), '42501');
    await rejectsWith(owner.query(`UPDATE legal_document_versions SET requires_reacceptance = false`), '42501');
    await rejectsWith(owner.query(`UPDATE legal_document_versions SET published_at = '2000-01-01'`), '42501');
    await rejectsWith(owner.query(`DELETE FROM legal_document_versions`), '42501');
    await rejectsWith(owner.query(`TRUNCATE legal_document_versions CASCADE`), '42501');
    await rejectsWith(owner.query(`TRUNCATE legal_document_versions`), '0A000');
    const after = (await owner.query('SELECT document, audience, version, text_sha256, published_at FROM legal_document_versions ORDER BY 1, 2, 3')).rows;
    assert.deepEqual(after, before, 'nada mudou');
  });
});

describe('aceite: o banco grava o que é fato (camada 2: gatilho do aceite)', () => {
  test('5. aceite com audience, text_sha256 e accepted_at FORJADOS: o banco grava os do catálogo, da conta e do relógio; versão não publicada 23503; superada 23514; motorista com versão só de passageiro 23503', async () => {
    await publishAll(owner, 'v1');
    await publishAll(owner, 'v2'); // v1 fica superada
    const passenger = await insertAccount(owner, 'passenger');
    const driver = await insertAccount(owner, 'driver');

    await pool.query(
      `INSERT INTO account_consents (account_id, document, version, ip_hash, audience, text_sha256, accepted_at)
       VALUES ($1, 'terms_of_use', 'v2', '${IP_HASH}', 'driver', repeat('a', 64), now() - interval '1 year')`,
      [passenger],
    );
    const stored = (await owner.query(`SELECT audience, text_sha256, accepted_at > now() - interval '1 minute' AS recent FROM account_consents WHERE account_id = $1`, [passenger])).rows[0];
    assert.equal(stored.audience, 'passenger', 'o perfil é o da CONTA, não o forjado');
    assert.equal(stored.text_sha256, sha256For('terms_of_use', 'passenger', 'v2'), 'o hash é o do CATÁLOGO, não o forjado');
    assert.equal(stored.recent, true, 'a data é o relógio do banco');

    const accept = (account: string, version: string) =>
      pool.query(`INSERT INTO account_consents (account_id, document, version, ip_hash) VALUES ($1, 'privacy_policy', $2, '${IP_HASH}')`, [account, version]);
    await rejectsWith(accept(passenger, 'v9'), '23503', 'account_consents_version_published');
    await rejectsWith(accept(passenger, 'v1'), '23514', 'account_consents_version_current');
    await publishVersion(owner, { document: 'privacy_policy', audience: 'passenger', version: 'so-passageiro' });
    await rejectsWith(accept(driver, 'so-passageiro'), '23503', 'account_consents_version_published');
    await accept(passenger, 'so-passageiro'); // o passageiro aceita a que é dele
  });

  test('6. dono: UPDATE de aceite — só ip_hash para NULL passa; com troca de text_sha256 ou audience (junto ou sozinha) dá 42501', async () => {
    await publishAll(owner, 'v1');
    const account = await insertAccount(owner, 'passenger');
    for (const document of STORED_DOCUMENTS) {
      await owner.query(`INSERT INTO account_consents (account_id, document, version, ip_hash) VALUES ($1, $2, 'v1', '${IP_HASH}')`, [account, document]);
    }
    const guarded = (set: string) => owner.query(`UPDATE account_consents SET ${set} WHERE account_id = $1 AND document = 'terms_of_use'`, [account]);
    await rejectsWith(guarded(`ip_hash = NULL, text_sha256 = repeat('b', 64)`), '42501');
    await rejectsWith(guarded(`text_sha256 = repeat('b', 64)`), '42501');
    await rejectsWith(guarded(`ip_hash = NULL, audience = 'driver'`), '42501');
    await rejectsWith(guarded(`audience = 'driver'`), '42501');
    await rejectsWith(guarded(`accepted_at = now() - interval '1 year'`), '42501');
    assert.equal((await guarded('ip_hash = NULL')).rowCount, 1, 'minimização do IP é a única mutação permitida');
    const row = (await owner.query(`SELECT ip_hash, audience, text_sha256 FROM account_consents WHERE account_id = $1 AND document = 'terms_of_use'`, [account])).rows[0];
    assert.deepEqual(row, { ip_hash: null, audience: 'passenger', text_sha256: sha256For('terms_of_use', 'passenger', 'v1') });
  });

  test('7. API: UPDATE, DELETE e TRUNCATE em account_consents dão 42501; excluir a conta ainda leva o aceite em cascata', async () => {
    await publishAll(owner, 'v1');
    const account = await insertAccount(owner, 'passenger');
    await pool.query(`INSERT INTO account_consents (account_id, document, version, ip_hash) VALUES ($1, 'terms_of_use', 'v1', '${IP_HASH}')`, [account]);
    await rejectsWith(pool.query(`UPDATE account_consents SET ip_hash = NULL`), '42501');
    await rejectsWith(pool.query(`DELETE FROM account_consents`), '42501');
    await rejectsWith(pool.query(`TRUNCATE account_consents`), '42501');
    assert.equal(await count(owner, 'SELECT count(*)::int AS n FROM account_consents WHERE account_id = $1', [account]), 1);
    await owner.query('DELETE FROM accounts WHERE id = $1', [account]);
    assert.equal(await count(owner, 'SELECT count(*)::int AS n FROM account_consents WHERE account_id = $1', [account]), 0, 'a cascata da exclusão da conta passa pelo gatilho');
  });
});

describe('publicação', () => {
  test('8. published_at enviado é descartado; a mesma versão de novo dá 23505 (ou 0 linhas com ON CONFLICT) sem mudar o hash; 12 publicações simultâneas ficam distintas e a view devolve 1 linha', async () => {
    const insert = (version: string, sha: string, extra = '') =>
      `INSERT INTO legal_document_versions (document, audience, version, text_sha256${extra ? ', published_at' : ''}) VALUES ('terms_of_use', 'passenger', '${version}', '${sha}'${extra ? `, ${extra}` : ''})`;
    await owner.query(insert('v1', 'a'.repeat(64), `'2000-01-01'`));
    const first = (await owner.query(`SELECT published_at > now() - interval '1 minute' AS recent FROM legal_document_versions WHERE version = 'v1'`)).rows[0];
    assert.equal(first.recent, true, 'o published_at enviado (ano 2000) foi descartado: vale o relógio do banco');

    await rejectsWith(owner.query(insert('v1', 'b'.repeat(64))), '23505');
    const again = await owner.query(`${insert('v1', 'c'.repeat(64))} ON CONFLICT (document, audience, version) DO NOTHING`);
    assert.equal(again.rowCount, 0);
    assert.equal((await owner.query(`SELECT text_sha256 FROM legal_document_versions WHERE version = 'v1'`)).rows[0].text_sha256, 'a'.repeat(64), 'o hash original não muda');

    const versions = Array.from({ length: 12 }, (_, i) => `s${i + 1}`);
    await Promise.all(versions.map((version, i) => owner.query(insert(version, i.toString(16).padStart(64, 'd')))));
    const rows = (await owner.query(`SELECT version FROM legal_document_versions WHERE audience = 'passenger' AND document = 'terms_of_use'`)).rows;
    assert.equal(rows.length, 13);
    const micro = (await owner.query(`SELECT count(DISTINCT published_at)::int AS n FROM legal_document_versions WHERE audience = 'passenger' AND document = 'terms_of_use'`)).rows[0].n;
    assert.equal(micro, 13, 'published_at distinto por par, no microssegundo (o JS só vê milissegundos)');
    const view = (await owner.query(`SELECT version FROM legal_current_versions WHERE audience = 'passenger' AND document = 'terms_of_use'`)).rows;
    assert.equal(view.length, 1, 'a view devolve UMA vigente por par');
    const latest = (await owner.query(`SELECT version FROM legal_document_versions WHERE audience = 'passenger' AND document = 'terms_of_use' ORDER BY published_at DESC LIMIT 1`)).rows[0];
    assert.equal(view[0].version, latest.version, 'a vigente é a de maior published_at');
  });
});

describe('reaceite: legal_pending_for_account', () => {
  const pendingOf = async (account: string) =>
    (await owner.query<{ document: string; version: string }>('SELECT document, version FROM legal_pending_for_account($1)', [account])).rows.map((r) => `${r.document}@${r.version}`);
  const both = (version: string) => [`privacy_policy@${version}`, `terms_of_use@${version}`]; // ordenado por documento
  const acceptBoth = async (account: string, version: string) => {
    for (const document of STORED_DOCUMENTS) {
      await owner.query(`INSERT INTO account_consents (account_id, document, version, ip_hash) VALUES ($1, $2, $3, '${IP_HASH}')`, [account, document, version]);
    }
  };

  test('9. cenário na ordem: v1 material, v2 editorial, v3 material, v4 editorial; conta nova, conta legada, perfis independentes e nada publicado', async () => {
    const fresh = await insertAccount(owner, 'passenger', 'nada-publicado');
    assert.deepEqual(await pendingOf(fresh), [], 'nada publicado para o perfil: zero pendência');

    await publishAll(owner, 'v1'); // material (padrão)
    const a = await insertAccount(owner, 'passenger', 'a');
    assert.deepEqual(await pendingOf(a), both('v1'), 'conta nova: pendente nos dois documentos');
    await acceptBoth(a, 'v1');
    assert.deepEqual(await pendingOf(a), []);

    await publishAll(owner, 'v2', { requiresReacceptance: false }); // editorial
    assert.deepEqual(await pendingOf(a), [], 'correção editorial não incomoda quem aceitou a material anterior');
    const b = await insertAccount(owner, 'passenger', 'b');
    assert.deepEqual(await pendingOf(b), both('v2'), 'conta nova aceita a VIGENTE (v2), não a material');
    await acceptBoth(b, 'v2');
    assert.deepEqual(await pendingOf(b), [], 'v2 foi publicada em/depois da última material (v1): em dia');

    await publishAll(owner, 'v3'); // material
    assert.deepEqual(await pendingOf(a), both('v3'), 'quem aceitou só a v1 fica pendente da vigente (v3)');
    assert.deepEqual(await pendingOf(b), both('v3'), 'quem aceitou a v2 (editorial) também: v2 é anterior à material v3');
    await acceptBoth(a, 'v3');
    assert.deepEqual(await pendingOf(a), []);

    await publishAll(owner, 'v4', { requiresReacceptance: false }); // editorial
    assert.deepEqual(await pendingOf(a), [], 'aceitou a v3 (material): a v4 editorial não pede nada');
    assert.deepEqual(await pendingOf(b), both('v4'), 'b nunca aceitou a v3: pendente, e o que aceita é a vigente (v4)');
    await acceptBoth(b, 'v4');
    assert.deepEqual(await pendingOf(b), []);

    // Conta LEGADA (aceite anterior à 0021: sem perfil nem hash). Só nasce com o gatilho desligado, como num banco antigo.
    const legacy = await insertAccount(owner, 'passenger', 'legada');
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL session_replication_role = replica');
      for (const document of STORED_DOCUMENTS) {
        await client.query(`INSERT INTO account_consents (account_id, document, version, ip_hash) VALUES ($1, $2, 'legado-1', NULL)`, [legacy, document]);
      }
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    assert.equal(await count(owner, 'SELECT count(*)::int AS n FROM account_consents WHERE account_id = $1 AND text_sha256 IS NULL AND audience IS NULL', [legacy]), 2);
    assert.deepEqual(await pendingOf(legacy), both('v4'), 'aceite legado NÃO conta: reaceita a primeira versão publicada (a vigente)');

    // Perfis independentes: uma publicação só para passageiro não mexe no motorista.
    const driver = await insertAccount(owner, 'driver', 'motorista');
    await acceptBoth(driver, 'v4');
    assert.deepEqual(await pendingOf(driver), []);
    await publishAll(owner, 'v5', { audiences: ['passenger'] });
    assert.deepEqual(await pendingOf(a), both('v5'));
    assert.deepEqual(await pendingOf(driver), [], 'o motorista segue em dia: a v5 é só do passageiro');
  });
});

describe('rede do banco por desenho (FK de 4 colunas e par audience/hash)', () => {
  test('10. com o gatilho do aceite DESLIGADO (transação revertida): hash errado dá 23503 na FK composta; audience e hash fora de par dá 23514', async () => {
    await publishAll(owner, 'v1');
    const account = await insertAccount(owner, 'passenger');
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query('ALTER TABLE account_consents DISABLE TRIGGER account_consents_append_only');
      await client.query('SAVEPOINT s1');
      await rejectsWith(
        client.query(`INSERT INTO account_consents (account_id, document, version, audience, text_sha256) VALUES ($1, 'terms_of_use', 'v1', 'passenger', repeat('a', 64))`, [account]),
        '23503', 'account_consents_published_version_fk',
      );
      await client.query('ROLLBACK TO SAVEPOINT s1');
      await rejectsWith(
        client.query(`INSERT INTO account_consents (account_id, document, version, audience, text_sha256) VALUES ($1, 'terms_of_use', 'v1', 'passenger', NULL)`, [account]),
        '23514', 'account_consents_audience_sha256_paired',
      );
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
    const trigger = (await owner.query(`SELECT tgenabled FROM pg_trigger WHERE tgname = 'account_consents_append_only'`)).rows[0];
    assert.equal(trigger.tgenabled, 'O', 'o gatilho voltou ligado (a transação foi revertida)');
  });
});
