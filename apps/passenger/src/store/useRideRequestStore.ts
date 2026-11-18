import { create } from 'zustand';
import type { Place } from '@vuumbora/domain';
import { canRequestRide, transitionRide, type PassengerTripPhase, type RideDraft } from '@vuumbora/domain/passenger';
import { MOCK_CURRENT_LOCATION } from '../data/mockPlaces';
import { DEFAULT_RIDE_CATEGORY_KEY } from '../data/mockRideCategories';
import type { AssignedDriverInfo } from '../data/mockDriverAssignment';
import type { TripReceipt } from '../data/mockTripReceipt';
import { startRideSimulation, stopRideSimulation } from '../sim/rideSimulator';

/**
 * Estado do PEDIDO/JORNADA DE CORRIDA, compartilhado entre Home (P03), Destino (P04),
 * Confirmação (P06), Busca (P07), Motorista a caminho (P08), Em andamento (P09) e
 * Concluída (P10) — nenhuma tela repassa isso por prop, todas leem/escrevem direto no
 * store (pedido do Atlas/arquitetura).
 *
 * `RideDraft`/`canRequestRide`/`transitionRide` vêm de `@vuumbora/domain/passenger` —
 * esta store nunca decide por conta própria se pode avançar de fase; ela sempre pergunta
 * ao domínio (`transitionRide`) e só aplica o resultado se ele aceitar.
 *
 * Fase 1 (sem backend): toda a progressão depois de `requestRide` é feita por um
 * SIMULADOR LOCAL (`src/sim/rideSimulator.ts`) — nenhuma chamada de rede acontece aqui
 * (pendência: Vega implementa o adaptador `PassengerRidePort` quando o contrato de
 * backend existir). Os métodos `*FromSimulator` abaixo só existem para esse simulador
 * chamar; são o ponto exato que o backend substitui depois.
 */
export interface AssignedRating {
  readonly stars: number;
  readonly comment?: string;
}

export interface RideRequestState {
  readonly origin?: Place | undefined;
  readonly destination?: Place | undefined;
  readonly categoryId?: string | undefined;
  readonly paymentMethodId?: string | undefined;
  readonly phase: PassengerTripPhase;

  readonly assignedDriver?: AssignedDriverInfo | undefined;
  /** Minutos estimados até o EMBARQUE (P08) — simulado. */
  readonly pickupEtaMinutes?: number | undefined;
  /** Minutos estimados até o DESTINO (P09) — simulado. */
  readonly tripEtaMinutes?: number | undefined;
  readonly tripProgressPercent: number;
  readonly receipt?: TripReceipt | undefined;
  readonly rating?: AssignedRating | undefined;
  readonly ratingSubmitted: boolean;

  setOrigin(place: Place): void;
  setDestination(place: Place): void;
  setCategory(categoryId: string): void;
  setPaymentMethod(paymentMethodId: string): void;
  /** Dispara a solicitação (draft → requested → searching_driver) e liga o simulador. */
  requestRide(): void;
  /** Cancela a corrida/busca e volta para o rascunho (mantém origem/destino/categoria/pagamento). */
  cancelSearch(): void;
  /** Guarda a avaliação (sem backend real — ver especificacoes/PASSAGEIRO.md). */
  submitRating(stars: number, comment?: string): void;
  /** Depois da P10: limpa a jornada concluída e volta pro rascunho pra uma nova corrida. */
  startNewRide(): void;

  /**
   * Só o SIMULADOR LOCAL (`src/sim/rideSimulator.ts`) chama os métodos abaixo — é o
   * ponto exato que o backend substitui depois (evento de servidor em vez de timer).
   * Nenhuma tela deve chamá-los diretamente.
   */
  advancePhaseFromSimulator(phase: PassengerTripPhase): void;
  setAssignedDriverFromSimulator(driver: AssignedDriverInfo, pickupEtaMinutes: number): void;
  setPickupEtaFromSimulator(minutes: number): void;
  setTripProgressFromSimulator(percent: number, etaMinutes: number): void;
  setReceiptFromSimulator(receipt: TripReceipt): void;
}

