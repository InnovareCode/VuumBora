/**
 * Regras puras do cadastro do motorista (M3, fatia K0 do `docs/plano-m3-m4.md`): estados da
 * verificação, documentos, veículo e a regra de "pode ficar online". O mock do `api-client` usa
 * estas funções para responder igual ao servidor, e o app usa as mesmas para validar antes de enviar.
 *
 * Nunca importar a partir de `apps/passenger` (é `@vuumbora/domain/driver`).
 */

/**
 * Estado do cadastro como o APP vê (`GET /v1/driver/verification` → `status`). É derivado no
 * servidor (`deriveVerificationStatus`), não é a coluna `drivers.status`. Os nomes são os da ficha
 * M04 (`docs/fichas-de-tela/M04-analise-cadastral.md`), com `suspended` a mais (D5).
 *
 * - `not_started`: a conta ainda não está ligada a uma candidatura aprovada (chame `linkApplication`).
 * - `pending_documents`: falta a etapa 2, o veículo, ou algum documento obrigatório (ausente ou vencido).
 * - `under_review`: tudo enviado; algum documento aguarda o revisor.
 * - `changes_requested`: algum documento obrigatório foi recusado; o motivo vem no documento.
 * - `approved`: cadastro aprovado (N4: acontece sozinho ao aprovar o último documento). Documento
 *   vencido depois disso NÃO muda este estado: bloqueia só o "ficar online" (`goOnlineBlocker`).
 * - `suspended`: suspenso pelo revisor.
 */
export type VerificationStatus =
  | 'not_started'
  | 'pending_documents'
  | 'under_review'
  | 'changes_requested'
  | 'approved'
  | 'suspended';

/**
 * Estado de UM documento, como sai para o app e para o painel. O documento que só pediu a URL de
 * envio e ainda não foi enviado (`submit`) não aparece em lista nenhuma: é envio em andamento.
 * `expired` é o documento aprovado cuja validade passou (rotina diária do D5).
 */
export type DriverDocumentStatus = 'submitted' | 'approved' | 'rejected' | 'expired';

/** Tipos de arquivo aceitos no envio de documento (`POST /v1/driver/documents/upload-url`). */
export const DOCUMENT_CONTENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type DocumentContentType = (typeof DOCUMENT_CONTENT_TYPES)[number];

/** Tamanho máximo de um documento: 10 MiB (10 × 1024 × 1024 bytes). Acima disso, `413 file_too_large`. */
export const DOCUMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;

/** Validade máxima de uma URL assinada de documento (envio e visualização), em segundos. */
export const DOCUMENT_URL_MAX_TTL_SECONDS = 300;

export function isDocumentContentType(value: unknown): value is DocumentContentType {
  return typeof value === 'string' && (DOCUMENT_CONTENT_TYPES as readonly string[]).includes(value);
}

/** SHA-256 em hexadecimal minúsculo, 64 caracteres. */
export function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

/**
 * O que há de errado com um pedido de envio, na ordem em que o servidor confere: forma do corpo
 * (`invalid_body`) e depois tamanho (`file_too_large`). `null` = pode pedir a URL. O tipo de
 * documento (`unknown_document_type`) depende da lista vigente e é conferido fora daqui.
 */
export function documentUploadProblem(input: {
  readonly contentType: unknown;
  readonly sizeBytes: unknown;
  readonly sha256: unknown;
}): 'invalid_body' | 'file_too_large' | null {
  const { contentType, sizeBytes, sha256 } = input;
  if (!isDocumentContentType(contentType) || !isSha256Hex(sha256)) return 'invalid_body';
  if (typeof sizeBytes !== 'number' || !Number.isInteger(sizeBytes) || sizeBytes <= 0) return 'invalid_body';
  if (sizeBytes > DOCUMENT_MAX_SIZE_BYTES) return 'file_too_large';
  return null;
}

/** Placa sem traço nem espaço, em maiúsculas (`abc-1d23` → `ABC1D23`). */
export function normalizePlate(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

/** Placa brasileira: antiga (`ABC1234`) ou Mercosul (`ABC1D23`), depois de `normalizePlate`. */
export function isValidPlate(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizePlate(value));
}

/**
 * `true` se o veículo passou da idade máxima (que vem da configuração `driver_settings`, não daqui).
 * Idade = ano corrente − ano do veículo; passa do limite quando é MAIOR que `maxAgeYears`
 * (`422 vehicle_too_old`).
 */
