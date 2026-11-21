import type { RecoveryCodes, TotpEnrollment, TwoFactorStatus } from './types';
import type { Result } from './result';
import { createHttpRequester } from './client';

/** Segundo fator COM sessão (configurações). As que mutam levam `X-CSRF-Token` (o requester já anexa). */
export interface TwoFactorPort {
  status(): Promise<Result<TwoFactorStatus>>;
  /** Exige a senha ATUAL. Idempotente enquanto o segredo pendente vale (15 min). */
  startEnrollment(password: string): Promise<Result<TotpEnrollment>>;
  confirmEnrollment(code: string): Promise<Result<RecoveryCodes>>;
  /** Só TOTP — código de recuperação não vale aqui. Exige a senha atual. Os códigos antigos morrem. */
  regenerateRecoveryCodes(input: { code: string; password: string }): Promise<Result<RecoveryCodes>>;
  /** TOTP ou recuperação + senha atual. Só papéis opcionais (dono/financeiro recebem 403). */
  disable(input: { code: string; password: string }): Promise<Result<void>>;
}

export function createHttpTwoFactorAdapter(baseUrl: string): TwoFactorPort {
  const request = createHttpRequester(baseUrl);
  return {
    status: () => request<TwoFactorStatus>({ path: '/v1/admin/2fa/status' }),
    startEnrollment: (password) => request<TotpEnrollment>({ path: '/v1/admin/2fa/enroll/start', method: 'POST', body: { password } }),
    confirmEnrollment: (code) => request<RecoveryCodes>({ path: '/v1/admin/2fa/enroll/confirm', method: 'POST', body: { code } }),
    regenerateRecoveryCodes: ({ code, password }) =>
      request<RecoveryCodes>({ path: '/v1/admin/2fa/recovery-codes/regenerate', method: 'POST', body: { code, password } }),
    disable: ({ code, password }) => request<void>({ path: '/v1/admin/2fa/disable', method: 'POST', body: { code, password } }),
  };
}

/** Mock explícito: o 2FA só existe de verdade na API; em demonstração a tela de segurança diz isso em vez de fingir. */
export function createMockTwoFactorAdapter(): TwoFactorPort {
  const unavailable = async (): Promise<Result<never>> => ({ ok: false, error: { kind: 'two_factor_unavailable' } });
  return {
    status: async () => ({ ok: true, data: { enabled: false, required: false, recoveryCodesRemaining: 0 }, origin: 'mock' }),
    startEnrollment: unavailable,
    confirmEnrollment: unavailable,
    regenerateRecoveryCodes: unavailable,
    disable: unavailable,
  };
}
