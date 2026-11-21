#!/usr/bin/env node
/**
 * Exclui UMA inscrição da lista de espera por e-mail — atende pedido de
 * exclusão (LGPD). Normaliza o e-mail do mesmo jeito que a API (minúsculas,
 * sem espaços) antes de procurar.
 *
 * Uso:
 *   node scripts/delete-waitlist.mjs --email=pessoa@exemplo.com
 *   npm run waitlist:delete --workspace @vuumbora/api -- --email=pessoa@exemplo.com
 *
 * Exige a credencial DONA do banco (MIGRATION_DATABASE_URL: o papel restrito da API não
 * apaga linhas — migração 0017). Roda no terminal do serviço `vuumbora-backend` do Easypanel — ver
 * docs/lista-de-espera.md, seção "Excluir uma inscrição".
 * Local, lê `apps/api/.env` se existir (via `dotenv/config` — silencioso
 * se o arquivo não existir, caso de produção).
 */
import 'dotenv/config';
import pg from 'pg';
import { resolveOwnerDatabaseUrl } from './lib/owner-db-url.mjs';

const { Pool } = pg;

function parseEmailArg(argv) {
  const flag = argv.find((arg) => arg.startsWith('--email='));
  if (flag) return flag.slice('--email='.length);
  // Também aceita o e-mail como primeiro argumento posicional, sem a flag.
  const positional = argv.find((arg) => !arg.startsWith('--'));
  return positional;
}

async function main() {
  const databaseUrl = resolveOwnerDatabaseUrl('waitlist:delete');

  const rawEmail = parseEmailArg(process.argv.slice(2));
  if (!rawEmail) {
    console.error('[waitlist:delete] uso: node scripts/delete-waitlist.mjs --email=pessoa@exemplo.com');
    process.exit(1);
  }

  const email = rawEmail.trim().toLowerCase();

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await pool.query('DELETE FROM waitlist_signups WHERE email = $1 RETURNING id', [email]);
    if (result.rowCount && result.rowCount > 0) {
      console.log(`[waitlist:delete] excluída 1 inscrição para o e-mail informado.`);
    } else {
      console.log('[waitlist:delete] nenhuma inscrição encontrada para esse e-mail (nada para excluir).');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[waitlist:delete] erro: ${err.message}`);
  process.exit(1);
});
