/**
 * Tipos e portas do MOTORISTA: jornada/disponibilidade (C3), oferta (despacho, §6.2, C2), corrida
 * depois do aceite (C1) e posição (C4). Interfaces aqui (não em `index.ts`) para o mock poder
 * importá-las sem depender do barril público — mesmo padrão de `identity/types.ts`.
 *
 * Revisado na conferência da Nova (`docs/contratos/conferencia-f08-nova.md`):
 * - **A3**: `DriverTripPort` só vale para o motorista ATRIBUÍDO. Fora disso, `404 not_found` (não
 *   `403` — não confirma que a corrida existe).
 * - **B4**: `DriverTripSnapshot` é a projeção do MOTORISTA — endereço e ponto EXATOS do embarque E
 *   do destino, porque a essa altura ele já foi atribuído. Antes do aceite, a oferta (`RideOffer`,
 *   `@vuumbora/domain/driver`) só leva bairro dos DOIS — decisão do dono em 22/11/2026
 *   (`docs/decisoes-do-dono.md`, "Complemento: o embarque na oferta é só o bairro" e "Complemento:
 *   o destino na oferta também é só o bairro").
 */
import type { ApproximatePlace, GeoPoint, Money, Place, TripId, TripStatus } from '@vuumbora/domain';
import type { DriverPhase, RideOffer, VerificationStatus } from '@vuumbora/domain/driver';
import type { Result } from '../index';
import type { TripBaseSnapshot, TripHistoryPage, TripRealtimePort } from '../trip/types';

/** C3: liga/desliga, com posição — obrigatória ao ligar (o despacho filtra por posição < 30 s, §5.4). */
export interface DriverAvailabilityInput {
  readonly online: boolean;
  readonly point?: GeoPoint;
}

export interface DriverJourneyPort {
  verification(): Promise<Result<{ readonly status: VerificationStatus }>>;
  /**
   * `409 conflict`: `driver_not_approved` ou `not_eligible` (documento vencido). `400 validation`
   * sem `point` ao ligar. **R7 (reconferência da Nova):** essas checagens valem só para
   * `online: true` — ficar OFFLINE sempre funciona, mesmo com documento vencido ou conta não
   * aprovada (senão o motorista trava online sem conseguir saída).
   */
  setAvailability(input: DriverAvailabilityInput): Promise<Result<{ readonly phase: DriverPhase }>>;
}

/** Provisório — valores finais saem no M6 (decisão 15). */
export type DeclineReason = 'too_far' | 'low_payout' | 'wrong_direction' | 'other';

/** Tempo real das OFERTAS (C2) — distinto do tempo real da CORRIDA (`TripRealtimePort`). */
export type OfferEvent =
  | { readonly type: 'offer.created'; readonly offer: RideOffer }
  | { readonly type: 'offer.revoked'; readonly offerId: string; readonly reason: 'expired' | 'taken' | 'cancelled' };

export interface DriverOfferPort {
  /** Aceite atômico no servidor (§6.2/§5.4). `409 conflict`: `offer_taken`, `offer_expired` ou `idempotency_key_reused`. */
  accept(offer: RideOffer, idempotencyKey: string): Promise<Result<{ readonly tripId: TripId }>>;
  /** Idempotente: recusar de novo, ou uma oferta que já não vale mais, não falha nem conta como erro. */
  decline(offer: RideOffer, input?: { readonly reason?: DeclineReason }): Promise<Result<void>>;
  /** `offer.created` ao chegar uma oferta; `offer.revoked` se ela morrer por fora (outro motorista venceu, expirou, ou o passageiro cancelou). */
  subscribeOffers(onEvent: (event: OfferEvent) => void): () => void;
}

/**
 * Snapshot do MOTORISTA (B4): endereço e ponto EXATOS do embarque — só existem aqui porque o
 * motorista já foi atribuído (A3 garante que só ele os recebe). `passenger` é opcional porque o
 * nome só é mostrado depois do aceite, nunca na oferta.
 */
export interface DriverTripSnapshot extends TripBaseSnapshot {
  readonly pickup: Place;
  readonly destination: Place;
  readonly categoryId: string;
  readonly estimatedPayout: Money;
  readonly passenger?: { readonly firstName: string };
}

/** Provisório — valores finais saem no M6 (decisão 15). */
export type DriverCancelReason = 'passenger_no_show' | 'wrong_pickup' | 'vehicle_issue' | 'other';

/**
 * Ações do motorista depois do aceite (C1). A passagem `driver_assigned` → `driver_en_route` é do
 * SISTEMA (automática, no aceite) — não existe método para ela aqui; o app não chama nada.
 */
