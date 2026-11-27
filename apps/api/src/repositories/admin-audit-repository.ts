/** Camada de dados — único lugar que fala SQL com `admin_audit_log`. Append-only: nenhuma função aqui faz UPDATE/DELETE. */
import type { Pool } from 'pg';

export interface AuditLogInput {
  readonly adminId: string;
  readonly action: string;
  readonly targetType: string;
  /** `null` quando a ação não tem um registro único como alvo (ex.: listagem com filtro). */
  readonly targetId: string | null;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly ipAddress: string | null;
}

/** `pool` ou o `client` de uma transação: a trilha de uma decisão grava na MESMA transação da decisão. */
export async function insertAuditLog(pool: Pick<Pool, 'query'>, input: AuditLogInput): Promise<void> {
  await pool.query(
    `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, before, after, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.adminId,
      input.action,
      input.targetType,
      input.targetId,
      input.before !== undefined ? JSON.stringify(input.before) : null,
      input.after !== undefined ? JSON.stringify(input.after) : null,
      input.ipAddress,
    ],
  );
}
