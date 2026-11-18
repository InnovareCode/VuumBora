import { create } from 'zustand';
import type { Place } from '@vuumbora/domain';
import { canRequestRide, type PassengerTripPhase, type RideDraft } from '@vuumbora/domain/passenger';
import { MOCK_CURRENT_LOCATION } from '../data/mockPlaces';
import { DEFAULT_RIDE_CATEGORY_KEY } from '../data/mockRideCategories';

/**
 * Estado do PEDIDO DE CORRIDA, compartilhado entre Home (P03), Destino (P04),
 * Confirmação (P06) e Busca de motorista (P07) — nenhuma tela repassa isso por prop,
 * todas leem/escrevem direto no store (pedido do Atlas/arquitetura).
 *
 * `RideDraft`/`canRequestRide` vêm de `@vuumbora/domain/passenger` (regra de negócio já
 * definida pela Nova) — esta store só guarda o rascunho e a fase de UI, não reimplementa
 * a regra "o que falta para solicitar".
 *
 * Fase 1 (sem backend): `requestRide`/`cancelSearch` só mudam `phase` localmente — nenhuma
 * chamada de rede acontece aqui (pendência: Vega implementa o adaptador `PassengerRidePort`
 * quando o contrato de backend existir).
 */
export interface RideRequestState extends RideDraft {
  readonly phase: PassengerTripPhase;
  setOrigin(place: Place): void;
  setDestination(place: Place): void;
  setCategory(categoryId: string): void;
  setPaymentMethod(paymentMethodId: string): void;
  /** Dispara a "busca de motorista" (mock) — exige `canRequestRide` verdadeiro. */
  requestRide(): void;
  /** Cancela a busca e volta para o rascunho (mantém origem/destino/categoria escolhidos). */
  cancelSearch(): void;
}

export const useRideRequestStore = create<RideRequestState>((set, get) => ({
  origin: MOCK_CURRENT_LOCATION,
  categoryId: DEFAULT_RIDE_CATEGORY_KEY,
  phase: 'draft',

  setOrigin: (place) => set({ origin: place }),
  setDestination: (place) => set({ destination: place }),
  setCategory: (categoryId) => set({ categoryId }),
  setPaymentMethod: (paymentMethodId) => set({ paymentMethodId }),

  requestRide: () => {
    if (!canRequestRide(toRideDraft(get()))) return;
    set({ phase: 'searching_driver' });
  },

  cancelSearch: () => set({ phase: 'draft' }),
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
