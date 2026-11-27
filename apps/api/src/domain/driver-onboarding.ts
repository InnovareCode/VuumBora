/**
 * Regras puras do cadastro do motorista no servidor (fatia D4 do `docs/plano-m3-m4.md`; contrato K0 em
 * `packages/api-client/src/driver/onboarding-types.ts`). Sem I/O.
 *
 * Por que repete regras de `@vuumbora/domain/driver`: `apps/api` é standalone (o Dockerfile só copia `apps/api`). As
 * regras abaixo espelham as de lá e as restrições da 0024; quando divergirem, vale a MAIS ESTRITA (a do banco), e o
 * mock do `api-client` é alinhado a ela.
 *
 * Validar aqui, ANTES do SQL, é o que faz da restrição do banco a última linha de defesa e não o caminho normal: a
 * violação de CHECK/índice único leva a linha inteira (CPF, CNH, endereço) ao log do Postgres (revisão M3-D1).
 */
import { checkBirthDate, todayInBusinessZone } from './birth-date.js';

/** Cidade de operação. Fixada NO SERVIDOR: nunca vem do cliente (vínculo N3). */
export const DRIVER_CITY_CODE = 'natal';

export const DOCUMENT_CONTENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type DocumentContentType = (typeof DOCUMENT_CONTENT_TYPES)[number];
const EXTENSION_BY_CONTENT_TYPE: Readonly<Record<DocumentContentType, string>> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };

export const CNH_CATEGORIES = ['B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'] as const;
export type CnhCategory = (typeof CNH_CATEGORIES)[number];

/** Estado do cadastro como o APP vê (`GET /v1/driver/verification`). Espelha `VerificationStatus` do domínio. */
export type VerificationStatus = 'not_started' | 'pending_documents' | 'under_review' | 'changes_requested' | 'approved' | 'suspended';
/** Estado de um documento como sai para o app. `awaiting_upload`, `superseded` e `withdrawn` nunca saem. */
export type DriverDocumentStatus = 'submitted' | 'approved' | 'rejected' | 'expired';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Caractere de controle (C0, DEL, C1). O Postgres recusa `\u0000` em texto (22021), o que viraria 503 em vez de 400; os
 * demais não têm lugar em nome de rua, marca ou tipo de documento (revisão M3-D3/D4, S-5).
 */
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;

export function hasControlCharacter(value: string): boolean {
  return CONTROL_CHARACTER.test(value);
}

/** Texto com 1..max caracteres depois do trim, sem caractere de controle. Devolve o texto aparado ou `null`. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string' || hasControlCharacter(value)) return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= max ? trimmed : null;
}

/** `AAAA-MM-DD` que existe no calendário. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// ---------------------------------------------------------------------------------------------------------------------
// CPF (mesma conta de `is_valid_cpf` da 0024 e de `isValidCpf` do domínio)
// ---------------------------------------------------------------------------------------------------------------------

export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, '');
}

function checkDigit(digits: readonly number[], length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i++) sum += (digits[i] ?? 0) * (length + 1 - i);
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

/** CPF com 11 algarismos (máscara opcional), sem sequência repetida, com os dígitos verificadores certos. */
export function isValidCpf(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 20 || !/^[0-9.\-\s]+$/.test(value)) return false;
  const normalized = normalizeCpf(value);
  if (normalized.length !== 11 || /^(\d)\1{10}$/.test(normalized)) return false;
  const digits = [...normalized].map(Number);
  return checkDigit(digits, 9) === digits[9] && checkDigit(digits, 10) === digits[10];
}

// ---------------------------------------------------------------------------------------------------------------------
// Etapa 2 (PUT /v1/driver/onboarding)
// ---------------------------------------------------------------------------------------------------------------------

export interface OnboardingInput {
  /** Como veio (a regra do CPF é conferida DEPOIS do vínculo: ordem do contrato). */
  readonly rawCpf: string;
  readonly birthDate: string;
  readonly address: {
    readonly street: string;
    readonly number: string;
    readonly complement: string | null;
    readonly neighborhood: string;
    readonly city: string;
    readonly state: string;
    readonly postalCode: string;
  };
  readonly cnh: { readonly number: string; readonly category: CnhCategory; readonly expiresOn: string; readonly ear: boolean };
}

/**
 * A FORMA do corpo da etapa 2 (`400 invalid_body`). Limites = os CHECKs de `drivers` (0024). Complemento vazio vira
 * ausente. A data de nascimento segue a regra do cadastro (18 anos completos, `birth-date.ts`); fora dela, 400.
 */
