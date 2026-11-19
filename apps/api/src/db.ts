/** Conexão com o Postgres. Um único Pool compartilhado pelo processo. */
import { Pool } from 'pg';
import { env } from './env.js';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Uma conexão ociosa que cai não deve derrubar o processo inteiro — só registra.
// Nunca logar `err` inteiro (pode ecoar a connection string); só a mensagem.
pool.on('error', (err) => {
  console.error(`[db] erro em conexão ociosa do pool: ${err.message}`);
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
