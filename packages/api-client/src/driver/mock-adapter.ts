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
 * **Embarque E destino só o bairro na oferta** (decisão do dono, 22/11/2026 —
 * `docs/decisoes-do-dono.md`, "Complemento: o embarque na oferta é só o bairro" e "Complemento: o
 * destino na oferta também é só o bairro"): `control.offer` nunca passa o endereço nem o ponto
 * exato de nenhum dos dois para `RideOffer`. O endereço completo dos dois só aparece em
 * `DriverTripSnapshot`, depois do aceite, e só para quem `assignedTripInfo` confirma ser o
 * atribuído (A3). `pickupDistanceM`/`pickupEtaS` vão arredondados (100 m / 1 min) — recomendação da
 * Nova: exatos estreitariam demais o quadrado aproximado do embarque.
 *
 * **Código de embarque (D-12, decidido pelo dono em 22/11/2026: PIN em todas as categorias):**
 * `start` EXIGE o código. Ele mora na `TripStore` (é estado da corrida): com a store compartilhada,
 * é o mesmo que o passageiro vê em `PassengerTripSnapshot.pickupCode`. Se a corrida ainda não tem
 * código quando `control.offer` a recebe (mock só do motorista, sem passageiro), o `offer` gera um.
 * O motorista nunca recebe o código (nem na oferta, nem no snapshot, nem no evento) — o teste, ou
 * o simulador do app, o define por `control.setPickupCode` para "fazer o papel do passageiro".
 */
import {
  cancelTrip,
  isPickupCodeFormat,
  PICKUP_CODE_LENGTH,
  toApproximatePlace,
  toTripRange,
  TRIP_TRANSITIONS,
  transitionTrip,
} from '@vuumbora/domain';
import type { Money, Place, TripId, TripStatus } from '@vuumbora/domain';
import type { DriverPhase, RideOffer, VerificationStatus } from '@vuumbora/domain/driver';
import type { Result } from '../index';
import { createIdempotencyCache, fingerprint, type IdempotencyCache } from '../trip/idempotency';
import { createTripStore, type TripStore } from '../trip/mock-store';
import { generatePickupCode, randomPickupCode } from '../trip/pickup-code';
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
import type { TripEvent, TripHistoryPage } from '../trip/types';
import type {
  DeclineReason,
  DriverAvailabilityInput,
  DriverCancelReason,
  DriverJourneyPort,
  DriverLocationPort,
  DriverOfferPort,
  DriverStartTripInput,
  DriverTripHistoryEntry,
  DriverTripHistoryInput,
  DriverTripHistoryPort,
  DriverTripPort,
  DriverTripSnapshot,
  LocationFix,
  OfferEvent,
} from './types';

const DEFAULT_OFFER_TTL_MS = 15 * 1000; // §5.4: proposta de 15 s
const DEFAULT_PICKUP_DISTANCE_M = 1200;
const DEFAULT_PICKUP_ETA_S = 240;
/** Padrão da viagem (embarque → destino) só para a oferta ter o que arredondar em faixa (PP-12). */
const DEFAULT_TRIP_DISTANCE_M = 5200;
const DEFAULT_TRIP_DURATION_S = 900;
const START_CODE_ATTEMPTS = 5;
const PICKUP_DISTANCE_STEP_M = 100;
const PICKUP_ETA_STEP_S = 60;
const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 50;

/** Arredonda para o múltiplo mais próximo de `step` — nunca o valor exato na oferta (recomendação da Nova). */
function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Terminal = sem saída na máquina de estados do servidor (completed, cancelled, failed). */
function isTerminalStatus(status: TripStatus): boolean {
  return TRIP_TRANSITIONS[status].length === 0;
}

interface TripInfo {
  readonly pickup: Place;
  readonly destination: Place;
  readonly categoryId: string;
  readonly estimatedPayout: Money;
  readonly passengerFirstName?: string;
  /** Exatos — só para a história e a faixa da oferta; nunca aparecem direto numa resposta. */
  readonly tripDistanceM: number;
  readonly tripDurationS: number;
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
  /**
   * Distância/duração EXATAS da viagem (embarque → destino) — padrão 5200 m / 900 s. Nunca saem
   * exatas: a oferta as arredonda em faixa (`RideOffer.tripDistanceM`/`tripDurationS`, PP-12); o
   * histórico (`DriverTripHistoryPort`) as guarda como estão, porque depois da corrida já não
   * revelam localização nenhuma.
   */
  readonly tripDistanceM?: number;
  readonly tripDurationS?: number;
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
  /**
   * Gerador do código de embarque (D-12), usado só quando `control.offer` recebe uma corrida que
   * ainda não tem código (mock só do motorista). Corrida criada pelo passageiro já chega com o
   * código dele. Padrão: aleatório em `0000`–`9999`.
   */
  readonly nextPickupCode?: () => string;
}

export interface MockDriverRideControl {
  offer(input: OfferInput): RideOffer;
  /** Marca a oferta como tomada por OUTRO motorista — o próximo `accept` recebe `offer_taken`; emite `offer.revoked`. */
  takeOffer(offerId: string): void;
  /** Força a expiração (sem esperar o relógio) — o próximo `accept` recebe `offer_expired`; emite `offer.revoked`. */
  expireOffer(offerId: string): void;
  /**
   * Troca o código de embarque da corrida (D-12) — o teste, ou o simulador do app, "faz o papel do
   * passageiro" e passa a saber o código que o `start` confere. Grava na `TripStore`: com a store
   * compartilhada, o passageiro passa a ver o mesmo código. Zera as tentativas DESTE motorista na
   * corrida. Código fora do formato (4 algarismos) lança `TypeError` (erro de configuração do teste).
   */
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
  /** Histórico de corridas DESTE motorista (acréscimo PP-12, item 3). */
  readonly historyPort: DriverTripHistoryPort;
  readonly control: MockDriverRideControl;
}

export function createMockDriverRidePort(options: MockDriverRideOptions = {}): MockDriverRide {
  const clock = options.clock ?? Date.now;
  const store = options.store ?? createTripStore(clock);
  let counter = 0;
  const nextId = options.nextId ?? (() => `mock-${++counter}`);
  const driverId = options.driverId ?? `driver-${nextId()}`;
  const nextPickupCode = options.nextPickupCode ?? randomPickupCode;

  let verificationStatus: VerificationStatus = options.verificationStatus ?? 'approved';
  let documentExpired = options.documentExpired ?? false;
  let phase: DriverPhase = 'offline';

  const offers = new Map<string, OfferRecord>();
  const tripInfoById = new Map<TripId, TripInfo>();
  const startAttempts = new Map<TripId, number>();
  const offerSubscribers = new Set<(event: OfferEvent) => void>();
  const receivedLocations: LocationFix[] = [];

  const acceptCache = createIdempotencyCache<Result<{ readonly tripId: TripId }>>();
  const cancelCache = createIdempotencyCache<Result<{ readonly status: TripStatus }>>();
  const arrivedCache = createIdempotencyCache<Result<DriverTripSnapshot>>();
  const startCache = createIdempotencyCache<Result<DriverTripSnapshot>>();
  const completeCache = createIdempotencyCache<Result<DriverTripSnapshot>>();

  // ---- histórico (item 3, PP-12): rascunho desde o aceite, fechado quando a corrida termina ----
  const historyDrafts = new Map<TripId, { readonly assignedAtMs: number }>();
  /** Mais recente primeiro — como `historyPort.history()` devolve a página (mock em memória). */
  const historyEntries: DriverTripHistoryEntry[] = [];

  /**
   * P1 (achado da conferência da Nova sobre a PP-12, `docs/contratos/conferencia-pp12-nova.md`):
   * só grava a entrada se, no estado FINAL, a corrida ainda está atribuída a ESTE motorista — mesma
   * regra de visibilidade do R1 da F08. Sem essa checagem, um motorista que devolveu a corrida
   * (voltou para a busca) continuava "escutando" o `tripId` por baixo (o watcher só se desliga num
   * estado terminal) e, quando OUTRO motorista a concluía, herdava a entrada — com o `payout` e a
   * categoria do PRÓPRIO rascunho dele, de uma corrida que não foi dele. `historyDrafts.delete` e
   * `stop()` correm SEMPRE (mesmo sem gravar): é o que evita duplicata se este motorista aceitou o
   * MESMO `tripId` mais de uma vez (devolveu e foi oferecido de novo) — o 1º watcher a ver o estado
   * terminal apaga o rascunho; o(s) outro(s) encontram `draft` vazio e não gravam de novo.
   */
  function watchForHistory(tripId: TripId): void {
    const stop = store.subscribe(tripId, (event) => {
      if (event.type !== 'status' || !isTerminalStatus(event.status)) return;
      const draft = historyDrafts.get(tripId);
      const info = tripInfoById.get(tripId);
      const stillAssignedToMe = store.get(tripId)?.assignedDriverId === driverId;
      if (draft && info && stillAssignedToMe) {
        historyEntries.unshift({
          tripId,
          status: event.status,
          assignedAt: new Date(draft.assignedAtMs).toISOString(),
          endedAt: new Date(clock()).toISOString(),
          // PP-14: só bairro dos dois, nunca endereço nem ponto exato — mesma função da oferta.
          pickup: toApproximatePlace(info.pickup),
          destination: toApproximatePlace(info.destination),
          categoryId: info.categoryId,
          distanceM: info.tripDistanceM,
          durationS: info.tripDurationS,
          // P2 (mesma conferência): dinheiro só em completed — "ganho numa corrida cancelada" espera
          // a decisão 15; mostrar o estimado hoje seria dinheiro na frente do motorista sem cobertura.
          ...(event.status === 'completed' ? { payout: info.estimatedPayout } : {}),
          // P3 (mesma conferência): sem o nome do passageiro — a M12 pede bairro, horário, distância,
          // categoria e valor; nome guardado por meses é dado pessoal de outra pessoa sem uso aqui.
        });
      }
      historyDrafts.delete(tripId);
      stop();
    });
  }

  function emitOfferEvent(event: OfferEvent): void {
    for (const handler of offerSubscribers) handler(event);
  }

  function offer(input: OfferInput): RideOffer {
    const tripId = input.tripId ?? (nextId() as TripId);
    if (!store.get(tripId)) store.create(tripId, 'searching_driver');
    // D-12: toda corrida que chega a um motorista tem código. A do passageiro já vem com o dele;
    // a criada aqui (mock só do motorista) ganha um agora.
    if (store.pickupCode(tripId) === undefined) store.setPickupCode(tripId, generatePickupCode(nextPickupCode));
    const tripDistanceM = input.tripDistanceM ?? DEFAULT_TRIP_DISTANCE_M;
    const tripDurationS = input.tripDurationS ?? DEFAULT_TRIP_DURATION_S;
    tripInfoById.set(tripId, {
      pickup: input.pickup,
      destination: input.destination,
      categoryId: input.categoryId,
      estimatedPayout: input.estimatedPayout,
      tripDistanceM,
      tripDurationS,
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

    const tripRange = toTripRange(tripDistanceM, tripDurationS);
    const rideOffer: RideOffer = {
      offerId,
      tripId,
      expiresAt: new Date(expiresAtMs).toISOString() as RideOffer['expiresAt'],
      estimatedPayout: input.estimatedPayout,
      // Decisão do dono, 22/11/2026: embarque E destino só o bairro — nunca o endereço nem o ponto exato de nenhum.
      pickup: toApproximatePlace(input.pickup),
      pickupDistanceM: roundToStep(input.pickupDistanceM ?? DEFAULT_PICKUP_DISTANCE_M, PICKUP_DISTANCE_STEP_M),
      pickupEtaS: roundToStep(input.pickupEtaS ?? DEFAULT_PICKUP_ETA_S, PICKUP_ETA_STEP_S),
      destination: toApproximatePlace(input.destination),
      categoryId: input.categoryId,
      // PP-12: distância/duração da viagem (embarque → destino) em FAIXA — nunca o valor exato.
      tripDistanceM: tripRange.distanceM,
      tripDurationS: tripRange.durationS,
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

      // R4 (reconferência da Nova): resolve e desliga o vigia da OFERTA antes das duas transições de
      // estado — senão a passagem automática driver_assigned -> driver_en_route (abaixo) é lida pelo
      // próprio vigia como "a corrida não está mais em driver_assigned" e revoga a oferta que o
      // motorista acabou de aceitar, emitindo `offer.revoked` para quem a aceitou.
      record.taken = true;
      record.resolved = true;
      record.stopWatching();
      store.setStatus(record.tripId, outcome.state, driverId);
      store.setStatus(record.tripId, 'driver_en_route'); // sistema: automático no aceite, o app não chama nada (C1)
      historyDrafts.set(record.tripId, { assignedAtMs: clock() });
      watchForHistory(record.tripId);
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

  /**
   * Ordem das checagens (JSDoc de `DriverTripPort.start`): 400 de formato → 404 (não é o
   * atribuído) → 409 (fase errada) → 429 (muitas tentativas) → 400 (código errado, conta tentativa).
   *
   * - **400 de formato (D-12):** o código é obrigatório. Falta ou formato inválido é validação do
   *   CORPO, como o servidor faz antes de tocar no banco: responde igual exista a corrida ou não,
   *   não conta tentativa e não entra no cache de idempotência (a requisição nem começou; a mesma
   *   chave, com o corpo corrigido, segue valendo).
   * - **R3 (reconferência da Nova):** a atribuição vem antes de tudo que toca as tentativas. Antes,
   *   o código era checado ANTES da atribuição, e qualquer motorista que recebeu a oferta (o
   *   `tripId` vai em toda `RideOffer`) gastava as tentativas do motorista ATRIBUÍDO.
   *   `startAttempts` é por INSTÂNCIA (um motorista) e só é alcançado depois do 404, então as
   *   tentativas contam por corrida E motorista, e só as do atribuído.
   */
  async function start(tripId: TripId, input: DriverStartTripInput, idempotencyKey: string): Promise<Result<DriverTripSnapshot>> {
    // Entrada não confiável: o tipo diz obrigatório, mas quem chama pode ser JS ou um corpo de rede.
    const pickupCode: unknown = (input as { readonly pickupCode?: unknown } | null | undefined)?.pickupCode;
    if (pickupCode === undefined || pickupCode === null || pickupCode === '') {
      return failWith(validation({ pickupCode: 'Informe o código de embarque.' })); // 400, não conta tentativa
    }
    if (!isPickupCodeFormat(pickupCode)) {
      return failWith(validation({ pickupCode: `O código de embarque tem ${PICKUP_CODE_LENGTH} números.` })); // 400, não conta tentativa
    }

    const body = fingerprint({ tripId, pickupCode });
    const cached = startCache.get(idempotencyKey);
    if (cached) return cached.fingerprint === body ? cached.result : failWith(driverActionConflict('idempotency_key_reused'));

    const result = ((): Result<DriverTripSnapshot> => {
      const found = assignedTripInfo(tripId);
      if (!found) return failWith(notFound()); // 404
      const outcome = transitionTrip(found.status, 'in_progress');
      if (!outcome.ok) return failWith(driverActionConflict('invalid_transition')); // 409

      const attempts = startAttempts.get(tripId) ?? 0;
      if (attempts >= START_CODE_ATTEMPTS) return failWith({ kind: 'rate_limited', retryAfterSeconds: 30 }); // 429
      // Falha FECHADA por construção: `pickupCode` já é texto de 4 algarismos, então nunca é igual a
      // `undefined`. Corrida sem código (não acontece por caminho público; o `offer` garante um)
      // conta como código errado, nunca deixa começar sem código.
      if (pickupCode !== store.pickupCode(tripId)) {
        startAttempts.set(tripId, attempts + 1);
        return failWith(validation({ pickupCode: 'Código de embarque incorreto.' })); // 400, conta tentativa
      }
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

  /**
   * R7 (reconferência da Nova): as checagens de aprovação/documento valem só para ficar ONLINE —
   * um motorista com documento vencido, ou cuja conta nunca foi aprovada, ainda precisa conseguir
   * ficar offline (senão trava o app no meio do turno, sem saída).
   */
  async function setAvailability(input: DriverAvailabilityInput): Promise<Result<{ readonly phase: DriverPhase }>> {
    if (input.online) {
      if (verificationStatus !== 'approved') return failWith(availabilityConflict('driver_not_approved'));
      if (documentExpired) return failWith(availabilityConflict('not_eligible'));
      if (!input.point) return failWith(validation({ point: 'Posição obrigatória para ficar online.' }));
    }
    phase = input.online ? 'online' : 'offline';
    return succeed({ phase });
  }

  async function sendLocations(fixes: readonly LocationFix[]): Promise<Result<void>> {
    receivedLocations.push(...fixes);
    return succeed(undefined);
  }

  async function history(input: DriverTripHistoryInput): Promise<Result<TripHistoryPage<DriverTripHistoryEntry>>> {
    if (input.from !== undefined && Number.isNaN(Date.parse(input.from))) return failWith(validation({ from: 'Data inicial inválida.' }));
    if (input.to !== undefined && Number.isNaN(Date.parse(input.to))) return failWith(validation({ to: 'Data final inválida.' }));
    const fromMs = input.from !== undefined ? Date.parse(input.from) : undefined;
    const toMs = input.to !== undefined ? Date.parse(input.to) : undefined;
    if (fromMs !== undefined && toMs !== undefined && fromMs > toMs) {
      return failWith(validation({ from: 'Período inválido: data inicial depois da data final.' }));
    }
    const limit = Math.min(MAX_HISTORY_LIMIT, Math.max(1, input.limit ?? DEFAULT_HISTORY_LIMIT));

    const filtered = historyEntries.filter((entry) => {
      const endedMs = Date.parse(entry.endedAt);
      if (fromMs !== undefined && endedMs < fromMs) return false;
      if (toMs !== undefined && endedMs > toMs) return false;
      return true;
    });

    let startIndex = 0;
    if (input.cursor !== undefined) {
      const at = filtered.findIndex((entry) => entry.tripId === input.cursor);
      startIndex = at === -1 ? filtered.length : at + 1;
    }
    const items = filtered.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < filtered.length;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem ? lastItem.tripId : undefined;
    return succeed({ items, ...(nextCursor !== undefined ? { nextCursor } : {}) });
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
      store.setPickupCode(tripId, generatePickupCode(() => code)); // mesma conferência de formato do gerador
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
    historyPort: { history },
    control,
  };
}
