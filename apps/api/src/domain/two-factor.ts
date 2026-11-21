/** Regras e tipos do segundo fator (TOTP) do admin. Sem I/O. */
import type { AdminRole } from './admin.js';

/** Papéis que NUNCA recebem sessão sem segundo fator — decisão do dono (dados financeiros e controle total). */
export const TWO_FACTOR_REQUIRED_ROLES: readonly AdminRole[] = ['dono', 'financeiro'];

export function roleRequiresTwoFactor(role: AdminRole): boolean {
  return TWO_FACTOR_REQUIRED_ROLES.includes(role);
}

export type SecondFactorMethod = 'totp' | 'recovery_code';

/** Configuração resolvida do ambiente — o serviço não lê `env` direto, recebe isto. */
export interface TwoFactorConfig {
  /** `null` = chave não configurada: nenhuma operação de 2FA roda (falha fechada, 503). */
  readonly encryptionKey: Buffer | null;
  readonly issuer: string;
  readonly maxAttempts: number;
  readonly lockMinutes: number;
  readonly challengeTtlMinutes: number;
  /** Quanto tempo um segredo ainda não confirmado vale (e não é trocado por outro `enroll/start`). */
  readonly pendingEnrollmentMinutes: number;
}
