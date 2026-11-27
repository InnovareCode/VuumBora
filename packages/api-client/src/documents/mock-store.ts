/**
 * Estado em memória dos DOCUMENTOS DO MOTORISTA, compartilhado pelo mock do app do motorista
 * (`createMockDriverOnboarding`, `./driver`) e pelo mock da fila do painel
 * (`createMockDocumentReview`, `./admin`). Mesmo papel da `TripStore` na corrida: com a MESMA store,
 * o que o motorista envia aparece na fila, e o que o revisor decide aparece na verificação do
 * motorista — sem espelhar estado em dois lugares (lição do R2 da F08).
 *
 * Só guarda fatos. As regras (estado derivado, N4, vencimento) vêm de `@vuumbora/domain/driver`; o
 * que cada rota responde mora no adaptador de cada lado.
 *
 * **Dado de exemplo:** a lista de exigências e o catálogo de motivos abaixo são PROVISÓRIOS (N1, N2 e
 * §6 do plano): a semente real é da migração D1, e a lista definitiva depende da STTU.
 */
import {
  deriveVerificationStatus,
  isReadyForApproval,
  natalCalendarDate,
  normalizePlate,
  type DocumentContentType,
  type DriverDocumentStatus,
  type VerificationFacts,
  type VerificationStatus,
} from '@vuumbora/domain/driver';
import type { DocumentRejection, DriverAddress, DriverCnh, DriverVehicleInput } from './types';

/** Uma exigência da lista (o que `document_requirements` guarda por cidade e versão). */
export interface MockRequirement {
  readonly typeCode: string;
  readonly label: string;
  readonly required: boolean;
  readonly hasExpiry: boolean;
}

/** Semente PROVISÓRIA (N1): mínimo federal (Lei 12.587, art. 11-B) e foto de perfil. */
export const PROVISIONAL_REQUIREMENTS: readonly MockRequirement[] = [
  { typeCode: 'cnh', label: 'CNH com EAR', required: true, hasExpiry: true },
  { typeCode: 'crlv', label: 'Documento do veículo (CRLV)', required: true, hasExpiry: true },
  { typeCode: 'antecedentes', label: 'Certidão de antecedentes criminais', required: true, hasExpiry: true },
  { typeCode: 'inss', label: 'Comprovante de inscrição no INSS', required: true, hasExpiry: false },
  { typeCode: 'foto_perfil', label: 'Foto de perfil', required: true, hasExpiry: false },
];

/** Catálogo PROVISÓRIO de motivos de recusa (N2; o texto final depende da decisão 9). */
export const PROVISIONAL_REJECTION_REASONS: readonly DocumentRejection[] = [
  { code: 'illegible', text: 'Não conseguimos ler o documento. Envie uma foto nítida, sem reflexo e sem cortes.' },
  { code: 'wrong_document', text: 'O arquivo enviado não é o documento pedido.' },
  { code: 'expired_document', text: 'O documento enviado está vencido.' },
  { code: 'data_mismatch', text: 'Os dados do documento não conferem com os do seu cadastro.' },
  { code: 'incomplete', text: 'Falta uma parte do documento. Envie frente e verso.' },
];

/** Estado interno de um documento. `pending_upload` = pediu a URL e ainda não enviou: não aparece em lista nenhuma. */
export type MockDocumentState = 'pending_upload' | DriverDocumentStatus;

export interface MockDocumentRecord {
  readonly id: string;
  readonly driverId: string;
  readonly typeCode: string;
  readonly contentType: DocumentContentType;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly createdAtMs: number;
  readonly uploadExpiresAtMs: number;
  state: MockDocumentState;
  submittedAtMs?: number;
  reviewedAtMs?: number;
  expiresOn?: string;
  rejection?: DocumentRejection;
  /** Nota livre do revisor. Só o painel vê. */
  internalNote?: string;
}

