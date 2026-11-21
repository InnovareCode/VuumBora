/**
 * Importar DEPOIS de `./auth-env.js` e ANTES de `./setup.js`: faz o app do teste
 * conectar COMO o papel de runtime da API (`vuumbora_api`, migração 0012/0017) em vez
 * de como o dono do banco. A conexão do dono fica em `OWNER_DATABASE_URL` (migrar e
 * montar fixtures que a API não tem permissão de escrever, como `admin_users`).
 *
 * Mecanismo: opção de conexão `-c role=vuumbora_api` — equivale a `SET ROLE` em toda
 * conexão do pool. Funciona porque o usuário de teste é superusuário/dono; em CI isto
 * só testa o que importa: os PRIVILÉGIOS efetivos do papel.
 *
 * O `.env` é lido para um objeto À PARTE (`processEnv`), sem tocar `process.env`: se este arquivo
 * carregasse o `.env` no ambiente, `setup.ts` (que vem depois) veria os valores do `.env` como se fossem
 * "fixados pelo teste" e deixaria de aplicar os valores de teste (ver o cabeçalho de `setup.ts`).
 */
import dotenv from 'dotenv';

const fromFile: Record<string, string> = {};
dotenv.config({ quiet: true, processEnv: fromFile, ...(process.env['DOTENV_CONFIG_PATH'] ? { path: process.env['DOTENV_CONFIG_PATH'] } : {}) });

export const OWNER_DATABASE_URL = process.env['DATABASE_URL'] ?? fromFile['DATABASE_URL'] ?? '';

if (OWNER_DATABASE_URL) {
  const url = new URL(OWNER_DATABASE_URL);
  url.searchParams.set('options', '-c role=vuumbora_api');
  process.env['DATABASE_URL'] = url.toString();
}
