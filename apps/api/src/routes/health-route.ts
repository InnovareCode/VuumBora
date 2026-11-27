/**
 * GET /healthz — usado pelo HEALTHCHECK do Docker/Easypanel. Não conta no rate limit, então o resultado fica guardado por
 * poucos segundos (`HEALTHZ_CACHE_SECONDS`, padrão 2): sem isso cada chamada gastava uma das 5 conexões do banco.
 *
 * `testFaresAllowed` (quando o app informa): se a tarifa de TESTE pode cotar (`ALLOW_TEST_FARES`). Em produção tem de ser
 * `false`; fica visível aqui para a conferência do deploy não depender de ler o log. Só o booleano, nenhum outro detalhe.
 */
import type { FastifyInstance } from 'fastify';
import { checkDatabaseConnection } from '../db.js';
import { HealthCheckCache } from '../lib/health-check-cache.js';

export interface HealthRouteOptions {
  /** Prazo do cache em ms (0 desliga). */
  readonly ttlMs?: number;
  /** Só os testes: a verificação do banco e o relógio. */
  readonly check?: () => Promise<boolean>;
  readonly now?: () => number;
  /** `ALLOW_TEST_FARES` efetivo. Omitido = o campo não aparece na resposta. */
  readonly testFaresAllowed?: boolean;
}

export const DEFAULT_HEALTH_CACHE_MS = 2_000;

export function registerHealthRoute(app: FastifyInstance, options: HealthRouteOptions = {}): void {
  const check = options.check ?? checkDatabaseConnection;
  const cache = new HealthCheckCache(options.ttlMs ?? DEFAULT_HEALTH_CACHE_MS, options.now);

  const extra = options.testFaresAllowed === undefined ? {} : { testFaresAllowed: options.testFaresAllowed };
  app.get('/healthz', { config: { rateLimit: false } }, async (_request, reply) => {
    const dbOk = await cache.get(check);
    if (!dbOk) {
      return reply.code(503).send({ status: 'unavailable', ...extra });
    }
    return reply.code(200).send({ status: 'ok', ...extra });
  });
}
