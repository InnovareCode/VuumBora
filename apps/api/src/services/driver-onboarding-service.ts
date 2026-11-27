/**
 * Regras de negócio do cadastro do motorista (fatia D4 do `docs/plano-m3-m4.md`): vínculo (N3), etapa 2, veículo,
 * verificação, pedido de URL de envio, confirmação do envio e a regra de ficar online. Contrato do app (K0):
 * `packages/api-client/src/driver/onboarding-types.ts`.
 *
 * Cada função devolve um resultado com `kind` (a rota só traduz em HTTP); erro inesperado LANÇA (a rota responde 503).
 * O id do motorista é SEMPRE o da sessão (`accountId`), nunca do corpo; a cidade é fixada no servidor.
 *
 * Concorrência: tudo que muda o cadastro de UM motorista trava a linha dele (`lockDriver`) na transação; corrida ENTRE
 * motoristas (mesma placa, mesmo CPF) cai no índice único e é traduzida no mesmo `kind` da checagem prévia.
 */
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  DRIVER_CITY_CODE,
  currentBusinessYear,
  deriveVerificationStatus,
  documentStorageKey,
  isVehicleTooOld,
  normalizeCpf,
  onboardingRuleProblem,
  availabilityConflict,
  type DriverDocumentStatus,
  type OnboardingInput,
  type UploadRequestInput,
  type VehicleInput,
  type VerificationStatus,
} from '../domain/driver-onboarding.js';
import type { DocumentStorage } from '../lib/document-storage.js';
import { insertAccessLog } from '../repositories/identity-repository.js';
import * as repo from '../repositories/driver-repository.js';

interface PgError { code?: string; constraint?: string }

