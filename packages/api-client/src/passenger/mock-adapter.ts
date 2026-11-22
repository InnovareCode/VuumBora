/**
 * Adaptador `mock` do PASSAGEIRO: cotação, pedido, status, cancelamento e tempo real, nos mesmos
 * erros do contrato (`quote_expired`, `category_unavailable`, `invalid_transition`,
 * `idempotency_key_reused`, `outside_service_area`, `not_found`).
 *
 * Este mock NÃO despacha motorista sozinho — isso é o simulador (hoje
 * `apps/passenger/src/sim/rideSimulator.ts`, que esta porta vem para substituir, ver README). Quem
 * progride a corrida é `control`, chamado de um `setTimeout` do app — exatamente como o simulador
 * antigo chamava `transitionRide` direto. `control` usa a MESMA validação do domínio
 * (`transitionTrip`/`cancelTrip`): uma transição que o domínio recusaria também é recusada aqui.
 *
 * Categorias de referência (decisão do dono, 20/11/2026): VuumBora, Conforto, Motorista mulher,
 * Pet, Entrega. **Entrega e Motorista mulher (até a D-08) não aparecem na cotação** — estão
 * DESLIGADAS (plano-sistema.md §13.3; decisão 8 em aberto), não é "sem motorista agora". Pedir uma
 * categoria que ainda está na lista mas ficou `availability: 'none'` É aceito: se nenhum motorista
 * aparecer no tempo máximo, a corrida termina em `failed` (achado B1 da conferência).
 */
import { cancelTrip, transitionTrip } from '@vuumbora/domain';
import type { GeoPoint, Place, TripId, TripStatus, TripTransitionResult } from '@vuumbora/domain';
import { createIdempotencyCache, fingerprint } from '../trip/idempotency';
import { createTripStore, DRIVER_ASSIGNED_STATUSES, type TripStore } from '../trip/mock-store';
import { cancelConflict, failWith, notFound, quoteConflict, requestConflict, succeed } from '../trip/result';
import type { CancelActor, TripEvent } from '../trip/types';
import type {
  CancelReason,
  CategoryAvailability,
  CategoryQuote,
  PassengerRidePort,
  PassengerTripSnapshot,
  Quote,
  QuoteInput,
  RequestRideInput,
  TripDriverSummary,
} from './types';
import type { Result } from '../index';

const DEFAULT_QUOTE_TTL_MS = 5 * 60 * 1000; // §5.6: proposta de 5 min

interface CategoryFixture {
  readonly categoryId: string;
  readonly amountCents: number;
  readonly distanceM: number;
  readonly durationS: number;
  readonly pickupEtaS: number;
  readonly availability: CategoryAvailability;
  readonly kind: 'ride' | 'delivery';
  /** Desligada = não aparece na cotação (B1). Entrega (§13.3) e Motorista mulher (D-08) nascem assim. */
  readonly enabled: boolean;
}

const DEFAULT_CATEGORIES: readonly CategoryFixture[] = [
  { categoryId: 'vuumbora', amountCents: 1890, distanceM: 5200, durationS: 900, pickupEtaS: 180, availability: 'high', kind: 'ride', enabled: true },
  { categoryId: 'conforto', amountCents: 2490, distanceM: 5200, durationS: 900, pickupEtaS: 240, availability: 'high', kind: 'ride', enabled: true },
  { categoryId: 'motorista_mulher', amountCents: 1990, distanceM: 5200, durationS: 900, pickupEtaS: 300, availability: 'low', kind: 'ride', enabled: false },
  { categoryId: 'pet', amountCents: 2190, distanceM: 5200, durationS: 900, pickupEtaS: 300, availability: 'low', kind: 'ride', enabled: true },
  { categoryId: 'entrega', amountCents: 1590, distanceM: 6000, durationS: 1100, pickupEtaS: 300, availability: 'low', kind: 'delivery', enabled: false },
];

export interface MockPassengerRideOptions {
  readonly clock?: () => number;
  /** Padrão 5 min (§5.6). */
  readonly quoteTtlMs?: number;
  /** Para o teste trocar preço/disponibilidade sem reescrever o adaptador inteiro. */
  readonly categories?: readonly CategoryFixture[];
  /** Compartilhe com `createMockDriverRidePort` para os dois lados verem a mesma corrida. */
  readonly store?: TripStore;
  /** Gerador de id, injetável nos testes. Padrão: contador interno. */
  readonly nextId?: () => string;
  /** Fora da área de serviço (§3.1 do anexo — pino fora de Natal). Padrão: nunca. */
  readonly isOutsideServiceArea?: (place: Place) => boolean;
}

