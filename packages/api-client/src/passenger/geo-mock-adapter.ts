/**
 * Adaptador `mock` de geografia e cotação do passageiro (M4, fatia K0 do `docs/plano-m3-m4.md`). Uma
 * instância = UM passageiro. Responde cada erro do §3 pela regra do servidor:
 *
 * - `outside_service_area` pelo MESMO ponto-no-polígono do servidor (`isPointInServiceArea`,
 *   `@vuumbora/domain`), sobre a área ilustrativa `MOCK_SERVICE_AREA`;
 * - `fare_not_configured` pela trava N8 (`isFareVersionQuotable`): com `allowTestFares: false` e só a
 *   tarifa de teste, o mock responde como a produção;
 * - `quote_expired` pela validade de 5 min (`isQuoteExpired`), no relógio injetável — ou já, com
 *   `control.expireQuote`;
 * - `route_too_short` abaixo de `minRouteDistanceM`; `route_unavailable`, `geo_unavailable`,
 *   `rate_limited` e qualquer outro por `control.failNext(code)`.
 *
 * A rota é uma linha reta com fator de rua (sem Mapbox). A assinatura é um resumo NÃO criptográfico
 * com prefixo `mock-`: no servidor é HMAC com segredo que nunca sai de lá.
 */
import {
  computeFare,
  encodePolyline,
  isFareVersionQuotable,
  isPointInServiceArea,
  isQuoteExpired,
  quoteExpiresAtMs,
  type GeoPoint,
  type ServiceArea,
} from '@vuumbora/domain';
import type { Result } from '../index';
import { catalogError, NETWORK_FAILURE } from '../server-error';
import { failWith, succeed } from '../trip/result';
import { MOCK_RIDE_CATEGORIES, MOCK_SERVICE_AREA, MOCK_TEST_FARE_VERSION, type MockRideCategory } from '../geo/mock-data';
import {
  GEO_QUOTE_ERRORS,
  type FareQuote,
  type FareQuoteInput,
  type FareQuotePort,
  type FareQuoteResult,
  type GeoPort,
  type GeoQuoteErrorCode,
  type GeoSearchInput,
  type GeoSearchResult,
  type GeoSearchSource,
  type LatLng,
  type QuotePoint,
  type ReverseGeocodeResult,
  type RideCategory,
} from './geo-types';

/** Um lugar do mock: o resultado de busca + para qual `kind` ele aparece. */
export interface MockGeoPlace extends GeoSearchResult {
  readonly kind: 'address' | 'place';
}

/** Versão de tarifa que o mock usa para cotar. */
export interface MockFareVersion {
  readonly fareVersionId: string;
  readonly isTest: boolean;
  readonly categories: readonly {
    readonly categorySlug: string;
    readonly baseCents: number;
    readonly perKmCents: number;
    readonly perMinuteCents: number;
    readonly minimumFareCents: number;
  }[];
}

export interface MockPassengerGeoOptions {
  readonly clock?: () => number;
  readonly nextId?: () => string;
  /** Atraso simulado por chamada, em ms. Padrão 0 (testes); a tela pode usar ~350 para ver o carregando. */
  readonly delayMs?: number;
  readonly serviceArea?: ServiceArea;
  readonly categories?: readonly MockRideCategory[];
  readonly fareVersion?: MockFareVersion;
  /** `ALLOW_TEST_FARES` do servidor. Padrão `true` (desenvolvimento). `false` reproduz a produção (N8). */
  readonly allowTestFares?: boolean;
  /** Distância mínima da rota, em metros. Padrão 300. */
  readonly minRouteDistanceM?: number;
  readonly places?: readonly MockGeoPlace[];
}

export interface MockPassengerGeoControl {
  /** A PRÓXIMA chamada (de qualquer das duas portas) falha com este código, uma vez. */
  failNext(code: GeoQuoteErrorCode | 'network'): void;
  setAllowTestFares(allow: boolean): void;
  setCategoryEnabled(slug: string, enabled: boolean): void;
  /** Vence a cotação já, sem esperar 5 min. Cotação inexistente lança `TypeError`. */
  expireQuote(quoteId: string): void;
}

export interface MockPassengerGeo {
  readonly geoPort: GeoPort;
  readonly quotePort: FareQuotePort;
  readonly control: MockPassengerGeoControl;
}

