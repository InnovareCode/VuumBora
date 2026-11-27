#!/usr/bin/env node
/**
 * Purga das cotações com mais de 30 dias (M4, fatia G4; `purge_fare_quotes` da migração 0026). A cotação guarda origem e
 * destino (com o texto que o passageiro confirmou): é localização, e cotação que não virou corrida não tem valor depois de
 * vencer (`docs/plano-sistema-dados.md` §2). A exclusão da conta já apaga as dela NA HORA (gatilho da 0026); isto é o resto.
 *
 * Chama `purge_fare_quotes(lote)` repetidas vezes, mais antigas primeiro, até voltar 0. O prazo de 30 dias é fixo NO BANCO
 * (política, não parâmetro): este script não escolhe o que apagar, só repete até acabar.
 *
 * COMO O OPERADOR RODA (Easypanel, serviço `vuumbora-backend`):
 *   - agendar UM cron diário (sugestão: 04:00 de Natal = 07:00 UTC, fora do pico) no MESMO contêiner da API, com o comando
 *       node scripts/purge-fare-quotes.mjs
 *     (ou `npm run quotes:purge`, SEM `-w`: dentro da imagem a raiz é o próprio `apps/api` e `-w @vuumbora/api` responde
 *     `No workspaces found`). No monorepo, em desenvolvimento: `npm run quotes:purge -w @vuumbora/api`.
 *   - variáveis: só a `DATABASE_URL` do serviço. O papel restrito `vuumbora_api` basta (tem EXECUTE na função, que é
 *     SECURITY DEFINER); NÃO use a credencial dona.
 *   - rodar duas vezes, ou atrasar um dia, não faz mal: o que já saiu não volta e o que falta sai na próxima. Duas execuções
 *     SIMULTÂNEAS não brigam: a segunda vê a trava e desiste.
 *   - lote: `--batch=N` (1 a 50000; padrão 5000). Lote menor = transações mais curtas.
 *
 * Não imprime dado pessoal: só contagens. Não precisa de `dist/` (é só SQL). Sai com código 1 se falhar (o cron mostra).
 */
import 'dotenv/config';
import pg from 'pg';

const DEFAULT_BATCH = 5000;
/** Teto de voltas: 50 mil lotes de 5000 = 250 milhões de linhas. Passou disso, algo está errado (laço sem fim). */
const MAX_ROUNDS = 50_000;
/** Trava consultiva desta rotina (duas execuções simultâneas: a segunda desiste). */
const LOCK_KEY = 'vuumbora:purge_fare_quotes';

function parseBatch(argv) {
  const flag = argv.find((arg) => arg.startsWith('--batch='));
  if (!flag) return DEFAULT_BATCH;
  const raw = flag.slice('--batch='.length);
  const value = /^\d{1,5}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value < 1 || value > 50_000) {
    console.error('[quotes-purge] --batch deve ser um inteiro entre 1 e 50000.');
    process.exit(1);
  }
  return value;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[quotes-purge] defina DATABASE_URL (a mesma do serviço da API).');
    process.exit(1);
  }
  const batch = parseBatch(process.argv.slice(2));
  const client = new pg.Client({ connectionString: databaseUrl });
  const startedAt = Date.now();
  try {
    await client.connect();
    const lock = await client.query('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS ok', [LOCK_KEY]);
    if (!lock.rows[0]?.ok) {
      console.log(JSON.stringify({ event: 'quotes_purge_skipped', reason: 'already_running' }));
      return;
    }
    let deleted = 0;
    let rounds = 0;
    for (;;) {
      if (rounds >= MAX_ROUNDS) throw Object.assign(new Error('max_rounds'), { code: 'max_rounds' });
      const result = await client.query('SELECT purge_fare_quotes($1) AS n', [batch]);
      const n = Number(result.rows[0]?.n ?? 0);
      rounds += 1;
      deleted += n;
      if (n === 0) break;
    }
    console.log(JSON.stringify({ event: 'quotes_purged', deleted, rounds, batch, ms: Date.now() - startedAt }));
  } catch (err) {
    // Sem err.message: pode ecoar trecho da connection string.
    console.error(`[quotes-purge] falhou (${err?.code ?? err?.name ?? 'erro'}).`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

await main();
