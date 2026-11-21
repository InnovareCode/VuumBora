/** Resolve a configuração de 2FA a partir do `env` — único ponto que lê as variáveis `ADMIN_TOTP_*`. */
import { env } from '../env.js';
import type { TwoFactorConfig } from '../domain/two-factor.js';
import { parseEncryptionKey } from './secret-box.js';

export const twoFactorConfig: TwoFactorConfig = {
  encryptionKey: env.ADMIN_TOTP_ENCRYPTION_KEY ? parseEncryptionKey(env.ADMIN_TOTP_ENCRYPTION_KEY) : null,
  issuer: env.ADMIN_TOTP_ISSUER,
  maxAttempts: env.ADMIN_TOTP_MAX_ATTEMPTS,
  lockMinutes: env.ADMIN_TOTP_LOCK_MINUTES,
  challengeTtlMinutes: env.ADMIN_LOGIN_CHALLENGE_TTL_MINUTES,
  // Fixo (não é variável de ambiente): tempo de sobra para escanear o QR e digitar o primeiro código.
  pendingEnrollmentMinutes: 15,
};