/** Lugares de exemplo, todos dentro de `MOCK_SERVICE_AREA`. Os `curated` fazem o papel de `curated_places` (N6). */
export const MOCK_GEO_PLACES: readonly MockGeoPlace[] = [
  { id: 'cur-aeroporto', label: 'Aeroporto Internacional de Natal', sublabel: 'São Gonçalo do Amarante - RN', lat: -5.7683, lng: -35.3761, source: 'curated', kind: 'place' },
  { id: 'cur-rodoviaria', label: 'Terminal Rodoviário de Natal', sublabel: 'Cidade da Esperança, Natal - RN', lat: -5.8001, lng: -35.2331, source: 'curated', kind: 'place' },
  { id: 'cur-midway', label: 'Midway Mall', sublabel: 'Av. Sen. Salgado Filho, 2234 - Tirol, Natal - RN', lat: -5.8113, lng: -35.2061, source: 'curated', kind: 'place' },
  { id: 'cur-natal-shopping', label: 'Natal Shopping', sublabel: 'Candelária, Natal - RN', lat: -5.8432, lng: -35.2109, source: 'curated', kind: 'place' },
  { id: 'cur-arena', label: 'Arena das Dunas', sublabel: 'Lagoa Nova, Natal - RN', lat: -5.8287, lng: -35.2124, source: 'curated', kind: 'place' },
  { id: 'cur-walfredo', label: 'Hospital Walfredo Gurgel', sublabel: 'Tirol, Natal - RN', lat: -5.8021, lng: -35.2093, source: 'curated', kind: 'place' },
  { id: 'geo-roberto-freire', label: 'Av. Eng. Roberto Freire, 2000', sublabel: 'Ponta Negra, Natal - RN', lat: -5.8778, lng: -35.1792, source: 'geocoding', kind: 'address' },
  { id: 'geo-mossoro', label: 'Rua Mossoró, 500', sublabel: 'Tirol, Natal - RN', lat: -5.7982, lng: -35.2034, source: 'geocoding', kind: 'address' },
  { id: 'geo-prudente', label: 'Av. Prudente de Morais, 3000', sublabel: 'Lagoa Nova, Natal - RN', lat: -5.8236, lng: -35.2079, source: 'geocoding', kind: 'address' },
  { id: 'geo-hermes', label: 'Av. Hermes da Fonseca, 1000', sublabel: 'Tirol, Natal - RN', lat: -5.8053, lng: -35.2012, source: 'geocoding', kind: 'address' },
  { id: 'geo-maria-lacerda', label: 'Av. Maria Lacerda Montenegro, 100', sublabel: 'Nova Parnamirim, Parnamirim - RN', lat: -5.8949, lng: -35.2135, source: 'geocoding', kind: 'address' },
  { id: 'sb-ponta-negra', label: 'Praia de Ponta Negra', sublabel: 'Ponta Negra, Natal - RN', lat: -5.8871, lng: -35.1712, source: 'searchbox', kind: 'place' },
  { id: 'sb-morro', label: 'Morro do Careca', sublabel: 'Ponta Negra, Natal - RN', lat: -5.8963, lng: -35.1693, source: 'searchbox', kind: 'place' },
  { id: 'sb-reis-magos', label: 'Fortaleza dos Reis Magos', sublabel: 'Praia do Forte, Natal - RN', lat: -5.7561, lng: -35.1934, source: 'searchbox', kind: 'place' },
  { id: 'sb-ufrn', label: 'UFRN - Campus Central', sublabel: 'Lagoa Nova, Natal - RN', lat: -5.8389, lng: -35.1997, source: 'searchbox', kind: 'place' },
];

const MAX_RESULTS = 8;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
/** Limites do servidor (`apps/api/src/domain/quote-input.ts`): mesmo corpo, mesmo 400 no mock e na API. */
const MAX_LABEL_LENGTH = 200;
const MAX_CATEGORY_SLUGS = 20;
const MAX_SLUG_LENGTH = 64;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const REVERSE_MATCH_RADIUS_M = 150;
/** Linha reta × fator de rua, a 25 km/h médios: só para o mock ter números plausíveis. */
const ROAD_FACTOR = 1.3;
const AVERAGE_SPEED_MPS = 25_000 / 3600;

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function isLatLng(value: unknown): value is LatLng {
  if (typeof value !== 'object' || value === null) return false;
  const { lat, lng } = value as Record<string, unknown>;
  return (
    typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180
  );
}

