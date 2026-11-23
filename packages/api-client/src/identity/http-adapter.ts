/**
 * Adaptador `http` da identidade: fala com `/v1/auth/*` (contrato: docs/contrato-identidade-apps.md).
 *
 * - `accountType` é fixo (da fábrica) e entra em todo corpo que o contrato pede; o chamador não consegue trocá-lo.
 * - Cada corpo é montado CAMPO A CAMPO: um formulário que carrega `confirmPassword` (ou qualquer sobra) não a envia.
 * - `X-App-Version` em TODA chamada (o servidor ainda ignora; a §6 prevê `426` para versão velha).
 * - `baseUrl` é https. `http:` só com `allowInsecureHttp: true`, que é coisa de DESENVOLVIMENTO (o app liga isto ao
 *   `__DEV__`): senha e tokens não podem viajar em claro por causa de uma URL errada numa build de loja (B-8d).
 * - As versões dos Termos e da Política que vão no cadastro e no reaceite são ENTRADA (o que a tela renderizou); nada
 *   aqui as inventa nem as guarda (M-2).
 * - Sem retentativa automática aqui: POST de cadastro/redefinição não é seguro de repetir; quem repete é a UI.
 *   (A única repetição automática é a do `SessionManager` depois de um 401.)
 * - Timeout em toda chamada (padrão 15 s) → `network`.
 * - A resposta de SUCESSO é conferida (forma e `accountType`): portal cativo ou proxy que devolve 200 com HTML vira
 *   `unknown`, em vez de entregar lixo ao `SessionManager`.
 * - Não loga nada: senha, código e tokens passam por aqui.
 */
import type { Result } from '../index';
import { apiErrorFromReply, NETWORK_ERROR, UNEXPECTED_RESPONSE } from './errors';
import { parseConsentStatus, parseCurrentLegal } from './legal';
import { failWith, succeed } from './result';
import type {
  AccountSummary,
  AccountType,
  AccountWithConsent,
  ConsentStatus,
  DeleteAccountOutput,
  IdentityApi,
  RegisterOutput,
  ResendOutput,
  SessionTokens,
} from './types';

export const DEFAULT_TIMEOUT_MS = 15_000;
/** Valor aceito em `X-App-Version`: sem espaço, aspas nem quebra de linha (cabeçalho inválido derruba o `fetch`). */
export const APP_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/;

