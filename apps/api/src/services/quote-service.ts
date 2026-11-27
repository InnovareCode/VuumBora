/**
 * ===================================================================================================================
 * PARA QUEM FIZER O `POST /v1/trips` (M5), que CONSOME a cotação — checklist da revisão de segurança da G2-G4:
 *   1. Buscar a cotação por (id, account_id) da sessão: de outra conta é igual a inexistente (404, sem distinguir).
 *   2. Validade pelo relógio do BANCO (`clock_timestamp() >= expires_at` = vencida, 409 `quote_expired`), como o GET daqui.
 *   3. Uso ÚNICO: a corrida grava o `quote_id` com restrição única; a segunda tentativa com a mesma cotação é recusada.
 *   4. Recomputar o HMAC (`signQuote`, `lib/quote-signature.ts`) sobre os campos GRAVADOS (id, categoria, preço, versão,
 *      validade), com o segredo atual e o anterior (troca de segredo durante a validade), e comparar em tempo constante com o
 *      que o app devolveu; não basta comparar com a assinatura gravada.
 *   5. Recusar cotação de tarifa de TESTE (`is_test`) quando `ALLOW_TEST_FARES` estiver desligada (produção), mesmo que ela
 *      tenha sido emitida: a trava daqui (N8) não pode ser a única.
 * ===================================================================================================================
 *
 * Cotação do passageiro (M4, fatia G4; N8 e N9 do `docs/plano-m3-m4.md`; D-06 do dono: preço fechado).
 *
 * `POST /v1/quotes`, na ordem do contrato K0 (`FareQuotePort.createQuotes`):
 *   400 (a rota) → 503 `fare_not_configured` (sem tarifa vigente, ou só a de TESTE com `ALLOW_TEST_FARES` desligada, N8)
 *   → 503 `geo_unavailable` (sem token do Mapbox) → 422 `outside_service_area` (origem ou destino, polígono da área ativa)
 *   → 503 `geo_unavailable` (teto diário da Directions, `lib/geo-budget.ts`) → 502 `route_unavailable` (Directions falhou ou
 *   não achou rota) → 422 `route_too_short` (< 300 m).
 *
 * Preço: `computeFare` (G2) sobre a distância e a duração da Directions ARREDONDADAS À VISTA para metro e segundo inteiros —
 * os mesmos inteiros gravados em `fare_quotes`, com os quais a auditoria refaz a conta e chega no mesmo centavo. Dinâmica 1
 * (não há dinâmica no M4).
 *
 * Validade: 5 min no relógio do BANCO (o mesmo do CHECK `fare_quotes_ttl` e da leitura). A Directions roda FORA de
 * transação (o pool tem 5 conexões; nenhuma fica presa esperando o Mapbox); a gravação de todas as categorias é UMA
 * transação. Publicar tarifa (ou desligar categoria) entre a leitura e a gravação faz o gatilho recusar
 * (`fare_quotes_version_current`/`fare_quotes_category_enabled`): a cotação é refeita UMA vez com a tarifa nova, sem chamar
 * a Directions de novo. Cotação emitida nunca muda (o gatilho recusa UPDATE): versão nova não mexe em preço já dado.
 *
 * Não é idempotente de propósito: cada chamada emite cotações novas (com id e validade próprios). O limite por conta segura a
 * repetição; o efeito que precisa ser único é o pedido da corrida (M5), que consome UMA cotação.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { Pool } from 'pg';
import { computeFare, isFareVersionQuotable, isPointInServiceArea, MIN_ROUTE_DISTANCE_M, QUOTE_TTL_SECONDS } from '../domain/geo-fare-rules.js';
import type { LatLng } from '../domain/geo-search.js';
import type { GeoConfig } from '../lib/geo-config.js';
import { GeoProviderError, type GeoProvider } from '../lib/mapbox.js';
import { signQuote } from '../lib/quote-signature.js';
import { databaseNow, findQuote, insertQuotes, loadCurrentFare, type CurrentFare, type QuoteRow } from '../repositories/geo-repository.js';
import { GEO_CITY_CODE, type GeoService } from './geo-service.js';

/** Limites do CHECK `fare_quotes_route_range` da 0026: rota maior é resposta estranha da Directions. */
const MAX_ROUTE_DISTANCE_M = 500_000;
const MAX_ROUTE_DURATION_S = 86_400;
/** Gatilhos que dizem "a tarifa ou a categoria mudou no meio da cotação": refaz uma vez. */
const RETRYABLE_CONSTRAINTS = new Set(['fare_quotes_version_current', 'fare_quotes_category_enabled']);

