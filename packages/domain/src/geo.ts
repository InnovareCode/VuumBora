/**
 * Localização APROXIMADA — decisão do dono em 22/11/2026 (`docs/decisoes-do-dono.md`,
 * "Complemento: o embarque na oferta é só o bairro"): antes do aceite, o motorista vê o bairro do
 * embarque, nunca o endereço nem o ponto exato. Se um mapa precisar de um ponto, ele é
 * ARREDONDADO — nunca o local real do passageiro. Usada por `RideOffer.pickup`
 * (`@vuumbora/domain/driver`); o endereço completo só existe no `DriverTripSnapshot` do
 * `api-client`, depois do aceite, para o motorista atribuído.
 */
import type { GeoPoint, NumericRange, Place } from './index';

export interface ApproximatePlace {
  readonly neighborhood: string;
  /** Sempre arredondado (ver `toApproximatePlace`) — nunca o ponto exato do endereço. */
  readonly approximatePoint: GeoPoint;
}

/** ~1,1 km de lado no equador — grosso o bastante para não revelar o endereço. */
const APPROX_DECIMALS = 2;

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * `place.neighborhood` ausente cai num texto NEUTRO — nunca em `place.label` nem `place.address`
 * (achado R5 da reconferência da Nova, `docs/contratos/conferencia-f08-nova.md`): quando `label` é
 * o próprio endereço (mock/fixture sem bairro cadastrado, ou um geocodificador real que não devolve
 * bairro), cair nele vazava o endereço exato na oferta — exatamente o que esta função existe para
 * impedir.
 */
export function toApproximatePlace(place: Place): ApproximatePlace {
  return {
    neighborhood: place.neighborhood ?? 'Bairro não informado',
    approximatePoint: {
      latitude: round(place.point.latitude, APPROX_DECIMALS),
      longitude: round(place.point.longitude, APPROX_DECIMALS),
    },
  };
}

/** Largura do intervalo de distância da viagem na oferta (PP-12) — nunca o valor exato. */
const TRIP_DISTANCE_RANGE_STEP_M = 1000;
/** Largura do intervalo de duração da viagem na oferta (PP-12). */
const TRIP_DURATION_RANGE_STEP_S = 300;

function toRange(value: number, step: number): NumericRange {
  const min = Math.max(0, Math.floor(value / step) * step);
  return { min, max: min + step };
}

/**
 * Distância e duração da viagem (embarque até destino) em FAIXA — decisão do dono em 22/11/2026
 * (`docs/fichas-de-tela/README.md`, PP-12): a oferta já só mostra o bairro arredondado dos dois
 * pontos; o par exato de distância/duração estreitaria de volta esse quadrado aproximado, então sai
 * em faixas de 1 km / 5 min (nunca o valor exato). Usada por `RideOffer.tripDistanceM`/`tripDurationS`
 * (`@vuumbora/domain/driver`) — o mesmo princípio de `toApproximatePlace`, para números.
 */
export function toTripRange(distanceM: number, durationS: number): { readonly distanceM: NumericRange; readonly durationS: NumericRange } {
  return {
    distanceM: toRange(distanceM, TRIP_DISTANCE_RANGE_STEP_M),
    durationS: toRange(durationS, TRIP_DURATION_RANGE_STEP_S),
  };
}
