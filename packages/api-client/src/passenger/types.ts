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
import type { TripBaseSnapshot, TripHistoryPage, TripRealtimePort } from '../trip/types';

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
  /**
   * Modelo e cor do veículo — acréscimo PP-12 (decisão do dono em 22/11/2026,
   * `docs/fichas-de-tela/README.md`): sem eles o passageiro não reconhece o carro na rua, e isso é
   * segurança, não estética (o plano já previa os dois, `plano-sistema-arquitetura.md:615`).
   * OPCIONAIS aqui (não no servidor, que sempre os envia) só para não quebrar quem já constrói este
   * tipo sem eles hoje (ex.: `apps/passenger/src/sim/rideSimulator.ts`) — a tela trata ausência como
   * "dado indisponível", nunca como "sem veículo".
   */
  readonly vehicleModel?: string;
  readonly vehicleColor?: string;
  /** Nota média do motorista (1 a 5). Ausente = motorista sem avaliação ainda (recém-aprovado). */
  readonly rating?: number;
}

/**
 * Snapshot do PASSAGEIRO (B4). `driver` só aparece enquanto a corrida tem motorista atribuído —
 * depois de uma volta para a busca (ou cancelamento), desaparece (A2): nunca mostra o motorista
 * antigo.
 */
export interface PassengerTripSnapshot extends TripBaseSnapshot {
  readonly driver?: TripDriverSummary;
  /**
   * Código de embarque (plano D-12; decisão do dono em 22/11/2026: PIN em todas as categorias). O
   * passageiro diz este código ao motorista, e a corrida só começa com ele
   * (`DriverTripPort.start`).
   *
   * - **Formato:** exatamente 4 algarismos, como texto (`"0482"`: zero à esquerda vale, por isso não
   *   é número). Regra em `isPickupCodeFormat`, `@vuumbora/domain`.
   * - **Quando aparece:** só em `driver_assigned`, `driver_en_route` e `driver_arrived`
   *   (`isPickupCodeVisible`, `@vuumbora/domain`). Ausente antes de haver motorista, ausente a partir
   *   de `in_progress` e nas fases terminais.
   * - **Um por corrida:** gerado no pedido e estável até o fim, mesmo se um motorista devolver a
   *   corrida para a busca e outro assumir. Só se diz o código em `driver_arrived`, e dali a corrida
   *   não volta para a busca; quem saiu antes nunca o ouviu, e a guarda de atribuição (A3) impede
   *   quem saiu de usar o `start`.
   * - **Nunca no histórico** (`PassengerTripHistoryEntry` não tem este campo, minimização PP-14) e
   *   **nunca no lado do motorista** (`DriverTripSnapshot`, `RideOffer` e os eventos de tempo real
   *   não o carregam): o motorista pede o código, e é isso que prova que o passageiro entrou no
   *   carro certo.
   * - **Não vem no evento de tempo real.** O evento `status` avisa a fase; quem precisa do código
   *   lê `status()`, como já faz com `driver`.
   */
  readonly pickupCode?: string;
}

/** `GET /v1/trips?cursor`, página de histórico. Nunca "todas de uma vez" — paginação sempre. */
export interface PassengerTripHistoryInput {
  readonly cursor?: string;
  /** Padrão 20, teto 50 — nunca o histórico inteiro de uma só vez. */
  readonly limit?: number;
  /** Período (ISO 8601 com offset), ambos opcionais, filtra por `requestedAt`. `from` depois de `to` é `400 validation`. */
  readonly from?: string;
  readonly to?: string;
}

/** Uma viagem já terminada do histórico do passageiro — acréscimo PP-12 (período) + item 3 do pedido. */
export interface PassengerTripHistoryEntry {
  readonly tripId: TripId;
  /** Sempre terminal: `completed`, `cancelled` ou `failed`. */
  readonly status: TripStatus;
  readonly requestedAt: string;
  readonly endedAt: string;
  readonly origin: Place;
  readonly destination: Place;
  readonly categoryId: string;
  readonly distanceM: number;
  readonly durationS: number;
  /**
   * Valor final COBRADO — não a estimativa (o domínio separa os dois tipos de propósito, ver
   * `FareEstimate`). Presente só em `completed` (achado P2 da conferência da Nova sobre a PP-12,
   * `docs/contratos/conferencia-pp12-nova.md`): uma corrida `cancelled`/`failed` nunca foi cobrada.
   */
  readonly fare?: Money;
  /**
   * Taxa de cancelamento, quando existir — presente só em `cancelled`. Depende da decisão 15 (M6),
   * ainda em aberto: até ela sair, este campo nunca é preenchido (mesmo motivo de
   * `PassengerRidePort.cancel`'s `cancellationFee?`, já provisório por lá).
   */
  readonly cancellationFee?: Money;
  /** Só presente se a corrida teve motorista atribuído (mesma regra do snapshot, B4). */
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
  /**
   * Histórico de viagens (`GET /v1/trips?cursor`), com período (item 3 do acréscimo PP-12).
   * `400 validation` em `from`/`to` inválidos ou `from` depois de `to`.
   */
  history(input: PassengerTripHistoryInput): Promise<Result<TripHistoryPage<PassengerTripHistoryEntry>>>;
}

export interface PlacesPort {
  search(query: string): Promise<Result<readonly Place[]>>;
}
