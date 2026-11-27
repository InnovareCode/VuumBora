import type { ApiError, Result } from './result';
import type { AdminRole } from './types';
import type { DocumentReviewPort } from './documentReview';
import {
  DOCUMENT_REVIEW_ROLES,
  INTERNAL_NOTE_MAX_LENGTH,
  SUSPEND_REASON_MAX_LENGTH,
  SUSPEND_REASON_MIN_LENGTH,
  type AdminDriverDetail,
  type AdminDriverDocument,
  type DocumentDecision,
  type DocumentRejection,
  type DocumentReviewQueueItem,
  type DriverDocumentStatus,
  type DriverVerificationStatus,
} from './documentReviewTypes';

/**
 * Mock EXPLÍCITO da fila de documentos (nunca fallback silencioso — ver src/api/index.ts). Responde pelas
 * mesmas regras do mock do K0 (`createMockDocumentReview`, `@vuumbora/api-client/admin`), reescritas aqui
 * porque o painel não importa o pacote em runtime (ver o cabeçalho de `documentReviewTypes.ts`):
 *
 * - papel fora de `DOCUMENT_REVIEW_ROLES` → `403 forbidden` em TODAS as rotas, antes de tudo. O papel é
 *   lido A CADA chamada (`role()`), não fixado na criação: assim dá para provar o 403 trocando a sessão;
 * - `viewUrl` registra a visualização (`onAudit`) ANTES de devolver a URL (N5);
 * - aprovar o último obrigatório aprova a conta sozinho (N4) e a resposta mostra isso (`driverStatus`);
 * - mesma chave + mesmo corpo = mesma resposta; mesma chave com corpo diferente = `409
 *   idempotency_key_reused`; documento já decidido = `409 invalid_transition`.
 *
 * Semente: os mesmos três motoristas fictícios da semente `'demo'` do K0 — Ana (cinco documentos em
 * análise, a CNH com prazo vencido), Bruno (CNH recusada, o resto aprovado) e Carla (aprovada).
 */

export interface MockDocumentAuditEntry {
  readonly action: 'document.view_url' | 'document.approve' | 'document.reject' | 'driver.suspend';
  readonly targetId: string;
  readonly actorRole: AdminRole;
  readonly atMs: number;
}

export interface MockDocumentReviewOptions {
  /** Papel de quem chama, lido a cada chamada. */
  readonly role: () => AdminRole | null | undefined;
  readonly now?: () => number;
  /** Latência fingida, para a tela mostrar o carregando. Padrão 300 ms. */
  readonly delayMs?: number;
  readonly onAudit?: (entry: MockDocumentAuditEntry) => void;
}

interface Requirement {
  readonly typeCode: string;
  readonly label: string;
  readonly required: boolean;
  readonly hasExpiry: boolean;
}

/** Lista PROVISÓRIA (mínimo federal + foto), a mesma de `PROVISIONAL_REQUIREMENTS` do K0. */
const REQUIREMENTS: readonly Requirement[] = [
  { typeCode: 'cnh', label: 'CNH com EAR', required: true, hasExpiry: true },
  { typeCode: 'crlv', label: 'Documento do veículo (CRLV)', required: true, hasExpiry: true },
  { typeCode: 'antecedentes', label: 'Certidão de antecedentes criminais', required: true, hasExpiry: true },
  { typeCode: 'inss', label: 'Comprovante de inscrição no INSS', required: true, hasExpiry: false },
  { typeCode: 'foto_perfil', label: 'Foto de perfil', required: true, hasExpiry: false },
];

/** Catálogo PROVISÓRIO de motivos (N2), o mesmo de `PROVISIONAL_REJECTION_REASONS` do K0. */
const REJECTION_REASONS: readonly DocumentRejection[] = [
  { code: 'illegible', text: 'Não conseguimos ler o documento. Envie uma foto nítida, sem reflexo e sem cortes.' },
  { code: 'wrong_document', text: 'O arquivo enviado não é o documento pedido.' },
  { code: 'expired_document', text: 'O documento enviado está vencido.' },
  { code: 'data_mismatch', text: 'Os dados do documento não conferem com os do seu cadastro.' },
  { code: 'incomplete', text: 'Falta uma parte do documento. Envie frente e verso.' },
];

const REVIEW_SLA_HOURS = 48;
const VIEW_URL_TTL_MS = 300_000;
const HOUR = 60 * 60 * 1000;

