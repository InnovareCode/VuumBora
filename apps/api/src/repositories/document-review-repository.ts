/**
 * Camada de dados da revisão de documentos pelo painel (fatia D5): fila, detalhe do motorista, decisão (aprovar/recusar),
 * suspensão e reativação, sobre as tabelas e os gatilhos das migrações 0024/0025. As REGRAS de transição moram nos
 * gatilhos; aqui só SQL parametrizado.
 *
 * Dado sensível: só `findDriverDetail` lê CPF, CNH, endereço e nascimento (o detalhe é auditado na rota). A fila não
 * lê nenhum deles.
 */
import type { PoolClient } from 'pg';
import type { Queryable } from './identity-repository.js';

/** Formato do cursor: timestamp com MICROSSEGUNDO, em texto (o `Date` do JS truncaria e a página perderia linhas). */
const CURSOR_TIMESTAMP = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

export interface QueueRow {
  readonly documentId: string;
  readonly driverId: string;
  readonly driverName: string;
  readonly typeCode: string;
  readonly typeLabel: string;
  readonly status: 'submitted' | 'approved' | 'rejected' | 'expired';
  readonly submittedAt: Date;
  readonly submittedAtCursor: string;
  readonly reviewDeadline: Date;
  readonly overdue: boolean;
}

/** Mais antigo primeiro, `(submitted_at, id)` (índice `driver_documents_review_queue_idx`). Busca `limit + 1` para saber se há mais. */
export async function listQueue(db: Queryable, input: { status: string; after: { submittedAt: string; id: string } | null; limit: number }): Promise<QueueRow[]> {
  const params: unknown[] = [input.status];
  let cursorCondition = '';
  if (input.after) {
    params.push(input.after.submittedAt, input.after.id);
    cursorCondition = 'AND (doc.submitted_at, doc.id) > ($2::timestamptz, $3::uuid)';
  }
  params.push(input.limit + 1);
  const result = await db.query<{
    id: string; driver_id: string; full_name: string; type_code: string; label: string; status: QueueRow['status'];
    submitted_at: Date; submitted_cursor: string; deadline: Date; overdue: boolean;
  }>(
    `SELECT doc.id, doc.driver_id, acc.full_name, doc.type_code, t.label, doc.status, doc.submitted_at,
            to_char(doc.submitted_at AT TIME ZONE 'UTC', ${CURSOR_TIMESTAMP}) AS submitted_cursor,
            doc.submitted_at + make_interval(hours => s.review_sla_hours) AS deadline,
            (doc.status = 'submitted' AND now() > doc.submitted_at + make_interval(hours => s.review_sla_hours)) AS overdue
       FROM driver_documents doc
       JOIN drivers d ON d.account_id = doc.driver_id
       JOIN accounts acc ON acc.id = doc.driver_id
       JOIN document_types t ON t.code = doc.type_code
       JOIN driver_settings s ON s.city_code = d.city_code
      WHERE doc.status = $1 ${cursorCondition}
      ORDER BY doc.submitted_at, doc.id
      LIMIT $${params.length}`,
    params,
  );
  return result.rows.map((row) => ({
    documentId: row.id,
    driverId: row.driver_id,
    driverName: row.full_name,
    typeCode: row.type_code,
    typeLabel: row.label,
    status: row.status,
    submittedAt: row.submitted_at,
    submittedAtCursor: row.submitted_cursor,
    reviewDeadline: row.deadline,
    overdue: row.overdue,
  }));
}

export interface DriverDetailRow {
  readonly driverId: string;
  readonly fullName: string;
  readonly email: string;
  readonly applicationId: string;
  readonly status: 'pending' | 'approved' | 'suspended' | 'deleted';
  readonly profile: {
    readonly cpf: string;
    readonly birthDate: string | null;
    readonly cnhNumber: string;
    readonly cnhCategory: string;
    readonly cnhExpiresOn: string;
    readonly postalCode: string;
    readonly street: string;
    readonly number: string;
    readonly complement: string | null;
    readonly neighborhood: string;
    readonly city: string;
    readonly state: string;
  } | null;
  readonly suspension: { readonly reason: string; readonly suspendedAt: Date } | null;
}

