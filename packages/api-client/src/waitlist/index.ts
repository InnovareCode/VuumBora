/**
 * Porta pública da lista de espera (site institucional).
 *
 * Fora do padrão passageiro/motorista: só `apps/site` consome isto — nunca
 * os apps mobile. Por isso vive no seu próprio subcaminho, não em
 * `/passenger` nem em `/driver` (e `check:boundaries` não aplica a regra de
 * perfil cruzado a este arquivo, já que o nome da pasta não é nenhum dos dois).
 *
 * Contrato HTTP real (campos, códigos de erro, rate limit) documentado em
 * `docs/lista-de-espera.md`. Implementação do servidor em `apps/api`.
 *
 * Só existe adaptador `http` — não há `mock`, porque a lista de espera não
 * faz parte do protótipo dos apps.
 */
import type { ApiError, ClientConfig, Result } from '../index';

export type WaitlistProfile = 'passenger' | 'driver';

export interface WaitlistSignupInput {
  readonly email: string;
  /** Opcional — sem perfil, a inscrição ainda é válida. */
  readonly profile?: WaitlistProfile;
}

export interface WaitlistPort {
  /**
   * Sempre devolve sucesso igual para e-mail novo ou já inscrito (anti-
   * enumeração): quem chama nunca descobre se um e-mail já está cadastrado.
   * Por isso não existe `idempotencyKey` aqui como nas portas de corrida —
   * o e-mail já É a chave natural de deduplicação, garantida no banco.
   */
  signUp(input: WaitlistSignupInput): Promise<Result<void>>;
}

interface WaitlistErrorBody {
  readonly error?: { readonly code?: string; readonly message?: string };
}

function mapStatusToError(status: number, body: unknown): ApiError {
  if (status === 400) {
    const errorBody = body as WaitlistErrorBody | undefined;
    const code = errorBody?.error?.code;
    const message = errorBody?.error?.message ?? 'dados inválidos';
    const field = code === 'invalid_profile' ? 'profile' : 'email';
    return { kind: 'validation', fields: { [field]: message } };
  }
  if (status === 429) return { kind: 'rate_limited' };
  if (status >= 500) return { kind: 'unavailable', retryable: true };
  return { kind: 'unknown', message: `status HTTP ${status}` };
}

/** `config.baseUrl` é o endereço do serviço `vuumbora-backend` (ver docs/lista-de-espera.md). */
export function createWaitlistHttpAdapter(config: ClientConfig): WaitlistPort {
  if (config.mode !== 'http' || !config.baseUrl) {
    throw new Error('createWaitlistHttpAdapter exige ClientConfig { mode: "http", baseUrl }');
  }
  const { baseUrl } = config;

  return {
    async signUp(input) {
      try {
        const response = await fetch(`${baseUrl}/v1/waitlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const json: unknown = await response.json().catch(() => undefined);

        if (!response.ok) {
          return { ok: false, error: mapStatusToError(response.status, json) };
        }
        return { ok: true, data: undefined, origin: 'real' };
      } catch {
        return { ok: false, error: { kind: 'network', retryable: true } };
      }
    },
  };
}