/** Hooks que progridem a corrida — o que o simulador antigo fazia a golpes de `setTimeout`. */
export interface MockPassengerRideControl {
  /** Tenta mover a corrida para `to`, com a MESMA validação do domínio. */
  advance(tripId: TripId, to: TripStatus): TripTransitionResult;
  /** Anexa o resumo do motorista para exibição. Sem efeito se a fase atual não tem motorista (A2). */
  setDriverSummary(tripId: TripId, summary: TripDriverSummary): void;
  /** Cancelamento com autor — motorista em `driver_assigned`/`driver_en_route` volta para a busca. */
  cancel(tripId: TripId, actor: CancelActor): TripTransitionResult;
  /** Emite um ping de localização para quem está inscrito (não muda o status). */
  emitLocation(tripId: TripId, point: GeoPoint, extra?: { readonly heading?: number; readonly at?: string }): void;
  /** Liga/desliga uma categoria EM TEMPO DE EXECUÇÃO — simula o §13.3 mudando entre a cotação e o pedido. */
  setCategoryEnabled(categoryId: string, enabled: boolean): void;
  snapshot(tripId: TripId): PassengerTripSnapshot | undefined;
}

export interface MockPassengerRide {
  readonly port: PassengerRidePort;
  readonly control: MockPassengerRideControl;
}

function fareOf(amountCents: number): CategoryQuote['estimate'] {
  return { kind: 'estimate', total: { amountCents, currency: 'BRL' } };
}

