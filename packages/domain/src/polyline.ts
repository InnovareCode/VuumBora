/**
 * Polilinha codificada (o `route.polyline` de `POST /v1/quotes`, fatia K0 do `docs/plano-m3-m4.md`).
 *
 * **Formato do contrato:** o algoritmo de polilinha codificada do Google, **precisão 5** (é o
 * `geometries=polyline` do Mapbox Directions). Cada par é `latitude, longitude` nessa ordem — o
 * contrário do GeoJSON. O app decodifica para desenhar a rota; o mock e os testes codificam.
 */
import type { GeoPoint } from './index';

const PRECISION_FACTOR = 1e5;

function encodeSigned(value: number): string {
  let shifted = value < 0 ? ~(value << 1) : value << 1;
  let out = '';
  while (shifted >= 0x20) {
    out += String.fromCharCode((0x20 | (shifted & 0x1f)) + 63);
    shifted >>= 5;
  }
  return out + String.fromCharCode(shifted + 63);
}

/** Codifica uma lista de pontos (precisão 5). Ponto não finito lança `RangeError`. */
export function encodePolyline(points: readonly GeoPoint[]): string {
  let previousLat = 0;
  let previousLng = 0;
  let out = '';
  for (const point of points) {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
      throw new RangeError('ponto da polilinha precisa de latitude e longitude finitas');
    }
    const lat = Math.round(point.latitude * PRECISION_FACTOR);
    const lng = Math.round(point.longitude * PRECISION_FACTOR);
    out += encodeSigned(lat - previousLat) + encodeSigned(lng - previousLng);
    previousLat = lat;
    previousLng = lng;
  }
  return out;
}

/** Decodifica uma polilinha de precisão 5. Texto truncado ou com caractere fora do alfabeto lança `RangeError`. */
export function decodePolyline(encoded: string): GeoPoint[] {
  const points: GeoPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const readValue = (): number => {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (index >= encoded.length) throw new RangeError('polilinha truncada');
      const byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 0x3f) throw new RangeError('polilinha com caractere inválido');
      result |= (byte & 0x1f) << shift;
      shift += 5;
      if (byte < 0x20) break;
      if (shift > 30) throw new RangeError('polilinha com valor fora do intervalo');
    }
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += readValue();
    lng += readValue();
    points.push({ latitude: lat / PRECISION_FACTOR, longitude: lng / PRECISION_FACTOR });
  }
  return points;
}
