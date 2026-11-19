/** Monta a instância Fastify: plugins (segurança, CORS, rate limit) + rotas. */
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { env } from './env.js';
import { registerDriverApplicationRoute } from './routes/driver-application-route.js';
import { registerHealthRoute } from './routes/health-route.js';
import { registerWaitlistRoute } from './routes/waitlist-route.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    trustProxy: env.TRUST_PROXY,
    // Nenhum payload legítimo deste serviço passa disso — corta corpo gigante antes de parsear.
    bodyLimit: 10 * 1024,
  });

  await app.register(helmet);

  await app.register(cors, {
    origin: env.ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  });

  // Limite global de defesa (além do limite mais estrito da rota de inscrição, abaixo).
  // IMPORTANTE: o plugin dá `throw` no retorno de `errorResponseBuilder` (ver
  // seu index.js) — por isso ele só precisa de `statusCode: 429`; o corpo
  // final de verdade é montado no `setErrorHandler`, abaixo, que também
  // cobre qualquer outro erro lançado antes da rota (ex.: corpo malformado).
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => {
      const err = new Error('rate limited') as FastifyError;
      err.statusCode = 429;
      return err;
    },
  });

  registerHealthRoute(app);
  registerWaitlistRoute(app);
  registerDriverApplicationRoute(app);

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Rota não encontrada.' } });
  });

  // Cobre erros lançados ANTES de chegar na rota (corpo malformado, Content-Type
  // errado, payload maior que `bodyLimit`, limite de requisições excedido) —
  // não só os erros inesperados do handler. Por isso nunca assume 500: lê
  // `statusCode` do erro real e nunca ecoa `err.message` do Fastify (texto em
  // inglês, detalhe de implementação) para quem chama.
  app.setErrorHandler((err: FastifyError, request, reply) => {
    const statusCode = err.statusCode ?? 500;

    if (statusCode === 429) {
      reply.code(429).send({
        ok: false,
        error: { code: 'rate_limited', message: 'Muitas requisições. Tente novamente em alguns minutos.' },
      });
      return;
    }

    if (statusCode >= 400 && statusCode < 500) {
      request.log.info({ event: 'request_rejected', statusCode, message: err.message });
      reply.code(400).send({ ok: false, error: { code: 'invalid_body', message: 'Corpo da requisição inválido.' } });
      return;
    }

    app.log.error({ event: 'unhandled_error', message: err.message });
    reply.code(500).send({ ok: false, error: { code: 'unknown', message: 'Erro interno.' } });
  });

  return app;
}
