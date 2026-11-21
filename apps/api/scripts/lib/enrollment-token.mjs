/**
 * Token de enrolamento do 2FA (uso único, fora de banda) — lado dos SCRIPTS.
 * Repete a regra de `src/services/admin-enrollment-token-service.ts`
 * (formato, normalização e sha256); há um teste que roda o script e usa o token
 * contra a API real, então divergência quebra o teste.
 */
import { createHash, randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const ENROLLMENT_TOKEN_TTL_HOURS = 48;
/** Papéis que obrigam 2FA (espelha `TWO_FACTOR_REQUIRED_ROLES` em src/domain/two-factor.ts). */
export const MANDATORY_2FA_ROLES = ['dono', 'financeiro'];

function generateToken() {
  const chars = Array.from(randomBytes(20), (byte) => ALPHABET[byte % 32]).join('');
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5)).join('-');
}

function hashToken(token) {
  return createHash('sha256').update(token.replace(/[\s-]/g, '').toUpperCase()).digest('hex');
}

/** Emite um token novo (apaga os anteriores ainda não usados). `db` é um Pool/Client do `pg`. */
export async function issueEnrollmentToken(db, adminId, ttlHours = ENROLLMENT_TOKEN_TTL_HOURS) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  await db.query(`DELETE FROM admin_enrollment_tokens WHERE admin_id = $1 AND used_at IS NULL`, [adminId]);
  await db.query(`INSERT INTO admin_enrollment_tokens (admin_id, token_hash, expires_at) VALUES ($1, $2, $3)`, [adminId, hashToken(token), expiresAt]);
  return { token, expiresAt };
}
