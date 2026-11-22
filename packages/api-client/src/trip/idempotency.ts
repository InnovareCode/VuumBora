/**
 * Cache de resultado por `idempotencyKey`, com o achado A4 da conferência da Nova
 * (`docs/contratos/conferencia-f08-nova.md`): a MESMA chave com um corpo DIFERENTE é um erro, não
 * um sucesso em silêncio. Guarda a `fingerprint` do corpo junto com o resultado; quem chama compara
 * antes de reusar — ver `requestConflict('idempotency_key_reused')` etc. em `trip/result.ts`.
 */
export interface IdempotencyRecord<T> {
  readonly fingerprint: string;
  readonly result: T;
}

export interface IdempotencyCache<T> {
  get(key: string): IdempotencyRecord<T> | undefined;
  set(key: string, fingerprint: string, result: T): void;
}

export function createIdempotencyCache<T>(): IdempotencyCache<T> {
  const cache = new Map<string, IdempotencyRecord<T>>();
  return {
    get: (key) => cache.get(key),
    set: (key, fingerprint, result) => {
      cache.set(key, { fingerprint, result });
    },
  };
}

/**
 * Impressão determinística do corpo da chamada, só para comparar "é a mesma chamada de novo?" —
 * NÃO é hash de segurança. Ordena chaves de objeto recursivamente para não depender da ordem de
 * inserção.
 */
export function fingerprint(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}
