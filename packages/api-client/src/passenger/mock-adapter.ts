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
 * DESLIGADAS (plano-sistema.md §13.3; decisão 8 em aberto), não é "sem motorista agora". **Pet
 * também nasce DESLIGADA** (D-09, plano-mestre.md: "as duas [Pet e Entrega] nascem desligadas") —
 * achado de "não bloqueia" da reconferência da Nova; o teste que precisar de Pet liga por
 * `control.setCategoryEnabled('pet', true)`. Pedir uma categoria que ainda está na lista mas ficou
 * `availability: 'none'` É aceito: se nenhum motorista aparecer no tempo máximo, a corrida termina
 * em `failed` (achado B1 da conferência).
 */
import { cancelTrip, TRIP_TRANSITIONS, transitionTrip } from '@vuumbora/domain';
import type { GeoPoint, Money, Place, TripId, TripStatus, TripTransitionResult } from '@vuumbora/domain';
import { createIdempotencyCache, fingerprint } from '../trip/idempotency';
import { createTripStore, DRIVER_ASSIGNED_STATUSES, type TripStore } from '../trip/mock-store';
import { cancelConflict, failWith, notFound, quoteConflict, requestConflict, succeed, validation } from '../trip/result';
import type { CancelActor, TripEvent, TripHistoryPage } from '../trip/types';
import type {
  CancelReason,
  CategoryAvailability,
  CategoryQuote,
  PassengerRidePort,
  PassengerTripHistoryEntry,
  PassengerTripHistoryInput,
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
  { categoryId: 'pet', amountCents: 2190, distanceM: 5200, durationS: 900, pickupEtaS: 300, availability: 'low', kind: 'ride', enabled: false }, // D-09: nasce desligada
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
  /**
   * Tenta mover a corrida para `to`, com a MESMA validação do domínio. `assignedDriverId`: passe
   * ao ir para `driver_assigned` — é por ele que `setDriverSummary` resolve A QUEM atribuir o
   * resumo (R2); sem ele, a corrida fica sem motorista atribuído na store mesmo com `to:
   * 'driver_assigned'`, e nenhum resumo aparece no snapshot.
   */
  advance(tripId: TripId, to: TripStatus, assignedDriverId?: string): TripTransitionResult;
  /**
   * Anexa o resumo do motorista ATUALMENTE atribuído (R2, reconferência da Nova): só tem efeito se
   * `summary.driverId` for exatamente quem a store diz estar atribuído agora — de um motorista que
   * não é mais o atribuído é ignorado em silêncio. Isso evita o resumo de um motorista que já saiu
   * reaparecer para o PRÓXIMO motorista atribuído (antes, o resumo era guardado por `tripId`, e um
   * `tripId` reaproveitado por um motorista novo herdava o resumo do antigo até alguém chamar isto
   * de novo).
   */
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

const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 50;

/** Terminal = sem saída na máquina de estados do servidor (completed, cancelled, failed). */
function isTerminalStatus(status: TripStatus): boolean {
  return TRIP_TRANSITIONS[status].length === 0;
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
  const quotesById = new Map<
    string,
    { readonly categoryId: string; readonly expiresAtMs: number; readonly origin: Place; readonly destination: Place }
  >();
  /** Por `driverId` (R2) — NUNCA por `tripId`: ver o porquê no JSDoc de `MockPassengerRideControl.setDriverSummary`. */
  const driverSummaries = new Map<string, TripDriverSummary>();

  const requestCache = createIdempotencyCache<Result<{ readonly tripId: TripId; readonly status: TripStatus }>>();
  const cancelCache = createIdempotencyCache<Result<{ readonly status: TripStatus }>>();

  // ---- histórico (item 3, PP-12): rascunho por tripId desde o pedido, fechado quando a corrida termina ----
  interface HistoryDraft {
    readonly requestedAtMs: number;
    readonly origin: Place;
    readonly destination: Place;
    readonly categoryId: string;
    readonly distanceM: number;
    readonly durationS: number;
    readonly fare: Money;
  }
  const historyDrafts = new Map<TripId, HistoryDraft>();
  /** Mais recente primeiro — é como `history()` devolve a página (sem paginação real de banco). */
  const historyEntries: PassengerTripHistoryEntry[] = [];

  function watchForHistory(tripId: TripId): void {
    const stop = store.subscribe(tripId, (event) => {
      if (event.type !== 'status' || !isTerminalStatus(event.status)) return;
      const draft = historyDrafts.get(tripId);
      if (draft) {
        const record = store.get(tripId);
        const driver = record ? driverSummaryFor(record) : undefined;
        historyEntries.unshift({
          tripId,
          status: event.status,
          requestedAt: new Date(draft.requestedAtMs).toISOString(),
          endedAt: new Date(clock()).toISOString(),
          origin: draft.origin,
          destination: draft.destination,
          categoryId: draft.categoryId,
          distanceM: draft.distanceM,
          durationS: draft.durationS,
          // P2 (conferência da Nova, PP-12): dinheiro só em completed — cancelled/failed nunca
          // chegaram a cobrar nada. cancellationFee fica de fora até a decisão 15 (M6) existir.
          ...(event.status === 'completed' ? { fare: draft.fare } : {}),
          ...(driver ? { driver } : {}),
        });
        historyDrafts.delete(tripId);
      }
      stop();
    });
  }

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
      quotesById.set(quoteId, { categoryId: fixture.categoryId, expiresAtMs, origin: input.origin, destination: input.destination });
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
      const fixture = fixtureById.get(found.categoryId);
      if (fixture) {
        historyDrafts.set(tripId, {
          requestedAtMs: clock(),
          origin: found.origin,
          destination: found.destination,
          categoryId: found.categoryId,
          distanceM: fixture.distanceM,
          durationS: fixture.durationS,
          fare: fareOf(fixture.amountCents).total,
        });
        watchForHistory(tripId);
      }
      return succeed({ tripId, status: 'requested' as TripStatus });
    })();

    requestCache.set(idempotencyKey, body, result);
    return result;
  }

  /**
   * A2/R2: resolve pelo `assignedDriverId` ATUAL da store, nunca por um valor guardado à parte do
   * `tripId` — assim um motorista que já saiu nunca "empresta" o resumo para quem assumiu depois
   * dele (R2 da reconferência: com a chave por `tripId`, a limpeza só acontecia quando alguém LIA o
   * snapshot durante a busca; sem essa leitura, o resumo antigo sobrevivia e era servido para o
   * motorista NOVO, que nunca teve o próprio resumo anexado).
   */
  function driverSummaryFor(record: { readonly status: TripStatus; readonly assignedDriverId?: string }): TripDriverSummary | undefined {
    if (!DRIVER_ASSIGNED_STATUSES.has(record.status) || !record.assignedDriverId) return undefined;
    return driverSummaries.get(record.assignedDriverId);
  }

  function buildSnapshot(
    tripId: TripId,
    record: { readonly status: TripStatus; readonly seq: number; readonly assignedDriverId?: string },
  ): PassengerTripSnapshot {
    const driver = driverSummaryFor(record);
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
    // R6 (reconferência da Nova): a impressão inclui o tripId — sem ele, a MESMA chave usada em
    // OUTRA corrida com o mesmo `input` (ex.: {} sem reason) batia no cache e devolvia o resultado
    // da corrida ERRADA, sem tocar na corrida que de fato devia ser cancelada.
    const body = fingerprint({ tripId, ...input });
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

  async function history(input: PassengerTripHistoryInput): Promise<Result<TripHistoryPage<PassengerTripHistoryEntry>>> {
    if (input.from !== undefined && Number.isNaN(Date.parse(input.from))) return failWith(validation({ from: 'Data inicial inválida.' }));
    if (input.to !== undefined && Number.isNaN(Date.parse(input.to))) return failWith(validation({ to: 'Data final inválida.' }));
    const fromMs = input.from !== undefined ? Date.parse(input.from) : undefined;
    const toMs = input.to !== undefined ? Date.parse(input.to) : undefined;
    if (fromMs !== undefined && toMs !== undefined && fromMs > toMs) {
      return failWith(validation({ from: 'Período inválido: data inicial depois da data final.' }));
    }
    const limit = Math.min(MAX_HISTORY_LIMIT, Math.max(1, input.limit ?? DEFAULT_HISTORY_LIMIT));

    const filtered = historyEntries.filter((entry) => {
      const requestedMs = Date.parse(entry.requestedAt);
      if (fromMs !== undefined && requestedMs < fromMs) return false;
      if (toMs !== undefined && requestedMs > toMs) return false;
      return true;
    });

    // Cursor opaco: o tripId do último item da página anterior (só vale para este mock em memória).
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

  const control: MockPassengerRideControl = {
    advance(tripId, to, assignedDriverId) {
      const record = store.get(tripId);
      if (!record) return { ok: false, from: to, to, reason: 'Corrida inexistente neste mock.' };
      const result = transitionTrip(record.status, to);
      if (result.ok) store.setStatus(tripId, result.state, assignedDriverId);
      return result;
    },
    setDriverSummary(tripId, summary) {
      // R2: ignora em silêncio se este motorista não é (mais) o atribuído a esta corrida AGORA.
      const record = store.get(tripId);
      if (record && DRIVER_ASSIGNED_STATUSES.has(record.status) && record.assignedDriverId === summary.driverId) {
        driverSummaries.set(summary.driverId, summary);
      }
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

  return { port: { quote, request, status, cancel, subscribe, history }, control };
}
