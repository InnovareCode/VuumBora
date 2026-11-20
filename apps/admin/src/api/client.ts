import type { ApiError, Result } from './result';
import { CSRF_HEADER_NAME, clearCsrfToken, readCsrfToken } from './csrf';

/**
 * Envelope fixo da API (docs/plano-sistema.md §5):
 *   sucesso: { ok: true,  data: ... }
 *   erro:    { ok: false, error: { code, message, fields?, reason? } }
 */
interface SuccessEnvelope<T> {
  readonly ok: true;
  readonly data: T;
}
interface ErrorEnvelope {
  readonly ok: false;
  readonly error: {
    readonly code?: string;
    readonly message?: string;
    readonly fields?: Readonly<Record<string, string>>;
    readonly reason?: string;
  };
}
type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

/**
 * A sessão vem em cookie httpOnly — o SPA nunca guarda token (regra do
 * briefing). Por isso só precisamos avisar quem está escutando quando uma
 * chamada volta 401, para a UI inteira (não só a tela atual) voltar ao login.
 */
type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function mapStatusToError(status: number, body: Envelope<unknown> | undefined): ApiError {
  const err = body && body.ok === false ? body.error : undefined;
  if (status === 400) {
    if (err?.fields && Object.keys(err.fields).length > 0) return { kind: 'validation', fields: err.fields };
    return { kind: 'unknown', message: err?.message ?? 'Corpo da requisição inválido.' };
  }
  if (status === 401) return { kind: 'unauthorized' };
  if (status === 403) return err?.code === 'csrf_token_invalid' ? { kind: 'csrf_invalid' } : { kind: 'forbidden' };
  if (status === 404) return { kind: 'not_found' };
  if (status === 409) return { kind: 'conflict', reason: err?.reason ?? 'unknown' };
  if (status === 429) return { kind: 'rate_limited' };
  if (status === 503) return { kind: 'unavailable', retryable: true };
  if (status >= 500) return { kind: 'unknown', message: err?.message ?? `status HTTP ${status}` };
  return { kind: 'unknown', message: err?.message ?? `status HTTP ${status}` };
}

export interface RequestInput {
  readonly path: string;
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  /**
   * Ações críticas (aprovar/recusar candidatura) mandam isto — mesma chave +
   * mesmo corpo nunca duplica o efeito num retry de rede (ver
   * docs/plano-sistema.md §Idempotency-Key, `src/lib/idempotency.ts`).
   */
  readonly idempotencyKey?: string;
}

/** `baseUrl` sem barra final. Sempre com cookie (`credentials: 'include'`). */
export function createHttpRequester(baseUrl: string) {
  return async function request<T>({ path, method = 'GET', body, idempotencyKey }: RequestInput): Promise<Result<T>> {
    try {
      const init: RequestInit = { method, credentials: 'include' };
      const headers: Record<string, string> = {};
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
      // CSRF só importa em mutação — GET nunca muda estado (ver src/api/csrf.ts).
      if (method !== 'GET') {
        const csrfToken = readCsrfToken();
        if (csrfToken) headers[CSRF_HEADER_NAME] = csrfToken;
      }
      if (Object.keys(headers).length > 0) init.headers = headers;
      const response = await fetch(`${baseUrl}${path}`, init);
      const json: Envelope<T> | undefined = await response.json().catch(() => undefined);

      if (!response.ok || !json || json.ok === false) {
        const error = mapStatusToError(response.status, json);
        if (error.kind === 'unauthorized') {
          // Sessão morreu — o token de CSRF dela não serve para a próxima
          // (ver src/api/csrf.ts).
          clearCsrfToken();
          for (const listener of unauthorizedListeners) listener();
        }
        return { ok: false, error };
      }
      return { ok: true, data: json.data, origin: 'real' };
    } catch {
      return { ok: false, error: { kind: 'network', retryable: true } };
    }
  };
}
