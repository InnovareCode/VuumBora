/**
 * Contrato do CADASTRO DO MOTORISTA (M3, fatia K0 do `docs/plano-m3-m4.md` §3): vínculo com a
 * candidatura, etapa 2, veículo, verificação e envio de documentos. Telas: M02 (etapa 2), M03
 * (documentos), M04 (análise). Token de conta `driver`; nada aqui vale para o passageiro.
 *
 * Erros no formato do projeto (`{ ok: false, error: { code, message } }` → `ApiError` com `kind` +
 * `code`, ver `server-error.ts`). O catálogo abaixo é a lista FECHADA de `code` destas rotas.
 */
import type { DocumentContentType, VerificationStatus } from '@vuumbora/domain/driver';
import type { Result } from '../index';
import type { ErrorCatalog } from '../server-error';
import type { DocumentRequirement, DriverAddress, DriverCnh, DriverVehicleInput } from '../documents/types';

/** `POST /v1/driver/link-application`. Idempotente: chamar de novo devolve o mesmo `driverId`. */
export interface LinkApplicationResult {
  readonly driverId: string;
  readonly status: VerificationStatus;
}

/** `PUT /v1/driver/onboarding` (etapa 2). Substitui o que havia (é `PUT`). */
export interface DriverOnboardingInput {
  /** 11 algarismos, com ou sem máscara (`isValidCpf`, `@vuumbora/domain`). */
  readonly cpf: string;
  /** `AAAA-MM-DD`. */
  readonly birthDate: string;
  readonly address: DriverAddress;
  readonly cnh: DriverCnh;
}

/**
 * `GET /v1/driver/verification`: o que a M04 e a M03 precisam para decidir a tela.
 *
 * **Acréscimo ao §3 (proposta da Vega, conferir com a Nova):** `onboarding` diz se a etapa 2 e o
 * veículo já foram enviados — sem isso o app não sabe se abre a M02 (etapa 2) ou a M03.
 */
export interface DriverVerification {
  readonly status: VerificationStatus;
  /** ISO 8601. Só em `under_review`: o prazo do documento enviado há mais tempo (`review_sla_hours`, N2). */
  readonly reviewDeadline?: string;
  readonly onboarding: {
    readonly profileSubmitted: boolean;
    readonly vehicleRegistered: boolean;
  };
  /** A lista vigente, na ordem de exibição. Vazia em `not_started`. */
  readonly requirements: readonly DocumentRequirement[];
}

/** `POST /v1/driver/documents/upload-url`. */
export interface DocumentUploadRequest {
  readonly typeCode: string;
  readonly contentType: DocumentContentType;
  /** Inteiro > 0 e ≤ `DOCUMENT_MAX_SIZE_BYTES` (10 MiB). Acima: `413 file_too_large`. */
  readonly sizeBytes: number;
  /** SHA-256 do arquivo em hexadecimal minúsculo. O servidor confere no `submit`. */
  readonly sha256: string;
}

/** Para onde enviar o arquivo. `uploadUrl` vale até `expiresAt` (≤ 300 s); depois, peça outra. */
export interface DocumentUploadTarget {
  readonly documentId: string;
  readonly uploadUrl: string;
  readonly method: 'PUT';
  /** Cabeçalhos que o `PUT` TEM de levar (tipo, tamanho, hash): sem eles o armazenamento recusa. */
  readonly headers: Readonly<Record<string, string>>;
  /** ISO 8601. */
  readonly expiresAt: string;
}

/** O arquivo escolhido (câmera ou arquivo). `uri` local do aparelho (`file://`, `content://`) ou `blob:` no navegador. */
export interface UploadSource {
  readonly uri: string;
}

