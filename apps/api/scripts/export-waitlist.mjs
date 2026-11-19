#!/usr/bin/env node
/**
 * Exporta toda a lista de espera em CSV para stdout.
 *
 * Uso:
 *   node scripts/export-waitlist.mjs > inscricoes.csv
 *   npm run waitlist:export --workspace @vuumbora/api > inscricoes.csv
 *
 * Exige DATABASE_URL no ambiente. Roda dentro do contêiner do serviço
 * `vuumbora-backend` (terminal do Easypanel ou `docker exec`) — ver
 * docs/lista-de-espera.md, seção "Exportar a lista de espera".
 * Local, lê `apps/api/.env` se existir (via `dotenv/config` — silencioso
 * se o arquivo não existir, caso de produção).
 */
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

function csvField(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[waitlist:export] DATABASE_URL não definido no ambiente.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await pool.query(
      'SELECT email, profile, source, created_at FROM waitlist_signups ORDER BY created_at ASC',
    );

    const header = ['email', 'profile', 'source', 'created_at'];
    process.stdout.write(header.join(',') + '\n');
    for (const row of result.rows) {
      process.stdout.write(
        [csvField(row.email), csvField(row.profile), csvField(row.source), csvField(row.created_at)].join(',') +
          '\n',
      );
    }
    console.error(`[waitlist:export] ${result.rowCount} inscrição(ões) exportada(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[waitlist:export] erro: ${err.message}`);
  process.exit(1);
});
