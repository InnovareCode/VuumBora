/** Código de 6 dígitos de e-mail: geração e hash (HMAC com pepper). Sem I/O. */
import { randomInt } from 'node:crypto';
import { hmacHex } from './token-crypto.js';

export type EmailCodePurpose = 'verify_email' | 'password_reset';

/** Uniforme em 000000–999999 (CSPRNG, sem viés de módulo). */
export function generateEmailCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Mesmo formato documentado na migração 0014: HMAC(pepper, purpose|account_id|codigo), hex. */
export function hashEmailCode(pepper: string, purpose: EmailCodePurpose, accountId: string, code: string): string {
  return hmacHex(pepper, `${purpose}|${accountId}|${code}`);
}
