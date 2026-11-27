-- Geografia e preço (fatia G1 de docs/plano-m3-m4.md, decisões N6-N9 e §3; decisões D-06, D-08/D-09 e 7 do dono).
--
-- O que nasce aqui:
--   ride_categories             as 5 categorias do lançamento (decisão 13); Motorista mulher, Pet e Entrega DESLIGADAS (D-08/D-09).
--   service_areas               a área atendida por cidade: polígono GeoJSON em jsonb + caixa delimitadora (N7, sem PostGIS).
--   curated_places              pontos próprios (N6): ~20 lugares mais procurados da Grande Natal, sempre primeiro na busca.
--   fare_rule_versions          a tabela de tarifa VERSIONADA, por cidade, com is_test (N8). Rascunho -> publicada -> imutável.
--   fare_rule_rates             os valores de cada categoria numa versão (centavos; os componentes de FareRates do domínio).
--   fare_rule_version_periods   view: toda versão publicada com valid_from e valid_to (o contrato FareTableVersion).
--   current_fare_rules          view: os valores da versão VIGENTE de cada cidade (a que cota agora).
--   current_fare_rule_version() a ÚNICA definição de "versão vigente da cidade" (gatilhos e API).
--   fare_quotes                 cotação emitida: preço fechado e assinado (N9, D-06), vale 5 min, purga em 30 dias.
--   purge_fare_quotes()         a purga de 30 dias (lotes; quem agenda é o operador ou o job da API).
--
-- ---------- Decisões ----------
--
-- TARIFA VERSIONADA (N8). Mesmo desenho da lista de documentos (0024): a versão nasce RASCUNHO (valid_from NULL), os
-- valores entram enquanto ela é rascunho e publicar é `UPDATE fare_rule_versions SET valid_from = now()` (o gatilho põe o
-- relógio do banco, sob trava). Publicada = imutável, vigente OU fechada, até para o dono (o gatilho recusa UPDATE e DELETE
-- com 42501): preço errado se corrige publicando a seguinte. "Fechar a anterior" não é UPDATE: valid_to é DERIVADO
-- (valid_from da versão seguinte, view fare_rule_version_periods), como a vigente da 0021 e da 0024. Assim a versão
-- fechada nunca é tocada e há no máximo uma vigente por cidade, por construção. O POST /v1/admin/fare-tables faz, numa
-- transação: INSERT da versão (created_by = o dono logado, idempotency_key = o cabeçalho) -> INSERT dos valores ->
-- UPDATE ... SET valid_from = now(). A mesma chave do mesmo dono bate no índice único (23505): a API relê a versão.
--   Regras da publicação (23514, com o nome da regra em err.constraint):
--     fare_rule_versions_has_rates                 ao menos uma categoria com valor;
--     fare_rule_versions_covers_enabled_categories toda categoria LIGADA tem valor (senão ela some da cotação);
--     fare_rule_versions_no_test_after_real        depois da primeira tarifa REAL da cidade, nenhuma de teste é publicada
--                                                  (em produção ela derrubaria toda cotação com 503, N8);
--     fare_rule_versions_valid_from_monotonic      a publicação é posterior à vigente (relógio do banco voltou?).
--   Autor: só `dono` ativo cria versão (42501 fare_rule_versions_author_role; FARE_ADMIN_ROLES do contrato K0), e tarifa
--   REAL sempre tem autor (CHECK fare_rule_versions_real_has_author). A versão de TESTE semeada aqui não tem autor.
--
-- TARIFA DE TESTE SEMEADA. Uma versão is_test = true, publicada, com VuumBora e Conforto (os mesmos números do mock do
-- K0, packages/api-client/src/geo/mock-data.ts). NÃO é proposta de preço (decisão 7 em aberto): em produção, com
-- ALLOW_TEST_FARES desligada, ela não cota (503 fare_not_configured, N8). A tarifa real do dono a substitui ao publicar.
--
-- CATEGORIA LIGADA TEM PREÇO. Ligar uma categoria (is_enabled -> true, operador) exige valor dela na versão vigente de
-- toda cidade que já tem tarifa (23514 ride_categories_enabled_has_fare): primeiro publica a versão com o valor, depois
-- liga. Publicação e liga/desliga entram uma de cada vez (mesma trava consultiva).
--
-- ÁREA SEM POSTGIS (N7). service_areas.polygon é um `Polygon` GeoJSON (RFC 7946: [longitude, latitude]); o CHECK
-- service_areas_polygon_valid espelha assertValidPolygon de packages/domain/src/service-area.ts (anéis fechados, >= 4
-- posições, coordenadas no intervalo) e as colunas bbox_* são GERADAS do contorno: não divergem do polígono nem com
-- gatilho desligado ou restauração. "O ponto está dentro?" continua sendo a função pura do domínio
-- (isPointInServiceArea); o banco só confere a CAIXA (barata) onde grava coordenada: cotação e ponto próprio. Isso pega
-- latitude e longitude trocadas e erro de digitação; o polígono fino é da API. Uma área ativa por cidade (índice único
-- parcial). O polígono semeado é PROVISÓRIO (provisional = true): desenho da equipe para "Natal e região metropolitana"
-- (decisão 16 do dono) cobrindo Natal, Parnamirim, São Gonçalo do Amarante (aeroporto), Macaíba e Extremoz.
--
-- PONTOS PRÓPRIOS (N6). code estável (o id da busca), nome, endereço curto (o sublabel), categoria, coordenada e
-- `aliases` (termos de busca JÁ NORMALIZADOS: minúsculas, sem acento, palavras separadas por um espaço; a API normaliza a
-- consulta do mesmo jeito). A coordenada tem de cair na caixa da área ativa da cidade (23514
-- curated_places_inside_service_area). Semente PROVISÓRIA: nomes da amostra da F10 (docs/area-de-servico-natal.md),
-- coordenadas ESTIMADAS pela equipe, não conferidas no mapa (provisional = true); conferir antes do beta.
--
-- COTAÇÃO (N9, D-06). Uma linha por categoria cotada. Preço fechado: a linha é imutável (42501 em UPDATE, até para o
-- dono). Assinatura HMAC da API guardada (sobrevive à troca do segredo durante a validade; o formato fica com a API:
-- 32 a 128 caracteres base64url ou hex). Regras no gatilho (23514):
--     fare_quotes_passenger_account       a conta é de passageiro e está ativa;
--     fare_quotes_version_current         a versão é a VIGENTE da cidade (publicar no meio da cotação = recalcular);
--     fare_quotes_category_enabled        a categoria está ligada;
--     fare_quotes_price_at_least_minimum  o preço não fica abaixo do mínimo da categoria na versão;
--     fare_quotes_inside_service_area     origem e destino dentro da caixa da área ativa.
--   A categoria tem valor na versão por FK composta (fare_version_id, category_slug) -> fare_rule_rates.
--   Relógio: created_at é o do banco (clock_timestamp, o valor enviado é descartado) e expires_at vem da API, que assina
--   com ele: CHECK fare_quotes_ttl exige 0 < expires_at - created_at <= 300 s + 5 s de folga para o relógio do app.
--   O banco nunca guarda preço eterno.
--
-- DADO PESSOAL. A cotação guarda origem e destino (com o texto que o passageiro confirmou): localização. Fica 30 dias
-- (purge_fare_quotes, plano-sistema-dados.md §2) e sai NA HORA quando a conta é excluída (gatilho em accounts: qualquer
-- caminho que leve a conta a 'deleted' apaga as cotações dela). Rota (polilinha) não é guardada.
--
-- PRIVILÉGIO MÍNIMO (camada 2; a camada 1 são os gatilhos). vuumbora_api: SÓ LEITURA em categorias, áreas, pontos
-- próprios e nas duas views; SELECT/INSERT/UPDATE em fare_rule_versions (criar e publicar; o gatilho limita o UPDATE ao
-- rascunho); SELECT/INSERT em fare_rule_rates e fare_quotes (nunca UPDATE nem DELETE); EXECUTE em
-- current_fare_rule_version() e purge_fare_quotes(). Matriz em test/runtime-role.test.ts.
--
-- Zero downtime: só tabelas novas + um gatilho AFTER UPDATE OF status em accounts (sem reescrita, sem trava longa).
--
-- Índices: os de restrição + fare_quotes (created_at) para a purga e (account_id) para a cascata da conta e a purga na
-- exclusão (sem ele, todo DELETE/exclusão de conta varre as cotações). Catálogos são minúsculos: nenhum índice extra.
--
-- Reversão: docs/sql/rollback/0026_down.sql (APAGA categorias, áreas, pontos próprios, versões de tarifa e cotações).

