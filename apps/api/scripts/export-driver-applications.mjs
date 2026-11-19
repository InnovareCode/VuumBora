#!/usr/bin/env node
/**
 * Exporta todas as candidaturas de pré-cadastro de motorista em CSV para
 * stdout.
 *
 * Uso:
 *   node scripts/export-driver-applications.mjs > candidaturas.csv
 *   npm run driver-applications:export --workspace @vuumbora/api > candidaturas.csv
 *
 * Exige DATABASE_URL no ambiente. Roda dentro do contêiner do serviço
 * `vuumbora-backend` (terminal do Easypanel ou `docker exec`) — ver
 * docs/lista-de-espera.md, seção "Candidaturas de motorista".
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
    console.error('[driver-applications:export] DATABASE_URL não definido no ambiente.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await pool.query(
      `SELECT name, email, phone, city, state, already_drives_for_app, has_own_vehicle, status, source, created_at
       FROM driver_applications
       ORDER BY created_at ASC`,
    );

    const header = [
      'name',
      'email',
      'phone',
      'city',
      'state',
      'already_drives_for_app',
      'has_own_vehicle',
      'status',
      'source',
      'created_at',
    ];
    process.stdout.write(header.join(',') + '\n');
    for (const row of result.rows) {
      process.stdout.write(
        [
          csvField(row.name),
          csvField(row.email),
          csvField(row.phone),
          csvField(row.city),
          csvField(row.state),
          csvField(row.already_drives_for_app),
          csvField(row.has_own_vehicle),
          csvField(row.status),
          csvField(row.source),
          csvField(row.created_at),
        ].join(',') + '\n',
      );
    }
    console.error(`[driver-applications:export] ${result.rowCount} candidatura(s) exportada(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[driver-applications:export] erro: ${err.message}`);
  process.exit(1);
});
