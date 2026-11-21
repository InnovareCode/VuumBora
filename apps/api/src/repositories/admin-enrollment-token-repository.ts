/**
 * Camada de dados — único lugar que fala SQL com `admin_enrollment_tokens`
 * (migração 0016): o token de uso único, entregue fora de banda, que o
 * primeiro enrolamento do 2FA de dono/financeiro exige além da senha.
 * Só o hash é guardado.
 */
import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

/** Emite um token novo e invalida os anteriores ainda não usados (reemitir = o antigo morre). */
export async function insertEnrollmentToken(db: Queryable, adminId: string, tokenHash: string, expiresAt: Date): Promise<void> {
  await db.query(`DELETE FROM admin_enrollment_tokens WHERE admin_id = $1 AND used_at IS NULL`, [adminId]);
  await db.query(`INSERT INTO admin_enrollment_tokens (admin_id, token_hash, expires_at) VALUES ($1, $2, $3)`, [adminId, tokenHash, expiresAt]);
}

/** Só olha (não gasta): usado por `enroll/start` e como pré-checagem do `confirm`. */
export async function isEnrollmentTokenValid(db: Queryable, adminId: string, tokenHash: string): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM admin_enrollment_tokens WHERE admin_id = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > now()`,
    [adminId, tokenHash],
  );
  return (result.rowCount ?? 0) === 1;
}

/** Atômico: `UPDATE ... WHERE used_at IS NULL` — dois confirms simultâneos não gastam o mesmo token duas vezes. */
export async function consumeEnrollmentToken(db: Queryable, adminId: string, tokenHash: string): Promise<boolean> {
  const result = await db.query(
    `UPDATE admin_enrollment_tokens SET used_at = now()
     WHERE admin_id = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > now()
     RETURNING id`,
    [adminId, tokenHash],
  );
  return (result.rowCount ?? 0) === 1;
}
