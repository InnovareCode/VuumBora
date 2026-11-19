/** Rota HTTP — só traduz requisição/resposta. Validação e regra de negócio ficam fora daqui. */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pool } from '../db.js';
import { env } from '../env.js';
import { normalizeBrazilianPhone, normalizeBrazilianState } from '../domain/phone.js';
import { submitDriverApplication } from '../services/driver-application-service.js';

/**
 * Mensagens próprias, em português, nunca a mensagem default do zod: assim
 * o texto que o site mostra não depende da versão/idioma interno da lib.
 * Cada mensagem já fica presa ao campo certo (via segundo argumento dos
 * validadores/`.refine`) — isso é o que alimenta `fields` na resposta de
 * erro, abaixo.
 */
const bodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe o nome completo.')
    .max(120, 'Nome muito longo.'),
  phone: z
    .string()
    .trim()
    .min(8, 'Celular inválido — informe DDD e número.')
    .max(20, 'Celular inválido — informe DDD e número.')
    .refine(
      (value) => normalizeBrazilianPhone(value) !== null,
      'Celular inválido — informe um número de WhatsApp válido com DDD.',
    )
    .transform((value) => normalizeBrazilianPhone(value) as string),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'E-mail inválido.')
    .max(254, 'E-mail inválido.')
    .email('E-mail inválido.'),
  city: z
    .string()
    .trim()
    .min(2, 'Informe a cidade onde você dirige.')
    .max(120, 'Cidade inválida.'),
  state: z
    .string()
    .trim()
    .min(2, 'Informe a UF.')
    .max(2, 'UF inválida — use a sigla do estado (ex.: RN).')
    .refine(
      (value) => normalizeBrazilianState(value) !== null,
      'UF inválida — use a sigla de um estado brasileiro (ex.: RN).',
    )
    .transform((value) => normalizeBrazilianState(value) as string),
  alreadyDrivesForApp: z.boolean({ message: 'Valor inválido para "já dirige por aplicativo".' }).optional(),
  hasOwnVehicle: z.boolean({ message: 'Valor inválido para "tem veículo próprio".' }).optional(),
});

/**
 * Corpo sem a forma esperada (não é objeto — string/array/número/ausente).
 * Diferente de erro de campo: não há "campo certo" para apontar, então a
 * resposta não leva `fields`.
 */
function sendInvalidBodyError(reply: FastifyReply): void {
  reply.code(400).send({
    ok: false,
    error: { code: 'invalid_body', message: 'Corpo da requisição inválido.' },
  });
}

/**
 * Um ou mais campos inválidos — devolve TODOS de uma vez (não só o
 * primeiro), para o formulário mostrar cada erro no campo certo numa
 * passada só. Formato combina com `ApiError` (kind: 'validation') em
 * `packages/api-client/src/driver-applications`.
 */
function sendValidationError(reply: FastifyReply, fields: Readonly<Record<string, string>>): void {
  reply.code(400).send({
    ok: false,
    error: {
      code: 'validation_failed',
      message: 'Verifique os campos destacados.',
      fields,
    },
  });
}

export function registerDriverApplicationRoute(app: FastifyInstance): void {
  app.post(
    '/v1/driver-applications',
    {
      config: {
        rateLimit: {
          max: env.DRIVER_APPLICATION_RATE_LIMIT_MAX,
          timeWindow: env.DRIVER_APPLICATION_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        const issues = parsed.error.issues;
        // path vazio = corpo não é nem um objeto (string/array/número/ausente) — não é erro de campo.
        if (issues.some((issue) => issue.path.length === 0)) {
          request.log.info({ event: 'driver_application_rejected', reason: 'invalid_body' });
          sendInvalidBodyError(reply);
          return;
        }

        const fields: Record<string, string> = {};
        for (const issue of issues) {
          const field = String(issue.path[0]);
          if (!(field in fields)) fields[field] = issue.message;
        }
        request.log.info({
          event: 'driver_application_rejected',
          reason: 'validation_failed',
          fields: Object.keys(fields),
        });
        sendValidationError(reply, fields);
        return;
      }

      try {
        await submitDriverApplication(pool, parsed.data);
        request.log.info({ event: 'driver_application_processed' });
        reply.code(200).send({ ok: true });
      } catch (err) {
        request.log.error({ event: 'driver_application_failed', message: (err as Error).message });
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
