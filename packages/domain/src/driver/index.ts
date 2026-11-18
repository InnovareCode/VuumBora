/**
 * @vuumbora/domain/driver — regras e fases do MOTORISTA.
 * Nunca importar a partir de apps/passenger.
 */
import type { IsoDateTime, Money } from '../index';

/** Fases de jornada do motorista (DESIGN_SYSTEM_MESTRE §8). */
export type DriverPhase =
  | 'offline'
  | 'online'
  | 'offer'
  | 'accepted'
  | 'heading_to_pickup'
  | 'waiting_pickup'
  | 'in_progress'
  | 'completed';

export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'correction_requested';

/** Oferta de corrida. `expiresAt` vem do servidor: o contador visual NÃO é fonte de verdade. */
export interface RideOffer {
  readonly offerId: string;
  readonly expiresAt: IsoDateTime;
  readonly estimatedPayout: Money;
}

/** Regra (MOTORISTA.md): não permitir ficar online antes de cadastro e documentação aprovados. */
export function canGoOnline(verification: VerificationStatus): boolean {
  return verification === 'approved';
}
