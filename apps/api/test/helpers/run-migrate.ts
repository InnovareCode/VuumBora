/**
 * Processo-filho dos testes do runner de migração: roda `prepararBanco` (o MESMO
 * caminho do boot e de `npm run migrate`) contra a `DATABASE_URL` do ambiente e
 * imprime UMA linha JSON com o que aconteceu. Não importa `src/env.ts` — assim
 * não depende de nenhuma outra variável da API.
 */
import pg from 'pg';
import { prepararBanco } from '../../src/migrate.js';

const databaseUrl = process.env['DATABASE_URL'] ?? '';
const lines: string[] = [];
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });

try {
  await prepararBanco({ databaseUrl, pool, esperaEmSegundos: 15, log: (mensagem) => lines.push(mensagem) });
  console.log(JSON.stringify({ ok: true, lines }));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err), lines }));
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => undefined);
}
