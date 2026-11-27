/**
 * Adaptador `mock` do cadastro do motorista (M3, fatia K0 do `docs/plano-m3-m4.md`): uma instância =
 * UMA conta de motorista. Responde cada erro do §3 pela mesma regra do servidor (regras de
 * `@vuumbora/domain`, erros de `DRIVER_ONBOARDING_ERRORS`).
 *
 * Para a Lyra construir M02, M03 e M04 sem servidor:
 * - o caminho feliz anda sozinho: `linkApplication` → `saveOnboarding` → `saveVehicle` →
 *   `requestUploadUrl` → `uploader.upload` → `submitDocument`;
 * - `control.review(...)` faz o papel do revisor (aprovar, recusar com motivo); `control.expireDocument`
 *   e `control.suspend` levam aos outros estados da M04;
 * - `control.failNext(code)` força o próximo erro de QUALQUER código do catálogo (ou `'network'`);
 * - com a MESMA `store` em `createMockDocumentReview` (`./admin`), o painel vê o que este motorista
 *   enviou, e a decisão de lá aparece aqui;
 * - `control.goOnlineBlocker` liga este cadastro ao `createMockDriverRidePort({ availabilityGate })`.
 *
 * Alinhado à API real (fatia D4): limites de texto dos CHECKs da 0024 (complemento até 60, marca até 40), 18 anos na
 * etapa 2, e os acréscimos `cpf_locked`, `cnh_locked` e `cpf_in_use`. `vehicle_not_registered`,
 * `application_already_linked` e `not_driver_account` só saem por `control.failNext` (a store não modela escopo de
 * documento nem conta de outro tipo).
 *
 * **Sem dado de demonstração na tela** (ficha M03 §10): o que este mock devolve serve para construir
 * e testar a tela, não para exibir como real; a origem de toda resposta é `'mock'`.
 */
import { isValidCpf, normalizeCpf } from '@vuumbora/domain';
import {
  documentUploadProblem,
  goOnlineBlocker,
  isCalendarDate,
  isValidPlate,
  isVehicleTooOld,
  normalizePlate,
  DOCUMENT_URL_MAX_TTL_SECONDS,
  type GoOnlineBlocker,
  type VerificationStatus,
} from '@vuumbora/domain/driver';
import type { Result } from '../index';
import { catalogError, NETWORK_FAILURE } from '../server-error';
import { failWith, succeed } from '../trip/result';
import { createDocumentStore, type DocumentStore, type MockDocumentRecord } from '../documents/mock-store';
import type { CnhCategory, DocumentRequirement, DriverVehicleInput } from '../documents/types';
import {
  DRIVER_ONBOARDING_ERRORS,
  type DocumentUploadPort,
  type DocumentUploadRequest,
  type DocumentUploadTarget,
  type DriverOnboardingErrorCode,
  type DriverOnboardingInput,
  type DriverOnboardingPort,
  type DriverVerification,
  type LinkApplicationResult,
  type UploadSource,
} from './onboarding-types';

export interface MockDriverOnboardingOptions {
  /** Compartilhe com `createMockDocumentReview` para o painel ver este motorista. Padrão: uma store nova. */
  readonly store?: DocumentStore;
  /** Identidade desta conta (um motorista). Padrão: gerado. */
  readonly driverId?: string;
  readonly fullName?: string;
  readonly email?: string;
  /** Situação da candidatura de mesmo e-mail. Padrão `'approved'`. */
  readonly application?: 'approved' | 'pending' | 'none';
  /** Padrão `true` (os apps já exigem e-mail verificado para entrar). */
  readonly emailVerified?: boolean;
  /** Atraso entre os passos de progresso do envio, em ms. Padrão 0 (testes); o app pode usar ~300. */
  readonly uploadStepDelayMs?: number;
}

/** Decisão simulada do revisor (sem papel nem idempotência: para isso, `createMockDocumentReview`). */
export type MockReviewDecision =
  | { readonly approve: true; readonly expiresOn?: string }
  | { readonly reject: string; readonly internalNote?: string };

