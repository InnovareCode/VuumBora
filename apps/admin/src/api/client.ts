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
    readonly retryAfterSeconds?: number;
    readonly missing?: readonly string[];
    readonly details?: { readonly kind?: string; readonly serverMessage?: string; readonly smtpCode?: string; readonly responseCode?: number; readonly command?: string };
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

function mapStatusToError(status: number, body: Envelope<unknown> | undefined, fieldByCode?: Readonly<Record<string, string>>): ApiError {
  const err = body && body.ok === false ? body.error : undefined;
  // Rotas do M3 (fila de documentos): o servidor manda só `{ code, message }`, sem `fields` — o CAMPO vem do
  // catálogo da área, que a porta passa em `fieldByCode` (ver `DOCUMENT_REVIEW_FIELD_BY_CODE`). Só vale para quem
  // passa o mapa: as rotas antigas continuam exatamente como antes.
  const mappedField = fieldByCode && err?.code && Object.hasOwn(fieldByCode, err.code) ? fieldByCode[err.code] : undefined;
  if ((status === 400 || status === 413 || status === 422) && mappedField) {
    return { kind: 'validation', fields: { [mappedField]: err?.message ?? '' } };
  }
  if (status === 400) {
    // `activation_token_invalid` (`POST /auth/activate`) ANTES do genérico: não é um campo de formulário com
    // mensagem própria (é sempre a mesma resposta para as quatro causas — ver o `kind` em result.ts).
    if (err?.code === 'activation_token_invalid') return { kind: 'activation_token_invalid' };
    // A maioria das rotas manda `fields` como mapa campo→mensagem; a de e-mail manda só a LISTA de nomes. Normaliza.
    const fields: Readonly<Record<string, string>> | undefined = Array.isArray(err?.fields)
      ? Object.fromEntries((err.fields as readonly string[]).map((name) => [name, '']))
      : err?.fields;
    if (fields && Object.keys(fields).length > 0) return { kind: 'validation', fields };
    return { kind: 'unknown', message: err?.message ?? 'Corpo da requisição inválido.' };
  }
  // Códigos do segundo fator ANTES do 401 genérico: um código errado é 401
  // `invalid_second_factor`, e tratá-lo como "sessão expirada" derrubaria a
  // sessão inteira (ex.: errar o código ao regenerar códigos de recuperação).
  if (status === 401 && err?.code === 'invalid_second_factor') return { kind: 'invalid_second_factor' };
  if (status === 401 && err?.code === 'challenge_invalid') return { kind: 'challenge_invalid' };
  if (status === 401) return { kind: 'unauthorized' };
  // 403 de reautenticação/ativação: senha ou código errados NÃO são "sem permissão" nem sessão caída.
  if (status === 403 && err?.code === 'password_invalid') return { kind: 'password_invalid' };
  if (status === 403 && err?.code === 'enrollment_token_invalid') return { kind: 'enrollment_token_invalid' };
  if (status === 403 && err?.code === 'two_factor_required_for_role') return { kind: 'two_factor_required_for_role' };
  if (status === 403) return err?.code === 'csrf_token_invalid' ? { kind: 'csrf_invalid' } : { kind: 'forbidden' };
  if (status === 404) return { kind: 'not_found' };
  // 423 `account_locked` (gestão de usuários, F07): mesma espera progressiva do par e-mail+IP do LOGIN, só que
  // aqui é a senha de reautenticação de uma mutação (criar/desativar/reativar/trocar papel). Status diferente
  // (423, não 429) do `account_locked` do login/step-up de e-mail — mesmo `kind`, a tela trata igual.
  if (status === 423 && err?.code === 'account_locked') return { kind: 'account_locked', retryAfterSeconds: err.retryAfterSeconds ?? 5 };
  if (status === 409 && err?.code === 'email_not_configured') return { kind: 'email_not_configured', missing: err.missing ?? [] };
  if (status === 409) return { kind: 'conflict', reason: err?.reason ?? err?.code ?? 'unknown' };
  if (status === 429 && err?.code === 'account_locked') {
    // Espera por par (1 s … 15 min), não bloqueio de conta. O corpo sempre traz `retryAfterSeconds`; sem ele, um piso curto
    // (e não os 15 min do bloqueio do código) — se ainda valer, o próximo 429 traz o tempo real.
    return { kind: 'account_locked', retryAfterSeconds: err.retryAfterSeconds ?? 5 };
  }
  if (status === 429 && err?.code === 'two_factor_locked') {
    // Mesma informação no corpo e no header `Retry-After`; o corpo basta (CORS não expõe o header sem Access-Control-Expose-Headers).
    return { kind: 'two_factor_locked', retryAfterSeconds: err.retryAfterSeconds ?? 15 * 60 };
  }
  if (status === 429) return { kind: 'rate_limited', ...(err?.retryAfterSeconds != null ? { retryAfterSeconds: err.retryAfterSeconds } : {}) };
  if (status === 422 && err?.code === 'smtp_host_blocked') return { kind: 'smtp_host_blocked' };
  if (status === 502 && err?.code === 'smtp_delivery_failed') {
    const d = err.details;
    return {
      kind: 'smtp_delivery_failed',
      details: {
        kind: d?.kind ?? 'smtp',
        serverMessage: d?.serverMessage ?? err.message ?? 'Sem detalhe do servidor.',
        ...(d?.smtpCode !== undefined ? { smtpCode: d.smtpCode } : {}),
        ...(d?.responseCode !== undefined ? { responseCode: d.responseCode } : {}),
        ...(d?.command !== undefined ? { command: d.command } : {}),
      },
    };
  }
  if (status === 503 && err?.code === 'encryption_unavailable') return { kind: 'encryption_unavailable' };
  if (status === 503 && err?.code === 'two_factor_unavailable') return { kind: 'two_factor_unavailable' };
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
  /** `code` de validação → campo (ver `mapStatusToError`). Ausente = comportamento de sempre. */
  readonly fieldByCode?: Readonly<Record<string, string>>;
}

/** `baseUrl` sem barra final. Sempre com cookie (`credentials: 'include'`). */
export function createHttpRequester(baseUrl: string) {
  return async function request<T>({ path, method = 'GET', body, idempotencyKey, fieldByCode }: RequestInput): Promise<Result<T>> {
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
        const error = mapStatusToError(response.status, json, fieldByCode);
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
