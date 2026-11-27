import {
  CNH_CATEGORIES,
  DRIVER_DOCUMENT_STATUSES,
  DRIVER_VERIFICATION_STATUSES,
  type AdminDriverDetail,
  type AdminDriverDocument,
  type CnhCategory,
  type DocumentDecision,
  type DocumentRejection,
  type DocumentReviewQueueItem,
  type DocumentReviewQueuePage,
  type DocumentViewUrl,
  type DriverAddress,
  type DriverCnh,
  type DriverDocumentStatus,
  type DriverSuspension,
  type DriverVerificationStatus,
} from './documentReviewTypes';

/**
 * Validação das respostas da fila de documentos (D7) — mesmo padrão autocontido de
 * `adminUserResponses.ts`. FALHA FECHADA: formato fora do contrato nunca vira dado na tela, vira
 * `contract_mismatch` (ver `createHttpDocumentReviewAdapter`).
 *
 * O `reason` de falha vai para o console. Por isso ele NUNCA carrega VALOR, só nome de campo e TIPO
 * (`typeOf` diz "texto", nunca o texto): a URL assinada de um documento, o CPF ou o nome do motorista
 * não podem acabar num log (aceite da D7).
 */

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

type Obj = Readonly<Record<string, unknown>>;

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = (reason: string): { readonly ok: false; readonly reason: string } => ({ ok: false, reason });