export interface MockDriverProfile {
  readonly cpf: string;
  readonly birthDate: string;
  readonly address: DriverAddress;
  readonly cnh: DriverCnh;
}

export interface MockVehicle extends DriverVehicleInput {
  readonly vehicleId: string;
}

export interface MockDriverRecord {
  readonly driverId: string;
  readonly fullName: string;
  readonly email: string;
  readonly applicationId: string;
  accountStatus: VerificationFacts['accountStatus'];
  profile?: MockDriverProfile;
  vehicle?: MockVehicle;
  suspension?: { readonly reason: string; readonly atMs: number };
}

/** Linha da trilha de auditoria (N5: cada visualização de documento grava ANTES de devolver a URL). */
export interface MockAuditEntry {
  readonly action: 'document.view_url' | 'document.approve' | 'document.reject' | 'driver.suspend';
  readonly targetId: string;
  readonly actorRole: string;
  readonly atMs: number;
}

export interface MockDocumentSettings {
  /** Prazo de análise (`review_sla_hours`). Proposta do plano: 2 dias úteis; o mock usa horas corridas. */
  readonly reviewSlaHours: number;
  /** Idade máxima do veículo, em anos (`driver_settings`). */
  readonly vehicleMaxAgeYears: number;
}

export interface DocumentStoreOptions {
  readonly clock?: () => number;
  readonly nextId?: () => string;
  readonly requirements?: readonly MockRequirement[];
  readonly rejectionReasons?: readonly DocumentRejection[];
  readonly settings?: Partial<MockDocumentSettings>;
  /** Placas já usadas por motoristas FORA desta store (para provocar `409 plate_in_use`). Padrão: `ABC1D23`. */
  readonly platesInUse?: readonly string[];
  /** `'demo'` semeia três motoristas fictícios (fila com prazo vencido, correção pedida, aprovado). */
  readonly seed?: 'empty' | 'demo';
}

export interface DocumentStore {
  readonly clock: () => number;
  readonly nextId: () => string;
  readonly settings: MockDocumentSettings;
  readonly requirements: readonly MockRequirement[];
  readonly rejectionReasons: readonly DocumentRejection[];
  readonly drivers: Map<string, MockDriverRecord>;
  readonly documents: Map<string, MockDocumentRecord>;
  /** Objetos que "chegaram" ao armazenamento, por `documentId`: o que o envio realmente gravou. */
  readonly objects: Map<string, { readonly sizeBytes: number; readonly sha256: string }>;
  readonly audit: MockAuditEntry[];
  requirement(typeCode: string): MockRequirement | undefined;
  /** O documento mais recente de um tipo, ignorando os `pending_upload`. */
  latestDocument(driverId: string, typeCode: string): MockDocumentRecord | undefined;
  isPlateInUse(plate: string, exceptDriverId: string): boolean;
  facts(driverId: string): VerificationFacts;
  status(driverId: string): VerificationStatus;
  /** Prazo de análise de um documento enviado em `submittedAtMs`. */
  reviewDeadlineMs(submittedAtMs: number): number;
  /** N4: aprova a conta se o último obrigatório foi aprovado. Devolve o estado derivado. */
  applyAutoApproval(driverId: string): VerificationStatus;
  /** "Hoje" em Natal (`AAAA-MM-DD`), pelo relógio da store. */
  today(): string;
  /**
   * Faz o papel da rotina diária do D5: documento aprovado com validade anterior a hoje passa a
   * `expired`. Os mocks chamam no começo de toda operação (o efeito é o da rotina ter rodado).
   */
  sweepExpired(): void;
  /** Aprova um documento `submitted` (sem validar nada: quem valida é o adaptador) e aplica N4. */
  approveDocument(record: MockDocumentRecord, expiresOn: string | undefined): VerificationStatus;
  /** Recusa um documento `submitted` com um motivo do catálogo. */
  rejectDocument(record: MockDocumentRecord, rejection: DocumentRejection, internalNote: string | undefined): VerificationStatus;
}

