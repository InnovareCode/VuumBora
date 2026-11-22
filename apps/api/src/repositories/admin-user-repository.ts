/**
 * Camada de dados — gestão de usuários do painel (F07): listar, criar,
 * desativar, reativar e trocar papel. Separado de `admin-repository.ts`
 * (que é só leitura, para o LOGIN) de propósito: ali é "quem está entrando",
 * aqui é "o dono administrando quem pode entrar" — caminhos de acesso
 * diferentes, mesma tabela.
 *
 * Migração 0023 deu a este serviço (via o papel `vuumbora_api`) INSERT e
 * UPDATE em `admin_users` — nunca DELETE: ninguém é apagado, só desativado.
 */
import type { Pool, PoolClient } from 'pg';
import type { AdminRole } from '../domain/admin.js';
import type { DecodedCursor } from '../domain/pagination.js';

type Queryable = Pool | PoolClient;

export interface AdminUserManagementRow {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: AdminRole;
  readonly createdAt: string;
  readonly deactivatedAt: string | null;
}

interface Row {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
  deactivated_at: string | null;
}

function mapRow(row: Row): AdminUserManagementRow {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as AdminRole,
    createdAt: new Date(row.created_at).toISOString(),
    deactivatedAt: row.deactivated_at ? new Date(row.deactivated_at).toISOString() : null,
  };
}

export interface ListAdminUsersFilter {
  readonly role?: AdminRole | undefined;
  /** `false` (padrão) mostra só ativos — o painel pede explicitamente para ver quem foi desativado. */
  readonly includeDeactivated: boolean;
  readonly cursor: DecodedCursor | null;
  readonly limit: number;
}

export interface ListAdminUsersResult {
  readonly items: readonly AdminUserManagementRow[];
  readonly hasMore: boolean;
  readonly lastCursorValues: { readonly createdAt: string; readonly id: string } | null;
}

interface ListRow extends Row {
  created_at_cursor: string;
}

/** Mesmo truque de `admin-driver-application-repository.ts`: pede `limit + 1` para saber se há próxima página sem outra query. */
export async function listAdminUsers(pool: Pool, filter: ListAdminUsersFilter): Promise<ListAdminUsersResult> {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (!filter.includeDeactivated) {
    conditions.push('deactivated_at IS NULL');
  }

  if (filter.role) {
    params.push(filter.role);
    conditions.push(`role = $${params.length}`);
  }

  if (filter.cursor) {
    params.push(filter.cursor.createdAt);
    const createdAtIndex = params.length;
    params.push(filter.cursor.id);
    const idIndex = params.length;
    conditions.push(`(created_at, id) < ($${createdAtIndex}::timestamptz, $${idIndex}::uuid)`);
  }

  params.push(filter.limit + 1);
  const limitIndex = params.length;
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query<ListRow>(
    `SELECT id, name, email, role, created_at, deactivated_at,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_cursor
     FROM admin_users
     ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT $${limitIndex}`,
    params,
  );

  const hasMore = result.rows.length > filter.limit;
  const pageRows = result.rows.slice(0, filter.limit);
  const items = pageRows.map(mapRow);
  const lastRow = pageRows[pageRows.length - 1];
  const lastCursorValues = hasMore && lastRow ? { createdAt: lastRow.created_at_cursor, id: lastRow.id } : null;

  return { items, hasMore, lastCursorValues };
}

export type InsertAdminUserResult = { readonly kind: 'ok'; readonly row: AdminUserManagementRow } | { readonly kind: 'email_taken' };

const UNIQUE_VIOLATION = '23505';

export async function insertAdminUser(
  db: Queryable,
  input: { readonly name: string; readonly email: string; readonly role: AdminRole; readonly passwordHash: string },
): Promise<InsertAdminUserResult> {
  try {
    const result = await db.query<Row>(
      `INSERT INTO admin_users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at, deactivated_at`,
      [input.name, input.email, input.passwordHash, input.role],
    );
    return { kind: 'ok', row: mapRow(result.rows[0]!) };
  } catch (err) {
    if ((err as { code?: string }).code === UNIQUE_VIOLATION) return { kind: 'email_taken' };
    throw err;
  }
}

/** Trava a linha para a transação que vai decidir (desativar/reativar/trocar papel) — `null` se o id não existe. */
export async function lockAdminUserById(client: PoolClient, id: string): Promise<AdminUserManagementRow | null> {
  const result = await client.query<Row>(
    `SELECT id, name, email, role, created_at, deactivated_at FROM admin_users WHERE id = $1 FOR UPDATE`,
    [id],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

/**
 * Trava TODAS as linhas de `dono` ativo (inclusive a de `excludeId`, se for uma delas) e devolve quantas restam
 * SEM contar `excludeId`. Travar o conjunto inteiro é o que torna isto seguro contra duas desativações/trocas de
 * papel concorrentes em donos DIFERENTES: a segunda transação espera a primeira comitar e aí vê a realidade
 * atualizada — nunca as duas decidem "sobra pelo menos um" ao mesmo tempo e zeram a conta.
 */
export async function countOtherActiveOwners(client: PoolClient, excludeId: string): Promise<number> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM admin_users WHERE role = 'dono' AND deactivated_at IS NULL FOR UPDATE`,
  );
  return result.rows.filter((row) => row.id !== excludeId).length;
}

/** `null` se já estava desativado (chamador trata como idempotente) — nunca lança para esse caso. */
export async function setAdminUserDeactivated(client: PoolClient, id: string): Promise<AdminUserManagementRow | null> {
  const result = await client.query<Row>(
    `UPDATE admin_users SET deactivated_at = now() WHERE id = $1 AND deactivated_at IS NULL
     RETURNING id, name, email, role, created_at, deactivated_at`,
    [id],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

/** `null` se já estava ativo. */
export async function clearAdminUserDeactivated(client: PoolClient, id: string): Promise<AdminUserManagementRow | null> {
  const result = await client.query<Row>(
    `UPDATE admin_users SET deactivated_at = NULL WHERE id = $1 AND deactivated_at IS NOT NULL
     RETURNING id, name, email, role, created_at, deactivated_at`,
    [id],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function setAdminUserRole(client: PoolClient, id: string, role: AdminRole): Promise<AdminUserManagementRow> {
  const result = await client.query<Row>(
    `UPDATE admin_users SET role = $2 WHERE id = $1 RETURNING id, name, email, role, created_at, deactivated_at`,
    [id, role],
  );
  // O chamador já travou a linha com `lockAdminUserById` nesta mesma transação — ela sempre existe aqui.
  return mapRow(result.rows[0]!);
}

/** Primeiro acesso (`admin-user-service.ts::activateAdminUser`): a única escrita de senha fora do login/redefinição. */
export async function setAdminUserPasswordHash(db: Queryable, id: string, passwordHash: string): Promise<void> {
  await db.query(`UPDATE admin_users SET password_hash = $2 WHERE id = $1`, [id, passwordHash]);
}
