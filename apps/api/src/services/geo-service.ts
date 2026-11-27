/**
 * Busca de endereço, pino, área e categorias do passageiro (M4, fatia G3; N6 do `docs/plano-m3-m4.md`).
 *
 *  - busca: pontos próprios (banco) + Geocoding v6 e/ou Search Box (Mapbox, pela porta `GeoProvider`), juntados por
 *    `rankSearchResults` (`domain/geo-search.ts`). `kind=any` consulta as DUAS fontes do Mapbox numa chamada só da API;
 *  - cache curto: cada resposta do Mapbox fica `GEO_CACHE_TTL_SECONDS` (padrão 300 s) por (fonte, texto, proximidade, caixa);
 *    área, categorias e pontos próprios ficam 60 s (catálogo que só o operador muda). Erro nunca fica guardado;
 *  - uma fonte do Mapbox falhou e a outra respondeu: devolve o que veio (com log). As duas falharam: só os pontos próprios,
 *    se algum casou; senão, `geo_unavailable`;
 *  - nada de texto buscado, coordenada ou rótulo em log: só contagens, fonte e motivo da falha.
 */
import type { FastifyBaseLogger } from 'fastify';
import type { ServiceArea } from '../domain/geo-fare-rules.js';
import {
  DEFAULT_PROXIMITY,
  FALLBACK_BBOX,
  insideArea,
  isQueryTooShort,
  rankSearchResults,
  roundNear,
  type CuratedPlace,
  type GeoSearchQuery,
  type GeoSearchResult,
  type LatLng,
} from '../domain/geo-search.js';
import type { GeoConfig } from '../lib/geo-config.js';
import { GeoProviderError, type ForwardEngine, type GeoProvider, type ReverseResult } from '../lib/mapbox.js';
import { describeErrorForLog } from '../lib/safe-error.js';
import { TtlCache } from '../lib/ttl-cache.js';
import { loadActiveCuratedPlaces, loadActiveServiceArea, loadEnabledCategories, type RideCategoryRow } from '../repositories/geo-repository.js';
import type { Queryable } from '../repositories/identity-repository.js';

/** Cidade de operação, fixada no servidor (o cliente nunca escolhe). */
export const GEO_CITY_CODE = 'natal';

/** Rótulo do pino quando o Mapbox não dá nome ao ponto (o mesmo do mock do K0). */
export const UNNAMED_PIN_LABEL = 'Local marcado no mapa';

const CATALOG_TTL_MS = 60_000;
const SEARCH_CACHE_MAX_ENTRIES = 2_000;

export type SearchOutcome =
  | { readonly kind: 'ok'; readonly results: readonly GeoSearchResult[]; readonly cacheHits: number; readonly failedEngines: readonly ForwardEngine[] }
  | { readonly kind: 'geo_unavailable' };

export type ReverseOutcome = { readonly kind: 'ok'; readonly label: string; readonly inServiceArea: boolean } | { readonly kind: 'geo_unavailable' };

export interface GeoServiceDeps {
  readonly db: Queryable;
  /** `null` = sem token do servidor (a rota já responde 503 antes de chegar aqui). */
  readonly provider: GeoProvider | null;
  readonly config: GeoConfig;
  readonly log: FastifyBaseLogger;
  readonly now?: () => number;
}

export interface GeoService {
  search(query: GeoSearchQuery): Promise<SearchOutcome>;
  reverse(point: LatLng): Promise<ReverseOutcome>;
  serviceArea(): Promise<ServiceArea | null>;
  categories(): Promise<readonly RideCategoryRow[]>;
}

function engineFailureForLog(err: unknown): Record<string, unknown> {
  return err instanceof GeoProviderError ? { reason: err.reason, ...(err.status !== undefined ? { status: err.status } : {}) } : describeErrorForLog(err);
}

