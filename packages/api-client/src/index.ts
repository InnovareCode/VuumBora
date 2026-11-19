/**
 * @vuumbora/api-client — contrato entre a UI e qualquer fonte de dados.
 *
 * Padrão portas & adaptadores: as telas dependem só das INTERFACES (portas).
 * Cada porta terá dois adaptadores: `mock` (protótipo, Fase 1) e `http` (Etapa E).
 * Não existe adaptador padrão: o app escolhe explicitamente — nenhuma chamada pode ser
 * "implicitamente falsa" (ARQUITETURA_E_REGRAS.md).
 */
import type { DataOrigin } from '@vuumbora/domain';

export type AdapterMode = 'mock' | 'http';

export interface ClientConfig {
  /** Obrigatório, sem default. */
  readonly mode: AdapterMode;
  /** Exigido quando mode === 'http'. Vem de configuração de build, nunca hardcoded. */
  readonly baseUrl?: string;
}

/** Contrato de erro único para as duas apps. A UI mapeia `kind` para estados de erro/retry. */
export type ApiError =
  | { readonly kind: 'network'; readonly retryable: true }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'conflict'; readonly reason: string }
  | { readonly kind: 'validation'; readonly fields: Readonly<Record<string, string>> }
  | { readonly kind: 'rate_limited'; readonly retryAfterSeconds?: number }
  | { readonly kind: 'unavailable'; readonly retryable: true }
  | { readonly kind: 'unknown'; readonly message: string };

/** Toda resposta carrega a origem do dado para a UI poder sinalizar "demonstração". */
export type Result<T> =
  | { readonly ok: true; readonly data: T; readonly origin: DataOrigin }
  | { readonly ok: false; readonly error: ApiError };

/** Porta comum de autenticação (o papel — passageiro/motorista — é decidido pelo backend). */
export interface AuthPort {
  signIn(input: { readonly login: string; readonly password: string }): Promise<Result<{ readonly sessionId: string }>>;
  signOut(): Promise<Result<void>>;
}
