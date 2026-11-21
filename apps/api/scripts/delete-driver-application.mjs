#!/usr/bin/env node
/**
 * Exclui UMA candidatura de pré-cadastro de motorista por e-mail — atende
 * pedido de exclusão (LGPD). Apaga a linha inteira (nome, telefone,
 * cidade, UF, elegibilidade, status — tudo), não só o e-mail. Normaliza o
 * e-mail do mesmo jeito que a API (minúsculas, sem espaços) antes de
 * procurar.
 *
 * Uso:
 *   node scripts/delete-driver-application.mjs --email=pessoa@exemplo.com
 *   npm run driver-applications:delete --workspace @vuumbora/api -- --email=pessoa@exemplo.com
 *
 * Exige a credencial DONA do banco (MIGRATION_DATABASE_URL: o papel restrito da API não
 * apaga linhas — migração 0017). Roda no terminal do serviço `vuumbora-backend` do Easypanel — ver
 * docs/lista-de-espera.md, seção "Candidaturas de motorista".
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
  const databaseUrl = resolveOwnerDatabaseUrl('driver-applications:delete');

  const rawEmail = parseEmailArg(process.argv.slice(2));
  if (!rawEmail) {
    console.error('[driver-applications:delete] uso: node scripts/delete-driver-application.mjs --email=pessoa@exemplo.com');
    process.exit(1);
  }

  const email = rawEmail.trim().toLowerCase();

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await pool.query('DELETE FROM driver_applications WHERE email = $1 RETURNING id', [email]);
    if (result.rowCount && result.rowCount > 0) {
      console.log('[driver-applications:delete] excluída 1 candidatura (todos os campos) para o e-mail informado.');
    } else {
      console.log('[driver-applications:delete] nenhuma candidatura encontrada para esse e-mail (nada para excluir).');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[driver-applications:delete] erro: ${err.message}`);
  process.exit(1);
});
