import type { Result } from './result';
import { createHttpRequester } from './client';
import {
  DOCUMENT_REVIEW_FIELD_BY_CODE,
  type AdminDriverDetail,
  type ApproveDocumentInput,
  type DocumentDecision,
  type DocumentRejection,
  type DocumentReviewQueueInput,
  type DocumentReviewQueuePage,
  type DocumentViewUrl,
  type DriverSuspension,
  type RejectDocumentInput,
  type SuspendDriverInput,
} from './documentReviewTypes';
import {
  parseAdminDriverDetailResponse,
  parseDocumentDecisionResponse,
  parseDocumentReviewQueueResponse,
  parseDocumentViewUrlResponse,
  parseDriverSuspensionResponse,
  parseRejectionReasonsResponse,
  type Parsed,
} from './documentReviewResponses';

/**
 * Fila e decisão de documentos do motorista (D7) — mesmo conjunto de métodos de `DocumentReviewPort`
 * (`@vuumbora/api-client/admin`, fatia K0), devolvendo o `Result` DESTE painel. Rotas em
 * `/v1/admin/*` (docs/plano-m3-m4.md §3), sessão de admin com CSRF (o requester cuida do cabeçalho).
 *
 * Toda rota: `403 forbidden` para papel fora de `DOCUMENT_REVIEW_ROLES`, antes de qualquer outra
 * checagem. Aprovar, recusar e suspender mandam `Idempotency-Key` — a MESMA chave com o mesmo corpo
 * devolve a MESMA resposta; documento já decidido = `409 invalid_transition` (`conflict`).
 */
export interface DocumentReviewPort {
  /** `400 invalid_body` · `400 invalid_cursor`. */
  queue(input?: DocumentReviewQueueInput): Promise<Result<DocumentReviewQueuePage>>;
  /** `404 not_found`. */
  driver(driverId: string): Promise<Result<AdminDriverDetail>>;
  /**
   * `404 not_found`. CADA chamada é uma visualização auditada (N5): só no clique de quem vai olhar,
   * nunca para pré-carregar. A URL devolvida não vai para cache, log nem estado persistido.
   *
   * No painel, o `expiresAt` devolvido já está no relógio DESTE computador (ver `localViewUrlExpiry`): um
   * relógio local adiantado fazia o link "vencer" no instante em que chegava e cada clique gastava uma
   * visualização auditada.
   */
  viewUrl(documentId: string): Promise<Result<DocumentViewUrl>>;
  /** `404` · `409 invalid_transition` · `422 invalid_expires_on` (`fields.expiresOn`). */
  approve(documentId: string, input: ApproveDocumentInput, idempotencyKey: string): Promise<Result<DocumentDecision>>;
  /** `404` · `409 invalid_transition` · `422 unknown_reason` (`fields.reasonCode`) · `400 invalid_body` (nota longa). */
  reject(documentId: string, input: RejectDocumentInput, idempotencyKey: string): Promise<Result<DocumentDecision>>;
  rejectionReasons(): Promise<Result<readonly DocumentRejection[]>>;
  /** `404` · `400 validation_failed` (`fields.reason`). Quem já está suspenso devolve a suspensão original. */
  suspend(driverId: string, input: SuspendDriverInput, idempotencyKey: string): Promise<Result<DriverSuspension>>;
}

/**
 * O `reason` vai para o console — e o validador garante que ele só tem nome de campo e tipo, nunca valor
 * (nem URL assinada, nem CPF). Não acrescente o corpo da resposta aqui.
 */
function contractMismatch(reason: string): { readonly ok: false; readonly error: { readonly kind: 'contract_mismatch' } } {
  console.error(`[admin] Resposta da fila de documentos incompatível com este painel (${reason}).`);
  return { ok: false, error: { kind: 'contract_mismatch' } };
}

/** Teto do contrato para a URL de visualização (≤ 300 s). */
export const VIEW_URL_MAX_TTL_MS = 300_000;

/**
 * Validade do link no relógio LOCAL. A validade de verdade é a do servidor (`expiresAt` − agora DELE); o
 * relógio do revisor pode estar adiantado ou atrasado minutos, então comparar `expiresAt` com `Date.now()`
 * mede o erro do relógio, não o link.
 *
 * - Com o cabeçalho `Date` legível: validade = `expiresAt` − `Date` (exata, resolução de 1 s).
 * - Sem ele (requisição de outra origem só lê o `Date` se a API mandar `Access-Control-Expose-Headers: Date`):
 *   validade = `expiresAt` − hora local da chegada. Se der ≤ 0, o relógio local está adiantado (o servidor
 *   acabou de emitir o link, ele não nasce vencido) e vale o teto do contrato.
 *
 * Sempre no máximo 300 s a partir da chegada.
 */