function isRecord(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function typeOf(value: unknown): string {
  if (value === undefined) return 'ausente';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'lista';
  if (value === '') return 'texto vazio';
  return typeof value === 'string' ? 'texto' : typeof value;
}

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function text(source: Obj, name: string): Parsed<string> {
  const value = source[name];
  return typeof value === 'string' && value.length > 0 ? ok(value) : fail(`campo "${name}": esperado texto, veio ${typeOf(value)}`);
}

/** Opcional: ausente (ou `null`) = sem valor; presente tem de ser texto não vazio. */
function optionalText(source: Obj, name: string): Parsed<string | undefined> {
  const value = source[name];
  if (value === undefined || value === null) return ok(undefined);
  return typeof value === 'string' && value.length > 0 ? ok(value) : fail(`campo "${name}": esperado texto ou ausente, veio ${typeOf(value)}`);
}

function integer(source: Obj, name: string): Parsed<number> {
  const value = source[name];
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? ok(value)
    : fail(`campo "${name}": esperado inteiro não negativo, veio ${typeOf(value)}`);
}

function bool(source: Obj, name: string): Parsed<boolean> {
  const value = source[name];
  return typeof value === 'boolean' ? ok(value) : fail(`campo "${name}": esperado booleano, veio ${typeOf(value)}`);
}

function object(source: Obj, name: string): Parsed<Obj> {
  const value = source[name];
  return isRecord(value) ? ok(value) : fail(`campo "${name}": esperado objeto, veio ${typeOf(value)}`);
}

function documentStatus(source: Obj, name: string): Parsed<DriverDocumentStatus> {
  const value = source[name];
  return oneOf(DRIVER_DOCUMENT_STATUSES, value) ? ok(value) : fail(`campo "${name}": estado de documento desconhecido (${typeOf(value)})`);
}

function verificationStatus(source: Obj, name: string): Parsed<DriverVerificationStatus> {
  const value = source[name];
  return oneOf(DRIVER_VERIFICATION_STATUSES, value) ? ok(value) : fail(`campo "${name}": estado de cadastro desconhecido (${typeOf(value)})`);
}

function parseRejection(raw: unknown, what: string): Parsed<DocumentRejection> {
  if (!isRecord(raw)) return fail(`${what}: esperado objeto, veio ${typeOf(raw)}`);
  const code = text(raw, 'code');
  if (!code.ok) return fail(`${what}: ${code.reason}`);
  const message = text(raw, 'text');
  if (!message.ok) return fail(`${what}: ${message.reason}`);
  return ok({ code: code.value, text: message.value });
}

function parseQueueItem(raw: unknown, what: string): Parsed<DocumentReviewQueueItem> {
  if (!isRecord(raw)) return fail(`${what}: esperado objeto, veio ${typeOf(raw)}`);
  const documentId = text(raw, 'documentId');
  if (!documentId.ok) return fail(`${what}: ${documentId.reason}`);
  const driverId = text(raw, 'driverId');
  if (!driverId.ok) return fail(`${what}: ${driverId.reason}`);
  const driverName = text(raw, 'driverName');
  if (!driverName.ok) return fail(`${what}: ${driverName.reason}`);
  const typeCode = text(raw, 'typeCode');
  if (!typeCode.ok) return fail(`${what}: ${typeCode.reason}`);
  const typeLabel = text(raw, 'typeLabel');
  if (!typeLabel.ok) return fail(`${what}: ${typeLabel.reason}`);
  const status = documentStatus(raw, 'status');
  if (!status.ok) return fail(`${what}: ${status.reason}`);
  const submittedAt = text(raw, 'submittedAt');
  if (!submittedAt.ok) return fail(`${what}: ${submittedAt.reason}`);
  const reviewDeadline = text(raw, 'reviewDeadline');
  if (!reviewDeadline.ok) return fail(`${what}: ${reviewDeadline.reason}`);
  const overdue = bool(raw, 'overdue');
  if (!overdue.ok) return fail(`${what}: ${overdue.reason}`);
  return ok({
    documentId: documentId.value,
    driverId: driverId.value,
    driverName: driverName.value,
    typeCode: typeCode.value,
    typeLabel: typeLabel.value,
    status: status.value,
    submittedAt: submittedAt.value,
    reviewDeadline: reviewDeadline.value,
    overdue: overdue.value,
  });
}

/** `GET /document-reviews`: `{ items, nextCursor? }`. `nextCursor: null` vale como "não há mais" (convenção das outras listas do painel). */
export function parseDocumentReviewQueueResponse(raw: unknown): Parsed<DocumentReviewQueuePage> {
  if (!isRecord(raw)) return fail(`fila de documentos: esperado objeto, veio ${typeOf(raw)}`);
  const items = raw['items'];
  if (!Array.isArray(items)) return fail(`fila de documentos: campo "items": esperado lista, veio ${typeOf(items)}`);
  const parsed: DocumentReviewQueueItem[] = [];
  for (const [index, item] of items.entries()) {
    const one = parseQueueItem(item, `fila de documentos, item ${index}`);
    if (!one.ok) return one;
    parsed.push(one.value);
  }
  const nextCursor = optionalText(raw, 'nextCursor');
  if (!nextCursor.ok) return fail(`fila de documentos: ${nextCursor.reason}`);
  return ok({ items: parsed, ...(nextCursor.value !== undefined ? { nextCursor: nextCursor.value } : {}) });
}

function parseAddress(raw: Obj): Parsed<DriverAddress> {
  const street = text(raw, 'street');
  if (!street.ok) return street;
  const number = text(raw, 'number');
  if (!number.ok) return number;
  const complement = optionalText(raw, 'complement');
  if (!complement.ok) return complement;
  const neighborhood = text(raw, 'neighborhood');
  if (!neighborhood.ok) return neighborhood;
  const city = text(raw, 'city');
  if (!city.ok) return city;
  const state = text(raw, 'state');
  if (!state.ok) return state;
  const postalCode = text(raw, 'postalCode');
  if (!postalCode.ok) return postalCode;
  return ok({
    street: street.value,
    number: number.value,
    ...(complement.value !== undefined ? { complement: complement.value } : {}),
    neighborhood: neighborhood.value,
    city: city.value,
    state: state.value,
    postalCode: postalCode.value,
  });
}

function parseCnh(raw: Obj): Parsed<DriverCnh> {
  const number = text(raw, 'number');
  if (!number.ok) return number;
  const category = raw['category'];
  if (!oneOf<CnhCategory>(CNH_CATEGORIES, category)) return fail(`campo "category": categoria de CNH desconhecida (${typeOf(category)})`);
  const expiresOn = text(raw, 'expiresOn');
  if (!expiresOn.ok) return expiresOn;
  const ear = bool(raw, 'ear');
  if (!ear.ok) return ear;
  return ok({ number: number.value, category, expiresOn: expiresOn.value, ear: ear.value });
}

function parseProfile(raw: unknown): Parsed<NonNullable<AdminDriverDetail['profile']>> {
  if (!isRecord(raw)) return fail(`esperado objeto, veio ${typeOf(raw)}`);
  const cpf = text(raw, 'cpf');
  if (!cpf.ok) return cpf;
  const birthDate = text(raw, 'birthDate');
  if (!birthDate.ok) return birthDate;
  const addressRaw = object(raw, 'address');
  if (!addressRaw.ok) return addressRaw;
  const address = parseAddress(addressRaw.value);
  if (!address.ok) return fail(`endereço: ${address.reason}`);
  const cnhRaw = object(raw, 'cnh');
  if (!cnhRaw.ok) return cnhRaw;
  const cnh = parseCnh(cnhRaw.value);
  if (!cnh.ok) return fail(`CNH: ${cnh.reason}`);
  return ok({ cpf: cpf.value, birthDate: birthDate.value, address: address.value, cnh: cnh.value });
}

function parseVehicle(raw: unknown): Parsed<NonNullable<AdminDriverDetail['vehicle']>> {
  if (!isRecord(raw)) return fail(`esperado objeto, veio ${typeOf(raw)}`);
  const vehicleId = text(raw, 'vehicleId');
  if (!vehicleId.ok) return vehicleId;
  const plate = text(raw, 'plate');
  if (!plate.ok) return plate;
  const brand = text(raw, 'brand');
  if (!brand.ok) return brand;
  const model = text(raw, 'model');
  if (!model.ok) return model;
  const year = integer(raw, 'year');
  if (!year.ok) return year;
  const color = text(raw, 'color');
  if (!color.ok) return color;
  return ok({ vehicleId: vehicleId.value, plate: plate.value, brand: brand.value, model: model.value, year: year.value, color: color.value });
}

function parseDriverDocument(raw: unknown, what: string): Parsed<AdminDriverDocument> {
  if (!isRecord(raw)) return fail(`${what}: esperado objeto, veio ${typeOf(raw)}`);
  // Um documento com URL embutida é contrato quebrado de propósito: a URL só existe no clique (`view-url`, auditado).
  if ('url' in raw || 'viewUrl' in raw) return fail(`${what}: trouxe URL de arquivo (só pode vir de view-url)`);
  const documentId = text(raw, 'documentId');
  if (!documentId.ok) return fail(`${what}: ${documentId.reason}`);
  const typeCode = text(raw, 'typeCode');
  if (!typeCode.ok) return fail(`${what}: ${typeCode.reason}`);
  const typeLabel = text(raw, 'typeLabel');
  if (!typeLabel.ok) return fail(`${what}: ${typeLabel.reason}`);
  const status = documentStatus(raw, 'status');
  if (!status.ok) return fail(`${what}: ${status.reason}`);
  const contentType = text(raw, 'contentType');
  if (!contentType.ok) return fail(`${what}: ${contentType.reason}`);
  const sizeBytes = integer(raw, 'sizeBytes');
  if (!sizeBytes.ok) return fail(`${what}: ${sizeBytes.reason}`);
  const submittedAt = text(raw, 'submittedAt');
  if (!submittedAt.ok) return fail(`${what}: ${submittedAt.reason}`);
  const reviewedAt = optionalText(raw, 'reviewedAt');
  if (!reviewedAt.ok) return fail(`${what}: ${reviewedAt.reason}`);
  const expiresOn = optionalText(raw, 'expiresOn');
  if (!expiresOn.ok) return fail(`${what}: ${expiresOn.reason}`);
  const internalNote = optionalText(raw, 'internalNote');
  if (!internalNote.ok) return fail(`${what}: ${internalNote.reason}`);
  let rejection: DocumentRejection | undefined;
  if (raw['rejection'] !== undefined && raw['rejection'] !== null) {
    const parsed = parseRejection(raw['rejection'], `${what}, campo "rejection"`);
    if (!parsed.ok) return parsed;
    rejection = parsed.value;
  }
  return ok({
    documentId: documentId.value,
    typeCode: typeCode.value,
    typeLabel: typeLabel.value,
    status: status.value,
    contentType: contentType.value,
    sizeBytes: sizeBytes.value,
    submittedAt: submittedAt.value,
    ...(reviewedAt.value !== undefined ? { reviewedAt: reviewedAt.value } : {}),
    ...(expiresOn.value !== undefined ? { expiresOn: expiresOn.value } : {}),
    ...(rejection ? { rejection } : {}),
    ...(internalNote.value !== undefined ? { internalNote: internalNote.value } : {}),
  });
}

/** `GET /drivers/:id`. */
export function parseAdminDriverDetailResponse(raw: unknown): Parsed<AdminDriverDetail> {
  if (!isRecord(raw)) return fail(`motorista: esperado objeto, veio ${typeOf(raw)}`);
  const driverId = text(raw, 'driverId');
  if (!driverId.ok) return fail(`motorista: ${driverId.reason}`);
  const fullName = text(raw, 'fullName');
  if (!fullName.ok) return fail(`motorista: ${fullName.reason}`);
  const email = text(raw, 'email');
  if (!email.ok) return fail(`motorista: ${email.reason}`);
  const applicationId = text(raw, 'applicationId');
  if (!applicationId.ok) return fail(`motorista: ${applicationId.reason}`);
  const status = verificationStatus(raw, 'status');
  if (!status.ok) return fail(`motorista: ${status.reason}`);

  let profile: AdminDriverDetail['profile'];
  if (raw['profile'] !== undefined && raw['profile'] !== null) {
    const parsed = parseProfile(raw['profile']);
    if (!parsed.ok) return fail(`motorista, campo "profile": ${parsed.reason}`);
    profile = parsed.value;
  }
  let vehicle: AdminDriverDetail['vehicle'];
  if (raw['vehicle'] !== undefined && raw['vehicle'] !== null) {
    const parsed = parseVehicle(raw['vehicle']);
    if (!parsed.ok) return fail(`motorista, campo "vehicle": ${parsed.reason}`);
    vehicle = parsed.value;
  }
  let suspension: AdminDriverDetail['suspension'];
  if (raw['suspension'] !== undefined && raw['suspension'] !== null) {
    const suspensionRaw = raw['suspension'];
    if (!isRecord(suspensionRaw)) return fail(`motorista, campo "suspension": esperado objeto, veio ${typeOf(suspensionRaw)}`);
    const reason = text(suspensionRaw, 'reason');
    if (!reason.ok) return fail(`motorista, campo "suspension": ${reason.reason}`);
    const suspendedAt = text(suspensionRaw, 'suspendedAt');
    if (!suspendedAt.ok) return fail(`motorista, campo "suspension": ${suspendedAt.reason}`);
    suspension = { reason: reason.value, suspendedAt: suspendedAt.value };
  }

  const documentsRaw = raw['documents'];
  if (!Array.isArray(documentsRaw)) return fail(`motorista: campo "documents": esperado lista, veio ${typeOf(documentsRaw)}`);
  const documents: AdminDriverDocument[] = [];
  for (const [index, item] of documentsRaw.entries()) {
    const one = parseDriverDocument(item, `motorista, documento ${index}`);
    if (!one.ok) return one;
    documents.push(one.value);
  }

  return ok({
    driverId: driverId.value,
    fullName: fullName.value,
    email: email.value,
    applicationId: applicationId.value,
    status: status.value,
    ...(profile ? { profile } : {}),
    ...(vehicle ? { vehicle } : {}),
    ...(suspension ? { suspension } : {}),
    documents,
  });
}

/**
 * Só `https:` — e `http:` apenas em `localhost`/`127.0.0.1` (adaptador local de armazenamento da D3, em
 * desenvolvimento). `javascript:`, `data:`, `blob:` e qualquer outro esquema vindo da API viram
 * `contract_mismatch`: a URL vai parar num `<img src>`/`<a href>`.
 */
function isAllowedDocumentUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol === 'https:') return true;
  return parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
}