export function parseOnboardingBody(body: unknown, now: Date = new Date()): OnboardingInput | null {
  if (!isRecord(body) || !isRecord(body['address']) || !isRecord(body['cnh'])) return null;
  const address = body['address'];
  const cnh = body['cnh'];
  if (typeof body['cpf'] !== 'string' || body['cpf'].length > 40) return null;
  const birthDate = body['birthDate'];
  if (!isCalendarDate(birthDate) || !checkBirthDate(birthDate, now).ok) return null;

  const street = text(address['street'], 120);
  const number = text(address['number'], 20);
  const rawComplement = address['complement'];
  const complementAbsent = rawComplement === undefined || rawComplement === null || (typeof rawComplement === 'string' && rawComplement.trim() === '');
  const complement = complementAbsent ? null : text(rawComplement, 60);
  if (!complementAbsent && complement === null) return null;
  const neighborhood = text(address['neighborhood'], 80);
  const city = text(address['city'], 80);
  const state = typeof address['state'] === 'string' && /^[A-Z]{2}$/.test(address['state']) ? address['state'] : null;
  const postalCode = typeof address['postalCode'] === 'string' && /^\d{8}$/.test(address['postalCode']) ? address['postalCode'] : null;
  if (street === null || number === null || neighborhood === null || city === null || state === null || postalCode === null) return null;

  const cnhNumber = typeof cnh['number'] === 'string' && /^\d{11}$/.test(cnh['number']) ? cnh['number'] : null;
  const category = typeof cnh['category'] === 'string' && (CNH_CATEGORIES as readonly string[]).includes(cnh['category']) ? (cnh['category'] as CnhCategory) : null;
  const expiresOn = isCalendarDate(cnh['expiresOn']) ? cnh['expiresOn'] : null;
  const ear = typeof cnh['ear'] === 'boolean' ? cnh['ear'] : null;
  if (cnhNumber === null || category === null || expiresOn === null || ear === null) return null;

  return {
    rawCpf: body['cpf'],
    birthDate,
    address: { street, number, complement, neighborhood, city, state, postalCode },
    cnh: { number: cnhNumber, category, expiresOn, ear },
  };
}

