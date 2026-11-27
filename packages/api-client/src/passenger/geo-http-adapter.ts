/**
 * Adaptador `http` de geografia e cotação do passageiro (M4, fatias G3/G4 do `docs/plano-m3-m4.md`): `/v1/geo/*`,
 * `/v1/service-area`, `/v1/categories` e `/v1/quotes*`, com o access token da sessão. Mesmo contrato e MESMOS erros do mock
 * (`createMockPassengerGeo`): toda recusa passa por `apiErrorFromServerReply` com o mapa de campos de `GEO_QUOTE_ERRORS`.
 *
 * - Transporte comum (`http/authed-requester.ts`): https obrigatório, timeout, sessão que renova em 401, sem repetição
 *   automática (quem repete é a tela), resposta de sucesso CONFERIDA (forma errada vira `unknown`).
 * - Busca: o texto vai na querystring por `URLSearchParams`; `kind: 'any'` é UMA chamada (as duas fontes do Mapbox no
 *   servidor), e conta uma vez no limite por conta.
 * - Cotação: o corpo é montado CAMPO A CAMPO (sobra de objeto não vai ao servidor). A assinatura é opaca: só é guardada e
 *   devolvida no pedido da corrida (M5), nunca conferida aqui.
 * - Não loga nada: texto buscado, coordenadas e rótulos são localização da pessoa.
 */
import { assertValidPolygon, type ServiceArea } from '@vuumbora/domain';
import { createAuthedRequester, type AuthedHttpOptions } from '../http/authed-requester';
import { fieldsOfCatalog, type FieldByCode } from '../server-error';
import {
  GEO_QUOTE_ERRORS,
  type FareQuote,
  type FareQuoteInput,
  type FareQuotePort,
  type FareQuoteResult,
  type GeoPort,
  type GeoSearchInput,
  type GeoSearchResult,
  type LatLng,
  type QuotePoint,
  type ReverseGeocodeResult,
  type RideCategory,
} from './geo-types';

export type PassengerGeoHttpOptions = AuthedHttpOptions;

