#!/usr/bin/env node
/**
 * Retenção da identidade dos apps: apaga tentativas de login, trilha de acesso,
 * sessões vencidas, códigos de e-mail antigos e contas NUNCA verificadas há mais de
 * 7 dias (achado M-5 e I-4, LGPD).
 *
 * RODE COM A CREDENCIAL DONA DO BANCO, não a da API: `access_log` é
 * append-only para o papel `vuumbora_api` (migração 0012). Por isso lê
 * `MIGRATION_DATABASE_URL` (a mesma credencial que migra) e só cai em
 * `DATABASE_URL` se ela não existir — e AVISA, porque com o papel restrito o
 * DELETE em `access_log` falha.
 *
 * Uso (cron diário do Easypanel, dentro do contêiner do backend):
 *   node scripts/retention-identity.mjs
 *   node scripts/retention-identity.mjs --login-attempts-days=2 --access-log-days=90 \
 *        --session-families-days=7 --email-codes-days=7 --unverified-accounts-days=7
 *
 * Requer `dist/` construído (a lógica vive em src/lib/identity-retention.ts).
 * Não imprime dado pessoal: só a contagem de linhas apagadas por tabela.
 */
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

function intFlag(argv, name, fallback) {
  const flag = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!flag) return fallback;
  const value = Number(flag.slice(name.length + 3));
  if (!Number.isInteger(value) || value < 1) {
    console.error(`[retention] --${name} deve ser um inteiro >= 1.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const owner = process.env.MIGRATION_DATABASE_URL;
  const databaseUrl = owner || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[retention] defina MIGRATION_DATABASE_URL (credencial dona) ou DATABASE_URL.');
    process.exit(1);
  }
  if (!owner) {
    console.warn('[retention] AVISO: usando DATABASE_URL. Com o papel restrito da API o DELETE em access_log falha; use a credencial dona.');
  }

  let retention;
  try {
    retention = await import('../dist/lib/identity-retention.js');
  } catch {
    console.error('[retention] dist/ não encontrado: rode `npm run build` antes.');
    process.exit(1);
  }

  const argv = process.argv.slice(2);
  const d = retention.DEFAULT_RETENTION;
  const policy = {
    loginAttemptsDays: intFlag(argv, 'login-attempts-days', d.loginAttemptsDays),
    accessLogDays: intFlag(argv, 'access-log-days', d.accessLogDays),
    sessionFamiliesDays: intFlag(argv, 'session-families-days', d.sessionFamiliesDays),
    emailCodesDays: intFlag(argv, 'email-codes-days', d.emailCodesDays),
    unverifiedAccountsDays: intFlag(argv, 'unverified-accounts-days', d.unverifiedAccountsDays),
  };

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const report = await retention.runIdentityRetention(pool, policy);
    console.log(`[retention] apagados: ${JSON.stringify(report)}`);
  } catch (err) {
    // Sem err.message: pode ecoar trecho da connection string.
    console.error(`[retention] falhou (${err?.code ?? err?.name ?? 'erro'}).`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
