/**
 * Camada de dados do cadastro do motorista (fatia D4): vínculo, etapa 2, veículo, documentos e disponibilidade, sobre as
 * tabelas e funções das migrações 0024/0025. As REGRAS de estado moram nos gatilhos; aqui só SQL parametrizado.
 *
 * Dado sensível (revisão M3-D1): nenhuma consulta deste arquivo DEVOLVE CPF, CNH ou endereço. As comparações que
 * precisam deles (CPF já informado é o mesmo? a CNH mudou?) são feitas NO BANCO e voltam como booleano.
 */
import type { PoolClient } from 'pg';
import type { Queryable } from './identity-repository.js';

export type DriverRowStatus = 'pending' | 'approved' | 'suspended' | 'deleted';

/** O motorista desta conta, sem dado pessoal. `null` = a conta ainda não tem vínculo (N3). */
export interface DriverSummary {
  readonly cityCode: string;
  readonly status: DriverRowStatus;
  readonly profileSubmitted: boolean;
  readonly activeVehicleId: string | null;
}

export async function accountTypeOf(db: Queryable, accountId: string): Promise<string | null> {
  const result = await db.query<{ account_type: string }>(`SELECT account_type FROM accounts WHERE id = $1 AND status = 'active'`, [accountId]);
  return result.rows[0]?.account_type ?? null;
}

const DRIVER_SUMMARY_SQL = `
  SELECT d.city_code, d.status,
         (d.cpf IS NOT NULL AND d.cnh_number IS NOT NULL AND d.address_postal_code IS NOT NULL) AS profile_submitted,
         (SELECT v.id FROM vehicles v WHERE v.driver_id = d.account_id AND v.status = 'active') AS active_vehicle_id
    FROM drivers d WHERE d.account_id = $1`;

interface DriverSummaryRow { city_code: string; status: DriverRowStatus; profile_submitted: boolean; active_vehicle_id: string | null }

function toSummary(row: DriverSummaryRow | undefined): DriverSummary | null {
  return row ? { cityCode: row.city_code, status: row.status, profileSubmitted: row.profile_submitted, activeVehicleId: row.active_vehicle_id } : null;
}

export async function findDriver(db: Queryable, accountId: string): Promise<DriverSummary | null> {
  const result = await db.query<DriverSummaryRow>(DRIVER_SUMMARY_SQL, [accountId]);
  return toSummary(result.rows[0]);
}

/**
 * Trava a linha do motorista até o fim da transação: as mudanças de UM motorista (etapa 2, veículo, pedido de envio)
 * entram uma de cada vez, e a checagem "já existe?" não corre contra a escrita de outra requisição dele.
 */
export async function lockDriver(client: PoolClient, accountId: string): Promise<DriverSummary | null> {
  await client.query(`SELECT 1 FROM drivers WHERE account_id = $1 FOR UPDATE`, [accountId]);
  return findDriver(client, accountId);
}

// ---------------------------------------------------------------------------------------------------------------------
// Vínculo (N3)
// ---------------------------------------------------------------------------------------------------------------------

export type LinkResult =
  | 'linked' | 'already_linked' | 'email_not_verified' | 'application_not_approved' | 'application_already_linked'
  | 'not_found' | 'not_driver_account' | 'account_inactive';

export async function linkDriverApplication(db: Queryable, accountId: string, cityCode: string): Promise<LinkResult> {
  const result = await db.query<{ result: LinkResult }>(`SELECT result FROM link_driver_application($1, $2)`, [accountId, cityCode]);
  return result.rows[0]!.result;
}

// ---------------------------------------------------------------------------------------------------------------------
// Etapa 2
// ---------------------------------------------------------------------------------------------------------------------

/** O que a etapa 2 precisa saber da linha atual, comparado NO BANCO (o CPF e a CNH não saem dele). */
export interface ProfileComparison {
  readonly hasCpf: boolean;
  readonly sameCpf: boolean;
  readonly sameCnh: boolean;
  /**
   * Já há dados de CNH gravados E a CNH está em análise ou aprovada e dentro da validade: os dados dela não mudam pela
   * etapa 2 (o revisor confere a foto contra ESTES dados). Sem dados gravados ainda, a primeira gravação passa.
   */
  readonly cnhLocked: boolean;
  /** Outro motorista vivo já tem este CPF. */
  readonly cpfTakenByOther: boolean;
}

