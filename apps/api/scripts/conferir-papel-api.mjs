#!/usr/bin/env node
/**
 * Confere que `DATABASE_URL` do ambiente é de fato o papel restrito `vuumbora_api`
 * (migrações 0012/0017) e que os privilégios continuam o que uma credencial de
 * RUNTIME precisa ter: `SELECT 1` funciona, mas apagar administrador, alterar a
 * trilha de auditoria e qualquer DDL são recusados pelo banco (`42501`).
 *
 * Atenção (F07, migração 0023): desde então o papel PODE `INSERT`/`UPDATE` em
 * `admin_users` (nunca `DELETE`) e `INSERT`/`DELETE` em `admin_enrollment_tokens` —
 * por isso este script não testa "INSERT em admin_users falha" (seria falso). A
 * matriz completa de privilégios mora em `apps/api/test/runtime-role.test.ts`.
 *
 * Uso (com DATABASE_URL já no ambiente — operador OU dentro do contêiner da API):
 *   node scripts/conferir-papel-api.mjs
 *
 * Imprime OK/FALHA por item e sai com código != 0 se algo falhar. Tudo roda dentro
 * de uma transação com ROLLBACK no final: nenhum efeito fica no banco.
 */
import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;
const EXPECTED_ROLE = 'vuumbora_api';

/**
 * Espera `permission denied` (42501). Qualquer outro desfecho — a query passar, ou
 * falhar por outro motivo — é FALHA: o ponto é provar a recusa específica do papel.
 * Cada chamada roda num SAVEPOINT próprio: depois de um erro o Postgres aborta o
 * resto da transação, então sem o SAVEPOINT a checagem seguinte quebraria também.
 */
async function checkDenied(client, label, sql) {
  await client.query('SAVEPOINT probe');
  try {
    await client.query(sql);
    return { label, ok: false, detail: 'a query passou — esperado permission denied (42501)' };
  } catch (err) {
    if (err?.code === '42501') return { label, ok: true };
    return { label, ok: false, detail: err?.code ?? 'erro inesperado' };
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT probe').catch(() => undefined);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[conferir-papel-api] defina DATABASE_URL (a credencial da API) antes de rodar.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const results = [];
  try {
    await client.query('BEGIN');

    try {
      const who = await client.query('SELECT current_user AS u');
      const user = who.rows[0]?.u;
      results.push(
        user === EXPECTED_ROLE
          ? { label: `current_user é "${EXPECTED_ROLE}"`, ok: true }
          : { label: `current_user é "${EXPECTED_ROLE}"`, ok: false, detail: `encontrado "${user}"` },
      );
    } catch (err) {
      results.push({ label: `current_user é "${EXPECTED_ROLE}"`, ok: false, detail: err?.code ?? 'erro' });
    }

    try {
      const probe = await client.query('SELECT 1 AS um');
      results.push(
        probe.rows[0]?.um === 1
          ? { label: 'SELECT 1 funciona', ok: true }
          : { label: 'SELECT 1 funciona', ok: false, detail: 'resultado inesperado' },
      );
    } catch (err) {
      results.push({ label: 'SELECT 1 funciona', ok: false, detail: err?.code ?? 'erro' });
    }

    results.push(await checkDenied(client, 'DELETE em admin_users é recusado', 'DELETE FROM admin_users'));
    results.push(await checkDenied(client, 'UPDATE em admin_audit_log é recusado', "UPDATE admin_audit_log SET action = 'x'"));
    results.push(await checkDenied(client, 'DDL (CREATE TABLE) é recusado', 'CREATE TABLE conferir_papel_api_ddl_probe (id int)'));
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end().catch(() => undefined);
  }

  let failed = false;
  for (const r of results) {
    if (r.ok) {
      console.log(`[OK]    ${r.label}`);
    } else {
      failed = true;
      console.log(`[FALHA] ${r.label}${r.detail ? ` (${r.detail})` : ''}`);
    }
  }

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`[conferir-papel-api] falhou (${err?.code ?? err?.name ?? 'erro'}).`);
  process.exit(1);
});