export function createDocumentStore(options: DocumentStoreOptions = {}): DocumentStore {
  const clock = options.clock ?? Date.now;
  let counter = 0;
  const nextId = options.nextId ?? (() => `mock-doc-${++counter}`);
  const settings: MockDocumentSettings = { reviewSlaHours: 48, vehicleMaxAgeYears: 10, ...options.settings };
  const requirements = options.requirements ?? PROVISIONAL_REQUIREMENTS;
  const rejectionReasons = options.rejectionReasons ?? PROVISIONAL_REJECTION_REASONS;
  const externalPlates = new Set((options.platesInUse ?? ['ABC1D23']).map(normalizePlate));

  const drivers = new Map<string, MockDriverRecord>();
  const documents = new Map<string, MockDocumentRecord>();
  const objects = new Map<string, { readonly sizeBytes: number; readonly sha256: string }>();
  const audit: MockAuditEntry[] = [];

  function latestDocument(driverId: string, typeCode: string): MockDocumentRecord | undefined {
    let latest: MockDocumentRecord | undefined;
    for (const record of documents.values()) {
      if (record.driverId !== driverId || record.typeCode !== typeCode || record.state === 'pending_upload') continue;
      if (!latest || (record.submittedAtMs ?? 0) >= (latest.submittedAtMs ?? 0)) latest = record;
    }
    return latest;
  }

  function facts(driverId: string): VerificationFacts {
    const driver = drivers.get(driverId);
    if (!driver) {
      return { linked: false, accountStatus: 'pending_review', profileSubmitted: false, vehicleRegistered: false, requirements: [] };
    }
    return {
      linked: true,
      accountStatus: driver.accountStatus,
      profileSubmitted: driver.profile !== undefined,
      vehicleRegistered: driver.vehicle !== undefined,
      requirements: requirements.map((requirement) => {
        const latest = latestDocument(driverId, requirement.typeCode);
        return latest && latest.state !== 'pending_upload'
          ? { required: requirement.required, documentStatus: latest.state }
          : { required: requirement.required };
      }),
    };
  }

  const store: DocumentStore = {
    clock,
    nextId,
    settings,
    requirements,
    rejectionReasons,
    drivers,
    documents,
    objects,
    audit,
    requirement: (typeCode) => requirements.find((requirement) => requirement.typeCode === typeCode),
    latestDocument,
    isPlateInUse(plate, exceptDriverId) {
      const normalized = normalizePlate(plate);
      if (externalPlates.has(normalized)) return true;
      for (const driver of drivers.values()) {
        if (driver.driverId !== exceptDriverId && driver.vehicle && normalizePlate(driver.vehicle.plate) === normalized) return true;
      }
      return false;
    },
    facts,
    status: (driverId) => deriveVerificationStatus(facts(driverId)),
    reviewDeadlineMs: (submittedAtMs) => submittedAtMs + settings.reviewSlaHours * 60 * 60 * 1000,
    applyAutoApproval(driverId) {
      const driver = drivers.get(driverId);
      if (driver && isReadyForApproval(facts(driverId))) driver.accountStatus = 'approved';
      return deriveVerificationStatus(facts(driverId));
    },
    today: () => natalCalendarDate(clock()),
    sweepExpired() {
      const today = natalCalendarDate(clock());
      for (const record of documents.values()) {
        if (record.state === 'approved' && record.expiresOn !== undefined && record.expiresOn < today) record.state = 'expired';
      }
    },
    approveDocument(record, expiresOn) {
      record.state = 'approved';
      record.reviewedAtMs = clock();
      if (expiresOn !== undefined) record.expiresOn = expiresOn;
      return store.applyAutoApproval(record.driverId);
    },
    rejectDocument(record, rejection, internalNote) {
      record.state = 'rejected';
      record.reviewedAtMs = clock();
      record.rejection = rejection;
      if (internalNote !== undefined) record.internalNote = internalNote;
      return deriveVerificationStatus(facts(record.driverId));
    },
  };

  if (options.seed === 'demo') seedDemo(store);
  return store;
}

