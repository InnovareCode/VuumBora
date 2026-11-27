/**
 * @vuumbora/domain/driver — regras e fases do MOTORISTA.
 * Nunca importar a partir de apps/passenger.
 */
import type { ApproximatePlace, IsoDateTime, Money, NumericRange, TripId } from '../index';
import type { VerificationStatus } from './onboarding';

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

/** Cadastro do motorista (M3, fatia K0): estados, documentos, veículo e a regra de ficar online. */
export {
  DOCUMENT_CONTENT_TYPES,
  DOCUMENT_MAX_SIZE_BYTES,
  DOCUMENT_URL_MAX_TTL_SECONDS,
  deriveVerificationStatus,
  documentUploadProblem,
  goOnlineBlocker,
  isCalendarDate,
  isDocumentContentType,
  isDocumentExpired,
  isReadyForApproval,
  isSha256Hex,
  isValidPlate,
  isVehicleTooOld,
  natalCalendarDate,
  normalizePlate,
} from './onboarding';
export type {
  DocumentContentType,
  DriverDocumentStatus,
  GoOnlineBlocker,
  VerificationFacts,
  VerificationStatus,
} from './onboarding';

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
  /**
   * Distância e duração da viagem (embarque até destino) em FAIXA — acréscimo PP-12 (decisão do
   * dono em 22/11/2026, `docs/fichas-de-tela/README.md`): calculadas por `toTripRange` (`../geo`) a
   * partir dos valores exatos, que nunca aparecem aqui — mesmo princípio de `pickup`/`destination`
   * (bairro, nunca endereço exato).
   */
  readonly tripDistanceM: NumericRange;
  readonly tripDurationS: NumericRange;
}

/**
 * Regra (MOTORISTA.md): não permitir ficar online antes de cadastro e documentação aprovados. Só olha
 * o estado; a regra completa do M3 (com documento vencido) é `goOnlineBlocker`.
 */
export function canGoOnline(verification: VerificationStatus): boolean {
  return verification === 'approved';
}
