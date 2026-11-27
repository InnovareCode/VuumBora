/**
 * Área de serviço (M4, fatia K0 do `docs/plano-m3-m4.md`; N7: **sem PostGIS no M4**). A área é um
 * polígono GeoJSON guardado em `jsonb` com uma caixa delimitadora em colunas, e "este ponto está
 * dentro?" é esta função pura, sem dependência nova. Mora na RAIZ do domínio: o app do passageiro
 * usa para avisar antes de cotar, e o servidor responde `422 outside_service_area` pela mesma regra.
 *
 * **Ordem das coordenadas:** o GeoJSON (RFC 7946) usa `[longitude, latitude]`, o contrário de
 * `GeoPoint`. Os tipos abaixo nomeiam as posições da tupla para ninguém trocar as duas.
 *
 * **Borda conta como dentro:** um ponto exatamente sobre a linha do polígono (ou sobre a linha de um
 * buraco) é atendido. Um ponto dentro de um buraco não é.
 *
 * Validação estrita, como em `fare.ts`: polígono malformado ou ponto não finito LANÇAM `RangeError`
 * (é defeito do dado ou de quem chama, nunca "fora da área" em silêncio).
 */
import type { GeoPoint } from './index';

/** Posição GeoJSON: `[longitude, latitude]`, nessa ordem. */
export type GeoJsonPosition = readonly [longitude: number, latitude: number];

/** Anel fechado: pelo menos 4 posições, a primeira igual à última. */
export type GeoJsonLinearRing = readonly GeoJsonPosition[];

/** `Polygon` do GeoJSON: o primeiro anel é o contorno; os seguintes, buracos. */
export interface GeoJsonPolygon {
  readonly type: 'Polygon';
  readonly coordinates: readonly GeoJsonLinearRing[];
}

/** Caixa delimitadora no formato do GeoJSON (RFC 7946 §5): `[oeste, sul, leste, norte]`. */
export type BoundingBox = readonly [west: number, south: number, east: number, north: number];

/** `GET /v1/service-area` (e cada item de `GET /v1/admin/service-areas`). */
export interface ServiceArea {
  readonly areaId: string;
  readonly name: string;
  readonly polygon: GeoJsonPolygon;
  readonly bbox: BoundingBox;
}

/** Tolerância para "em cima da linha", em graus (~1 cm no equador). */
const EDGE_EPSILON = 1e-7;

function assertPoint(point: GeoPoint): void {
  const { latitude, longitude } = point;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError(`latitude precisa ser finita, entre -90 e 90 (recebido: ${latitude})`);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError(`longitude precisa ser finita, entre -180 e 180 (recebido: ${longitude})`);
  }
}

/** Lança `RangeError` se o polígono não for um `Polygon` GeoJSON válido (anéis fechados, ≥ 4 posições, coordenadas no intervalo). */
export function assertValidPolygon(polygon: GeoJsonPolygon): void {
  if (polygon.type !== 'Polygon' || polygon.coordinates.length === 0) {
    throw new RangeError('polígono precisa ser do tipo "Polygon" com ao menos o anel de contorno');
  }
  polygon.coordinates.forEach((ring, ringIndex) => {
    if (ring.length < 4) {
      throw new RangeError(`anel ${ringIndex} precisa de ao menos 4 posições (recebido: ${ring.length})`);
    }
    for (const position of ring) {
      if (position.length !== 2) throw new RangeError(`anel ${ringIndex} tem posição sem exatamente 2 números`);
      const [longitude, latitude] = position;
      assertPoint({ latitude, longitude });
    }
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
      throw new RangeError(`anel ${ringIndex} não é fechado (a primeira posição precisa ser igual à última)`);
    }
  });
}

/** Ponto dentro da caixa (borda inclusa). Barato: serve de filtro antes do polígono. */
export function isPointInBoundingBox(point: GeoPoint, bbox: BoundingBox): boolean {
  assertPoint(point);
  const [west, south, east, north] = bbox;
  return point.longitude >= west && point.longitude <= east && point.latitude >= south && point.latitude <= north;
}

function isOnSegment(x: number, y: number, a: GeoJsonPosition, b: GeoJsonPosition): boolean {
  const [ax, ay] = a;
  const [bx, by] = b;
  const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
  if (Math.abs(cross) > EDGE_EPSILON) return false;
  return (
    x >= Math.min(ax, bx) - EDGE_EPSILON &&
    x <= Math.max(ax, bx) + EDGE_EPSILON &&
    y >= Math.min(ay, by) - EDGE_EPSILON &&
    y <= Math.max(ay, by) + EDGE_EPSILON
  );
}

type RingPosition = 'inside' | 'outside' | 'edge';

/** Raio para a direita (par/ímpar), com a borda checada antes. */
function locateInRing(x: number, y: number, ring: GeoJsonLinearRing): RingPosition {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    if (isOnSegment(x, y, a, b)) return 'edge';
    const [ax, ay] = a;
    const [bx, by] = b;
    const crosses = ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax;
    if (crosses) inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}

/** Ponto dentro do polígono: dentro do contorno (ou na linha dele) e fora de todo buraco (a linha do buraco ainda conta como dentro). */
export function isPointInPolygon(point: GeoPoint, polygon: GeoJsonPolygon): boolean {
  assertPoint(point);
  assertValidPolygon(polygon);
  const [outer, ...holes] = polygon.coordinates;
  if (!outer) return false;
  const x = point.longitude;
  const y = point.latitude;
  const outerPosition = locateInRing(x, y, outer);
  if (outerPosition === 'outside') return false;
  if (outerPosition === 'edge') return true;
  return holes.every((hole) => locateInRing(x, y, hole) !== 'inside');
}

/** A regra que o servidor usa para `outside_service_area` e o `inServiceArea` de `GET /v1/geo/reverse`: caixa primeiro, polígono depois. */
export function isPointInServiceArea(point: GeoPoint, area: Pick<ServiceArea, 'polygon' | 'bbox'>): boolean {
  if (!isPointInBoundingBox(point, area.bbox)) return false;
  return isPointInPolygon(point, area.polygon);
}
