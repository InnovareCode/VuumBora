import { create } from 'zustand';
import type { Place } from '@vuumbora/domain';
import { canRequestRide, transitionRide, type PassengerTripPhase, type RideDraft } from '@vuumbora/domain/passenger';
import type { CategoryQuote } from '@vuumbora/api-client/passenger';
import { MOCK_CURRENT_LOCATION } from '../data/mockPlaces';
import type { AssignedDriverInfo } from '../data/mockDriverAssignment';
import { buildMockReceipt, type TripReceipt } from '../data/mockTripReceipt';
import { passengerRide } from '../ride/passengerRideClient';
import { cancelActiveRide, startRideSimulation, stopRideSimulation } from '../sim/rideSimulator';

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
 * F08b: a progressão depois de `requestRide` passou do simulador local antigo (que chamava
 * `transitionRide` direto) para o `control` do mock da porta de corrida
 * (`@vuumbora/api-client/passenger`, ver `../sim/rideSimulator.ts` e `../ride/passengerRideClient.ts`)
 * — ainda sem rede real (pendência: Vega implementa o adaptador `http`), mas a MESMA validação de
 * domínio que o backend vai usar. A entrada em `searching_driver` continua síncrona e local aqui
 * (ver o comentário em `requestRide`, abaixo); dali em diante, quem aplica cada fase na store é o
 * `callbacks.onStatus` que `startRideSimulation` recebe — a store nunca importa o simulador de
 * volta (ele não importa a store: ver o cabeçalho de `rideSimulator.ts`).
 *
 * Ajuste do Atlas na F08b: **é a cotação que manda** quais categorias existem — `quoteCategories`
 * vem de `port.quote` (porta real do mock, `refreshQuote`), nunca de uma lista fixa local. Sem
 * lista própria na tela: uma categoria desligada (D-08/D-09) simplesmente não aparece, porque a
 * cotação não a devolve — e quando o dono ligar, ela aparece sozinha, sem mexer em código de tela.
 * `requestRide` usa o `quoteId` da cotação selecionada direto; sem fallback pra outra categoria se
 * o pedido falhar (`onRequestFailed` deixa a fase explicitamente `failed`).
 */
export interface AssignedRating {
  readonly stars: number;
  readonly comment?: string;
}

export type QuoteStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface RideRequestState {
  readonly origin?: Place | undefined;
  readonly destination?: Place | undefined;
  readonly categoryId?: string | undefined;
  readonly paymentMethodId?: string | undefined;
  readonly phase: PassengerTripPhase;

  /**
   * Categorias que a cotação real devolveu como existentes PARA ESTE trajeto (origem+destino
   * atuais) — é dela que a Home (P03) tira a lista de opções, nunca de um catálogo fixo. Vazio
   * enquanto `quoteStatus` não é `'ready'`.
   */
  readonly quoteStatus: QuoteStatus;
  readonly quoteCategories: readonly CategoryQuote[];
  /** A cotação de fato usada no pedido em andamento/concluído — é dela que o recibo tira o preço. */
  readonly requestedCategory?: CategoryQuote | undefined;

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
  /** Define o destino E busca a cotação de novo pro trajeto (origem+destino atuais). */
  setDestination(place: Place): void;
  /** Busca a cotação de novo (porta real do mock) — chamada por `setDestination`; a Home também
   *  chama pra tentar de novo depois de um erro. Sem origem/destino, volta pro estado `'idle'`. */
  refreshQuote(): void;
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
}

/** Invalida uma resposta de cotação que chegou depois de uma mais nova já ter sido pedida. */
let quoteRequestId = 0;