-- ======================================================================
-- 0) Peças comuns
-- ======================================================================

-- Catálogo de geografia e preço: TRUNCATE ... CASCADE apagaria tarifas e cotações junto.
CREATE OR REPLACE FUNCTION geo_fare_catalog_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '%: TRUNCATE não é permitido (catálogo de geografia e preço)', TG_TABLE_NAME
        USING ERRCODE = '42501';
END;
$$;

-- `Polygon` GeoJSON válido (espelha assertValidPolygon, packages/domain/src/service-area.ts): objeto só com `type` e
-- `coordinates`; 1 a 20 anéis; cada anel com >= 4 posições [lng, lat] numéricas no intervalo e fechado (primeira =
-- última); até 5000 posições no total. IMMUTABLE e só com funções do sistema (usada em CHECK).
CREATE OR REPLACE FUNCTION geojson_polygon_is_valid(p_polygon JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_ring  JSONB;
    v_pos   JSONB;
    v_n     INT;
    v_total INT := 0;
BEGIN
    IF p_polygon IS NULL OR jsonb_typeof(p_polygon) <> 'object' THEN
        RETURN FALSE;
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_polygon) k WHERE k NOT IN ('type', 'coordinates')) THEN
        RETURN FALSE;
    END IF;
    IF p_polygon->>'type' IS DISTINCT FROM 'Polygon' OR jsonb_typeof(p_polygon->'coordinates') IS DISTINCT FROM 'array' THEN
        RETURN FALSE;
    END IF;
    IF jsonb_array_length(p_polygon->'coordinates') NOT BETWEEN 1 AND 20 THEN
        RETURN FALSE;
    END IF;
    FOR v_ring IN SELECT e.value FROM jsonb_array_elements(p_polygon->'coordinates') e
    LOOP
        IF jsonb_typeof(v_ring) <> 'array' THEN
            RETURN FALSE;
        END IF;
        v_n := jsonb_array_length(v_ring);
        v_total := v_total + v_n;
        IF v_n < 4 OR v_total > 5000 THEN
            RETURN FALSE;
        END IF;
        FOR v_pos IN SELECT e.value FROM jsonb_array_elements(v_ring) e
        LOOP
            IF jsonb_typeof(v_pos) <> 'array' THEN
                RETURN FALSE;
            END IF;
            IF jsonb_array_length(v_pos) <> 2 OR jsonb_typeof(v_pos->0) <> 'number' OR jsonb_typeof(v_pos->1) <> 'number' THEN
                RETURN FALSE;
            END IF;
            IF (v_pos->>0)::float8 NOT BETWEEN -180 AND 180 OR (v_pos->>1)::float8 NOT BETWEEN -90 AND 90 THEN
                RETURN FALSE;
            END IF;
        END LOOP;
        IF v_ring->0 <> v_ring->(v_n - 1) THEN
            RETURN FALSE;
        END IF;
    END LOOP;
    RETURN TRUE;
END;
$$;

-- Caixa do contorno (primeiro anel), na ordem do GeoJSON: {oeste, sul, leste, norte}. Contorno com qualquer posição
-- que não seja [número, número, ...]: NULL (quem recusa é o CHECK service_areas_polygon_valid; com NULL o CHECK da caixa
-- não se adianta a ele). Só funções do sistema: roda também na restauração (search_path vazio).
CREATE OR REPLACE FUNCTION geojson_polygon_bbox(p_polygon JSONB) RETURNS DOUBLE PRECISION[]
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN count(*) = 0 OR bool_and(s.ok) IS NOT TRUE THEN NULL
                ELSE ARRAY[min(s.x), min(s.y), max(s.x), max(s.y)] END
      FROM (SELECT p.ok,
                   CASE WHEN p.ok THEN (p.value->>0)::float8 END AS x,
                   CASE WHEN p.ok THEN (p.value->>1)::float8 END AS y
              FROM (SELECT pos.value,
                           coalesce(jsonb_typeof(pos.value) = 'array'
                                    AND jsonb_typeof(pos.value->0) = 'number'
                                    AND jsonb_typeof(pos.value->1) = 'number', FALSE) AS ok
                      FROM jsonb_array_elements(
                               CASE WHEN jsonb_typeof(p_polygon) = 'object'
                                     AND jsonb_typeof(p_polygon->'coordinates') = 'array'
                                     AND jsonb_typeof(p_polygon->'coordinates'->0) = 'array'
                                    THEN p_polygon->'coordinates'->0 ELSE '[]'::jsonb END) pos) p) s
$$;

-- Termos de busca normalizados: minúsculas ASCII e algarismos, palavras separadas por UM espaço, até 60 caracteres cada,
-- até 12 termos. A API normaliza a consulta igual (NFD, sem acento, minúsculas) antes de comparar.
CREATE OR REPLACE FUNCTION search_terms_are_normalized(p_terms TEXT[]) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
    SELECT p_terms IS NOT NULL
       AND coalesce(array_ndims(p_terms), 1) = 1
       AND cardinality(p_terms) <= 12
       AND NOT EXISTS (SELECT 1 FROM unnest(p_terms) t(term)
                        WHERE t.term IS NULL OR length(t.term) > 60 OR t.term !~ '^[a-z0-9]+( [a-z0-9]+)*$')
$$;

-- ======================================================================
-- 1) ride_categories
-- ======================================================================

