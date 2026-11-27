/**
 * Adaptador do Mapbox NO SERVIDOR (M4, fatias G3/G4; N6 e V1 do `docs/plano-m3-m4.md`): Geocoding v6 (endereço), Search Box
 * (nome de lugar), Geocoding v6 reverso (o pino) e Directions (a rota da cotação). O resto da API fala com a porta
 * `GeoProvider`, nunca com o Mapbox: os testes trocam o `fetch` por respostas GRAVADAS (`test/fixtures/mapbox/`).
 *
 * Resiliência: tempo máximo por chamada (`timeoutMs`); UMA repetição, com espera curta e sorteada, só para falha de rede,
 * tempo esgotado e 5xx — nunca para 4xx nem 429 (repetir 429 só piora a cota). Falha vira `GeoProviderError` com o motivo
 * (`reason`) e o status, para o log; a rota traduz para `502 geo_unavailable`/`route_unavailable`.
 *
 * Segredo e dado pessoal: o token vai SÓ na URL da chamada e a URL nunca é logada nem devolvida (nem no erro). O texto
 * buscado e as coordenadas também não vão para log nenhum.
 *
 * Parâmetros (os da F10, `docs/area-de-servico-natal.md` §1): `language=pt`, `country=BR`, `proximity` (a posição do
 * passageiro, arredondada a ~1 km, ou o centro de Natal), `bbox` = caixa da área de serviço ativa.
 */
import { createHash } from 'node:crypto';
import type { BoundingBox } from '../domain/geo-fare-rules.js';
import type { GeoSearchResult, GeoSearchSource, LatLng } from '../domain/geo-search.js';
import type { DirectionsProfile } from './geo-config.js';

export const MAPBOX_API_ORIGIN = 'https://api.mapbox.com';
const GEOCODE_FORWARD_PATH = '/search/geocode/v6/forward';
const GEOCODE_REVERSE_PATH = '/search/geocode/v6/reverse';
const SEARCHBOX_FORWARD_PATH = '/search/searchbox/v1/forward';
const DIRECTIONS_PATH = '/directions/v5/mapbox';

/** Quantos resultados pedir a cada fonte (a rota corta em 8 depois de juntar). */
export const MAPBOX_FORWARD_LIMIT = 5;
const MAX_TEXT_LENGTH = 200;
/** Polilinha de rota maior que isto é resposta estranha (Natal inteira cabe em bem menos). */
const MAX_POLYLINE_LENGTH = 200_000;

export type ForwardEngine = Exclude<GeoSearchSource, 'curated'>;

export interface ForwardRequest {
  readonly q: string;
  readonly proximity: LatLng;
  readonly bbox: BoundingBox;
}

export interface ReverseResult {
  /** `null` = o Mapbox não deu nome a este ponto (a rota usa o rótulo genérico). */
  readonly label: string | null;
}

export interface DrivingRoute {
  /** Metros, como o Mapbox devolveu (quebrado). Quem cota arredonda à vista. */
  readonly distanceM: number;
  readonly durationS: number;
  /** Polilinha codificada, precisão 5 (`geometries=polyline`). */
  readonly polyline: string;
}

export type GeoProviderFailure = 'timeout' | 'network' | 'http_status' | 'bad_response' | 'no_route';

export class GeoProviderError extends Error {
  constructor(
    readonly reason: GeoProviderFailure,
    readonly status?: number,
  ) {
    super(`geo provider: ${reason}${status !== undefined ? ` (${status})` : ''}`);
    this.name = 'GeoProviderError';
  }
}

/** A porta que o resto da API usa. */
export interface GeoProvider {
  forward(engine: ForwardEngine, request: ForwardRequest): Promise<GeoSearchResult[]>;
  reverse(point: LatLng): Promise<ReverseResult>;
  directions(origin: LatLng, destination: LatLng): Promise<DrivingRoute>;
}

// ---------------------------------------------------------------------------------------------------------------------
// URLs (exportadas: a gravação das respostas e o teste montam a MESMA URL)
// ---------------------------------------------------------------------------------------------------------------------

const coordinate = (value: number) => String(Number(value.toFixed(6)));

export function forwardUrl(engine: ForwardEngine, request: ForwardRequest, token: string): string {
  const params = new URLSearchParams({
    q: request.q,
    language: 'pt',
    country: 'BR',
    proximity: `${coordinate(request.proximity.lng)},${coordinate(request.proximity.lat)}`,
    bbox: request.bbox.map(coordinate).join(','),
    limit: String(MAPBOX_FORWARD_LIMIT),
    access_token: token,
  });
  return `${MAPBOX_API_ORIGIN}${engine === 'geocoding' ? GEOCODE_FORWARD_PATH : SEARCHBOX_FORWARD_PATH}?${params.toString()}`;
}

export function reverseUrl(point: LatLng, token: string): string {
  const params = new URLSearchParams({
    longitude: coordinate(point.lng),
    latitude: coordinate(point.lat),
    language: 'pt',
    country: 'BR',
    access_token: token,
  });
  return `${MAPBOX_API_ORIGIN}${GEOCODE_REVERSE_PATH}?${params.toString()}`;
}

