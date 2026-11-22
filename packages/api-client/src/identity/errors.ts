/**
 * Resposta de erro do servidor -> `ApiError`. Os DOIS adaptadores passam por aqui (o mock fabrica respostas no formato
 * do servidor e usa esta mesma função): é isso que garante "mesmos códigos de erro" no mock e no http.
 *
 * Regra: o `kind` sai do STATUS HTTP (estável, a UI ramifica nele); o `code` do envelope vai junto, intacto, para a
 * UI escolher o texto. Mensagens do servidor são fixas e em português, mas a UI não deve depender delas.
 */
import type { ApiError, ApiErrorExtras, ApiErrorKind } from '../index';

export interface ServerReply {
  readonly status: number;
  /** Corpo já decodificado de JSON (ou `undefined` se não era JSON). */
  readonly body: unknown;
  /** Valor cru do cabeçalho `Retry-After`, se houve. */
  readonly retryAfterHeader?: string | null | undefined;
}

/** Em qual campo do formulário cada `code` de validação (400) deve aparecer. O resto vai para `form`. */
const FIELD_BY_CODE: Readonly<Record<string, string>> = {
  invalid_email: 'email',
  invalid_password: 'password',
  invalid_phone: 'phone',
  invalid_birth_date: 'birthDate',
  consent_required: 'consent',
  invalid_code: 'code',
  code_expired: 'code',
};

const CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_MESSAGE_LENGTH = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

function parseRetryAfterHeader(raw: string | null | undefined): number | undefined {
  if (!raw || !/^\d{1,9}$/.test(raw.trim())) return undefined; // só a forma "segundos"; data HTTP é ignorada
  return Number(raw.trim());
}

function kindForStatus(status: number, code: string | undefined, message: string): ApiErrorKind {
  if (status === 400) {
    return { kind: 'validation', fields: { [(code && FIELD_BY_CODE[code]) || 'form']: message } };
  }
  if (status === 401) return { kind: 'unauthorized' };
  if (status === 403) return { kind: 'forbidden' };
  if (status === 404) return { kind: 'not_found' };
  if (status === 409) return { kind: 'conflict', reason: code ?? 'conflict' };
  if (status === 429) return { kind: 'rate_limited' };
  if (status >= 500) return { kind: 'unavailable', retryable: true };
  return { kind: 'unknown', message };
}

export function apiErrorFromReply(reply: ServerReply): ApiError {
  const envelope = isRecord(reply.body) && isRecord(reply.body['error']) ? reply.body['error'] : undefined;
  const rawCode = envelope?.['code'];
  const code = typeof rawCode === 'string' && CODE_PATTERN.test(rawCode) ? rawCode : undefined;
  const rawMessage = envelope?.['message'];
  const message =
    typeof rawMessage === 'string' && rawMessage.length > 0
      ? rawMessage.slice(0, MAX_MESSAGE_LENGTH)
      : `status HTTP ${reply.status}`;

  const attemptsLeft = nonNegativeInteger(envelope?.['attemptsLeft']);
  // O corpo manda; o cabeçalho `Retry-After` só vale como reserva e só num 429 (o rate limit global não tem corpo rico).
  const retryAfterSeconds =
    nonNegativeInteger(envelope?.['retryAfterSeconds']) ??
    (reply.status === 429 ? parseRetryAfterHeader(reply.retryAfterHeader) : undefined);

  // Só acrescenta chave com valor: `exactOptionalPropertyTypes` não aceita `undefined` explícito.
  const extras: { -readonly [K in keyof ApiErrorExtras]: ApiErrorExtras[K] } = {};
  if (code !== undefined) extras.code = code;
  if (attemptsLeft !== undefined) extras.attemptsLeft = attemptsLeft;
  if (retryAfterSeconds !== undefined) extras.retryAfterSeconds = retryAfterSeconds;

  return { ...kindForStatus(reply.status, code, message), ...extras };
}

/** Falha de transporte (sem conexão, DNS, timeout, aborto): nunca chegou resposta utilizável. */
export const NETWORK_ERROR: ApiError = { kind: 'network', retryable: true };

/** Resposta 2xx que não tem a forma do contrato (portal cativo, proxy, versão errada do servidor). */
export const UNEXPECTED_RESPONSE: ApiError = { kind: 'unknown', message: 'Resposta inesperada do servidor.' };