export interface IdentityHttpOptions {
  readonly baseUrl: string;
  readonly accountType: AccountType;
  /** Versão do app (ex.: a do `app.config`). Vai em `X-App-Version`. */
  readonly appVersion: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  /**
   * Aceita `baseUrl` com `http:` (texto claro). SÓ DESENVOLVIMENTO — emulador, aparelho na rede local, servidor
   * local. Padrão `false`: em build de loja a montagem recusa `http:`.
   */
  readonly allowInsecureHttp?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseAccount(value: unknown, accountType: AccountType): AccountSummary | null {
  if (!isRecord(value)) return null;
  const { id, publicId, fullName, accountType: receivedType } = value;
  if (!nonEmptyString(id) || !nonEmptyString(publicId) || typeof fullName !== 'string') return null;
  // O app é de UM tipo. Conta de outro tipo numa resposta é bug (ou servidor errado): não entra na sessão.
  if (receivedType !== accountType) return null;
  return { id, publicId, fullName, accountType };
}

function parseTokens(value: unknown): SessionTokens | null {
  if (!isRecord(value)) return null;
  const { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt } = value;
  if (!nonEmptyString(accessToken) || !nonEmptyString(refreshToken)) return null;
  if (!isIso(accessTokenExpiresAt) || !isIso(refreshTokenExpiresAt)) return null;
  return { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt };
}

/** `GET /me`: a conta e o `consent` (objeto, ou `null` sem configuração dos textos). `consent` ausente é inválido. */
function parseAccountWithConsent(value: unknown, accountType: AccountType): AccountWithConsent | null {
  const account = parseAccount(value, accountType);
  if (!account || !isRecord(value)) return null;
  const raw = value['consent'];
  if (raw === null) return { ...account, consent: null };
  const consent = parseConsentStatus(raw);
  return consent ? { ...account, consent } : null;
}

function parseResend(value: unknown): ResendOutput | null {
  if (!isRecord(value)) return null;
  const seconds = value['resendAfterSeconds'];
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 ? { resendAfterSeconds: seconds } : null;
}

export function createIdentityHttpAdapter(options: IdentityHttpOptions): IdentityApi {
  const { accountType, appVersion } = options;
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let base: URL;
  try {
    base = new URL(options.baseUrl);
  } catch {
    throw new Error('createIdentityHttpAdapter: baseUrl não é uma URL válida.');
  }
  if ((base.protocol !== 'http:' && base.protocol !== 'https:') || base.search || base.hash) {
    throw new Error('createIdentityHttpAdapter: baseUrl deve ser http(s) sem query nem fragmento.');
  }
  if (base.protocol === 'http:' && options.allowInsecureHttp !== true) {
    throw new Error(
      'createIdentityHttpAdapter: baseUrl deve ser https. http só com allowInsecureHttp (apenas desenvolvimento): senha e tokens iriam em texto claro.',
    );
  }
  if (!APP_VERSION_PATTERN.test(appVersion)) {
    throw new Error('createIdentityHttpAdapter: appVersion inválida (use algo como "1.4.0").');
  }
  const origin = base.origin + base.pathname.replace(/\/+$/, '');

  interface Call<T> {
    readonly method: 'GET' | 'POST';
    readonly path: string;
    readonly body?: Record<string, unknown>;
    readonly bearer?: string;
    /** Valida e converte `data`; `null` = forma inesperada. Rotas sem `data` (logout) passam `() => undefined`. */
    readonly parse: (data: unknown) => T | null;
  }

  async function request<T>(call: Call<T>): Promise<Result<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = { Accept: 'application/json', 'X-App-Version': appVersion };
      if (call.bearer !== undefined) headers['Authorization'] = `Bearer ${call.bearer}`;
      const init: RequestInit = { method: call.method, headers, signal: controller.signal, credentials: 'omit' };
      if (call.method === 'POST') {
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
        return failWith(
          apiErrorFromReply({ status: response.status, body: json, retryAfterHeader: response.headers.get('retry-after') }, accountType),
        );
      }
      if (!isRecord(json) || json['ok'] !== true) return failWith(UNEXPECTED_RESPONSE);
      const data = call.parse(json['data']);
      return data === null ? failWith(UNEXPECTED_RESPONSE) : succeed(data, 'real');
    } catch {
      // Sem conexão, DNS, TLS, timeout (abort) ou corpo cortado: nenhuma resposta utilizável chegou.
      return failWith(NETWORK_ERROR);
    } finally {
      clearTimeout(timer);
    }
  }

  const post = <T>(path: string, body: Record<string, unknown>, parse: Call<T>['parse'], bearer?: string) =>
    request<T>(bearer === undefined ? { method: 'POST', path, body, parse } : { method: 'POST', path, body, parse, bearer });

  return {
    legalCurrent: () =>
      request({
        method: 'GET',
        path: `/v1/legal/current?audience=${accountType}`,
        parse: (data) => parseCurrentLegal(data, accountType),
      }),

    register: (input) =>
      post<RegisterOutput>(
        '/v1/auth/register',
        {
          accountType,
          fullName: input.fullName,
          email: input.email,
          password: input.password,
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          birthDate: input.birthDate,
          termsAccepted: input.termsAccepted,
          privacyAccepted: input.privacyAccepted,
          termsVersion: input.termsVersion,
          privacyVersion: input.privacyVersion,
        },
        (data) => {
          if (!isRecord(data) || !isRecord(data['verification'])) return null;
          const account = parseAccount(data['account'], accountType);
          const { emailSent, resendAfterSeconds } = data['verification'];
          if (!account || typeof emailSent !== 'boolean' || typeof resendAfterSeconds !== 'number') return null;
          return { account, verification: { required: true, emailSent, resendAfterSeconds } };
        },
      ),

    verifyEmail: (input) =>
      post(
        '/v1/auth/verify-email',
        { accountType, identifier: input.identifier, code: input.code, password: input.password },
        (data) => (isRecord(data) && data['verified'] === true ? ({ verified: true } as const) : null),
      ),

    resendVerification: (input) =>
      post('/v1/auth/resend-verification', { accountType, identifier: input.identifier }, parseResend),

    forgotPassword: (input) => post('/v1/auth/forgot-password', { accountType, email: input.email }, parseResend),

    resetPassword: (input) =>
      post(
        '/v1/auth/reset-password',
        { accountType, email: input.email, code: input.code, newPassword: input.newPassword },
        (data) =>
          isRecord(data) && data['passwordChanged'] === true
            ? ({ passwordChanged: true, sessionsRevoked: true } as const)
            : null,
      ),

    login: (input, device) =>
      post(
        '/v1/auth/login',
        {
          accountType,
          identifier: input.identifier,
          password: input.password,
          device: {
            installationId: device.installationId,
            platform: device.platform,
            ...(device.label !== undefined ? { label: device.label } : {}),
            appVersion: device.appVersion ?? appVersion,
          },
        },
        (data) => {
          const account = isRecord(data) ? parseAccount(data['account'], accountType) : null;
          const tokens = parseTokens(data);
          return account && tokens ? { ...tokens, account } : null;
        },
      ),

    refresh: (refreshToken) => post('/v1/auth/refresh', { refreshToken }, parseTokens),

    logout: (refreshToken) => post<void>('/v1/auth/logout', { refreshToken }, () => undefined),

    logoutAll: (accessToken) =>
      post(
        '/v1/auth/logout-all',
        {},
        (data) =>
          isRecord(data) && typeof data['revokedSessions'] === 'number'
            ? { revokedSessions: data['revokedSessions'] }
            : null,
        accessToken,
      ),

    me: (accessToken) =>
      request({
        method: 'GET',
        path: '/v1/auth/me',
        bearer: accessToken,
        parse: (data) => parseAccountWithConsent(data, accountType),
      }),

    acceptConsents: (accessToken, input) =>
      post<ConsentStatus>(
        '/v1/auth/consents',
        {
          ...(input.termsVersion !== undefined ? { termsVersion: input.termsVersion } : {}),
          ...(input.privacyVersion !== undefined ? { privacyVersion: input.privacyVersion } : {}),
        },
        (data) => (isRecord(data) ? parseConsentStatus(data['consent']) : null),
        accessToken,
      ),

    deleteAccount: (accessToken, input) =>
      post<DeleteAccountOutput>(
        '/v1/auth/delete-account',
        { password: input.password },
        (data) => (isRecord(data) && data['accountDeleted'] === true ? ({ accountDeleted: true } as const) : null),
        accessToken,
      ),
  };
}
