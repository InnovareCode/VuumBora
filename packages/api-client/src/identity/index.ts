/**
 * `@vuumbora/api-client/identity` — identidade dos apps (passageiro e motorista).
 * Contrato HTTP: `docs/contrato-identidade-apps.md`.
 *
 *   const identity = createIdentityClient({ mode: 'http', baseUrl, accountType: 'passenger', platform: Platform.OS, appVersion });
 *   await identity.login({ identifier, password });          // grava a sessão e devolve só a conta
 *   await identity.session.run((token) => ridePort.list(token)); // 401 → renova (um voo só) e repete UMA vez
 */
export { createIdentityClient } from './client';
export type { IdentityClient, IdentityClientConfig } from './client';

export { createSessionController } from './session-manager';
export type {
  SessionController,
  SessionControllerOptions,
  SessionManager,
  SessionState,
  SignOutReason,
} from './session-manager';

export { createMemorySessionStorage } from './session-storage';
export type { SessionStoragePort } from './session-storage';

export { createIdentityHttpAdapter } from './http-adapter';
export type { IdentityHttpOptions } from './http-adapter';
export { createMockIdentityApi } from './mock-adapter';
export type { MockIdentityOptions, MockLegalVersions } from './mock-adapter';

export type {
  AcceptConsentsInput,
  AccountSummary,
  AccountType,
  AccountWithConsent,
  AuthenticatedSession,
  ConsentStatus,
  CurrentLegal,
  DeviceInfo,
  DevicePlatform,
  ForgotPasswordInput,
  IdentityApi,
  LegalDocumentName,
  LegalDocumentView,
  LoginInput,
  PendingConsentDocument,
  RegisterInput,
  RegisterOutput,
  ResendOutput,
  ResendVerificationInput,
  ResetPasswordInput,
  SessionTokens,
  VerifyEmailInput,
} from './types';
