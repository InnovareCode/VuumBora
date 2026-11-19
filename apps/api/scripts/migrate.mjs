#!/usr/bin/env node
/**
 * Atalho de linha de comando para preparar o banco: cria (se faltar) e
 * aplica as migrações pendentes.
 *
 *   npm run migrate --workspace @vuumbora/api
 *
 * A LÓGICA NÃO MORA AQUI. Este arquivo chama `src/migrate.ts` (compilado em
 * `dist/migrate.js`), o mesmo módulo que o servidor executa no boot.
 *
 * Por que: até 19/11/2026 este script tinha a própria cópia do runner.
 * Duas portas mantendo metades do mesmo estado é exatamente como uma delas
 * fica para trás sem ninguém perceber — e aqui "para trás" significa um
 * banco com tabela faltando, descoberto só quando o primeiro motorista
 * tenta se cadastrar.
 *
 * Em produção isto é redundante por desenho: o servidor já faz tudo sozinho
 * ao subir. O script continua existindo para rodar a migração sem subir a
 * API (conferência, ambiente local, recuperação manual).
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import pg from 'pg';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPILADO = join(RAIZ, 'dist', 'migrate.js');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[migrate] DATABASE_URL não definido no ambiente.');
    process.exit(1);
  }

  if (!existsSync(COMPILADO)) {
    console.error('[migrate] dist/migrate.js não existe. Rode antes:');
    console.error('          npm run build --workspace @vuumbora/api');
    process.exit(1);
  }

  const { prepararBanco } = await import(pathToFileURL(COMPILADO).href);

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  try {
    await prepararBanco({
      databaseUrl,
      pool,
      criarBanco: process.env.CREATE_DATABASE_IF_MISSING !== 'false',
      esperaEmSegundos: Number(process.env.DB_BOOT_WAIT_SECONDS ?? 60),
    });
    console.log('[migrate] concluído.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // Só a mensagem: o erro inteiro do `pg` pode ecoar a connection string.
  console.error(`[migrate] erro: ${err.message}`);
  process.exit(1);
});
