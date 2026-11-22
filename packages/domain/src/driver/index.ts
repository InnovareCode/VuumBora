/**
 * @vuumbora/domain/driver — regras e fases do MOTORISTA.
 * Nunca importar a partir de apps/passenger.
 */
import type { ApproximatePlace, IsoDateTime, Money, TripId } from '../index';

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
 * **Embarque E destino só o bairro, na oferta** — decisão do dono em 22/11/2026
 * (`docs/decisoes-do-dono.md`, "Complemento: o embarque na oferta é só o bairro" e "Complemento: o
 * destino na oferta também é só o bairro"): a oferta vai a vários motoristas, um de cada vez,
 * inclusive aos que recusam, então NEM o embarque NEM o destino levam endereço ou ponto exato aqui
 * — só bairro + ponto arredondado (`pickup`/`destination: ApproximatePlace`),  `pickupDistanceM` e
 * `pickupEtaS`. "Destino visível" (§5.4) continua valendo — o motorista sabe PARA ONDE vai, só não
 * o endereço exato antes de aceitar. Endereço e ponto exatos dos dois só existem no
 * `DriverTripSnapshot` (`@vuumbora/api-client/driver`) do motorista ATRIBUÍDO, depois do aceite.
 */
export interface RideOffer {
  readonly offerId: string;
  /** A corrida (já existe, em `searching_driver`) para a qual esta oferta é feita. */
  readonly tripId: TripId;
  readonly expiresAt: IsoDateTime;
  readonly estimatedPayout: Money;
  readonly pickup: ApproximatePlace;
  /** Arredondado a 100 m (recomendação da Nova na reconferência): exato revelaria demais sobre o bairro aproximado. */
  readonly pickupDistanceM: number;
  /** Arredondado a 1 min. */
  readonly pickupEtaS: number;
  readonly destination: ApproximatePlace;
  readonly categoryId: string;
}

/** Regra (MOTORISTA.md): não permitir ficar online antes de cadastro e documentação aprovados. */
export function canGoOnline(verification: VerificationStatus): boolean {
  return verification === 'approved';
}
