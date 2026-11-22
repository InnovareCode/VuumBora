/**
 * Tipos e porta do PASSAGEIRO: cotação (§6.2), corrida e tempo real. `PassengerRidePort` mora
 * aqui (não em `index.ts`) para o mock poder importá-la sem depender do barril público — mesmo
 * padrão de `identity/types.ts` + `identity/mock-adapter.ts`.
 *
 * Revisado na conferência da Nova (`docs/contratos/conferencia-f08-nova.md`, bloco B):
 * - **B1**: um `quoteId` POR CATEGORIA (não um só para todas); `kind` (`ride`/`delivery`) escolhe
 *   o conjunto de categorias; categoria DESLIGADA (Entrega, Motorista mulher até a D-08) não volta
 *   na cotação; `availability: 'none'` é só "sem motorista estimado agora" — o pedido é aceito
 *   mesmo assim (termina em `failed` se ninguém aparecer).
 * - **B2**: `request` devolve `{ tripId, status }` — a corrida pode ficar em `requested` (Pix
 *   antes da corrida, S5), não só em `searching_driver`.
 * - **B3**: `cancel` recebe `reason?` e devolve `{ status, cancellationFee? }`, não `void`.
 * - **B4**: o snapshot do passageiro (`PassengerTripSnapshot`) é o dele — não é o do motorista.
 */
import type { Money, Place, TripId, TripStatus } from '@vuumbora/domain';
import type { FareEstimate } from '@vuumbora/domain/passenger';
import type { Result } from '../index';
import type { TripBaseSnapshot, TripRealtimePort } from '../trip/types';

/** §5.3: oferta pequena = espera maior. NÃO bloqueia o pedido — só avisa antes (ver B1). */
export type CategoryAvailability = 'high' | 'low' | 'none';

export interface CategoryQuote {
  readonly categoryId: string;
  /** Cotação DESTA categoria — cada uma com a própria validade (B1; `fare_quotes` no anexo de dados). */
  readonly quoteId: string;
  /** ISO 8601 com offset. */
  readonly expiresAt: string;
  readonly estimate: FareEstimate;
  readonly distanceM: number;
  readonly durationS: number;
  readonly pickupEtaS: number;
  readonly availability: CategoryAvailability;
}

/** `POST /v1/quotes`. Categorias desligadas simplesmente não aparecem na lista. */
export interface Quote {
  readonly categories: readonly CategoryQuote[];
}

export interface QuoteInput {
  readonly origin: Place;
  readonly destination: Place;
  /** Padrão `'ride'`. Entrega está desligada (§13.3): `kind: 'delivery'` sempre volta sem categorias. */
  readonly kind?: 'ride' | 'delivery';
}

/** A categoria vem da cotação (B1) — não existe mais `categoryId` aqui. */
export interface RequestRideInput {
  readonly quoteId: string;
  readonly paymentMethodId: string;
}

/** Provisório — valores finais saem no M6 (decisão 15). */
export type CancelReason = 'change_of_plans' | 'driver_too_far' | 'found_another_way' | 'other';

export interface TripDriverSummary {
  readonly driverId: string;
  readonly firstName: string;
  readonly plate: string;
}

/**
 * Snapshot do PASSAGEIRO (B4). `driver` só aparece enquanto a corrida tem motorista atribuído —
 * depois de uma volta para a busca (ou cancelamento), desaparece (A2): nunca mostra o motorista
 * antigo.
 */
export interface PassengerTripSnapshot extends TripBaseSnapshot {
  readonly driver?: TripDriverSummary;
}

export interface PassengerRidePort extends TripRealtimePort {
  /** Sem sessão de corrida ainda — só preço e disponibilidade por categoria. */
  quote(input: QuoteInput): Promise<Result<Quote>>;
  /**
   * `idempotencyKey` evita corrida duplicada em retry/reconexão; a MESMA chave com corpo
   * DIFERENTE é `409 conflict` (`reason: 'idempotency_key_reused'`, achado A4) — nunca reaproveita
   * em silêncio. Outros `409`: `quote_expired`, `category_unavailable` (desligada ENTRE a cotação
   * e o pedido).
   */
  request(input: RequestRideInput, idempotencyKey: string): Promise<Result<{ readonly tripId: TripId; readonly status: TripStatus }>>;
  status(tripId: TripId): Promise<Result<PassengerTripSnapshot>>;
  /** `409 conflict`: `invalid_transition` (fase terminal) ou `idempotency_key_reused`. */
  cancel(
    tripId: TripId,
    input: { readonly reason?: CancelReason },
    idempotencyKey: string,
  ): Promise<Result<{ readonly status: TripStatus; readonly cancellationFee?: Money }>>;
}

export interface PlacesPort {
  search(query: string): Promise<Result<readonly Place[]>>;
}
