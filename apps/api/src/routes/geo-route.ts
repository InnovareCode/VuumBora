/**
 * Rotas de geografia e cotação do PASSAGEIRO (M4, fatias G3 e G4 do `docs/plano-m3-m4.md` §3), com token de conta:
 *
 *   GET  /v1/geo/search?q&kind&near   busca: pontos próprios + Geocoding v6 + Search Box   → { results: GeoSearchResult[] }
 *   GET  /v1/geo/reverse?lat&lng      nome do ponto do pino                                → { label, lat, lng, inServiceArea }
 *   GET  /v1/service-area             área ativa (polígono GeoJSON [lng, lat] + bbox)     → ServiceArea
 *   GET  /v1/categories               só as categorias LIGADAS                             → RideCategory[]
 *   POST /v1/quotes                   rota no servidor, preço fechado, assinado, 5 min     → { route, quotes }
 *   GET  /v1/quotes/:id               a cotação, se não venceu                             → FareQuote
 *
 * Contrato do app: `packages/api-client/src/passenger/geo-types.ts` (`GeoPort`, `FareQuotePort`, catálogo
 * `GEO_QUOTE_ERRORS`); o adaptador http traduz estes erros com `apiErrorFromServerReply`.
 *
 * Quem pode: busca, pino, área e categorias aceitam conta de passageiro e de motorista (o app do motorista também mostra
 * mapa); cotar e ler cotação, só passageiro (`403 not_passenger_account`).
 *
 * Sem `MAPBOX_SERVER_TOKEN`: busca, pino e cotação respondem `503 geo_unavailable` (área, categorias e leitura de cotação
 * seguem). Falha do Mapbox com token: `502 geo_unavailable` (busca, pino) ou `502 route_unavailable` (cotação). As duas
 * famílias são `unavailable` no app.
 *
 * Limites: por IP em cada rota (`GEO_ROUTES_RATE_LIMIT_MAX`/min, antes da autenticação, que consulta o banco) e POR CONTA
 * dentro da rota, por minuto E por dia (busca, pino e cotação: `GEO_SEARCH_PER_*`, `GEO_REVERSE_PER_*`, `QUOTES_PER_*`) → 429
 * `rate_limited` com `Retry-After`. `kind=any` é UMA chamada (conta uma vez no limite). Acima de tudo, o teto DIÁRIO GLOBAL por
 * motor do Mapbox (`lib/geo-budget.ts`): esgotado, 503 `geo_unavailable` e o evento `geo_budget_exhausted` no log.
 *
 * Aceite pendente (M-3): nada aqui cria compromisso (o compromisso é o pedido da corrida, M5): exceções declaradas em
 * `test/consent-gate-coverage.test.ts`.
 *
 * Dado pessoal: o texto buscado e as coordenadas vêm na querystring (o log só leva o caminho, `app.ts`) ou no corpo, e
 * nenhum log daqui leva texto, coordenada ou rótulo — só contagens, fonte e motivo de falha. Busca, pino e cotação
 * respondem `Cache-Control: no-store`; área e categorias, `private, max-age=60`.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../db.js';
import { parseReverseQuery, parseSearchQuery } from '../domain/geo-search.js';
import { isQuoteId, parseQuoteBody } from '../domain/quote-input.js';
import { makeRequireAccount } from '../hooks/require-account.js';
import { requirePassengerAccount } from '../hooks/require-passenger-account.js';
import { AccountRateLimiter } from '../lib/account-rate-limit.js';
import { GeoDailyBudget, withDailyBudget } from '../lib/geo-budget.js';
import { authConfigProblems, loadAuthConfig } from '../lib/auth-config.js';
import type { GeoConfig } from '../lib/geo-config.js';
import { rateLimitKey } from '../lib/ip-bucket.js';
import type { GeoProvider } from '../lib/mapbox.js';
import { describeErrorForLog } from '../lib/safe-error.js';
import { createGeoService } from '../services/geo-service.js';
import { createQuoteService } from '../services/quote-service.js';

/** Código → (status, mensagem pt-BR). As mesmas mensagens de `GEO_QUOTE_ERRORS` (o teste confere status e código). */
const ERRORS = {
  invalid_body: [400, 'Dados inválidos.'],
  not_passenger_account: [403, 'Esta conta não é de passageiro.'],
  not_found: [404, 'Cotação não encontrada.'],
  quote_expired: [409, 'O preço venceu. Calcule de novo.'],
  outside_service_area: [422, 'Ainda não atendemos este trajeto.'],
  route_too_short: [422, 'O destino está muito perto da origem.'],
  rate_limited: [429, 'Muitas buscas seguidas. Aguarde um pouco.'],
  route_unavailable: [502, 'Não conseguimos calcular a rota agora.'],
  geo_unavailable: [502, 'Não conseguimos buscar endereços agora.'],
  fare_not_configured: [503, 'As corridas ainda não estão disponíveis.'],
  unavailable: [503, 'Serviço indisponível no momento.'],
} as const satisfies Record<string, readonly [number, string]>;

export type GeoErrorCode = keyof typeof ERRORS;

