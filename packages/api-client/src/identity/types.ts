/**
 * Tipos da identidade dos apps (`/v1/auth/*` e `/v1/legal/current`). Contrato HTTP: `docs/contrato-identidade-apps.md`.
 * O `accountType` NÃO aparece nas entradas: ele é fixo por app e entra pela fábrica (`createIdentityClient`).
 */
import type { Result } from '../index';

/** Contas SEPARADAS: um tipo por conta, para sempre. `admin` nunca passa por aqui. */
export type AccountType = 'passenger' | 'driver';
export type DevicePlatform = 'android' | 'ios' | 'web';

export interface AccountSummary {
  readonly id: string;
  /** ID público (o que a pessoa pode digitar no login no lugar do e-mail). */
  readonly publicId: string;
  readonly fullName: string;
  readonly accountType: AccountType;
}

/** Os dois documentos que a pessoa aceita: Termos de Uso e Política de Privacidade (no JSON: `terms` e `privacy`). */
export type LegalDocumentName = 'terms' | 'privacy';

/** Um documento vigente (ou pendente) como a API o mostra. `url` aponta para texto imutável por versão. */
export interface LegalDocumentView {
  readonly version: string;
  /** SHA-256 hex minúsculo do arquivo exato servido em `url`. */
  readonly sha256: string;
  /** ISO 8601 (UTC). */
  readonly publishedAt: string;
  readonly url: string;
}

/** `GET /v1/legal/current` e `error.current` do `409 consent_outdated`: sempre os DOIS documentos do perfil. */
export interface CurrentLegal {
  readonly audience: AccountType;
  readonly terms: LegalDocumentView;
  readonly privacy: LegalDocumentView;
}

export interface PendingConsentDocument extends LegalDocumentView {
  readonly document: LegalDocumentName;
}

/** `consent` de `GET /me` e da resposta do reaceite. `upToDate` é `pending.length === 0` (o cliente confere). */
export interface ConsentStatus {
  readonly upToDate: boolean;
  /** Na ordem Termos, Política; cada item é a versão VIGENTE daquele documento. */
  readonly pending: readonly PendingConsentDocument[];
}

/**
 * `GET /me`: a conta mais o estado do aceite. `consent: null` = a API está sem a configuração dos textos legais
 * (a sessão continua válida, mas não há como mostrar reaceite agora). Ausente na resposta NÃO vira `null`: é resposta
 * fora do contrato (`unknown`).
 */
export interface AccountWithConsent extends AccountSummary {
  readonly consent: ConsentStatus | null;
}

/** Os dois tokens da sessão. Datas em ISO 8601 (UTC), como o servidor devolve. */
export interface SessionTokens {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: string;
}

export interface AuthenticatedSession extends SessionTokens {
  readonly account: AccountSummary;
}

/** Identifica a INSTALAÇÃO (não a pessoa): vai no login e aparece na lista de sessões. */
export interface DeviceInfo {
  readonly installationId: string;
  readonly platform: DevicePlatform;
  readonly label?: string;
  readonly appVersion?: string;
}

export interface RegisterInput {
  readonly fullName: string;
  readonly email: string;
  /** 8 a 72 BYTES (UTF-8). */
  readonly password: string;
  readonly phone?: string;
  /** `"AAAA-MM-DD"`, 18 anos completos. O app não guarda a data depois do cadastro. */
  readonly birthDate: string;
  /** Literalmente `true`: a tela só chama depois de a pessoa marcar os dois aceites. */
  readonly termsAccepted: true;
  readonly privacyAccepted: true;
  /**
   * As versões que a tela EXIBIU: `terms.version` e `privacy.version` do `CurrentLegal` que ela renderizou
   * (`legalCurrent()`, ou `error.current` de um `409 consent_outdated`). É ENTRADA da tela, nunca constante do app nem
   * do pacote: o aceite prova "o que a pessoa viu". Versão que não é a vigente = `409 consent_outdated`.
   */
  readonly termsVersion: string;
  readonly privacyVersion: string;
}