export function isVehicleTooOld(year: number, options: { readonly maxAgeYears: number; readonly currentYear: number }): boolean {
  const { maxAgeYears, currentYear } = options;
  for (const [label, value] of [['year', year], ['maxAgeYears', maxAgeYears], ['currentYear', currentYear]] as const) {
    if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} precisa ser inteiro não negativo (recebido: ${value})`);
  }
  return currentYear - year > maxAgeYears;
}

/**
 * Data do calendário em Natal (UTC−3 fixo; o Brasil não tem horário de verão desde 2019), no formato
 * `AAAA-MM-DD`. É o "hoje" que decide se um documento venceu.
 */
export function natalCalendarDate(epochMs: number): string {
  if (!Number.isFinite(epochMs)) throw new RangeError(`epochMs precisa ser finito (recebido: ${epochMs})`);
  return new Date(epochMs - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** `AAAA-MM-DD` que existe no calendário (recusa `2027-02-30`). */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Documento vencido em `today` (`AAAA-MM-DD`, ver `natalCalendarDate`). A validade é o ÚLTIMO dia
 * válido: vence no dia seguinte. `status: 'expired'` (marcado pela rotina diária) também conta.
 */
export function isDocumentExpired(document: { readonly status: DriverDocumentStatus; readonly expiresOn?: string }, today: string): boolean {
  if (document.status === 'expired') return true;
  return document.status === 'approved' && document.expiresOn !== undefined && document.expiresOn < today;
}

/** Os fatos de que a derivação do estado precisa (o servidor lê do banco; o mock, da memória). */
export interface VerificationFacts {
  /** A conta está ligada a uma candidatura aprovada (`drivers.application_id`). */
  readonly linked: boolean;
  /** `drivers.status` resumido: só `approved` e `suspended` mudam a derivação. */
  readonly accountStatus: 'pending_review' | 'approved' | 'suspended';
  /** Etapa 2 enviada (`PUT /v1/driver/onboarding`). */
  readonly profileSubmitted: boolean;
  /** Veículo ativo cadastrado (`PUT /v1/driver/vehicle`). */
  readonly vehicleRegistered: boolean;
  /** Um item por exigência da lista vigente, com o estado do documento MAIS RECENTE daquele tipo (ausente = nunca enviado). */
  readonly requirements: readonly { readonly required: boolean; readonly documentStatus?: DriverDocumentStatus }[];
}

/**
 * O `status` de `GET /v1/driver/verification`. Precedência: `not_started` → `suspended` → `approved`
 * → `changes_requested` (há motivo a mostrar) → `pending_documents` → `under_review`.
 */
export function deriveVerificationStatus(facts: VerificationFacts): VerificationStatus {
  if (!facts.linked) return 'not_started';
  if (facts.accountStatus === 'suspended') return 'suspended';
  if (facts.accountStatus === 'approved') return 'approved';
  const required = facts.requirements.filter((requirement) => requirement.required);
  if (required.some((requirement) => requirement.documentStatus === 'rejected')) return 'changes_requested';
  const missing = required.some(
    (requirement) => requirement.documentStatus === undefined || requirement.documentStatus === 'expired',
  );
  if (!facts.profileSubmitted || !facts.vehicleRegistered || missing) return 'pending_documents';
  return 'under_review';
}

/**
 * N4: a conta vira `approved` SOZINHA, na mesma transação em que o último documento obrigatório é
 * aprovado — com etapa 2, veículo e candidatura ligada. Conta suspensa nunca é aprovada por aqui.
 */
export function isReadyForApproval(facts: VerificationFacts): boolean {
  if (!facts.linked || facts.accountStatus !== 'pending_review') return false;
  if (!facts.profileSubmitted || !facts.vehicleRegistered) return false;
  return facts.requirements
    .filter((requirement) => requirement.required)
    .every((requirement) => requirement.documentStatus === 'approved');
}

/** Por que o motorista NÃO pode ficar online (`PUT /v1/driver/availability` com `online: true`). */
export type GoOnlineBlocker = 'driver_not_approved' | 'document_expired';

/**
 * A regra de disponibilidade do M3: `driver_not_approved` se o cadastro não está `approved`;
 * `document_expired` se algum documento OBRIGATÓRIO venceu em `today`; `null` = pode ficar online.
 * Vale só para ENTRAR online: ficar offline funciona sempre (R7 da F08).
 */
export function goOnlineBlocker(
  verification: {
    readonly status: VerificationStatus;
    readonly requirements: readonly {
      readonly required: boolean;
      readonly document?: { readonly status: DriverDocumentStatus; readonly expiresOn?: string };
    }[];
  },
  today: string,
): GoOnlineBlocker | null {
  if (verification.status !== 'approved') return 'driver_not_approved';
  const expired = verification.requirements.some(
    (requirement) => requirement.required && requirement.document !== undefined && isDocumentExpired(requirement.document, today),
  );
  return expired ? 'document_expired' : null;
}
