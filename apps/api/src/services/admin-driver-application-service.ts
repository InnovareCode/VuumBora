/**
 * Camada de lógica de negócio — leitura de candidaturas pelo admin. Único
 * lugar que junta "buscar o dado" com "registrar em admin_audit_log": é
 * aqui, não na rota, que a regra inegociável ("toda leitura de
 * candidatura grava auditoria") vive — assim nenhuma rota nova de leitura
 * pode esquecer de auditar.
 */
import type { Pool } from 'pg';
import { insertAuditLog } from '../repositories/admin-audit-repository.js';
import {
  countDriverApplicationsByStatus,
  getDriverApplicationById,
  listDriverApplications,
  type DriverApplicationListItem,
  type DriverApplicationStatusCounts,
  type DriverApplicationStatusFilter,
} from '../repositories/admin-driver-application-repository.js';
import { decodeCursor, encodeCursor } from '../domain/pagination.js';

export interface AuditContext {
  readonly adminId: string;
  readonly ipAddress: string | null;
}

export interface ListDriverApplicationsInput {
  readonly status?: DriverApplicationStatusFilter | undefined;
  readonly q?: string | undefined;
  readonly cursor?: string | undefined;
  readonly limit: number;
}

export type ListDriverApplicationsResult =
  | { readonly ok: true; readonly items: readonly DriverApplicationListItem[]; readonly nextCursor: string | null }
  | { readonly ok: false; readonly reason: 'invalid_cursor' };

export async function listDriverApplicationsForAdmin(
  pool: Pool,
  input: ListDriverApplicationsInput,
  audit: AuditContext,
): Promise<ListDriverApplicationsResult> {
  const decodedCursor = input.cursor ? decodeCursor(input.cursor) : null;
  if (input.cursor && !decodedCursor) {
    return { ok: false, reason: 'invalid_cursor' };
  }

  const { items, lastCursorValues } = await listDriverApplications(pool, {
    status: input.status,
    q: input.q,
    cursor: decodedCursor,
    limit: input.limit,
  });

  // Usa SEMPRE `lastCursorValues` (precisão de microssegundo, vinda do
  // banco) — nunca `createdAt` do item público (precisão de milissegundo,
  // via `Date` do JS). Ver o comentário em `created_at_cursor` no
  // repositório: usar o campo público aqui reintroduziria o mesmo bug de
  // paginação perdendo linha quando duas candidaturas têm o mesmo
  // milissegundo.
  const nextCursor = lastCursorValues ? encodeCursor(lastCursorValues.createdAt, lastCursorValues.id) : null;

  // `after` guarda só os filtros usados e a contagem — nunca a lista de
  // PII inteira, para não duplicar dado sensível na trilha de auditoria.
  await insertAuditLog(pool, {
    adminId: audit.adminId,
    action: 'driver_application.listed',
    targetType: 'driver_application',
    targetId: null,
    after: { status: input.status ?? null, q: input.q ?? null, resultCount: items.length },
    ipAddress: audit.ipAddress,
  });

  return { ok: true, items, nextCursor };
}

export async function getDriverApplicationForAdmin(
  pool: Pool,
  id: string,
  audit: AuditContext,
): Promise<DriverApplicationListItem | null> {
  const application = await getDriverApplicationById(pool, id);
  if (!application) return null;

  await insertAuditLog(pool, {
    adminId: audit.adminId,
    action: 'driver_application.viewed',
    targetType: 'driver_application',
    targetId: application.id,
    ipAddress: audit.ipAddress,
  });

  return application;
}

/** Contagem agregada não lê dado pessoal individual — não precisa de entrada em admin_audit_log (só a regra de "leitura de candidatura" pede auditoria). */
export async function getDriverApplicationSummary(pool: Pool): Promise<DriverApplicationStatusCounts> {
  return countDriverApplicationsByStatus(pool);
}
