/**
 * Contrato do PAINEL para o M3 (fila de documentos) e o M4 (tarifa e área), fatia K0 do
 * `docs/plano-m3-m4.md` §3. Rotas em `/v1/admin/*`, sessão de admin com CSRF (o adaptador `http`
 * cuida do cabeçalho; nenhuma porta expõe o token).
 *
 * **Papéis:** documentos = `revisor_documentos` e `dono`; `suporte`, `financeiro` e `operacao` levam
 * `403 forbidden` em TODAS as rotas de documento (antes de qualquer outra checagem, inclusive 404).
 * Tarifa e área = só `dono`.
 *
 * **Nota para o painel:** `apps/admin` hoje tem o próprio `Result`/`ApiError` (`apps/admin/src/api/result.ts`)
 * e não depende deste pacote. Estes tipos não usam DOM nem React Native: o painel pode importá-los
 * direto, ou só espelhá-los. A escolha é de quem integra (D7).
 */
import type { BoundingBox, GeoJsonPolygon, ServiceArea } from '@vuumbora/domain';
import type { DriverDocumentStatus, VerificationStatus } from '@vuumbora/domain/driver';
import type { CursorPage, Result } from '../index';
import type { ErrorCatalog } from '../server-error';
import type { DocumentRejection, DriverAddress, DriverCnh } from '../documents/types';

export type { BoundingBox, GeoJsonPolygon, ServiceArea };

/** Papéis do painel (mesma lista de `ADMIN_ROLES`, `apps/api/src/domain/admin.ts`). */
export type AdminRole = 'dono' | 'operacao' | 'revisor_documentos' | 'financeiro' | 'suporte';

/** Quem revisa documento (e vê CPF, CNH e o arquivo). */
export const DOCUMENT_REVIEW_ROLES: readonly AdminRole[] = ['dono', 'revisor_documentos'];

/** Quem mexe em tarifa e área de serviço. */
export const FARE_ADMIN_ROLES: readonly AdminRole[] = ['dono'];

/** Usabilidade (não mostrar a tela a quem não pode); quem protege de verdade é o 403 do servidor. */
export function canReviewDocuments(role: AdminRole | null | undefined): boolean {
  return !!role && DOCUMENT_REVIEW_ROLES.includes(role);
}

export function canManageFares(role: AdminRole | null | undefined): boolean {
  return !!role && FARE_ADMIN_ROLES.includes(role);
}

// ------------------------------------------------------------------ documentos (D5 / D7)

/** `GET /v1/admin/document-reviews?status&cursor&limit`. */
export interface DocumentReviewQueueInput {
  /** Padrão `submitted` (a fila de trabalho). */
  readonly status?: DriverDocumentStatus;
  readonly cursor?: string;
  /** Padrão 20, teto 50. */
  readonly limit?: number;
}

/** Item da fila: mais antigo primeiro (por `submittedAt`). Nenhuma URL de arquivo aqui. */
export interface DocumentReviewQueueItem {
  readonly documentId: string;
  readonly driverId: string;
  readonly driverName: string;
  readonly typeCode: string;
  readonly typeLabel: string;
  readonly status: DriverDocumentStatus;
  /** ISO 8601. */
  readonly submittedAt: string;
  /** ISO 8601: `submittedAt` + `review_sla_hours`. */
  readonly reviewDeadline: string;
  /** Prazo vencido e ainda `submitted`: a fila destaca. */
  readonly overdue: boolean;
}

/** Documento no detalhe do motorista: metadados, nunca a URL (ela é pedida no clique, `viewUrl`). */
export interface AdminDriverDocument {
  readonly documentId: string;
  readonly typeCode: string;
  readonly typeLabel: string;
  readonly status: DriverDocumentStatus;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly submittedAt: string;
  readonly reviewedAt?: string;
  readonly expiresOn?: string;
  readonly rejection?: DocumentRejection;
  /** Nota interna do revisor. Nunca vai para o app do motorista. */
  readonly internalNote?: string;
}

/** `GET /v1/admin/drivers/:id`: dados para conferir o documento contra o cadastro. */
export interface AdminDriverDetail {
  readonly driverId: string;
  readonly fullName: string;
  readonly email: string;
  readonly applicationId: string;
  readonly status: VerificationStatus;
  /** Etapa 2 (ausente se o motorista ainda não enviou). CPF sem máscara, 11 algarismos. */
  readonly profile?: {
    readonly cpf: string;
    readonly birthDate: string;
    readonly address: DriverAddress;
    readonly cnh: DriverCnh;
  };
  readonly vehicle?: {
    readonly vehicleId: string;
    readonly plate: string;
    readonly brand: string;
    readonly model: string;
    readonly year: number;
    readonly color: string;
  };
  readonly suspension?: { readonly reason: string; readonly suspendedAt: string };
  readonly documents: readonly AdminDriverDocument[];
}

