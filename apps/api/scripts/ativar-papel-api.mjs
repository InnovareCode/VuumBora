#!/usr/bin/env node
/**
 * Ativa a credencial de RUNTIME da API: dá `LOGIN` + senha nova ao papel restrito
 * `vuumbora_api` (criado sem `LOGIN` pela migração 0012) e imprime a `DATABASE_URL`
 * pronta para colar no ambiente do serviço da API.
 *
 * Uso (terminal/tarefa de OPERADOR; no Console do contêiner da API, só com a credencial dona
 * passada NO PRÓPRIO COMANDO, nunca salva no ambiente do serviço):
 *   MIGRATION_DATABASE_URL="postgres://dono:...@host:5432/banco" node scripts/ativar-papel-api.mjs
 * Enquanto a API ainda roda com a credencial dona (antes desta troca), basta `node scripts/ativar-papel-api.mjs`:
 * ela cai na DATABASE_URL, com aviso.
 *
 * Exige a credencial DONA do banco (`MIGRATION_DATABASE_URL`; em desenvolvimento cai
 * em `DATABASE_URL`, com AVISO — `scripts/lib/owner-db-url.mjs`). Depois de rodar,
 * cole a URL impressa em `DATABASE_URL` do serviço `vuumbora-backend` e confira com
 * `node scripts/conferir-papel-api.mjs` (usando essa MESMA URL).
 *
 * A senha gerada é base64url (24 bytes aleatórios): só usa `A-Z a-z 0-9 - _`, nenhum
 * caractere que precise de escape numa URL `postgres://`.
 *
 * Esta ferramenta NUNCA imprime a URL dona — só a nova URL do `vuumbora_api`.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { resolveOwnerDatabaseUrl } from './lib/owner-db-url.mjs';

const { Client } = pg;
const API_ROLE = 'vuumbora_api';

function generatePassword() {
  return randomBytes(24).toString('base64url');
}

function withCredentials(ownerUrl, username, password) {
  const url = new URL(ownerUrl);
  url.username = username;
  url.password = password;
  return url.toString();
}

async function main() {
  const ownerUrl = resolveOwnerDatabaseUrl('ativar-papel-api');

  const ownerUser = new URL(ownerUrl).username;
  if (ownerUser === API_ROLE) {
    console.error(
      `[ativar-papel-api] a credencial resolvida já é do usuário "${API_ROLE}" — rode isto com a credencial DONA ` +
        `(MIGRATION_DATABASE_URL), não com a DATABASE_URL da própria API.`,
    );
    process.exit(1);
  }

  const password = generatePassword();

  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const sql = `ALTER ROLE ${client.escapeIdentifier(API_ROLE)} LOGIN PASSWORD ${client.escapeLiteral(password)}`;
    await client.query(sql);
  } finally {
    await client.end();
  }

  const apiUrl = withCredentials(ownerUrl, API_ROLE, password);

  console.log(`[ativar-papel-api] senha de "${API_ROLE}" trocada com sucesso.`);
  console.log('[ativar-papel-api] cole isto em DATABASE_URL do serviço da API (mesmo host, porta, banco e parâmetros — só o usuário muda):');
  console.log('');
  console.log(apiUrl);
  console.log('');
  console.log('[ativar-papel-api] depois, confira com: DATABASE_URL="<a URL acima>" node scripts/conferir-papel-api.mjs');
}

main().catch((err) => {
  // Nunca err.message: a query roda com a senha nova embutida (via escapeLiteral) e um erro do driver
  // pode ecoar trecho da query. O código já basta para diagnosticar (ex.: 28P01 senha/usuário, role "x" não existe).
  console.error(`[ativar-papel-api] falhou (${err?.code ?? err?.name ?? 'erro'}).`);
  process.exit(1);
});