export function directionsUrl(profile: DirectionsProfile, origin: LatLng, destination: LatLng, token: string): string {
  const points = `${coordinate(origin.lng)},${coordinate(origin.lat)};${coordinate(destination.lng)},${coordinate(destination.lat)}`;
  const params = new URLSearchParams({ alternatives: 'false', geometries: 'polyline', overview: 'full', steps: 'false', access_token: token });
  return `${MAPBOX_API_ORIGIN}${DIRECTIONS_PATH}/${profile}/${points}?${params.toString()}`;
}

/** A URL sem o token: a chave das respostas gravadas (e o único jeito de uma URL do Mapbox aparecer em arquivo). */
export function urlWithoutToken(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete('access_token');
  return `${parsed.origin}${parsed.pathname}?${parsed.searchParams.toString()}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Leitura das respostas (tudo conferido: resposta fora da forma vira `bad_response`, nunca dado inventado)
// ---------------------------------------------------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, MAX_TEXT_LENGTH) : undefined;
}

function nameOf(context: Record<string, unknown>, key: string): string | undefined {
  const entry = context[key];
  return isRecord(entry) ? text(entry['name']) : undefined;
}

/** "Bairro, Cidade - UF" a partir do contexto do Mapbox (o mesmo formato curto do mock do K0). */
function localityLine(context: Record<string, unknown>): string | undefined {
  const region = context['region'];
  const regionCode = isRecord(region) ? text(region['region_code']) : undefined;
  const city = nameOf(context, 'place') ?? nameOf(context, 'locality');
  const cityPart = city ? (regionCode ? `${city} - ${regionCode}` : city) : undefined;
  const parts = [nameOf(context, 'neighborhood'), cityPart].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

function pointOf(feature: Record<string, unknown>, properties: Record<string, unknown>): LatLng | null {
  const coordinates = properties['coordinates'];
  if (isRecord(coordinates) && typeof coordinates['latitude'] === 'number' && typeof coordinates['longitude'] === 'number') {
    return { lat: coordinates['latitude'], lng: coordinates['longitude'] };
  }
  const geometry = feature['geometry'];
  if (isRecord(geometry) && Array.isArray(geometry['coordinates'])) {
    const [lng, lat] = geometry['coordinates'] as unknown[];
    if (typeof lng === 'number' && typeof lat === 'number') return { lat, lng };
  }
  return null;
}

function validPoint(point: LatLng | null): point is LatLng {
  return point !== null && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}

/**
 * Id do resultado: CURTO e nosso, nunca o `mapbox_id`. O `mapbox_id` da Geocoding v6 chega a 3.000 caracteres e carrega a
 * CONSULTA inteira em base64 (texto digitado, proximidade, caixa) — achado ao gravar as respostas. Resumo de fonte + rótulo +
 * coordenada: o mesmo lugar tem o mesmo id em buscas diferentes, e nada do pedido volta embutido.
 */
function resultId(source: ForwardEngine, label: string, point: LatLng): string {
  const digest = createHash('sha256').update(`${source}|${label}|${point.lat.toFixed(6)}|${point.lng.toFixed(6)}`).digest('base64url');
  return `${source === 'geocoding' ? 'gc' : 'sb'}:${digest.slice(0, 22)}`;
}

function featuresOf(body: unknown): Record<string, unknown>[] {
  if (!isRecord(body) || !Array.isArray(body['features'])) throw new GeoProviderError('bad_response');
  return (body['features'] as unknown[]).filter(isRecord);
}

/** Geocoding v6 → resultado da busca. Rótulo = `name` ("Rua Mossoró, 480"); legenda = "Bairro, Cidade - UF". */
export function parseGeocodingFeatures(body: unknown): GeoSearchResult[] {
  const results: GeoSearchResult[] = [];
  for (const feature of featuresOf(body)) {
    const properties = isRecord(feature['properties']) ? feature['properties'] : {};
    const context = isRecord(properties['context']) ? properties['context'] : {};
    const point = pointOf(feature, properties);
    const label = text(properties['name']) ?? text(properties['full_address']);
    if (!validPoint(point) || !label) continue;
    const sublabel = localityLine(context) ?? text(properties['place_formatted']) ?? '';
    results.push({ id: resultId('geocoding', label, point), label, sublabel: sublabel === label ? '' : sublabel, lat: point.lat, lng: point.lng, source: 'geocoding' });
  }
  return results;
}

/** Search Box → resultado da busca. Rótulo = nome do lugar; legenda = endereço + "Bairro, Cidade - UF". */
export function parseSearchBoxFeatures(body: unknown): GeoSearchResult[] {
  const results: GeoSearchResult[] = [];
  for (const feature of featuresOf(body)) {
    const properties = isRecord(feature['properties']) ? feature['properties'] : {};
    const context = isRecord(properties['context']) ? properties['context'] : {};
    const point = pointOf(feature, properties);
    const label = text(properties['name']);
    if (!validPoint(point) || !label) continue;
    // A Search Box às vezes põe só a cidade em `address` ("Natal"): não é endereço, e repetiria a cidade na legenda.
    const street = text(properties['address']);
    const placeNames = [label, nameOf(context, 'place'), nameOf(context, 'locality'), nameOf(context, 'neighborhood')];
    const streetLine = street && !placeNames.includes(street) ? street : undefined;
    const parts = [streetLine, localityLine(context)].filter((part): part is string => part !== undefined);
    const sublabel = (parts.length > 0 ? parts.join(', ') : text(properties['full_address']) ?? text(properties['place_formatted']) ?? '').slice(0, MAX_TEXT_LENGTH);
    results.push({ id: resultId('searchbox', label, point), label, sublabel, lat: point.lat, lng: point.lng, source: 'searchbox' });
  }
  return results;
}

/** Ordem de preferência do rótulo do pino: o mais preciso que o Mapbox tiver para o ponto. */
const REVERSE_PREFERENCE = ['address', 'street', 'neighborhood', 'locality', 'place'];

/** Geocoding v6 reverso → rótulo do pino ("Rua Mossoró, 480 - Petrópolis"), ou `null` se nada servir. */
export function parseReverse(body: unknown): ReverseResult {
  const features = featuresOf(body);
  let best: { rank: number; label: string } | null = null;
  for (const feature of features) {
    const properties = isRecord(feature['properties']) ? feature['properties'] : {};
    const type = typeof properties['feature_type'] === 'string' ? properties['feature_type'] : '';
    const rank = REVERSE_PREFERENCE.indexOf(type);
    const name = text(properties['name']);
    if (rank === -1 || !name || (best && best.rank <= rank)) continue;
    const context = isRecord(properties['context']) ? properties['context'] : {};
    const neighborhood = type === 'address' || type === 'street' ? nameOf(context, 'neighborhood') : undefined;
    best = { rank, label: (neighborhood ? `${name} - ${neighborhood}` : name).slice(0, MAX_TEXT_LENGTH) };
  }
  return { label: best?.label ?? null };
}

export function parseDirections(body: unknown): DrivingRoute {
  if (!isRecord(body)) throw new GeoProviderError('bad_response');
  if (body['code'] !== 'Ok') throw new GeoProviderError('no_route');
  const routes = body['routes'];
  const route = Array.isArray(routes) ? routes[0] : undefined;
  if (!isRecord(route)) throw new GeoProviderError('no_route');
  const { distance, duration, geometry } = route;
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0) throw new GeoProviderError('bad_response');
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) throw new GeoProviderError('bad_response');
  if (typeof geometry !== 'string' || geometry.length === 0 || geometry.length > MAX_POLYLINE_LENGTH) throw new GeoProviderError('bad_response');
  return { distanceM: distance, durationS: duration, polyline: geometry };
}

// ---------------------------------------------------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------------------------------------------------

export interface MapboxProviderOptions {
  readonly token: string;
  readonly profile: DirectionsProfile;
  readonly timeoutMs: number;
  readonly fetch?: typeof fetch;
  /** Espera antes da única repetição (padrão 150 ms + sorteio de até 100 ms). Os testes passam 0. */
  readonly retryDelayMs?: number;
}

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

export function createMapboxProvider(options: MapboxProviderOptions): GeoProvider {
  const fetchImpl = options.fetch ?? fetch;
  const retryDelay = () => (options.retryDelayMs ?? 150 + Math.floor(Math.random() * 100));

  /** Uma tentativa. 2xx → corpo JSON; 4xx (exceto Directions sem rota, ver abaixo) → erro sem repetir. */
  async function attempt(url: string, acceptStatus: (status: number) => boolean): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!acceptStatus(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        throw new GeoProviderError('http_status', response.status);
      }
      try {
        return (await response.json()) as unknown;
      } catch {
        throw new GeoProviderError('bad_response', response.status);
      }
    } catch (err) {
      if (err instanceof GeoProviderError) throw err;
      throw new GeoProviderError(controller.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
  }

  const retryable = (err: unknown) =>
    err instanceof GeoProviderError && (err.reason === 'timeout' || err.reason === 'network' || (err.reason === 'http_status' && (err.status ?? 0) >= 500));

  async function getJson(url: string, acceptStatus: (status: number) => boolean = (status) => status >= 200 && status < 300): Promise<unknown> {
    try {
      return await attempt(url, acceptStatus);
    } catch (err) {
      if (!retryable(err)) throw err;
      await sleep(retryDelay());
      return attempt(url, acceptStatus);
    }
  }

  return {
    async forward(engine, request) {
      const body = await getJson(forwardUrl(engine, request, options.token));
      return engine === 'geocoding' ? parseGeocodingFeatures(body) : parseSearchBoxFeatures(body);
    },
    async reverse(point) {
      return parseReverse(await getJson(reverseUrl(point, options.token)));
    },
    async directions(origin, destination) {
      // "Sem rota" pode vir como 200 com `code: NoRoute` ou como 4xx com o mesmo corpo: os dois viram `no_route`.
      const body = await getJson(directionsUrl(options.profile, origin, destination, options.token), (status) => (status >= 200 && status < 300) || status === 422 || status === 404);
      return parseDirections(body);
    },
  };
}
