/**
 * `createIdentityClient`: a porta que as TELAS usam para identidade. Junta o adaptador (`mock` ou `http`), o
 * `SessionManager` (renovação serializada) e a `SessionStoragePort`.
 *
 * Os tokens NUNCA saem daqui: `login` devolve só a conta; as demais portas de dados chamam
 * `client.session.run(...)` / `getValidAccessToken()`.
 */
import type { AdapterMode, ClientConfig, Result } from '../index';
import { APP_VERSION_PATTERN, createIdentityHttpAdapter, DEFAULT_TIMEOUT_MS } from './http-adapter';
import { createInstallationIdProvider, defaultRandomId } from './installation-id';
import { createMockIdentityApi, type MockIdentityOptions } from './mock-adapter';
import { succeed } from './result';
import { createSessionController, type SessionManager } from './session-manager';
import { createMemorySessionStorage, type SessionStoragePort, storageKeys } from './session-storage';
import type {
  AccountSummary,
  AccountType,
  DevicePlatform,
  ForgotPasswordInput,
  IdentityApi,
  LoginInput,
  RegisterInput,
  RegisterOutput,
  ResendOutput,
  ResendVerificationInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from './types';

export interface IdentityClientConfig extends ClientConfig {
  /** Fixo por app: o passageiro é `passenger`, o motorista é `driver`. */
  readonly accountType: AccountType;
  /**
   * Versão do app (vai em `X-App-Version` e no `device` do login). Passe a do `app.config`. Sem ela o cabeçalho sai
   * como `unknown` — um servidor que passe a exigir versão (`426`) vai recusar, de propósito, em vez de mentir.
   */
  readonly appVersion?: string;
  /** `android` | `ios` | `web`. Obrigatório fora do navegador (o pacote não conhece `react-native`): passe `Platform.OS`. */
  readonly platform?: DevicePlatform;
  /** Nome do aparelho para a lista de sessões (opcional, até 80 caracteres). */
  readonly deviceLabel?: string;
  /** Padrão: memória (sessão some ao fechar o app). No nativo, a A3 passa a implementação do SecureStore. */
  readonly storage?: SessionStoragePort;
  /** Gerador de id aleatório. Padrão: `crypto` global; se não houver, a montagem FALHA — passe `expo-crypto`. */
  readonly randomId?: () => string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  /** Só `mode: 'mock'`: código, latência e relógio do mock. */
  readonly mock?: MockIdentityOptions;
  /** Relógio em ms (injetável nos testes). */
  readonly clock?: () => number;
  /** O armazenamento rejeitou. Recebe só o erro (nunca o conteúdo). A sessão em memória continua valendo. */
  readonly onStorageError?: (error: unknown) => void;
}

export interface IdentityClient {
  readonly accountType: AccountType;
  readonly mode: AdapterMode;
  /** Estado, assinatura e `run`/`getValidAccessToken` para as portas de dados e para o WebSocket. */
  readonly session: SessionManager;

  register(input: RegisterInput): Promise<Result<RegisterOutput>>;
  verifyEmail(input: VerifyEmailInput): Promise<Result<{ readonly verified: true }>>;
  resendVerification(input: ResendVerificationInput): Promise<Result<ResendOutput>>;
  forgotPassword(input: ForgotPasswordInput): Promise<Result<ResendOutput>>;
  resetPassword(input: ResetPasswordInput): Promise<Result<{ readonly passwordChanged: true; readonly sessionsRevoked: true }>>;
  /** Abre a sessão (tokens gravados antes de devolver) e devolve só a conta. */
  login(input: LoginInput): Promise<Result<AccountSummary>>;
  /** Sai neste aparelho: o local sempre sai; `serverRevoked` diz se o servidor também confirmou. */
  logout(): Promise<Result<{ readonly serverRevoked: boolean }>>;
  /** Revoga TODAS as sessões da conta e sai deste aparelho. */
  logoutAll(): Promise<Result<{ readonly revokedSessions: number }>>;
  me(): Promise<Result<AccountSummary>>;
}

const UNKNOWN_APP_VERSION = 'unknown';

function resolvePlatform(config: IdentityClientConfig): DevicePlatform {
  if (config.platform !== undefined) return config.platform;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') return 'web';
  throw new Error('createIdentityClient: informe `platform` (android | ios | web) fora do navegador.');
}

export function createIdentityClient(config: IdentityClientConfig): IdentityClient {
  const { accountType, mode } = config;
  if (mode !== 'mock' && mode !== 'http') throw new Error('createIdentityClient: mode deve ser "mock" ou "http".');
  if (accountType !== 'passenger' && accountType !== 'driver') {
    throw new Error('createIdentityClient: accountType deve ser "passenger" ou "driver".');
  }
  const appVersion = config.appVersion ?? UNKNOWN_APP_VERSION;
  if (!APP_VERSION_PATTERN.test(appVersion)) throw new Error('createIdentityClient: appVersion inválida (use algo como "1.4.0").');
  const platform = resolvePlatform(config);
  const randomId = config.randomId ?? defaultRandomId();
  if (!randomId) {
    throw new Error('createIdentityClient: este ambiente não tem `crypto`; passe `randomId` (ex.: expo-crypto).');
  }

  let api: IdentityApi;
  if (mode === 'http') {
    if (!config.baseUrl) throw new Error('createIdentityClient: mode "http" exige baseUrl.');
    api = createIdentityHttpAdapter({
      baseUrl: config.baseUrl,
      accountType,
      appVersion,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      ...(config.fetch ? { fetch: config.fetch } : {}),
    });
  } else {
    api = createMockIdentityApi(accountType, { ...(config.clock ? { clock: config.clock } : {}), ...config.mock });
  }
  const origin = mode === 'http' ? 'real' : 'mock';

  const storage = config.storage ?? createMemorySessionStorage();
  const onStorageError = config.onStorageError ?? (() => undefined);
  const controller = createSessionController({
    accountType,
    api,
    storage,
    origin,
    onStorageError,
    ...(config.clock ? { clock: config.clock } : {}),
  });
  const installationId = createInstallationIdProvider({
    storage,
    key: storageKeys(accountType).installationId,
    randomId,
    onStorageError,
  });

  return {
    accountType,
    mode,
    session: controller,

    register: (input) => api.register(input),
    verifyEmail: (input) => api.verifyEmail(input),
    resendVerification: (input) => api.resendVerification(input),
    forgotPassword: (input) => api.forgotPassword(input),
    resetPassword: (input) => api.resetPassword(input),

    async login(input) {
      const device = {
        installationId: await installationId(),
        platform,
        appVersion,
        ...(config.deviceLabel ? { label: config.deviceLabel.slice(0, 80) } : {}),
      };
      const result = await api.login(input, device);
      if (!result.ok) return result;
      const { account, ...tokens } = result.data;
      await controller.adopt(tokens);
      return succeed(account, result.origin);
    },

    logout: () => controller.signOut(),

    async logoutAll() {
      const result = await controller.run((accessToken) => api.logoutAll(accessToken));
      if (!result.ok) return result;
      await controller.endLocal('user'); // o servidor já revogou tudo, inclusive esta sessão
      return result;
    },

    me: () => controller.run((accessToken) => api.me(accessToken)),
  };
}