function isQuotePoint(value: unknown): value is QuotePoint {
  if (!isLatLng(value)) return false;
  const { label } = value as unknown as Record<string, unknown>;
  if (typeof label !== 'string' || CONTROL_CHARACTERS.test(label)) return false;
  const trimmed = label.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_LABEL_LENGTH;
}

const toGeoPoint = (point: LatLng): GeoPoint => ({ latitude: point.lat, longitude: point.lng });

function haversineM(a: LatLng, b: LatLng): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Resumo FNV-1a (32 bits) em hexadecimal. NÃO é assinatura: só dá ao mock um valor estável por cotação. */
function mockDigest(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function wait(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export function createMockPassengerGeo(options: MockPassengerGeoOptions = {}): MockPassengerGeo {
  const clock = options.clock ?? Date.now;
  let counter = 0;
  const nextId = options.nextId ?? (() => `quote-mock-${++counter}`);
  const delayMs = options.delayMs ?? 0;
  const area = options.serviceArea ?? MOCK_SERVICE_AREA;
  const categories = options.categories ?? MOCK_RIDE_CATEGORIES;
  const fareVersion: MockFareVersion = options.fareVersion ?? MOCK_TEST_FARE_VERSION;
  const minRouteDistanceM = options.minRouteDistanceM ?? 300;
  const places = options.places ?? MOCK_GEO_PLACES;
  let allowTestFares = options.allowTestFares ?? true;
  let forcedFailure: GeoQuoteErrorCode | 'network' | undefined;
  const enabledOverrides = new Map<string, boolean>();
  const quotes = new Map<string, FareQuote>();

  const fail = (code: GeoQuoteErrorCode) => failWith(catalogError(GEO_QUOTE_ERRORS, code));
  const isEnabled = (category: MockRideCategory) => enabledOverrides.get(category.slug) ?? category.enabled;

  async function begin(): Promise<{ readonly ok: false; readonly error: ReturnType<typeof catalogError> } | undefined> {
    await wait(delayMs);
    const forced = forcedFailure;
    forcedFailure = undefined;
    if (forced === 'network') return failWith(NETWORK_FAILURE);
    if (forced !== undefined) return fail(forced);
    return undefined;
  }

  async function search(input: GeoSearchInput): Promise<Result<{ readonly results: readonly GeoSearchResult[] }>> {
    const forced = await begin();
    if (forced) return forced;
    if (typeof input !== 'object' || input === null || typeof input.q !== 'string' || input.q.length > MAX_QUERY_LENGTH) {
      return fail('invalid_body');
    }
    const kind = input.kind ?? 'address';
    if (kind !== 'address' && kind !== 'place' && kind !== 'any') return fail('invalid_body');
    if (input.near !== undefined && !isLatLng(input.near)) return fail('invalid_body');
    const query = normalize(input.q);
    if (query.length < MIN_QUERY_LENGTH) return succeed({ results: [] });

    const matches = places.filter(
      (place) => normalize(place.label).includes(query) || normalize(place.sublabel).includes(query),
    );
    const near = input.near;
    const bySource = (source: GeoSearchSource) => {
      const list = matches.filter((place) => place.source === source && (source === 'curated' || kind === 'any' || place.kind === kind));
      return near ? [...list].sort((a, b) => haversineM(near, a) - haversineM(near, b)) : list;
    };
    // `any`: as duas fontes numa chamada só (no servidor, quem abre a lista depende de o texto ter cara de endereço).
    const mapboxSources: readonly GeoSearchSource[] = kind === 'address' ? ['geocoding'] : kind === 'place' ? ['searchbox'] : ['geocoding', 'searchbox'];
    const ordered = [...bySource('curated'), ...mapboxSources.flatMap(bySource)];
    const results = ordered.slice(0, MAX_RESULTS).map(({ id, label, sublabel, lat, lng, source }) => ({ id, label, sublabel, lat, lng, source }));
    return succeed({ results });
  }

  async function reverse(point: LatLng): Promise<Result<ReverseGeocodeResult>> {
    const forced = await begin();
    if (forced) return forced;
    if (!isLatLng(point)) return fail('invalid_body');
    let nearest: MockGeoPlace | undefined;
    let nearestM = Infinity;
    for (const place of places) {
      const distance = haversineM(point, place);
      if (distance < nearestM) {
        nearest = place;
        nearestM = distance;
      }
    }
    const label = nearest && nearestM <= REVERSE_MATCH_RADIUS_M ? nearest.label : 'Local marcado no mapa';
    return succeed({ label, lat: point.lat, lng: point.lng, inServiceArea: isPointInServiceArea(toGeoPoint(point), area) });
  }

  async function serviceArea(): Promise<Result<ServiceArea>> {
    const forced = await begin();
    if (forced) return forced;
    return succeed(area);
  }

  async function categoriesRoute(): Promise<Result<readonly RideCategory[]>> {
    const forced = await begin();
    if (forced) return forced;
    return succeed(categories.filter(isEnabled).map(({ slug, name, description, seats }) => ({ slug, name, description, seats })));
  }

  async function createQuotes(input: FareQuoteInput): Promise<Result<FareQuoteResult>> {
    const forced = await begin();
    if (forced) return forced;
    if (typeof input !== 'object' || input === null || !isQuotePoint(input.origin) || !isQuotePoint(input.destination)) {
      return fail('invalid_body');
    }
    const { categorySlugs } = input;
    if (
      categorySlugs !== undefined &&
      (!Array.isArray(categorySlugs) || categorySlugs.length > MAX_CATEGORY_SLUGS || !categorySlugs.every((slug) => typeof slug === 'string' && slug.length <= MAX_SLUG_LENGTH))
    ) {
      return fail('invalid_body');
    }
    if (!isFareVersionQuotable(fareVersion, { allowTestFares })) return fail('fare_not_configured');
    if (!isPointInServiceArea(toGeoPoint(input.origin), area) || !isPointInServiceArea(toGeoPoint(input.destination), area)) {
      return fail('outside_service_area');
    }
    const distanceM = Math.round(haversineM(input.origin, input.destination) * ROAD_FACTOR);
    if (distanceM < minRouteDistanceM) return fail('route_too_short');
    const durationS = Math.round(distanceM / AVERAGE_SPEED_MPS);
    const polyline = encodePolyline([toGeoPoint(input.origin), toGeoPoint(input.destination)]);

    const now = clock();
    const expiresAt = new Date(quoteExpiresAtMs(now)).toISOString();
    const wanted = categorySlugs ? new Set(categorySlugs) : undefined;
    const created: FareQuote[] = [];
    for (const category of categories) {
      if (!isEnabled(category) || (wanted && !wanted.has(category.slug))) continue;
      const rates = fareVersion.categories.find((candidate) => candidate.categorySlug === category.slug);
      if (!rates) continue; // categoria ligada sem tarifa na versão: não cota (o servidor faz o mesmo)
      // Mesma conta do servidor (G2): arredonda uma vez, no total, sobre metros e segundos inteiros.
      const priceCents = computeFare(rates, { distanceM, durationS }).totalCents;
      const quoteId = nextId();
      const signature = `mock-${mockDigest([quoteId, category.slug, priceCents, fareVersion.fareVersionId, expiresAt].join('|'))}`;
      const quote: FareQuote = {
        quoteId,
        categorySlug: category.slug,
        priceCents,
        currency: 'BRL',
        fareVersionId: fareVersion.fareVersionId,
        isTestFare: fareVersion.isTest,
        expiresAt,
        signature,
      };
      quotes.set(quoteId, quote);
      created.push(quote);
    }
    return succeed({ route: { distanceM, durationS, polyline }, quotes: created });
  }

  async function getQuote(quoteId: string): Promise<Result<FareQuote>> {
    const forced = await begin();
    if (forced) return forced;
    const quote = typeof quoteId === 'string' ? quotes.get(quoteId) : undefined;
    if (!quote) return fail('not_found');
    if (isQuoteExpired(quote.expiresAt, clock())) return fail('quote_expired');
    return succeed(quote);
  }

  return {
    geoPort: { search, reverse, serviceArea, categories: categoriesRoute },
    quotePort: { createQuotes, getQuote },
    control: {
      failNext(code) {
        forcedFailure = code;
      },
      setAllowTestFares(allow) {
        allowTestFares = allow;
      },
      setCategoryEnabled(slug, enabled) {
        enabledOverrides.set(slug, enabled);
      },
      expireQuote(quoteId) {
        const quote = quotes.get(quoteId);
        if (!quote) throw new TypeError(`cotação ${quoteId} não existe`);
        quotes.set(quoteId, { ...quote, expiresAt: new Date(clock() - 1).toISOString() });
      },
    },
  };
}
