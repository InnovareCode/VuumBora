/**
 * Regras puras de área, cotação e preço no SERVIDOR (M4, fatias G2-G4 do `docs/plano-m3-m4.md`).
 *
 * Por que repete `@vuumbora/domain` (`service-area.ts`, `quote.ts`, `computeFare` de `fare.ts`): `apps/api` é standalone
 * (o Dockerfile só copia `apps/api`; mesma razão de `driver-onboarding.ts`). A igualdade não é promessa: o teste
 * `test/geo-fare-rules-parity.test.ts` carrega o módulo do domínio e compara as duas implementações em milhares de casos
 * sorteados — divergiu, o teste cai. Mudou a regra? Mude nos dois lugares.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Área de serviço (N7, sem PostGIS): polígono GeoJSON [longitude, latitude] + caixa [oeste, sul, leste, norte]
// ---------------------------------------------------------------------------------------------------------------------

export type GeoJsonPosition = readonly [longitude: number, latitude: number];
export type GeoJsonLinearRing = readonly GeoJsonPosition[];
export interface GeoJsonPolygon {
  readonly type: 'Polygon';
  readonly coordinates: readonly GeoJsonLinearRing[];
}
export type BoundingBox = readonly [west: number, south: number, east: number, north: number];

/** `GET /v1/service-area` (`ServiceArea` do contrato K0). */
export interface ServiceArea {
  readonly areaId: string;
  readonly name: string;
  readonly polygon: GeoJsonPolygon;
  readonly bbox: BoundingBox;
}

export interface PointLatLng {
  readonly lat: number;
  readonly lng: number;
}

const EDGE_EPSILON = 1e-7;

function isValidCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

/** O polígono que veio do banco é um `Polygon` GeoJSON válido? (O CHECK da 0026 já garante; aqui é a defesa do código.) */
export function isValidPolygon(polygon: unknown): polygon is GeoJsonPolygon {
  if (typeof polygon !== 'object' || polygon === null) return false;
  const value = polygon as { type?: unknown; coordinates?: unknown };
  if (value.type !== 'Polygon' || !Array.isArray(value.coordinates) || value.coordinates.length === 0) return false;
  for (const ring of value.coordinates as unknown[]) {
    if (!Array.isArray(ring) || ring.length < 4) return false;
    for (const position of ring as unknown[]) {
      if (!Array.isArray(position) || position.length !== 2) return false;
      const [lng, lat] = position as unknown[];
      if (typeof lng !== 'number' || typeof lat !== 'number' || !isValidCoordinate(lat, lng)) return false;
    }
    const first = ring[0] as number[];
    const last = ring[ring.length - 1] as number[];
    if (first[0] !== last[0] || first[1] !== last[1]) return false;
  }
  return true;
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

function locateInRing(x: number, y: number, ring: GeoJsonLinearRing): 'inside' | 'outside' | 'edge' {
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

/**
 * Caixa primeiro, polígono depois; borda conta como dentro; dentro de buraco, fora. Coordenada inválida lança (é defeito de
 * quem chama: a rota já validou a entrada).
 */
export function isPointInServiceArea(point: PointLatLng, area: Pick<ServiceArea, 'polygon' | 'bbox'>): boolean {
  if (!isValidCoordinate(point.lat, point.lng)) throw new RangeError('coordenada fora do intervalo');
  const [west, south, east, north] = area.bbox;
  if (point.lng < west || point.lng > east || point.lat < south || point.lat > north) return false;
  const [outer, ...holes] = area.polygon.coordinates;
  if (!outer) return false;
  const position = locateInRing(point.lng, point.lat, outer);
  if (position === 'outside') return false;
  if (position === 'edge') return true;
  return holes.every((hole) => locateInRing(point.lng, point.lat, hole) !== 'inside');
}

// ---------------------------------------------------------------------------------------------------------------------
// Cotação (N8, N9)
// ---------------------------------------------------------------------------------------------------------------------

/** Validade de uma cotação (N9: 5 minutos). O CHECK `fare_quotes_ttl` da 0026 aceita até 305 s. */
export const QUOTE_TTL_SECONDS = 300;

/** Abaixo disto a rota é curta demais para uma corrida (`422 route_too_short`). Igual ao padrão do mock do K0. */
export const MIN_ROUTE_DISTANCE_M = 300;

/** N8: tarifa de teste só cota com `ALLOW_TEST_FARES` ligada. `false` = `503 fare_not_configured`. */
export function isFareVersionQuotable(version: { readonly isTest: boolean }, options: { readonly allowTestFares: boolean }): boolean {
  return !version.isTest || options.allowTestFares;
}

// ---------------------------------------------------------------------------------------------------------------------
// Preço (G2): exato em aritmética inteira, arredonda UMA vez (meio para cima, no centavo), depois o mínimo
// ---------------------------------------------------------------------------------------------------------------------

export interface FareRates {
  readonly baseCents: number;
  readonly perKmCents: number;
  readonly perMinuteCents: number;
  readonly minimumFareCents: number;
}

export interface FareComputation {
  readonly totalCents: number;
  readonly roundedCents: number;
  readonly minimumApplied: boolean;
  readonly dynamicMultiplier: number;
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} precisa ser um inteiro não-negativo (recebido: ${value})`);
}

function dynamicHundredths(multiplier: number): number {
  const scaled = multiplier * 100;
  const hundredths = Math.round(scaled);
  if (!Number.isFinite(multiplier) || Math.abs(scaled - hundredths) > 1e-6 || hundredths < 100 || hundredths > 9999) {
    throw new RangeError(`dynamicMultiplier precisa estar entre 1 e 99.99, com até duas casas (recebido: ${multiplier})`);
  }
  return hundredths;
}

/** Espelho de `computeFare` (`packages/domain/src/fare.ts`): ver o comentário de lá para a conta inteira. */
export function computeFare(rates: FareRates, input: { readonly distanceM: number; readonly durationS: number; readonly dynamicMultiplier?: number }): FareComputation {
  assertNonNegativeInteger(rates.baseCents, 'baseCents');
  assertNonNegativeInteger(rates.perKmCents, 'perKmCents');
  assertNonNegativeInteger(rates.perMinuteCents, 'perMinuteCents');
  assertNonNegativeInteger(rates.minimumFareCents, 'minimumFareCents');
  assertNonNegativeInteger(input.distanceM, 'distanceM');
  assertNonNegativeInteger(input.durationS, 'durationS');
  const hundredths = dynamicHundredths(input.dynamicMultiplier ?? 1);
  const scaledSubtotal =
    BigInt(rates.baseCents) * 3000n + BigInt(rates.perKmCents) * BigInt(input.distanceM) * 3n + BigInt(rates.perMinuteCents) * BigInt(input.durationS) * 50n;
  const numerator = scaledSubtotal * BigInt(hundredths);
  const denominator = 300_000n;
  const rounded = (numerator * 2n + denominator) / (denominator * 2n);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('preço fora do intervalo representável');
  const roundedCents = Number(rounded);
  const totalCents = Math.max(roundedCents, rates.minimumFareCents);
  return { totalCents, roundedCents, minimumApplied: roundedCents < rates.minimumFareCents, dynamicMultiplier: hundredths / 100 };
}