interface MockDocument {
  readonly id: string;
  readonly driverId: string;
  readonly typeCode: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly submittedAtMs: number;
  state: DriverDocumentStatus;
  reviewedAtMs?: number;
  expiresOn?: string;
  rejection?: DocumentRejection;
  internalNote?: string;
}

interface MockDriver {
  readonly driverId: string;
  readonly fullName: string;
  readonly email: string;
  readonly applicationId: string;
  accountStatus: 'pending_review' | 'approved' | 'suspended';
  suspension?: { readonly reason: string; readonly atMs: number };
  readonly profile: NonNullable<AdminDriverDetail['profile']>;
  readonly vehicle: NonNullable<AdminDriverDetail['vehicle']>;
}

const FORBIDDEN: ApiError = { kind: 'forbidden' };
const NOT_FOUND: ApiError = { kind: 'not_found' };
const INVALID_BODY: ApiError = { kind: 'unknown', message: 'Dados inválidos.' };

function failWith<T>(error: ApiError): Result<T> {
  return { ok: false, error };
}

function succeed<T>(data: T): Result<T> {
  return { ok: true, data, origin: 'mock' };
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Data de calendário em Natal (UTC−3, sem horário de verão). */
function natalToday(nowMs: number): string {
  return new Date(nowMs - 3 * HOUR).toISOString().slice(0, 10);
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char] ?? char);
}

/**
 * O "arquivo" do mock: um SVG fictício como `data:` (a CSP do painel já aceita `data:` em `img-src`).
 * O K0 devolve `https://mock-storage.invalid/…`, que nunca carrega — aqui a tela de demonstração tem o
 * que mostrar. Só o mock faz isto: o adaptador http recusa `data:` vindo da API (`parseDocumentViewUrlResponse`).
 */