/** O catálogo do servidor, para o teste conferir contra o do `api-client`. */
export const GEO_ROUTE_ERRORS: Readonly<Record<GeoErrorCode, { readonly status: number; readonly message: string }>> = Object.fromEntries(
  Object.entries(ERRORS).map(([code, [status, message]]) => [code, { status, message }]),
) as Record<GeoErrorCode, { readonly status: number; readonly message: string }>;

/**
 * `geo_unavailable` sem token configurado ou com o teto diário esgotado: a recusa é da casa (503), não falha do Mapbox (502).
 * O `code` é o mesmo.
 */
const GEO_NOT_CONFIGURED_STATUS = 503;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Failure { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }
interface Success<T> { readonly ok: true; readonly data: T }

function refuse(request: FastifyRequest, reply: FastifyReply, event: string, code: GeoErrorCode, status: number = ERRORS[code][0]): Failure {
  request.log.info({ event, reason: code });
  reply.code(status);
  return { ok: false, error: { code, message: ERRORS[code][1] } };
}

function ok<T>(reply: FastifyReply, data: T): Success<T> {
  reply.code(200);
  return { ok: true, data };
}

function internalFailure(request: FastifyRequest, reply: FastifyReply, err: unknown, event: string): Failure {
  request.log.error({ event, ...describeErrorForLog(err) });
  reply.code(503);
  return { ok: false, error: { code: 'unavailable', message: ERRORS.unavailable[1] } };
}

/** Configuração e porta do Mapbox já montadas (`app.ts` lê do ambiente; os testes injetam respostas gravadas). */
export interface GeoSetup {
  readonly config: GeoConfig;
  /** `null` = sem `MAPBOX_SERVER_TOKEN`. Esta porta passa pelo teto diário (`withDailyBudget`) aqui dentro. */
  readonly provider: GeoProvider | null;
  /** Só os testes: o relógio do teto diário e das cotas por conta (virar o minuto e o dia sem esperar). */
  readonly now?: () => number;
}

const PRIVATE_PATHS = ['/v1/geo/', '/v1/quotes'];
const CATALOG_PATHS = ['/v1/service-area', '/v1/categories'];

