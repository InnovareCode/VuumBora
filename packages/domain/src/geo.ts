/**
 * Localização APROXIMADA — decisão do dono em 22/11/2026 (`docs/decisoes-do-dono.md`,
 * "Complemento: o embarque na oferta é só o bairro"): antes do aceite, o motorista vê o bairro do
 * embarque, nunca o endereço nem o ponto exato. Se um mapa precisar de um ponto, ele é
 * ARREDONDADO — nunca o local real do passageiro. Usada por `RideOffer.pickup`
 * (`@vuumbora/domain/driver`); o endereço completo só existe no `DriverTripSnapshot` do
 * `api-client`, depois do aceite, para o motorista atribuído.
 */
import type { GeoPoint, Place } from './index';

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
