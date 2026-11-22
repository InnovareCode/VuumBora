/**
 * @vuumbora/domain/driver — regras e fases do MOTORISTA.
 * Nunca importar a partir de apps/passenger.
 */
import type { IsoDateTime, Money, Place, TripId } from '../index';

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

/**
 * Oferta de corrida (plano-sistema.md §6.2, despacho sequencial, uma por vez).
 * `expiresAt` vem do servidor: o contador visual NÃO é fonte de verdade. `pickup`/`destination`
 * vêm sempre visíveis (5.4 "seletividade por destino visível" — o motorista decide com o destino
 * à vista, a recusa com motivo é dado desde o primeiro dia).
 */
export interface RideOffer {
  readonly offerId: string;
  /** A corrida (já existe, em `searching_driver`) para a qual esta oferta é feita. */
  readonly tripId: TripId;
  readonly expiresAt: IsoDateTime;
  readonly estimatedPayout: Money;
  readonly pickup: Place;
  readonly destination: Place;
  readonly categoryId: string;
}

/** Regra (MOTORISTA.md): não permitir ficar online antes de cadastro e documentação aprovados. */
export function canGoOnline(verification: VerificationStatus): boolean {
  return verification === 'approved';
}
