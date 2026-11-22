/**
 * `@vuumbora/api-client/trip` — o que `./passenger` e `./driver` precisam concordar sobre uma
 * corrida (status, eventos de tempo real). Nenhum perfil importa o subcaminho do outro: o que é
 * comum mora aqui.
 */
export type { CancelActor, TripDriverSummary, TripEvent, TripRealtimePort, TripSnapshot } from './types';
export { createTripStore } from './mock-store';
export type { TripStore } from './mock-store';
export { createIdempotencyCache } from './idempotency';
export type { IdempotencyCache } from './idempotency';