export const useRideRequestStore = create<RideRequestState>((set, get) => ({
  origin: MOCK_CURRENT_LOCATION,
  categoryId: DEFAULT_RIDE_CATEGORY_KEY,
  phase: 'draft',
  tripProgressPercent: 0,
  ratingSubmitted: false,

  setOrigin: (place) => set({ origin: place }),
  setDestination: (place) => set({ destination: place }),
  setCategory: (categoryId) => set({ categoryId }),
  setPaymentMethod: (paymentMethodId) => set({ paymentMethodId }),

  requestRide: () => {
    if (!canRequestRide(toRideDraft(get()))) return;

    const toRequested = transitionRide(get().phase, 'requested');
    if (!toRequested.ok) return;
    const toSearching = transitionRide(toRequested.state, 'searching_driver');
    if (!toSearching.ok) return;

    set({
      phase: toSearching.state,
      assignedDriver: undefined,
      pickupEtaMinutes: undefined,
      tripEtaMinutes: undefined,
      tripProgressPercent: 0,
      receipt: undefined,
      rating: undefined,
      ratingSubmitted: false,
    });
    startRideSimulation();
  },

  cancelSearch: () => {
    stopRideSimulation();
    // Mesmo que a transição formal para 'cancelled' seja recusada (ex.: já em 'draft'),
    // o passageiro sempre volta pro rascunho local — mantém origem/destino/categoria/pagamento
    // já escolhidos (decisão de produto documentada desde a P07).
    transitionRide(get().phase, 'cancelled');
    set({
      phase: 'draft',
      assignedDriver: undefined,
      pickupEtaMinutes: undefined,
      tripEtaMinutes: undefined,
      tripProgressPercent: 0,
      receipt: undefined,
    });
  },

  submitRating: (stars, comment) => {
    const trimmed = comment?.trim();
    set({
      rating: { stars, ...(trimmed ? { comment: trimmed } : {}) },
      ratingSubmitted: true,
    });
  },

  startNewRide: () => {
    stopRideSimulation();
    set({
      destination: undefined,
      phase: 'draft',
      assignedDriver: undefined,
      pickupEtaMinutes: undefined,
      tripEtaMinutes: undefined,
      tripProgressPercent: 0,
      receipt: undefined,
      rating: undefined,
      ratingSubmitted: false,
    });
  },

  advancePhaseFromSimulator: (phase) => set({ phase }),
  setAssignedDriverFromSimulator: (driver, pickupEtaMinutes) => set({ assignedDriver: driver, pickupEtaMinutes }),
  setPickupEtaFromSimulator: (minutes) => set({ pickupEtaMinutes: minutes }),
  setTripProgressFromSimulator: (percent, etaMinutes) => set({ tripProgressPercent: percent, tripEtaMinutes: etaMinutes }),
  setReceiptFromSimulator: (receipt) => set({ receipt }),
}));

/**
 * Monta um `RideDraft` só com as chaves de fato definidas — com `exactOptionalPropertyTypes`
 * ligado (`tsconfig.base.json`), `{ origin: undefined }` não é a mesma coisa que omitir
 * `origin`, então não dá para simplesmente repassar campos possivelmente indefinidos
 * (lidos da store ou de seletores reativos) direto para `canRequestRide`.
 */
export function toRideDraft(draft: {
  readonly origin?: Place | undefined;
  readonly destination?: Place | undefined;
  readonly categoryId?: string | undefined;
  readonly paymentMethodId?: string | undefined;
}): RideDraft {
  return {
    ...(draft.origin !== undefined ? { origin: draft.origin } : {}),
    ...(draft.destination !== undefined ? { destination: draft.destination } : {}),
    ...(draft.categoryId !== undefined ? { categoryId: draft.categoryId } : {}),
    ...(draft.paymentMethodId !== undefined ? { paymentMethodId: draft.paymentMethodId } : {}),
  };
}