export interface DriverOnboardingPort {
  /**
   * Liga a conta (e-mail verificado) à candidatura APROVADA de mesmo e-mail (N3). Idempotente.
   * `409 application_not_approved` (sem candidatura, ou ainda não aprovada) · `409 email_not_verified`.
   */
  linkApplication(): Promise<Result<LinkApplicationResult>>;
  /**
   * Etapa 2. Ordem: `400 invalid_body` (forma do corpo, data, UF, CEP, CNH com 11 algarismos) →
   * `409 driver_not_linked` → `422 invalid_cpf` (`fields.cpf`) → `422 cnh_without_ear` (`fields['cnh.ear']`).
   */
  saveOnboarding(input: DriverOnboardingInput): Promise<Result<{ readonly status: VerificationStatus }>>;
  /**
   * Veículo ativo (substitui o anterior). Ordem: `400 invalid_body` (placa fora do padrão, ano fora de
   * 1950..ano seguinte) → `409 driver_not_linked` → `409 plate_in_use` → `422 vehicle_too_old`
   * (`fields.year`; idade máxima da configuração).
   */
  saveVehicle(input: DriverVehicleInput): Promise<Result<{ readonly vehicleId: string }>>;
  /** Sem erro de negócio: conta sem vínculo responde `status: 'not_started'`. */
  verification(): Promise<Result<DriverVerification>>;
  /**
   * Pede a URL de envio de um documento. Ordem: `400 invalid_body` → `413 file_too_large`
   * (`fields.sizeBytes`) → `409 driver_not_linked` → `422 unknown_document_type` (`fields.typeCode`)
   * → `409 document_under_review` (já há um deste tipo aguardando o revisor; acréscimo ao §3).
   */
  requestUploadUrl(input: DocumentUploadRequest): Promise<Result<DocumentUploadTarget>>;
  /**
   * Confirma o envio (o servidor confere o objeto). `409 upload_missing` (objeto ausente, ou tamanho
   * ou hash diferentes do declarado) · `404 not_found` (não é deste motorista) · `409
   * invalid_transition` (já foi decidido; acréscimo ao §3). Já `submitted` = devolve o mesmo 200.
   */
  submitDocument(documentId: string): Promise<Result<{ readonly status: 'submitted' }>>;
}

/**
 * O `PUT` do arquivo na URL assinada (não é rota da API: vai direto ao armazenamento). Porta própria
 * para o mock simular progresso e falha; o adaptador real entra com o D3.
 * Falhas: `network` (sem conexão) · `forbidden` com `code: 'upload_url_expired'` (peça outra URL).
 */
export interface DocumentUploadPort {
  upload(target: DocumentUploadTarget, source: UploadSource, onProgress?: (fraction: number) => void): Promise<Result<void>>;
}

/** Catálogo FECHADO dos `code` do cadastro do motorista (mock e http usam o mesmo). */
export const DRIVER_ONBOARDING_ERRORS = {
  invalid_body: { status: 400, message: 'Dados inválidos.' },
  unauthorized: { status: 401, message: 'Sessão expirada.' },
  not_found: { status: 404, message: 'Documento não encontrado.' },
  application_not_approved: { status: 409, message: 'Não encontramos uma candidatura aprovada para este e-mail.' },
  email_not_verified: { status: 409, message: 'Confirme seu e-mail antes de continuar.' },
  driver_not_linked: { status: 409, message: 'Sua conta ainda não está ligada a uma candidatura aprovada.' },
  plate_in_use: { status: 409, message: 'Esta placa já está cadastrada.' },
  upload_missing: { status: 409, message: 'O arquivo não chegou completo. Envie de novo.' },
  document_under_review: { status: 409, message: 'Este documento já está em análise.' },
  invalid_transition: { status: 409, message: 'Este documento já foi analisado.' },
  file_too_large: { status: 413, message: 'O arquivo passa de 10 MB.', field: 'sizeBytes' },
  invalid_cpf: { status: 422, message: 'CPF inválido.', field: 'cpf' },
  cnh_without_ear: { status: 422, message: 'A CNH precisa ter a observação EAR (exerce atividade remunerada).', field: 'cnh.ear' },
  vehicle_too_old: { status: 422, message: 'O veículo passa da idade máxima aceita.', field: 'year' },
  unknown_document_type: { status: 422, message: 'Tipo de documento desconhecido.', field: 'typeCode' },
  rate_limited: { status: 429, message: 'Muitas tentativas. Aguarde um pouco.' },
  unavailable: { status: 503, message: 'Serviço indisponível no momento.' },
} as const satisfies ErrorCatalog;

export type DriverOnboardingErrorCode = keyof typeof DRIVER_ONBOARDING_ERRORS;
