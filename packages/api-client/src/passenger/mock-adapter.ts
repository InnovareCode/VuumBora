/**
 * Adaptador `mock` do PASSAGEIRO: cotação, pedido, status, cancelamento e tempo real, nos mesmos
 * erros do contrato (`quote_expired`, `category_unavailable`, `invalid_transition`, `not_found`).
 *
 * Este mock NÃO despacha motorista sozinho — isso é o simulador (hoje
 * `apps/passenger/src/sim/rideSimulator.ts`, que esta porta vem para substituir, ver README
 * "trocar o simulador por este mock"). Quem progride a corrida é `control`, chamado de um
 * `setTimeout` do app — exatamente como o simulador antigo chamava `transitionRide` direto.
 * `control` usa a MESMA validação do domínio (`transitionTrip`/`cancelTrip`): uma transição que o
 * domínio recusaria também é recusada aqui, nunca forçada.
 *
 * Categorias de referência (decisão do dono, 20/11/2026): VuumBora, Conforto, Motorista mulher,
 * Pet, Entrega. Entrega sai sempre com `availability: 'none'` — está DESLIGADA até parecer
 * jurídico (plano-sistema.md §13.3); pedir essa categoria dá `409 category_unavailable`, não é
 * "sem motorista agora".
 */
import { cancelTrip, transitionTrip } from '@vuumbora/domain';
import type { GeoPoint, TripId, TripStatus, TripTransitionResult } from '@vuumbora/domain';
import type { RideDraft } from '@vuumbora/domain/passenger';
import type { Result } from '../index';
import { createIdempotencyCache } from '../trip/idempotency';
import { createTripStore, type TripStore } from '../trip/mock-store';
import { conflict, failWith, notFound, succeed, validation } from '../trip/result';
import type { CancelActor, TripDriverSummary, TripEvent, TripSnapshot } from '../trip/types';
import type { CategoryAvailability, CategoryQuote, PassengerRidePort, Quote, RequestRideInput } from './types';

const DEFAULT_QUOTE_TTL_MS = 5 * 60 * 1000; // §5.6: proposta de 5 min

interface CategoryFixture {
  readonly categoryId: string;
  readonly amountCents: number;
  readonly availability: CategoryAvailability;
}

/** Entrega fica `'none'` sempre — não é falta de motorista, é a categoria desligada (§13.3). */
const DEFAULT_CATEGORIES: readonly CategoryFixture[] = [
  { categoryId: 'vuumbora', amountCents: 1890, availability: 'high' },
  { categoryId: 'conforto', amountCents: 2490, availability: 'high' },
  { categoryId: 'motorista_mulher', amountCents: 1990, availability: 'low' },
  { categoryId: 'pet', amountCents: 2190, availability: 'low' },
  { categoryId: 'entrega', amountCents: 1590, availability: 'none' },
];

export interface MockPassengerRideOptions {
  readonly clock?: () => number;
  /** Padrão 5 min (§5.6). */
  readonly quoteTtlMs?: number;
  /** Para o teste trocar disponibilidade/preço sem reescrever o adaptador inteiro. */
  readonly categories?: readonly CategoryFixture[];
  /** Compartilhe com `createMockDriverRidePorts` para os dois lados verem a mesma corrida. */
  readonly store?: TripStore;
  /** Gerador de id, injetável nos testes. Padrão: contador interno. */
  readonly nextId?: () => string;
}

/** Hooks que progridem a corrida — o que o simulador antigo fazia a golpes de `setTimeout`. */
export interface MockPassengerRideControl {
  /** Tenta mover a corrida para `to`, com a MESMA validação do domínio. `driver` entra no evento emitido. */
  advance(tripId: TripId, to: TripStatus, driver?: TripDriverSummary): TripTransitionResult;
  /** Cancelamento com autor — motorista em `driver_assigned`/`driver_en_route` volta para a busca. */
  cancel(tripId: TripId, actor: CancelActor): TripTransitionResult;
  /** Emite um ping de localização para quem está inscrito (não muda o status). */
  emitLocation(tripId: TripId, point: GeoPoint): void;
  snapshot(tripId: TripId): TripSnapshot | undefined;
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
  const categories = options.categories ?? DEFAULT_CATEGORIES;
  const store = options.store ?? createTripStore(clock);
  let counter = 0;
  const nextId = options.nextId ?? (() => `mock-${++counter}`);