export interface RegisterOutput {
  readonly account: AccountSummary;
  readonly verification: {
    readonly required: true;
    /** `false` = a conta existe mas o e-mail não saiu: ofereça "reenviar código". Não é erro. */
    readonly emailSent: boolean;
    readonly resendAfterSeconds: number;
  };
}

/**
 * Reaceite (`POST /v1/auth/consents`): as versões que a tela de reaceite EXIBIU, uma ou as duas (ao menos uma).
 * Valem as mesmas regras de `RegisterInput.termsVersion`.
 */
export interface AcceptConsentsInput {
  readonly termsVersion?: string;
  readonly privacyVersion?: string;
}

export interface VerifyEmailInput {
  /** E-mail ou ID público. */
  readonly identifier: string;
  readonly code: string;
  /** A senha escolhida no cadastro (o servidor a exige junto do código, I-4b). */
  readonly password: string;
}

export interface ResendVerificationInput {
  readonly identifier: string;
}

export interface ForgotPasswordInput {
  readonly email: string;
}

export interface ResetPasswordInput {
  readonly email: string;
  readonly code: string;
  readonly newPassword: string;
}

export interface LoginInput {
  /** E-mail ou ID público (celular NÃO). */
  readonly identifier: string;
  readonly password: string;
}

export interface ResendOutput {
  readonly resendAfterSeconds: number;
}

/** `POST /v1/auth/delete-account` — reautentica por senha antes de anonimizar a conta. */
export interface DeleteAccountInput {
  readonly password: string;
}

export interface DeleteAccountOutput {
  readonly accountDeleted: true;
}

/**
 * A porta SEM ESTADO de sessão: as rotas do contrato + `GET /me`, `GET /legal/current` e `POST /consents`, com os
 * tokens passados por quem chama. Dois adaptadores com a mesma forma de erro: `http` (origin `real`) e `mock`
 * (origin `mock`). As telas NÃO usam esta porta direto — usam `IdentityClient`, que guarda a sessão e renova o token.
 */
export interface IdentityApi {
  /** Sem sessão. O perfil (`audience`) é o `accountType` do app. */
  legalCurrent(): Promise<Result<CurrentLegal>>;
  register(input: RegisterInput): Promise<Result<RegisterOutput>>;
  verifyEmail(input: VerifyEmailInput): Promise<Result<{ readonly verified: true }>>;
  resendVerification(input: ResendVerificationInput): Promise<Result<ResendOutput>>;
  forgotPassword(input: ForgotPasswordInput): Promise<Result<ResendOutput>>;
  resetPassword(input: ResetPasswordInput): Promise<Result<{ readonly passwordChanged: true; readonly sessionsRevoked: true }>>;
  login(input: LoginInput, device: DeviceInfo): Promise<Result<AuthenticatedSession>>;
  /** `401 invalid_refresh_token` para qualquer recusa; `400 invalid_refresh_body` se o refresh enviado está malformado. Rotação: o refresh enviado morre, vem um sucessor. */
  refresh(refreshToken: string): Promise<Result<SessionTokens>>;
  /** Idempotente: refresh desconhecido ou já revogado também dá sucesso. Revoga a FAMÍLIA do token. */
  logout(refreshToken: string): Promise<Result<void>>;
  logoutAll(accessToken: string): Promise<Result<{ readonly revokedSessions: number }>>;
  me(accessToken: string): Promise<Result<AccountWithConsent>>;
  /** Idempotente (reaceitar a mesma versão não duplica). Tudo ou nada: uma versão que não é a vigente = `409`. */
  acceptConsents(accessToken: string, input: AcceptConsentsInput): Promise<Result<ConsentStatus>>;
  /**
   * Exclusão de conta (`docs/contrato-identidade-apps.md`, item 3 das pendências jurídicas).
   * Reautentica por senha (gasta bcrypt no servidor, mesma classe de limite do login/cadastro); só
   * se ela confere, a conta é anonimizada e TODAS as sessões são revogadas (não só a usada).
   * `401 wrong_password` (conta e sessões continuam vivas) ou `401 unauthorized` (sem sessão
   * válida); `429 too_many_attempts` com espera própria (par conta+IP, isolada do login).
   */
  deleteAccount(accessToken: string, input: DeleteAccountInput): Promise<Result<DeleteAccountOutput>>;
}