const FIELDS: FieldByCode = fieldsOfCatalog(GEO_QUOTE_ERRORS);
const SOURCES = new Set(['curated', 'geocoding', 'searchbox']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function isCoordinate(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 && typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseSearchResult(value: unknown): GeoSearchResult | null {
  if (!isRecord(value)) return null;
  const { id, label, sublabel, lat, lng, source } = value;
  if (!isText(id) || id === '' || !isText(label) || !isText(sublabel) || !isCoordinate(lat, lng) || !isText(source) || !SOURCES.has(source)) return null;
  return { id, label, sublabel, lat, lng: lng as number, source: source as GeoSearchResult['source'] };
}

function parseSearch(data: unknown): { readonly results: readonly GeoSearchResult[] } | null {
  if (!isRecord(data) || !Array.isArray(data['results'])) return null;
  const results: GeoSearchResult[] = [];
  for (const raw of data['results']) {
    const result = parseSearchResult(raw);
    if (!result) return null;
    results.push(result);
  }
  return { results };
}

function parseReverse(data: unknown): ReverseGeocodeResult | null {
  if (!isRecord(data)) return null;
  const { label, lat, lng, inServiceArea } = data;
  if (!isText(label) || !isCoordinate(lat, lng) || typeof inServiceArea !== 'boolean') return null;
  return { label, lat, lng: lng as number, inServiceArea };
}

function parseServiceArea(data: unknown): ServiceArea | null {
  if (!isRecord(data) || !isText(data['areaId']) || !isText(data['name']) || !isRecord(data['polygon']) || !Array.isArray(data['bbox'])) return null;
  const bbox = data['bbox'] as unknown[];
  if (bbox.length !== 4 || !bbox.every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  const area = { areaId: data['areaId'], name: data['name'], polygon: data['polygon'] as unknown as ServiceArea['polygon'], bbox: bbox as unknown as ServiceArea['bbox'] };
  try {
    assertValidPolygon(area.polygon);
  } catch {
    return null;
  }
  return area;
}

function parseCategories(data: unknown): readonly RideCategory[] | null {
  if (!Array.isArray(data)) return null;
  const categories: RideCategory[] = [];
  for (const raw of data) {
    if (!isRecord(raw)) return null;
    const { slug, name, description, seats } = raw;
    if (!isText(slug) || !isText(name) || !isText(description) || !isNonNegativeInteger(seats)) return null;
    categories.push({ slug, name, description, seats });
  }
  return categories;
}

function parseQuote(value: unknown): FareQuote | null {
  if (!isRecord(value)) return null;
  const { quoteId, categorySlug, priceCents, currency, fareVersionId, isTestFare, expiresAt, signature } = value;
  if (!isText(quoteId) || quoteId === '' || !isText(categorySlug) || !isNonNegativeInteger(priceCents) || currency !== 'BRL') return null;
  if (!isText(fareVersionId) || typeof isTestFare !== 'boolean' || !isText(expiresAt) || Number.isNaN(Date.parse(expiresAt)) || !isText(signature) || signature === '') return null;
  return { quoteId, categorySlug, priceCents, currency, fareVersionId, isTestFare, expiresAt, signature };
}

function parseQuoteResult(data: unknown): FareQuoteResult | null {
  if (!isRecord(data) || !isRecord(data['route']) || !Array.isArray(data['quotes'])) return null;
  const { distanceM, durationS, polyline } = data['route'];
  if (!isNonNegativeInteger(distanceM) || !isNonNegativeInteger(durationS) || !isText(polyline)) return null;
  const quotes: FareQuote[] = [];
  for (const raw of data['quotes']) {
    const quote = parseQuote(raw);
    if (!quote) return null;
    quotes.push(quote);
  }
  return { route: { distanceM, durationS, polyline }, quotes };
}

const pointBody = (point: QuotePoint) => ({ lat: point.lat, lng: point.lng, label: point.label });

/**
 * Coordenada na querystring com 6 casas (~11 cm): o GPS entrega `double` com até 15 casas, e `String(-5.812345678901234)`
 * mandaria a precisão toda. `Number(…toFixed(6))` também evita notação exponencial (`1e-7` vira `0`).
 */
const coordinateParam = (value: number): string => String(Number(value.toFixed(6)));

export function createPassengerGeoHttpAdapter(options: PassengerGeoHttpOptions): { readonly geoPort: GeoPort; readonly quotePort: FareQuotePort } {
  const request = createAuthedRequester(options, 'createPassengerGeoHttpAdapter');

  const geoPort: GeoPort = {
    search(input: GeoSearchInput) {
      const params = new URLSearchParams({ q: input.q });
      if (input.kind !== undefined) params.set('kind', input.kind);
      if (input.near !== undefined) params.set('near', `${coordinateParam(input.near.lat)},${coordinateParam(input.near.lng)}`);
      return request({ method: 'GET', path: `/v1/geo/search?${params.toString()}`, fields: FIELDS, parse: parseSearch });
    },
    reverse(point: LatLng) {
      const params = new URLSearchParams({ lat: coordinateParam(point.lat), lng: coordinateParam(point.lng) });
      return request({ method: 'GET', path: `/v1/geo/reverse?${params.toString()}`, fields: FIELDS, parse: parseReverse });
    },
    serviceArea: () => request({ method: 'GET', path: '/v1/service-area', fields: FIELDS, parse: parseServiceArea }),
    categories: () => request({ method: 'GET', path: '/v1/categories', fields: FIELDS, parse: parseCategories }),
  };

  const quotePort: FareQuotePort = {
    createQuotes(input: FareQuoteInput) {
      const body: Record<string, unknown> = { origin: pointBody(input.origin), destination: pointBody(input.destination) };
      if (input.categorySlugs !== undefined) body['categorySlugs'] = [...input.categorySlugs];
      return request({ method: 'POST', path: '/v1/quotes', body, fields: FIELDS, parse: parseQuoteResult });
    },
    getQuote: (quoteId: string) => request({ method: 'GET', path: `/v1/quotes/${encodeURIComponent(quoteId)}`, fields: FIELDS, parse: parseQuote }),
  };

  return { geoPort, quotePort };
}
