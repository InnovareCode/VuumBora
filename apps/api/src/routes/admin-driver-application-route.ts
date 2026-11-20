/** Rota HTTP — só traduz requisição/resposta. Validação e regra de negócio (inclusive o audit log) ficam fora daqui. Sem aprovar/recusar nesta fatia — só ver. */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAdminRole } from '../hooks/require-admin.js';
import {
  getDriverApplicationForAdmin,
  getDriverApplicationSummary,
  listDriverApplicationsForAdmin,
} from '../services/admin-driver-application-service.js';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

const listQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  cursor: z.string().trim().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid('Identificador inválido.') });

// Candidatura de motorista é papel `dono`/`operacao` na matriz do dono
// (docs/decisoes-do-dono.md → "Proposta de papéis") — revisor de
// documentos, financeiro e suporte não acessam esta rota.
const requireDriverApplicationAccess = requireAdminRole('dono', 'operacao');

function sendInvalidQuery(reply: FastifyReply): void {
  reply.code(400).send({ ok: false, error: { code: 'invalid_query', message: 'Parâmetros de busca inválidos.' } });
}

export function registerAdminDriverApplicationRoutes(app: FastifyInstance): void {
  // Rota estática registrada antes da rota com `:id` — o roteador do Fastify já
  // prioriza caminho estático sobre parâmetro de qualquer forma, mas a ordem aqui
  // deixa isso explícito para quem ler o arquivo depois.
  app.get('/v1/admin/driver-applications/summary', { preHandler: requireDriverApplicationAccess }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const counts = await getDriverApplicationSummary(pool);
    reply.code(200).send({ ok: true, data: counts });
  });

  app.get('/v1/admin/driver-applications/:id', { preHandler: requireDriverApplicationAccess }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsedParams = idParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      reply.code(400).send({ ok: false, error: { code: 'invalid_params', message: 'Identificador inválido.' } });
      return;
    }

    // `requireAdmin` já rodou e preencheu `request.admin` — garantido pelo preHandler, por isso o `!`.
    const application = await getDriverApplicationForAdmin(pool, parsedParams.data.id, {
      adminId: request.admin!.id,
      ipAddress: request.ip,
    });

    if (!application) {
      reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Candidatura não encontrada.' } });
      return;
    }

    reply.code(200).send({ ok: true, data: application });
  });

  app.get('/v1/admin/driver-applications', { preHandler: requireDriverApplicationAccess }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsedQuery = listQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      sendInvalidQuery(reply);
      return;
    }

    const { status, q, cursor, limit } = parsedQuery.data;
    const result = await listDriverApplicationsForAdmin(
      pool,
      { status, q, cursor, limit: limit ?? DEFAULT_LIMIT },
      { adminId: request.admin!.id, ipAddress: request.ip },
    );

    if (!result.ok) {
      reply.code(400).send({ ok: false, error: { code: 'invalid_cursor', message: 'Cursor de paginação inválido.' } });
      return;
    }

    reply.code(200).send({ ok: true, data: { items: result.items, nextCursor: result.nextCursor } });
  });
}
