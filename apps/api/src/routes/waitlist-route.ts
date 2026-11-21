/** Rota HTTP — só traduz requisição/resposta. Validação e regra de negócio ficam fora daqui. */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pool } from '../db.js';
import { env } from '../env.js';
import { signUpForWaitlist } from '../services/waitlist-service.js';
import { describeErrorForLog } from '../lib/safe-error.js';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(254).email(),
  profile: z.enum(['passenger', 'driver']).optional(),
});

/**
 * Mensagens próprias, em português, nunca a mensagem default do zod: assim
 * o texto que o site mostra não depende da versão/idioma interno da lib.
 */
const VALIDATION_MESSAGES: Readonly<Record<string, string>> = {
  invalid_email: 'E-mail inválido.',
  invalid_profile: 'Perfil inválido — use "passenger" ou "driver".',
  invalid_body: 'Corpo da requisição inválido.',
};

function sendValidationError(reply: FastifyReply, code: keyof typeof VALIDATION_MESSAGES): void {
  reply.code(400).send({ ok: false, error: { code, message: VALIDATION_MESSAGES[code] } });
}

export function registerWaitlistRoute(app: FastifyInstance): void {
  app.post(
    '/v1/waitlist',
    {
      config: {
        rateLimit: {
          max: env.WAITLIST_RATE_LIMIT_MAX,
          timeWindow: env.WAITLIST_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        const field = parsed.error.issues[0]?.path[0];
        const code = field === 'profile' ? 'invalid_profile' : field === 'email' ? 'invalid_email' : 'invalid_body';
        request.log.info({ event: 'waitlist_signup_rejected', reason: code });
        sendValidationError(reply, code);
        return;
      }

      try {
        await signUpForWaitlist(pool, parsed.data.email, parsed.data.profile);
        request.log.info({ event: 'waitlist_signup_processed' });
        reply.code(200).send({ ok: true });
      } catch (err) {
        request.log.error({ event: 'waitlist_signup_failed', ...describeErrorForLog(err) });
        reply.code(503).send({
          ok: false,
          error: {
            code: 'unavailable',
            message: 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.',
          },
        });
      }
    },
  );
}