/** `POST /v1/admin/documents/:id/view-url`: grava no `audit_log` ANTES de devolver (N5). Vale ≤ 300 s. */
export interface DocumentViewUrl {
  readonly url: string;
  readonly expiresAt: string;
}

export interface ApproveDocumentInput {
  /** `AAAA-MM-DD`. Obrigatório para tipo com validade; proibido para tipo sem. Não pode ser passado. */
  readonly expiresOn?: string;
}

export interface RejectDocumentInput {
  /** Código do catálogo (`rejectionReasons()`). Fora dele: `422 unknown_reason`. */
  readonly reasonCode: string;
  /** Interna, até 1000 caracteres. */
  readonly internalNote?: string;
}

/** Resposta de aprovar/recusar. `driverStatus` mostra o efeito do N4 (o último obrigatório aprovado leva a `approved`). */
export interface DocumentDecision {
  readonly documentId: string;
  readonly status: 'approved' | 'rejected';
  readonly reviewedAt: string;
  readonly expiresOn?: string;
  readonly rejection?: DocumentRejection;
  readonly driverStatus: VerificationStatus;
}

export interface SuspendDriverInput {
  /** Motivo, 10 a 500 caracteres depois do trim (o CHECK `drivers_suspension_reason_len` da 0024 vai até 500). */
  readonly reason: string;
}

export interface DriverSuspension {
  readonly driverId: string;
  readonly status: 'suspended';
  readonly suspendedAt: string;
}

/** `POST /v1/admin/drivers/:id/reinstate` (acréscimo da D5): sair da suspensão é decisão com autor (0025). */
export interface DriverReinstatement {
  readonly driverId: string;
  readonly status: 'approved';
  readonly reinstatedAt: string;
}

/**
 * Fila e decisão de documentos. Toda rota: `403 forbidden` para papel sem acesso (primeiro de tudo).
 * Aprovar, recusar e suspender exigem `idempotencyKey` (cabeçalho `Idempotency-Key`): a MESMA chave
 * com o mesmo corpo devolve a MESMA resposta; documento já decidido por outra chamada = `409
 * invalid_transition`.
 */
export interface DocumentReviewPort {
  /** `400 invalid_body` (status, limite) · `400 invalid_cursor`. */
  queue(input?: DocumentReviewQueueInput): Promise<Result<CursorPage<DocumentReviewQueueItem>>>;
  /** `404 not_found`. */
  driver(driverId: string): Promise<Result<AdminDriverDetail>>;
  /** `404 not_found` (inclusive documento ainda não enviado). Cada chamada é uma visualização auditada. */
  viewUrl(documentId: string): Promise<Result<DocumentViewUrl>>;
  /** `404 not_found` · `409 invalid_transition` (não está `submitted`) · `422 invalid_expires_on` (`fields.expiresOn`). */
  approve(documentId: string, input: ApproveDocumentInput, idempotencyKey: string): Promise<Result<DocumentDecision>>;
  /** `404 not_found` · `409 invalid_transition` · `422 unknown_reason` (`fields.reasonCode`) · `400 invalid_body` (nota longa). */
  reject(documentId: string, input: RejectDocumentInput, idempotencyKey: string): Promise<Result<DocumentDecision>>;
  rejectionReasons(): Promise<Result<readonly DocumentRejection[]>>;
  /**
   * `404 not_found` · `400 validation_failed` (`fields.reason`) · `403 own_registration`. Suspender quem já está suspenso
   * devolve a suspensão original.
   */
  suspend(driverId: string, input: SuspendDriverInput, idempotencyKey: string): Promise<Result<DriverSuspension>>;
}

/**
 * Acréscimo da D5 (porta À PARTE para o espelho do painel, que confere `DocumentReviewPort` por igualdade estrita,
 * adotar quando quiser): `POST /v1/admin/drivers/:id/reinstate`, com `Idempotency-Key` e CSRF.
 */
export interface DriverReinstatementPort {
  /**
   * `404 not_found` · `409 driver_not_suspended` · `403 own_registration` · `409 approval_blocked` (há pendência no
   * cadastro: documento vencido ou faltando). Já reativado devolve a reativação original.
   */
  reinstate(driverId: string, idempotencyKey: string): Promise<Result<DriverReinstatement>>;
}