CREATE TABLE IF NOT EXISTS ride_categories (
    slug              TEXT        PRIMARY KEY,
    -- `name`, `description` e `seats` são o que GET /v1/categories devolve (RideCategory do contrato K0).
    name              TEXT        NOT NULL,
    description       TEXT        NOT NULL,
    seats             SMALLINT    NOT NULL,
    -- 'base_tier': o nível do veículo (VuumBora, Conforto). 'modifier': camada por cima (Motorista mulher, Pet, Entrega).
    kind              TEXT        NOT NULL,
    -- FALSE só para Entrega: não há passageiro no carro (seats = 0).
    carries_passenger BOOLEAN     NOT NULL,
    -- Desligada = não aparece em GET /v1/categories nem cota (D-08/D-09: ocultas até o parecer jurídico).
    is_enabled        BOOLEAN     NOT NULL DEFAULT FALSE,
    sort_order        SMALLINT    NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ride_categories_slug_format CHECK (slug ~ '^[a-z][a-z0-9_]{1,39}$'),
    CONSTRAINT ride_categories_name_len CHECK (length(btrim(name)) BETWEEN 2 AND 40),
    CONSTRAINT ride_categories_description_len CHECK (length(btrim(description)) BETWEEN 2 AND 140),
    CONSTRAINT ride_categories_kind_valid CHECK (kind IN ('base_tier', 'modifier')),
    CONSTRAINT ride_categories_seats_match CHECK (
        (carries_passenger AND seats BETWEEN 1 AND 8) OR (NOT carries_passenger AND seats = 0))
);

COMMENT ON TABLE ride_categories IS 'Categorias de corrida (decisão 13). Só as ligadas aparecem e cotam; ligar exige valor na tarifa vigente.';

DROP TRIGGER IF EXISTS ride_categories_set_updated_at ON ride_categories;
CREATE TRIGGER ride_categories_set_updated_at BEFORE UPDATE ON ride_categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS ride_categories_no_truncate ON ride_categories;
CREATE TRIGGER ride_categories_no_truncate BEFORE TRUNCATE ON ride_categories
    FOR EACH STATEMENT EXECUTE FUNCTION geo_fare_catalog_no_truncate();

-- Textos curtos do mock do K0 (provisórios: a cópia final é do dono). Ordem = ordem na tela.
INSERT INTO ride_categories (slug, name, description, seats, kind, carries_passenger, is_enabled, sort_order) VALUES
    ('vuumbora',         'VuumBora',         'Carro para o dia a dia.',       4, 'base_tier', TRUE,  TRUE,  10),
    ('conforto',         'Conforto',         'Carro mais espaçoso.',          4, 'base_tier', TRUE,  TRUE,  20),
    ('motorista_mulher', 'Motorista mulher', 'Corrida com motorista mulher.', 4, 'modifier',  TRUE,  FALSE, 30),
    ('pet',              'Pet',              'Corrida com seu animal.',       4, 'modifier',  TRUE,  FALSE, 40),
    ('entrega',          'Entrega',          'Envio de objetos.',             0, 'modifier',  FALSE, FALSE, 50)
ON CONFLICT (slug) DO NOTHING;

-- ======================================================================
-- 2) service_areas
-- ======================================================================

CREATE TABLE IF NOT EXISTS service_areas (
    id          UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    city_code   TEXT             NOT NULL REFERENCES cities (code),
    name        TEXT             NOT NULL,
    -- `Polygon` GeoJSON, posições [longitude, latitude] (RFC 7946). O primeiro anel é o contorno; os demais, buracos.
    polygon     JSONB            NOT NULL,
    -- Caixa do contorno, GERADA do polígono (BoundingBox do domínio: [oeste, sul, leste, norte]).
    bbox_west   DOUBLE PRECISION GENERATED ALWAYS AS ((geojson_polygon_bbox(polygon))[1]) STORED,
    bbox_south  DOUBLE PRECISION GENERATED ALWAYS AS ((geojson_polygon_bbox(polygon))[2]) STORED,
    bbox_east   DOUBLE PRECISION GENERATED ALWAYS AS ((geojson_polygon_bbox(polygon))[3]) STORED,
    bbox_north  DOUBLE PRECISION GENERATED ALWAYS AS ((geojson_polygon_bbox(polygon))[4]) STORED,
    -- A área que GET /v1/service-area devolve e que a cotação usa. Uma por cidade.
    is_active   BOOLEAN          NOT NULL DEFAULT FALSE,
    -- TRUE enquanto o desenho for da equipe, não aprovado pelo dono.
    provisional BOOLEAN          NOT NULL DEFAULT TRUE,
    source      TEXT             NOT NULL,
    created_at  TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ      NOT NULL DEFAULT now(),
    CONSTRAINT service_areas_name_len CHECK (length(btrim(name)) BETWEEN 2 AND 80),
    CONSTRAINT service_areas_source_len CHECK (length(btrim(source)) BETWEEN 3 AND 300),
    CONSTRAINT service_areas_polygon_valid CHECK (geojson_polygon_is_valid(polygon)),
    -- Só para polígono válido (o inválido é recusado pelo CHECK acima, com o nome dele no erro).
    CONSTRAINT service_areas_bbox_not_degenerate CHECK (
        NOT geojson_polygon_is_valid(polygon) OR (bbox_west < bbox_east AND bbox_south < bbox_north))
);

COMMENT ON TABLE service_areas IS 'Área atendida por cidade (N7, sem PostGIS): polígono GeoJSON + caixa gerada. Ponto no polígono: isPointInServiceArea (domínio).';

CREATE UNIQUE INDEX IF NOT EXISTS service_areas_one_active_per_city ON service_areas (city_code) WHERE is_active;

DROP TRIGGER IF EXISTS service_areas_set_updated_at ON service_areas;
CREATE TRIGGER service_areas_set_updated_at BEFORE UPDATE ON service_areas
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS service_areas_no_truncate ON service_areas;
CREATE TRIGGER service_areas_no_truncate BEFORE TRUNCATE ON service_areas
    FOR EACH STATEMENT EXECUTE FUNCTION geo_fare_catalog_no_truncate();

-- Grande Natal, PROVISÓRIO. Contorno no sentido anti-horário, a partir do noroeste (norte de São Gonçalo do Amarante):
-- oeste do aeroporto, Macaíba, sul de Parnamirim, litoral até Pirangi, Ponta Negra, Via Costeira, Redinha/Genipabu e o
-- norte de Extremoz. O mar entra na área de propósito (ninguém pede corrida de lá); Ceará-Mirim e São José de Mipibu ficam fora.
INSERT INTO service_areas (city_code, name, polygon, is_active, provisional, source)
SELECT 'natal', 'Grande Natal',
       '{"type":"Polygon","coordinates":[[[-35.42,-5.70],[-35.42,-5.82],[-35.37,-5.88],[-35.30,-5.97],[-35.20,-6.00],[-35.12,-6.02],[-35.13,-5.90],[-35.15,-5.80],[-35.18,-5.74],[-35.20,-5.66],[-35.32,-5.66],[-35.42,-5.70]]]}'::jsonb,
       TRUE, TRUE,
       'Desenho da equipe (migração 0026) para "Natal e região metropolitana" (decisão 16 do dono). A confirmar com o dono.'
 WHERE NOT EXISTS (SELECT 1 FROM service_areas WHERE city_code = 'natal');