export interface MockDriverOnboardingControl {
  readonly driverId: string;
  /** A PRÓXIMA chamada de qualquer método da porta falha com este código (uma vez). */
  failNext(code: DriverOnboardingErrorCode | 'network'): void;
  /** O PRÓXIMO `upload` falha: sem rede, URL vencida, ou chega corrompido (o `submit` responde `upload_missing`). */
  failNextUpload(kind: 'network' | 'expired_url' | 'corrupted'): void;
  setApplication(status: 'approved' | 'pending' | 'none'): void;
  setEmailVerified(verified: boolean): void;
  /** Faz o papel do revisor num documento `submitted`. Documento inexistente, ou não `submitted`, lança `TypeError`. */
  review(documentId: string, decision: MockReviewDecision): void;
  /** Vence um documento aprovado (como a rotina diária faria). */
  expireDocument(documentId: string): void;
  suspend(reason?: string): void;
  /** A regra de ficar online deste cadastro, para `createMockDriverRidePort({ availabilityGate })`. */
  goOnlineBlocker(): GoOnlineBlocker | null;
}

export interface MockDriverOnboarding {
  readonly port: DriverOnboardingPort;
  readonly uploader: DocumentUploadPort;
  readonly control: MockDriverOnboardingControl;
  readonly store: DocumentStore;
}