  const quotes = new Map<string, Quote>();
  const requestCache = createIdempotencyCache<Result<{ readonly tripId: TripId }>>();
  const cancelCache = createIdempotencyCache<Result<void>>();

  function buildQuote(): Quote {
    const quoteId = nextId();
    const quote: Quote = {
      quoteId,
      expiresAt: new Date(clock() + quoteTtlMs).toISOString(),
      categories: categories.map((category) => ({
        categoryId: category.categoryId,
        estimate: fareOf(category.amountCents),
        availability: category.availability,
      })),
    };
    quotes.set(quoteId, quote);
    return quote;
  }

  async function quote(draft: RideDraft): Promise<Result<Quote>> {
    if (!draft.origin || !draft.destination) {
      return failWith(validation({ form: 'Origem e destino são obrigatórios para cotar.' }));
    }
    return succeed(buildQuote());
  }

  async function request(input: RequestRideInput, idempotencyKey: string): Promise<Result<{ readonly tripId: TripId }>> {
    const cached = requestCache.get(idempotencyKey);
    if (cached) return cached;

    const result = ((): Result<{ readonly tripId: TripId }> => {
      const found = quotes.get(input.quoteId);
      if (!found) return failWith(notFound());
      if (clock() >= Date.parse(found.expiresAt)) return failWith(conflict('quote_expired'));

      const category = found.categories.find((c) => c.categoryId === input.categoryId);
      if (!category) return failWith(validation({ categoryId: 'Categoria não faz parte desta cotação.' }));
      if (category.availability === 'none') return failWith(conflict('category_unavailable'));

      const tripId = nextId() as TripId;
      store.create(tripId, 'requested');
      // Imediato após gravar (§5.2): sistema move para a busca sozinho.
      const toSearching = transitionTrip('requested', 'searching_driver');
      if (toSearching.ok) store.setStatus(tripId, toSearching.state);
      return succeed({ tripId });
    })();

    requestCache.set(idempotencyKey, result);
    return result;
  }

  async function status(tripId: TripId): Promise<Result<TripSnapshot>> {
    const snapshot = store.snapshot(tripId);
    return snapshot ? succeed(snapshot) : failWith(notFound());
  }

  async function cancel(tripId: TripId, idempotencyKey: string): Promise<Result<void>> {
    const cached = cancelCache.get(idempotencyKey);
    if (cached) return cached;

    const result = ((): Result<void> => {
      const trip = store.get(tripId);
      if (!trip) return failWith(notFound());
      const outcome = cancelTrip(trip.status, 'passenger');
      if (!outcome.ok) return failWith(conflict('invalid_transition'));
      store.setStatus(tripId, outcome.state);
      return succeed(undefined);
    })();

    cancelCache.set(idempotencyKey, result);
    return result;
  }

  function subscribe(tripId: TripId, onEvent: (event: TripEvent) => void): () => void {
    return store.subscribe(tripId, onEvent);
  }

  const control: MockPassengerRideControl = {
    advance(tripId, to, driver) {
      const trip = store.get(tripId);
      if (!trip) return { ok: false, from: to, to, reason: 'Corrida inexistente neste mock.' };
      const result = transitionTrip(trip.status, to);
      if (result.ok) store.setStatus(tripId, result.state, driver);
      return result;
    },
    cancel(tripId, actor) {
      const trip = store.get(tripId);
      if (!trip) return { ok: false, from: 'cancelled', to: 'cancelled', reason: 'Corrida inexistente neste mock.' };
      const result = cancelTrip(trip.status, actor);
      if (result.ok) store.setStatus(tripId, result.state);
      return result;
    },
    emitLocation(tripId, point) {
      store.emitLocation(tripId, point);
    },
    snapshot(tripId) {
      return store.snapshot(tripId);
    },
  };

  return { port: { quote, request, status, cancel, subscribe }, control };
}
