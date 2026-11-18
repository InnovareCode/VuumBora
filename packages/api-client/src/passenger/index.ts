/** Portas do PASSAGEIRO. Proposta — contrato HTTP definitivo na Etapa E. Nunca importar em apps/driver. */
import type { Place, TripId, TripStatus } from '@vuumbora/domain';
import type { FareEstimate, RideDraft } from '@vuumbora/domain/passenger';
import type { Result } from '../index';

export interface PassengerRidePort {
  quote(draft: RideDraft): Promise<Result<readonly FareEstimate[]>>;
  /** `idempotencyKey` evita corrida duplicada em retry/reconexão. */
  request(draft: RideDraft, idempotencyKey: string): Promise<Result<{ readonly tripId: TripId }>>;
  status(tripId: TripId): Promise<Result<{ readonly status: TripStatus }>>;
  cancel(tripId: TripId, idempotencyKey: string): Promise<Result<void>>;
}

export interface PlacesPort {
  search(query: string): Promise<Result<readonly Place[]>>;
}
