/**
 * `@vuumbora/api-client/trip` — o que `./passenger` e `./driver` precisam concordar sobre uma
 * corrida (status base, eventos de tempo real, idempotência). Nenhum perfil importa o subcaminho
 * do outro: o que é comum mora aqui.
 */
export type { CancelActor, TripBaseSnapshot, TripEvent, TripHistoryPage, TripRealtimePort } from './types';
export { createTripStore, DRIVER_ASSIGNED_STATUSES } from './mock-store';
export type { TripStore, TripStoreRecord } from './mock-store';
export { createIdempotencyCache, fingerprint } from './idempotency';
export type { IdempotencyCache, IdempotencyRecord } from './idempotency';
export {
  acceptConflict,
  availabilityConflict,
  cancelConflict,
  driverActionConflict,
  failWith,
  notFound,
  quoteConflict,
  requestConflict,
  succeed,
  validation,
} from './result';
export type {
  AcceptConflictReason,
  AvailabilityConflictReason,
  CancelConflictReason,
  DriverActionConflictReason,
  QuoteConflictReason,
  RequestConflictReason,
} from './result';