/** Regras de negócio da etapa 2, na ordem do contrato (DEPOIS de `driver_not_linked`). */
export function onboardingRuleProblem(input: OnboardingInput): 'invalid_cpf' | 'cnh_without_ear' | null {
  if (!isValidCpf(input.rawCpf)) return 'invalid_cpf';
  if (!input.cnh.ear) return 'cnh_without_ear';
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Veículo (PUT /v1/driver/vehicle)
// ---------------------------------------------------------------------------------------------------------------------

export interface VehicleInput {
  readonly plate: string;
  readonly brand: string;
  readonly model: string;
  readonly year: number;
  readonly color: string;
}

/** Placa sem traço nem espaço, em maiúsculas. */
export function normalizePlate(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

/** Ano corrente em Natal (o "hoje" do negócio). */
export function currentBusinessYear(now: Date = new Date()): number {
  return Number(todayInBusinessZone(now).slice(0, 4));
}

/** A forma do corpo do veículo (`400 invalid_body`). Limites = CHECKs de `vehicles` (0024); ano 1950..ano seguinte. */
export function parseVehicleBody(body: unknown, currentYear: number): VehicleInput | null {
  if (!isRecord(body)) return null;
  const plate = typeof body['plate'] === 'string' && body['plate'].length <= 12 ? normalizePlate(body['plate']) : null;
  if (plate === null || !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) return null;
  const brand = text(body['brand'], 40);
  const model = text(body['model'], 60);
  const color = text(body['color'], 30);
  const year = body['year'];
  if (brand === null || model === null || color === null) return null;
  if (typeof year !== 'number' || !Number.isInteger(year) || year < 1950 || year > currentYear + 1) return null;
  return { plate, brand, model, year, color };
}

/** Idade = ano corrente − ano do veículo; passa do limite quando é MAIOR que a idade máxima (`422 vehicle_too_old`). */
export function isVehicleTooOld(year: number, maxAgeYears: number, currentYear: number): boolean {
  return currentYear - year > maxAgeYears;
}

// ---------------------------------------------------------------------------------------------------------------------
// Envio de documento (POST /v1/driver/documents/upload-url)
// ---------------------------------------------------------------------------------------------------------------------

export interface UploadRequestInput {
  readonly typeCode: string;
  readonly contentType: DocumentContentType;
  readonly sizeBytes: number;
  readonly sha256: string;
}

/** Forma (`400 invalid_body`) e tamanho (`413 file_too_large`), nesta ordem. O tipo é conferido na lista vigente, depois. */
export function parseUploadRequest(body: unknown, maxSizeBytes: number): { ok: true; value: UploadRequestInput } | { ok: false; code: 'invalid_body' | 'file_too_large' } {
  if (!isRecord(body)) return { ok: false, code: 'invalid_body' };
  const { typeCode, contentType, sizeBytes, sha256 } = body;
  if (typeof typeCode !== 'string' || typeCode.trim().length === 0 || typeCode.length > 64 || hasControlCharacter(typeCode)) return { ok: false, code: 'invalid_body' };
  if (typeof contentType !== 'string' || !(DOCUMENT_CONTENT_TYPES as readonly string[]).includes(contentType)) return { ok: false, code: 'invalid_body' };
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return { ok: false, code: 'invalid_body' };
  if (typeof sizeBytes !== 'number' || !Number.isInteger(sizeBytes) || sizeBytes <= 0) return { ok: false, code: 'invalid_body' };
  if (sizeBytes > maxSizeBytes) return { ok: false, code: 'file_too_large' };
  return { ok: true, value: { typeCode, contentType: contentType as DocumentContentType, sizeBytes, sha256 } };
}

export function extensionFor(contentType: DocumentContentType): string {
  return EXTENSION_BY_CONTENT_TYPE[contentType];
}

/** Chave do objeto: SEMPRE sob o prefixo do próprio motorista (CHECK `driver_documents_storage_key_owner`, 0025). */
export function documentStorageKey(driverId: string, documentId: string, contentType: DocumentContentType): string {
  return `driver-docs/${driverId}/${documentId}.${extensionFor(contentType)}`;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// ---------------------------------------------------------------------------------------------------------------------
// Verificação (GET /v1/driver/verification) — mesma derivação de `deriveVerificationStatus` do domínio
// ---------------------------------------------------------------------------------------------------------------------

export interface VerificationFacts {
  readonly linked: boolean;
  readonly accountStatus: 'pending_review' | 'approved' | 'suspended';
  readonly profileSubmitted: boolean;
  readonly vehicleRegistered: boolean;
  readonly requirements: readonly { readonly required: boolean; readonly documentStatus?: DriverDocumentStatus | undefined }[];
}

/** Precedência: not_started → suspended → approved → changes_requested → pending_documents → under_review. */
export function deriveVerificationStatus(facts: VerificationFacts): VerificationStatus {
  if (!facts.linked) return 'not_started';
  if (facts.accountStatus === 'suspended') return 'suspended';
  if (facts.accountStatus === 'approved') return 'approved';
  const required = facts.requirements.filter((requirement) => requirement.required);
  if (required.some((requirement) => requirement.documentStatus === 'rejected')) return 'changes_requested';
  const missing = required.some((requirement) => requirement.documentStatus === undefined || requirement.documentStatus === 'expired');
  if (!facts.profileSubmitted || !facts.vehicleRegistered || missing) return 'pending_documents';
  return 'under_review';
}

// ---------------------------------------------------------------------------------------------------------------------
// Disponibilidade (PUT /v1/driver/availability)
// ---------------------------------------------------------------------------------------------------------------------

export interface AvailabilityInput {
  readonly online: boolean;
  readonly point: { readonly latitude: number; readonly longitude: number } | null;
}

/** `online` booleano; ao LIGAR, `point` com latitude e longitude válidas (`400 invalid_body` sem ele). */
export function parseAvailabilityBody(body: unknown): AvailabilityInput | null {
  if (!isRecord(body) || typeof body['online'] !== 'boolean') return null;
  const rawPoint = body['point'];
  let point: AvailabilityInput['point'] = null;
  if (rawPoint !== undefined && rawPoint !== null) {
    if (!isRecord(rawPoint)) return null;
    const { latitude, longitude } = rawPoint;
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    point = { latitude, longitude };
  }
  if (body['online'] && point === null) return null;
  return { online: body['online'], point };
}

/**
 * Os bloqueios de `driver_availability_blockers()` (0025) → o `code` do 409. Status do motorista (não aprovado,
 * suspenso, excluído, sem vínculo) vence; depois, documento obrigatório vencido dá `document_expired`; qualquer outra
 * pendência (etapa 2, veículo, documento faltando) é `driver_not_approved`. `null` = pode ficar online.
 */
export function availabilityConflict(blockers: readonly string[]): 'driver_not_approved' | 'document_expired' | null {
  if (blockers.length === 0) return null;
  const statusBlockers = new Set(['driver_not_approved', 'driver_suspended', 'driver_deleted', 'driver_not_found']);
  if (blockers.some((blocker) => statusBlockers.has(blocker))) return 'driver_not_approved';
  if (blockers.includes('document_expired')) return 'document_expired';
  return 'driver_not_approved';
}
