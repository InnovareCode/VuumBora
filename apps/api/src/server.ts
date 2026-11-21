import { buildApp } from './app.js';
import { closePool, pool } from './db.js';
import { env } from './env.js';
import { bootSecretProblems } from './lib/boot-secrets.js';
import { prepararBanco } from './migrate.js';

async function main(): Promise<void> {
  // Banco pronto ANTES de aceitar a primeira requisição. Se isto falhar, o
  // processo morre e o Easypanel reinicia: melhor reiniciar em loop visível
  // do que servir um formulário que aceita candidatura e não grava nada.
  if (env.RUN_MIGRATIONS_ON_BOOT) {
    try {
      await prepararBanco({
        databaseUrl: env.DATABASE_URL,
        pool,
        criarBanco: env.CREATE_DATABASE_IF_MISSING,
        esperaEmSegundos: env.DB_BOOT_WAIT_SECONDS,
      });
    } catch (err) {
      // Só a mensagem: o erro inteiro do `pg` pode ecoar a connection string.
      console.error(`[migrate] falhou no boot: ${(err as Error).message}`);
      await closePool().catch(() => undefined);
      process.exit(1);
    }
  }

  // I-3: a credencial DONA só serve para migrar. Daqui em diante ela sai do ambiente do processo
  // (não vai parar em log de diagnóstico nem em processo filho) e o aviso fica no log a cada boot
  // até a infraestrutura tirá-la do contêiner da API (docs/publicar-o-backend.md).
  if (process.env['MIGRATION_DATABASE_URL']) {
    delete process.env['MIGRATION_DATABASE_URL'];
    console.warn('[server] AVISO: MIGRATION_DATABASE_URL (credencial dona do banco) estava no ambiente da API; retire-a do serviço e rode as migrações por tarefa de operador.');
  }

  // Segredos obrigatórios ausentes/fracos: a API sobe (o formulário público e o painel seguem), mas a identidade dos apps e o
  // 2FA do admin respondem 503 — e isso NÃO pode ser silencioso. Aviso alto a cada boot, com NOMES (nunca valores); com
  // REQUIRE_SECRETS=true o boot FALHA (o Easypanel reinicia em loop visível, como na migração). Padrão desligado de propósito:
  // ligá-lo derrubaria também o formulário e o painel que já estão no ar se um segredo novo ainda não foi provisionado.
  const secretProblems = bootSecretProblems();
  if (secretProblems.length > 0) {
    console.error(`[server] ATENÇÃO: segredo(s) obrigatório(s) ausente(s) ou fraco(s): ${secretProblems.join(', ')}. A identidade dos apps (/v1/auth/*) e/ou o 2FA do admin respondem 503 até isto ser corrigido.`);
    if (process.env['REQUIRE_SECRETS'] === 'true') {
      console.error('[server] REQUIRE_SECRETS=true: recusando subir sem os segredos obrigatórios.');
      await closePool().catch(() => undefined);
      process.exit(1);
    }
  }

  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`[server] recebido ${signal}, encerrando...`);
    await app.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