const DEMO_SHA = '0'.repeat(64);

function seedDemo(store: DocumentStore): void {
  const now = store.clock();
  const hour = 60 * 60 * 1000;
  const profile = (cpf: string): MockDriverProfile => ({
    cpf,
    birthDate: '1990-05-10',
    address: { street: 'Rua Exemplo', number: '100', neighborhood: 'Lagoa Nova', city: 'Natal', state: 'RN', postalCode: '59000000' },
    cnh: { number: '00000000000', category: 'B', expiresOn: '2030-01-01', ear: true },
  });
  const addDriver = (driverId: string, fullName: string, plate: string, cpf: string): MockDriverRecord => {
    const record: MockDriverRecord = {
      driverId,
      fullName,
      email: `${driverId}@exemplo.invalid`,
      applicationId: `app-${driverId}`,
      accountStatus: 'pending_review',
      profile: profile(cpf),
      vehicle: { vehicleId: `veh-${driverId}`, plate, brand: 'Marca', model: 'Modelo', year: 2020, color: 'Prata' },
    };
    store.drivers.set(driverId, record);
    return record;
  };
  const addDocument = (driverId: string, typeCode: string, state: DriverDocumentStatus, submittedAgoHours: number, extra: Partial<MockDocumentRecord> = {}): void => {
    const id = `${driverId}-${typeCode}`;
    const submittedAtMs = now - submittedAgoHours * hour;
    store.documents.set(id, {
      id,
      driverId,
      typeCode,
      contentType: 'image/jpeg',
      sizeBytes: 250_000,
      sha256: DEMO_SHA,
      createdAtMs: submittedAtMs,
      uploadExpiresAtMs: submittedAtMs + 300_000,
      state,
      submittedAtMs,
      ...(state === 'submitted' ? {} : { reviewedAtMs: submittedAtMs + hour }),
      ...extra,
    });
    store.objects.set(id, { sizeBytes: 250_000, sha256: DEMO_SHA });
  };

  // 1) Em análise, um documento com o prazo já vencido (a fila destaca).
  addDriver('demo-ana', 'Ana Exemplo', 'QWE1A23', '52998224725');
  addDocument('demo-ana', 'cnh', 'submitted', store.settings.reviewSlaHours + 5);
  addDocument('demo-ana', 'crlv', 'submitted', 3);
  addDocument('demo-ana', 'antecedentes', 'submitted', 2);
  addDocument('demo-ana', 'inss', 'submitted', 2);
  addDocument('demo-ana', 'foto_perfil', 'submitted', 1);

  // 2) Correção pedida num documento, os outros aprovados.
  addDriver('demo-bruno', 'Bruno Exemplo', 'RTY2B34', '11144477735');
  addDocument('demo-bruno', 'cnh', 'rejected', 30, {
    rejection: store.rejectionReasons[0] ?? { code: 'illegible', text: 'Documento ilegível.' },
    internalNote: 'Foto com reflexo no número.',
  });
  for (const typeCode of ['crlv', 'antecedentes']) addDocument('demo-bruno', typeCode, 'approved', 30, { expiresOn: '2027-06-30' });
  for (const typeCode of ['inss', 'foto_perfil']) addDocument('demo-bruno', typeCode, 'approved', 30);

  // 3) Aprovado.
  const carla = addDriver('demo-carla', 'Carla Exemplo', 'UIO3C45', '39053344705');
  for (const typeCode of ['cnh', 'crlv', 'antecedentes']) addDocument('demo-carla', typeCode, 'approved', 200, { expiresOn: '2027-12-31' });
  for (const typeCode of ['inss', 'foto_perfil']) addDocument('demo-carla', typeCode, 'approved', 200);
  carla.accountStatus = 'approved';
}