export interface QuotePointInput extends LatLng {
  readonly label: string;
}

export interface CreateQuotesInput {
  readonly origin: QuotePointInput;
  readonly destination: QuotePointInput;
  /** Só estas categorias. Desconhecida ou desligada é ignorada; sem nenhuma restante, `quotes: []`. */
  readonly categorySlugs?: readonly string[];
}

export interface IssuedQuote {
  readonly quoteId: string;
  readonly categorySlug: string;
  readonly priceCents: number;
  readonly currency: 'BRL';
  readonly fareVersionId: string;
  readonly isTestFare: boolean;
  readonly expiresAt: string;
  readonly signature: string;
}

export interface QuotedRoute {
  readonly distanceM: number;
  readonly durationS: number;
  readonly polyline: string;
}

export type CreateQuotesOutcome =
  | { readonly kind: 'ok'; readonly route: QuotedRoute; readonly quotes: readonly IssuedQuote[] }
  | { readonly kind: 'fare_not_configured' | 'geo_unavailable' | 'outside_service_area' | 'route_unavailable' | 'route_too_short' | 'unavailable' };

export type GetQuoteOutcome = { readonly kind: 'ok'; readonly quote: IssuedQuote } | { readonly kind: 'not_found' | 'quote_expired' };

export interface QuoteServiceDeps {
  readonly pool: Pool;
  readonly provider: GeoProvider | null;
  readonly config: GeoConfig;
  readonly geo: GeoService;
  readonly log: FastifyBaseLogger;
}

export interface QuoteService {
  createQuotes(accountId: string, input: CreateQuotesInput): Promise<CreateQuotesOutcome>;
  getQuote(accountId: string, quoteId: string): Promise<GetQuoteOutcome>;
}

interface PgError { code?: string; constraint?: string }

function isRetryableRace(err: unknown): boolean {
  const pg = typeof err === 'object' && err !== null ? (err as PgError) : {};
  return pg.code === '23514' && pg.constraint !== undefined && RETRYABLE_CONSTRAINTS.has(pg.constraint);
}

