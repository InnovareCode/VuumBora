/**
 * PRIMEIRO import de todo teste: fixa o ambiente ANTES de `src/env.ts`
 * carregar. Recusa rodar contra qualquer banco cujo nome não termine em
 * `_test` — os testes truncam tabelas.
 *
 * Valores de teste NUNCA vêm do `.env`. Antes, estes eram `process.env[x] ??= valor` DEPOIS do
 * `import 'dotenv/config'`: `??=` só preenche `null`/`undefined`, então um `.env` copiado do
 * `.env.example` (que traz `ADMIN_TOTP_ENCRYPTION_KEY=` vazio e `ADMIN_LOGIN_RATE_LIMIT_MAX=5`)
 * vencia o valor de teste e derrubava dezenas de testes. Agora só um valor que o PRÓPRIO teste
 * fixou antes de importar este arquivo (`no-key.ts`, `ip-limit-env.ts`, ou o ambiente do shell)
 * é respeitado; o resto é o valor de teste, sempre, qualquer que seja o `.env`.
 */
import dotenv from 'dotenv';

// 1) O que já estava no ambiente ANTES de ler o `.env` (preâmbulos dos testes e variáveis do shell/CI).
const presetKey = process.env['ADMIN_TOTP_ENCRYPTION_KEY'];
const presetLoginLimit = process.env['ADMIN_LOGIN_RATE_LIMIT_MAX'];

// 2) O `.env` (só para o que os testes não controlam, como DATABASE_URL). `DOTENV_CONFIG_PATH` aponta outro arquivo.
dotenv.config({ quiet: true, ...(process.env['DOTENV_CONFIG_PATH'] ? { path: process.env['DOTENV_CONFIG_PATH'] } : {}) });

const databaseUrl = process.env['DATABASE_URL'] ?? '';
const databaseName = decodeURIComponent(new URL(databaseUrl || 'postgres://x/none').pathname.replace(/^\//, ''));
if (!databaseName.endsWith('_test')) {
  throw new Error(`testes só rodam em banco terminado em "_test" (encontrado: "${databaseName}")`);
}

process.env['NODE_ENV'] = 'test';
process.env['LOG_LEVEL'] = 'info';
// Chave fixa só de teste (32 bytes). Um teste que precisa dela AUSENTE (no-key.ts) a define '' antes de importar isto;
// o `.env` nunca decide (por isso `presetKey !== undefined`, e não `||`: '' é um valor, não "ausente").
process.env['ADMIN_TOTP_ENCRYPTION_KEY'] = presetKey !== undefined ? presetKey : Buffer.alloc(32, 7).toString('base64');
// Limite por IP alto: os testes fazem dezenas de logins do mesmo 127.0.0.1. O teste do limite por IP fixa um valor
// baixo antes de importar este arquivo (ip-limit-env.ts).
process.env['ADMIN_LOGIN_RATE_LIMIT_MAX'] = presetLoginLimit !== undefined ? presetLoginLimit : '1000';
process.env['ADMIN_TOTP_MAX_ATTEMPTS'] = '5';
process.env['ADMIN_TOTP_LOCK_MINUTES'] = '15';
