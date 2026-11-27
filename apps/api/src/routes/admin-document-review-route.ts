/**
 * Rotas do PAINEL para a revisão de documentos do motorista (fatia D5 do `docs/plano-m3-m4.md` §3; contrato
 * `DocumentReviewPort` em `packages/api-client/src/admin/types.ts`). Caminhos RELATIVOS ao prefixo `/v1/admin`.
 *
 *   GET  /document-reviews?status&cursor&limit   fila, mais antigo primeiro (auditada)
 *   GET  /drivers/:id                            detalhe com CPF, CNH e endereço (auditado), nunca URL de arquivo
 *   POST /documents/:id/view-url                 URL de visualização ≤ 300 s; a trilha é gravada ANTES (N5)
 *   POST /documents/:id/approve  { expiresOn? }  N4 na mesma transação
 *   POST /documents/:id/reject   { reasonCode, internalNote? }
 *   GET  /document-rejection-reasons
 *   POST /drivers/:id/suspend    { reason }
 *   POST /drivers/:id/reinstate  {}              (acréscimo da D5 ao K0: sair da suspensão tem autor)
 *
 * Papéis: `revisor_documentos` e `dono`; os demais levam `403 forbidden` ANTES de qualquer outra checagem (inclusive
 * 404). Toda mutação exige CSRF e `Idempotency-Key`. O autor é SEMPRE o administrador da sessão.
 * Os handlers DEVOLVEM o envelope (um envio só; ver `lib/early-reply.ts`).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../db.js';
import {
  parseApproveBody,
  parseDocumentId,
  parseIdempotencyKey,
  parseQueueQuery,
  parseRejectBody,
  parseSuspendBody,
  SUSPENSION_REASON_MAX,
  SUSPENSION_REASON_MIN,
} from '../domain/document-review.js';
import { requireAdminRole, requireCsrfToken } from '../hooks/require-admin.js';
import { adminRouteRateLimit } from '../lib/admin-rate-limit.js';
import type { DocumentStorageSetup } from '../lib/document-storage-config.js';
import { describeErrorForLog } from '../lib/safe-error.js';
import * as service from '../services/document-review-service.js';

/** Código → (status, mensagem). As mesmas de `DOCUMENT_REVIEW_ERRORS` (api-client). */
const ERRORS = {
  invalid_body: [400, 'Dados inválidos.'],
  invalid_cursor: [400, 'Cursor de paginação inválido.'],
  validation_failed: [400, `Informe o motivo (${SUSPENSION_REASON_MIN} a ${SUSPENSION_REASON_MAX} caracteres).`],
  idempotency_key_required: [400, 'Informe o cabeçalho Idempotency-Key.'],
  own_registration: [403, 'Ninguém decide sobre o próprio cadastro de motorista.'],
  not_found: [404, 'Não encontrado.'],
  invalid_transition: [409, 'Este documento já foi analisado.'],
  idempotency_key_reused: [409, 'Esta chave já foi usada com outro conteúdo.'],
  driver_not_suspended: [409, 'Este motorista não está suspenso.'],
  approval_blocked: [409, 'Há pendências no cadastro: o motorista não pode voltar a ficar aprovado.'],
  invalid_expires_on: [422, 'Data de validade ausente, inválida ou já passada.'],
  unknown_reason: [422, 'Motivo de recusa desconhecido.'],
  unavailable: [503, 'Serviço indisponível no momento.'],
} as const satisfies Record<string, readonly [number, string]>;

export type DocumentReviewRouteErrorCode = keyof typeof ERRORS;

/** O catálogo do servidor, para o teste conferir contra o do `api-client`. */
export const DOCUMENT_REVIEW_ROUTE_ERRORS: Readonly<Record<DocumentReviewRouteErrorCode, { readonly status: number; readonly message: string }>> = Object.fromEntries(
  Object.entries(ERRORS).map(([code, [status, message]]) => [code, { status, message }]),
) as Record<DocumentReviewRouteErrorCode, { readonly status: number; readonly message: string }>;

const FIELD_BY_CODE: Partial<Record<DocumentReviewRouteErrorCode, string>> = {
  validation_failed: 'reason',
  invalid_expires_on: 'expiresOn',
  unknown_reason: 'reasonCode',
};

