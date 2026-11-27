/**
 * Regras puras da revisão de documentos pelo painel (fatia D5 do `docs/plano-m3-m4.md` §3; contrato K0 em
 * `packages/api-client/src/admin/types.ts`, `DocumentReviewPort`). Sem I/O.
 *
 * Limites = os CHECKs da 0024/0025: nota interna até 1000 (`driver_documents_review_note_len`), motivo de suspensão até
 * 500 (`drivers_suspension_reason_len`; o contrato K0 dizia 1000 e foi corrigido). Validar aqui, antes do SQL, faz da
 * restrição do banco a última linha de defesa.
 */
import { hasControlCharacter, isCalendarDate, isUuid } from './driver-onboarding.js';

export const QUEUE_STATUSES = ['submitted', 'approved', 'rejected', 'expired'] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];
export const QUEUE_DEFAULT_LIMIT = 20;
export const QUEUE_MAX_LIMIT = 50;
export const INTERNAL_NOTE_MAX = 1000;
export const SUSPENSION_REASON_MIN = 10;
export const SUSPENSION_REASON_MAX = 500;
export const IDEMPOTENCY_KEY_MAX = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface QueueQuery {
  readonly status: QueueStatus;
  readonly cursor: string | null;
  readonly limit: number;
}

/** `?status&cursor&limit`. `null` = `400 invalid_body` (status ou limite fora do contrato, parâmetro repetido). */
export function parseQueueQuery(query: unknown): QueueQuery | null {
  if (!isRecord(query)) return null;
  const { status, cursor, limit } = query;
  if (status !== undefined && (typeof status !== 'string' || !(QUEUE_STATUSES as readonly string[]).includes(status))) return null;
  if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 500)) return null;
  let parsedLimit = QUEUE_DEFAULT_LIMIT;
  if (limit !== undefined) {
    if (typeof limit !== 'string' || !/^\d{1,3}$/.test(limit)) return null;
    parsedLimit = Number(limit);
    if (parsedLimit < 1 || parsedLimit > QUEUE_MAX_LIMIT) return null;
  }
  return { status: (status as QueueStatus | undefined) ?? 'submitted', cursor: (cursor as string | undefined) ?? null, limit: parsedLimit };
}

/** Cabeçalho `Idempotency-Key`: 1..200, sem caractere de controle. `null` = `400 idempotency_key_required`. */
export function parseIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.trim();
  return key.length >= 1 && key.length <= IDEMPOTENCY_KEY_MAX && !hasControlCharacter(key) ? key : null;
}

export function parseDocumentId(value: unknown): string | null {
  return isUuid(value) ? value.toLowerCase() : null;
}

/** `{ expiresOn? }`. A FORMA (`400 invalid_body`); se a data serve ao tipo do documento é decidido com o banco (`422`). */
export function parseApproveBody(body: unknown): { readonly expiresOn: string | null } | null {
  if (body === undefined || body === null) return { expiresOn: null };
  if (!isRecord(body)) return null;
  const { expiresOn } = body;
  if (expiresOn === undefined || expiresOn === null) return { expiresOn: null };
  if (typeof expiresOn !== 'string' || expiresOn.length > 10) return null;
  return { expiresOn };
}

/**
 * Validade da aprovação (`422 invalid_expires_on`): obrigatória e no calendário para tipo com validade, entre hoje (no
 * dia LOCAL da cidade) e hoje + teto do tipo (0025); proibida para tipo sem validade.
 */
export function expiresOnProblem(expiresOn: string | null, rule: { readonly hasExpiry: boolean; readonly today: string; readonly latest: string }): boolean {
  if (!rule.hasExpiry) return expiresOn !== null;
  if (expiresOn === null || !isCalendarDate(expiresOn)) return true;
  return expiresOn < rule.today || expiresOn > rule.latest;
}

export interface RejectInput {
  readonly reasonCode: string;
  readonly internalNote: string | null;
}

/** `{ reasonCode, internalNote? }`. Nota vazia vira ausente; longa ou com caractere de controle é `400 invalid_body`. */
export function parseRejectBody(body: unknown): RejectInput | null {
  if (!isRecord(body)) return null;
  const { reasonCode, internalNote } = body;
  if (typeof reasonCode !== 'string' || reasonCode.length === 0 || reasonCode.length > 40 || hasControlCharacter(reasonCode)) return null;
  if (internalNote === undefined || internalNote === null) return { reasonCode, internalNote: null };
  if (typeof internalNote !== 'string') return null;
  const note = internalNote.trim();
  if (note.length === 0) return { reasonCode, internalNote: null };
  // Quebra de linha e tabulação são legítimas numa nota; o resto dos caracteres de controle, não.
  if (note.length > INTERNAL_NOTE_MAX || hasControlCharacter(note.replace(/[\r\n\t]/g, ' '))) return null;
  return { reasonCode, internalNote: note };
}

/** `{ reason }`, 10..500 depois do trim, sem caractere de controle (fora quebra de linha). `null` = `400 validation_failed`. */
export function parseSuspendBody(body: unknown): { readonly reason: string } | null {
  if (!isRecord(body) || typeof body['reason'] !== 'string') return null;
  const reason = body['reason'].trim();
  if (reason.length < SUSPENSION_REASON_MIN || reason.length > SUSPENSION_REASON_MAX) return null;
  if (hasControlCharacter(reason.replace(/[\r\n\t]/g, ' '))) return null;
  return { reason };
}
