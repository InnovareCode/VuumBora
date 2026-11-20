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
  getDriverApplicationDecisionState,
  listDriverApplications,
  updateDriverApplicationStatus,
  type DriverApplicationDecisionAction,
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

export interface DecisionContext extends AuditContext {
  readonly adminName: string;
  readonly idempotencyKey: string;
}

export interface DriverApplicationDecisionResult {
  readonly id: string;
  readonly status: DriverApplicationDecisionAction;
  readonly decidedAt: string;
  readonly decidedBy: { readonly id: string; readonly name: string };
  readonly decisionReason: string | null;
}

export type DecideDriverApplicationOutcome =
  | { readonly ok: true; readonly data: DriverApplicationDecisionResult; readonly replayed: boolean }
  | { readonly ok: false; readonly reason: 'not_found' }
  | { readonly ok: false; readonly reason: 'invalid_transition' };

/**
 * Núcleo comum de aprovar/recusar. `action`/`reason` já vêm validados pela
 * rota (motivo obrigatório só para `rejected`). Idempotência e concorrência
 * nascem da mesma query (`updateDriverApplicationStatus`, `WHERE status =
 * 'pending'`) — ver o comentário lá. Esta função só interpreta o
 * resultado:
 *
 * 1. Linha afetada → decisão aplicada agora. Audita e devolve `replayed:
 *    false`.
 * 2. Nenhuma linha afetada → candidatura não existe (404), OU já tinha
 *    sido decidida. Se foi decidida com a MESMA `Idempotency-Key` e para o
 *    MESMO `action` (retry de uma chamada cujo resultado o cliente não viu
 *    — rede caiu, timeout), devolve a MESMA resposta de sucesso, sem gravar
 *    auditoria nova (não houve decisão nova, só a confirmação de uma já
 *    existente). Qualquer outro caso com a linha já decidida é 409 —
 *    inclusive repetir a chamada com uma chave DIFERENTE, ou tentar a ação
 *    contrária.
 */
async function decideDriverApplication(
  pool: Pool,
  id: string,
  action: DriverApplicationDecisionAction,
  reason: string | null,
  context: DecisionContext,
): Promise<DecideDriverApplicationOutcome> {
  const applied = await updateDriverApplicationStatus(pool, {
    id,
    action,
    decidedBy: context.adminId,
    decisionReason: reason,
    idempotencyKey: context.idempotencyKey,
  });

  if (applied) {
    await insertAuditLog(pool, {
      adminId: context.adminId,
      action: action === 'approved' ? 'driver_application.approved' : 'driver_application.rejected',
      targetType: 'driver_application',
      targetId: id,
      before: { status: 'pending' },
      after: { status: action, reason },
      ipAddress: context.ipAddress,
    });

    return {
      ok: true,
      replayed: false,
      data: {
        id,
        status: action,
        decidedAt: new Date(applied.decided_at).toISOString(),
        decidedBy: { id: context.adminId, name: context.adminName },
        decisionReason: applied.decision_reason,
      },
    };
  }

  const state = await getDriverApplicationDecisionState(pool, id);
  if (!state) return { ok: false, reason: 'not_found' };

  const isSameDecisionReplay = state.status === action && state.decisionIdempotencyKey === context.idempotencyKey;
  if (!isSameDecisionReplay) return { ok: false, reason: 'invalid_transition' };

  // Replay: busca a linha completa (já decidida) para devolver a MESMA
  // resposta de sucesso — sem tocar em `admin_audit_log` de novo.
  const existing = await getDriverApplicationById(pool, id);
  if (!existing || !existing.decidedAt || !existing.decidedBy) {
    // Defensivo: `state.status !== 'pending'` já implica `decidedAt`/`decidedBy`
    // preenchidos pela própria UPDATE que os gravou — nunca deveria cair aqui.
    return { ok: false, reason: 'invalid_transition' };
  }

  return {
    ok: true,
    replayed: true,
    data: {
      id: existing.id,
      status: action,
      decidedAt: existing.decidedAt,
      decidedBy: existing.decidedBy,
      decisionReason: existing.decisionReason,
    },
  };
}

export async function approveDriverApplicationForAdmin(pool: Pool, id: string, context: DecisionContext): Promise<DecideDriverApplicationOutcome> {
  return decideDriverApplication(pool, id, 'approved', null, context);
}

export async function rejectDriverApplicationForAdmin(
  pool: Pool,
  id: string,
  reason: string,
  context: DecisionContext,
): Promise<DecideDriverApplicationOutcome> {
  return decideDriverApplication(pool, id, 'rejected', reason, context);
}
