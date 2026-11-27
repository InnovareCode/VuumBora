/**
 * Construtores de `Result`/`ApiError` das portas de corrida (B6 da conferência da Nova:
 * `docs/contratos/conferencia-f08-nova.md`). `ApiErrorKind` (`packages/api-client/src/index.ts`)
 * continua com `reason: string` — não é tocado aqui, porque `identity` e `waitlist` já dependem
 * dele com valores arbitrários do servidor (mudar o tipo ali quebraria os dois). A segurança de
 * tipo mora NESTE arquivo: cada operação tem seu próprio construtor, com uma união FECHADA de
 * `reason` — passar um valor fora da união não compila. É o mecanismo pedido no achado B6.
 *
 * **R8 (texto, reconferência da Nova):** o adaptador `http` (quando existir) transforma qualquer
 * `reason` que o servidor mande FORA destas uniões em `kind: 'unknown'` — nunca repassa um valor
 * não documentado aqui para a tela como se fosse um dos reconhecidos.
 */
import type { ApiError, Result } from '../index';

export function succeed<T>(data: T, origin: 'mock' | 'real' = 'mock'): Result<T> {
  return { ok: true, data, origin };
}

export function failWith(error: ApiError): { readonly ok: false; readonly error: ApiError } {
  return { ok: false, error };
}

export const notFound = (): ApiError => ({ kind: 'not_found' });

export const validation = (fields: Readonly<Record<string, string>>): ApiError => ({ kind: 'validation', fields });

/** `POST /v1/quotes`. */
export type QuoteConflictReason = 'outside_service_area';
export const quoteConflict = (reason: QuoteConflictReason): ApiError => ({ kind: 'conflict', reason });

/** `POST /v1/trips`. */
export type RequestConflictReason =
  | 'quote_expired'
  | 'category_unavailable'
  | 'active_trip_exists'
  | 'payment_pending'
  | 'idempotency_key_reused';
export const requestConflict = (reason: RequestConflictReason): ApiError => ({ kind: 'conflict', reason });

/** `POST /v1/trips/:id/cancel` e `POST /v1/driver/trips/:id/cancel`. */
export type CancelConflictReason = 'invalid_transition' | 'idempotency_key_reused';
export const cancelConflict = (reason: CancelConflictReason): ApiError => ({ kind: 'conflict', reason });

/** `POST /v1/driver/offers/:id/accept`. */
export type AcceptConflictReason = 'offer_taken' | 'offer_expired' | 'idempotency_key_reused';
export const acceptConflict = (reason: AcceptConflictReason): ApiError => ({ kind: 'conflict', reason });

/**
 * `PUT /v1/driver/availability` (§3 do `docs/plano-m3-m4.md`, fatia K0): `document_expired` substituiu
 * o antigo `not_eligible`. Leva também o `code` (= `reason`), como o adaptador `http` entrega um 409.
 */
export type AvailabilityConflictReason = 'driver_not_approved' | 'document_expired';
export const availabilityConflict = (reason: AvailabilityConflictReason): ApiError => ({ kind: 'conflict', reason, code: reason });

/** `POST /v1/driver/trips/:id/{arrived,start,complete}` (C1). */
export type DriverActionConflictReason = 'invalid_transition' | 'idempotency_key_reused';
export const driverActionConflict = (reason: DriverActionConflictReason): ApiError => ({ kind: 'conflict', reason });
