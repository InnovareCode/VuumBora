-- Reverte 0026. Rodar com a credencial DONA do banco, ANTES de 0025_down.sql (se for descer mais).
--
-- APAGA categorias, área de serviço, pontos próprios, TODAS as versões de tarifa (histórico de preço é auditoria
-- financeira) e as cotações. Exportar antes:
--   pg_dump --data-only -t ride_categories -t service_areas -t curated_places -t fare_rule_versions \
--           -t fare_rule_rates -t fare_quotes ...
-- (fare_quotes tem localização de passageiro: o arquivo exportado segue a mesma retenção de 30 dias.)
-- Nenhuma outra tabela perde dado: o gatilho em accounts só sai.
BEGIN;

-- 1) O gatilho em accounts primeiro (ele cita fare_quotes).
DROP TRIGGER IF EXISTS accounts_purge_fare_quotes ON accounts;
DROP FUNCTION IF EXISTS fare_quotes_purge_deleted_account();

-- 2) Cotações, views e tarifa (na ordem das FKs).
DROP FUNCTION IF EXISTS purge_fare_quotes(INTEGER);
DROP TABLE IF EXISTS fare_quotes;
DROP VIEW IF EXISTS current_fare_rules;
DROP VIEW IF EXISTS fare_rule_version_periods;
DROP TABLE IF EXISTS fare_rule_rates;
DROP TABLE IF EXISTS fare_rule_versions;
DROP FUNCTION IF EXISTS current_fare_rule_version(TEXT);

-- 3) Geografia e categorias.
DROP TABLE IF EXISTS curated_places;
DROP TABLE IF EXISTS service_areas;
DROP TABLE IF EXISTS ride_categories;

-- 4) Funções (as dos gatilhos saem depois das tabelas; as do CHECK e da coluna gerada, depois de service_areas).
DROP FUNCTION IF EXISTS fare_quotes_guard();
DROP FUNCTION IF EXISTS fare_rule_rates_guard();
DROP FUNCTION IF EXISTS fare_rule_versions_guard();
DROP FUNCTION IF EXISTS ride_categories_guard();
DROP FUNCTION IF EXISTS curated_places_guard();
DROP FUNCTION IF EXISTS geo_fare_catalog_no_truncate();
DROP FUNCTION IF EXISTS search_terms_are_normalized(TEXT[]);
DROP FUNCTION IF EXISTS geojson_polygon_bbox(JSONB);
DROP FUNCTION IF EXISTS geojson_polygon_is_valid(JSONB);

DELETE FROM schema_migrations WHERE id = '0026_create_geography_and_fares.sql';

COMMIT;
