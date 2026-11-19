import { buildApp } from './app.js';
import { closePool, pool } from './db.js';
import { env } from './env.js';
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
