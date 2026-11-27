import type { AdminRole } from './types';

/**
 * Fila de documentos do motorista (M3, telas da fatia D7 de docs/plano-m3-m4.md).
 *
 * ESPELHO, no painel, do contrato `DocumentReviewPort` de `@vuumbora/api-client/admin` (fatia K0) —
 * espelhado e não importado, pelo mesmo motivo de `result.ts`, mais dois concretos:
 *  1. importar o pacote em runtime obriga a `apps/admin/Dockerfile` a copiar `packages/api-client` e
 *     `packages/domain` antes do `npm ci`, e o `package-lock.json` a mudar — foi exatamente esse par
 *     (COPY + contexto) que quebrou dois deploys seguidos do site em 19/11/2026, e aqui não há Docker
 *     para provar a imagem antes do push;
 *  2. o `Result`/`ApiError` do pacote não é o deste painel; seria preciso traduzir de qualquer jeito.
 *
 * O preço do espelho é poder divergir. A guarda: `contract/documentReview.contract.ts` (roda no
 * `npm run typecheck` do admin, logo no `npm run check` da raiz) compara CADA tipo daqui com o do
 * pacote — igualdade estrita, campo a campo — e `test/documentReviewContract.test.ts` passa a saída
 * real do mock do K0 pelos validadores deste painel. Nenhum dos dois entra no build da imagem.
 */

/** Estado de UM documento (`DriverDocumentStatus`, `@vuumbora/domain/driver`). */
export const DRIVER_DOCUMENT_STATUSES = ['submitted', 'approved', 'rejected', 'expired'] as const;
export type DriverDocumentStatus = (typeof DRIVER_DOCUMENT_STATUSES)[number];

/** Estado do cadastro do motorista (`VerificationStatus`, `@vuumbora/domain/driver`). */
export const DRIVER_VERIFICATION_STATUSES = [
  'not_started',
  'pending_documents',
  'under_review',
  'changes_requested',
  'approved',
  'suspended',
] as const;
export type DriverVerificationStatus = (typeof DRIVER_VERIFICATION_STATUSES)[number];

export const CNH_CATEGORIES = ['B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'] as const;
export type CnhCategory = (typeof CNH_CATEGORIES)[number];

/**
 * Quem revisa documento (e vê CPF, CNH e o arquivo). Espelha `DOCUMENT_REVIEW_ROLES` do pacote; o teste
 * de contrato confere os valores. Usabilidade, não segurança: quem protege é o `403 forbidden` do servidor.
 */
export const DOCUMENT_REVIEW_ROLES: readonly AdminRole[] = ['dono', 'revisor_documentos'];

/**
 * Motivo de recusa, do catálogo fechado (N2). `text` é o que o MOTORISTA lê. A nota livre do revisor
 * (`internalNote`) é outra coisa e nunca sai para o app.
 */
export interface DocumentRejection {
  readonly code: string;
  readonly text: string;
}

export interface DriverAddress {
  readonly street: string;
  readonly number: string;
  readonly complement?: string;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
  /** 8 algarismos, sem traço. */
  readonly postalCode: string;
}

export interface DriverCnh {
  readonly number: string;
  readonly category: CnhCategory;
  /** `AAAA-MM-DD`. */
  readonly expiresOn: string;
  /** "Exerce atividade remunerada". */
  readonly ear: boolean;
}

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
  readonly submittedAt: string;
  /** `submittedAt` + `review_sla_hours`. */
  readonly reviewDeadline: string;
  /** Prazo vencido e ainda `submitted`: a fila destaca. */
  readonly overdue: boolean;
}

/** `CursorPage<DocumentReviewQueueItem>` do pacote. Sem `nextCursor` = não há mais. */
export interface DocumentReviewQueuePage {
  readonly items: readonly DocumentReviewQueueItem[];
  readonly nextCursor?: string;
}

/** Documento no detalhe do motorista: metadados, NUNCA a URL (ela é pedida no clique, `viewUrl`). */
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

/** `GET /v1/admin/drivers/:id`. */
export interface AdminDriverDetail {
  readonly driverId: string;
  readonly fullName: string;
  readonly email: string;
  readonly applicationId: string;
  readonly status: DriverVerificationStatus;
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

/** `POST /v1/admin/documents/:id/view-url`: auditado no servidor ANTES de devolver (N5). Vale ≤ 300 s. */
export interface DocumentViewUrl {
  readonly url: string;
  readonly expiresAt: string;
}

export interface ApproveDocumentInput {
  /** `AAAA-MM-DD`. Obrigatório para tipo com validade; proibido para tipo sem. Não pode ser passado. */
  readonly expiresOn?: string;
}

export interface RejectDocumentInput {
  /** Código do catálogo (`rejectionReasons()`). */
  readonly reasonCode: string;
  /** Interna, até 1000 caracteres. */
  readonly internalNote?: string;
}

/** Resposta de aprovar/recusar. `driverStatus` mostra o efeito do N4 (o último obrigatório aprovado aprova a conta). */
export interface DocumentDecision {
  readonly documentId: string;
  readonly status: 'approved' | 'rejected';
  readonly reviewedAt: string;
  readonly expiresOn?: string;
  readonly rejection?: DocumentRejection;
  readonly driverStatus: DriverVerificationStatus;
}

export interface SuspendDriverInput {
  /** 10 a 1000 caracteres. */
  readonly reason: string;
}

export interface DriverSuspension {
  readonly driverId: string;
  readonly status: 'suspended';
  readonly suspendedAt: string;
}

/** Limites de texto do contrato (pareados por comentário com o JSDoc do pacote). */
export const SUSPEND_REASON_MIN_LENGTH = 10;
export const SUSPEND_REASON_MAX_LENGTH = 1000;
export const INTERNAL_NOTE_MAX_LENGTH = 1000;

/**
 * `code` de validação → campo do formulário. O servidor do M3 manda só `{ code, message }` (sem `fields`):
 * quem sabe o campo é o catálogo (`DOCUMENT_REVIEW_ERRORS` do pacote, entradas com `field`). O teste de
 * contrato confere que este mapa é o mesmo do catálogo.
 */
export const DOCUMENT_REVIEW_FIELD_BY_CODE: Readonly<Record<string, string>> = {
  validation_failed: 'reason',
  invalid_expires_on: 'expiresOn',
  unknown_reason: 'reasonCode',
};
