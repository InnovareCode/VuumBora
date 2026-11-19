/**
 * Porta pública da candidatura de pré-cadastro de motorista (site
 * institucional) — etapa 1 de 2 (ver docs/decisoes-do-dono.md → "DECISÃO:
 * duas etapas", 19/11/2026). Endereço, CEP e documentos são a etapa 2 e
 * não fazem parte deste contrato.
 *
 * Fora do padrão passageiro/motorista: só `apps/site` consome isto — nunca
 * os apps mobile. Por isso vive no seu próprio subcaminho, não em
 * `/passenger` nem em `/driver`.
 *
 * Endpoint e tabela SEPARADOS da lista de espera simples
 * (`packages/api-client/src/waitlist`, endpoint `/v1/waitlist`): são
 * públicos e fluxos diferentes. Esta porta não troca nem remove aquela.
 *
 * Contrato HTTP real (campos, códigos de erro, rate limit) documentado em
 * `docs/lista-de-espera.md`. Implementação do servidor em `apps/api`.
 *
 * Só existe adaptador `http` — não há `mock`, porque a candidatura não faz
 * parte do protótipo dos apps.
 */
import type { ApiError, ClientConfig, Result } from '../index';

export interface DriverApplicationInput {
  readonly name: string;
  /** Qualquer formato que a pessoa digite (com/sem DDI, parênteses, espaço, hífen) — o servidor normaliza. */
  readonly phone: string;
  readonly email: string;
  readonly city: string;
  /** Sigla de UF (ex. "RN"). Qualquer UF brasileira é aceita; o dono filtra por região depois. */
  readonly state: string;
  /** Opcional — sem resposta, a candidatura ainda é válida. */
  readonly alreadyDrivesForApp?: boolean;
  /** Opcional — sem resposta, a candidatura ainda é válida. */
  readonly hasOwnVehicle?: boolean;
}

export interface DriverApplicationPort {
  /**
   * Sempre devolve sucesso igual para e-mail novo ou já candidatado (anti-
   * enumeração): quem chama nunca descobre se um e-mail já se candidatou.
   * Por isso não existe `idempotencyKey` aqui — o e-mail já É a chave
   * natural de deduplicação, garantida no banco.
   */
  apply(input: DriverApplicationInput): Promise<Result<void>>;
}

interface DriverApplicationErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    /** Presente quando `code === 'validation_failed'` — uma mensagem por campo inválido. */
    readonly fields?: Readonly<Record<string, string>>;
  };
}

function mapStatusToError(status: number, body: unknown): ApiError {
  if (status === 400) {
    const errorBody = body as DriverApplicationErrorBody | undefined;
    const fields = errorBody?.error?.fields;
    if (fields && Object.keys(fields).length > 0) {
      return { kind: 'validation', fields };
    }
    // Corpo malformado (`invalid_body`, sem campo específico para apontar — ver docs/lista-de-espera.md):
    // não é erro de um campo do formulário, então não cabe em `validation`.
    return { kind: 'unknown', message: errorBody?.error?.message ?? 'Corpo da requisição inválido.' };
  }
  if (status === 429) return { kind: 'rate_limited' };
  if (status >= 500) return { kind: 'unavailable', retryable: true };
  return { kind: 'unknown', message: `status HTTP ${status}` };
}

/** `config.baseUrl` é o mesmo endereço do `vuumbora-backend` usado pela lista de espera. */
export function createDriverApplicationHttpAdapter(config: ClientConfig): DriverApplicationPort {
  if (config.mode !== 'http' || !config.baseUrl) {
    throw new Error('createDriverApplicationHttpAdapter exige ClientConfig { mode: "http", baseUrl }');
  }
  const { baseUrl } = config;

  return {
    async apply(input) {
      try {
        const response = await fetch(`${baseUrl}/v1/driver-applications`, {
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
