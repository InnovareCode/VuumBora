/**
 * @vuumbora/api-client — contrato entre a UI e qualquer fonte de dados.
 *
 * Padrão portas & adaptadores: as telas dependem só das INTERFACES (portas).
 * Cada porta terá dois adaptadores: `mock` (protótipo, Fase 1) e `http` (Etapa E).
 * Não existe adaptador padrão: o app escolhe explicitamente — nenhuma chamada pode ser
 * "implicitamente falsa" (ARQUITETURA_E_REGRAS.md).
 */
import type { DataOrigin } from '@vuumbora/domain';
import type { CurrentLegal } from './identity/types';

export type AdapterMode = 'mock' | 'http';

export interface ClientConfig {
  /** Obrigatório, sem default. */
  readonly mode: AdapterMode;
  /** Exigido quando mode === 'http'. Vem de configuração de build, nunca hardcoded. */
  readonly baseUrl?: string;
}

/** A família do erro. A UI mapeia `kind` para estados de erro/retry — o `kind` é estável. */
export type ApiErrorKind =
  | { readonly kind: 'network'; readonly retryable: true }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'conflict'; readonly reason: string }
  | { readonly kind: 'validation'; readonly fields: Readonly<Record<string, string>> }
  | { readonly kind: 'rate_limited'; readonly retryAfterSeconds?: number }
  | { readonly kind: 'unavailable'; readonly retryable: true }
  | { readonly kind: 'unknown'; readonly message: string };

/**
 * Detalhes OPCIONAIS que o servidor devolve junto do erro. Qualquer `kind` pode trazê-los; quem não os conhece
 * ignora. A UI decide texto e ação pelo `code` (ex.: `invalid_code`, `email_not_verified`, `too_many_attempts`),
 * nunca pela mensagem. Só `apps/api` define os valores — ver `docs/contrato-identidade-apps.md`.
 */
export interface ApiErrorExtras {
  /** Código do servidor (`error.code` do envelope). Ausente em erro que não veio do servidor (`network`). */
  readonly code?: string;
  /** Tentativas restantes do código (`invalid_code`). */
  readonly attemptsLeft?: number;
  /** Espera, em segundos, antes de tentar de novo (`too_many_attempts`, `reset_locked`). */
  readonly retryAfterSeconds?: number;
  /**
   * Só no `409 consent_outdated` (cadastro e reaceite): os Termos e a Política VIGENTES do perfil, no mesmo formato de
   * `legalCurrent()`. É o que a tela mostra de novo antes de reenviar. Ausente se o corpo do 409 não trouxe uma
   * `current` válida: nesse caso a tela chama `legalCurrent()`. O cliente NUNCA reenvia sozinho com a versão nova:
   * quem aceita tem de ver o texto.
   */
  readonly current?: CurrentLegal;
}

/** Contrato de erro único para as duas apps: o `kind` de sempre + os extras do servidor. */
export type ApiError = ApiErrorKind & ApiErrorExtras;

/** Toda resposta carrega a origem do dado para a UI poder sinalizar "demonstração". */
export type Result<T> =
  | { readonly ok: true; readonly data: T; readonly origin: DataOrigin }
  | { readonly ok: false; readonly error: ApiError };

/**
 * Página de lista por cursor (contratos do M3 e do M4: fila de documentos, versões de tarifa). `nextCursor`
 * ausente = não há próxima página. Nenhuma porta devolve "todos os registros" sem limite.
 */
export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
}

/** Erro do servidor → `ApiError` (M3/M4): o mock e o http usam a mesma função e o mesmo catálogo. */
export { apiErrorFromServerReply, catalogError, fieldsOfCatalog, NETWORK_FAILURE } from './server-error';
export type { ErrorCatalog, ErrorCatalogEntry, FieldByCode, ServerErrorReply } from './server-error';

/*
 * A porta de autenticação mora em `@vuumbora/api-client/identity` (contrato: docs/contrato-identidade-apps.md):
 * `createIdentityClient({ mode, baseUrl, accountType })`. O `AuthPort` antigo (`signIn` → `sessionId`, "papel decidido
 * pelo backend") foi removido: não tinha `accountType`, tokens nem renovação, e nenhuma tela o usava.
 */