/** `POST /documents/:id/view-url`. O motivo de falha nunca inclui a URL. */
export function parseDocumentViewUrlResponse(raw: unknown): Parsed<DocumentViewUrl> {
  if (!isRecord(raw)) return fail(`link do documento: esperado objeto, veio ${typeOf(raw)}`);
  const url = raw['url'];
  if (typeof url !== 'string' || url.length === 0) return fail(`link do documento: campo "url": esperado texto, veio ${typeOf(url)}`);
  if (!isAllowedDocumentUrl(url)) return fail('link do documento: campo "url": esquema ou endereço não permitido');
  const expiresAt = text(raw, 'expiresAt');
  if (!expiresAt.ok) return fail(`link do documento: ${expiresAt.reason}`);
  if (Number.isNaN(Date.parse(expiresAt.value))) return fail('link do documento: campo "expiresAt": data inválida');
  return ok({ url, expiresAt: expiresAt.value });
}

/** `POST /documents/:id/approve` e `/reject`. */
export function parseDocumentDecisionResponse(raw: unknown): Parsed<DocumentDecision> {
  if (!isRecord(raw)) return fail(`decisão: esperado objeto, veio ${typeOf(raw)}`);
  const documentId = text(raw, 'documentId');
  if (!documentId.ok) return fail(`decisão: ${documentId.reason}`);
  const status = raw['status'];
  if (status !== 'approved' && status !== 'rejected') return fail(`decisão: campo "status": esperado approved ou rejected (${typeOf(status)})`);
  const reviewedAt = text(raw, 'reviewedAt');
  if (!reviewedAt.ok) return fail(`decisão: ${reviewedAt.reason}`);
  const expiresOn = optionalText(raw, 'expiresOn');
  if (!expiresOn.ok) return fail(`decisão: ${expiresOn.reason}`);
  const driverStatus = verificationStatus(raw, 'driverStatus');
  if (!driverStatus.ok) return fail(`decisão: ${driverStatus.reason}`);
  let rejection: DocumentRejection | undefined;
  if (raw['rejection'] !== undefined && raw['rejection'] !== null) {
    const parsed = parseRejection(raw['rejection'], 'decisão, campo "rejection"');
    if (!parsed.ok) return parsed;
    rejection = parsed.value;
  }
  if (status === 'rejected' && !rejection) return fail('decisão: recusa sem campo "rejection"');
  return ok({
    documentId: documentId.value,
    status,
    reviewedAt: reviewedAt.value,
    ...(expiresOn.value !== undefined ? { expiresOn: expiresOn.value } : {}),
    ...(rejection ? { rejection } : {}),
    driverStatus: driverStatus.value,
  });
}

