/**
 * Adaptador `mock` do MOTORISTA: disponibilidade (C3), oferta/aceite atômico (C2), corrida depois
 * do aceite (C1) e posição (C4) — nos mesmos erros do contrato (`offer_taken`, `offer_expired`,
 * `invalid_transition`, `idempotency_key_reused`, `driver_not_approved`, `not_eligible`,
 * `not_found`).
 *
 * **A3 (achado da conferência da Nova):** `DriverTripPort` (status, eventos, ações) só vale para o
 * motorista ATRIBUÍDO. Cada instância deste mock representa UM motorista (`driverId` próprio); se
 * `tripId` não está atribuído a ESTA instância na `TripStore` (compartilhada ou não), a resposta é
 * `404 not_found` — nunca `403`, para não confirmar que a corrida existe para quem não é dela.
 *
 * Quem "despacha" a oferta é `control.offer(...)` — este mock não escolhe motorista nenhum (isso é
 * o algoritmo de §5.4, fora do escopo de um adaptador local); garante que, dada uma oferta, o
 * aceite é atômico e os erros são os do contrato. `control.takeOffer`/`expireOffer` simulam o que
 * faria outro motorista vencer a corrida ou o tempo esgotar; se o passageiro cancelar por baixo
 * (store compartilhada), a oferta pendente é revogada automaticamente (C2).
 *
 * **Embarque só o bairro na oferta** (decisão do dono, 22/11/2026 — `docs/decisoes-do-dono.md`,
 * "Complemento: o embarque na oferta é só o bairro"): `control.offer` nunca passa o endereço nem o
 * ponto exato para `RideOffer`. O endereço completo só aparece em `DriverTripSnapshot`, depois do
 * aceite, e só para quem `assignedTripInfo` confirma ser o atribuído (A3).
 */
import { cancelTrip, toApproximatePlace, transitionTrip } from '@vuumbora/domain';
import type { Money, Place, TripId, TripStatus } from '@vuumbora/domain';
import type { DriverPhase, RideOffer, VerificationStatus } from '@vuumbora/domain/driver';
import type { Result } from '../index';
import { createIdempotencyCache, fingerprint, type IdempotencyCache } from '../trip/idempotency';
import { createTripStore, type TripStore } from '../trip/mock-store';
import {
  acceptConflict,
  availabilityConflict,
  cancelConflict,
  driverActionConflict,
  failWith,
  notFound,
  succeed,
  validation,
} from '../trip/result';
import type { TripEvent } from '../trip/types';
import type {
  DeclineReason,
  DriverAvailabilityInput,
  DriverCancelReason,
  DriverJourneyPort,
  DriverLocationPort,
  DriverOfferPort,
  DriverTripPort,
  DriverTripSnapshot,
  LocationFix,
  OfferEvent,
} from './types';

const DEFAULT_OFFER_TTL_MS = 15 * 1000; // §5.4: proposta de 15 s
const DEFAULT_PICKUP_DISTANCE_M = 1200;
const DEFAULT_PICKUP_ETA_S = 240;
const START_CODE_ATTEMPTS = 5;

interface TripInfo {
  readonly pickup: Place;
  readonly destination: Place;
  readonly categoryId: string;
  readonly estimatedPayout: Money;
  readonly passengerFirstName?: string;
}

interface OfferRecord {
  readonly tripId: TripId;
  expiresAtMs: number;
  taken: boolean;
  resolved: boolean;
  stopWatching: () => void;
}

export interface OfferInput {
  /** Se omitido, uma corrida nova é criada em `searching_driver`. */
  readonly tripId?: TripId;
  readonly pickup: Place;
  readonly destination: Place;
  readonly categoryId: string;
  readonly estimatedPayout: Money;
  /** Padrão 1200 m / 240 s — só para a oferta mostrar algo; não é cálculo real (fora do escopo do mock). */
  readonly pickupDistanceM?: number;
  readonly pickupEtaS?: number;
  /** Padrão 15 s (§5.4). */
  readonly ttlMs?: number;
  /** Para aparecer em `DriverTripSnapshot.passenger` depois do aceite. */
  readonly passengerFirstName?: string;
}