function placeholderDocument(typeLabel: string, driverName: string): string {
  // Cores dentro do SVG ficam por nome CSS: a guarda de arquitetura proíbe hexadecimal solto fora dos tokens.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">` +
    `<rect width="640" height="400" rx="24" fill="whitesmoke"/>` +
    `<rect x="24" y="24" width="592" height="352" rx="16" fill="none" stroke="silver" stroke-width="4" stroke-dasharray="14 10"/>` +
    `<text x="320" y="150" font-family="sans-serif" font-size="30" font-weight="700" fill="dimgray" text-anchor="middle">DOCUMENTO FICTÍCIO</text>` +
    `<text x="320" y="205" font-family="sans-serif" font-size="24" fill="black" text-anchor="middle">${escapeXml(typeLabel)}</text>` +
    `<text x="320" y="245" font-family="sans-serif" font-size="22" fill="black" text-anchor="middle">${escapeXml(driverName)}</text>` +
    `<text x="320" y="320" font-family="sans-serif" font-size="18" fill="dimgray" text-anchor="middle">Modo demonstração — não é um arquivo enviado</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMockDocumentReviewAdapter(options: MockDocumentReviewOptions): DocumentReviewPort {
  const now = options.now ?? (() => Date.now());
  const latency = options.delayMs ?? 300;
  const drivers = new Map<string, MockDriver>();
  const documents = new Map<string, MockDocument>();
  const decisions = new Map<string, { readonly key: string; readonly fingerprint: string; readonly response: DocumentDecision }>();

  seed(now(), drivers, documents);

  const requirement = (typeCode: string) => REQUIREMENTS.find((item) => item.typeCode === typeCode);
  const labelOf = (typeCode: string) => requirement(typeCode)?.label ?? typeCode;

  function currentRole(): AdminRole | undefined {
    const role = options.role();
    return role && DOCUMENT_REVIEW_ROLES.includes(role) ? role : undefined;
  }

  function audit(action: MockDocumentAuditEntry['action'], targetId: string, actorRole: AdminRole): void {
    options.onAudit?.({ action, targetId, actorRole, atMs: now() });
  }

  /** O documento mais recente de cada tipo obrigatório decide o estado (mesma regra de `deriveVerificationStatus`). */
  function verificationOf(driver: MockDriver): DriverVerificationStatus {
    if (driver.accountStatus === 'suspended') return 'suspended';
    if (driver.accountStatus === 'approved') return 'approved';
    const latest = REQUIREMENTS.filter((item) => item.required).map((item) =>
      [...documents.values()]
        .filter((doc) => doc.driverId === driver.driverId && doc.typeCode === item.typeCode)
        .sort((a, b) => b.submittedAtMs - a.submittedAtMs)[0],
    );
    if (latest.some((doc) => doc?.state === 'rejected')) return 'changes_requested';
    if (latest.some((doc) => doc === undefined || doc.state === 'expired')) return 'pending_documents';
    return 'under_review';
  }

  /** N4: o último obrigatório aprovado aprova a conta, na mesma "transação". */
  function applyN4(driver: MockDriver): void {
    if (driver.accountStatus !== 'pending_review') return;
    const allApproved = REQUIREMENTS.filter((item) => item.required).every((item) =>
      [...documents.values()].some((doc) => doc.driverId === driver.driverId && doc.typeCode === item.typeCode && doc.state === 'approved'),
    );
    if (allApproved) driver.accountStatus = 'approved';
  }

  function decide(
    documentId: string,
    body: Readonly<Record<string, unknown>>,
    idempotencyKey: string,
    apply: (doc: MockDocument, driver: MockDriver) => Result<DocumentDecision>,
  ): Result<DocumentDecision> {
    const doc = documents.get(documentId);
    const driver = doc ? drivers.get(doc.driverId) : undefined;
    if (!doc || !driver) return failWith(NOT_FOUND);
    const fingerprint = JSON.stringify({ documentId, ...body });
    const previous = decisions.get(doc.id);
    if (previous && previous.key === idempotencyKey) {
      return previous.fingerprint === fingerprint ? succeed(previous.response) : failWith({ kind: 'conflict', reason: 'idempotency_key_reused' });
    }
    if (doc.state !== 'submitted') return failWith({ kind: 'conflict', reason: 'invalid_transition' });
    const outcome = apply(doc, driver);
    if (outcome.ok) decisions.set(doc.id, { key: idempotencyKey, fingerprint, response: outcome.data });
    return outcome;
  }

  return {
    async queue(input = {}) {
      await delay(latency);
      if (!currentRole()) return failWith(FORBIDDEN);
      const status = input.status ?? 'submitted';
      const limit = input.limit ?? 20;
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) return failWith(INVALID_BODY);
      const matching = [...documents.values()]
        .filter((doc) => doc.state === status)
        .sort((a, b) => a.submittedAtMs - b.submittedAtMs || a.id.localeCompare(b.id));
      let start = 0;
      if (input.cursor !== undefined) {
        const at = matching.findIndex((doc) => doc.id === input.cursor);
        if (at === -1) return failWith({ kind: 'unknown', message: 'Cursor de paginação inválido.' });
        start = at + 1;
      }
      const page = matching.slice(start, start + limit);
      const nowMs = now();
      const items = page.map((doc): DocumentReviewQueueItem => {
        const deadlineMs = doc.submittedAtMs + REVIEW_SLA_HOURS * HOUR;
        return {
          documentId: doc.id,
          driverId: doc.driverId,
          driverName: drivers.get(doc.driverId)?.fullName ?? '',
          typeCode: doc.typeCode,
          typeLabel: labelOf(doc.typeCode),
          status,
          submittedAt: iso(doc.submittedAtMs),
          reviewDeadline: iso(deadlineMs),
          overdue: status === 'submitted' && nowMs > deadlineMs,
        };
      });
      const last = page[page.length - 1];
      const hasMore = start + limit < matching.length;
      return succeed({ items, ...(hasMore && last ? { nextCursor: last.id } : {}) });
    },

    async driver(driverId) {
      await delay(latency);
      if (!currentRole()) return failWith(FORBIDDEN);
      const driver = drivers.get(driverId);
      if (!driver) return failWith(NOT_FOUND);
      const docs = [...documents.values()]
        .filter((doc) => doc.driverId === driverId)
        .sort((a, b) => b.submittedAtMs - a.submittedAtMs)
        .map(
          (doc): AdminDriverDocument => ({
            documentId: doc.id,
            typeCode: doc.typeCode,
            typeLabel: labelOf(doc.typeCode),
            status: doc.state,
            contentType: doc.contentType,
            sizeBytes: doc.sizeBytes,
            submittedAt: iso(doc.submittedAtMs),
            ...(doc.reviewedAtMs !== undefined ? { reviewedAt: iso(doc.reviewedAtMs) } : {}),
            ...(doc.expiresOn !== undefined ? { expiresOn: doc.expiresOn } : {}),
            ...(doc.rejection ? { rejection: doc.rejection } : {}),
            ...(doc.internalNote !== undefined ? { internalNote: doc.internalNote } : {}),
          }),
        );
      return succeed({
        driverId: driver.driverId,
        fullName: driver.fullName,
        email: driver.email,
        applicationId: driver.applicationId,
        status: verificationOf(driver),
        profile: driver.profile,
        vehicle: driver.vehicle,
        ...(driver.suspension ? { suspension: { reason: driver.suspension.reason, suspendedAt: iso(driver.suspension.atMs) } } : {}),
        documents: docs,
      });
    },

    async viewUrl(documentId) {
      await delay(latency);
      const role = currentRole();
      if (!role) return failWith(FORBIDDEN);
      const doc = documents.get(documentId);
      if (!doc) return failWith(NOT_FOUND);
      audit('document.view_url', doc.id, role); // N5: a trilha antes da URL
      return succeed({
        url: placeholderDocument(labelOf(doc.typeCode), drivers.get(doc.driverId)?.fullName ?? ''),
        expiresAt: iso(now() + VIEW_URL_TTL_MS),
      });
    },

    async approve(documentId, input, idempotencyKey) {
      await delay(latency);
      const role = currentRole();
      if (!role) return failWith(FORBIDDEN);
      if (!idempotencyKey) return failWith({ kind: 'unknown', message: 'Informe o cabeçalho Idempotency-Key.' });
      const body = input.expiresOn !== undefined ? { action: 'approve', expiresOn: input.expiresOn } : { action: 'approve' };
      return decide(documentId, body, idempotencyKey, (doc, driver) => {
        const hasExpiry = requirement(doc.typeCode)?.hasExpiry ?? false;
        const { expiresOn } = input;
        const validExpiry = expiresOn !== undefined && isCalendarDate(expiresOn) && expiresOn >= natalToday(now());
        if (hasExpiry ? !validExpiry : expiresOn !== undefined) {
          return failWith({ kind: 'validation', fields: { expiresOn: 'Data de validade ausente, inválida ou já passada.' } });
        }
        doc.state = 'approved';
        doc.reviewedAtMs = now();
        if (hasExpiry && expiresOn !== undefined) doc.expiresOn = expiresOn;
        applyN4(driver);
        audit('document.approve', doc.id, role);
        return succeed({
          documentId: doc.id,
          status: 'approved',
          reviewedAt: iso(doc.reviewedAtMs),
          ...(doc.expiresOn !== undefined ? { expiresOn: doc.expiresOn } : {}),
          driverStatus: verificationOf(driver),
        });
      });
    },

    async reject(documentId, input, idempotencyKey) {
      await delay(latency);
      const role = currentRole();
      if (!role) return failWith(FORBIDDEN);
      if (!idempotencyKey) return failWith({ kind: 'unknown', message: 'Informe o cabeçalho Idempotency-Key.' });
      if (input.internalNote !== undefined && input.internalNote.length > INTERNAL_NOTE_MAX_LENGTH) return failWith(INVALID_BODY);
      const body = { action: 'reject', reasonCode: input.reasonCode, ...(input.internalNote !== undefined ? { internalNote: input.internalNote } : {}) };
      return decide(documentId, body, idempotencyKey, (doc, driver) => {
        const reason = REJECTION_REASONS.find((item) => item.code === input.reasonCode);
        if (!reason) return failWith({ kind: 'validation', fields: { reasonCode: 'Motivo de recusa desconhecido.' } });
        doc.state = 'rejected';
        doc.reviewedAtMs = now();
        doc.rejection = reason;
        if (input.internalNote !== undefined) doc.internalNote = input.internalNote;
        audit('document.reject', doc.id, role);
        return succeed({ documentId: doc.id, status: 'rejected', reviewedAt: iso(doc.reviewedAtMs), rejection: reason, driverStatus: verificationOf(driver) });
      });
    },

    async rejectionReasons() {
      await delay(latency);
      if (!currentRole()) return failWith(FORBIDDEN);
      return succeed(REJECTION_REASONS);
    },

    async suspend(driverId, input, idempotencyKey) {
      await delay(latency);
      const role = currentRole();
      if (!role) return failWith(FORBIDDEN);
      if (!idempotencyKey) return failWith({ kind: 'unknown', message: 'Informe o cabeçalho Idempotency-Key.' });
      const reason = input.reason.trim();
      if (reason.length < SUSPEND_REASON_MIN_LENGTH || reason.length > SUSPEND_REASON_MAX_LENGTH) {
        return failWith({ kind: 'validation', fields: { reason: 'Informe o motivo (10 a 1000 caracteres).' } });
      }
      const driver = drivers.get(driverId);
      if (!driver) return failWith(NOT_FOUND);
      // Já suspenso: devolve a suspensão ORIGINAL, sem gravar de novo.
      if (driver.accountStatus !== 'suspended' || !driver.suspension) {
        driver.accountStatus = 'suspended';
        driver.suspension = { reason, atMs: now() };
        audit('driver.suspend', driver.driverId, role);
      }
      return succeed({ driverId: driver.driverId, status: 'suspended', suspendedAt: iso(driver.suspension.atMs) });
    },
  };
}

function seed(nowMs: number, drivers: Map<string, MockDriver>, documents: Map<string, MockDocument>): void {
  const addDriver = (driverId: string, fullName: string, plate: string, cpf: string): MockDriver => {
    const driver: MockDriver = {
      driverId,
      fullName,
      email: `${driverId}@exemplo.invalid`,
      applicationId: `app-${driverId}`,
      accountStatus: 'pending_review',
      profile: {
        cpf,
        birthDate: '1990-05-10',
        address: { street: 'Rua Exemplo', number: '100', neighborhood: 'Lagoa Nova', city: 'Natal', state: 'RN', postalCode: '59000000' },
        cnh: { number: '00000000000', category: 'B', expiresOn: '2030-01-01', ear: true },
      },
      vehicle: { vehicleId: `veh-${driverId}`, plate, brand: 'Marca', model: 'Modelo', year: 2020, color: 'Prata' },
    };
    drivers.set(driverId, driver);
    return driver;
  };
  const addDocument = (
    driverId: string,
    typeCode: string,
    state: DriverDocumentStatus,
    submittedAgoHours: number,
    extra: Partial<Pick<MockDocument, 'expiresOn' | 'rejection' | 'internalNote'>> = {},
  ): void => {
    const submittedAtMs = nowMs - submittedAgoHours * HOUR;
    documents.set(`${driverId}-${typeCode}`, {
      id: `${driverId}-${typeCode}`,
      driverId,
      typeCode,
      contentType: 'image/jpeg',
      sizeBytes: 250_000,
      submittedAtMs,
      state,
      ...(state === 'submitted' ? {} : { reviewedAtMs: submittedAtMs + HOUR }),
      ...extra,
    });
  };

  // 1) Em análise, a CNH com o prazo já vencido (a fila destaca).
  addDriver('demo-ana', 'Ana Exemplo', 'QWE1A23', '52998224725');
  addDocument('demo-ana', 'cnh', 'submitted', REVIEW_SLA_HOURS + 5);
  addDocument('demo-ana', 'crlv', 'submitted', 3);
  addDocument('demo-ana', 'antecedentes', 'submitted', 2);
  addDocument('demo-ana', 'inss', 'submitted', 2);
  addDocument('demo-ana', 'foto_perfil', 'submitted', 1);

  // 2) Correção pedida na CNH, os outros aprovados.
  addDriver('demo-bruno', 'Bruno Exemplo', 'RTY2B34', '11144477735');
  addDocument('demo-bruno', 'cnh', 'rejected', 30, {
    rejection: REJECTION_REASONS[0] ?? { code: 'illegible', text: 'Documento ilegível.' },
    internalNote: 'Foto com reflexo no número.',
  });
  for (const typeCode of ['crlv', 'antecedentes']) addDocument('demo-bruno', typeCode, 'approved', 30, { expiresOn: '2027-06-30' });
  for (const typeCode of ['inss', 'foto_perfil']) addDocument('demo-bruno', typeCode, 'approved', 30);

  // 3) Aprovada.
  const carla = addDriver('demo-carla', 'Carla Exemplo', 'UIO3C45', '39053344705');
  for (const typeCode of ['cnh', 'crlv', 'antecedentes']) addDocument('demo-carla', typeCode, 'approved', 200, { expiresOn: '2027-12-31' });
  for (const typeCode of ['inss', 'foto_perfil']) addDocument('demo-carla', typeCode, 'approved', 200);
  carla.accountStatus = 'approved';
}