export async function compareProfile(
  db: Queryable,
  accountId: string,
  input: { cpf: string; cnhNumber: string; cnhCategory: string; cnhExpiresOn: string },
): Promise<ProfileComparison> {
  const result = await db.query<{ has_cpf: boolean; same_cpf: boolean; same_cnh: boolean; cnh_locked: boolean; cpf_taken: boolean }>(
    `SELECT d.cpf IS NOT NULL AS has_cpf,
            d.cpf IS NOT DISTINCT FROM $2 AS same_cpf,
            (d.cnh_number, d.cnh_category, d.cnh_expires_on) IS NOT DISTINCT FROM ($3::text, $4::text, $5::date) AS same_cnh,
            d.cnh_number IS NOT NULL AND EXISTS (SELECT 1 FROM driver_documents doc
                     WHERE doc.driver_id = d.account_id AND doc.type_code = 'cnh'
                       AND (doc.status = 'submitted'
                            OR (doc.status = 'approved' AND (doc.expires_on IS NULL OR doc.expires_on >= city_today(d.city_code))))) AS cnh_locked,
            EXISTS (SELECT 1 FROM drivers o WHERE o.cpf = $2 AND o.account_id <> d.account_id) AS cpf_taken
       FROM drivers d WHERE d.account_id = $1`,
    [accountId, input.cpf, input.cnhNumber, input.cnhCategory, input.cnhExpiresOn],
  );
  const row = result.rows[0]!;
  return { hasCpf: row.has_cpf, sameCpf: row.same_cpf, sameCnh: row.same_cnh, cnhLocked: row.cnh_locked, cpfTakenByOther: row.cpf_taken };
}

export interface ProfileWrite {
  readonly cpf: string;
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
}

export async function saveProfile(db: Queryable, accountId: string, profile: ProfileWrite): Promise<void> {
  await db.query(
    `UPDATE drivers
        SET cpf = $2, cnh_number = $3, cnh_category = $4, cnh_expires_on = $5::date,
            address_postal_code = $6, address_street = $7, address_number = $8, address_complement = $9,
            address_neighborhood = $10, address_city = $11, address_state = $12
      WHERE account_id = $1`,
    [accountId, profile.cpf, profile.cnhNumber, profile.cnhCategory, profile.cnhExpiresOn, profile.postalCode, profile.street,
      profile.number, profile.complement, profile.neighborhood, profile.city, profile.state],
  );
}

/**
 * Conta antiga (de antes da 0019) sem data de nascimento: grava a da etapa 2. Conta que já tem, não muda (e a data nunca
 * é lida de volta, `domain/birth-date.ts`). O gatilho da 0019 recusa menor de 18.
 */
export async function fillMissingBirthDate(db: Queryable, accountId: string, birthDate: string): Promise<void> {
  await db.query(`UPDATE accounts SET birth_date = $2::date WHERE id = $1 AND birth_date IS NULL`, [accountId, birthDate]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Veículo
// ---------------------------------------------------------------------------------------------------------------------

export interface ActiveVehicle {
  readonly id: string;
  readonly plate: string;
  readonly brand: string;
  readonly model: string;
  readonly year: number;
  readonly color: string;
}

export async function findActiveVehicle(db: Queryable, driverId: string): Promise<ActiveVehicle | null> {
  const result = await db.query<{ id: string; plate: string; brand: string; model: string; manufacture_year: number; color: string }>(
    `SELECT id, plate, brand, model, manufacture_year, color FROM vehicles WHERE driver_id = $1 AND status = 'active'`,
    [driverId],
  );
  const row = result.rows[0];
  return row ? { id: row.id, plate: row.plate, brand: row.brand, model: row.model, year: row.manufacture_year, color: row.color } : null;
}

export async function plateActiveForOtherDriver(db: Queryable, plate: string, driverId: string): Promise<boolean> {
  const result = await db.query(`SELECT 1 FROM vehicles WHERE plate = $1 AND status = 'active' AND driver_id <> $2`, [plate, driverId]);
  return (result.rowCount ?? 0) > 0;
}

export async function maxVehicleAgeYears(db: Queryable, cityCode: string): Promise<number | null> {
  const result = await db.query<{ max_vehicle_age_years: number }>(`SELECT max_vehicle_age_years FROM driver_settings WHERE city_code = $1`, [cityCode]);
  return result.rows[0]?.max_vehicle_age_years ?? null;
}

/**
 * Outro carro = outro cadastro (0024): o veículo atual fica inativo (libera a placa) e os documentos dele que ainda
 * valiam ou estavam em andamento saem de uso (`superseded`). O CRLV do carro novo é revisado de novo.
 */
export async function retireVehicle(db: Queryable, vehicleId: string): Promise<void> {
  await db.query(
    `UPDATE driver_documents SET status = 'superseded'
      WHERE vehicle_id = $1 AND status IN ('awaiting_upload', 'submitted', 'approved')`,
    [vehicleId],
  );
  await db.query(`UPDATE vehicles SET status = 'inactive' WHERE id = $1 AND status = 'active'`, [vehicleId]);
}

export async function insertVehicle(db: Queryable, driverId: string, vehicle: { plate: string; brand: string; model: string; year: number; color: string }): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO vehicles (driver_id, plate, brand, model, manufacture_year, color) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [driverId, vehicle.plate, vehicle.brand, vehicle.model, vehicle.year, vehicle.color],
  );
  return result.rows[0]!.id;
}