/** `GET /document-rejection-reasons`: a lista (o `data` do envelope É a lista). Catálogo vazio é contrato quebrado. */
export function parseRejectionReasonsResponse(raw: unknown): Parsed<readonly DocumentRejection[]> {
  if (!Array.isArray(raw)) return fail(`motivos de recusa: esperado lista, veio ${typeOf(raw)}`);
  if (raw.length === 0) return fail('motivos de recusa: catálogo vazio');
  const reasons: DocumentRejection[] = [];
  for (const [index, item] of raw.entries()) {
    const one = parseRejection(item, `motivos de recusa, item ${index}`);
    if (!one.ok) return one;
    reasons.push(one.value);
  }
  return ok(reasons);
}

/** `POST /drivers/:id/suspend`. */
export function parseDriverSuspensionResponse(raw: unknown): Parsed<DriverSuspension> {
  if (!isRecord(raw)) return fail(`suspensão: esperado objeto, veio ${typeOf(raw)}`);
  const driverId = text(raw, 'driverId');
  if (!driverId.ok) return fail(`suspensão: ${driverId.reason}`);
  if (raw['status'] !== 'suspended') return fail(`suspensão: campo "status": esperado suspended (${typeOf(raw['status'])})`);
  const suspendedAt = text(raw, 'suspendedAt');
  if (!suspendedAt.ok) return fail(`suspensão: ${suspendedAt.reason}`);
  return ok({ driverId: driverId.value, status: 'suspended', suspendedAt: suspendedAt.value });
}
