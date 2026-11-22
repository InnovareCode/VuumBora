/**
 * Adaptador `mock` do MOTORISTA: oferta (aceite atômico) e corrida depois do aceite, nos mesmos
 * erros do contrato (`offer_taken`, `offer_expired`, `invalid_transition`, `not_found`).
 *
 * Quem "despacha" a oferta é `control.offer(...)` — este mock não escolhe motorista nenhum (isso
 * é o algoritmo de §5.4, fora do escopo de um adaptador local); ele só garante que, dada uma
 * oferta, o aceite é atômico e os erros são os do contrato. `control.takeOffer`/`expireOffer`
 * simulam o que faria outro motorista vencer a corrida ou o tempo esgotar, para testar a recusa.
 */
import { cancelTrip, transitionTrip } from '@vuumbora/domain';
import type { Money, Place, TripId } from '@vuumbora/domain';
import type { RideOffer } from '@vuumbora/domain/driver';
import type { Result } from '../index';
import { createIdempotencyCache } from '../trip/idempotency';
import { createTripStore, type TripStore } from '../trip/mock-store';
import { conflict, failWith, notFound, succeed } from '../trip/result';
import type { TripSnapshot } from '../trip/types';
import type { DriverOfferPort, DriverTripPort } from './types';

const DEFAULT_OFFER_TTL_MS = 15 * 1000; // §5.4: proposta de 15 s

interface OfferRecord {
  readonly tripId: TripId;
  expiresAtMs: number;
  taken: boolean;
  declined: boolean;
}

export interface OfferInput {
  /** Se omitido, uma corrida nova é criada em `searching_driver`. */
  readonly tripId?: TripId;
  readonly pickup: Place;
  readonly destination: Place;
  readonly categoryId: string;
  readonly estimatedPayout: Money;
  /** Padrão 15 s (§5.4). */
  readonly ttlMs?: number;
}

export interface MockDriverRideOptions {
  readonly clock?: () => number;
  /** Compartilhe com `createMockPassengerRidePort` para os dois lados verem a mesma corrida. */
  readonly store?: TripStore;
  readonly nextId?: () => string;
}

export interface MockDriverRideControl {
  offer(input: OfferInput): RideOffer;
  /** Marca a oferta como tomada por OUTRO motorista — o próximo `accept` recebe `offer_taken`. */
  takeOffer(offerId: string): void;
  /** Força a expiração (sem esperar o relógio) — o próximo `accept` recebe `offer_expired`. */
  expireOffer(offerId: string): void;
  snapshot(tripId: TripId): TripSnapshot | undefined;
}

export interface MockDriverRide {
  readonly offerPort: DriverOfferPort;
  readonly tripPort: DriverTripPort;
  readonly control: MockDriverRideControl;
}

export function createMockDriverRidePort(options: MockDriverRideOptions = {}): MockDriverRide {
  const clock = options.clock ?? Date.now;
  const store = options.store ?? createTripStore(clock);
  let counter = 0;
  const nextId = options.nextId ?? (() => `mock-${++counter}`);

  const offers = new Map<string, OfferRecord>();
  const acceptCache = createIdempotencyCache<Result<{ readonly tripId: TripId }>>();
  const cancelCache = createIdempotencyCache<Result<void>>();

  function offer(input: OfferInput): RideOffer {
    const tripId = input.tripId ?? (nextId() as TripId);
    if (!store.get(tripId)) store.create(tripId, 'searching_driver');
    const offerId = nextId();
    const expiresAtMs = clock() + (input.ttlMs ?? DEFAULT_OFFER_TTL_MS);
    offers.set(offerId, { tripId, expiresAtMs, taken: false, declined: false });
    return {
      offerId,
      tripId,
      expiresAt: new Date(expiresAtMs).toISOString() as RideOffer['expiresAt'],
      estimatedPayout: input.estimatedPayout,
      pickup: input.pickup,
      destination: input.destination,
      categoryId: input.categoryId,
    };
  }

  async function accept(rideOffer: RideOffer, idempotencyKey: string): Promise<Result<{ readonly tripId: TripId }>> {
    const cached = acceptCache.get(idempotencyKey);
    if (cached) return cached;

    const result = ((): Result<{ readonly tripId: TripId }> => {
      const record = offers.get(rideOffer.offerId);
      if (!record) return failWith(notFound());
      if (clock() >= record.expiresAtMs) return failWith(conflict('offer_expired'));
      if (record.taken) return failWith(conflict('offer_taken'));

      const trip = store.get(record.tripId);
      const outcome = trip ? transitionTrip(trip.status, 'driver_assigned') : undefined;
      if (!outcome?.ok) return failWith(conflict('offer_taken')); // zero linhas afetadas no UPDATE real (§5.4)

      record.taken = true;
      store.setStatus(record.tripId, outcome.state);
      return succeed({ tripId: record.tripId });
    })();

    acceptCache.set(idempotencyKey, result);
    return result;
  }

  async function decline(rideOffer: RideOffer): Promise<Result<void>> {
    const record = offers.get(rideOffer.offerId);
    if (record) record.declined = true;
    return succeed(undefined); // idempotente: oferta desconhecida ou já resolvida também é sucesso
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
      const outcome = cancelTrip(trip.status, 'driver');
      if (!outcome.ok) return failWith(conflict('invalid_transition'));
      store.setStatus(tripId, outcome.state);
      return succeed(undefined);
    })();

    cancelCache.set(idempotencyKey, result);
    return result;
  }

  const control: MockDriverRideControl = {
    offer,
    takeOffer(offerId) {
      const record = offers.get(offerId);
      if (record) record.taken = true;
    },
    expireOffer(offerId) {
      const record = offers.get(offerId);
      if (record) record.expiresAtMs = clock() - 1;
    },
    snapshot(tripId) {
      return store.snapshot(tripId);
    },
  };

  return {
    offerPort: { accept, decline },
    tripPort: { status, cancel, subscribe: (tripId, onEvent) => store.subscribe(tripId, onEvent) },
    control,
  };
}
