/**
 * Adaptador `mock` da fila de documentos do painel (M3, fatia K0 do `docs/plano-m3-m4.md`; telas da
 * D7). Uma instância = UM admin com UM papel. Responde cada erro do §3 pela regra do servidor:
 *
 * - papel fora de `DOCUMENT_REVIEW_ROLES` → `403 forbidden` em TODAS as rotas, antes de tudo;
 * - `viewUrl` grava a trilha (`control.auditLog()`) ANTES de devolver a URL (N5);
 * - aprovar o último obrigatório aprova a conta sozinho (N4), e a resposta mostra isso (`driverStatus`);
 * - idempotência por `idempotencyKey`: mesma chave e mesmo corpo = mesma resposta; mesma chave com
 *   corpo diferente = `409 idempotency_key_reused`; documento já decidido = `409 invalid_transition`.
 *
 * Sem `store`, nasce com a semente `'demo'` (três motoristas fictícios: um com prazo vencido, um com
 * correção pedida, um aprovado). Para ver o que um `createMockDriverOnboarding` enviou, passe a MESMA
 * `store` aos dois.
 */
import { isCalendarDate } from '@vuumbora/domain/driver';
import type { CursorPage, Result } from '../index';
import { catalogError, NETWORK_FAILURE } from '../server-error';
import { failWith, succeed } from '../trip/result';
import { fingerprint } from '../trip/idempotency';
import { createDocumentStore, type DocumentStore, type MockAuditEntry, type MockDocumentRecord } from '../documents/mock-store';
import type { DocumentRejection } from '../documents/types';
import {
  DOCUMENT_REVIEW_ERRORS,
  canReviewDocuments,
  type AdminDriverDetail,
  type AdminDriverDocument,
  type AdminRole,
  type ApproveDocumentInput,
  type DocumentDecision,
  type DocumentReviewErrorCode,
  type DocumentReviewPort,
  type DocumentReviewQueueInput,
  type DocumentReviewQueueItem,
  type DocumentViewUrl,
  type DriverReinstatement,
  type DriverReinstatementPort,
  type DriverSuspension,
  type RejectDocumentInput,
  type SuspendDriverInput,
} from './types';

export interface MockDocumentReviewOptions {
  /** Papel deste admin. Obrigatório: não há papel padrão. */
  readonly role: AdminRole;
  /** Padrão: `createDocumentStore({ seed: 'demo' })`. */
  readonly store?: DocumentStore;
}

export interface MockDocumentReviewControl {
  /** A PRÓXIMA chamada falha com este código (uma vez). Ex.: `csrf_token_invalid`, `unauthorized`, `'network'`. */
  failNext(code: DocumentReviewErrorCode | 'network'): void;
  setRole(role: AdminRole): void;
  /** A trilha de auditoria (visualizações e decisões), na ordem em que aconteceram. */
  auditLog(): readonly MockAuditEntry[];
}

export interface MockDocumentReview {
  readonly port: DocumentReviewPort & DriverReinstatementPort;
  readonly control: MockDocumentReviewControl;
  readonly store: DocumentStore;
}

const QUEUE_STATUSES = ['submitted', 'approved', 'rejected', 'expired'] as const;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const VIEW_URL_TTL_MS = 300_000;