-- ======================================================================
-- 3) curated_places
-- ======================================================================

CREATE TABLE IF NOT EXISTS curated_places (
    -- Estável: é o id que a busca devolve (GeoSearchResult.id, source 'curated').
    code        TEXT             PRIMARY KEY,
    city_code   TEXT             NOT NULL REFERENCES cities (code),
    name        TEXT             NOT NULL,
    -- O sublabel da busca (endereço curto).
    address     TEXT             NOT NULL,
    category    TEXT             NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    -- Outros jeitos de procurar o lugar, já normalizados (ver search_terms_are_normalized).
    aliases     TEXT[]           NOT NULL DEFAULT '{}',
    is_active   BOOLEAN          NOT NULL DEFAULT TRUE,
    -- TRUE enquanto a coordenada for estimativa da equipe, não conferida no mapa.
    provisional BOOLEAN          NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ      NOT NULL DEFAULT now(),
    CONSTRAINT curated_places_code_format CHECK (code ~ '^[a-z][a-z0-9-]{1,59}$'),
    CONSTRAINT curated_places_name_len CHECK (length(btrim(name)) BETWEEN 2 AND 120),
    CONSTRAINT curated_places_address_len CHECK (length(btrim(address)) BETWEEN 2 AND 200),
    CONSTRAINT curated_places_category_valid CHECK (category IN (
        'airport', 'bus_terminal', 'shopping', 'hospital', 'education', 'landmark', 'venue', 'public_service', 'beach')),
    CONSTRAINT curated_places_lat_range CHECK (lat BETWEEN -90 AND 90),
    CONSTRAINT curated_places_lng_range CHECK (lng BETWEEN -180 AND 180),
    CONSTRAINT curated_places_aliases_valid CHECK (search_terms_are_normalized(aliases))
);

COMMENT ON TABLE curated_places IS 'Pontos próprios (N6): lugares mais procurados, primeiro na busca. Coordenada dentro da caixa da área ativa.';

-- Ponto ativo cai na caixa da área ativa da cidade (pega lat/lng trocadas e erro de digitação).
CREATE OR REPLACE FUNCTION curated_places_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_west  DOUBLE PRECISION;
    v_south DOUBLE PRECISION;
    v_east  DOUBLE PRECISION;
    v_north DOUBLE PRECISION;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        NEW.created_at := OLD.created_at;
    ELSE
        NEW.created_at := now();
    END IF;
    IF NOT NEW.is_active THEN
        RETURN NEW;
    END IF;
    SELECT a.bbox_west, a.bbox_south, a.bbox_east, a.bbox_north INTO v_west, v_south, v_east, v_north
      FROM service_areas a WHERE a.city_code = NEW.city_code AND a.is_active;
    IF NOT FOUND OR NEW.lng NOT BETWEEN v_west AND v_east OR NEW.lat NOT BETWEEN v_south AND v_north THEN
        RAISE EXCEPTION 'curated_places: a coordenada não cai na área ativa da cidade (latitude e longitude trocadas?)'
            USING ERRCODE = '23514', TABLE = 'curated_places', CONSTRAINT = 'curated_places_inside_service_area';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS curated_places_guard ON curated_places;
CREATE TRIGGER curated_places_guard BEFORE INSERT OR UPDATE ON curated_places
    FOR EACH ROW EXECUTE FUNCTION curated_places_guard();
DROP TRIGGER IF EXISTS curated_places_set_updated_at ON curated_places;
CREATE TRIGGER curated_places_set_updated_at BEFORE UPDATE ON curated_places
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS curated_places_no_truncate ON curated_places;
CREATE TRIGGER curated_places_no_truncate BEFORE TRUNCATE ON curated_places
    FOR EACH STATEMENT EXECUTE FUNCTION geo_fare_catalog_no_truncate();

