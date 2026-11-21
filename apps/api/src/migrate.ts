/**
 * Preparação automática do banco, no boot do servidor.
 *
 * Por que existe: em 19/11/2026 a publicação do backend exigia abrir o
 * console do Postgres e colar SQL à mão. Na primeira tentativa o console
 * estava conectado ao banco `postgres`, não ao `vuumbora` — as tabelas
 * teriam nascido no lugar errado e a API falharia depois, com o banco
 * "existindo" e vazio. Um passo manual que precisa acertar o banco certo
 * no console certo é um passo que vai errar algum dia.
 *
 * O que este módulo faz, nesta ordem:
 *   1. CRIA o banco apontado pela DATABASE_URL, se ele não existir.
 *   2. ESPERA o banco aceitar conexão (o Postgres costuma subir depois da API).
 *   3. APLICA as migrações pendentes de `migrations/`, sob advisory lock.
 *
 * Idempotente de ponta a ponta: subir duas vezes, ou subir duas réplicas
 * ao mesmo tempo, não duplica nada e não quebra.
 *
 * Esta é a ÚNICA implementação de migração do projeto. `scripts/migrate.mjs`
 * é um atalho de linha de comando que chama daqui — de propósito, para não
 * existirem duas portas mantendo metades diferentes do mesmo estado.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { Pool } from 'pg';

const { Client } = pg;

/**
 * `dist/migrate.js` → `dist/../migrations`, e `src/migrate.ts` (via tsx) →
 * `src/../migrations`. Os dois caem em `apps/api/migrations`, e na imagem
 * Docker em `/app/migrations`. Relativo ao arquivo, nunca ao diretório de
 * trabalho: `npm run migrate` roda de lugares diferentes.
 */
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * Chave do advisory lock. Qualquer número serve, desde que seja SEMPRE o
 * mesmo: é ele que faz duas réplicas subindo juntas aplicarem a migração
 * uma de cada vez, em vez de as duas tentarem criar a mesma tabela.
 */
const LOCK_KEY = 728310001;

/** Bancos de manutenção aos quais dá para conectar quando o alvo ainda não existe. */
const BANCOS_DE_MANUTENCAO = ['postgres', 'template1'] as const;

export type Log = (mensagem: string) => void;

const logPadrao: Log = (mensagem) => console.log(mensagem);

/**
 * Nome de banco vira identificador SQL, e identificador não aceita
 * parâmetro ($1). Aspas duplas com escape é o jeito correto; o nome vem da
 * própria DATABASE_URL, mas tratar como confiável por vir "de dentro" é
 * como injeção entra.
 */
function citarIdentificador(nome: string): string {
  // eslint-disable-next-line no-control-regex
  if (nome.length === 0 || /\u0000/.test(nome)) {
    throw new Error('nome de banco inválido na DATABASE_URL');
  }
  return `"${nome.split('"').join('""')}"`;
}

/** Nome do banco alvo e a mesma URL apontando para outro banco. */
function lerUrl(databaseUrl: string): { nome: string; apontarPara: (banco: string) => string } | null {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return null; // formato chave=valor, por exemplo — não dá para reescrever com segurança
  }
  const nome = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (nome.length === 0) return null;
  return {
    nome,
    apontarPara: (banco) => {
      const outra = new URL(databaseUrl);
      outra.pathname = `/${encodeURIComponent(banco)}`;
      return outra.toString();
    },
  };
}

