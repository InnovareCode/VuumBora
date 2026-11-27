/**
 * Transporte das portas http AUTENTICADAS por conta (Bearer): cadastro do motorista (D4) e geografia/cotação do passageiro
 * (G3/G4). Saiu de `driver/onboarding-http-adapter.ts` sem mudar comportamento, para as duas áreas usarem o MESMO caminho
 * (https obrigatório, timeout, conferência da resposta de sucesso, erro pelo catálogo).
 *
 * - O token vem do `SessionManager.run` (renova em 401 e repete UMA vez); este arquivo nunca guarda token.
 * - `baseUrl` https; `http:` só com `allowInsecureHttp` (desenvolvimento), como a identidade.
 * - Timeout em toda chamada (padrão 15 s) → `network`. Sem repetição automática (quem repete é a tela).
 * - A resposta de SUCESSO é conferida: 200 com outra forma vira `unknown` (portal cativo, proxy).
 * - Erro: `apiErrorFromServerReply` com o mapa de campos do catálogo da área — o mesmo do mock.
 * - Não loga nada.
 */
import type { Result } from '../index';
import { APP_VERSION_PATTERN, DEFAULT_TIMEOUT_MS } from '../identity/http-adapter';
import { NETWORK_ERROR, UNEXPECTED_RESPONSE } from '../identity/errors';
import type { SessionManager } from '../identity/session-manager';
import { apiErrorFromServerReply, type FieldByCode } from '../server-error';
import { failWith, succeed } from '../trip/result';

export interface AuthedHttpOptions {
  readonly baseUrl: string;
  /** Versão do app (vai em `X-App-Version`). */
  readonly appVersion: string;
  /** Quem executa a chamada com o access token válido (o `SessionManager` da identidade). */
  readonly session: Pick<SessionManager, 'run'>;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  /** Aceita `http:` (texto claro). SÓ desenvolvimento. */
  readonly allowInsecureHttp?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Base validada (https, sem query nem fragmento). Lança na montagem: URL errada é erro de configuração do app. */
function originOf(options: AuthedHttpOptions, factory: string): string {
  let base: URL;
  try {
    base = new URL(options.baseUrl);
  } catch {
    throw new Error(`${factory}: baseUrl não é uma URL válida.`);
  }
  if ((base.protocol !== 'http:' && base.protocol !== 'https:') || base.search || base.hash) {
    throw new Error(`${factory}: baseUrl deve ser http(s) sem query nem fragmento.`);
  }
  if (base.protocol === 'http:' && options.allowInsecureHttp !== true) {
    throw new Error(`${factory}: baseUrl deve ser https. http só com allowInsecureHttp (apenas desenvolvimento).`);
  }
  if (!APP_VERSION_PATTERN.test(options.appVersion)) throw new Error(`${factory}: appVersion inválida (use algo como "1.4.0").`);
  return base.origin + base.pathname.replace(/\/+$/, '');
}

export interface AuthedCall<T> {
  readonly method: 'GET' | 'POST' | 'PUT';
  /** Caminho com a querystring já montada (valores com `URLSearchParams`/`encodeURIComponent`). */
  readonly path: string;
  readonly body?: Record<string, unknown>;
  readonly fields: FieldByCode;
  readonly parse: (data: unknown) => T | null;
}

export function createAuthedRequester(options: AuthedHttpOptions, factory: string): <T>(call: AuthedCall<T>) => Promise<Result<T>> {
  const origin = originOf(options, factory);
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function once<T>(call: AuthedCall<T>, accessToken: string): Promise<Result<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = { Accept: 'application/json', 'X-App-Version': options.appVersion, Authorization: `Bearer ${accessToken}` };
      const init: RequestInit = { method: call.method, headers, signal: controller.signal, credentials: 'omit' };
      if (call.method !== 'GET') {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(call.body ?? {}); // corpo vazio com JSON no cabeçalho é 400 no Fastify
      }
      const response = await fetchImpl(`${origin}${call.path}`, init);
      const text = await response.text();
      let json: unknown;
      try {
        json = text.length > 0 ? (JSON.parse(text) as unknown) : undefined;
      } catch {
        json = undefined;
      }
      if (!response.ok) {
        return failWith(apiErrorFromServerReply({ status: response.status, body: json, retryAfterHeader: response.headers.get('retry-after') }, call.fields));
      }
      if (!isRecord(json) || json['ok'] !== true) return failWith(UNEXPECTED_RESPONSE);
      const data = call.parse(json['data']);
      return data === null ? failWith(UNEXPECTED_RESPONSE) : succeed(data, 'real');
    } catch {
      return failWith(NETWORK_ERROR);
    } finally {
      clearTimeout(timer);
    }
  }

  return <T>(call: AuthedCall<T>): Promise<Result<T>> => options.session.run((accessToken) => once(call, accessToken));
}
