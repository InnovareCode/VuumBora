/**
 * Revisão de documentos pelo painel (fatia D5 do `docs/plano-m3-m4.md` §3; contrato `DocumentReviewPort` do K0).
 *
 * - O autor de toda decisão é o administrador da SESSÃO (`adminId` vem do hook, nunca do corpo).
 * - Toda decisão (aprovar, recusar, suspender, reativar) grava `admin_audit_log` na MESMA transação: sem trilha, não
 *   há decisão. A visualização grava a trilha ANTES de assinar a URL (N5).
 * - N4: aprovar o último obrigatório aprova o motorista na mesma transação, só se ele estiver `pending`.
 * - Idempotência: a decisão do documento só acontece uma vez (`UPDATE ... WHERE status = 'submitted'` sob `FOR UPDATE`).
 *   Repetir o MESMO pedido (mesma `Idempotency-Key`, mesmo corpo) devolve a mesma resposta; a chave e a impressão
 *   digital do pedido ficam na própria linha da trilha da decisão (não há coluna para isso no documento).
 * - Conflito de interesse: ninguém decide sobre o próprio cadastro (o gatilho da 0025 também recusa).
 */
import type { Pool, PoolClient } from 'pg';
import { decodeCursor, encodeCursor } from '../domain/pagination.js';
import { expiresOnProblem, requestFingerprint, type QueueQuery, type RejectInput } from '../domain/document-review.js';
import { isUuid, type VerificationStatus } from '../domain/driver-onboarding.js';
import type { DocumentStorage } from '../lib/document-storage.js';
import { insertAuditLog } from '../repositories/admin-audit-repository.js';
import * as repo from '../repositories/document-review-repository.js';
import { getVerification } from './driver-onboarding-service.js';

export interface AdminActor {
  readonly adminId: string;
  readonly ipAddress: string | null;
}

async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Sai da transação sem gravar nada, levando o resultado. */
class Abort<T> {
  constructor(readonly result: T) {}
}

async function attempt<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  try {
    return await inTransaction(pool, work);
  } catch (err) {
    if (err instanceof Abort) return err.result as T;
    throw err;
  }
}

const VISIBLE = new Set(['submitted', 'approved', 'rejected', 'expired']);
const iso = (date: Date) => date.toISOString();

// ---------------------------------------------------------------------------------------------------------------------
// Fila
// ---------------------------------------------------------------------------------------------------------------------

export interface QueueItem {
  readonly documentId: string;
  readonly driverId: string;
  readonly driverName: string;
  readonly typeCode: string;
  readonly typeLabel: string;
  readonly status: 'submitted' | 'approved' | 'rejected' | 'expired';
  readonly submittedAt: string;
  readonly reviewDeadline: string;
  readonly overdue: boolean;
}

export type QueueOutcome =
  | { readonly kind: 'ok'; readonly items: readonly QueueItem[]; readonly nextCursor?: string }
  | { readonly kind: 'invalid_cursor' };

