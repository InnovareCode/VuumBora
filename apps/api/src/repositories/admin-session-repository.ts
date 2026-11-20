/** Camada de dados — único lugar que fala SQL com `admin_sessions`. Guarda só o HASH do token, nunca o valor bruto do cookie. */
import type { Pool } from 'pg';
import type { AdminRole, AdminUser } from '../domain/admin.js';

export interface CreateAdminSessionInput {
  readonly adminId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  /** Teto absoluto, fixado aqui e nunca avançado por `touchAdminSession` — ver migração 0007. */
  readonly absoluteExpiresAt: Date;
  /**
   * Token sincronizador de CSRF desta sessão (migração 0009) — guardado em
   * TEXTO, não hash: ver justificativa completa na própria migração. Nunca
   * viaja em cookie; só sai no corpo de `admin.login`/`GET /v1/admin/me`.
   */
  readonly csrfToken: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export async function createAdminSession(pool: Pool, input: CreateAdminSessionInput): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO admin_sessions (admin_id, token_hash, expires_at, absolute_expires_at, csrf_token, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [input.adminId, input.tokenHash, input.expiresAt, input.absoluteExpiresAt, input.csrfToken, input.ipAddress, input.userAgent],
  );
  // INSERT sem ON CONFLICT: a linha é criada agora, sempre existe uma result.rows[0].
  return result.rows[0]!.id;
}

export interface ActiveAdminSession {
  readonly sessionId: string;
  readonly admin: AdminUser;
  /** `null` para sessão criada antes da migração 0009 — `requireCsrfToken` sempre recusa `null`. */
  readonly csrfToken: string | null;
}

interface SessionRow {
  session_id: string;
  id: string;
  name: string;
  email: string;
  role: string;
  csrf_token: string | null;
}

/**
 * `null` se o token não existe, expirou (deslizante OU teto absoluto), ou
 * o admin foi desativado depois do login — nos quatro casos a sessão
 * deixa de valer, numa query só (sem N+1 de "achei a sessão" + "o admin
 * ainda está ativo?"). `absolute_expires_at` nunca é avançado por
 * `touchAdminSession` — é o que impede um cookie roubado e usado de vez em
 * quando de nunca expirar.
 */
export async function findActiveAdminSessionByTokenHash(pool: Pool, tokenHash: string): Promise<ActiveAdminSession | null> {
  const result = await pool.query<SessionRow>(
    `SELECT s.id AS session_id, u.id, u.name, u.email, u.role, s.csrf_token
     FROM admin_sessions s
     JOIN admin_users u ON u.id = s.admin_id
     WHERE s.token_hash = $1
       AND s.expires_at > now()
       AND s.absolute_expires_at > now()
       AND u.deactivated_at IS NULL`,
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    sessionId: row.session_id,
    admin: { id: row.id, name: row.name, email: row.email, role: row.role as AdminRole },
    csrfToken: row.csrf_token,
  };
}

/** Expiração deslizante: cada acesso autenticado empurra o prazo para a frente. */
export async function touchAdminSession(pool: Pool, sessionId: string, expiresAt: Date): Promise<void> {
  await pool.query(`UPDATE admin_sessions SET expires_at = $2, last_seen_at = now() WHERE id = $1`, [sessionId, expiresAt]);
}

/** Idempotente: apagar um token que já não existe (logout duplicado, sessão expirada) não é erro. */
export async function deleteAdminSessionByTokenHash(pool: Pool, tokenHash: string): Promise<void> {
  await pool.query(`DELETE FROM admin_sessions WHERE token_hash = $1`, [tokenHash]);
}
