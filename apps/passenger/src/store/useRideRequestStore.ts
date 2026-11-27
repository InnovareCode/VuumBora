import { create } from 'zustand';
import { isQuoteExpired, type Place } from '@vuumbora/domain';
import { canRequestRide, transitionRide, type PassengerTripPhase, type RideDraft } from '@vuumbora/domain/passenger';
import type { ApiError } from '@vuumbora/api-client';
import type { FareQuote, QuoteRoute, RideCategory } from '@vuumbora/api-client/passenger';
import type { AssignedDriverInfo } from '../data/mockDriverAssignment';
import { buildMockReceipt, type TripReceipt } from '../data/mockTripReceipt';
import { geoPort, quotePort } from '../geo/geoClient';
import { toQuotePoint } from '../geo/geoFormat';
import { geoProblemKey } from '../geo/geoProblems';
import { cancelActiveRide, startRideSimulation, stopRideSimulation } from '../sim/rideSimulator';

/**
 * Estado do PEDIDO/JORNADA DE CORRIDA, compartilhado entre Início (P03), Destino (P04), Categoria (P05), Confirmação
 * (P06), `/corrida` (P07-P09, PP-10) e Concluída (P10). Nenhuma tela repassa isso por prop.
 *
 * `RideDraft`/`canRequestRide`/`transitionRide` vêm de `@vuumbora/domain/passenger`: a store pergunta ao domínio se pode
 * avançar de fase e só aplica o que ele aceitar.
 *
 * **Cotação (fatia G6, M4):** quem manda é a cotação ASSINADA do contrato novo (`FareQuotePort.createQuotes`,
 * `src/geo/geoClient.ts`): ela diz quais categorias existem para o trajeto, o preço FECHADO de cada uma (D-06, válido por
 * 5 min, N9), se a tarifa é de teste (`isTestFare`) e a rota (polilinha, distância, tempo). Nenhum número de preço,
 * distância ou tempo nasce no app (aceite D2). Nome, legenda e lugares de cada categoria vêm de `geoPort.categories()`.
 *
 * **Convivência com a cotação antiga até o M5:** `PassengerRidePort.request()` ainda só aceita o `quoteId` da cotação da
 * F08 (`PassengerRidePort.quote()`). A store NÃO conhece essa cotação: ela entrega ao simulador a CATEGORIA e o trajeto, e
 * o simulador (`../sim/rideSimulator.ts`) pede a cotação antiga só para obter o `quoteId` da mesma categoria. Nada dela
 * aparece na tela. No M5, `POST /v1/trips` recebe o `quoteId` + `signature` da cotação nova e a ponte some.
 *
 * Validade: antes de pedir, a P06 confere a cotação no servidor (`confirmSelectedQuote` → `getQuote`), a mesma checagem
 * que o `POST /v1/trips` fará; vencida (`409 quote_expired`) ou sumida (`404`), a store cota de novo e marca
 * `priceUpdated` ("O preço foi atualizado") para a pessoa conferir antes do segundo toque.
 */
export interface AssignedRating {
  readonly stars: number;
  readonly comment?: string;
}

export type QuoteStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ConfirmQuoteOutcome =
  | { readonly status: 'ok' }
  | { readonly status: 'price_updated' }
  | { readonly status: 'error'; readonly error: ApiError }
  | { readonly status: 'no_quote' };

export interface RideRequestState {
  readonly origin?: Place | undefined;
  readonly destination?: Place | undefined;
  /** `slug` da categoria escolhida (o domínio chama de `categoryId`). */
  readonly categoryId?: string | undefined;
  readonly paymentMethodId?: string | undefined;
  readonly phase: PassengerTripPhase;

  readonly quoteStatus: QuoteStatus;
  /** Uma cotação por categoria ligada E com tarifa na versão vigente, para o trajeto atual. Vazio fora de `ready`. */
  readonly fareQuotes: readonly FareQuote[];
  readonly quoteRoute?: QuoteRoute | undefined;
  readonly quoteError?: ApiError | undefined;
  /** A cotação venceu (ou sumiu) e foi refeita: a tela avisa "O preço foi atualizado" até a pessoa seguir. */
  readonly priceUpdated: boolean;
  /** Nome/legenda/lugares das categorias ligadas (`GET /v1/categories`). Vazio se ainda não carregou ou falhou. */
  readonly categoryInfo: readonly RideCategory[];

  /** A cotação de fato usada no pedido: é dela que o comprovante tira o valor (preço fechado, D-06). */
  readonly requestedQuote?: FareQuote | undefined;