function refuse(request: FastifyRequest, reply: FastifyReply, event: string, code: DocumentReviewRouteErrorCode) {
  const [status, message] = ERRORS[code];
  request.log.info({ event, reason: code });
  reply.code(status);
  const field = FIELD_BY_CODE[code];
  // `reason` junto do `code` no 409: o cliente do painel lê `error.reason` para o `kind: 'conflict'`.
  return { ok: false as const, error: { code, message, ...(status === 409 ? { reason: code } : {}), ...(field ? { fields: { [field]: message } } : {}) } };
}

function ok<T>(reply: FastifyReply, data: T) {
  reply.code(200);
  return { ok: true as const, data };
}

function internalFailure(request: FastifyRequest, reply: FastifyReply, err: unknown, event: string) {
  request.log.error({ event, ...describeErrorForLog(err) });
  reply.code(503);
  return { ok: false as const, error: { code: 'unavailable', message: ERRORS.unavailable[1] } };
}

const actorOf = (request: FastifyRequest): service.AdminActor => ({ adminId: request.admin!.id, ipAddress: request.ip });

export interface AdminDocumentReviewRoutesOptions {
  /** `null` = armazenamento não configurado: a visualização responde 503 (falha fechada). */
  readonly documents: DocumentStorageSetup | null;
}