export function createGeoService(deps: GeoServiceDeps): GeoService {
  const now = deps.now ?? Date.now;
  const forwardCache = new TtlCache<GeoSearchResult[]>(deps.config.searchCacheTtlMs, SEARCH_CACHE_MAX_ENTRIES, now);
  const reverseCache = new TtlCache<ReverseResult>(deps.config.searchCacheTtlMs, SEARCH_CACHE_MAX_ENTRIES, now);
  const areaCache = new TtlCache<ServiceArea | null>(CATALOG_TTL_MS, 1, now);
  const categoriesCache = new TtlCache<RideCategoryRow[]>(CATALOG_TTL_MS, 1, now);
  const curatedCache = new TtlCache<CuratedPlace[]>(CATALOG_TTL_MS, 1, now);

  const serviceArea = async () => (await areaCache.get(GEO_CITY_CODE, () => loadActiveServiceArea(deps.db, GEO_CITY_CODE))).value;
  const curatedPlaces = async () => (await curatedCache.get(GEO_CITY_CODE, () => loadActiveCuratedPlaces(deps.db, GEO_CITY_CODE))).value;

  async function search(query: GeoSearchQuery): Promise<SearchOutcome> {
    if (isQueryTooShort(query.q)) return { kind: 'ok', results: [], cacheHits: 0, failedEngines: [] };
    const provider = deps.provider;
    if (!provider) return { kind: 'geo_unavailable' };

    const [area, curated] = await Promise.all([serviceArea(), curatedPlaces()]);
    const bbox = area ? area.bbox : FALLBACK_BBOX;
    // A posição do passageiro só desempata: vai ao Mapbox (e à chave do cache) arredondada a ~1 km.
    const proximity = roundNear(query.near ?? DEFAULT_PROXIMITY);
    const engines: ForwardEngine[] = query.kind === 'address' ? ['geocoding'] : query.kind === 'place' ? ['searchbox'] : ['geocoding', 'searchbox'];

    const settled = await Promise.allSettled(
      engines.map((engine) =>
        forwardCache.get(`${engine}|${query.q}|${proximity.lat},${proximity.lng}|${bbox.join(',')}`, () => provider.forward(engine, { q: query.q, proximity, bbox })),
      ),
    );
    const byEngine: Record<ForwardEngine, GeoSearchResult[]> = { geocoding: [], searchbox: [] };
    const failedEngines: ForwardEngine[] = [];
    let cacheHits = 0;
    settled.forEach((outcome, index) => {
      const engine = engines[index]!;
      if (outcome.status === 'fulfilled') {
        byEngine[engine] = outcome.value.value;
        if (outcome.value.hit) cacheHits += 1;
      } else {
        failedEngines.push(engine);
        deps.log.warn({ event: 'geo_provider_failed', engine, ...engineFailureForLog(outcome.reason) });
      }
    });

    const results = rankSearchResults({ q: query.q, kind: query.kind, curated, geocoding: byEngine.geocoding, searchbox: byEngine.searchbox, ...(query.near ? { near: query.near } : {}) });
    if (failedEngines.length === engines.length && !results.some((result) => result.source === 'curated')) return { kind: 'geo_unavailable' };
    return { kind: 'ok', results, cacheHits, failedEngines };
  }

  async function reverse(point: LatLng): Promise<ReverseOutcome> {
    const provider = deps.provider;
    if (!provider) return { kind: 'geo_unavailable' };
    const area = await serviceArea();
    // O nome vem do ponto arredondado a ~11 m (cache e privacidade); a coordenada devolvida é a do pino, sem mexer.
    const rounded = { lat: Math.round(point.lat * 10_000) / 10_000, lng: Math.round(point.lng * 10_000) / 10_000 };
    try {
      const { value } = await reverseCache.get(`${rounded.lat},${rounded.lng}`, () => provider.reverse(rounded));
      return { kind: 'ok', label: value.label ?? UNNAMED_PIN_LABEL, inServiceArea: insideArea(point, area) };
    } catch (err) {
      deps.log.warn({ event: 'geo_provider_failed', engine: 'reverse', ...engineFailureForLog(err) });
      return { kind: 'geo_unavailable' };
    }
  }

  return {
    search,
    reverse,
    serviceArea,
    categories: async () => (await categoriesCache.get('enabled', () => loadEnabledCategories(deps.db))).value,
  };
}