export function registerGeoRoutes(app: FastifyInstance, setup: GeoSetup): void {
  const { config } = setup;
  const budget = new GeoDailyBudget(
    config.dailyBudget,
    (engine, dailyLimit) => app.log.warn({ event: 'geo_budget_exhausted', engine, dailyLimit }),
    setup.now,
  );
  const provider = setup.provider ? withDailyBudget(setup.provider, budget) : null;
  app.addHook('onRequest', (request, reply, done) => {
    const path = request.url.split('?')[0] ?? '';
    if (PRIVATE_PATHS.some((prefix) => path.startsWith(prefix))) reply.header('Cache-Control', 'no-store');
    else if (CATALOG_PATHS.includes(path)) reply.header('Cache-Control', 'private, max-age=60');
    done();
  });

  const limit = () => ({ config: { rateLimit: { max: config.routesIpRateLimitMax, timeWindow: '1 minute', keyGenerator: rateLimitKey } } });

  const authConfig = loadAuthConfig();
  if (!authConfig) {
    app.log.error({ event: 'geo_routes_unavailable', reason: 'auth_config_missing_weak_or_invalid', reasons: authConfigProblems() });
    const down = async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.code(503);
      return { ok: false, error: { code: 'unavailable', message: ERRORS.unavailable[1] } };
    };
    for (const url of ['/v1/geo/search', '/v1/geo/reverse', '/v1/service-area', '/v1/categories', '/v1/quotes/:id']) app.get(url, limit(), down);
    app.post('/v1/quotes', limit(), down);
    return;
  }

  const requireAccount = makeRequireAccount(authConfig);
  const anyAccount = { preHandler: [requireAccount] };
  const passengerOnly = { preHandler: [requireAccount, requirePassengerAccount] };
  const geo = createGeoService({ db: pool, provider, config, log: app.log });
  const quotes = createQuoteService({ pool, provider, config, geo, log: app.log });
  // Por conta: minuto (rajada) e dia (cota). A janela do dia é de 24 h a partir da primeira chamada.
  const clock = setup.now ?? Date.now;
  const windows = (perMinute: number, perDay: number) => [new AccountRateLimiter(perMinute, 60_000, clock), new AccountRateLimiter(perDay, DAY_MS, clock)];
  const searchLimiters = windows(config.searchPerMinute, config.searchPerDay);
  const reverseLimiters = windows(config.reversePerMinute, config.reversePerDay);
  const quoteLimiters = windows(config.quotesPerMinute, config.quotesPerDay);

  /** Confere TODAS as janelas da conta e só então consome uma chamada em cada; recusada = 429 com `Retry-After`. */
  function overLimit(request: FastifyRequest, reply: FastifyReply, limiters: readonly AccountRateLimiter[], event: string): Failure | null {
    const accountId = request.authAccount!.accountId;
    for (const limiter of limiters) {
      const checked = limiter.check(accountId);
      if (!checked.allowed) {
        reply.header('Retry-After', String(checked.retryAfterSeconds));
        return refuse(request, reply, event, 'rate_limited');
      }
    }
    for (const limiter of limiters) limiter.take(accountId);
    return null;
  }

  app.get('/v1/geo/search', { ...limit(), ...anyAccount }, async (request, reply) => {
    const query = parseSearchQuery(request.query);
    if (!query) return refuse(request, reply, 'geo_search_refused', 'invalid_body');
    if (!provider) return refuse(request, reply, 'geo_search_refused', 'geo_unavailable', GEO_NOT_CONFIGURED_STATUS);
    const limited = overLimit(request, reply, searchLimiters, 'geo_search_refused');
    if (limited) return limited;
    try {
      const startedAt = Date.now();
      const outcome = await geo.search(query);
      if (outcome.kind === 'geo_unavailable') return refuse(request, reply, 'geo_search_failed', 'geo_unavailable', outcome.budgetExhausted ? GEO_NOT_CONFIGURED_STATUS : ERRORS.geo_unavailable[0]);
      const sources = { curated: 0, geocoding: 0, searchbox: 0 };
      for (const result of outcome.results) sources[result.source] += 1;
      request.log.info({ event: 'geo_search', kind: query.kind, results: outcome.results.length, sources, cacheHits: outcome.cacheHits, failedEngines: outcome.failedEngines, ms: Date.now() - startedAt });
      return ok(reply, { results: outcome.results });
    } catch (err) {
      return internalFailure(request, reply, err, 'geo_search_failed_internal');
    }
  });

  app.get('/v1/geo/reverse', { ...limit(), ...anyAccount }, async (request, reply) => {
    const point = parseReverseQuery(request.query);
    if (!point) return refuse(request, reply, 'geo_reverse_refused', 'invalid_body');
    if (!provider) return refuse(request, reply, 'geo_reverse_refused', 'geo_unavailable', GEO_NOT_CONFIGURED_STATUS);
    const limited = overLimit(request, reply, reverseLimiters, 'geo_reverse_refused');
    if (limited) return limited;
    try {
      const outcome = await geo.reverse(point);
      if (outcome.kind === 'geo_unavailable') return refuse(request, reply, 'geo_reverse_failed', 'geo_unavailable', outcome.budgetExhausted ? GEO_NOT_CONFIGURED_STATUS : ERRORS.geo_unavailable[0]);
      return ok(reply, { label: outcome.label, lat: point.lat, lng: point.lng, inServiceArea: outcome.inServiceArea });
    } catch (err) {
      return internalFailure(request, reply, err, 'geo_reverse_failed_internal');
    }
  });

  app.get('/v1/service-area', { ...limit(), ...anyAccount }, async (request, reply) => {
    try {
      const area = await geo.serviceArea();
      if (!area) {
        request.log.error({ event: 'service_area_missing' });
        return refuse(request, reply, 'service_area_refused', 'unavailable');
      }
      return ok(reply, area);
    } catch (err) {
      return internalFailure(request, reply, err, 'service_area_failed_internal');
    }
  });

  app.get('/v1/categories', { ...limit(), ...anyAccount }, async (request, reply) => {
    try {
      return ok(reply, await geo.categories());
    } catch (err) {
      return internalFailure(request, reply, err, 'categories_failed_internal');
    }
  });

  app.post('/v1/quotes', { ...limit(), ...passengerOnly }, async (request, reply) => {
    const input = parseQuoteBody(request.body);
    if (!input) return refuse(request, reply, 'quote_refused', 'invalid_body');
    const limited = overLimit(request, reply, quoteLimiters, 'quote_refused');
    if (limited) return limited;
    try {
      const outcome = await quotes.createQuotes(request.authAccount!.accountId, input);
      if (outcome.kind === 'geo_unavailable') return refuse(request, reply, 'quote_refused', 'geo_unavailable', GEO_NOT_CONFIGURED_STATUS);
      if (outcome.kind !== 'ok') return refuse(request, reply, 'quote_refused', outcome.kind);
      const first = outcome.quotes[0];
      request.log.info({
        event: 'quotes_issued',
        accountId: request.authAccount!.accountId,
        count: outcome.quotes.length,
        ...(first ? { fareVersionId: first.fareVersionId, isTestFare: first.isTestFare } : {}),
      });
      return ok(reply, { route: outcome.route, quotes: outcome.quotes });
    } catch (err) {
      return internalFailure(request, reply, err, 'quote_failed_internal');
    }
  });

  app.get<{ Params: { id: string } }>('/v1/quotes/:id', { ...limit(), ...passengerOnly }, async (request, reply) => {
    // Id que nem é UUID: 404 igual ao de outra conta (e o `pg` nunca vê um valor inválido para ecoar).
    if (!isQuoteId(request.params.id)) return refuse(request, reply, 'quote_read_refused', 'not_found');
    try {
      const outcome = await quotes.getQuote(request.authAccount!.accountId, request.params.id.toLowerCase());
      if (outcome.kind !== 'ok') return refuse(request, reply, 'quote_read_refused', outcome.kind);
      return ok(reply, outcome.quote);
    } catch (err) {
      return internalFailure(request, reply, err, 'quote_read_failed_internal');
    }
  });
}