export function localViewUrlExpiry(expiresAtIso: string, receivedAtMs: number, serverDateHeader: string | null): string {
  const expiresAtServerMs = Date.parse(expiresAtIso);
  const serverNowMs = serverDateHeader ? Date.parse(serverDateHeader) : Number.NaN;
  let ttlMs: number;
  if (!Number.isNaN(serverNowMs)) {
    ttlMs = expiresAtServerMs - serverNowMs;
  } else {
    const localTtlMs = expiresAtServerMs - receivedAtMs;
    ttlMs = localTtlMs > 0 ? localTtlMs : VIEW_URL_MAX_TTL_MS;
  }
  return new Date(receivedAtMs + Math.max(0, Math.min(ttlMs, VIEW_URL_MAX_TTL_MS))).toISOString();
}

function finish<T>(result: Result<unknown>, parse: (raw: unknown) => Parsed<T>): Result<T> {
  if (!result.ok) return result;
  const parsed = parse(result.data);
  if (!parsed.ok) return contractMismatch(parsed.reason);
  return { ok: true, data: parsed.value, origin: result.origin };
}

export function createHttpDocumentReviewAdapter(baseUrl: string): DocumentReviewPort {
  const request = createHttpRequester(baseUrl);
  const fieldByCode = DOCUMENT_REVIEW_FIELD_BY_CODE;

  return {
    async queue(input = {}) {
      const query = new URLSearchParams();
      if (input.status) query.set('status', input.status);
      if (input.cursor) query.set('cursor', input.cursor);
      if (input.limit !== undefined) query.set('limit', String(input.limit));
      const qs = query.toString();
      const result = await request<unknown>({ path: `/v1/admin/document-reviews${qs ? `?${qs}` : ''}`, fieldByCode });
      return finish(result, parseDocumentReviewQueueResponse);
    },
    async driver(driverId) {
      const result = await request<unknown>({ path: `/v1/admin/drivers/${encodeURIComponent(driverId)}`, fieldByCode });
      return finish(result, parseAdminDriverDetailResponse);
    },
    async viewUrl(documentId) {
      // POST (não GET): grava trilha no servidor e não pode ser repetido por cache de navegador nem por
      // pré-busca. O requester já manda `credentials: 'include'` e o CSRF de mutação.
      // Objeto (e não `let`): atribuição dentro de callback não alarga o tipo estreitado de um `let`.
      const arrival: { receivedAtMs: number; serverDate: string | null } = { receivedAtMs: 0, serverDate: null };
      const result = await request<unknown>({
        path: `/v1/admin/documents/${encodeURIComponent(documentId)}/view-url`,
        method: 'POST',
        fieldByCode,
        onResponse: (response) => {
          arrival.receivedAtMs = Date.now();
          arrival.serverDate = response.headers.get('Date');
        },
      });
      const parsed = finish(result, parseDocumentViewUrlResponse);
      if (!parsed.ok) return parsed;
      const expiresAt = localViewUrlExpiry(parsed.data.expiresAt, arrival.receivedAtMs || Date.now(), arrival.serverDate);
      return { ...parsed, data: { url: parsed.data.url, expiresAt } };
    },
    async approve(documentId, input, idempotencyKey) {
      const result = await request<unknown>({
        path: `/v1/admin/documents/${encodeURIComponent(documentId)}/approve`,
        method: 'POST',
        body: input.expiresOn !== undefined ? { expiresOn: input.expiresOn } : {},
        idempotencyKey,
        fieldByCode,
      });
      return finish(result, parseDocumentDecisionResponse);
    },
    async reject(documentId, input, idempotencyKey) {
      const result = await request<unknown>({
        path: `/v1/admin/documents/${encodeURIComponent(documentId)}/reject`,
        method: 'POST',
        body: { reasonCode: input.reasonCode, ...(input.internalNote !== undefined ? { internalNote: input.internalNote } : {}) },
        idempotencyKey,
        fieldByCode,
      });
      return finish(result, parseDocumentDecisionResponse);
    },
    async rejectionReasons() {
      const result = await request<unknown>({ path: '/v1/admin/document-rejection-reasons', fieldByCode });
      return finish(result, parseRejectionReasonsResponse);
    },
    async suspend(driverId, input, idempotencyKey) {
      const result = await request<unknown>({
        path: `/v1/admin/drivers/${encodeURIComponent(driverId)}/suspend`,
        method: 'POST',
        body: { reason: input.reason },
        idempotencyKey,
        fieldByCode,
      });
      return finish(result, parseDriverSuspensionResponse);
    },
  };
}