export function registerAdminDocumentReviewRoutes(app: FastifyInstance, options: AdminDocumentReviewRoutesOptions): void {
  // Papel ANTES de tudo (403 para suporte/financeiro/operação, mesmo em id inexistente); mutação também com CSRF.
  const reviewerOnly = requireAdminRole('dono', 'revisor_documentos');
  const read = { ...adminRouteRateLimit(), preHandler: reviewerOnly };
  const mutate = () => ({ ...adminRouteRateLimit(), preHandler: [reviewerOnly, requireCsrfToken] });

  app.get('/document-reviews', read, async (request, reply) => {
    const query = parseQueueQuery(request.query);
    if (!query) return refuse(request, reply, 'document_review_queue_refused', 'invalid_body');
    try {
      const outcome = await service.listQueue(pool, query, actorOf(request));
      if (outcome.kind === 'invalid_cursor') return refuse(request, reply, 'document_review_queue_refused', 'invalid_cursor');
      return ok(reply, { items: outcome.items, ...(outcome.nextCursor !== undefined ? { nextCursor: outcome.nextCursor } : {}) });
    } catch (err) {
      return internalFailure(request, reply, err, 'document_review_queue_failed_internal');
    }
  });

  app.get('/document-rejection-reasons', read, async (request, reply) => {
    try {
      return ok(reply, await service.rejectionReasons(pool));
    } catch (err) {
      return internalFailure(request, reply, err, 'document_rejection_reasons_failed_internal');
    }
  });

  app.get<{ Params: { id: string } }>('/drivers/:id', read, async (request, reply) => {
    const driverId = parseDocumentId(request.params.id);
    if (!driverId) return refuse(request, reply, 'admin_driver_detail_refused', 'not_found');
    try {
      const detail = await service.getDriverDetail(pool, driverId, actorOf(request));
      if (!detail) return refuse(request, reply, 'admin_driver_detail_refused', 'not_found');
      // CPF, CNH e endereço: nunca em cache (navegador, proxy).
      reply.header('Cache-Control', 'no-store');
      return ok(reply, detail);
    } catch (err) {
      return internalFailure(request, reply, err, 'admin_driver_detail_failed_internal');
    }
  });

  app.post<{ Params: { id: string } }>('/documents/:id/view-url', mutate(), async (request, reply) => {
    const documentId = parseDocumentId(request.params.id);
    if (!documentId) return refuse(request, reply, 'document_view_url_refused', 'not_found');
    if (!options.documents) {
      request.log.error({ event: 'document_storage_unavailable', route: 'view-url' });
      reply.code(503);
      return { ok: false as const, error: { code: 'unavailable', message: ERRORS.unavailable[1] } };
    }
    try {
      const outcome = await service.viewUrl(pool, documentId, actorOf(request), options.documents.storage, options.documents.urlTtlSeconds);
      if (outcome.kind !== 'ok') return refuse(request, reply, 'document_view_url_refused', outcome.kind);
      // A URL assinada é credencial temporária: nunca no log, nunca em cache.
      request.log.info({ event: 'document_view_url_issued', documentId });
      reply.header('Cache-Control', 'no-store');
      return ok(reply, { url: outcome.url, expiresAt: outcome.expiresAt });
    } catch (err) {
      return internalFailure(request, reply, err, 'document_view_url_failed_internal');
    }
  });

  app.post<{ Params: { id: string } }>('/documents/:id/approve', mutate(), async (request, reply) => {
    const key = parseIdempotencyKey(request.headers['idempotency-key']);
    if (!key) return refuse(request, reply, 'document_approve_refused', 'idempotency_key_required');
    const body = parseApproveBody(request.body);
    if (!body) return refuse(request, reply, 'document_approve_refused', 'invalid_body');
    const documentId = parseDocumentId(request.params.id);
    if (!documentId) return refuse(request, reply, 'document_approve_refused', 'not_found');
    try {
      const outcome = await service.approve(pool, documentId, body.expiresOn, actorOf(request), key);
      if (outcome.kind !== 'ok') return refuse(request, reply, 'document_approve_refused', outcome.kind);
      request.log.info({ event: 'document_approved', documentId, driverStatus: outcome.decision.driverStatus });
      return ok(reply, outcome.decision);
    } catch (err) {
      return internalFailure(request, reply, err, 'document_approve_failed_internal');
    }
  });

  app.post<{ Params: { id: string } }>('/documents/:id/reject', mutate(), async (request, reply) => {
    const key = parseIdempotencyKey(request.headers['idempotency-key']);
    if (!key) return refuse(request, reply, 'document_reject_refused', 'idempotency_key_required');
    const body = parseRejectBody(request.body);
    if (!body) return refuse(request, reply, 'document_reject_refused', 'invalid_body');
    const documentId = parseDocumentId(request.params.id);
    if (!documentId) return refuse(request, reply, 'document_reject_refused', 'not_found');
    try {
      const outcome = await service.reject(pool, documentId, body, actorOf(request), key);
      if (outcome.kind !== 'ok') return refuse(request, reply, 'document_reject_refused', outcome.kind);
      request.log.info({ event: 'document_rejected', documentId, reasonCode: body.reasonCode });
      return ok(reply, outcome.decision);
    } catch (err) {
      return internalFailure(request, reply, err, 'document_reject_failed_internal');
    }
  });

  app.post<{ Params: { id: string } }>('/drivers/:id/suspend', mutate(), async (request, reply) => {
    const key = parseIdempotencyKey(request.headers['idempotency-key']);
    if (!key) return refuse(request, reply, 'driver_suspend_refused', 'idempotency_key_required');
    const body = parseSuspendBody(request.body);
    if (!body) return refuse(request, reply, 'driver_suspend_refused', 'validation_failed');
    const driverId = parseDocumentId(request.params.id);
    if (!driverId) return refuse(request, reply, 'driver_suspend_refused', 'not_found');
    try {
      const outcome = await service.suspend(pool, driverId, body.reason, actorOf(request), key);
      if (outcome.kind !== 'ok') return refuse(request, reply, 'driver_suspend_refused', outcome.kind);
      request.log.info({ event: 'driver_suspended', driverId });
      return ok(reply, outcome.suspension);
    } catch (err) {
      return internalFailure(request, reply, err, 'driver_suspend_failed_internal');
    }
  });

  app.post<{ Params: { id: string } }>('/drivers/:id/reinstate', mutate(), async (request, reply) => {
    const key = parseIdempotencyKey(request.headers['idempotency-key']);
    if (!key) return refuse(request, reply, 'driver_reinstate_refused', 'idempotency_key_required');
    const driverId = parseDocumentId(request.params.id);
    if (!driverId) return refuse(request, reply, 'driver_reinstate_refused', 'not_found');
    try {
      const outcome = await service.reinstate(pool, driverId, actorOf(request), key);
      if (outcome.kind !== 'ok') return refuse(request, reply, 'driver_reinstate_refused', outcome.kind);
      request.log.info({ event: 'driver_reinstated', driverId });
      return ok(reply, outcome.reinstatement);
    } catch (err) {
      return internalFailure(request, reply, err, 'driver_reinstate_failed_internal');
    }
  });
}
