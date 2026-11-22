/**
 * Tipos e porta do PASSAGEIRO: cotação (§6.4), corrida e tempo real (§6.1–§6.2).
 * `PassengerRidePort` mora aqui (não em `index.ts`) para o mock poder importá-la sem depender do
 * barril público — mesmo padrão de `identity/types.ts` + `identity/mock-adapter.ts`.
 */
import type { Place, TripId } from '@vuumbora/domain';
import type { FareEstimate, RideDraft } from '@vuumbora/domain/passenger';
import type { Result } from '../index';
import type { TripRealtimePort, TripSnapshot } from '../trip/types';

/** §5.3: oferta pequena = espera maior. A UI avisa ANTES do pedido, não só depois de demorar. */
export type CategoryAvailability = 'high' | 'low' | 'none';

export interface CategoryQuote {
  readonly categoryId: string;
  readonly estimate: FareEstimate;
  readonly availability: CategoryAvailability;
}

/**
 * `POST /v1/quotes` (§6.4): assinada pelo servidor, com validade. O app nunca envia preço — envia
 * o `quoteId`. Vencida: `request` recusa com `409 conflict` (`reason: 'quote_expired'`).
 */
export interface Quote {
  readonly quoteId: string;
  /** ISO 8601 com offset. */
  readonly expiresAt: string;
  readonly categories: readonly CategoryQuote[];
}

export interface RequestRideInput {
  readonly quoteId: string;
  readonly categoryId: string;
  readonly paymentMethodId: string;
}

export interface PassengerRidePort extends TripRealtimePort {
  /** Sem sessão de corrida ainda — só preço e disponibilidade por categoria. */
  quote(draft: RideDraft): Promise<Result<Quote>>;
  /**
   * `idempotencyKey` evita corrida duplicada em retry/reconexão. `409 conflict`:
   * `quote_expired` (cotação vencida) ou `category_unavailable` (categoria desligada/sem oferta).
   */
  request(input: RequestRideInput, idempotencyKey: string): Promise<Result<{ readonly tripId: TripId }>>;
  status(tripId: TripId): Promise<Result<TripSnapshot>>;
  /** `409 conflict` (`reason: 'invalid_transition'`) se a corrida já estiver numa fase terminal. */
  cancel(tripId: TripId, idempotencyKey: string): Promise<Result<void>>;
}

export interface PlacesPort {
  search(query: string): Promise<Result<readonly Place[]>>;
}