export interface MockDriverRideOptions {
  readonly clock?: () => number;
  /** Compartilhe com `createMockPassengerRidePort` para os dois lados verem a mesma corrida. */
  readonly store?: TripStore;
  readonly nextId?: () => string;
  /** Identidade desta instância (um motorista). Padrão: gerado. */
  readonly driverId?: string;
  /** Estado inicial da conta, para C3. Padrão: `'approved'`/sem documento vencido. */
  readonly verificationStatus?: VerificationStatus;
  readonly documentExpired?: boolean;
}

export interface MockDriverRideControl {
  offer(input: OfferInput): RideOffer;
  /** Marca a oferta como tomada por OUTRO motorista — o próximo `accept` recebe `offer_taken`; emite `offer.revoked`. */
  takeOffer(offerId: string): void;
  /** Força a expiração (sem esperar o relógio) — o próximo `accept` recebe `offer_expired`; emite `offer.revoked`. */
  expireOffer(offerId: string): void;
  /** Define o código de embarque esperado por `start` (D-12, em aberto). Sem chamar isto, `start` aceita qualquer código. */
  setPickupCode(tripId: TripId, code: string): void;
  setVerificationStatus(status: VerificationStatus): void;
  setDocumentExpired(expired: boolean): void;
  /** Tudo que chegou em `sendLocations` (C4) — "o mock só guarda as posições". */
  receivedLocations(): readonly LocationFix[];
  /** `undefined` se a corrida não existe OU não é deste motorista (A3). */
  snapshot(tripId: TripId): DriverTripSnapshot | undefined;
}

export interface MockDriverRide {
  readonly offerPort: DriverOfferPort;
  readonly tripPort: DriverTripPort;
  readonly journeyPort: DriverJourneyPort;
  readonly locationPort: DriverLocationPort;
  readonly control: MockDriverRideControl;
}

