/** Portas do MOTORISTA. Proposta — contrato HTTP definitivo na Etapa E. Nunca importar em apps/passenger. */
import type { TripId } from '@vuumbora/domain';
import type { DriverPhase, RideOffer, VerificationStatus } from '@vuumbora/domain/driver';
import type { Result } from '../index';

export interface DriverJourneyPort {
  verification(): Promise<Result<{ readonly status: VerificationStatus }>>;
  /** Sem sucesso otimista: a fase só muda com a resposta do servidor. */
  setOnline(online: boolean): Promise<Result<{ readonly phase: DriverPhase }>>;
}

export interface DriverOfferPort {
  /** Aceite atômico no servidor; `conflict` se outra atribuição venceu. */
  accept(offer: RideOffer, idempotencyKey: string): Promise<Result<{ readonly tripId: TripId }>>;
  decline(offer: RideOffer): Promise<Result<void>>;
}
