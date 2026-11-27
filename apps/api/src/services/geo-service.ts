/**
 * Busca de endereço, pino, área e categorias do passageiro (M4, fatia G3; N6 do `docs/plano-m3-m4.md`).
 *
 *  - busca: pontos próprios (banco) + Geocoding v6 e/ou Search Box (Mapbox, pela porta `GeoProvider`), juntados por
 *    `rankSearchResults` (`domain/geo-search.ts`). `kind=any` consulta as DUAS fontes do Mapbox numa chamada só da API;
 *  - cache das respostas do Mapbox: DESLIGADO por padrão (`GEO_CACHE_TTL_SECONDS=0`, termos do Mapbox para resultado
 *    temporário); ligado por configuração, guarda por (fonte, texto, proximidade, caixa). Área, categorias e pontos próprios
 *    (dado nosso, do banco) ficam 60 s. Erro nunca fica guardado;
 *  - uma fonte do Mapbox falhou e a outra respondeu: devolve o que veio (com log). As duas falharam: só os pontos próprios,
 *    se algum casou; senão, `geo_unavailable` (com `budgetExhausted` quando foi o teto diário: a rota responde 503, não 502);
 *  - a posição do passageiro (`near`) e o pino só vão ao Mapbox perto da área (`isNearBox`, caixa + margem): fora disso a
 *    posição é ignorada e o pino recebe o rótulo genérico, sem chamada nenhuma (não gasta o teto com coordenada qualquer);
 *  - nada de texto buscado, coordenada ou rótulo em log: só contagens, fonte e motivo da falha.
 */
import type { FastifyBaseLogger } from 'fastify';
import type { ServiceArea } from '../domain/geo-fare-rules.js';
import {
  DEFAULT_PROXIMITY,
  FALLBACK_BBOX,
  insideArea,
  isNearBox,
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
  | GeoUnavailable;

/** `budgetExhausted`: o teto diário do motor (`lib/geo-budget.ts`) parou a chamada — 503, não 502. */
export interface GeoUnavailable {
  readonly kind: 'geo_unavailable';
  readonly budgetExhausted: boolean;
}

export type ReverseOutcome = { readonly kind: 'ok'; readonly label: string; readonly inServiceArea: boolean } | GeoUnavailable;

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

const isBudgetExhausted = (err: unknown): boolean => err instanceof GeoProviderError && err.reason === 'budget_exhausted';

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
    if (!provider) return { kind: 'geo_unavailable', budgetExhausted: false };

    const [area, curated] = await Promise.all([serviceArea(), curatedPlaces()]);
    const bbox = area ? area.bbox : FALLBACK_BBOX;
    // A posição do passageiro só desempata: vai ao Mapbox (e à chave do cache) arredondada a ~1 km, e só se estiver perto da área.
    const near = query.near && isNearBox(query.near, bbox) ? query.near : undefined;
    const proximity = roundNear(near ?? DEFAULT_PROXIMITY);
    const engines: ForwardEngine[] = query.kind === 'address' ? ['geocoding'] : query.kind === 'place' ? ['searchbox'] : ['geocoding', 'searchbox'];

    const settled = await Promise.allSettled(
      engines.map((engine) =>
        forwardCache.get(`${engine}|${query.q}|${proximity.lat},${proximity.lng}|${bbox.join(',')}`, () => provider.forward(engine, { q: query.q, proximity, bbox })),
      ),
    );
    const byEngine: Record<ForwardEngine, GeoSearchResult[]> = { geocoding: [], searchbox: [] };
    const failedEngines: ForwardEngine[] = [];
    let cacheHits = 0;
    let budgetHit = false;
    settled.forEach((outcome, index) => {
      const engine = engines[index]!;
      if (outcome.status === 'fulfilled') {
        byEngine[engine] = outcome.value.value;
        if (outcome.value.hit) cacheHits += 1;
      } else {
        failedEngines.push(engine);
        if (isBudgetExhausted(outcome.reason)) budgetHit = true; // o evento geo_budget_exhausted já saiu (uma vez por dia)
        else deps.log.warn({ event: 'geo_provider_failed', engine, ...engineFailureForLog(outcome.reason) });
      }
    });

    const results = rankSearchResults({ q: query.q, kind: query.kind, curated, geocoding: byEngine.geocoding, searchbox: byEngine.searchbox, ...(near ? { near } : {}) });
    if (failedEngines.length === engines.length && !results.some((result) => result.source === 'curated')) return { kind: 'geo_unavailable', budgetExhausted: budgetHit };
    return { kind: 'ok', results, cacheHits, failedEngines };
  }

  async function reverse(point: LatLng): Promise<ReverseOutcome> {
    const provider = deps.provider;
    if (!provider) return { kind: 'geo_unavailable', budgetExhausted: false };
    const area = await serviceArea();
    // Longe da área (caixa + margem): rótulo genérico, sem chamar o Mapbox. Fora da área não é erro (contrato K0).
    if (!isNearBox(point, area ? area.bbox : FALLBACK_BBOX)) return { kind: 'ok', label: UNNAMED_PIN_LABEL, inServiceArea: false };
    // O nome vem do ponto arredondado a ~11 m (privacidade e cache); a coordenada devolvida é a do pino, sem mexer.
    const rounded = { lat: Math.round(point.lat * 10_000) / 10_000, lng: Math.round(point.lng * 10_000) / 10_000 };
    try {
      const { value } = await reverseCache.get(`${rounded.lat},${rounded.lng}`, () => provider.reverse(rounded));
      return { kind: 'ok', label: value.label ?? UNNAMED_PIN_LABEL, inServiceArea: insideArea(point, area) };
    } catch (err) {
      if (isBudgetExhausted(err)) return { kind: 'geo_unavailable', budgetExhausted: true };
      deps.log.warn({ event: 'geo_provider_failed', engine: 'reverse', ...engineFailureForLog(err) });
      return { kind: 'geo_unavailable', budgetExhausted: false };
    }
  }

  return {
    search,
    reverse,
    serviceArea,
    categories: async () => (await categoriesCache.get('enabled', () => loadEnabledCategories(deps.db))).value,
  };
}