export interface DriverTripPort extends TripRealtimePort {
  status(tripId: TripId): Promise<Result<DriverTripSnapshot>>;
  /** `driver_en_route` → `driver_arrived`. */
  arrived(tripId: TripId, idempotencyKey: string): Promise<Result<DriverTripSnapshot>>;
  /**
   * `driver_arrived` → `in_progress`. `pickupCode` é opcional (D-12 em aberto). **R3 (reconferência
   * da Nova):** a ordem das checagens é `404` (motorista não atribuído) → `409 invalid_transition`
   * (corrida não está em `driver_arrived`) → `400 validation` (código errado) → `429 rate_limited`
   * (muitas tentativas erradas). As tentativas contam por corrida E motorista, e só as do
   * atribuído — checar a atribuição ANTES do código evita que quem recebeu a oferta mas não a
   * aceitou gaste as tentativas de quem aceitou.
   */
  start(tripId: TripId, input: { readonly pickupCode?: string }, idempotencyKey: string): Promise<Result<DriverTripSnapshot>>;
  /** `in_progress` → `completed`. `deliveryCode` só importa para `kind: 'delivery'` (hoje desligado, §13.3). */
  complete(tripId: TripId, input: { readonly deliveryCode?: string }, idempotencyKey: string): Promise<Result<DriverTripSnapshot>>;
  /**
   * Cancelamento do motorista depois do aceite (plano-sistema.md §6.1): em `driver_assigned` ou
   * `driver_en_route` a corrida VOLTA para a busca — o passageiro não perde o pedido. `409
   * conflict`: `invalid_transition` (fase terminal, ou o motorista não está atribuído a ela — A1)
   * ou `idempotency_key_reused`.
   */
  cancel(tripId: TripId, input: { readonly reason?: DriverCancelReason }, idempotencyKey: string): Promise<Result<{ readonly status: TripStatus }>>;
}

/**
 * Histórico de corridas do motorista — acréscimo PP-12, item 3 (decisão do dono em 22/11/2026,
 * `docs/fichas-de-tela/README.md`): porta que hoje não existe no contrato. `GET /v1/driver/trips?cursor`.
 */
export interface DriverTripHistoryInput {
  readonly cursor?: string;
  /** Padrão 20, teto 50 — nunca o histórico inteiro de uma só vez. */
  readonly limit?: number;
  /** Período (ISO 8601 com offset), ambos opcionais, filtra por `endedAt`. `from` depois de `to` é `400 validation`. */
  readonly from?: string;
  readonly to?: string;
}

/**
 * Uma viagem já terminada do histórico do motorista. **PP-14: só bairro dos dois — nunca endereço
 * nem ponto exato, mesmo tempo depois da corrida** (minimização, LGPD: o endereço exato serviu
 * durante a corrida; guardado por meses, é o endereço de casa de outra pessoa). Por isso `pickup`/
 * `destination` são `ApproximatePlace`, igual à oferta antes do aceite — nunca o `Place` completo
 * que `DriverTripSnapshot` usa durante a corrida.
 */
export interface DriverTripHistoryEntry {
  readonly tripId: TripId;
  /**
   * Sempre terminal: `completed` ou `cancelled` — e só quando a corrida terminou com ESTE
   * motorista atribuído (achado P1 da conferência da Nova sobre a PP-12,
   * `docs/contratos/conferencia-pp12-nova.md`): um motorista que devolveu a corrida para a busca
   * (`driver_en_route` → `searching_driver`) nunca ganha a entrada de quem a concluiu depois dele —
   * mesma regra de visibilidade do R1 da F08.
   */
  readonly status: TripStatus;
  /** ISO 8601 — quando este motorista foi atribuído (não há "pedido" do lado dele). */
  readonly assignedAt: string;
  readonly endedAt: string;
  readonly pickup: ApproximatePlace;
  readonly destination: ApproximatePlace;
  readonly categoryId: string;
  readonly distanceM: number;
  readonly durationS: number;
  /**
   * Ganho do motorista — presente só em `completed` (achado P2, mesma conferência): o que conta
   * como ganho numa corrida CANCELADA depende da decisão 15 (M6), ainda em aberto; o valor exato
   * por corrida depende da decisão 7 (D-23, taxa variável). Até lá, `cancelled` nunca mostra dinheiro.
   */
  readonly payout?: Money;
  // P3 (mesma conferência): sem nome do passageiro — a ficha M12 pede bairro, horário, distância,
  // categoria e valor; nome guardado por meses, sem uso para o motorista, é minimização (PP-14).
}

export interface DriverTripHistoryPort {
  /** `400 validation` em `from`/`to` inválidos ou `from` depois de `to`. */
  history(input: DriverTripHistoryInput): Promise<Result<TripHistoryPage<DriverTripHistoryEntry>>>;
}

/** Posição enviada pelo motorista (C4). `mocked` é o sinal de GPS falso (§5.10), gravado desde o 1º dia. */
export interface LocationFix {
  readonly point: GeoPoint;
  readonly heading?: number;
  readonly speedMps?: number;
  /** ISO 8601: instante da leitura do GPS (pode chegar atrasado). */
  readonly at: string;
  readonly mocked: boolean;
}

export interface DriverLocationPort {
  sendLocations(fixes: readonly LocationFix[]): Promise<Result<void>>;
}
