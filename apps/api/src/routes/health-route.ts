/** GET /healthz — usado pelo HEALTHCHECK do Docker/Easypanel. Não conta no rate limit. */
import type { FastifyInstance } from 'fastify';
import { checkDatabaseConnection } from '../db.js';

export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/healthz', { config: { rateLimit: false } }, async (_request, reply) => {
    const dbOk = await checkDatabaseConnection();
    if (!dbOk) {
      reply.code(503).send({ status: 'unavailable' });
      return;
    }
    reply.code(200).send({ status: 'ok' });
  });
}
