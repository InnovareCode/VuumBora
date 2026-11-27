import type { NumericRange } from '@vuumbora/domain';

/**
 * Formatação de distância/tempo da ONDA 4 (M06 a M10) — movido de `NewRideOfferCard.tsx` (ficha
 * M06 §12, "mover para src/utils") e ampliado com os formatos da viagem já atribuída (M07/M09, que
 * mostram o valor EXATO, não a faixa da oferta).
 */

/** "2,3 km" (≥1000 m) ou "300 m" (<1000 m); arredondado a 0 vira "menos de 100 m" — nunca "0 m". */
export function formatPickupDistance(distanceM: number): string {
  if (distanceM <= 0) return 'menos de 100 m';
  if (distanceM < 1000) return `${distanceM} m`;
  return `${(distanceM / 1000).toFixed(1).replace('.', ',')} km`;
}

/** "6 min"; arredondado a 0 vira "menos de 1 min" — nunca "0 min". */
export function formatPickupEta(etaS: number): string {
  const minutes = Math.round(etaS / 60);
  if (minutes <= 0) return 'menos de 1 min';
  return `${minutes} min`;
}

/** "4,8 km" — distância EXATA da viagem já atribuída (M07/M09), sempre em km com 1 decimal. */
export function formatDistanceKm(distanceM: number): string {
  return `${(distanceM / 1000).toFixed(1).replace('.', ',')} km`;
}

/** "12 min" — duração EXATA da viagem já atribuída (M07/M09). */
export function formatDurationMin(durationS: number): string {
  return `${Math.max(1, Math.round(durationS / 60))} min`;
}

/** "5–6 km" — faixa PP-12 (nunca o valor exato antes do aceite, `RideOffer.tripDistanceM`). */
export function formatTripDistanceRange(range: NumericRange): string {
  return `${range.min / 1000}–${range.max / 1000} km`;
}

/** "15–20 min" — faixa PP-12 (`RideOffer.tripDurationS`). */
export function formatTripDurationRange(range: NumericRange): string {
  return `${range.min / 60}–${range.max / 60} min`;
}

/** "2:14" — tempo decorrido (M08, "Aguardando há {m:ss}"), nunca negativo. */
export function formatElapsedClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}