const CNH_CATEGORIES: readonly CnhCategory[] = ['B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'];
const PROGRESS_STEPS = [0.25, 0.5, 0.75, 1] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function wait(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** A data de nascimento mais recente com 18 anos completos em `today` (29/02 recua para 28/02, como o servidor). */
function latestAdultBirthDate(today: string): string {
  const year = Number(today.slice(0, 4)) - 18;
  const monthDay = today.slice(5);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return `${String(year).padStart(4, '0')}-${monthDay === '02-29' && !leap ? '02-28' : monthDay}`;
}

/** A forma do corpo da etapa 2 (o que o servidor recusa com `400 invalid_body` antes de qualquer regra). */
function isOnboardingBody(input: unknown, today: string): input is DriverOnboardingInput {
  if (!isRecord(input) || !isRecord(input['address']) || !isRecord(input['cnh'])) return false;
  const address = input['address'];
  const cnh = input['cnh'];
  const complement = address['complement'];
  return (
    typeof input['cpf'] === 'string' &&
    isCalendarDate(input['birthDate']) &&
    input['birthDate'] >= '1900-01-01' &&
    input['birthDate'] <= latestAdultBirthDate(today) &&
    isText(address['street'], 120) &&
    isText(address['number'], 20) &&
    (complement === undefined || (typeof complement === 'string' && complement.trim().length <= 60)) &&
    isText(address['neighborhood'], 80) &&
    isText(address['city'], 80) &&
    typeof address['state'] === 'string' &&
    /^[A-Z]{2}$/.test(address['state']) &&
    typeof address['postalCode'] === 'string' &&
    /^\d{8}$/.test(address['postalCode']) &&
    typeof cnh['number'] === 'string' &&
    /^\d{11}$/.test(cnh['number']) &&
    typeof cnh['category'] === 'string' &&
    (CNH_CATEGORIES as readonly string[]).includes(cnh['category']) &&
    isCalendarDate(cnh['expiresOn']) &&
    typeof cnh['ear'] === 'boolean'
  );
}

function isVehicleBody(input: unknown, currentYear: number): input is DriverVehicleInput {
  if (!isRecord(input)) return false;
  const year = input['year'];
  return (
    isValidPlate(input['plate']) &&
    isText(input['brand'], 40) &&
    isText(input['model'], 60) &&
    isText(input['color'], 30) &&
    typeof year === 'number' &&
    Number.isInteger(year) &&
    year >= 1950 &&
    year <= currentYear + 1
  );
}

export function createMockDriverOnboarding(options: MockDriverOnboardingOptions = {}): MockDriverOnboarding {
  const store = options.store ?? createDocumentStore();
  const { clock } = store;
  const driverId = options.driverId ?? `driver-${store.nextId()}`;
  const fullName = options.fullName ?? 'Motorista de teste';
  const email = options.email ?? `${driverId}@exemplo.invalid`;
  const uploadStepDelayMs = options.uploadStepDelayMs ?? 0;
  let application = options.application ?? 'approved';
  let emailVerified = options.emailVerified ?? true;
  let forcedFailure: DriverOnboardingErrorCode | 'network' | undefined;
  let forcedUploadFailure: 'network' | 'expired_url' | 'corrupted' | undefined;

  const fail = (code: DriverOnboardingErrorCode) => failWith(catalogError(DRIVER_ONBOARDING_ERRORS, code));

  /** Erro forçado por `control.failNext`, consumido uma vez; e a "rotina diária" de vencimento. */
  function begin(): { readonly ok: false; readonly error: ReturnType<typeof catalogError> } | undefined {
    store.sweepExpired();
    const forced = forcedFailure;
    forcedFailure = undefined;
    if (forced === 'network') return failWith(NETWORK_FAILURE);
    if (forced !== undefined) return fail(forced);
    return undefined;
  }

  function requirementsView(): DocumentRequirement[] {
    return store.requirements.map((requirement) => {
      const latest = store.latestDocument(driverId, requirement.typeCode);
      const base = { typeCode: requirement.typeCode, label: requirement.label, required: requirement.required, hasExpiry: requirement.hasExpiry };
      if (!latest || latest.state === 'pending_upload') return base;
      return {
        ...base,
        document: {
          id: latest.id,
          status: latest.state,
          ...(latest.state === 'rejected' && latest.rejection ? { rejection: latest.rejection } : {}),
          ...(latest.expiresOn !== undefined ? { expiresOn: latest.expiresOn } : {}),
        },
      };
    });
  }

  function buildVerification(): DriverVerification {
    const driver = store.drivers.get(driverId);
    if (!driver) {
      return { status: 'not_started', onboarding: { profileSubmitted: false, vehicleRegistered: false }, requirements: [] };
    }
    const status = store.status(driverId);
    let oldestPendingMs: number | undefined;
    if (status === 'under_review') {
      for (const requirement of store.requirements) {
        const latest = store.latestDocument(driverId, requirement.typeCode);
        if (latest?.state === 'submitted' && latest.submittedAtMs !== undefined) {
          oldestPendingMs = oldestPendingMs === undefined ? latest.submittedAtMs : Math.min(oldestPendingMs, latest.submittedAtMs);
        }
      }
    }
    return {
      status,
      ...(oldestPendingMs !== undefined ? { reviewDeadline: new Date(store.reviewDeadlineMs(oldestPendingMs)).toISOString() } : {}),
      onboarding: { profileSubmitted: driver.profile !== undefined, vehicleRegistered: driver.vehicle !== undefined },
      requirements: requirementsView(),
    };
  }

  async function linkApplication(): Promise<Result<LinkApplicationResult>> {
    const forced = begin();
    if (forced) return forced;
    if (!store.drivers.has(driverId)) {
      if (!emailVerified) return fail('email_not_verified');
      if (application !== 'approved') return fail('application_not_approved');
      store.drivers.set(driverId, { driverId, fullName, email, applicationId: `app-${driverId}`, accountStatus: 'pending_review' });
    }
    return succeed({ driverId, status: store.status(driverId) });
  }

  async function saveOnboarding(input: DriverOnboardingInput): Promise<Result<{ readonly status: VerificationStatus }>> {
    const forced = begin();
    if (forced) return forced;
    if (!isOnboardingBody(input, store.today())) return fail('invalid_body');
    const driver = store.drivers.get(driverId);
    if (!driver) return fail('driver_not_linked');
    if (!isValidCpf(input.cpf)) return fail('invalid_cpf');
    if (!input.cnh.ear) return fail('cnh_without_ear');
    const cpf = normalizeCpf(input.cpf);
    if (driver.profile && driver.profile.cpf !== cpf) return fail('cpf_locked');
    const previousCnh = driver.profile?.cnh;
    // Sem dados de CNH gravados ainda, a primeira gravação passa (como no servidor).
    const cnhChanged =
      previousCnh !== undefined &&
      (previousCnh.number !== input.cnh.number ||
      previousCnh.category !== input.cnh.category ||
        previousCnh.expiresOn !== input.cnh.expiresOn);
    const cnh = store.latestDocument(driverId, 'cnh');
    const today = store.today();
    const cnhLocked =
      cnh?.state === 'submitted' || (cnh?.state === 'approved' && (cnh.expiresOn === undefined || cnh.expiresOn >= today));
    if (cnhLocked && cnhChanged) return fail('cnh_locked');
    for (const other of store.drivers.values()) {
      if (other.driverId !== driverId && other.profile?.cpf === cpf) return fail('cpf_in_use');
    }
    driver.profile = {
      cpf,
      birthDate: input.birthDate,
      address: { ...input.address },
      cnh: { ...input.cnh },
    };
    return succeed({ status: store.status(driverId) });
  }

  async function saveVehicle(input: DriverVehicleInput): Promise<Result<{ readonly vehicleId: string }>> {
    const forced = begin();
    if (forced) return forced;
    const currentYear = Number(store.today().slice(0, 4));
    if (!isVehicleBody(input, currentYear)) return fail('invalid_body');
    const driver = store.drivers.get(driverId);
    if (!driver) return fail('driver_not_linked');
    const plate = normalizePlate(input.plate);
    if (store.isPlateInUse(plate, driverId)) return fail('plate_in_use');
    if (isVehicleTooOld(input.year, { maxAgeYears: store.settings.vehicleMaxAgeYears, currentYear })) return fail('vehicle_too_old');
    const vehicleId = driver.vehicle && driver.vehicle.plate === plate ? driver.vehicle.vehicleId : `veh-${store.nextId()}`;
    driver.vehicle = { vehicleId, plate, brand: input.brand, model: input.model, year: input.year, color: input.color };
    return succeed({ vehicleId });
  }

  async function verification(): Promise<Result<DriverVerification>> {
    const forced = begin();
    if (forced) return forced;
    return succeed(buildVerification());
  }

  async function requestUploadUrl(input: DocumentUploadRequest): Promise<Result<DocumentUploadTarget>> {
    const forced = begin();
    if (forced) return forced;
    if (!isRecord(input) || !isText(input.typeCode, 64)) return fail('invalid_body');
    const problem = documentUploadProblem(input);
    if (problem) return fail(problem);
    if (!store.drivers.has(driverId)) return fail('driver_not_linked');
    if (!store.requirement(input.typeCode)) return fail('unknown_document_type');
    if (store.latestDocument(driverId, input.typeCode)?.state === 'submitted') return fail('document_under_review');

    // Um envio em andamento por tipo: pedir outra URL abandona a anterior (o `submit` dela vira 404).
    for (const [id, record] of store.documents) {
      if (record.driverId === driverId && record.typeCode === input.typeCode && record.state === 'pending_upload') {
        store.documents.delete(id);
        store.objects.delete(id);
      }
    }

    const now = clock();
    const id = store.nextId();
    const uploadExpiresAtMs = now + DOCUMENT_URL_MAX_TTL_SECONDS * 1000;
    const record: MockDocumentRecord = {
      id,
      driverId,
      typeCode: input.typeCode,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      createdAtMs: now,
      uploadExpiresAtMs,
      state: 'pending_upload',
    };
    store.documents.set(id, record);
    return succeed({
      documentId: id,
      uploadUrl: `https://mock-storage.invalid/driver-docs/${encodeURIComponent(driverId)}/${encodeURIComponent(id)}`,
      method: 'PUT',
      headers: { 'Content-Type': input.contentType, 'Content-Length': String(input.sizeBytes) },
      expiresAt: new Date(uploadExpiresAtMs).toISOString(),
    });
  }

  async function submitDocument(documentId: string): Promise<Result<{ readonly status: 'submitted' }>> {
    const forced = begin();
    if (forced) return forced;
    const record = typeof documentId === 'string' ? store.documents.get(documentId) : undefined;
    // Documento de outro motorista responde igual a inexistente (não confirma que existe).
    if (!record || record.driverId !== driverId) return fail('not_found');
    if (record.state === 'submitted') return succeed({ status: 'submitted' });
    if (record.state !== 'pending_upload') return fail('invalid_transition');
    const object = store.objects.get(record.id);
    if (!object || object.sizeBytes !== record.sizeBytes || object.sha256 !== record.sha256) return fail('upload_missing');
    record.state = 'submitted';
    record.submittedAtMs = clock();
    return succeed({ status: 'submitted' });
  }

  async function upload(target: DocumentUploadTarget, source: UploadSource, onProgress?: (fraction: number) => void): Promise<Result<void>> {
    const forced = forcedUploadFailure;
    forcedUploadFailure = undefined;
    if (!isRecord(source) || !isText(source.uri, 4096)) return fail('invalid_body');
    if (forced === 'network') return failWith(NETWORK_FAILURE);
    const record = store.documents.get(target.documentId);
    if (forced === 'expired_url' || !record || record.state !== 'pending_upload' || clock() > record.uploadExpiresAtMs) {
      return failWith({ kind: 'forbidden', code: 'upload_url_expired' });
    }
    for (const fraction of PROGRESS_STEPS) {
      await wait(uploadStepDelayMs);
      onProgress?.(fraction);
    }
    store.objects.set(record.id, {
      sizeBytes: record.sizeBytes,
      sha256: forced === 'corrupted' ? 'f'.repeat(64) : record.sha256,
    });
    return succeed(undefined);
  }

  function submittedRecord(documentId: string): MockDocumentRecord {
    const record = store.documents.get(documentId);
    if (!record || record.driverId !== driverId) throw new TypeError(`documento ${documentId} não é deste motorista`);
    if (record.state !== 'submitted') throw new TypeError(`documento ${documentId} não está aguardando revisão (${record.state})`);
    return record;
  }

  const control: MockDriverOnboardingControl = {
    driverId,
    failNext(code) {
      forcedFailure = code;
    },
    failNextUpload(kind) {
      forcedUploadFailure = kind;
    },
    setApplication(status) {
      application = status;
    },
    setEmailVerified(verified) {
      emailVerified = verified;
    },
    review(documentId, decision) {
      const record = submittedRecord(documentId);
      if ('approve' in decision) {
        store.approveDocument(record, decision.expiresOn);
        return;
      }
      const reason = store.rejectionReasons.find((candidate) => candidate.code === decision.reject);
      if (!reason) throw new TypeError(`motivo fora do catálogo: ${decision.reject}`);
      store.rejectDocument(record, reason, decision.internalNote);
    },
    expireDocument(documentId) {
      const record = store.documents.get(documentId);
      if (!record || record.state !== 'approved') throw new TypeError(`documento ${documentId} não está aprovado`);
      record.state = 'expired';
    },
    suspend(reason = 'Suspensão de teste.') {
      const driver = store.drivers.get(driverId);
      if (!driver) throw new TypeError('motorista ainda não ligado à candidatura');
      driver.accountStatus = 'suspended';
      driver.suspension = { reason, atMs: clock() };
    },
    goOnlineBlocker() {
      store.sweepExpired();
      return goOnlineBlocker(buildVerification(), store.today());
    },
  };

  return {
    port: { linkApplication, saveOnboarding, saveVehicle, verification, requestUploadUrl, submitDocument },
    uploader: { upload },
    control,
    store,
  };
}