/** Mais antigo primeiro. Sem CPF, CNH nem endereço. A leitura da fila (nomes de motorista) vai para a trilha. */
export async function listQueue(pool: Pool, query: QueueQuery, actor: AdminActor): Promise<QueueOutcome> {
  let after: { submittedAt: string; id: string } | null = null;
  if (query.cursor !== null) {
    const decoded = decodeCursor(query.cursor);
    if (!decoded || !isUuid(decoded.id)) return { kind: 'invalid_cursor' };
    after = { submittedAt: decoded.createdAt, id: decoded.id };
  }
  const rows = await repo.listQueue(pool, { status: query.status, after, limit: query.limit });
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  const nextCursor = rows.length > query.limit && last ? encodeCursor(last.submittedAtCursor, last.documentId) : undefined;
  await insertAuditLog(pool, {
    adminId: actor.adminId, action: 'document_review.listed', targetType: 'driver_document', targetId: null,
    after: { status: query.status, count: page.length, paged: query.cursor !== null }, ipAddress: actor.ipAddress,
  });
  return {
    kind: 'ok',
    items: page.map((row) => ({
      documentId: row.documentId,
      driverId: row.driverId,
      driverName: row.driverName,
      typeCode: row.typeCode,
      typeLabel: row.typeLabel,
      status: row.status,
      submittedAt: iso(row.submittedAt),
      reviewDeadline: iso(row.reviewDeadline),
      overdue: row.overdue,
    })),
    ...(nextCursor !== undefined ? { nextCursor } : {}),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Detalhe do motorista
// ---------------------------------------------------------------------------------------------------------------------

/** O detalhe tem CPF, CNH, endereço e nascimento: só existe com a trilha gravada (`driver.viewed`). `null` = 404. */
export async function getDriverDetail(pool: Pool, driverId: string, actor: AdminActor): Promise<Record<string, unknown> | null> {
  const row = await repo.findDriverDetail(pool, driverId);
  if (!row) return null;
  await insertAuditLog(pool, { adminId: actor.adminId, action: 'driver.viewed', targetType: 'driver', targetId: driverId, ipAddress: actor.ipAddress });
  const [vehicle, documents, verification] = await Promise.all([
    repo.findActiveVehicle(pool, driverId),
    repo.listDriverDocuments(pool, driverId),
    getVerification(pool, driverId),
  ]);
  const profile = row.profile;
  return {
    driverId: row.driverId,
    fullName: row.fullName,
    email: row.email,
    applicationId: row.applicationId,
    status: verification.status,
    ...(profile
      ? {
          profile: {
            cpf: profile.cpf,
            birthDate: profile.birthDate ?? '',
            address: {
              street: profile.street,
              number: profile.number,
              ...(profile.complement !== null ? { complement: profile.complement } : {}),
              neighborhood: profile.neighborhood,
              city: profile.city,
              state: profile.state,
              postalCode: profile.postalCode,
            },
            // A etapa 2 só grava CNH com EAR (`422 cnh_without_ear`): CNH gravada é CNH com EAR.
            cnh: { number: profile.cnhNumber, category: profile.cnhCategory, expiresOn: profile.cnhExpiresOn, ear: true },
          },
        }
      : {}),
    ...(vehicle ? { vehicle: { vehicleId: vehicle.id, plate: vehicle.plate, brand: vehicle.brand, model: vehicle.model, year: vehicle.year, color: vehicle.color } } : {}),
    ...(row.suspension ? { suspension: { reason: row.suspension.reason, suspendedAt: iso(row.suspension.suspendedAt) } } : {}),
    documents: documents.map((document) => ({
      documentId: document.documentId,
      typeCode: document.typeCode,
      typeLabel: document.typeLabel,
      status: document.status,
      contentType: document.contentType,
      sizeBytes: document.sizeBytes,
      submittedAt: iso(document.submittedAt),
      ...(document.reviewedAt ? { reviewedAt: iso(document.reviewedAt) } : {}),
      ...(document.expiresOn !== null ? { expiresOn: document.expiresOn } : {}),
      ...(document.rejectionCode !== null && document.rejectionText !== null ? { rejection: { code: document.rejectionCode, text: document.rejectionText } } : {}),
      ...(document.internalNote !== null ? { internalNote: document.internalNote } : {}),
    })),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Visualização (N5)
// ---------------------------------------------------------------------------------------------------------------------

export type ViewUrlOutcome =
  | { readonly kind: 'ok'; readonly url: string; readonly expiresAt: string }
  | { readonly kind: 'not_found' };

/** A trilha (`document.view_url`) é gravada e CONFIRMADA antes de a URL existir: se ela falhar, não há URL. */
export async function viewUrl(pool: Pool, documentId: string, actor: AdminActor, storage: DocumentStorage, ttlSeconds: number): Promise<ViewUrlOutcome> {
  const doc = await repo.findDocument(pool, documentId);
  if (!doc || !VISIBLE.has(doc.status)) return { kind: 'not_found' };
  await insertAuditLog(pool, {
    adminId: actor.adminId, action: 'document.view_url', targetType: 'driver_document', targetId: documentId,
    after: { driverId: doc.driverId, typeCode: doc.typeCode, status: doc.status, ttlSeconds }, ipAddress: actor.ipAddress,
  });
  const signed = await storage.presignView({ key: doc.storageKey, ttlSeconds });
  return { kind: 'ok', url: signed.url, expiresAt: iso(signed.expiresAt) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Aprovar e recusar
// ---------------------------------------------------------------------------------------------------------------------

export interface DecisionResponse {
  readonly documentId: string;
  readonly status: 'approved' | 'rejected';
  readonly reviewedAt: string;
  readonly expiresOn?: string;
  readonly rejection?: { readonly code: string; readonly text: string };
  readonly driverStatus: VerificationStatus;
}

export type DecisionOutcome =
  | { readonly kind: 'ok'; readonly decision: DecisionResponse }
  | { readonly kind: 'not_found' | 'invalid_transition' | 'idempotency_key_reused' | 'own_registration' | 'invalid_expires_on' | 'unknown_reason' };

async function decisionResponse(db: Pool | PoolClient, documentId: string): Promise<DecisionResponse> {
  const doc = (await repo.findDocument(db, documentId))!;
  const status = doc.status === 'rejected' ? 'rejected' : 'approved';
  const rejectionText = doc.rejectionCode ? await repo.rejectionReasonText(db, doc.rejectionCode) : null;
  return {
    documentId,
    status,
    reviewedAt: iso(doc.reviewedAt!),
    ...(status === 'approved' && doc.expiresOn !== null ? { expiresOn: doc.expiresOn } : {}),
    ...(status === 'rejected' && doc.rejectionCode && rejectionText ? { rejection: { code: doc.rejectionCode, text: rejectionText } } : {}),
    driverStatus: (await getVerification(db, doc.driverId)).status,
  };
}

/**
 * Documento que já não está `submitted`: se a ÚLTIMA decisão gravada foi este mesmo pedido (chave e corpo), devolve a
 * mesma resposta; mesma chave com outro corpo é `idempotency_key_reused`; o resto é `invalid_transition`.
 */
async function replayOrConflict(db: PoolClient, doc: repo.DocumentForDecision, action: string, key: string, fingerprint: string): Promise<DecisionOutcome> {
  const last = await repo.lastDecisionAudit(db, doc.documentId);
  if (last && last.idempotencyKey === key) {
    if (last.action !== action || last.fingerprint !== fingerprint) return { kind: 'idempotency_key_reused' };
    return { kind: 'ok', decision: await decisionResponse(db, doc.documentId) };
  }
  return { kind: 'invalid_transition' };
}

/** Ordem: 404 → repetição do mesmo pedido → 409 `invalid_transition` → 403 próprio cadastro → 422 validade. */
export async function approve(pool: Pool, documentId: string, expiresOn: string | null, actor: AdminActor, idempotencyKey: string): Promise<DecisionOutcome> {
  const fingerprint = requestFingerprint({ action: 'approve', documentId, expiresOn });
  return attempt<DecisionOutcome>(pool, async (client) => {
    const doc = await repo.lockDocument(client, documentId);
    if (!doc || !VISIBLE.has(doc.status)) throw new Abort<DecisionOutcome>({ kind: 'not_found' });
    if (doc.status !== 'submitted') throw new Abort(await replayOrConflict(client, doc, 'document.approved', idempotencyKey, fingerprint));
    if (await repo.isSameEmail(client, actor.adminId, doc.driverEmail)) throw new Abort<DecisionOutcome>({ kind: 'own_registration' });
    const rule = await repo.expiryRule(client, doc.cityCode, doc.typeCode);
    // Tipo que saiu da lista vigente depois do envio: o banco recusaria a aprovação (0025); não é decisão possível.
    if (!rule) throw new Abort<DecisionOutcome>({ kind: 'invalid_transition' });
    if (expiresOnProblem(expiresOn, rule)) throw new Abort<DecisionOutcome>({ kind: 'invalid_expires_on' });

    await repo.supersedeApproved(client, doc);
    await repo.approveDocument(client, documentId, actor.adminId, expiresOn);
    if (doc.typeCode === 'cnh' && expiresOn !== null) await repo.syncCnhExpiry(client, doc.driverId, expiresOn);
    const driverApproved = await repo.approveDriverIfReady(client, doc.driverId);
    await insertAuditLog(client, {
      adminId: actor.adminId, action: 'document.approved', targetType: 'driver_document', targetId: documentId,
      before: { status: 'submitted' },
      after: { status: 'approved', driverId: doc.driverId, typeCode: doc.typeCode, expiresOn, idempotencyKey, fingerprint },
      ipAddress: actor.ipAddress,
    });
    if (driverApproved) {
      await insertAuditLog(client, {
        adminId: actor.adminId, action: 'driver.approved', targetType: 'driver', targetId: doc.driverId,
        before: { status: 'pending' }, after: { status: 'approved', via: 'n4', documentId }, ipAddress: actor.ipAddress,
      });
    }
    return { kind: 'ok', decision: await decisionResponse(client, documentId) };
  });
}

/** Ordem: 404 → repetição → 409 → 403 próprio cadastro → 422 motivo fora do catálogo ativo. */
export async function reject(pool: Pool, documentId: string, input: RejectInput, actor: AdminActor, idempotencyKey: string): Promise<DecisionOutcome> {
  const fingerprint = requestFingerprint({ action: 'reject', documentId, reasonCode: input.reasonCode, internalNote: input.internalNote });
  return attempt<DecisionOutcome>(pool, async (client) => {
    const doc = await repo.lockDocument(client, documentId);
    if (!doc || !VISIBLE.has(doc.status)) throw new Abort<DecisionOutcome>({ kind: 'not_found' });
    if (doc.status !== 'submitted') throw new Abort(await replayOrConflict(client, doc, 'document.rejected', idempotencyKey, fingerprint));
    if (await repo.isSameEmail(client, actor.adminId, doc.driverEmail)) throw new Abort<DecisionOutcome>({ kind: 'own_registration' });
    if (!(await repo.isActiveRejectionReason(client, input.reasonCode))) throw new Abort<DecisionOutcome>({ kind: 'unknown_reason' });

    await repo.rejectDocument(client, documentId, actor.adminId, input.reasonCode, input.internalNote);
    // A nota interna NÃO vai para a trilha (append-only, sobrevive à exclusão da conta): só o código do motivo.
    await insertAuditLog(client, {
      adminId: actor.adminId, action: 'document.rejected', targetType: 'driver_document', targetId: documentId,
      before: { status: 'submitted' },
      after: { status: 'rejected', driverId: doc.driverId, typeCode: doc.typeCode, reasonCode: input.reasonCode, hasInternalNote: input.internalNote !== null, idempotencyKey, fingerprint },
      ipAddress: actor.ipAddress,
    });
    return { kind: 'ok', decision: await decisionResponse(client, documentId) };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Suspensão e reativação
// ---------------------------------------------------------------------------------------------------------------------

export type SuspendOutcome =
  | { readonly kind: 'ok'; readonly suspension: { readonly driverId: string; readonly status: 'suspended'; readonly suspendedAt: string } }
  | { readonly kind: 'not_found' | 'own_registration' };

/** Já suspenso: devolve a suspensão ORIGINAL, sem gravar de novo. O motivo (texto livre) fica só na linha, não na trilha. */
export async function suspend(pool: Pool, driverId: string, reason: string, actor: AdminActor, idempotencyKey: string): Promise<SuspendOutcome> {
  return attempt<SuspendOutcome>(pool, async (client) => {
    const driver = await repo.lockDriverState(client, driverId);
    if (!driver || driver.status === 'deleted') throw new Abort<SuspendOutcome>({ kind: 'not_found' });
    if (driver.status === 'suspended' && driver.suspendedAt) {
      return { kind: 'ok', suspension: { driverId, status: 'suspended', suspendedAt: iso(driver.suspendedAt) } };
    }
    if (await repo.isSameEmail(client, actor.adminId, driver.email)) throw new Abort<SuspendOutcome>({ kind: 'own_registration' });
    const suspendedAt = await repo.suspendDriver(client, driverId, actor.adminId, reason);
    await insertAuditLog(client, {
      adminId: actor.adminId, action: 'driver.suspended', targetType: 'driver', targetId: driverId,
      before: { status: driver.status }, after: { status: 'suspended', reasonLength: reason.length, idempotencyKey }, ipAddress: actor.ipAddress,
    });
    return { kind: 'ok', suspension: { driverId, status: 'suspended', suspendedAt: iso(suspendedAt) } };
  });
}

export type ReinstateOutcome =
  | { readonly kind: 'ok'; readonly reinstatement: { readonly driverId: string; readonly status: 'approved'; readonly reinstatedAt: string } }
  | { readonly kind: 'not_found' | 'own_registration' | 'driver_not_suspended' | 'approval_blocked' };

/**
 * Sair da suspensão é decisão de revisor/dono, com autor (0025): `suspended → approved`, só se nada bloqueia a
 * aprovação. Já reativado (aprovado com reativação gravada) devolve a reativação original.
 */
export async function reinstate(pool: Pool, driverId: string, actor: AdminActor, idempotencyKey: string): Promise<ReinstateOutcome> {
  return attempt<ReinstateOutcome>(pool, async (client) => {
    const driver = await repo.lockDriverState(client, driverId);
    if (!driver || driver.status === 'deleted') throw new Abort<ReinstateOutcome>({ kind: 'not_found' });
    if (driver.status === 'approved' && driver.reinstatedAt) {
      return { kind: 'ok', reinstatement: { driverId, status: 'approved', reinstatedAt: iso(driver.reinstatedAt) } };
    }
    if (driver.status !== 'suspended') throw new Abort<ReinstateOutcome>({ kind: 'driver_not_suspended' });
    if (await repo.isSameEmail(client, actor.adminId, driver.email)) throw new Abort<ReinstateOutcome>({ kind: 'own_registration' });
    const blockers = await repo.approvalBlockers(client, driverId);
    if (blockers.length > 0) throw new Abort<ReinstateOutcome>({ kind: 'approval_blocked' });
    const reinstatedAt = await repo.reinstateDriver(client, driverId, actor.adminId);
    await insertAuditLog(client, {
      adminId: actor.adminId, action: 'driver.reinstated', targetType: 'driver', targetId: driverId,
      before: { status: 'suspended' }, after: { status: 'approved', idempotencyKey }, ipAddress: actor.ipAddress,
    });
    return { kind: 'ok', reinstatement: { driverId, status: 'approved', reinstatedAt: iso(reinstatedAt) } };
  });
}

export async function rejectionReasons(pool: Pool): Promise<{ code: string; text: string }[]> {
  return repo.listActiveRejectionReasons(pool);
}