export function createQuoteService(deps: QuoteServiceDeps): QuoteService {
  const quotable = (fare: CurrentFare | null): fare is CurrentFare => fare !== null && isFareVersionQuotable(fare, { allowTestFares: deps.config.allowTestFares });

  /** Grava as cotações de `fare` numa transação. Devolve as emitidas (lista vazia se nenhuma categoria sobrou). */
  async function issue(accountId: string, input: CreateQuotesInput, fare: CurrentFare, route: QuotedRoute, secret: string): Promise<IssuedQuote[]> {
    const wanted = input.categorySlugs ? new Set(input.categorySlugs) : undefined;
    const rates = fare.rates.filter((rate) => !wanted || wanted.has(rate.categorySlug));
    if (rates.length === 0) return [];

    const client = await deps.pool.connect();
    try {
      await client.query('BEGIN');
      const expiresAt = new Date((await databaseNow(client)).getTime() + QUOTE_TTL_SECONDS * 1000);
      const expiresAtIso = expiresAt.toISOString();
      const issued: IssuedQuote[] = [];
      const rows: QuoteRow[] = [];
      for (const rate of rates) {
        const fareResult = computeFare(rate, { distanceM: route.distanceM, durationS: route.durationS });
        const quoteId = randomUUID();
        const signature = signQuote(secret, { quoteId, categorySlug: rate.categorySlug, priceCents: fareResult.totalCents, fareVersionId: fare.versionId, expiresAt: expiresAtIso });
        rows.push({
          id: quoteId,
          accountId,
          fareVersionId: fare.versionId,
          categorySlug: rate.categorySlug,
          originLat: input.origin.lat,
          originLng: input.origin.lng,
          originLabel: input.origin.label,
          destinationLat: input.destination.lat,
          destinationLng: input.destination.lng,
          destinationLabel: input.destination.label,
          distanceM: route.distanceM,
          durationS: route.durationS,
          dynamicMultiplier: fareResult.dynamicMultiplier,
          priceCents: fareResult.totalCents,
          signature,
          expiresAt,
        });
        issued.push({
          quoteId,
          categorySlug: rate.categorySlug,
          priceCents: fareResult.totalCents,
          currency: 'BRL',
          fareVersionId: fare.versionId,
          isTestFare: fare.isTest,
          expiresAt: expiresAtIso,
          signature,
        });
      }
      await insertQuotes(client, rows);
      await client.query('COMMIT');
      return issued;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async function createQuotes(accountId: string, input: CreateQuotesInput): Promise<CreateQuotesOutcome> {
    let fare = await loadCurrentFare(deps.pool, GEO_CITY_CODE);
    if (!quotable(fare)) return { kind: 'fare_not_configured' };
    const provider = deps.provider;
    if (!provider) return { kind: 'geo_unavailable' };
    const secret = deps.config.quoteSigningSecret;
    if (!secret) {
      deps.log.error({ event: 'quote_signing_secret_missing' });
      return { kind: 'unavailable' };
    }

    const area = await deps.geo.serviceArea();
    if (!area || !isPointInServiceArea(input.origin, area) || !isPointInServiceArea(input.destination, area)) return { kind: 'outside_service_area' };

    let route: QuotedRoute;
    try {
      const raw = await provider.directions(input.origin, input.destination);
      route = { distanceM: Math.round(raw.distanceM), durationS: Math.max(1, Math.round(raw.durationS)), polyline: raw.polyline };
    } catch (err) {
      if (!(err instanceof GeoProviderError)) throw err;
      if (err.reason === 'budget_exhausted') return { kind: 'geo_unavailable' }; // o evento do teto já saiu, uma vez por dia
      deps.log.warn({ event: 'geo_provider_failed', engine: 'directions', reason: err.reason, ...(err.status !== undefined ? { status: err.status } : {}) });
      return { kind: 'route_unavailable' };
    }
    if (route.distanceM > MAX_ROUTE_DISTANCE_M || route.durationS > MAX_ROUTE_DURATION_S) return { kind: 'route_unavailable' };
    if (route.distanceM < MIN_ROUTE_DISTANCE_M) return { kind: 'route_too_short' };

    for (let attempt = 1; ; attempt++) {
      try {
        const quotes = await issue(accountId, input, fare, route, secret);
        return { kind: 'ok', route, quotes };
      } catch (err) {
        if (!isRetryableRace(err) || attempt >= 2) throw err;
        deps.log.info({ event: 'quote_fare_changed_retry', constraint: (err as PgError).constraint });
        fare = await loadCurrentFare(deps.pool, GEO_CITY_CODE);
        if (!quotable(fare)) return { kind: 'fare_not_configured' };
      }
    }
  }

  async function getQuote(accountId: string, quoteId: string): Promise<GetQuoteOutcome> {
    const stored = await findQuote(deps.pool, quoteId, accountId);
    if (!stored) return { kind: 'not_found' };
    // O instante da validade já é vencido (`now >= expiresAt`), no relógio do banco — a mesma regra de `isQuoteExpired`.
    if (stored.databaseNow.getTime() >= stored.expiresAt.getTime()) return { kind: 'quote_expired' };
    return {
      kind: 'ok',
      quote: {
        quoteId: stored.id,
        categorySlug: stored.categorySlug,
        priceCents: stored.priceCents,
        currency: 'BRL',
        fareVersionId: stored.fareVersionId,
        isTestFare: stored.isTest,
        expiresAt: stored.expiresAt.toISOString(),
        signature: stored.signature,
      },
    };
  }

  return { createQuotes, getQuote };
}
