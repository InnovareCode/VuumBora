/**
 * Conversões e formatação de EXIBIÇÃO entre o contrato de geografia e cotação (`lat`/`lng`, centavos, metros, segundos)
 * e o que as telas mostram. Nenhum número nasce aqui: preço, distância e tempo vêm SEMPRE do contrato (aceite D2 do
 * `docs/plano-m3-m4.md`); este módulo só os escreve em português.
 */
import type { Place } from '@vuumbora/domain';
import type { GeoSearchResult, LatLng, QuotePoint, ReverseGeocodeResult } from '@vuumbora/api-client/passenger';

const QUOTE_LABEL_MAX = 200;

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const oneDecimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** "R$ 15,37" a partir dos centavos da cotação. */
export function formatPriceCents(priceCents: number): string {
  return brl.format(priceCents / 100);
}

/** "850 m" abaixo de 1 km; "6,2 km" a partir dele. */
export function formatDistanceM(distanceM: number): string {
  if (distanceM < 1000) return `${Math.max(10, Math.round(distanceM / 10) * 10)} m`;
  return `${oneDecimal.format(distanceM / 1000)} km`;
}

/** "18 min"; a partir de 1 h, "1 h 05 min". Nunca "0 min". */
export function formatDurationS(durationS: number): string {
  const minutes = Math.max(1, Math.round(durationS / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest.toString().padStart(2, '0')} min`;
}

/** Texto lido pelo leitor de tela: "6,2 quilômetros, cerca de 18 minutos". */
export function describeRouteForReader(distanceM: number, durationS: number): string {
  const distance = distanceM < 1000 ? `${Math.round(distanceM)} metros` : `${oneDecimal.format(distanceM / 1000)} quilômetros`;
  const minutes = Math.max(1, Math.round(durationS / 60));
  return `${distance}, cerca de ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
}

export function placePoint(place: Place): LatLng {
  return { lat: place.point.latitude, lng: place.point.longitude };
}

/** Ponto da cotação: a coordenada CONFIRMADA + o texto que a pessoa viu ao confirmar. */
export function toQuotePoint(place: Place): QuotePoint {
  const text = (place.address.trim() || place.label.trim() || 'Ponto no mapa').slice(0, QUOTE_LABEL_MAX);
  return { lat: place.point.latitude, lng: place.point.longitude, label: text };
}

/** Resultado da busca como lugar (ainda NÃO confirmado: o pino confirma, N6). */
export function placeFromSearchResult(result: GeoSearchResult): Place {
  return {
    label: result.label,
    address: result.sublabel ? `${result.label}, ${result.sublabel}` : result.label,
    point: { latitude: result.lat, longitude: result.lng },
  };
}

/**
 * Lugar CONFIRMADO no pino: a coordenada é a do pino e o texto é o que o servidor devolveu para ela (`reverse`). Se o
 * servidor reconheceu o mesmo lugar de partida (mesmo nome), guarda o endereço completo dele; senão, só o rótulo do
 * `reverse` — nunca um endereço que não corresponde ao ponto.
 */
export function placeFromConfirmedPin(reverse: ReverseGeocodeResult, start?: Place): Place {
  const sameAsStart = start !== undefined && start.label === reverse.label;
  return {
    label: reverse.label,
    address: sameAsStart ? start.address : reverse.label,
    point: { latitude: reverse.lat, longitude: reverse.lng },
  };
}

export const CURRENT_LOCATION_LABEL = 'Sua localização atual';

/** A posição do aparelho como origem: rótulo fixo da ficha P04 + o endereço que o servidor deu ao ponto (se deu). */
export function currentLocationPlace(point: LatLng, reverseLabel?: string, accuracyM?: number): Place {
  return {
    label: CURRENT_LOCATION_LABEL,
    address: reverseLabel ?? CURRENT_LOCATION_LABEL,
    point: { latitude: point.lat, longitude: point.lng, ...(accuracyM !== undefined ? { accuracyM } : {}) },
  };
}

/** Desloca um ponto em metros (norte/leste positivos). Usado pelos botões do pino enquanto o mapa é ilustrativo. */
export function offsetByMeters(point: LatLng, northM: number, eastM: number): LatLng {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos((point.lat * Math.PI) / 180);
  return { lat: point.lat + northM / metersPerDegreeLat, lng: point.lng + eastM / metersPerDegreeLng };
}