/** O motorista com a etapa 2 (CPF, CNH, endereço, nascimento). Só para o detalhe do painel, que é auditado. */
export async function findDriverDetail(db: Queryable, driverId: string): Promise<DriverDetailRow | null> {
  const result = await db.query<{
    account_id: string; full_name: string; email: string; application_id: string; status: DriverDetailRow['status'];
    cpf: string | null; birth_date: string | null; cnh_number: string | null; cnh_category: string | null; cnh_expires_on: string | null;
    address_postal_code: string | null; address_street: string | null; address_number: string | null; address_complement: string | null;
    address_neighborhood: string | null; address_city: string | null; address_state: string | null;
    suspension_reason: string | null; suspended_at: Date | null;
  }>(
    `SELECT d.account_id, acc.full_name, acc.email, d.application_id, d.status,
            d.cpf, to_char(acc.birth_date, 'YYYY-MM-DD') AS birth_date, d.cnh_number, d.cnh_category,
            to_char(d.cnh_expires_on, 'YYYY-MM-DD') AS cnh_expires_on,
            d.address_postal_code, d.address_street, d.address_number, d.address_complement, d.address_neighborhood,
            d.address_city, d.address_state, d.suspension_reason, d.suspended_at
       FROM drivers d JOIN accounts acc ON acc.id = d.account_id
      WHERE d.account_id = $1 AND d.status <> 'deleted'`,
    [driverId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const hasProfile = row.cpf !== null && row.cnh_number !== null && row.address_postal_code !== null;
  return {
    driverId: row.account_id,
    fullName: row.full_name,
    email: row.email,
    applicationId: row.application_id,
    status: row.status,
    profile: hasProfile
      ? {
          cpf: row.cpf!,
          birthDate: row.birth_date,
          cnhNumber: row.cnh_number!,
          cnhCategory: row.cnh_category!,
          cnhExpiresOn: row.cnh_expires_on!,
          postalCode: row.address_postal_code!,
          street: row.address_street!,
          number: row.address_number!,
          complement: row.address_complement,
          neighborhood: row.address_neighborhood!,
          city: row.address_city!,
          state: row.address_state!,
        }
      : null,
    suspension: row.status === 'suspended' && row.suspension_reason !== null && row.suspended_at !== null
      ? { reason: row.suspension_reason, suspendedAt: row.suspended_at }
      : null,
  };
}

export interface VehicleRow { readonly id: string; readonly plate: string; readonly brand: string; readonly model: string; readonly year: number; readonly color: string }

export async function findActiveVehicle(db: Queryable, driverId: string): Promise<VehicleRow | null> {
  const result = await db.query<{ id: string; plate: string; brand: string; model: string; manufacture_year: number; color: string }>(
    `SELECT id, plate, brand, model, manufacture_year, color FROM vehicles WHERE driver_id = $1 AND status = 'active'`,
    [driverId],
  );
  const row = result.rows[0];
  return row ? { id: row.id, plate: row.plate, brand: row.brand, model: row.model, year: row.manufacture_year, color: row.color } : null;
}

export interface AdminDocumentRow {
  readonly documentId: string;
  readonly typeCode: string;
  readonly typeLabel: string;
  readonly status: 'submitted' | 'approved' | 'rejected' | 'expired';
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly submittedAt: Date;
  readonly reviewedAt: Date | null;
  readonly expiresOn: string | null;
  readonly rejectionCode: string | null;
  readonly rejectionText: string | null;
  readonly internalNote: string | null;
}

/** Documentos visíveis do motorista (enviados em diante; nunca o envio não confirmado, o substituído ou o retirado). Mais recente primeiro. */
export async function listDriverDocuments(db: Queryable, driverId: string): Promise<AdminDocumentRow[]> {
  const result = await db.query<{
    id: string; type_code: string; label: string; status: AdminDocumentRow['status']; content_type: string; size_bytes: number;
    submitted_at: Date; reviewed_at: Date | null; expires_on: string | null; rejection_code: string | null; driver_text: string | null; review_note: string | null;
  }>(
    `SELECT doc.id, doc.type_code, t.label, doc.status, doc.content_type, doc.size_bytes, doc.submitted_at, doc.reviewed_at,
            to_char(doc.expires_on, 'YYYY-MM-DD') AS expires_on, doc.rejection_code, rr.driver_text, doc.review_note
       FROM driver_documents doc
       JOIN document_types t ON t.code = doc.type_code
       LEFT JOIN document_rejection_reasons rr ON rr.code = doc.rejection_code
      WHERE doc.driver_id = $1 AND doc.status IN ('submitted', 'approved', 'rejected', 'expired')
      ORDER BY doc.submitted_at DESC, doc.id DESC`,
    [driverId],
  );
  return result.rows.map((row) => ({
    documentId: row.id,
    typeCode: row.type_code,
    typeLabel: row.label,
    status: row.status,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    expiresOn: row.expires_on,
    rejectionCode: row.rejection_code,
    rejectionText: row.driver_text,
    internalNote: row.review_note,
  }));
}

export interface DocumentForDecision {
  readonly documentId: string;
  readonly driverId: string;
  readonly typeCode: string;
  readonly vehicleId: string | null;
  readonly status: string;
  readonly storageKey: string;
  readonly driverEmail: string;
  readonly cityCode: string;
  readonly reviewedAt: Date | null;
  readonly expiresOn: string | null;
  readonly rejectionCode: string | null;
  /** Nota interna gravada na recusa: é com ELA que se confere se a recusa repetida é a mesma (nunca com a trilha). */
  readonly reviewNote: string | null;
}

const DOCUMENT_FOR_DECISION_SQL = `
  SELECT doc.id, doc.driver_id, doc.type_code, doc.vehicle_id, doc.status, doc.storage_key, acc.email, d.city_code,
         doc.reviewed_at, to_char(doc.expires_on, 'YYYY-MM-DD') AS expires_on, doc.rejection_code, doc.review_note
    FROM driver_documents doc
    JOIN drivers d ON d.account_id = doc.driver_id
    JOIN accounts acc ON acc.id = doc.driver_id
   WHERE doc.id = $1`;

interface DocumentForDecisionRow {
  id: string; driver_id: string; type_code: string; vehicle_id: string | null; status: string; storage_key: string; email: string;
  city_code: string; reviewed_at: Date | null; expires_on: string | null; rejection_code: string | null; review_note: string | null;
}

function toDocumentForDecision(row: DocumentForDecisionRow | undefined): DocumentForDecision | null {
  return row
    ? {
        documentId: row.id, driverId: row.driver_id, typeCode: row.type_code, vehicleId: row.vehicle_id, status: row.status,
        storageKey: row.storage_key, driverEmail: row.email, cityCode: row.city_code, reviewedAt: row.reviewed_at,
        expiresOn: row.expires_on, rejectionCode: row.rejection_code, reviewNote: row.review_note,
      }
    : null;
}

export async function findDocument(db: Queryable, documentId: string): Promise<DocumentForDecision | null> {
  const result = await db.query<DocumentForDecisionRow>(DOCUMENT_FOR_DECISION_SQL, [documentId]);
  return toDocumentForDecision(result.rows[0]);
}

/** Trava o documento até o fim da transação: duas decisões sobre o mesmo documento entram uma de cada vez. */
export async function lockDocument(client: PoolClient, documentId: string): Promise<DocumentForDecision | null> {
  await client.query(`SELECT 1 FROM driver_documents WHERE id = $1 FOR UPDATE`, [documentId]);
  return findDocument(client, documentId);
}

/** A regra da validade do tipo, na lista VIGENTE da cidade, e o "hoje" e o teto no dia local. `null` = tipo fora da lista. */
export async function expiryRule(db: Queryable, cityCode: string, typeCode: string): Promise<{ hasExpiry: boolean; today: string; latest: string } | null> {
  const result = await db.query<{ has_expiry: boolean; today: string; latest: string }>(
    `SELECT r.has_expiry, to_char(city_today($1), 'YYYY-MM-DD') AS today,
            to_char(city_today($1) + t.max_validity_days, 'YYYY-MM-DD') AS latest
       FROM current_document_requirements r JOIN document_types t ON t.code = r.type_code
      WHERE r.city_code = $1 AND r.type_code = $2`,
    [cityCode, typeCode],
  );
  const row = result.rows[0];
  return row ? { hasExpiry: row.has_expiry, today: row.today, latest: row.latest } : null;
}

/** O administrador é o próprio motorista (mesmo e-mail normalizado)? Conflito de interesse (0025). */
export async function isSameEmail(db: Queryable, adminId: string, driverEmail: string): Promise<boolean> {
  const result = await db.query(`SELECT 1 FROM admin_users WHERE id = $1 AND lower(btrim(email)) = $2`, [adminId, driverEmail]);
  return (result.rowCount ?? 0) > 0;
}

/** Substituir: o aprovado anterior do mesmo motorista + tipo + veículo sai de uso ANTES de aprovar o novo (índice único parcial). */
export async function supersedeApproved(db: Queryable, doc: DocumentForDecision): Promise<void> {
  await db.query(
    `UPDATE driver_documents SET status = 'superseded'
      WHERE driver_id = $1 AND type_code = $2 AND vehicle_id IS NOT DISTINCT FROM $3::uuid AND status = 'approved' AND id <> $4`,
    [doc.driverId, doc.typeCode, doc.vehicleId, doc.documentId],
  );
}

export async function approveDocument(db: Queryable, documentId: string, reviewerId: string, expiresOn: string | null): Promise<void> {
  await db.query(
    `UPDATE driver_documents SET status = 'approved', reviewed_by = $2, expires_on = $3::date WHERE id = $1 AND status = 'submitted'`,
    [documentId, reviewerId, expiresOn],
  );
}

export async function rejectDocument(db: Queryable, documentId: string, reviewerId: string, reasonCode: string, note: string | null): Promise<void> {
  await db.query(
    `UPDATE driver_documents SET status = 'rejected', reviewed_by = $2, rejection_code = $3, review_note = $4 WHERE id = $1 AND status = 'submitted'`,
    [documentId, reviewerId, reasonCode, note],
  );
}

/** A validade da CNH no cadastro acompanha a CNH aprovada (renovação). Só com a etapa 2 feita (CHECK `drivers_cnh_complete`). */
export async function syncCnhExpiry(db: Queryable, driverId: string, expiresOn: string): Promise<void> {
  await db.query(`UPDATE drivers SET cnh_expires_on = $2::date WHERE account_id = $1 AND cnh_number IS NOT NULL`, [driverId, expiresOn]);
}

/**
 * N4: o motorista PENDENTE vira `approved` quando nada mais bloqueia, na mesma transação da aprovação do documento.
 * `AND status = 'pending'`: motorista suspenso NÃO volta por aqui (sair da suspensão é reativação, com autor).
 */
export async function approveDriverIfReady(db: Queryable, driverId: string): Promise<boolean> {
  const result = await db.query(
    `UPDATE drivers SET status = 'approved'
      WHERE account_id = $1 AND status = 'pending' AND NOT EXISTS (SELECT 1 FROM driver_approval_blockers($1))`,
    [driverId],
  );
  return (result.rowCount ?? 0) === 1;
}

export async function isActiveRejectionReason(db: Queryable, code: string): Promise<boolean> {
  const result = await db.query(`SELECT 1 FROM document_rejection_reasons WHERE code = $1 AND active`, [code]);
  return (result.rowCount ?? 0) > 0;
}

export async function rejectionReasonText(db: Queryable, code: string): Promise<string | null> {
  const result = await db.query<{ driver_text: string }>(`SELECT driver_text FROM document_rejection_reasons WHERE code = $1`, [code]);
  return result.rows[0]?.driver_text ?? null;
}

export async function listActiveRejectionReasons(db: Queryable): Promise<{ code: string; text: string }[]> {
  const result = await db.query<{ code: string; driver_text: string }>(
    `SELECT code, driver_text FROM document_rejection_reasons WHERE active ORDER BY sort_order, code`,
  );
  return result.rows.map((row) => ({ code: row.code, text: row.driver_text }));
}

/**
 * A decisão já gravada na trilha para este documento (para repetir a resposta de um pedido igual): a chave e os campos
 * NÃO sensíveis do pedido (validade, código do motivo). A nota interna não está na trilha.
 */
export interface DecisionAudit {
  readonly action: string;
  readonly idempotencyKey: string | null;
  readonly expiresOn: string | null;
  readonly reasonCode: string | null;
}

export async function lastDecisionAudit(db: Queryable, documentId: string): Promise<DecisionAudit | null> {
  const result = await db.query<{ action: string; key: string | null; expires_on: string | null; reason_code: string | null }>(
    `SELECT action, after ->> 'idempotencyKey' AS key, after ->> 'expiresOn' AS expires_on, after ->> 'reasonCode' AS reason_code
       FROM admin_audit_log
      WHERE target_type = 'driver_document' AND target_id = $1 AND action IN ('document.approved', 'document.rejected')
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [documentId],
  );
  const row = result.rows[0];
  return row ? { action: row.action, idempotencyKey: row.key, expiresOn: row.expires_on, reasonCode: row.reason_code } : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Suspensão e reativação
// ---------------------------------------------------------------------------------------------------------------------

export interface DriverStateRow {
  readonly status: 'pending' | 'approved' | 'suspended' | 'deleted';
  readonly email: string;
  readonly suspendedAt: Date | null;
  readonly reinstatedAt: Date | null;
}

export async function lockDriverState(client: PoolClient, driverId: string): Promise<DriverStateRow | null> {
  const result = await client.query<{ status: DriverStateRow['status']; email: string; suspended_at: Date | null; reinstated_at: Date | null }>(
    `SELECT d.status, acc.email, d.suspended_at, d.reinstated_at
       FROM drivers d JOIN accounts acc ON acc.id = d.account_id
      WHERE d.account_id = $1
        FOR UPDATE OF d`,
    [driverId],
  );
  const row = result.rows[0];
  return row ? { status: row.status, email: row.email, suspendedAt: row.suspended_at, reinstatedAt: row.reinstated_at } : null;
}

export async function suspendDriver(db: Queryable, driverId: string, adminId: string, reason: string): Promise<Date> {
  const result = await db.query<{ suspended_at: Date }>(
    `UPDATE drivers SET status = 'suspended', suspended_by = $2, suspension_reason = $3 WHERE account_id = $1 RETURNING suspended_at`,
    [driverId, adminId, reason],
  );
  return result.rows[0]!.suspended_at;
}

export async function approvalBlockers(db: Queryable, driverId: string): Promise<string[]> {
  const result = await db.query<{ blocker: string }>(`SELECT blocker FROM driver_approval_blockers($1)`, [driverId]);
  return result.rows.map((row) => row.blocker);
}

export async function reinstateDriver(db: Queryable, driverId: string, adminId: string): Promise<Date> {
  const result = await db.query<{ reinstated_at: Date }>(
    `UPDATE drivers SET status = 'approved', reinstated_by = $2 WHERE account_id = $1 AND status = 'suspended' RETURNING reinstated_at`,
    [driverId, adminId],
  );
  return result.rows[0]!.reinstated_at;
}