  readonly assignedDriver?: AssignedDriverInfo | undefined;
  /** Código de embarque (D-12) do `snapshot.pickupCode`: só existe de `driver_assigned` a `driver_arrived`. */
  readonly pickupCode?: string | undefined;
  /** Minutos estimados até o EMBARQUE (P08) — simulado (o despacho é M5). */
  readonly pickupEtaMinutes?: number | undefined;
  /** Minutos estimados até o DESTINO (P09) — simulado (o despacho é M5). */
  readonly tripEtaMinutes?: number | undefined;
  readonly tripProgressPercent: number;
  readonly receipt?: TripReceipt | undefined;
  readonly rating?: AssignedRating | undefined;
  readonly ratingSubmitted: boolean;

  /** Troca a origem (mantendo o destino) e cota de novo. */
  setOrigin(place: Place): void;
  /** Troca o destino (mantendo a origem) e cota de novo. */
  setDestination(place: Place): void;
  /** Troca os dois de uma vez e cota UMA vez. */
  setRoute(origin: Place, destination: Place): void;
  /** Cota de novo o trajeto atual. Sem origem ou destino, volta a `idle`. `priceUpdated` marca o aviso da P05/P06. */
  refreshQuote(options?: { readonly priceUpdated?: boolean }): void;
  /** A pessoa viu o preço novo e seguiu: some o aviso. */
  acknowledgePriceUpdate(): void;
  /** P06, antes de pedir: a cotação escolhida ainda vale no servidor? Vencida → cota de novo (`price_updated`). */
  confirmSelectedQuote(): Promise<ConfirmQuoteOutcome>;
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

/** Categorias (nome e legenda) mudam raramente: uma leitura por sessão do app basta. Falhou → tenta na próxima cotação. */
let categoryInfoLoad: Promise<readonly RideCategory[] | undefined> | undefined;

function loadCategoryInfo(): Promise<readonly RideCategory[] | undefined> {
  if (!categoryInfoLoad) {
    categoryInfoLoad = geoPort
      .categories()
      .then((result) => {
        if (result.ok) return result.data;
        categoryInfoLoad = undefined;
        return undefined;
      })
      .catch(() => {
        categoryInfoLoad = undefined;
        return undefined;
      });
  }
  return categoryInfoLoad;
}

// Lê as categorias já ao carregar o módulo (abertura do app), longe de qualquer cotação: a P05 não espera duas chamadas
// em série, e um `failNext` posto antes de uma cotação nunca é consumido por esta leitura.
void loadCategoryInfo();

const EMPTY_QUOTE = { fareQuotes: [], quoteRoute: undefined } as const;

export function selectedFareQuote(state: Pick<RideRequestState, 'fareQuotes' | 'categoryId'>): FareQuote | undefined {
  return state.fareQuotes.find((quote) => quote.categorySlug === state.categoryId);
}

export const useRideRequestStore = create<RideRequestState>((set, get) => ({
  // Sem origem por padrão: ela vem da posição do aparelho (P03/P04, `src/location`) ou do que a pessoa escolher.
  // P05/P06 (onda 3 do padrão premium): a ficha mostra "Pagamento: Pix" já selecionado por padrão.
  paymentMethodId: 'pix',
  phase: 'draft',
  quoteStatus: 'idle',
  fareQuotes: [],
  priceUpdated: false,
  categoryInfo: [],
  tripProgressPercent: 0,
  ratingSubmitted: false,

  setOrigin: (place) => {
    set({ origin: place });
    get().refreshQuote();
  },
  setDestination: (place) => {
    set({ destination: place });
    get().refreshQuote();
  },
  setRoute: (origin, destination) => {
    set({ origin, destination });
    get().refreshQuote();
  },

  refreshQuote: (options) => {
    const { origin, destination } = get();
    const requestId = ++quoteRequestId;
    if (!origin || !destination) {
      set({ quoteStatus: 'idle', ...EMPTY_QUOTE, quoteError: undefined, priceUpdated: false, categoryId: undefined });
      return;
    }
    set({ quoteStatus: 'loading', quoteError: undefined, priceUpdated: options?.priceUpdated ?? false });
    // A cotação primeiro, as categorias depois (em série): o `failNext` do mock vale para a PRÓXIMA chamada, e duas em
    // paralelo disputariam quem o consome — em série, a prova de erro sempre cai na cotação.
    quotePort
      .createQuotes({ origin: toQuotePoint(origin), destination: toQuotePoint(destination) })
      .then(async (result) => {
        if (requestId !== quoteRequestId) return; // uma cotação mais nova já está em andamento/chegou primeiro
        if (!result.ok) {
          set({ quoteStatus: 'error', ...EMPTY_QUOTE, quoteError: result.error });
          return;
        }
        const info = await loadCategoryInfo();
        if (requestId !== quoteRequestId) return;
        const quotes = result.data.quotes;
        set((state) => ({
          quoteStatus: 'ready',
          fareQuotes: quotes,
          quoteRoute: result.data.route,
          ...(info ? { categoryInfo: info } : {}),
          // Mantém a escolha se ela ainda existir na cotação nova; senão cai na 1ª (ou em nenhuma, se veio vazia).
          categoryId: quotes.some((quote) => quote.categorySlug === state.categoryId) ? state.categoryId : quotes[0]?.categorySlug,
        }));
      })
      .catch(() => {
        if (requestId !== quoteRequestId) return;
        set({ quoteStatus: 'error', ...EMPTY_QUOTE, quoteError: { kind: 'network', retryable: true } });
      });
  },

  acknowledgePriceUpdate: () => set({ priceUpdated: false }),

  confirmSelectedQuote: async () => {
    const quote = selectedFareQuote(get());
    if (!quote) return { status: 'no_quote' };
    // Regra do domínio primeiro (sem rede): vencida no relógio do aparelho já cota de novo.
    if (isQuoteExpired(quote.expiresAt, Date.now())) {
      get().refreshQuote({ priceUpdated: true });
      return { status: 'price_updated' };
    }
    const result = await quotePort.getQuote(quote.quoteId);
    if (result.ok) return { status: 'ok' };
    const key = geoProblemKey(result.error);
    if (key === 'quote_expired' || key === 'not_found') {
      get().refreshQuote({ priceUpdated: true });
      return { status: 'price_updated' };
    }
    return { status: 'error', error: result.error };
  },

  setCategory: (categoryId) => set({ categoryId }),
  setPaymentMethod: (paymentMethodId) => set({ paymentMethodId }),

  requestRide: () => {
    const state = get();
    if (!canRequestRide(toRideDraft(state))) return;
    // Mesma guarda de `canRequestRide`, mas aqui também estreita o tipo pro TS (`exactOptionalPropertyTypes`).
    const { origin, destination, categoryId, paymentMethodId } = state;
    if (!origin || !destination || !categoryId || !paymentMethodId) return;
    // A cotação manda: sem cotação VIVA para a categoria escolhida, não há o que pedir (nunca cai para outra categoria).
    const selectedQuote = selectedFareQuote(state);
    if (!selectedQuote) return;

    const toRequested = transitionRide(state.phase, 'requested');
    if (!toRequested.ok) return;
    const toSearching = transitionRide(toRequested.state, 'searching_driver');
    if (!toSearching.ok) return;

    // A entrada em `searching_driver` fica síncrona e local (não espera o mock): a tela de busca navega pra lá no mesmo
    // toque e checa a fase no primeiro render (`/corrida`) — ver o cabeçalho de `rideSimulator.ts`.
    set({
      phase: toSearching.state,
      requestedQuote: selectedQuote,
      priceUpdated: false,
      assignedDriver: undefined,
      pickupCode: undefined,
      pickupEtaMinutes: undefined,
      tripEtaMinutes: undefined,
      tripProgressPercent: 0,
      receipt: undefined,
      rating: undefined,
      ratingSubmitted: false,
    });

    startRideSimulation(
      { categorySlug: selectedQuote.categorySlug, origin, destination, paymentMethodId },
      {
        onStatus: (status) => set({ phase: status }),
        onRequestFailed: () => {
          // `port.request` recusou — vai pra `failed` (transição válida a partir de `searching_driver`) em vez de ficar
          // preso numa busca que nunca vai avançar.
          const toFailed = transitionRide(get().phase, 'failed');
          if (toFailed.ok) set({ phase: toFailed.state });
        },
        onDriverAssigned: (driver, pickupEtaMinutes) => set({ assignedDriver: driver, pickupEtaMinutes }),
        onPickupEta: (minutes) => set({ pickupEtaMinutes: minutes }),
        onPickupCode: (code) => set({ pickupCode: code }),
        onTripProgress: (percent, etaMinutes) => set({ tripProgressPercent: percent, tripEtaMinutes: etaMinutes }),
        onCompleted: () => {
          // O comprovante sai da cotação REALMENTE pedida (`requestedQuote`), nunca da seleção atual.
          const requested = get().requestedQuote;
          if (requested) set({ receipt: buildMockReceipt(requested.priceCents) });
        },
      },
    );
  },

  cancelSearch: () => {
    // Cancela pela porta real do mock (quem cancela aqui é o passageiro) e para a simulação; o passageiro sempre volta
    // pro rascunho local, mantendo origem/destino/categoria/pagamento já escolhidos (decisão de produto desde a P07).
    cancelActiveRide();
    set({
      phase: 'draft',
      assignedDriver: undefined,
      pickupCode: undefined,
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
    quoteRequestId += 1;
    set({
      destination: undefined,
      categoryId: undefined,
      quoteStatus: 'idle',
      ...EMPTY_QUOTE,
      quoteError: undefined,
      priceUpdated: false,
      requestedQuote: undefined,
      phase: 'draft',
      assignedDriver: undefined,
      pickupCode: undefined,
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
 * Monta um `RideDraft` só com as chaves de fato definidas — com `exactOptionalPropertyTypes` ligado
 * (`tsconfig.base.json`), `{ origin: undefined }` não é a mesma coisa que omitir `origin`.
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