-- Semente PROVISÓRIA: os lugares de nome da amostra da F10 (shopping, hospital, aeroporto, rodoviária, pontos),
-- com o endereço corrigido onde a amostra errou o bairro. Coordenadas ESTIMADAS (provisional = true).
INSERT INTO curated_places (code, city_code, name, address, category, lat, lng, aliases) VALUES
    ('aeroporto-natal', 'natal', 'Aeroporto Internacional de Natal', 'São Gonçalo do Amarante - RN', 'airport',
        -5.7686, -35.3721, '{aeroporto,"aeroporto de natal","aeroporto internacional","aluizio alves","sao goncalo do amarante"}'),
    ('rodoviaria-natal', 'natal', 'Terminal Rodoviário de Natal', 'Av. Capitão-Mor Gouveia, Cidade da Esperança, Natal - RN', 'bus_terminal',
        -5.8237, -35.2381, '{rodoviaria,"rodoviaria de natal","terminal rodoviario"}'),
    ('midway-mall', 'natal', 'Midway Mall', 'Av. Bernardo Vieira, 3775, Tirol, Natal - RN', 'shopping',
        -5.8110, -35.2065, '{midway,"midway mall","shopping midway"}'),
    ('natal-shopping', 'natal', 'Natal Shopping', 'Av. Sen. Salgado Filho, 2234, Candelária, Natal - RN', 'shopping',
        -5.8429, -35.2113, '{"natal shopping","shopping natal"}'),
    ('partage-norte-shopping', 'natal', 'Partage Norte Shopping Natal', 'Av. Dr. João Medeiros Filho, Potengi, Natal - RN', 'shopping',
        -5.7489, -35.2560, '{partage,"partage norte","norte shopping","shopping zona norte"}'),
    ('praia-shopping', 'natal', 'Praia Shopping', 'Av. Eng. Roberto Freire, Ponta Negra, Natal - RN', 'shopping',
        -5.8710, -35.1825, '{"praia shopping","shopping ponta negra"}'),
    ('hospital-onofre-lopes', 'natal', 'Hospital Universitário Onofre Lopes', 'Av. Nilo Peçanha, 620, Petrópolis, Natal - RN', 'hospital',
        -5.7866, -35.2010, '{huol,"onofre lopes","hospital universitario","hospital onofre lopes"}'),
    ('hospital-walfredo-gurgel', 'natal', 'Hospital Monsenhor Walfredo Gurgel', 'Av. Sen. Salgado Filho, Tirol, Natal - RN', 'hospital',
        -5.8033, -35.2104, '{walfredo,"walfredo gurgel","hospital walfredo gurgel"}'),
    ('maternidade-januario-cicco', 'natal', 'Maternidade Escola Januário Cicco', 'Av. Nilo Peçanha, 259, Petrópolis, Natal - RN', 'hospital',
        -5.7858, -35.1990, '{"januario cicco","maternidade januario cicco","maternidade escola",mejc}'),
    ('hospital-giselda-trigueiro', 'natal', 'Hospital Giselda Trigueiro', 'Rua Cônego Monte, Quintas, Natal - RN', 'hospital',
        -5.7896, -35.2337, '{"giselda trigueiro","hospital giselda trigueiro"}'),
    ('arena-das-dunas', 'natal', 'Arena das Dunas', 'Av. Prudente de Morais, 5121, Lagoa Nova, Natal - RN', 'venue',
        -5.8285, -35.2128, '{"arena das dunas",arena,estadio}'),
    ('ufrn-campus-central', 'natal', 'UFRN - Campus Central', 'Av. Sen. Salgado Filho, 3000, Lagoa Nova, Natal - RN', 'education',
        -5.8402, -35.1995, '{ufrn,"universidade federal","campus central"}'),
    ('ifrn-natal-central', 'natal', 'IFRN - Campus Natal Central', 'Av. Sen. Salgado Filho, 1559, Tirol, Natal - RN', 'education',
        -5.8115, -35.2038, '{ifrn,"ifrn central",cefet}'),
    ('parque-das-dunas', 'natal', 'Parque das Dunas (Bosque dos Namorados)', 'Av. Alexandrino de Alencar, Tirol, Natal - RN', 'landmark',
        -5.8128, -35.1918, '{"parque das dunas","bosque dos namorados"}'),
    ('forte-reis-magos', 'natal', 'Fortaleza dos Reis Magos', 'Praia do Forte, Santos Reis, Natal - RN', 'landmark',
        -5.7561, -35.1944, '{"forte dos reis magos","fortaleza dos reis magos",forte}'),
    ('catedral-metropolitana', 'natal', 'Catedral Metropolitana de Natal', 'Av. Deodoro da Fonseca, Cidade Alta, Natal - RN', 'landmark',
        -5.7897, -35.2044, '{catedral,"catedral nova","catedral metropolitana"}'),
    ('praca-andre-albuquerque', 'natal', 'Praça André de Albuquerque', 'Cidade Alta, Natal - RN', 'landmark',
        -5.7800, -35.2085, '{"praca andre de albuquerque","andre de albuquerque"}'),
    ('teatro-alberto-maranhao', 'natal', 'Teatro Alberto Maranhão', 'Praça Augusto Severo, Ribeira, Natal - RN', 'venue',
        -5.7768, -35.2048, '{"teatro alberto maranhao",teatro}'),
    ('centro-de-convencoes', 'natal', 'Centro de Convenções de Natal', 'Via Costeira, Ponta Negra, Natal - RN', 'venue',
        -5.8519, -35.1676, '{"centro de convencoes","centro de convencoes de natal"}'),
    ('praia-de-ponta-negra', 'natal', 'Praia de Ponta Negra', 'Ponta Negra, Natal - RN', 'beach',
        -5.8800, -35.1690, '{"ponta negra","praia de ponta negra","morro do careca"}'),
    ('forum-seabra-fagundes', 'natal', 'Fórum Miguel Seabra Fagundes', 'Rua Dr. Lauro Pinto, 315, Lagoa Nova, Natal - RN', 'public_service',
        -5.8318, -35.2112, '{forum,"forum seabra fagundes","forum miguel seabra fagundes"}')
ON CONFLICT (code) DO NOTHING;

-- ======================================================================
-- 4) fare_rule_versions e fare_rule_rates
-- ======================================================================

CREATE TABLE IF NOT EXISTS fare_rule_versions (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    city_code  TEXT        NOT NULL REFERENCES cities (code),
    -- TRUE: tarifa de TESTE (N8). Só cota com ALLOW_TEST_FARES ligada (desenvolvimento e homologação), nunca em produção.
    is_test    BOOLEAN     NOT NULL,
    note       TEXT        NULL,
    -- O `dono` que criou (e publicou: é uma ação só na API). NULL só em tarifa de teste (a semeada por migração).
    created_by UUID        NULL REFERENCES admin_users (id),
    -- Idempotency-Key do POST /v1/admin/fare-tables (contrato K0): a mesma chave do mesmo dono devolve a mesma versão.
    -- Gravada no INSERT (a versão publicada não muda mais); a requisição que falha desfaz tudo e a chave fica livre.
    idempotency_key TEXT   NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- NULL = rascunho. Preenchido pelo gatilho com o relógio do banco ao publicar; depois disso, imutável.
    -- valid_to não é coluna: é o valid_from da versão seguinte (view fare_rule_version_periods).
    valid_from TIMESTAMPTZ NULL,
    CONSTRAINT fare_rule_versions_note_len CHECK (note IS NULL OR length(btrim(note)) BETWEEN 1 AND 500),
    CONSTRAINT fare_rule_versions_real_has_author CHECK (is_test OR created_by IS NOT NULL),
    CONSTRAINT fare_rule_versions_idempotency_key_len CHECK (
        idempotency_key IS NULL OR (created_by IS NOT NULL AND length(idempotency_key) BETWEEN 1 AND 200))
);

-- Uma versão por chave e autor (replay = ler esta linha; corpo diferente = 409 idempotency_key_reused, na API).
CREATE UNIQUE INDEX IF NOT EXISTS fare_rule_versions_idempotency_key
    ON fare_rule_versions (created_by, idempotency_key) WHERE idempotency_key IS NOT NULL;

COMMENT ON TABLE fare_rule_versions IS 'Tarifa versionada (N8). Rascunho -> publicada (valid_from) -> imutável. Vigente e valid_to são derivados.';

CREATE TABLE IF NOT EXISTS fare_rule_rates (
    version_id         UUID    NOT NULL REFERENCES fare_rule_versions (id) ON DELETE CASCADE,
    category_slug      TEXT    NOT NULL REFERENCES ride_categories (slug),
    -- Os componentes de FareRates (packages/domain/src/fare.ts), em centavos inteiros.
    base_cents         INTEGER NOT NULL,
    per_km_cents       INTEGER NOT NULL,
    per_minute_cents   INTEGER NOT NULL,
    minimum_fare_cents INTEGER NOT NULL,
    CONSTRAINT fare_rule_rates_pkey PRIMARY KEY (version_id, category_slug),
    -- Teto de R$ 1.000 por componente: pega erro de digitação (centavos x reais), não é limite de negócio.
    CONSTRAINT fare_rule_rates_values_range CHECK (
        base_cents BETWEEN 0 AND 100000 AND per_km_cents BETWEEN 0 AND 100000
        AND per_minute_cents BETWEEN 0 AND 100000 AND minimum_fare_cents BETWEEN 0 AND 100000),
    CONSTRAINT fare_rule_rates_not_free CHECK (base_cents + per_km_cents + per_minute_cents + minimum_fare_cents > 0)
);

-- A versão VIGENTE da cidade (a publicada mais recente). NULL = cidade sem tarifa.
CREATE OR REPLACE FUNCTION current_fare_rule_version(p_city_code TEXT) RETURNS UUID
LANGUAGE sql STABLE AS $$
    SELECT v.id FROM fare_rule_versions v
     WHERE v.city_code = p_city_code AND v.valid_from IS NOT NULL
     ORDER BY v.valid_from DESC
     LIMIT 1
