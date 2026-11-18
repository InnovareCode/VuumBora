/**
 * @vuumbora/domain/passenger — regras e fases do PASSAGEIRO.
 * Nunca importar a partir de apps/driver.
 */
import type { Money, Place, TripStatus } from '../index';

/** Fases de UI do passageiro (DESIGN_SYSTEM_MESTRE §8). `draft`/`quoted` são locais; o resto vem do servidor. */
export type PassengerTripPhase = 'draft' | 'quoted' | TripStatus;

export interface RideDraft {
  readonly origin?: Place;
  readonly destination?: Place;
  readonly categoryId?: string;
  readonly paymentMethodId?: string;
}

/** Preço estimado e final são tipos distintos de propósito: a UI não pode confundi-los. */
export interface FareEstimate {
  readonly kind: 'estimate';
  readonly total: Money;
}

/** Critério funcional 1 (PASSAGEIRO.md): só solicita com origem, destino, categoria e pagamento. */
export function canRequestRide(draft: RideDraft): boolean {
  return Boolean(draft.origin && draft.destination && draft.categoryId && draft.paymentMethodId);
}