export function createMockPassengerRidePort(options: MockPassengerRideOptions = {}): MockPassengerRide {
  const clock = options.clock ?? Date.now;
  const quoteTtlMs = options.quoteTtlMs ?? DEFAULT_QUOTE_TTL_MS;
  const fixtures = options.categories ?? DEFAULT_CATEGORIES;
  const store = options.store ?? createTripStore(clock);
  let counter = 0;
  const nextId = options.nextId ?? (() => `mock-${++counter}`);

  const fixtureById = new Map(fixtures.map((f) => [f.categoryId, f] as const));
  const enabledOverrides = new Map<string, boolean>();
  const quotesById = new Map<string, { readonly categoryId: string; readonly expiresAtMs: number }>();
  const driverSummaries = new Map<TripId, TripDriverSummary>();

  const requestCache = createIdempotencyCache<Result<{ readonly tripId: TripId; readonly status: TripStatus }>>();
  const cancelCache = createIdempotencyCache<Result<{ readonly status: TripStatus }>>();

  function isEnabled(categoryId: string): boolean {
    return enabledOverrides.get(categoryId) ?? fixtureById.get(categoryId)?.enabled ?? false;
  }

  async function quote(input: QuoteInput): Promise<Result<Quote>> {
    if (options.isOutsideServiceArea?.(input.origin) || options.isOutsideServiceArea?.(input.destination)) {
      return failWith(quoteConflict('outside_service_area'));
    }
    const kind = input.kind ?? 'ride';
    const categories: CategoryQuote[] = [];
    for (const fixture of fixtures) {
      if (fixture.kind !== kind || !isEnabled(fixture.categoryId)) continue; // B1: desligada não aparece
      const quoteId = nextId();
      const expiresAtMs = clock() + quoteTtlMs;
      quotesById.set(quoteId, { categoryId: fixture.categoryId, expiresAtMs });
      categories.push({
        categoryId: fixture.categoryId,
        quoteId,
        expiresAt: new Date(expiresAtMs).toISOString(),
        estimate: fareOf(fixture.amountCents),
        distanceM: fixture.distanceM,
        durationS: fixture.durationS,
        pickupEtaS: fixture.pickupEtaS,
        availability: fixture.availability,
      });
    }
    return succeed({ categories });
  }

  async function request(
    input: RequestRideInput,
    idempotencyKey: string,
  ): Promise<Result<{ readonly tripId: TripId; readonly status: TripStatus }>> {
    const body = fingerprint(input);
    const cached = requestCache.get(idempotencyKey);
    if (cached) return cached.fingerprint === body ? cached.result : failWith(requestConflict('idempotency_key_reused'));

    const result = ((): Result<{ readonly tripId: TripId; readonly status: TripStatus }> => {
      const found = quotesById.get(input.quoteId);
      if (!found) return failWith(notFound());
      if (clock() >= found.expiresAtMs) return failWith(requestConflict('quote_expired'));
      if (!isEnabled(found.categoryId)) return failWith(requestConflict('category_unavailable')); // B1: desligada ENTRE a cotação e o pedido

      const tripId = nextId() as TripId;
      store.create(tripId, 'requested'); // B2: fica em requested (Pix antes da corrida, S5) — não avança sozinho
      return succeed({ tripId, status: 'requested' as TripStatus });
    })();

    requestCache.set(idempotencyKey, body, result);
    return result;
  }

  function driverSummaryFor(tripId: TripId, status: TripStatus): TripDriverSummary | undefined {
    if (!DRIVER_ASSIGNED_STATUSES.has(status)) {
      driverSummaries.delete(tripId); // A2: a volta para a busca (ou fim) limpa o motorista — nunca mostra o antigo
      return undefined;
    }
    return driverSummaries.get(tripId);
  }

  function buildSnapshot(tripId: TripId, record: { readonly status: TripStatus; readonly seq: number }): PassengerTripSnapshot {
    const driver = driverSummaryFor(tripId, record.status);
    return driver
      ? { tripId, status: record.status, seq: record.seq, driver }
      : { tripId, status: record.status, seq: record.seq };
  }

  async function status(tripId: TripId): Promise<Result<PassengerTripSnapshot>> {
    const record = store.get(tripId);
    return record ? succeed(buildSnapshot(tripId, record)) : failWith(notFound());
  }

  async function cancel(
    tripId: TripId,
    input: { readonly reason?: CancelReason },
    idempotencyKey: string,
  ): Promise<Result<{ readonly status: TripStatus }>> {
    const body = fingerprint(input);
    const cached = cancelCache.get(idempotencyKey);
    if (cached) return cached.fingerprint === body ? cached.result : failWith(cancelConflict('idempotency_key_reused'));

    const result = ((): Result<{ readonly status: TripStatus }> => {
      const record = store.get(tripId);
      if (!record) return failWith(notFound());
      const outcome = cancelTrip(record.status, 'passenger');
      if (!outcome.ok) return failWith(cancelConflict('invalid_transition'));
      store.setStatus(tripId, outcome.state);
      return succeed({ status: outcome.state }); // cancellationFee: decisão 15 (M6) — o mock nunca cobra
    })();

    cancelCache.set(idempotencyKey, body, result);
    return result;
  }

  function subscribe(tripId: TripId, onEvent: (event: TripEvent) => void): () => void {
    return store.subscribe(tripId, onEvent);
  }

  const control: MockPassengerRideControl = {
    advance(tripId, to) {
      const record = store.get(tripId);
      if (!record) return { ok: false, from: to, to, reason: 'Corrida inexistente neste mock.' };
      const result = transitionTrip(record.status, to);
      if (result.ok) store.setStatus(tripId, result.state);
      return result;
    },
    setDriverSummary(tripId, summary) {
      const record = store.get(tripId);
      if (record && DRIVER_ASSIGNED_STATUSES.has(record.status)) driverSummaries.set(tripId, summary);
    },
    cancel(tripId, actor) {
      const record = store.get(tripId);
      if (!record) return { ok: false, from: 'cancelled', to: 'cancelled', reason: 'Corrida inexistente neste mock.' };
      const result = cancelTrip(record.status, actor);
      if (result.ok) store.setStatus(tripId, result.state);
      return result;
    },
    emitLocation(tripId, point, extra) {
      store.emitLocation(tripId, point, extra);
    },
    setCategoryEnabled(categoryId, enabled) {
      enabledOverrides.set(categoryId, enabled);
    },
    snapshot(tripId) {
      const record = store.get(tripId);
      return record ? buildSnapshot(tripId, record) : undefined;
    },
  };

  return { port: { quote, request, status, cancel, subscribe }, control };
}
