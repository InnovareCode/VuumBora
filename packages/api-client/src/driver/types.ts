/**
 * Tipos e portas do MOTORISTA: jornada, oferta (despacho, §6.2) e corrida depois do aceite.
 * Interfaces aqui (não em `index.ts`) para o mock poder importá-las sem depender do barril
 * público — mesmo padrão de `identity/types.ts`.
 */
import type { TripId } from '@vuumbora/domain';
import type { DriverPhase, RideOffer, VerificationStatus } from '@vuumbora/domain/driver';
import type { Result } from '../index';
import type { TripRealtimePort, TripSnapshot } from '../trip/types';

export interface DriverJourneyPort {
  verification(): Promise<Result<{ readonly status: VerificationStatus }>>;
  /** Sem sucesso otimista: a fase só muda com a resposta do servidor. */
  setOnline(online: boolean): Promise<Result<{ readonly phase: DriverPhase }>>;
}

export interface DriverOfferPort {
  /** Aceite atômico no servidor (§6.2/§5.4). `409 conflict`: `offer_taken` ou `offer_expired`. */
  accept(offer: RideOffer, idempotencyKey: string): Promise<Result<{ readonly tripId: TripId }>>;
  /** Idempotente: recusar de novo, ou uma oferta que já não vale mais, não falha nem conta como erro. */
  decline(offer: RideOffer): Promise<Result<void>>;
}

export interface DriverTripPort extends TripRealtimePort {
  status(tripId: TripId): Promise<Result<TripSnapshot>>;
  /**
   * Cancelamento do motorista depois do aceite (plano-sistema.md §6.1): em `driver_assigned` ou
   * `driver_en_route` a corrida VOLTA para a busca — o passageiro não perde o pedido. `409
   * conflict` (`reason: 'invalid_transition'`) numa fase terminal.
   */
  cancel(tripId: TripId, idempotencyKey: string): Promise<Result<void>>;
}