$$;

REVOKE ALL ON FUNCTION current_fare_rule_version(TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION fare_rule_versions_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_role  TEXT;
    v_deact TIMESTAMPTZ;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.valid_from IS NULL THEN
            RETURN OLD; -- rascunho descartado (os valores vão em cascata)
        END IF;
        RAISE EXCEPTION 'fare_rule_versions: versão publicada é imutável (DELETE não é permitido)'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- Toda versão nasce rascunho: publicar é um passo explícito, depois dos valores.
        NEW.valid_from := NULL;
        NEW.created_at := now();
    ELSE
        IF OLD.valid_from IS NOT NULL THEN
            RAISE EXCEPTION 'fare_rule_versions: versão publicada (vigente ou fechada) é imutável; publique a versão seguinte'
                USING ERRCODE = '42501';
        END IF;
        IF NEW.id IS DISTINCT FROM OLD.id OR NEW.city_code IS DISTINCT FROM OLD.city_code
           OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
           OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
            RAISE EXCEPTION 'fare_rule_versions: no rascunho só mudam note, is_test e a publicação'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Autor: só dono com acesso ativo (conferido ao criar e de novo ao publicar).
    IF NEW.created_by IS NOT NULL THEN
        SELECT a.role, a.deactivated_at INTO v_role, v_deact FROM admin_users a WHERE a.id = NEW.created_by;
        IF v_role IS DISTINCT FROM 'dono' OR v_deact IS NOT NULL THEN
            RAISE EXCEPTION 'fare_rule_versions: só o dono, com acesso ativo, cria e publica tarifa'
                USING ERRCODE = '42501', TABLE = 'fare_rule_versions', CONSTRAINT = 'fare_rule_versions_author_role';
        END IF;
    END IF;

    IF TG_OP = 'INSERT' OR NEW.valid_from IS NULL THEN
        RETURN NEW; -- criação ou edição do rascunho
    END IF;

    -- Publicação. Publicações (e liga/desliga de categoria) entram uma de cada vez; o relógio é lido DEPOIS da trava.
    PERFORM pg_advisory_xact_lock(hashtextextended('fare_rule_versions', 0));
    NEW.valid_from := clock_timestamp();
    IF NOT EXISTS (SELECT 1 FROM fare_rule_rates r WHERE r.version_id = NEW.id) THEN
        RAISE EXCEPTION 'fare_rule_versions: a versão precisa de ao menos uma categoria com valor'
            USING ERRCODE = '23514', TABLE = 'fare_rule_versions', CONSTRAINT = 'fare_rule_versions_has_rates';
    END IF;
    IF EXISTS (SELECT 1 FROM ride_categories c
                WHERE c.is_enabled
                  AND NOT EXISTS (SELECT 1 FROM fare_rule_rates r WHERE r.version_id = NEW.id AND r.category_slug = c.slug)) THEN
        RAISE EXCEPTION 'fare_rule_versions: toda categoria ligada precisa de valor na versão'
            USING ERRCODE = '23514', TABLE = 'fare_rule_versions', CONSTRAINT = 'fare_rule_versions_covers_enabled_categories';
    END IF;
    IF NEW.is_test AND EXISTS (SELECT 1 FROM fare_rule_versions v
                                WHERE v.city_code = NEW.city_code AND v.id <> NEW.id
                                  AND v.valid_from IS NOT NULL AND NOT v.is_test) THEN
        RAISE EXCEPTION 'fare_rule_versions: a cidade já tem tarifa real; tarifa de teste não é mais publicada'
            USING ERRCODE = '23514', TABLE = 'fare_rule_versions', CONSTRAINT = 'fare_rule_versions_no_test_after_real';
    END IF;
    IF EXISTS (SELECT 1 FROM fare_rule_versions v
                WHERE v.city_code = NEW.city_code AND v.id <> NEW.id AND v.valid_from >= NEW.valid_from) THEN
        RAISE EXCEPTION 'fare_rule_versions: publicação não é posterior à vigente (relógio do banco voltou?)'
            USING ERRCODE = '23514', TABLE = 'fare_rule_versions', CONSTRAINT = 'fare_rule_versions_valid_from_monotonic';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fare_rule_versions_guard ON fare_rule_versions;
CREATE TRIGGER fare_rule_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON fare_rule_versions
    FOR EACH ROW EXECUTE FUNCTION fare_rule_versions_guard();
DROP TRIGGER IF EXISTS fare_rule_versions_no_truncate ON fare_rule_versions;
CREATE TRIGGER fare_rule_versions_no_truncate BEFORE TRUNCATE ON fare_rule_versions
    FOR EACH STATEMENT EXECUTE FUNCTION geo_fare_catalog_no_truncate();

-- Valor só muda enquanto a versão é rascunho. FOR SHARE na versão: a publicação (UPDATE) espera este valor.
CREATE OR REPLACE FUNCTION fare_rule_rates_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_valid_from TIMESTAMPTZ;
    v_version    UUID;
    v_versions   UUID[] := ARRAY[]::UUID[];
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_versions := v_versions || OLD.version_id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_versions := v_versions || NEW.version_id;
    END IF;
    FOREACH v_version IN ARRAY v_versions
    LOOP
        SELECT v.valid_from INTO v_valid_from FROM fare_rule_versions v WHERE v.id = v_version FOR SHARE;
        -- Versão ausente: no INSERT quem recusa é a FK; no DELETE é a cascata de um rascunho descartado.
        IF FOUND AND v_valid_from IS NOT NULL THEN
            RAISE EXCEPTION 'fare_rule_rates: a versão já foi publicada e é imutável (% não é permitido)', TG_OP
                USING ERRCODE = '42501';
        END IF;
    END LOOP;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fare_rule_rates_guard ON fare_rule_rates;
CREATE TRIGGER fare_rule_rates_guard BEFORE INSERT OR UPDATE OR DELETE ON fare_rule_rates
    FOR EACH ROW EXECUTE FUNCTION fare_rule_rates_guard();
DROP TRIGGER IF EXISTS fare_rule_rates_no_truncate ON fare_rule_rates;
CREATE TRIGGER fare_rule_rates_no_truncate BEFORE TRUNCATE ON fare_rule_rates
    FOR EACH STATEMENT EXECUTE FUNCTION geo_fare_catalog_no_truncate();

-- O contrato FareTableVersion (GET /v1/admin/fare-tables): toda versão PUBLICADA com o período. valid_to NULL = vigente.
CREATE OR REPLACE VIEW fare_rule_version_periods AS
    SELECT v.id, v.city_code, v.is_test, v.note, v.created_by, v.created_at, v.valid_from,
           lead(v.valid_from) OVER (PARTITION BY v.city_code ORDER BY v.valid_from) AS valid_to
      FROM fare_rule_versions v
     WHERE v.valid_from IS NOT NULL;

COMMENT ON VIEW fare_rule_version_periods IS
    'Versões publicadas de tarifa com o período (valid_to = valid_from da seguinte; NULL = vigente).';

-- A definição ÚNICA dos valores que cotam agora: a cotação (POST /v1/quotes) lê daqui.
CREATE OR REPLACE VIEW current_fare_rules AS
    SELECT v.city_code, v.id AS version_id, v.is_test, v.valid_from,
           r.category_slug, r.base_cents, r.per_km_cents, r.per_minute_cents, r.minimum_fare_cents
      FROM (SELECT DISTINCT ON (x.city_code) x.*
              FROM fare_rule_versions x
             WHERE x.valid_from IS NOT NULL
             ORDER BY x.city_code, x.valid_from DESC) v
      JOIN fare_rule_rates r ON r.version_id = v.id;

COMMENT ON VIEW current_fare_rules IS
    'Valores de cada categoria na versão vigente (a publicada mais recente) da tarifa de cada cidade.';

-- Ligar categoria exige valor dela na versão vigente de toda cidade que já tem tarifa. Slug é imutável.
CREATE OR REPLACE FUNCTION ride_categories_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.slug IS DISTINCT FROM OLD.slug THEN
            RAISE EXCEPTION 'ride_categories: o slug é imutável (crie outra categoria)'
                USING ERRCODE = '42501';
        END IF;
        NEW.created_at := OLD.created_at;
    ELSE
        NEW.created_at := now();
    END IF;
    IF NEW.is_enabled AND (TG_OP = 'INSERT' OR NOT OLD.is_enabled) THEN
        PERFORM pg_advisory_xact_lock(hashtextextended('fare_rule_versions', 0));
        IF EXISTS (SELECT 1
                     FROM (SELECT DISTINCT ON (x.city_code) x.id
                             FROM fare_rule_versions x
                            WHERE x.valid_from IS NOT NULL
                            ORDER BY x.city_code, x.valid_from DESC) cur
                    WHERE NOT EXISTS (SELECT 1 FROM fare_rule_rates r
                                       WHERE r.version_id = cur.id AND r.category_slug = NEW.slug)) THEN
            RAISE EXCEPTION 'ride_categories: publique antes uma tarifa com valor para "%"', NEW.slug
                USING ERRCODE = '23514', TABLE = 'ride_categories', CONSTRAINT = 'ride_categories_enabled_has_fare';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ride_categories_guard ON ride_categories;
CREATE TRIGGER ride_categories_guard BEFORE INSERT OR UPDATE ON ride_categories
    FOR EACH ROW EXECUTE FUNCTION ride_categories_guard();

-- Semente: tarifa de TESTE de Natal (números do mock do K0; não é proposta de preço).
DO $$
DECLARE
    v_id UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM fare_rule_versions WHERE city_code = 'natal') THEN
        RETURN;
    END IF;
    INSERT INTO fare_rule_versions (city_code, is_test, note)
    VALUES ('natal', TRUE,
            'Tarifa de TESTE semeada pela migração 0026 (decisão 7 em aberto): não é proposta de preço e não cota em produção (N8).')
    RETURNING id INTO v_id;
    INSERT INTO fare_rule_rates (version_id, category_slug, base_cents, per_km_cents, per_minute_cents, minimum_fare_cents) VALUES
        (v_id, 'vuumbora', 400, 150, 25,  800),
        (v_id, 'conforto', 550, 210, 35, 1100);
    UPDATE fare_rule_versions SET valid_from = now() WHERE id = v_id;