/** Catálogo FECHADO dos `code` da fila de documentos. */
export const DOCUMENT_REVIEW_ERRORS = {
  invalid_body: { status: 400, message: 'Dados inválidos.' },
  invalid_cursor: { status: 400, message: 'Cursor de paginação inválido.' },
  validation_failed: { status: 400, message: 'Informe o motivo (10 a 500 caracteres).', field: 'reason' },
  idempotency_key_required: { status: 400, message: 'Informe o cabeçalho Idempotency-Key.' },
  unauthorized: { status: 401, message: 'Sessão expirada.' },
  forbidden: { status: 403, message: 'Seu papel não tem acesso a este recurso.' },
  csrf_token_invalid: { status: 403, message: 'Token CSRF ausente ou inválido.' },
  own_registration: { status: 403, message: 'Ninguém decide sobre o próprio cadastro de motorista.' },
  not_found: { status: 404, message: 'Não encontrado.' },
  invalid_transition: { status: 409, message: 'Este documento já foi analisado.' },
  idempotency_key_reused: { status: 409, message: 'Esta chave já foi usada com outro conteúdo.' },
  driver_not_suspended: { status: 409, message: 'Este motorista não está suspenso.' },
  approval_blocked: { status: 409, message: 'Há pendências no cadastro: o motorista não pode voltar a ficar aprovado.' },
  invalid_expires_on: { status: 422, message: 'Data de validade ausente, inválida ou já passada.', field: 'expiresOn' },
  unknown_reason: { status: 422, message: 'Motivo de recusa desconhecido.', field: 'reasonCode' },
  unavailable: { status: 503, message: 'Serviço indisponível no momento.' },
} as const satisfies ErrorCatalog;

export type DocumentReviewErrorCode = keyof typeof DOCUMENT_REVIEW_ERRORS;

// ------------------------------------------------------------------ tarifa e área (G5, só `dono`)

/** Tarifa de UMA categoria numa versão (centavos inteiros; os mesmos componentes de `FareRates`, `@vuumbora/domain`). */
export interface CategoryFareRates {
  readonly categorySlug: string;
  readonly baseCents: number;
  readonly perKmCents: number;
  readonly perMinuteCents: number;
  readonly minimumFareCents: number;
}

/** Uma versão de tarifa (`fare_rule_versions`): nunca editada; criar outra fecha a anterior (N8). */
export interface FareTableVersion {
  readonly fareVersionId: string;
  readonly isTest: boolean;
  /** ISO 8601. */
  readonly validFrom: string;
  /** Ausente = vigente. */
  readonly validTo?: string;
  readonly note?: string;
  readonly categories: readonly CategoryFareRates[];
}

/** `POST /v1/admin/fare-tables`. Categoria repetida ou valor negativo: `400 invalid_body`. */
export interface FareTableDraft {
  readonly isTest: boolean;
  readonly note?: string;
  readonly categories: readonly CategoryFareRates[];
}

/** Uma rota do simulador. */
export interface FareSimulationRoute {
  readonly label?: string;
  readonly distanceM: number;
  readonly durationS: number;
}

/** `POST /v1/admin/fare-tables/simulate`: preço ao passageiro e ganho do motorista com a taxa de 20% e de 25%. */
export interface FareSimulationInput {
  readonly versionDraft: FareTableDraft;
  /** De 1 a 50 rotas. */
  readonly routes: readonly FareSimulationRoute[];
}

export interface FareSimulationRow {
  readonly routeIndex: number;
  readonly categorySlug: string;
  readonly passengerPriceCents: number;
  readonly driverEarningsCents: { readonly fee20: number; readonly fee25: number };
}

export interface FareSimulationResult {
  readonly rows: readonly FareSimulationRow[];
}

export interface FareAdminPort {
  /** Mais recente primeiro. `400 invalid_cursor`. */
  fareTables(input?: { readonly cursor?: string; readonly limit?: number }): Promise<Result<CursorPage<FareTableVersion>>>;
  /** Cria a versão nova e fecha a vigente. `400 invalid_body` · `409 idempotency_key_reused`. */
  createFareTable(draft: FareTableDraft, idempotencyKey: string): Promise<Result<FareTableVersion>>;
  /** Não grava nada. `400 invalid_body`. */
  simulate(input: FareSimulationInput): Promise<Result<FareSimulationResult>>;
  serviceAreas(): Promise<Result<readonly ServiceArea[]>>;
}

/** Catálogo FECHADO dos `code` de tarifa e área. */
export const FARE_ADMIN_ERRORS = {
  invalid_body: { status: 400, message: 'Dados inválidos.' },
  invalid_cursor: { status: 400, message: 'Cursor de paginação inválido.' },
  unauthorized: { status: 401, message: 'Sessão expirada.' },
  forbidden: { status: 403, message: 'Seu papel não tem acesso a este recurso.' },
  csrf_token_invalid: { status: 403, message: 'Token CSRF ausente ou inválido.' },
  idempotency_key_reused: { status: 409, message: 'Esta chave já foi usada com outro conteúdo.' },
  unavailable: { status: 503, message: 'Serviço indisponível no momento.' },
} as const satisfies ErrorCatalog;

export type FareAdminErrorCode = keyof typeof FARE_ADMIN_ERRORS;
