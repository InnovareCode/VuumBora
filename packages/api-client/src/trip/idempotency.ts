/**
 * Cache de resultado por `idempotencyKey`: a MESMA chave sempre devolve a MESMA resposta, sem
 * repetir o efeito (plano-sistema.md §6.2 "aceite atômico"; `packages/api-client/README.md`
 * "ações críticas exigem idempotencyKey"). Usado por `request`/`cancel` (passageiro) e
 * `accept`/`cancel` (motorista) nos mocks — o adaptador `http` real faz o mesmo no servidor.
 */
export interface IdempotencyCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
}

export function createIdempotencyCache<T>(): IdempotencyCache<T> {
  const cache = new Map<string, T>();
  return {
    get: (key) => cache.get(key),
    set: (key, value) => {
      cache.set(key, value);
    },
  };
}