function espera(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cria o banco da DATABASE_URL se ele não existir.
 *
 * Nunca é fatal por falta de permissão: em Postgres gerenciado é comum o
 * usuário da aplicação não poder criar banco — e nesse caso o banco já foi
 * criado pelo provedor. Quem decide é a conexão seguinte, não um palpite aqui.
 */
export async function garantirBanco(databaseUrl: string, log: Log = logPadrao): Promise<void> {
  const url = lerUrl(databaseUrl);
  if (!url) {
    log('[migrate] não consegui ler o nome do banco na DATABASE_URL; pulando a criação.');
    return;
  }

  for (const manutencao of BANCOS_DE_MANUTENCAO) {
    if (manutencao === url.nome) {
      log(`[migrate] o banco alvo é "${url.nome}"; nada a criar.`);
      return;
    }

    const client = new Client({
      connectionString: url.apontarPara(manutencao),
      connectionTimeoutMillis: 5_000,
    });
    try {
      await client.connect();
    } catch {
      continue; // tenta o próximo banco de manutenção
    }

    try {
      const existe = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [url.nome]);
      if ((existe.rowCount ?? 0) > 0) {
        log(`[migrate] banco "${url.nome}" já existe.`);
        return;
      }

      // CREATE DATABASE não roda dentro de transação e não aceita IF NOT EXISTS.
      await client.query(`CREATE DATABASE ${citarIdentificador(url.nome)}`);
      log(`[migrate] banco "${url.nome}" criado.`);
      return;
    } catch (err) {
      const codigo = (err as { code?: string }).code;
      if (codigo === '42501') {
        log(`[migrate] sem permissão para criar banco; assumindo que "${url.nome}" já existe.`);
        return;
      }

      // Falhou o CREATE: a única pergunta que importa é se o banco existe
      // AGORA. Não dá para decidir isso pelo código de erro. Medido em
      // 19/11/2026 com três instâncias subindo juntas: duas receberam
      // `23505` (unique_violation em pg_database_datname_index), não o
      // `42P04` (duplicate_database) que se espera — e morreram no boot.
      // Perguntar ao banco cobre qualquer código que o Postgres devolva.
      try {
        const agora = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [url.nome]);
        if ((agora.rowCount ?? 0) > 0) {
          log(`[migrate] banco "${url.nome}" já existe (criado em paralelo).`);
          return;
        }
      } catch {
        // Sem resposta para a conferência: cai no erro original, abaixo.
      }

      throw new Error(`falha ao criar o banco "${url.nome}": ${(err as Error).message}`);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  log('[migrate] nenhum banco de manutenção aceitou conexão; sigo direto para o alvo.');
}

/** Espera o banco alvo aceitar conexão. O Postgres costuma subir depois da API. */
export async function esperarBanco(pool: Pool, segundos: number, log: Log = logPadrao): Promise<void> {
  const limite = Date.now() + segundos * 1000;
  let tentativa = 0;

  for (;;) {
    tentativa += 1;
    try {
      await pool.query('SELECT 1');
      if (tentativa > 1) log(`[migrate] banco respondeu na tentativa ${tentativa}.`);
      return;
    } catch (err) {
      const motivo = (err as Error).message;
      if (Date.now() >= limite) {
        throw new Error(`banco não respondeu em ${segundos}s (${tentativa} tentativas): ${motivo}`);
      }
      if (tentativa === 1) log(`[migrate] esperando o banco responder (até ${segundos}s)...`);
      await espera(1_000);
    }
  }
}

/**
 * Aplica, em ordem alfabética, todo `.sql` de `migrations/` que ainda não
 * está registrado em `schema_migrations`.
 *
 * Cada arquivo roda dentro da própria transação, junto com o registro:
 * ou a migração inteira entra e fica marcada, ou nada dela entra. Nunca
 * sobra meio banco.
 */
export async function aplicarMigracoes(pool: Pool, log: Log = logPadrao): Promise<number> {
  const arquivos = readdirSync(MIGRATIONS_DIR)
    .filter((nome) => nome.endsWith('.sql'))
    .sort();

  const client = await pool.connect();
  let aplicadas = 0;

  try {
    // Uma réplica de cada vez. Sem isso, duas instâncias subindo ao mesmo
    // tempo aplicam a mesma migração em paralelo.
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const jaAplicadas = new Set<string>(
      (await client.query('SELECT id FROM schema_migrations')).rows.map((linha) => linha.id as string),
    );

    for (const arquivo of arquivos) {
      if (jaAplicadas.has(arquivo)) continue;

      const sql = readFileSync(join(MIGRATIONS_DIR, arquivo), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [arquivo]);
        await client.query('COMMIT');
        log(`[migrate] aplicada: ${arquivo}`);
        aplicadas += 1;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new Error(`falha ao aplicar ${arquivo}: ${(err as Error).message}`);
      }
    }

    log(`[migrate] ${aplicadas} migração(ões) nova(s), ${arquivos.length} no total.`);
    return aplicadas;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

export interface OpcoesDePreparo {
  databaseUrl: string;
  pool: Pool;
  criarBanco?: boolean;
  esperaEmSegundos?: number;
  log?: Log;
  /**
   * Credencial DONA do banco, usada só para criar o banco e migrar. Quando a
   * API roda com um papel restrito (`vuumbora_api`, sem DDL e sem UPDATE/DELETE
   * em `admin_audit_log` — migração 0012), esse papel não consegue migrar.
   * Se omitido, lê `MIGRATION_DATABASE_URL` do ambiente; se também ausente,
   * tudo roda com `databaseUrl` (comportamento anterior, sem mudança).
   */
  migrationDatabaseUrl?: string;
}

/** Os três passos juntos: criar, esperar, migrar. */
export async function prepararBanco(opcoes: OpcoesDePreparo): Promise<void> {
  const { databaseUrl, pool, criarBanco = true, esperaEmSegundos = 60, log = logPadrao } = opcoes;
  const migrationUrl = (opcoes.migrationDatabaseUrl ?? process.env['MIGRATION_DATABASE_URL'] ?? '').trim();

  if (migrationUrl.length === 0) {
    if (criarBanco) {
      await garantirBanco(databaseUrl, log);
    }
    await esperarBanco(pool, esperaEmSegundos, log);
    await aplicarMigracoes(pool, log);
    return;
  }

  // Credenciais separadas: o dono do banco cria e migra; só depois a API
  // (papel restrito) é esperada — o papel só existe depois da migração 0012.
  log('[migrate] MIGRATION_DATABASE_URL definido: migrando com a credencial dona do banco.');
  if (criarBanco) {
    await garantirBanco(migrationUrl, log);
  }
  const donoPool = new pg.Pool({ connectionString: migrationUrl, max: 1 });
  try {
    await esperarBanco(donoPool, esperaEmSegundos, log);
    await aplicarMigracoes(donoPool, log);
  } finally {
    await donoPool.end().catch(() => undefined);
  }
  await esperarBanco(pool, esperaEmSegundos, log);
}
