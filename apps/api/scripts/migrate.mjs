#!/usr/bin/env node
/**
 * Runner de migração minimalista — sem dependência nova além de `pg`
 * (já usada pelo servidor). Aplica, em ordem alfabética, todo `.sql` em
 * `migrations/` que ainda não está registrado em `schema_migrations`.
 *
 * Uso:
 *   node scripts/migrate.mjs
 *   npm run migrate --workspace @vuumbora/api
 *
 * Exige DATABASE_URL no ambiente (mesma variável do servidor). Em produção
 * vem injetado pelo Easypanel; local, lê `apps/api/.env` se existir (via
 * `dotenv/config` — silencioso se o arquivo não existir).
 */
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'migrations');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[migrate] DATABASE_URL não definido no ambiente.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const applied = new Set(
      (await pool.query('SELECT id FROM schema_migrations')).rows.map((row) => row.id),
    );

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith('.sql'))
      .sort();

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] já aplicada: ${file}`);
        continue;
      }

      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[migrate] aplicada: ${file}`);
        appliedCount += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`falha ao aplicar ${file}: ${err.message}`);
      } finally {
        client.release();
      }
    }

    console.log(`[migrate] concluído — ${appliedCount} migração(ões) nova(s), ${files.length} no total.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[migrate] erro: ${err.message}`);
  process.exit(1);
});