END;
$$;

-- ======================================================================
-- 5) fare_quotes
-- ======================================================================

CREATE TABLE IF NOT EXISTS fare_quotes (
    id                 UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Passageiro que pediu. Excluir a conta apaga as cotações (gatilho em accounts); a cascata cobre o DELETE real.
    account_id         UUID             NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    fare_version_id    UUID             NOT NULL,
    category_slug      TEXT             NOT NULL,
    origin_lat         DOUBLE PRECISION NOT NULL,
    origin_lng         DOUBLE PRECISION NOT NULL,
    -- O texto que o passageiro confirmou (1 a 200 caracteres, contrato K0).
    origin_label       TEXT             NOT NULL,
    destination_lat    DOUBLE PRECISION NOT NULL,
    destination_lng    DOUBLE PRECISION NOT NULL,
    destination_label  TEXT             NOT NULL,
    -- A rota usada no preço (Directions). Com os valores da versão, refaz o cálculo para auditoria.
    distance_m         INTEGER          NOT NULL,
    duration_s         INTEGER          NOT NULL,
    dynamic_multiplier NUMERIC(4,2)     NOT NULL DEFAULT 1.00,
    price_cents        INTEGER          NOT NULL,
    -- HMAC da API sobre id, categoria, preço, versão e validade (N9). Opaca para o app.
    signature          TEXT             NOT NULL,
    created_at         TIMESTAMPTZ      NOT NULL DEFAULT now(),
    expires_at         TIMESTAMPTZ      NOT NULL,
    CONSTRAINT fare_quotes_rate_fkey FOREIGN KEY (fare_version_id, category_slug)
        REFERENCES fare_rule_rates (version_id, category_slug),
    CONSTRAINT fare_quotes_points_range CHECK (
        origin_lat BETWEEN -90 AND 90 AND destination_lat BETWEEN -90 AND 90
        AND origin_lng BETWEEN -180 AND 180 AND destination_lng BETWEEN -180 AND 180),
    CONSTRAINT fare_quotes_labels_len CHECK (
        length(origin_label) BETWEEN 1 AND 200 AND btrim(origin_label) <> ''
        AND length(destination_label) BETWEEN 1 AND 200 AND btrim(destination_label) <> ''),
    CONSTRAINT fare_quotes_route_range CHECK (distance_m BETWEEN 1 AND 500000 AND duration_s BETWEEN 1 AND 86400),
    CONSTRAINT fare_quotes_dynamic_multiplier_range CHECK (dynamic_multiplier >= 1),
    CONSTRAINT fare_quotes_price_range CHECK (price_cents BETWEEN 1 AND 1000000),
    CONSTRAINT fare_quotes_signature_format CHECK (signature ~ '^[A-Za-z0-9_-]{32,128}$'),
    -- N9: vale 5 min (QUOTE_TTL_SECONDS), com 5 s de folga para o relógio do app que assina.
    CONSTRAINT fare_quotes_ttl CHECK (expires_at > created_at AND expires_at <= created_at + interval '305 seconds')
);

COMMENT ON TABLE fare_quotes IS 'Cotação emitida (N9, D-06): preço fechado, assinado, vale 5 min, imutável. Purga em 30 dias e na exclusão da conta.';

CREATE INDEX IF NOT EXISTS fare_quotes_created_at_idx ON fare_quotes (created_at);
CREATE INDEX IF NOT EXISTS fare_quotes_account_idx ON fare_quotes (account_id);

