/**
 * Rota HTTP — só traduz requisição/resposta. Validação e regra de negócio
 * (inclusive o audit log) ficam fora daqui. Agora inclui as duas mutações
 * desta fatia: aprovar e recusar — o resto (listar, detalhe, resumo)
 * continua só leitura.
 *
 * Caminhos RELATIVOS ao prefixo `/v1/admin` (aplicado em `app.ts`, ver o
 * comentário lá sobre por que o CORS do contexto admin precisa de um
 * prefixo de registro, não só de convenção de string).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pool } from '../db.js';
import { adminRouteRateLimit } from '../lib/admin-rate-limit.js';
import { requireAdminRole, requireCsrfToken } from '../hooks/require-admin.js';
import {
  approveDriverApplicationForAdmin,
  getDriverApplicationForAdmin,
  getDriverApplicationSummary,
  listDriverApplicationsForAdmin,
  rejectDriverApplicationForAdmin,
  type DecideDriverApplicationOutcome,
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

// Mínimo razoável para um motivo de recusa útil (não um "x" qualquer) sem
// exigir um texto longo — é lido por um humano, não processado.
const REJECT_REASON_MIN_LENGTH = 10;
const rejectBodySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(REJECT_REASON_MIN_LENGTH, `Informe um motivo com pelo menos ${REJECT_REASON_MIN_LENGTH} caracteres.`)
    .max(1000, 'Motivo muito longo.'),
});

// Cabeçalho obrigatório nas duas mutações — ver `decideDriverApplication`
// em `admin-driver-application-service.ts` para como ele garante que um
// retry com a MESMA chave nunca duplica efeito.
const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const idempotencyKeySchema = z.string().trim().min(1, 'Informe Idempotency-Key.').max(200, 'Idempotency-Key muito longo.');

// Candidatura de motorista é papel `dono`/`operacao` na matriz do dono
// (docs/decisoes-do-dono.md → "Proposta de papéis") — revisor de
// documentos, financeiro e suporte não acessam esta rota.
const requireDriverApplicationAccess = requireAdminRole('dono', 'operacao');

// Toda mutação desta rota exige sessão+papel E CSRF, nesta ordem — o
// segundo depende de `request.adminCsrfToken`, só preenchido pelo primeiro.
const requireMutationAccess = [requireDriverApplicationAccess, requireCsrfToken];

function sendInvalidQuery(reply: FastifyReply): void {
  reply.code(400).send({ ok: false, error: { code: 'invalid_query', message: 'Parâmetros de busca inválidos.' } });
}

function sendInvalidParams(reply: FastifyReply): void {
  reply.code(400).send({ ok: false, error: { code: 'invalid_params', message: 'Identificador inválido.' } });
}

function sendMissingIdempotencyKey(reply: FastifyReply): void {
  reply.code(400).send({ ok: false, error: { code: 'idempotency_key_required', message: 'Informe o cabeçalho Idempotency-Key.' } });
}

function sendDecisionOutcome(reply: FastifyReply, outcome: DecideDriverApplicationOutcome): void {
  if (!outcome.ok) {
    if (outcome.reason === 'not_found') {
      reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Candidatura não encontrada.' } });
      return;
    }
    // `reason` (não só `code`) porque o cliente admin (apps/admin/src/api/client.ts,
    // `mapStatusToError`) lê `error.reason` para popular `ApiError.kind === 'conflict'`.
    reply.code(409).send({
      ok: false,
      error: {
        code: 'invalid_transition',
        reason: 'invalid_transition',
        message: 'A candidatura não está mais pendente — ela já foi decidida.',
      },
    });
    return;
  }

  // Replay (mesma Idempotency-Key de uma decisão já aplicada) devolve o
  // mesmo 200 com o mesmo corpo — do ponto de vista do cliente, sucesso é
  // sucesso, não importa se foi agora ou numa tentativa anterior que ele
  // não viu confirmar.
  //
  // `decisionReason` só entra na resposta quando existe (recusa) — contrato
  // combinado com apps/admin (`DriverApplicationDecision.decisionReason?:
  // string`, campo OPCIONAL, nunca `null`). Omitir em aprovação, não mandar
  // `null`.
  const { decisionReason, ...rest } = outcome.data;
  reply.code(200).send({ ok: true, data: decisionReason !== null ? { ...rest, decisionReason } : rest });
}

export function registerAdminDriverApplicationRoutes(app: FastifyInstance): void {
  // Rota estática registrada antes da rota com `:id` — o roteador do Fastify já
  // prioriza caminho estático sobre parâmetro de qualquer forma, mas a ordem aqui
  // deixa isso explícito para quem ler o arquivo depois.
  app.get('/driver-applications/summary', { ...adminRouteRateLimit(), preHandler: requireDriverApplicationAccess }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const counts = await getDriverApplicationSummary(pool);
    reply.code(200).send({ ok: true, data: counts });
  });

  app.get('/driver-applications/:id', { ...adminRouteRateLimit(), preHandler: requireDriverApplicationAccess }, async (request: FastifyRequest, reply: FastifyReply) => {
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

  app.get('/driver-applications', { ...adminRouteRateLimit(), preHandler: requireDriverApplicationAccess }, async (request: FastifyRequest, reply: FastifyReply) => {
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

  app.post(
    '/driver-applications/:id/approve',
    { ...adminRouteRateLimit(), preHandler: requireMutationAccess },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsedParams = idParamSchema.safeParse(request.params);
      if (!parsedParams.success) {
        sendInvalidParams(reply);
        return;
      }

      const parsedKey = idempotencyKeySchema.safeParse(request.headers[IDEMPOTENCY_KEY_HEADER]);
      if (!parsedKey.success) {
        sendMissingIdempotencyKey(reply);
        return;
      }

      // `requireAdminRole` (dentro de `requireMutationAccess`) já garantiu `request.admin` — por isso o `!`.
      const outcome = await approveDriverApplicationForAdmin(pool, parsedParams.data.id, {
        adminId: request.admin!.id,
        adminName: request.admin!.name,
        ipAddress: request.ip,
        idempotencyKey: parsedKey.data,
      });

      sendDecisionOutcome(reply, outcome);
    },
  );

  app.post(
    '/driver-applications/:id/reject',
    { ...adminRouteRateLimit(), preHandler: requireMutationAccess },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsedParams = idParamSchema.safeParse(request.params);
      if (!parsedParams.success) {
        sendInvalidParams(reply);
        return;
      }

      const parsedKey = idempotencyKeySchema.safeParse(request.headers[IDEMPOTENCY_KEY_HEADER]);
      if (!parsedKey.success) {
        sendMissingIdempotencyKey(reply);
        return;
      }

      const parsedBody = rejectBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        // Mensagem própria, nunca a do Zod (`issues[0].message`) — quando o
        // corpo nem tem `reason` (campo ausente/tipo errado), o Zod devolve
        // o texto padrão em INGLÊS ("Invalid input: expected string,
        // received undefined"), que não é o que o admin deve ler. Só o
        // caso "motivo longo demais" tem mensagem própria diferente.
        const tooLong = parsedBody.error.issues[0]?.code === 'too_big';
        const message = tooLong ? 'Motivo muito longo.' : `Informe um motivo com pelo menos ${REJECT_REASON_MIN_LENGTH} caracteres.`;
        // `fields` no mesmo formato das outras rotas de validação deste
        // serviço — deixa o cliente (`apps/admin`, `ApiError.kind ===
        // 'validation'`) apontar o campo exato, não só uma mensagem solta.
        reply.code(400).send({ ok: false, error: { code: 'validation_failed', message, fields: { reason: message } } });
        return;
      }

      const outcome = await rejectDriverApplicationForAdmin(pool, parsedParams.data.id, parsedBody.data.reason, {
        adminId: request.admin!.id,
        adminName: request.admin!.name,
        ipAddress: request.ip,
        idempotencyKey: parsedKey.data,
      });

      sendDecisionOutcome(reply, outcome);
    },
  );
}