function pgError(err: unknown): PgError {
  return typeof err === 'object' && err !== null ? (err as PgError) : {};
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

/** Sai da transação sem gravar nada, levando o resultado (ex.: um 409 decidido no meio). */
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

// ---------------------------------------------------------------------------------------------------------------------
// Verificação (também é a resposta de vínculo e etapa 2)
// ---------------------------------------------------------------------------------------------------------------------

export interface VerificationView {
  readonly status: VerificationStatus;
  readonly reviewDeadline?: string;
  readonly onboarding: { readonly profileSubmitted: boolean; readonly vehicleRegistered: boolean };
  readonly requirements: readonly {
    readonly typeCode: string;
    readonly label: string;
    readonly required: boolean;
    readonly hasExpiry: boolean;
    readonly document?: {
      readonly id: string;
      readonly status: DriverDocumentStatus;
      readonly rejection?: { readonly code: string; readonly text: string };
      readonly expiresOn?: string;
    };
  }[];
}

const NOT_STARTED: VerificationView = { status: 'not_started', onboarding: { profileSubmitted: false, vehicleRegistered: false }, requirements: [] };

function accountStatusOf(status: repo.DriverRowStatus): 'pending_review' | 'approved' | 'suspended' {
  if (status === 'approved') return 'approved';
  if (status === 'suspended') return 'suspended';
  return 'pending_review';
}

export async function getVerification(db: Pool | PoolClient, accountId: string): Promise<VerificationView> {
  const driver = await repo.findDriver(db, accountId);
  if (!driver || driver.status === 'deleted') return NOT_STARTED;
  const rows = await repo.listRequirementsWithLatestDocument(db, accountId);

  const requirements: VerificationView['requirements'][number][] = rows.map((row) => {
    const base = { typeCode: row.typeCode, label: row.label, required: row.required, hasExpiry: row.hasExpiry };
    if (!row.document) return base;
    // Aprovado com a validade passada É vencido para o app, mesmo antes de a rotina diária (D5) marcar `expired`.
    const status: DriverDocumentStatus = row.document.status === 'approved' && row.document.pastExpiry ? 'expired' : row.document.status;
    return {
      ...base,
      document: {
        id: row.document.id,
        status,
        ...(status === 'rejected' && row.document.rejectionCode && row.document.rejectionText
          ? { rejection: { code: row.document.rejectionCode, text: row.document.rejectionText } }
          : {}),
        ...(row.document.expiresOn !== null && (status === 'approved' || status === 'expired') ? { expiresOn: row.document.expiresOn } : {}),
      },
    };
  });

  const status = deriveVerificationStatus({
    linked: true,
    accountStatus: accountStatusOf(driver.status),
    profileSubmitted: driver.profileSubmitted,
    vehicleRegistered: driver.activeVehicleId !== null,
    requirements: requirements.map((requirement) => ({ required: requirement.required, documentStatus: requirement.document?.status })),
  });

  let reviewDeadline: string | undefined;
  if (status === 'under_review') {
    const pending = rows
      .filter((row) => row.document?.status === 'submitted' && row.document.submittedAt !== null)
      .map((row) => row.document!.submittedAt!.getTime());
    const slaHours = await repo.reviewSlaHours(db, driver.cityCode);
    if (pending.length > 0 && slaHours !== null) reviewDeadline = new Date(Math.min(...pending) + slaHours * 3_600_000).toISOString();
  }

  return {
    status,
    ...(reviewDeadline !== undefined ? { reviewDeadline } : {}),
    onboarding: { profileSubmitted: driver.profileSubmitted, vehicleRegistered: driver.activeVehicleId !== null },
    requirements,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Vínculo (N3)
// ---------------------------------------------------------------------------------------------------------------------

export type LinkOutcome =
  | { readonly kind: 'ok'; readonly linkedNow: boolean; readonly driverId: string; readonly status: VerificationStatus }
  | { readonly kind: 'email_not_verified' | 'application_not_approved' | 'application_already_linked' | 'not_driver_account' | 'session_invalid' };

export interface LinkContext {
  readonly ipHash: string | null;
  readonly userAgentFamily: string;
  readonly requestId: string;
}

/** Idempotente: chamar de novo devolve o mesmo `driverId`. A trilha (`access_log`) só grava o vínculo NOVO, na mesma transação. */
export async function linkApplication(pool: Pool, accountId: string, context: LinkContext): Promise<LinkOutcome> {
  const result = await inTransaction(pool, async (client) => {
    const linked = await repo.linkDriverApplication(client, accountId, DRIVER_CITY_CODE);
    if (linked === 'linked') {
      await insertAccessLog(client, {
        event: 'driver_application_linked', accountId, deviceId: null,
        ipHash: context.ipHash, userAgentFamily: context.userAgentFamily, requestId: context.requestId,
      });
    }
    return linked;
  });
  if (result === 'linked' || result === 'already_linked') {
    const view = await getVerification(pool, accountId);
    return { kind: 'ok', linkedNow: result === 'linked', driverId: accountId, status: view.status };
  }
  if (result === 'not_found' || result === 'account_inactive') return { kind: 'session_invalid' };
  return { kind: result };
}

// ---------------------------------------------------------------------------------------------------------------------
// Etapa 2
// ---------------------------------------------------------------------------------------------------------------------

export type OnboardingOutcome =
  | { readonly kind: 'ok'; readonly status: VerificationStatus }
  | { readonly kind: 'driver_not_linked' | 'invalid_cpf' | 'cnh_without_ear' | 'cpf_locked' | 'cnh_locked' | 'cpf_in_use' };

/**
 * Ordem (contrato K0 + acréscimos da D4): `driver_not_linked` → `invalid_cpf` → `cnh_without_ear` → `cpf_locked` (o
 * CPF já informado não muda) → `cnh_locked` (CNH em análise ou aprovada e válida: o revisor conferiu ESTES dados) →
 * `cpf_in_use` (outro motorista vivo). Endereço muda livre.
 */
export async function saveOnboarding(pool: Pool, accountId: string, input: OnboardingInput): Promise<OnboardingOutcome> {
  const outcome = await attempt<OnboardingOutcome>(pool, async (client) => {
    const driver = await repo.lockDriver(client, accountId);
    if (!driver || driver.status === 'deleted') throw new Abort<OnboardingOutcome>({ kind: 'driver_not_linked' });
    const problem = onboardingRuleProblem(input);
    if (problem) throw new Abort<OnboardingOutcome>({ kind: problem });

    const cpf = normalizeCpf(input.rawCpf);
    const comparison = await repo.compareProfile(client, accountId, {
      cpf, cnhNumber: input.cnh.number, cnhCategory: input.cnh.category, cnhExpiresOn: input.cnh.expiresOn,
    });
    if (comparison.hasCpf && !comparison.sameCpf) throw new Abort<OnboardingOutcome>({ kind: 'cpf_locked' });
    if (comparison.cnhLocked && !comparison.sameCnh) throw new Abort<OnboardingOutcome>({ kind: 'cnh_locked' });
    if (comparison.cpfTakenByOther) throw new Abort<OnboardingOutcome>({ kind: 'cpf_in_use' });

    try {
      await repo.saveProfile(client, accountId, {
        cpf, cnhNumber: input.cnh.number, cnhCategory: input.cnh.category, cnhExpiresOn: input.cnh.expiresOn,
        postalCode: input.address.postalCode, street: input.address.street, number: input.address.number,
        complement: input.address.complement, neighborhood: input.address.neighborhood, city: input.address.city, state: input.address.state,
      });
    } catch (err) {
      // Corrida com outro motorista gravando o mesmo CPF entre a checagem e a escrita: o índice único decide.
      if (pgError(err).code === '23505' && pgError(err).constraint === 'drivers_cpf_key') throw new Abort<OnboardingOutcome>({ kind: 'cpf_in_use' });
      throw err;
    }
    await repo.fillMissingBirthDate(client, accountId, input.birthDate);
    return { kind: 'ok', status: 'pending_documents' };
  });
  if (outcome.kind !== 'ok') return outcome;
  return { kind: 'ok', status: (await getVerification(pool, accountId)).status };
}

// ---------------------------------------------------------------------------------------------------------------------
// Veículo
// ---------------------------------------------------------------------------------------------------------------------

export type VehicleOutcome =
  | { readonly kind: 'ok'; readonly vehicleId: string }
  | { readonly kind: 'driver_not_linked' | 'plate_in_use' | 'vehicle_too_old' };

/**
 * Ordem: `driver_not_linked` → `plate_in_use` → `vehicle_too_old`. Mesma placa, marca, modelo e ano do veículo ativo =
 * o mesmo veículo (só a cor muda): devolve o mesmo id. Qualquer outra coisa é OUTRO cadastro (0024): o atual fica
 * inativo, os documentos dele saem de uso e o CRLV do novo é revisado de novo.
 */
export async function saveVehicle(pool: Pool, accountId: string, input: VehicleInput, now: Date = new Date()): Promise<VehicleOutcome> {
  return attempt<VehicleOutcome>(pool, async (client) => {
    const driver = await repo.lockDriver(client, accountId);
    if (!driver || driver.status === 'deleted') throw new Abort<VehicleOutcome>({ kind: 'driver_not_linked' });
    if (await repo.plateActiveForOtherDriver(client, input.plate, accountId)) throw new Abort<VehicleOutcome>({ kind: 'plate_in_use' });
    const maxAge = await repo.maxVehicleAgeYears(client, driver.cityCode);
    if (maxAge === null) throw new Error('driver_settings ausente para a cidade do motorista');
    if (isVehicleTooOld(input.year, maxAge, currentBusinessYear(now))) throw new Abort<VehicleOutcome>({ kind: 'vehicle_too_old' });

    const current = await repo.findActiveVehicle(client, accountId);
    if (current && current.plate === input.plate && current.brand === input.brand && current.model === input.model && current.year === input.year) {
      if (current.color !== input.color) await repo.updateVehicleColor(client, current.id, input.color);
      return { kind: 'ok', vehicleId: current.id };
    }
    if (current) await repo.retireVehicle(client, current.id);
    try {
      return { kind: 'ok', vehicleId: await repo.insertVehicle(client, accountId, input) };
    } catch (err) {
      if (pgError(err).code === '23505' && pgError(err).constraint === 'vehicles_active_plate_key') throw new Abort<VehicleOutcome>({ kind: 'plate_in_use' });
      throw err;
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------------------------------------------------

export type UploadUrlOutcome =
  | { readonly kind: 'ok'; readonly documentId: string; readonly uploadUrl: string; readonly headers: Readonly<Record<string, string>>; readonly expiresAt: Date }
  | { readonly kind: 'driver_not_linked' | 'unknown_document_type' | 'vehicle_not_registered' | 'document_under_review' | 'too_many_requests' };

export interface UploadUrlOptions {
  readonly storage: DocumentStorage;
  readonly urlTtlSeconds: number;
  /** Teto por conta: pedidos de envio na última hora. */
  readonly maxRequestsPerHour: number;
}

/**
 * Ordem (depois de `400`/`413`, que a rota decide): `driver_not_linked` → `unknown_document_type` (fora da lista
 * vigente) → `vehicle_not_registered` (documento de veículo sem veículo ativo) → `document_under_review` (já há um deste
 * tipo com o revisor) → teto por conta. Um pedido novo abandona o envio anterior do mesmo tipo ainda não confirmado.
 * A URL é assinada ANTES do COMMIT: se a assinatura falhar, nada fica gravado.
 */
export async function requestUploadUrl(pool: Pool, accountId: string, input: UploadRequestInput, options: UploadUrlOptions): Promise<UploadUrlOutcome> {
  return attempt<UploadUrlOutcome>(pool, async (client) => {
    const driver = await repo.lockDriver(client, accountId);
    if (!driver || driver.status === 'deleted') throw new Abort<UploadUrlOutcome>({ kind: 'driver_not_linked' });
    const scope = await repo.requirementScope(client, driver.cityCode, input.typeCode);
    if (scope === null) throw new Abort<UploadUrlOutcome>({ kind: 'unknown_document_type' });
    const vehicleId = scope === 'vehicle' ? driver.activeVehicleId : null;
    if (scope === 'vehicle' && vehicleId === null) throw new Abort<UploadUrlOutcome>({ kind: 'vehicle_not_registered' });
    if (await repo.hasDocumentUnderReview(client, accountId, input.typeCode, vehicleId)) throw new Abort<UploadUrlOutcome>({ kind: 'document_under_review' });
    if ((await repo.countRecentUploadRequests(client, accountId)) >= options.maxRequestsPerHour) throw new Abort<UploadUrlOutcome>({ kind: 'too_many_requests' });

    await repo.abandonPendingUploads(client, accountId, input.typeCode);
    const documentId = randomUUID();
    const storageKey = documentStorageKey(accountId, documentId, input.contentType);
    await repo.insertDocument(client, {
      id: documentId, driverId: accountId, typeCode: input.typeCode, vehicleId, storageKey,
      contentType: input.contentType, sizeBytes: input.sizeBytes, sha256: input.sha256,
    });
    const signed = await options.storage.presignUpload({
      key: storageKey, contentType: input.contentType, sizeBytes: input.sizeBytes, sha256Hex: input.sha256, ttlSeconds: options.urlTtlSeconds,
    });
    return { kind: 'ok', documentId, uploadUrl: signed.url, headers: signed.headers, expiresAt: signed.expiresAt };
  });
}

export type SubmitOutcome =
  | { readonly kind: 'ok' }
  | { readonly kind: 'not_found' | 'upload_missing' | 'invalid_transition' };

/**
 * Confirma o envio: o objeto TEM de existir com o tamanho e o SHA-256 declarados (`upload_missing` se não). Já
 * `submitted` = o mesmo 200 (idempotente). Decidido (aprovado, recusado, vencido) = `invalid_transition`. Abandonado
 * (outra URL pedida depois) ou retirado = `not_found`, como o de outro motorista (não confirma que existe).
 */
export async function submitDocument(pool: Pool, accountId: string, documentId: string, storage: DocumentStorage): Promise<SubmitOutcome> {
  const doc = await repo.findOwnDocument(pool, accountId, documentId);
  if (!doc) return { kind: 'not_found' };
  const settled = settledOutcome(doc.status);
  if (settled) return settled;

  // Rede fora da transação: o armazenamento pode demorar até o timeout dele.
  const stored = await storage.inspect(doc.storageKey);
  if (!stored || stored.sizeBytes !== doc.sizeBytes || stored.sha256Hex !== doc.sha256) return { kind: 'upload_missing' };

  if (await repo.markSubmitted(pool, accountId, documentId)) return { kind: 'ok' };
  // Outra confirmação (ou um novo pedido de URL) chegou antes: decide pelo estado de agora.
  const now = await repo.findOwnDocument(pool, accountId, documentId);
  return (now && settledOutcome(now.status)) ?? { kind: 'not_found' };
}

function settledOutcome(status: repo.StoredDocumentStatus): SubmitOutcome | null {
  if (status === 'awaiting_upload') return null;
  if (status === 'submitted') return { kind: 'ok' };
  if (status === 'superseded' || status === 'withdrawn') return { kind: 'not_found' };
  return { kind: 'invalid_transition' };
}

// ---------------------------------------------------------------------------------------------------------------------
// Disponibilidade
// ---------------------------------------------------------------------------------------------------------------------

export type AvailabilityOutcome =
  | { readonly kind: 'ok'; readonly phase: 'online' | 'offline' }
  | { readonly kind: 'driver_not_approved' | 'document_expired' };

/**
 * Só a REGRA no M3 (o estado online e o despacho são do M5). Desligar sempre funciona (R7). Ligar consulta
 * `driver_availability_blockers()` a cada vez: suspensão, pendência e documento vencido valem na hora.
 */
export async function setAvailability(pool: Pool, accountId: string, online: boolean): Promise<AvailabilityOutcome> {
  if (!online) return { kind: 'ok', phase: 'offline' };
  const conflict = availabilityConflict(await repo.availabilityBlockers(pool, accountId));
  return conflict ? { kind: conflict } : { kind: 'ok', phase: 'online' };
}