export const useRideRequestStore = create<RideRequestState>((set, get) => ({
  origin: MOCK_CURRENT_LOCATION,
  phase: 'draft',
  quoteStatus: 'idle',
  quoteCategories: [],
  tripProgressPercent: 0,
  ratingSubmitted: false,

  setOrigin: (place) => set({ origin: place }),
  setDestination: (place) => {
    set({ destination: place });
    get().refreshQuote();
  },

  refreshQuote: () => {
    const { origin, destination } = get();
    const requestId = ++quoteRequestId;
    if (!origin || !destination) {
      set({ quoteStatus: 'idle', quoteCategories: [], categoryId: undefined });
      return;
    }
    set({ quoteStatus: 'loading' });
    passengerRide.port
      .quote({ origin, destination })
      .then((result) => {
        if (requestId !== quoteRequestId) return; // uma cotação mais nova já está em andamento/chegou primeiro
        if (!result.ok) {
          set({ quoteStatus: 'error', quoteCategories: [] });
          return;
        }
        const categories = result.data.categories;
        set((state) => ({
          quoteStatus: 'ready',
          quoteCategories: categories,
          // Mantém a seleção se ela ainda existir na cotação nova; senão cai pra 1ª disponível
          // (ou nenhuma, se a cotação veio vazia) — nunca força uma categoria que a cotação não tem.
          categoryId: categories.some((c) => c.categoryId === state.categoryId) ? state.categoryId : categories[0]?.categoryId,
        }));
      })
      .catch(() => {
        if (requestId !== quoteRequestId) return;
        set({ quoteStatus: 'error', quoteCategories: [] });
      });
  },

  setCategory: (categoryId) => set({ categoryId }),
  setPaymentMethod: (paymentMethodId) => set({ paymentMethodId }),

  requestRide: () => {
    const state = get();
    if (!canRequestRide(toRideDraft(state))) return;
    // Mesma guarda de `canRequestRide`, mas aqui também estreita o tipo pro TS (`exactOptionalPropertyTypes`):
    // dali em diante `origin`/`destination`/`categoryId`/`paymentMethodId` são garantidamente definidos.
    const { origin, destination, categoryId, paymentMethodId } = state;
    if (!origin || !destination || !categoryId || !paymentMethodId) return;
    // A cotação manda: sem uma cotação VIVA pra categoria escolhida, não há o que pedir — nunca
    // cai pra outra categoria sozinha (ajuste do Atlas, F08b).
    const selectedQuote = state.quoteCategories.find((c) => c.categoryId === categoryId);
    if (!selectedQuote) return;

    const toRequested = transitionRide(state.phase, 'requested');
    if (!toRequested.ok) return;
    const toSearching = transitionRide(toRequested.state, 'searching_driver');
    if (!toSearching.ok) return;

    // A entrada em `searching_driver` fica síncrona e local (não espera `port.request` do mock,
    // que é assíncrono): a tela de busca navega pra lá no mesmo tapa de botão e checa a fase no
    // primeiro render (`buscando.tsx`) — ver o cabeçalho de `rideSimulator.ts`.
    set({
      phase: toSearching.state,
      requestedCategory: selectedQuote,
      assignedDriver: undefined,
      pickupEtaMinutes: undefined,
      tripEtaMinutes: undefined,
      tripProgressPercent: 0,
      receipt: undefined,
      rating: undefined,
      ratingSubmitted: false,
    });

    startRideSimulation(
      { quoteId: selectedQuote.quoteId, paymentMethodId },
      {
        onStatus: (status) => set({ phase: status }),
        onRequestFailed: () => {
          // `port.request` recusou (cotação vencida, categoria desligada entre a cotação e o
          // pedido etc.) — vai pra `failed` (transição válida a partir de `searching_driver`) em
          // vez de ficar preso numa busca que nunca vai avançar.
          const toFailed = transitionRide(get().phase, 'failed');
          if (toFailed.ok) set({ phase: toFailed.state });
        },
        onDriverAssigned: (driver, pickupEtaMinutes) => set({ assignedDriver: driver, pickupEtaMinutes }),
        onPickupEta: (minutes) => set({ pickupEtaMinutes: minutes }),
        onTripProgress: (percent, etaMinutes) => set({ tripProgressPercent: percent, tripEtaMinutes: etaMinutes }),
        onCompleted: () => {
          // O recibo sai da cotação REALMENTE pedida (`requestedCategory`), nunca da seleção atual.
          const requested = get().requestedCategory;
          if (requested) set({ receipt: buildMockReceipt(requested.estimate.total) });
        },
      },
    );
  },

  cancelSearch: () => {
    // Cancela pela porta real do mock (não `control` — quem cancela aqui é o passageiro) e para a
    // simulação; o resultado não muda a decisão abaixo — o passageiro sempre volta pro rascunho
    // local, mantendo origem/destino/categoria/pagamento já escolhidos (decisão de produto
    // documentada desde a P07; mesmo comportamento de antes, que já ignorava o resultado formal).
    cancelActiveRide();
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
      categoryId: undefined,
      quoteStatus: 'idle',
      quoteCategories: [],
      requestedCategory: undefined,
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
