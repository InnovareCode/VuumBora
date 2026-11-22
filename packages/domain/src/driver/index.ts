/**
 * @vuumbora/domain/driver — regras e fases do MOTORISTA.
 * Nunca importar a partir de apps/passenger.
 */
import type { ApproximatePlace, IsoDateTime, Money, Place, TripId } from '../index';

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
 * `expiresAt` vem do servidor: o contador visual NÃO é fonte de verdade.
 *
 * **Embarque só o bairro, destino completo** — decisão do dono em 22/11/2026
 * (`docs/decisoes-do-dono.md`, "Complemento: o embarque na oferta é só o bairro"): a oferta vai a
 * vários motoristas, inclusive aos que recusam, então o embarque NUNCA leva endereço nem ponto
 * exato aqui — só `pickup` (bairro + ponto arredondado), `pickupDistanceM` e `pickupEtaS`. O
 * destino continua completo (`destination: Place`) — "destino visível" (§5.4) é sobre o destino,
 * não sobre onde o passageiro está agora. Endereço e ponto exatos do embarque só existem no
 * `DriverTripSnapshot` (`@vuumbora/api-client/driver`) do motorista ATRIBUÍDO, depois do aceite.
 */
export interface RideOffer {
  readonly offerId: string;
  /** A corrida (já existe, em `searching_driver`) para a qual esta oferta é feita. */
  readonly tripId: TripId;
  readonly expiresAt: IsoDateTime;
  readonly estimatedPayout: Money;
  readonly pickup: ApproximatePlace;
  readonly pickupDistanceM: number;
  readonly pickupEtaS: number;
  readonly destination: Place;
  readonly categoryId: string;
}

/** Regra (MOTORISTA.md): não permitir ficar online antes de cadastro e documentação aprovados. */
export function canGoOnline(verification: VerificationStatus): boolean {
  return verification === 'approved';
}
