/** Camada de dados — único lugar que fala SQL com `admin_users`. Só leitura: criar admin é `scripts/create-admin.mjs`, nunca a API. */
import type { Pool } from 'pg';
import type { AdminRole, AdminUserRecord } from '../domain/admin.js';

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  deactivated_at: string | null;
}

function mapRow(row: AdminUserRow): AdminUserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role as AdminRole,
    deactivatedAt: row.deactivated_at,
  };
}

/** `null` se não existir — quem chama (serviço de login) nunca revela a diferença entre "não existe" e "senha errada". */
export async function findAdminByEmail(pool: Pool, email: string): Promise<AdminUserRecord | null> {
  const result = await pool.query<AdminUserRow>(
    `SELECT id, name, email, password_hash, role, deactivated_at
     FROM admin_users
     WHERE email = $1`,
    [email],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}
