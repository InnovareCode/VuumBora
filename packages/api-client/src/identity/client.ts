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
  AcceptConsentsInput,
  AccountSummary,
  AccountType,
  AccountWithConsent,
  ConsentStatus,
  CurrentLegal,
  DeleteAccountInput,
  DeleteAccountOutput,
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
  /**
   * Só `mode: 'http'`: aceita `baseUrl` com `http:` (texto claro). SÓ DESENVOLVIMENTO (o app passa `__DEV__`).
   * Padrão `false`: numa build de loja a montagem recusa `http:`, em vez de mandar senha e tokens em claro.
   */
  readonly allowInsecureHttp?: boolean;
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

  /**
   * Os Termos e a Política VIGENTES do perfil do app (sem sessão). A tela mostra ESTES textos e, ao cadastrar, manda as
   * versões deles em `RegisterInput.termsVersion/privacyVersion`: o aceite prova o que a pessoa viu.
   */
  legalCurrent(): Promise<Result<CurrentLegal>>;
  /**
   * Cadastro. Com versões que não são as vigentes devolve `conflict` / `reason: 'consent_outdated'` e `error.current`
   * (a tela mostra de novo e reenvia). O cliente nunca reenvia sozinho com a versão nova.
   */
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
  /** A conta e o estado do aceite (`consent`: o que falta aceitar, ou `null` se a API está sem os textos). */
  me(): Promise<Result<AccountWithConsent>>;
  /**
   * Reaceite (precisa de sessão; renova o token e repete UMA vez em 401). Manda as versões que a tela de reaceite
   * exibiu; versão que não é a vigente = `conflict` / `consent_outdated` com `error.current`. Idempotente.
   */
  acceptConsents(input: AcceptConsentsInput): Promise<Result<ConsentStatus>>;
  /**
   * Exclusão de conta: reautentica por senha (401 → renova e repete uma vez) e, se confirmada,
   * encerra a sessão local — o servidor já revogou TODAS as sessões, não só esta. `401
   * wrong_password` deixa a conta e a sessão intactas (a tela pode deixar a pessoa tentar de novo).
   */
  deleteAccount(input: DeleteAccountInput): Promise<Result<DeleteAccountOutput>>;
}

const UNKNOWN_APP_VERSION = 'unknown';

function resolvePlatform(config: IdentityClientConfig): DevicePlatform {
  if (config.platform !== undefined) return config.platform;
  // Pelo `globalThis`, não pelos nomes `window`/`document`: o pacote não depende dos tipos de DOM (o passageiro e o
  // motorista compilam sem a lib DOM de propósito, e o `typecheck` do pacote tem uma passada sem ela).
  const browser = globalThis as { readonly window?: unknown; readonly document?: unknown };
  if (browser.window !== undefined && browser.document !== undefined) return 'web';
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
      ...(config.allowInsecureHttp !== undefined ? { allowInsecureHttp: config.allowInsecureHttp } : {}),
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

    legalCurrent: () => api.legalCurrent(),
    register: (input) => api.register(input),
    verifyEmail: (input) => api.verifyEmail(input),
    resendVerification: (input) => api.resendVerification(input),
    forgotPassword: (input) => api.forgotPassword(input),
    resetPassword: (input) => api.resetPassword(input),

    async login(input) {
      // A sessão guardada tem de estar em memória ANTES do login: `adopt` revoga a que este login substitui, e não
      // pode revogar o que ainda não leu (sessão órfã no servidor).
      await controller.restore();
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

    acceptConsents: (input) => controller.run((accessToken) => api.acceptConsents(accessToken, input)),

    async deleteAccount(input) {
      const result = await controller.run((accessToken) => api.deleteAccount(accessToken, input));
      if (!result.ok) return result;
      await controller.endLocal('user'); // o servidor já revogou TODAS as sessões, inclusive esta
      return result;
    },
  };
}
