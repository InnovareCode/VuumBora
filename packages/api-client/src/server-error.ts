/**
 * Resposta de erro do servidor → `ApiError`, para os contratos do M3 e do M4 (fatia K0 do
 * `docs/plano-m3-m4.md`). Envelope do projeto: `{ ok: false, error: { code, message } }`.
 *
 * **O mock e o http passam pela MESMA função.** Cada área declara um catálogo `code → { status,
 * field? }`; o mock monta a resposta pelo catálogo (`catalogError`) e o adaptador `http` (fatias D4,
 * D5, G3, G4) chama `apiErrorFromServerReply` com a resposta real e o MESMO mapa de campos. É isso que
 * garante "mesmo erro no mock e no servidor".
 *
 * Regras (as mesmas de `identity/errors.ts`, mais 413 e 422, que a identidade não usa):
 * - o `kind` sai do STATUS (estável, a tela ramifica nele) e o `code` vai junto, intacto;
 * - 400, 413 e 422 → `validation`, com a mensagem no campo do `code` (ou em `form`);
 * - 409 → `conflict` com `reason = code`; 5xx → `unavailable` (inclui `502 route_unavailable` e
 *   `503 fare_not_configured`: a tela decide pelo `code` se oferece "tentar de novo").
 *
 * A tela decide texto e ação pelo `code`, nunca pela `message`.
 */
import type { ApiError, ApiErrorExtras, ApiErrorKind } from './index';

export interface ServerErrorReply {
  readonly status: number;
  /** Corpo já decodificado de JSON (ou `undefined` se não era JSON). */
  readonly body: unknown;
  /** Valor cru do cabeçalho `Retry-After`, se houve. */
  readonly retryAfterHeader?: string | null | undefined;
}

/** Em que campo do formulário a mensagem de cada `code` de validação aparece. O que não está aqui vai para `form`. */
export type FieldByCode = Readonly<Record<string, string>>;

const CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_MESSAGE_LENGTH = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

function parseRetryAfterHeader(raw: string | null | undefined): number | undefined {
  if (!raw || !/^\d{1,9}$/.test(raw.trim())) return undefined;
  return Number(raw.trim());
}

function kindForStatus(status: number, code: string | undefined, message: string, fieldByCode: FieldByCode): ApiErrorKind {
  if (status === 400 || status === 413 || status === 422) {
    return { kind: 'validation', fields: { [(code && fieldByCode[code]) || 'form']: message } };
  }
  if (status === 401) return { kind: 'unauthorized' };
  if (status === 403) return { kind: 'forbidden' };
  if (status === 404) return { kind: 'not_found' };
  if (status === 409) return { kind: 'conflict', reason: code ?? 'conflict' };
  if (status === 429) return { kind: 'rate_limited' };
  if (status >= 500) return { kind: 'unavailable', retryable: true };
  return { kind: 'unknown', message };
}

export function apiErrorFromServerReply(reply: ServerErrorReply, fieldByCode: FieldByCode = {}): ApiError {
  const envelope = isRecord(reply.body) && isRecord(reply.body['error']) ? reply.body['error'] : undefined;
  const rawCode = envelope?.['code'];
  const code = typeof rawCode === 'string' && CODE_PATTERN.test(rawCode) ? rawCode : undefined;
  const rawMessage = envelope?.['message'];
  const message =
    typeof rawMessage === 'string' && rawMessage.length > 0 ? rawMessage.slice(0, MAX_MESSAGE_LENGTH) : `status HTTP ${reply.status}`;
  const retryAfterSeconds =
    nonNegativeInteger(envelope?.['retryAfterSeconds']) ?? (reply.status === 429 ? parseRetryAfterHeader(reply.retryAfterHeader) : undefined);

  const extras: { -readonly [K in keyof ApiErrorExtras]: ApiErrorExtras[K] } = {};
  if (code !== undefined) extras.code = code;
  if (retryAfterSeconds !== undefined) extras.retryAfterSeconds = retryAfterSeconds;
  return { ...kindForStatus(reply.status, code, message, fieldByCode), ...extras };
}

/** Uma linha do catálogo de erros de uma área: status HTTP, mensagem fixa (pt-BR) e, para validação, o campo. */
export interface ErrorCatalogEntry {
  readonly status: number;
  readonly message: string;
  readonly field?: string;
}

export type ErrorCatalog = Readonly<Record<string, ErrorCatalogEntry>>;

/** O mapa `code → campo` de um catálogo — é este que o adaptador `http` passa a `apiErrorFromServerReply`. */
export function fieldsOfCatalog(catalog: ErrorCatalog): FieldByCode {
  const fields: Record<string, string> = {};
  for (const [code, entry] of Object.entries(catalog)) {
    if (entry.field !== undefined) fields[code] = entry.field;
  }
  return fields;
}

/** A resposta que o servidor daria para `code`, já como `ApiError` — usado pelos mocks. */
export function catalogError<C extends ErrorCatalog>(catalog: C, code: keyof C & string, retryAfterSeconds?: number): ApiError {
  const entry = catalog[code];
  if (!entry) throw new TypeError(`código fora do catálogo: ${code}`);
  const error: Record<string, unknown> = { code, message: entry.message };
  if (retryAfterSeconds !== undefined) error['retryAfterSeconds'] = retryAfterSeconds;
  return apiErrorFromServerReply({ status: entry.status, body: { ok: false, error } }, fieldsOfCatalog(catalog));
}

/** Falha de transporte (sem conexão, DNS, timeout): nunca chegou resposta. */
export const NETWORK_FAILURE: ApiError = { kind: 'network', retryable: true };
