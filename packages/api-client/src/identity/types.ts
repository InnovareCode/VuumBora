/**
 * Tipos da identidade dos apps (`/v1/auth/*`). Contrato HTTP: `docs/contrato-identidade-apps.md`.
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

/**
 * A porta SEM ESTADO de sessão: as nove rotas do contrato + `GET /me`, com os tokens passados por quem chama.
 * Dois adaptadores com a mesma forma de erro: `http` (origin `real`) e `mock` (origin `mock`).
 * As telas NÃO usam esta porta direto — usam `IdentityClient`, que guarda a sessão e renova o token.
 */
export interface IdentityApi {
  register(input: RegisterInput): Promise<Result<RegisterOutput>>;
  verifyEmail(input: VerifyEmailInput): Promise<Result<{ readonly verified: true }>>;
  resendVerification(input: ResendVerificationInput): Promise<Result<ResendOutput>>;
  forgotPassword(input: ForgotPasswordInput): Promise<Result<ResendOutput>>;
  resetPassword(input: ResetPasswordInput): Promise<Result<{ readonly passwordChanged: true; readonly sessionsRevoked: true }>>;
  login(input: LoginInput, device: DeviceInfo): Promise<Result<AuthenticatedSession>>;
  /** `401 invalid_refresh_token` para qualquer recusa. Rotação: o refresh enviado morre, vem um sucessor. */
  refresh(refreshToken: string): Promise<Result<SessionTokens>>;
  /** Idempotente: refresh desconhecido ou já revogado também dá sucesso. */
  logout(refreshToken: string): Promise<Result<void>>;
  logoutAll(accessToken: string): Promise<Result<{ readonly revokedSessions: number }>>;
  me(accessToken: string): Promise<Result<AccountSummary>>;
}