/** Não é guarda de tipo de propósito: a entrada já é tipada; isto só confere que chegou um objeto. */
function isObjectBody(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function isIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

export function createMockDocumentReview(options: MockDocumentReviewOptions): MockDocumentReview {
  const store = options.store ?? createDocumentStore({ seed: 'demo' });
  const { clock } = store;
  let role = options.role;
  let forcedFailure: DocumentReviewErrorCode | 'network' | undefined;
  const decisions = new Map<string, { readonly key: string; readonly fingerprint: string; readonly response: DocumentDecision }>();
  const reinstatements = new Map<string, number>();

  const fail = (code: DocumentReviewErrorCode) => failWith(catalogError(DOCUMENT_REVIEW_ERRORS, code));

  /** Erro forçado, rotina de vencimento e o 403 de papel — nessa ordem, em TODA rota. */
  function guard(): { readonly ok: false; readonly error: ReturnType<typeof catalogError> } | undefined {
    store.sweepExpired();
    const forced = forcedFailure;
    forcedFailure = undefined;
    if (forced === 'network') return failWith(NETWORK_FAILURE);
    if (forced !== undefined) return fail(forced);
    if (!canReviewDocuments(role)) return fail('forbidden');
    return undefined;
  }

  function visibleDocument(documentId: unknown): MockDocumentRecord | undefined {
    if (typeof documentId !== 'string') return undefined;
    const record = store.documents.get(documentId);
    return record && record.state !== 'pending_upload' ? record : undefined;
  }

  function typeLabel(typeCode: string): string {
    return store.requirement(typeCode)?.label ?? typeCode;
  }

  function audit(action: MockAuditEntry['action'], targetId: string): void {
    store.audit.push({ action, targetId, actorRole: role, atMs: clock() });
  }

  async function queue(input: DocumentReviewQueueInput = {}): Promise<Result<CursorPage<DocumentReviewQueueItem>>> {
    const blocked = guard();
    if (blocked) return blocked;
    if (!isObjectBody(input)) return fail('invalid_body');
    const status = input.status ?? 'submitted';
    if (!(QUEUE_STATUSES as readonly string[]).includes(status)) return fail('invalid_body');
    const limit = input.limit ?? DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return fail('invalid_body');

    const now = clock();
    const matching = [...store.documents.values()]
      .filter((record) => record.state === status)
      .sort((a, b) => (a.submittedAtMs ?? 0) - (b.submittedAtMs ?? 0) || a.id.localeCompare(b.id));

    let start = 0;
    if (input.cursor !== undefined) {
      const at = matching.findIndex((record) => record.id === input.cursor);
      if (at === -1) return fail('invalid_cursor');
      start = at + 1;
    }
    const page = matching.slice(start, start + limit);
    const items = page.map((record): DocumentReviewQueueItem => {
      const submittedAtMs = record.submittedAtMs ?? record.createdAtMs;
      const deadlineMs = store.reviewDeadlineMs(submittedAtMs);
      return {
        documentId: record.id,
        driverId: record.driverId,
        driverName: store.drivers.get(record.driverId)?.fullName ?? '',
        typeCode: record.typeCode,
        typeLabel: typeLabel(record.typeCode),
        status,
        submittedAt: iso(submittedAtMs),
        reviewDeadline: iso(deadlineMs),
        overdue: status === 'submitted' && now > deadlineMs,
      };
    });
    const last = page[page.length - 1];
    const hasMore = start + limit < matching.length;
    return succeed({ items, ...(hasMore && last ? { nextCursor: last.id } : {}) });
  }

  async function driver(driverId: string): Promise<Result<AdminDriverDetail>> {
    const blocked = guard();
    if (blocked) return blocked;
    const record = typeof driverId === 'string' ? store.drivers.get(driverId) : undefined;
    if (!record) return fail('not_found');
    const documents = [...store.documents.values()]
      .filter((document) => document.driverId === record.driverId && document.state !== 'pending_upload')
      .sort((a, b) => (b.submittedAtMs ?? 0) - (a.submittedAtMs ?? 0))
      .map((document): AdminDriverDocument => ({
        documentId: document.id,
        typeCode: document.typeCode,
        typeLabel: typeLabel(document.typeCode),
        status: document.state as AdminDriverDocument['status'],
        contentType: document.contentType,
        sizeBytes: document.sizeBytes,
        submittedAt: iso(document.submittedAtMs ?? document.createdAtMs),
        ...(document.reviewedAtMs !== undefined ? { reviewedAt: iso(document.reviewedAtMs) } : {}),
        ...(document.expiresOn !== undefined ? { expiresOn: document.expiresOn } : {}),
        ...(document.rejection ? { rejection: document.rejection } : {}),
        ...(document.internalNote !== undefined ? { internalNote: document.internalNote } : {}),
      }));
    return succeed({
      driverId: record.driverId,
      fullName: record.fullName,
      email: record.email,
      applicationId: record.applicationId,
      status: store.status(record.driverId),
      ...(record.profile ? { profile: record.profile } : {}),
      ...(record.vehicle ? { vehicle: record.vehicle } : {}),
      ...(record.suspension ? { suspension: { reason: record.suspension.reason, suspendedAt: iso(record.suspension.atMs) } } : {}),
      documents,
    });
  }

  async function viewUrl(documentId: string): Promise<Result<DocumentViewUrl>> {
    const blocked = guard();
    if (blocked) return blocked;
    const record = visibleDocument(documentId);
    if (!record) return fail('not_found');
    audit('document.view_url', record.id); // N5: a trilha antes da URL
    const expiresAtMs = clock() + VIEW_URL_TTL_MS;
    return succeed({
      url: `https://mock-storage.invalid/driver-docs/${encodeURIComponent(record.driverId)}/${encodeURIComponent(record.id)}?expires=${expiresAtMs}`,
      expiresAt: iso(expiresAtMs),
    });
  }

  /**
   * Ordem comum de aprovar e recusar: 403 → 400 (chave, corpo) → 404 → repetição da mesma chave → 409
   * `invalid_transition` → 422 (validade ou motivo). Já decidido responde 409 antes de discutir o corpo.
   */
  function decide(
    documentId: string,
    body: Record<string, unknown>,
    idempotencyKey: string,
    apply: (record: MockDocumentRecord) => { readonly ok: false; readonly error: ReturnType<typeof catalogError> } | DocumentDecision,
  ): Result<DocumentDecision> {
    const record = visibleDocument(documentId);
    if (!record) return fail('not_found');
    const print = fingerprint({ documentId, ...body });
    const previous = decisions.get(record.id);
    if (previous && previous.key === idempotencyKey) {
      return previous.fingerprint === print ? succeed(previous.response) : fail('idempotency_key_reused');
    }
    if (record.state !== 'submitted') return fail('invalid_transition');
    const outcome = apply(record);
    if ('ok' in outcome) return outcome;
    decisions.set(record.id, { key: idempotencyKey, fingerprint: print, response: outcome });
    return succeed(outcome);
  }

  async function approve(documentId: string, input: ApproveDocumentInput, idempotencyKey: string): Promise<Result<DocumentDecision>> {
    const blocked = guard();
    if (blocked) return blocked;
    if (!isIdempotencyKey(idempotencyKey)) return fail('idempotency_key_required');
    if (!isObjectBody(input) || (input.expiresOn !== undefined && typeof input.expiresOn !== 'string')) return fail('invalid_body');
    const body = input.expiresOn !== undefined ? { action: 'approve', expiresOn: input.expiresOn } : { action: 'approve' };
    return decide(documentId, body, idempotencyKey, (record) => {
      const hasExpiry = store.requirement(record.typeCode)?.hasExpiry ?? false;
      const { expiresOn } = input;
      const validExpiry = expiresOn !== undefined && isCalendarDate(expiresOn) && expiresOn >= store.today();
      if (hasExpiry ? !validExpiry : expiresOn !== undefined) return fail('invalid_expires_on');
      const driverStatus = store.approveDocument(record, hasExpiry ? expiresOn : undefined);
      audit('document.approve', record.id);
      return {
        documentId: record.id,
        status: 'approved',
        reviewedAt: iso(record.reviewedAtMs ?? clock()),
        ...(record.expiresOn !== undefined ? { expiresOn: record.expiresOn } : {}),
        driverStatus,
      };
    });
  }

  async function reject(documentId: string, input: RejectDocumentInput, idempotencyKey: string): Promise<Result<DocumentDecision>> {
    const blocked = guard();
    if (blocked) return blocked;
    if (!isIdempotencyKey(idempotencyKey)) return fail('idempotency_key_required');
    if (!isObjectBody(input) || typeof input.reasonCode !== 'string') return fail('invalid_body');
    if (input.internalNote !== undefined && (typeof input.internalNote !== 'string' || input.internalNote.length > 1000)) {
      return fail('invalid_body');
    }
    const body = { action: 'reject', reasonCode: input.reasonCode, ...(input.internalNote !== undefined ? { internalNote: input.internalNote } : {}) };
    return decide(documentId, body, idempotencyKey, (record) => {
      const reason: DocumentRejection | undefined = store.rejectionReasons.find((candidate) => candidate.code === input.reasonCode);
      if (!reason) return fail('unknown_reason');
      const driverStatus = store.rejectDocument(record, reason, input.internalNote);
      audit('document.reject', record.id);
      return { documentId: record.id, status: 'rejected', reviewedAt: iso(record.reviewedAtMs ?? clock()), rejection: reason, driverStatus };
    });
  }

  async function rejectionReasons(): Promise<Result<readonly DocumentRejection[]>> {
    const blocked = guard();
    if (blocked) return blocked;
    return succeed(store.rejectionReasons);
  }

  async function suspend(driverId: string, input: SuspendDriverInput, idempotencyKey: string): Promise<Result<DriverSuspension>> {
    const blocked = guard();
    if (blocked) return blocked;
    if (!isIdempotencyKey(idempotencyKey)) return fail('idempotency_key_required');
    const reason = isObjectBody(input) && typeof input.reason === 'string' ? input.reason.trim() : '';
    if (reason.length < 10 || reason.length > 500) return fail('validation_failed');
    const record = typeof driverId === 'string' ? store.drivers.get(driverId) : undefined;
    if (!record) return fail('not_found');
    // Já suspenso (por qualquer caminho): devolve a suspensão ORIGINAL, sem gravar de novo.
    if (record.accountStatus !== 'suspended' || !record.suspension) {
      record.accountStatus = 'suspended';
      record.suspension = { reason, atMs: clock() };
      audit('driver.suspend', record.driverId);
    }
    return succeed({ driverId: record.driverId, status: 'suspended', suspendedAt: iso(record.suspension.atMs) });
  }

  /** D5: sai da suspensão (`suspended → approved`) se nada bloqueia a aprovação; já reativado devolve o original. */
  async function reinstate(driverId: string, idempotencyKey: string): Promise<Result<DriverReinstatement>> {
    const blocked = guard();
    if (blocked) return blocked;
    if (!isIdempotencyKey(idempotencyKey)) return fail('idempotency_key_required');
    const record = typeof driverId === 'string' ? store.drivers.get(driverId) : undefined;
    if (!record) return fail('not_found');
    const previous = reinstatements.get(record.driverId);
    if (record.accountStatus === 'approved' && previous !== undefined) {
      return succeed({ driverId: record.driverId, status: 'approved', reinstatedAt: iso(previous) });
    }
    if (record.accountStatus !== 'suspended') return fail('driver_not_suspended');
    record.accountStatus = 'pending_review';
    const ready = store.applyAutoApproval(record.driverId) === 'approved';
    if (!ready) {
      record.accountStatus = 'suspended';
      return fail('approval_blocked');
    }
    const atMs = clock();
    reinstatements.set(record.driverId, atMs);
    audit('driver.reinstate', record.driverId);
    return succeed({ driverId: record.driverId, status: 'approved', reinstatedAt: iso(atMs) });
  }

  const control: MockDocumentReviewControl = {
    failNext(code) {
      forcedFailure = code;
    },
    setRole(next) {
      role = next;
    },
    auditLog() {
      return store.audit;
    },
  };

  return {
    port: { queue, driver, viewUrl, approve, reject, rejectionReasons, suspend, reinstate },
    control,
    store,
  };
}