CREATE OR REPLACE FUNCTION fare_quotes_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_type       TEXT;
    v_status     TEXT;
    v_city       TEXT;
    v_valid_from TIMESTAMPTZ;
    v_min        INTEGER;
    v_west       DOUBLE PRECISION;
    v_south      DOUBLE PRECISION;
    v_east       DOUBLE PRECISION;
    v_north      DOUBLE PRECISION;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'fare_quotes: cotação emitida é imutável (preço fechado, D-06); cote de novo'
            USING ERRCODE = '42501';
    END IF;

    -- O relógio é o do banco; o enviado é descartado.
    NEW.created_at := clock_timestamp();

    SELECT a.account_type, a.status INTO v_type, v_status FROM accounts a WHERE a.id = NEW.account_id;
    IF FOUND AND (v_type <> 'passenger' OR v_status <> 'active') THEN
        RAISE EXCEPTION 'fare_quotes: só conta de passageiro ativa recebe cotação'
            USING ERRCODE = '23514', TABLE = 'fare_quotes', CONSTRAINT = 'fare_quotes_passenger_account';
    END IF;

    SELECT v.city_code, v.valid_from INTO v_city, v_valid_from FROM fare_rule_versions v WHERE v.id = NEW.fare_version_id;
    IF NOT FOUND THEN
        RETURN NEW; -- quem recusa é a FK fare_quotes_rate_fkey
    END IF;
    IF v_valid_from IS NULL OR current_fare_rule_version(v_city) IS DISTINCT FROM NEW.fare_version_id THEN
        RAISE EXCEPTION 'fare_quotes: a versão de tarifa não é a vigente da cidade (publicada durante a cotação?)'
            USING ERRCODE = '23514', TABLE = 'fare_quotes', CONSTRAINT = 'fare_quotes_version_current';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM ride_categories c WHERE c.slug = NEW.category_slug AND c.is_enabled) THEN
        RAISE EXCEPTION 'fare_quotes: categoria desligada não cota'
            USING ERRCODE = '23514', TABLE = 'fare_quotes', CONSTRAINT = 'fare_quotes_category_enabled';
    END IF;

    SELECT r.minimum_fare_cents INTO v_min FROM fare_rule_rates r
     WHERE r.version_id = NEW.fare_version_id AND r.category_slug = NEW.category_slug;
    IF FOUND AND NEW.price_cents < v_min THEN
        RAISE EXCEPTION 'fare_quotes: preço abaixo do mínimo da categoria na versão'
            USING ERRCODE = '23514', TABLE = 'fare_quotes', CONSTRAINT = 'fare_quotes_price_at_least_minimum';
    END IF;

    SELECT a.bbox_west, a.bbox_south, a.bbox_east, a.bbox_north INTO v_west, v_south, v_east, v_north
      FROM service_areas a WHERE a.city_code = v_city AND a.is_active;
    IF NOT FOUND
       OR NEW.origin_lng NOT BETWEEN v_west AND v_east OR NEW.origin_lat NOT BETWEEN v_south AND v_north
       OR NEW.destination_lng NOT BETWEEN v_west AND v_east OR NEW.destination_lat NOT BETWEEN v_south AND v_north THEN
        RAISE EXCEPTION 'fare_quotes: origem ou destino fora da área atendida'
            USING ERRCODE = '23514', TABLE = 'fare_quotes', CONSTRAINT = 'fare_quotes_inside_service_area';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fare_quotes_guard ON fare_quotes;
CREATE TRIGGER fare_quotes_guard BEFORE INSERT OR UPDATE ON fare_quotes
    FOR EACH ROW EXECUTE FUNCTION fare_quotes_guard();

-- Purga de 30 dias (retenção de plano-sistema-dados.md §2: cotação que não virou corrida não tem valor depois de vencer).
-- Em lotes, mais antigas primeiro; quem chama repete até voltar 0. O prazo é fixo aqui (política, não parâmetro).
CREATE OR REPLACE FUNCTION purge_fare_quotes(p_batch_size INTEGER DEFAULT 5000) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF p_batch_size IS NULL OR p_batch_size NOT BETWEEN 1 AND 50000 THEN
        RAISE EXCEPTION 'purge_fare_quotes: lote entre 1 e 50000'
            USING ERRCODE = '22023';
    END IF;
    DELETE FROM fare_quotes q
     WHERE q.id IN (SELECT x.id FROM fare_quotes x
                     WHERE x.created_at < now() - interval '30 days'
                     ORDER BY x.created_at
                     LIMIT p_batch_size);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION purge_fare_quotes(INTEGER) FROM PUBLIC;

-- Conta excluída: a localização das cotações sai na hora (qualquer caminho até 'deleted', inclusive delete_account,
-- que roda com o papel da API, sem DELETE em fare_quotes: por isso SECURITY DEFINER).
CREATE OR REPLACE FUNCTION fare_quotes_purge_deleted_account() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    DELETE FROM fare_quotes q WHERE q.account_id = NEW.id;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION fare_quotes_purge_deleted_account() FROM PUBLIC;

DROP TRIGGER IF EXISTS accounts_purge_fare_quotes ON accounts;
CREATE TRIGGER accounts_purge_fare_quotes AFTER UPDATE OF status ON accounts
    FOR EACH ROW WHEN (NEW.status = 'deleted' AND OLD.status IS DISTINCT FROM 'deleted')
    EXECUTE FUNCTION fare_quotes_purge_deleted_account();

-- ======================================================================
-- 6) Privilégios do papel de runtime (camada 2)
-- ======================================================================
-- A 0012 deixou DML completo como padrão para tabela (e view) nova: o REVOKE é aqui. Nunca derruba o boot.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vuumbora_api') THEN
        RAISE NOTICE '[0026] o papel vuumbora_api não existe; só os gatilhos protegem geografia, tarifa e cotação.';
        RETURN;
    END IF;

    BEGIN
        -- Catálogo de geografia e as views: a API só lê (quem muda é o operador, com a credencial dona).
        REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
            ride_categories, service_areas, curated_places, fare_rule_version_periods, current_fare_rules
            FROM vuumbora_api;
        GRANT SELECT ON
            ride_categories, service_areas, curated_places, fare_rule_version_periods, current_fare_rules
            TO vuumbora_api;
        -- Tarifa: o dono cria e publica pela API (o gatilho limita o UPDATE ao rascunho); valores só entram.
        REVOKE DELETE, TRUNCATE ON fare_rule_versions FROM vuumbora_api;
        GRANT SELECT, INSERT, UPDATE ON fare_rule_versions TO vuumbora_api;
        REVOKE UPDATE, DELETE, TRUNCATE ON fare_rule_rates, fare_quotes FROM vuumbora_api;
        GRANT SELECT, INSERT ON fare_rule_rates, fare_quotes TO vuumbora_api;
        GRANT EXECUTE ON FUNCTION current_fare_rule_version(TEXT) TO vuumbora_api;
        GRANT EXECUTE ON FUNCTION purge_fare_quotes(INTEGER) TO vuumbora_api;
    EXCEPTION
        WHEN insufficient_privilege THEN
            RAISE NOTICE '[0026] sem permissão para ajustar grants; só os gatilhos protegem geografia, tarifa e cotação.';
    END;
END;
$$;