export async function updateVehicleColor(db: Queryable, vehicleId: string, color: string): Promise<void> {
  await db.query(`UPDATE vehicles SET color = $2 WHERE id = $1`, [vehicleId, color]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Verificação
// ---------------------------------------------------------------------------------------------------------------------

export interface RequirementRow {
  readonly typeCode: string;
  readonly label: string;
  readonly required: boolean;
  readonly hasExpiry: boolean;
  readonly document: {
    readonly id: string;
    readonly status: 'submitted' | 'approved' | 'rejected' | 'expired';
    /** Aprovado com a validade já passada no dia local da cidade (a rotina diária ainda não marcou `expired`). */
    readonly pastExpiry: boolean;
    readonly expiresOn: string | null;
    readonly submittedAt: Date | null;
    readonly rejectionCode: string | null;
    readonly rejectionText: string | null;
  } | null;
}

/**
 * A lista VIGENTE da cidade do motorista, na ordem de exibição, com o documento MAIS RECENTE de cada tipo (só os estados
 * que o app vê: em análise, aprovado, recusado, vencido). Documento de veículo: só o do veículo ATIVO. A nota interna do
 * revisor (`review_note`) não é lida.
 */
export async function listRequirementsWithLatestDocument(db: Queryable, driverId: string): Promise<RequirementRow[]> {
  const result = await db.query<{
    type_code: string; label: string; required: boolean; has_expiry: boolean;
    document_id: string | null; document_status: 'submitted' | 'approved' | 'rejected' | 'expired' | null; past_expiry: boolean | null;
    expires_on: string | null; submitted_at: Date | null; rejection_code: string | null; rejection_text: string | null;
  }>(
    `WITH dr AS (
       SELECT d.account_id, d.city_code, city_today(d.city_code) AS today,
              (SELECT v.id FROM vehicles v WHERE v.driver_id = d.account_id AND v.status = 'active') AS vehicle_id
         FROM drivers d WHERE d.account_id = $1
     )
     SELECT r.type_code, r.label, r.required, r.has_expiry,
            doc.id AS document_id, doc.status AS document_status,
            (doc.status = 'approved' AND doc.expires_on < dr.today) AS past_expiry,
            to_char(doc.expires_on, 'YYYY-MM-DD') AS expires_on, doc.submitted_at,
            doc.rejection_code, rr.driver_text AS rejection_text
       FROM dr
       JOIN current_document_requirements r ON r.city_code = dr.city_code
       LEFT JOIN LATERAL (
            SELECT x.id, x.status, x.expires_on, x.submitted_at, x.rejection_code
              FROM driver_documents x
             WHERE x.driver_id = dr.account_id AND x.type_code = r.type_code
               AND x.status IN ('submitted', 'approved', 'rejected', 'expired')
               AND (r.scope = 'driver' OR x.vehicle_id = dr.vehicle_id)
             ORDER BY x.created_at DESC, x.id DESC
             LIMIT 1) doc ON TRUE
       LEFT JOIN document_rejection_reasons rr ON rr.code = doc.rejection_code
      ORDER BY r.sort_order, r.type_code`,
    [driverId],
  );
  return result.rows.map((row) => ({
    typeCode: row.type_code,
    label: row.label,
    required: row.required,
    hasExpiry: row.has_expiry,
    document: row.document_id === null || row.document_status === null
      ? null
      : {
          id: row.document_id,
          status: row.document_status,
          pastExpiry: row.past_expiry === true,
          expiresOn: row.expires_on,
          submittedAt: row.submitted_at,
          rejectionCode: row.rejection_code,
          rejectionText: row.rejection_text,
        },
  }));
}

export async function reviewSlaHours(db: Queryable, cityCode: string): Promise<number | null> {
  const result = await db.query<{ review_sla_hours: number }>(`SELECT review_sla_hours FROM driver_settings WHERE city_code = $1`, [cityCode]);
  return result.rows[0]?.review_sla_hours ?? null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------------------------------------------------

/** O tipo na lista VIGENTE da cidade: `null` = desconhecido (`422 unknown_document_type`). */
export async function requirementScope(db: Queryable, cityCode: string, typeCode: string): Promise<'driver' | 'vehicle' | null> {
  const result = await db.query<{ scope: 'driver' | 'vehicle' }>(
    `SELECT scope FROM current_document_requirements WHERE city_code = $1 AND type_code = $2`,
    [cityCode, typeCode],
  );
  return result.rows[0]?.scope ?? null;
}

/** Já há um documento deste tipo (do veículo ativo, se for de veículo) aguardando o revisor? */
export async function hasDocumentUnderReview(db: Queryable, driverId: string, typeCode: string, vehicleId: string | null): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM driver_documents
      WHERE driver_id = $1 AND type_code = $2 AND status = 'submitted' AND vehicle_id IS NOT DISTINCT FROM $3::uuid`,
    [driverId, typeCode, vehicleId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Pedir outra URL abandona o envio anterior do mesmo tipo que ainda não foi confirmado (o `submit` dele vira 404). */
export async function abandonPendingUploads(db: Queryable, driverId: string, typeCode: string): Promise<void> {
  await db.query(
    `UPDATE driver_documents SET status = 'superseded' WHERE driver_id = $1 AND type_code = $2 AND status = 'awaiting_upload'`,
    [driverId, typeCode],
  );
}

/** Quantos envios este motorista pediu na última hora (teto por conta do `upload-url`). */
export async function countRecentUploadRequests(db: Queryable, driverId: string): Promise<number> {
  const result = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM driver_documents WHERE driver_id = $1 AND created_at > now() - interval '1 hour'`,
    [driverId],
  );
  return result.rows[0]!.n;
}

export interface NewDocument {
  readonly id: string;
  readonly driverId: string;
  readonly typeCode: string;
  readonly vehicleId: string | null;
  readonly storageKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export async function insertDocument(db: Queryable, doc: NewDocument): Promise<void> {
  await db.query(
    `INSERT INTO driver_documents (id, driver_id, type_code, vehicle_id, storage_key, content_type, size_bytes, sha256)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [doc.id, doc.driverId, doc.typeCode, doc.vehicleId, doc.storageKey, doc.contentType, doc.sizeBytes, doc.sha256],
  );
}

export type StoredDocumentStatus = 'awaiting_upload' | 'submitted' | 'approved' | 'rejected' | 'expired' | 'superseded' | 'withdrawn';

export interface OwnDocument {
  readonly status: StoredDocumentStatus;
  readonly storageKey: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

/** O documento, SÓ se for deste motorista (de outro, ou inexistente: `null`, e a rota responde 404 igual). */
export async function findOwnDocument(db: Queryable, driverId: string, documentId: string): Promise<OwnDocument | null> {
  const result = await db.query<{ status: StoredDocumentStatus; storage_key: string; size_bytes: number; sha256: string }>(
    `SELECT status, storage_key, size_bytes, sha256 FROM driver_documents WHERE id = $1 AND driver_id = $2`,
    [documentId, driverId],
  );
  const row = result.rows[0];
  return row ? { status: row.status, storageKey: row.storage_key, sizeBytes: row.size_bytes, sha256: row.sha256 } : null;
}

/** `awaiting_upload → submitted`, só se ainda estiver aguardando (duas confirmações juntas: uma muda, a outra lê o estado). */
export async function markSubmitted(db: Queryable, driverId: string, documentId: string): Promise<boolean> {
  const result = await db.query(
    `UPDATE driver_documents SET status = 'submitted' WHERE id = $1 AND driver_id = $2 AND status = 'awaiting_upload'`,
    [documentId, driverId],
  );
  return (result.rowCount ?? 0) === 1;
}

// ---------------------------------------------------------------------------------------------------------------------
// Disponibilidade
// ---------------------------------------------------------------------------------------------------------------------

/** `driver_availability_blockers()` (0025): a definição ÚNICA de "pode ficar online". Vazia = pode. */
export async function availabilityBlockers(db: Queryable, driverId: string): Promise<string[]> {
  const result = await db.query<{ blocker: string }>(`SELECT blocker FROM driver_availability_blockers($1)`, [driverId]);
  return result.rows.map((row) => row.blocker);
}
