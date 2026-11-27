/**
 * Regras puras da cotação (M4, fatia K0 do `docs/plano-m3-m4.md`, N8 e N9). Mora na raiz: o app do
 * passageiro mostra a validade, o servidor confere a mesma validade em `GET /v1/quotes/:id` e, no
 * M5, em `POST /v1/trips`.
 *
 * - **N9:** a cotação é assinada, vale 5 minutos e tem preço fechado. Vencida = `409 quote_expired`.
 * - **N8:** tarifa nasce versionada, com `is_test`. Com `ALLOW_TEST_FARES` desligada (produção), uma
 *   versão de teste NÃO cota: a resposta é `503 fare_not_configured`. A tarifa de teste nunca chega a
 *   passageiro real.
 *
 * O cálculo do preço em si (centavos, arredondamento "meio para cima, uma vez, no total") é a fatia
 * G2, não esta.
 */

/** Validade de uma cotação, em segundos (N9: 5 minutos). */
export const QUOTE_TTL_SECONDS = 300;

/** Instante (ms desde a época) em que vence uma cotação emitida em `issuedAtMs`. */
export function quoteExpiresAtMs(issuedAtMs: number): number {
  if (!Number.isFinite(issuedAtMs)) throw new RangeError(`issuedAtMs precisa ser finito (recebido: ${issuedAtMs})`);
  return issuedAtMs + QUOTE_TTL_SECONDS * 1000;
}

/**
 * `true` se a cotação já venceu em `nowMs`. O instante da validade já é vencido (`now >= expiresAt`).
 * Data ilegível conta como VENCIDA: falha fechada, nunca um preço eterno.
 */
export function isQuoteExpired(expiresAt: string, nowMs: number): boolean {
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) return true;
  return nowMs >= expiresAtMs;
}

/** O que importa de uma versão de tarifa para decidir se ela pode cotar. */
export interface FareVersionFlags {
  readonly isTest: boolean;
}

/**
 * N8: uma versão de tarifa cota se for real, ou se for de teste com `allowTestFares` ligado
 * (desenvolvimento e homologação). `false` aqui é `503 fare_not_configured`.
 */
export function isFareVersionQuotable(version: FareVersionFlags, options: { readonly allowTestFares: boolean }): boolean {
  return !version.isTest || options.allowTestFares;
}
