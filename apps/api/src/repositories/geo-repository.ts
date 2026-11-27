/**
 * Camada de dados de geografia e cotação (M4, fatias G3/G4) sobre as tabelas e views da migração 0026. Só SQL
 * parametrizado; as regras de integridade (versão vigente, categoria ligada, preço mínimo, caixa da área, validade de no
 * máximo 305 s, imutabilidade) estão nos gatilhos da 0026 e são a ÚLTIMA linha de defesa — o serviço confere antes.
 *
 * Privilégio (camada 2 da 0026): o papel `vuumbora_api` só LÊ categorias, áreas, pontos próprios, versões e valores, e só
 * INSERE cotação. Nenhuma consulta aqui atualiza ou apaga nada.
 */
import type { PoolClient } from 'pg';
import { isValidPolygon, type FareRates, type ServiceArea } from '../domain/geo-fare-rules.js';
import type { CuratedPlace } from '../domain/geo-search.js';
import type { Queryable } from './identity-repository.js';

export interface RideCategoryRow {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly seats: number;
}

/** A área ATIVA da cidade, ou `null` (cidade sem área: nada é atendido). Polígono fora da forma LANÇA (defeito do dado). */
export async function loadActiveServiceArea(db: Queryable, cityCode: string): Promise<ServiceArea | null> {
  const result = await db.query<{ id: string; name: string; polygon: unknown; bbox_west: number; bbox_south: number; bbox_east: number; bbox_north: number }>(
    `SELECT id, name, polygon, bbox_west, bbox_south, bbox_east, bbox_north
       FROM service_areas WHERE city_code = $1 AND is_active`,
    [cityCode],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (!isValidPolygon(row.polygon)) throw new Error('service_areas.polygon fora da forma GeoJSON');
  return { areaId: row.id, name: row.name, polygon: row.polygon, bbox: [row.bbox_west, row.bbox_south, row.bbox_east, row.bbox_north] };
}

/** Só as categorias LIGADAS, na ordem da tela (D-08/D-09: as desligadas não aparecem). */
export async function loadEnabledCategories(db: Queryable): Promise<RideCategoryRow[]> {
  const result = await db.query<RideCategoryRow>(
    `SELECT slug, name, description, seats FROM ride_categories WHERE is_enabled ORDER BY sort_order, slug`,
  );
  return result.rows.map((row) => ({ slug: row.slug, name: row.name, description: row.description, seats: Number(row.seats) }));
}

/** Pontos próprios ATIVOS da cidade (N6). */
export async function loadActiveCuratedPlaces(db: Queryable, cityCode: string): Promise<CuratedPlace[]> {
  const result = await db.query<{ code: string; name: string; address: string; lat: number; lng: number; aliases: string[] }>(
    `SELECT code, name, address, lat, lng, aliases FROM curated_places WHERE city_code = $1 AND is_active ORDER BY code`,
    [cityCode],
  );
  return result.rows.map((row) => ({ code: row.code, name: row.name, address: row.address, lat: Number(row.lat), lng: Number(row.lng), aliases: row.aliases }));
}

export interface CategoryRates extends FareRates {
  readonly categorySlug: string;
}

export interface CurrentFare {
  readonly versionId: string;
  readonly isTest: boolean;
  /** Valores das categorias LIGADAS que têm valor na versão, na ordem da tela. */
  readonly rates: readonly CategoryRates[];
}

/**
 * A versão VIGENTE da cidade (`current_fare_rule_version`, a definição única da 0026) e os valores das categorias ligadas,
 * numa consulta só (um retrato). `null` = cidade sem tarifa publicada.
 */
export async function loadCurrentFare(db: Queryable, cityCode: string): Promise<CurrentFare | null> {
  const result = await db.query<{
    version_id: string; is_test: boolean; category_slug: string | null;
    base_cents: number | null; per_km_cents: number | null; per_minute_cents: number | null; minimum_fare_cents: number | null;
  }>(
    `SELECT v.id AS version_id, v.is_test, c.slug AS category_slug,
            r.base_cents, r.per_km_cents, r.per_minute_cents, r.minimum_fare_cents
       FROM fare_rule_versions v
       LEFT JOIN fare_rule_rates r ON r.version_id = v.id
       LEFT JOIN ride_categories c ON c.slug = r.category_slug AND c.is_enabled
      WHERE v.id = current_fare_rule_version($1)
      ORDER BY c.sort_order NULLS LAST, c.slug`,
    [cityCode],
  );
  const first = result.rows[0];
  if (!first) return null;
  const rates: CategoryRates[] = [];
  for (const row of result.rows) {
    if (row.category_slug === null || row.base_cents === null || row.per_km_cents === null || row.per_minute_cents === null || row.minimum_fare_cents === null) continue;
    rates.push({
      categorySlug: row.category_slug,
      baseCents: Number(row.base_cents),
      perKmCents: Number(row.per_km_cents),
      perMinuteCents: Number(row.per_minute_cents),
      minimumFareCents: Number(row.minimum_fare_cents),
    });
  }
  return { versionId: first.version_id, isTest: first.is_test, rates };
}

/** O relógio do BANCO: a validade da cotação é contada nele, o mesmo do CHECK `fare_quotes_ttl` e da leitura. */
export async function databaseNow(db: Queryable): Promise<Date> {
  const result = await db.query<{ now: Date }>(`SELECT clock_timestamp() AS now`);
  return result.rows[0]!.now;
}

export interface QuoteRow {
  readonly id: string;
  readonly accountId: string;
  readonly fareVersionId: string;
  readonly categorySlug: string;
  readonly originLat: number;
  readonly originLng: number;
  readonly originLabel: string;
  readonly destinationLat: number;
  readonly destinationLng: number;
  readonly destinationLabel: string;
  readonly distanceM: number;
  readonly durationS: number;
  readonly dynamicMultiplier: number;
  readonly priceCents: number;
  readonly signature: string;
  readonly expiresAt: Date;
}

/** Grava as cotações (uma por categoria) na transação de quem chama. `created_at` é posto pelo gatilho (relógio do banco). */
export async function insertQuotes(client: PoolClient, rows: readonly QuoteRow[]): Promise<void> {
  for (const row of rows) {
    await client.query(
      `INSERT INTO fare_quotes (id, account_id, fare_version_id, category_slug, origin_lat, origin_lng, origin_label,
                                destination_lat, destination_lng, destination_label, distance_m, duration_s,
                                dynamic_multiplier, price_cents, signature, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        row.id, row.accountId, row.fareVersionId, row.categorySlug, row.originLat, row.originLng, row.originLabel,
        row.destinationLat, row.destinationLng, row.destinationLabel, row.distanceM, row.durationS,
        row.dynamicMultiplier.toFixed(2), row.priceCents, row.signature, row.expiresAt.toISOString(),
      ],
    );
  }
}

export interface StoredQuote {
  readonly id: string;
  readonly categorySlug: string;
  readonly priceCents: number;
  readonly fareVersionId: string;
  readonly isTest: boolean;
  readonly expiresAt: Date;
  readonly signature: string;
  /** Relógio do banco no momento da leitura (decide se venceu). */
  readonly databaseNow: Date;
}

/** A cotação DESTA conta (de outra conta = `null`, igual a inexistente). */
export async function findQuote(db: Queryable, quoteId: string, accountId: string): Promise<StoredQuote | null> {
  const result = await db.query<{
    id: string; category_slug: string; price_cents: number; fare_version_id: string; is_test: boolean; expires_at: Date; signature: string; now: Date;
  }>(
    `SELECT q.id, q.category_slug, q.price_cents, q.fare_version_id, v.is_test, q.expires_at, q.signature, clock_timestamp() AS now
       FROM fare_quotes q JOIN fare_rule_versions v ON v.id = q.fare_version_id
      WHERE q.id = $1 AND q.account_id = $2`,
    [quoteId, accountId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    categorySlug: row.category_slug,
    priceCents: Number(row.price_cents),
    fareVersionId: row.fare_version_id,
    isTest: row.is_test,
    expiresAt: row.expires_at,
    signature: row.signature,
    databaseNow: row.now,
  };
}