export function createMockDriverRidePort(options: MockDriverRideOptions = {}): MockDriverRide {
  const clock = options.clock ?? Date.now;
  const store = options.store ?? createTripStore(clock);
  let counter = 0;
  const nextId = options.nextId ?? (() => `mock-${++counter}`);
  const driverId = options.driverId ?? `driver-${nextId()}`;

  let verificationStatus: VerificationStatus = options.verificationStatus ?? 'approved';
  let documentExpired = options.documentExpired ?? false;
  let phase: DriverPhase = 'offline';

  const offers = new Map<string, OfferRecord>();
  const tripInfoById = new Map<TripId, TripInfo>();
  const pickupCodes = new Map<TripId, string>();
  const startAttempts = new Map<TripId, number>();
  const offerSubscribers = new Set<(event: OfferEvent) => void>();
  const receivedLocations: LocationFix[] = [];

  const acceptCache = createIdempotencyCache<Result<{ readonly tripId: TripId }>>();
  const cancelCache = createIdempotencyCache<Result<{ readonly status: TripStatus }>>();
  const arrivedCache = createIdempotencyCache<Result<DriverTripSnapshot>>();
  const startCache = createIdempotencyCache<Result<DriverTripSnapshot>>();
  const completeCache = createIdempotencyCache<Result<DriverTripSnapshot>>();

  function emitOfferEvent(event: OfferEvent): void {
    for (const handler of offerSubscribers) handler(event);
  }

  function offer(input: OfferInput): RideOffer {
    const tripId = input.tripId ?? (nextId() as TripId);
    if (!store.get(tripId)) store.create(tripId, 'searching_driver');
    tripInfoById.set(tripId, {
      pickup: input.pickup,
      destination: input.destination,
      categoryId: input.categoryId,
      estimatedPayout: input.estimatedPayout,
      ...(input.passengerFirstName !== undefined ? { passengerFirstName: input.passengerFirstName } : {}),
    });

    const offerId = nextId();
    const expiresAtMs = clock() + (input.ttlMs ?? DEFAULT_OFFER_TTL_MS);
    const record: OfferRecord = { tripId, expiresAtMs, taken: false, resolved: false, stopWatching: () => {} };
    offers.set(offerId, record);

    // C2: se a corrida morrer por fora (outro motorista venceu, ou o passageiro cancelou), revoga.
    record.stopWatching = store.subscribe(tripId, (event) => {
      if (record.resolved || event.type !== 'status') return;
      if (event.status === 'searching_driver') return; // nada mudou de fato
      if (event.status === 'driver_assigned' && record.taken) return; // fui eu que aceitei
      record.resolved = true;
      record.stopWatching();
      emitOfferEvent({ type: 'offer.revoked', offerId, reason: event.status === 'driver_assigned' ? 'taken' : 'cancelled' });
    });

    const rideOffer: RideOffer = {
      offerId,
      tripId,
      expiresAt: new Date(expiresAtMs).toISOString() as RideOffer['expiresAt'],
      estimatedPayout: input.estimatedPayout,
      // Decisão do dono, 22/11/2026: só o bairro + distância/tempo até o embarque, nunca o endereço nem o ponto exato.
      pickup: toApproximatePlace(input.pickup),
      pickupDistanceM: input.pickupDistanceM ?? DEFAULT_PICKUP_DISTANCE_M,
      pickupEtaS: input.pickupEtaS ?? DEFAULT_PICKUP_ETA_S,
      destination: input.destination,
      categoryId: input.categoryId,
    };
    emitOfferEvent({ type: 'offer.created', offer: rideOffer });
    return rideOffer;
  }

  function resolveOffer(offerId: string, reason: 'taken' | 'expired'): void {
    const record = offers.get(offerId);
    if (!record || record.resolved) return;
    record.resolved = true;
    record.stopWatching();
    emitOfferEvent({ type: 'offer.revoked', offerId, reason });
  }

  async function accept(rideOffer: RideOffer, idempotencyKey: string): Promise<Result<{ readonly tripId: TripId }>> {
    const body = fingerprint({ tripId: rideOffer.tripId, offerId: rideOffer.offerId });
    const cached = acceptCache.get(idempotencyKey);
    if (cached) return cached.fingerprint === body ? cached.result : failWith(acceptConflict('idempotency_key_reused'));

    const result = ((): Result<{ readonly tripId: TripId }> => {
      const record = offers.get(rideOffer.offerId);
      if (!record) return failWith(notFound());
      if (clock() >= record.expiresAtMs) return failWith(acceptConflict('offer_expired'));
      if (record.resolved) return failWith(acceptConflict('offer_taken'));

      const trip = store.get(record.tripId);
      const outcome = trip ? transitionTrip(trip.status, 'driver_assigned') : undefined;
      if (!outcome?.ok) return failWith(acceptConflict('offer_taken')); // zero linhas afetadas no UPDATE real (§5.4)

      record.taken = true;
      store.setStatus(record.tripId, outcome.state, driverId);
      store.setStatus(record.tripId, 'driver_en_route'); // sistema: automático no aceite, o app não chama nada (C1)
      record.resolved = true;
      record.stopWatching();
      return succeed({ tripId: record.tripId });
    })();

    acceptCache.set(idempotencyKey, body, result);
    return result;
  }

  async function decline(rideOffer: RideOffer, _input?: { readonly reason?: DeclineReason }): Promise<Result<void>> {
    const record = offers.get(rideOffer.offerId);
    if (record && !record.resolved) {
      record.resolved = true;
      record.stopWatching();
      // §5.4: toda recusa é guardada com motivo desde o 1º dia (auditoria fora do escopo deste mock).
    }
    return succeed(undefined); // idempotente: oferta desconhecida ou já resolvida também é sucesso
  }

  function subscribeOffers(onEvent: (event: OfferEvent) => void): () => void {
    offerSubscribers.add(onEvent);
    return () => offerSubscribers.delete(onEvent);
  }

  /** A3: só o motorista ATRIBUÍDO vê a corrida. `undefined` = não existe OU não é deste motorista. */
  function assignedTripInfo(tripId: TripId): { readonly status: TripStatus; readonly seq: number; readonly info: TripInfo } | undefined {
    const record = store.get(tripId);
    if (!record || record.assignedDriverId !== driverId) return undefined;
    const info = tripInfoById.get(tripId);
    if (!info) return undefined;
    return { status: record.status, seq: record.seq, info };
  }

  function buildSnapshot(tripId: TripId, status: TripStatus, seq: number, info: TripInfo): DriverTripSnapshot {
    const base = {
      tripId,
      status,
      seq,
      pickup: info.pickup,
      destination: info.destination,
      categoryId: info.categoryId,
      estimatedPayout: info.estimatedPayout,
    };
    return info.passengerFirstName !== undefined ? { ...base, passenger: { firstName: info.passengerFirstName } } : base;
  }

  async function status(tripId: TripId): Promise<Result<DriverTripSnapshot>> {
    const found = assignedTripInfo(tripId);
    return found ? succeed(buildSnapshot(tripId, found.status, found.seq, found.info)) : failWith(notFound());
  }

  function subscribe(tripId: TripId, onEvent: (event: TripEvent) => void): () => void {
    if (store.get(tripId)?.assignedDriverId !== driverId) return () => {}; // A3: não é meu — nada a assinar
    return store.subscribe(tripId, (event) => {
      if (store.get(tripId)?.assignedDriverId !== driverId) return; // perdeu a atribuição no meio do caminho
      onEvent(event);
    });
  }

  function doTransition(
    tripId: TripId,
    idempotencyKey: string,
    cache: IdempotencyCache<Result<DriverTripSnapshot>>,
    body: string,
    to: TripStatus,
  ): Result<DriverTripSnapshot> {
    const cached = cache.get(idempotencyKey);
    if (cached) return cached.fingerprint === body ? cached.result : failWith(driverActionConflict('idempotency_key_reused'));

    const result = ((): Result<DriverTripSnapshot> => {
      const found = assignedTripInfo(tripId);
      if (!found) return failWith(notFound());
      const outcome = transitionTrip(found.status, to);
      if (!outcome.ok) return failWith(driverActionConflict('invalid_transition'));
      store.setStatus(tripId, outcome.state);
      const after = assignedTripInfo(tripId);
      return after ? succeed(buildSnapshot(tripId, after.status, after.seq, after.info)) : failWith(notFound());
    })();
    cache.set(idempotencyKey, body, result);
    return result;
  }

  async function arrived(tripId: TripId, idempotencyKey: string): Promise<Result<DriverTripSnapshot>> {
    return doTransition(tripId, idempotencyKey, arrivedCache, fingerprint({ tripId }), 'driver_arrived');
  }

  async function start(tripId: TripId, input: { readonly pickupCode?: string }, idempotencyKey: string): Promise<Result<DriverTripSnapshot>> {
    const body = fingerprint({ tripId, ...input });
    const cached = startCache.get(idempotencyKey);
    if (cached) return cached.fingerprint === body ? cached.result : failWith(driverActionConflict('idempotency_key_reused'));

    const result = ((): Result<DriverTripSnapshot> => {
      const expected = pickupCodes.get(tripId);
      if (expected !== undefined) {
        const attempts = startAttempts.get(tripId) ?? 0;
        if (attempts >= START_CODE_ATTEMPTS) return failWith({ kind: 'rate_limited', retryAfterSeconds: 30 });
        if (input.pickupCode !== expected) {
          startAttempts.set(tripId, attempts + 1);
          return failWith(validation({ pickupCode: 'Código de embarque incorreto.' }));
        }
      }
      const found = assignedTripInfo(tripId);
      if (!found) return failWith(notFound());
      const outcome = transitionTrip(found.status, 'in_progress');
      if (!outcome.ok) return failWith(driverActionConflict('invalid_transition'));
      store.setStatus(tripId, outcome.state);
      startAttempts.delete(tripId);
      const after = assignedTripInfo(tripId);
      return after ? succeed(buildSnapshot(tripId, after.status, after.seq, after.info)) : failWith(notFound());
    })();

    startCache.set(idempotencyKey, body, result);
    return result;
  }

  async function complete(tripId: TripId, input: { readonly deliveryCode?: string }, idempotencyKey: string): Promise<Result<DriverTripSnapshot>> {
    return doTransition(tripId, idempotencyKey, completeCache, fingerprint({ tripId, ...input }), 'completed');
  }

  async function cancel(
    tripId: TripId,
    input: { readonly reason?: DriverCancelReason },
    idempotencyKey: string,
  ): Promise<Result<{ readonly status: TripStatus }>> {
    const body = fingerprint({ tripId, ...input });
    const cached = cancelCache.get(idempotencyKey);
    if (cached) return cached.fingerprint === body ? cached.result : failWith(cancelConflict('idempotency_key_reused'));

    const result = ((): Result<{ readonly status: TripStatus }> => {
      const found = assignedTripInfo(tripId); // A1+A3: só o atribuído, e cancelTrip ainda recusa fora de driver_assigned/en_route/arrived
      if (!found) return failWith(notFound());
      const outcome = cancelTrip(found.status, 'driver');
      if (!outcome.ok) return failWith(cancelConflict('invalid_transition'));
      store.setStatus(tripId, outcome.state);
      return succeed({ status: outcome.state });
    })();

    cancelCache.set(idempotencyKey, body, result);
    return result;
  }

  async function verification(): Promise<Result<{ readonly status: VerificationStatus }>> {
    return succeed({ status: verificationStatus });
  }

  async function setAvailability(input: DriverAvailabilityInput): Promise<Result<{ readonly phase: DriverPhase }>> {
    if (verificationStatus !== 'approved') return failWith(availabilityConflict('driver_not_approved'));
    if (documentExpired) return failWith(availabilityConflict('not_eligible'));
    if (input.online && !input.point) return failWith(validation({ point: 'Posição obrigatória para ficar online.' }));
    phase = input.online ? 'online' : 'offline';
    return succeed({ phase });
  }

  async function sendLocations(fixes: readonly LocationFix[]): Promise<Result<void>> {
    receivedLocations.push(...fixes);
    return succeed(undefined);
  }

  const control: MockDriverRideControl = {
    offer,
    takeOffer(offerId) {
      resolveOffer(offerId, 'taken');
    },
    expireOffer(offerId) {
      const record = offers.get(offerId);
      if (record) record.expiresAtMs = clock() - 1;
      resolveOffer(offerId, 'expired');
    },
    setPickupCode(tripId, code) {
      pickupCodes.set(tripId, code);
      startAttempts.delete(tripId);
    },
    setVerificationStatus(status) {
      verificationStatus = status;
    },
    setDocumentExpired(expired) {
      documentExpired = expired;
    },
    receivedLocations() {
      return receivedLocations;
    },
    snapshot(tripId) {
      const found = assignedTripInfo(tripId);
      return found ? buildSnapshot(tripId, found.status, found.seq, found.info) : undefined;
    },
  };

  return {
    offerPort: { accept, decline, subscribeOffers },
    tripPort: { status, subscribe, arrived, start, complete, cancel },
    journeyPort: { verification, setAvailability },
    locationPort: { sendLocations },
    control,
  };
}
