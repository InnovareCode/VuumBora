-- Documentos do motorista (fatia D1 de docs/plano-m3-m4.md, decisões N1-N4 e §3; decisão 9 do dono).
--
-- O que nasce aqui:
--   cities                        mercado de operação (hoje só 'natal'); dono de fuso e configuração.
--   driver_settings               por cidade: prazo de análise (review_sla_hours) e idade máxima do veículo.
--   document_types                catálogo dos TIPOS de documento (código estável entre versões da lista).
--   document_requirement_versions a LISTA exigida, por cidade e com versão (N1). Rascunho -> publicada -> imutável.
--   document_requirements         os itens de cada versão (obrigatório?, tem validade?, ordem).
--   current_document_requirements view: a lista VIGENTE de cada cidade (a de published_at mais recente).
--   document_rejection_reasons    motivos de recusa numa lista FECHADA (N2, decisão 9).
--   drivers                       1:1 com conta 'driver', ligada à candidatura APROVADA de mesmo e-mail (N3).
--   vehicles                      veículo do motorista (um ativo por vez; placa ativa única).
--   driver_documents              metadados do arquivo (o binário mora no armazenamento de objetos, NUNCA aqui)
--                                 + a fila de revisão (status = 'submitted', mais antigo primeiro).
--   driver_approval_blockers()    a ÚNICA definição de "o que impede este motorista de ser aprovado".
--   link_driver_application()     a ÚNICA definição do vínculo candidatura -> conta (N3).
--
-- ---------- Decisões ----------
--
-- LISTA COMO DADO (N1). A semente é o mínimo federal (Lei 12.587/2012: CNH com EAR, CRLV e antecedentes,
-- art. 11-B; inscrição no INSS, art. 11-A, III) + foto de perfil, PROVISÓRIA (provisional = true). A lista da
-- STTU entra como VERSÃO NOVA, sem deploy (operador, credencial dona):
--   BEGIN;
--   INSERT INTO document_requirement_versions (city_code, version, provisional, source)
--        VALUES ('natal', '2027-01-sttu', false, 'Decreto municipal nº ...') RETURNING id;        -- nasce rascunho
--   INSERT INTO document_requirements (version_id, type_code, required, has_expiry, sort_order) VALUES (...);
--   UPDATE document_requirement_versions SET published_at = now() WHERE id = '<id>';            -- publica
--   COMMIT;
-- Tipo novo (ex.: vistoria municipal) é um INSERT em document_types antes. Versão publicada é imutável
-- (gatilho vale até para o dono): lista errada se corrige publicando a seguinte. Rascunho pode ser apagado.
-- "Vigente" é DERIVADA (maior published_at por cidade), como em legal_current_versions (0021): sem UPDATE em
-- linha publicada e com no máximo uma vigente por construção.
--
-- CICLO DO DOCUMENTO (gatilho driver_documents_guard; cada linha é UM envio):
--   awaiting_upload -> submitted -> approved -> expired
--                                \-> rejected
--   awaiting_upload/submitted/approved -> superseded (outro envio do mesmo tipo tomou o lugar)
--   qualquer estado -> withdrawn (conta excluída: o objeto vai para a rotina de descarte)
-- A decisão (quem revisou, quando, motivo, validade) é gravada UMA vez, na transição para approved/rejected,
-- e não muda mais: a linha do documento é a prova da revisão, junto com o admin_audit_log. Só os papéis
-- `revisor_documentos` e `dono` (ativos) revisam: o banco recusa outro autor (decisão 9, por desenho).
-- Substituir: a aplicação marca o anterior como `superseded` ANTES de aprovar/criar o novo (índices únicos
-- parciais: um em andamento e um aprovado por motorista + tipo + veículo).
--
-- DOCUMENTO DO VEÍCULO. `document_types.scope = 'vehicle'` (CRLV) exige vehicle_id, e a FK composta
-- (vehicle_id, driver_id) garante que o veículo é do mesmo motorista. Trocar de carro (veículo novo) deixa o
-- CRLV antigo sem efeito: o bloqueio volta até o CRLV do carro novo ser aprovado. Por isso placa, marca,
-- modelo e ano são imutáveis na linha do veículo (outro carro = outro cadastro).
--
-- APROVAÇÃO DO MOTORISTA (N4). drivers.status só vira 'approved' se driver_approval_blockers() estiver
-- vazia (etapa 2 completa, veículo ativo, todo item obrigatório da lista vigente com documento aprovado e
-- dentro da validade). A aplicação faz o UPDATE na mesma transação em que aprova o último documento; o banco
-- recusa (23514 drivers_approval_blocked) se faltar algo. Lista nova publicada depois NÃO rebaixa o status:
-- a regra de disponibilidade (ficar online) consulta driver_approval_blockers() a cada vez.
--
-- VÍNCULO (N3). Conta 'driver' ATIVA com e-mail VERIFICADO + candidatura 'approved' com o MESMO e-mail
-- (os dois são normalizados: accounts por CHECK, a candidatura pela API desde o primeiro commit). O gatilho
-- de drivers valida isso em qualquer INSERT, não só pela função. Por que gatilho e não FK composta para
-- (accounts.id, account_type): evita um índice único novo na tabela mais escrita da identidade, e
-- account_type já é imutável (0010).
--
-- DADO SENSÍVEL. CPF, CNH e endereço ficam em drivers (etapa 2, só depois da candidatura aprovada). Exclusão
-- de conta (delete_account, 0022, estendida aqui) apaga esses campos, inativa o veículo e marca todo documento
-- como `withdrawn`. Apagar o OBJETO no armazenamento e depois a linha é a rotina de descarte (operador). Prazo
-- de guarda de documento ainda é decisão do dono/advogado (decisão 16): até lá, guarda enquanto a conta existir.
--
-- PRIVILÉGIO MÍNIMO (camada 2; a camada 1 são os gatilhos). vuumbora_api: SÓ LEITURA em todo catálogo e
-- configuração; INSERT/UPDATE (nunca DELETE) em drivers, vehicles e driver_documents; EXECUTE nas duas
-- funções. Matriz em test/runtime-role.test.ts.
--
-- Zero downtime: só tabelas novas (vazias) + troca de CHECK em access_log (varre uma tabela de log, sem
-- reescrevê-la) + CREATE OR REPLACE de delete_account. Nada de CONCURRENTLY: cada migração roda numa transação.
--
-- Índices: só os de restrição + driver_documents (status, submitted_at, id) para a fila com cursor e
-- (driver_id, type_code, created_at) para "os documentos deste motorista". Catálogos são minúsculos.
--
-- Reversão: docs/sql/rollback/0024_down.sql (APAGA motoristas, veículos e metadados de documentos; exportar antes).

-- ======================================================================
-- 0) Peças comuns
-- ======================================================================

-- Catálogo e configuração: TRUNCATE ... CASCADE apagaria motoristas e documentos junto. Ninguém esvazia
-- catálogo (os testes truncam `accounts CASCADE`, que não alcança estas tabelas).
CREATE OR REPLACE FUNCTION driver_catalog_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '%: TRUNCATE não é permitido (catálogo referenciado por motoristas e documentos)', TG_TABLE_NAME
        USING ERRCODE = '42501';
END;
$$;

-- CPF: 11 dígitos, sem a sequência repetida, com os dois dígitos verificadores certos. IMMUTABLE (usado em CHECK).
CREATE OR REPLACE FUNCTION is_valid_cpf(p_cpf TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
    d   INT[];
    s   INT;
    dv  INT;
BEGIN
    IF p_cpf !~ '^[0-9]{11}$' OR p_cpf ~ '^(.)\1{10}$' THEN
        RETURN FALSE;
    END IF;
    d := string_to_array(p_cpf, NULL)::INT[];
    s := 0;
    FOR i IN 1..9 LOOP s := s + d[i] * (11 - i); END LOOP;
    dv := (s * 10) % 11;
    IF dv = 10 THEN dv := 0; END IF;
    IF dv <> d[10] THEN RETURN FALSE; END IF;
    s := 0;
    FOR i IN 1..10 LOOP s := s + d[i] * (12 - i); END LOOP;
    dv := (s * 10) % 11;
    IF dv = 10 THEN dv := 0; END IF;
    RETURN dv = d[11];
END;
$$;

-- ======================================================================
-- 1) cities e driver_settings
-- ======================================================================

CREATE TABLE IF NOT EXISTS cities (
    code       TEXT        PRIMARY KEY,
    name       TEXT        NOT NULL,
    state      TEXT        NOT NULL,
    ibge_code  TEXT        NULL,
    -- "Hoje" de validade de documento é o dia LOCAL da cidade (servidor em UTC erraria 3 h por dia).
    timezone   TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT cities_code_format CHECK (code ~ '^[a-z][a-z0-9-]{1,39}$'),
    CONSTRAINT cities_name_len CHECK (length(btrim(name)) BETWEEN 2 AND 80),
    CONSTRAINT cities_state_format CHECK (state ~ '^[A-Z]{2}$'),
    CONSTRAINT cities_ibge_format CHECK (ibge_code IS NULL OR ibge_code ~ '^[0-9]{7}$'),
    CONSTRAINT cities_timezone_format CHECK (timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)+$')
);

COMMENT ON TABLE cities IS 'Mercado de operação (Natal = Natal/RMN). Dono da lista de documentos e da configuração do motorista.';

DROP TRIGGER IF EXISTS cities_no_truncate ON cities;
CREATE TRIGGER cities_no_truncate BEFORE TRUNCATE ON cities
    FOR EACH STATEMENT EXECUTE FUNCTION driver_catalog_no_truncate();

INSERT INTO cities (code, name, state, ibge_code, timezone)
VALUES ('natal', 'Natal', 'RN', '2408102', 'America/Fortaleza')
ON CONFLICT (code) DO NOTHING;

-- Dia local da cidade (validade de documento). NULL se a cidade não existe.
CREATE OR REPLACE FUNCTION city_today(p_city_code TEXT) RETURNS DATE
LANGUAGE sql STABLE AS $$
    SELECT (now() AT TIME ZONE c.timezone)::date FROM cities c WHERE c.code = p_city_code
$$;

CREATE TABLE IF NOT EXISTS driver_settings (
    city_code             TEXT        PRIMARY KEY REFERENCES cities (code),
    -- Prazo da análise de documento, devolvido ao app (M04) e usado para destacar atraso na fila.
    review_sla_hours      SMALLINT    NOT NULL,
    -- `422 vehicle_too_old` em PUT /v1/driver/vehicle: ano corrente - ano de fabricação > este valor.
    max_vehicle_age_years SMALLINT    NOT NULL,
    -- TRUE enquanto os valores forem proposta da equipe, não aprovação do dono/da STTU.
    provisional           BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT driver_settings_sla_range CHECK (review_sla_hours BETWEEN 1 AND 720),
    CONSTRAINT driver_settings_vehicle_age_range CHECK (max_vehicle_age_years BETWEEN 1 AND 50)
);

DROP TRIGGER IF EXISTS driver_settings_set_updated_at ON driver_settings;
CREATE TRIGGER driver_settings_set_updated_at BEFORE UPDATE ON driver_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS driver_settings_no_truncate ON driver_settings;
CREATE TRIGGER driver_settings_no_truncate BEFORE TRUNCATE ON driver_settings
    FOR EACH STATEMENT EXECUTE FUNCTION driver_catalog_no_truncate();

-- Proposta (plano §6): 2 dias úteis ~ 48 h corridas; idade máxima 10 anos. Ambos provisórios.
INSERT INTO driver_settings (city_code, review_sla_hours, max_vehicle_age_years, provisional)
VALUES ('natal', 48, 10, TRUE)
ON CONFLICT (city_code) DO NOTHING;

-- ======================================================================
-- 2) document_types, versões da lista e itens
-- ======================================================================

CREATE TABLE IF NOT EXISTS document_types (
    code       TEXT        PRIMARY KEY,
    -- Nome mostrado ao motorista e ao revisor (provisório até a lista da STTU).
    label      TEXT        NOT NULL,
    -- 'vehicle': o documento é de UM veículo (exige vehicle_id); 'driver': da pessoa.
    scope      TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT document_types_code_format CHECK (code ~ '^[a-z][a-z0-9_]{1,39}$'),
    CONSTRAINT document_types_label_len CHECK (length(btrim(label)) BETWEEN 2 AND 80),
    CONSTRAINT document_types_scope_valid CHECK (scope IN ('driver', 'vehicle'))
);

DROP TRIGGER IF EXISTS document_types_no_truncate ON document_types;
CREATE TRIGGER document_types_no_truncate BEFORE TRUNCATE ON document_types
    FOR EACH STATEMENT EXECUTE FUNCTION driver_catalog_no_truncate();

INSERT INTO document_types (code, label, scope) VALUES
    ('cnh',             'CNH com EAR (exerce atividade remunerada)', 'driver'),
    ('crlv',            'Documento do veículo (CRLV)',               'vehicle'),
    ('criminal_record', 'Certidão de antecedentes criminais',        'driver'),
    ('inss',            'Comprovante de inscrição no INSS',          'driver'),
    ('profile_photo',   'Foto de perfil',                            'driver')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS document_requirement_versions (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    city_code    TEXT        NOT NULL REFERENCES cities (code),
    version      TEXT        NOT NULL,
    -- TRUE: lista provisória (mínimo federal), ainda não é a da autoridade municipal.
    provisional  BOOLEAN     NOT NULL,
    -- De onde veio a lista (lei, decreto, ofício da STTU).
    source       TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- NULL = rascunho. Preenchido pelo gatilho com o relógio do banco ao publicar; depois disso, imutável.
    published_at TIMESTAMPTZ NULL,
    CONSTRAINT document_requirement_versions_city_version_key UNIQUE (city_code, version),
    CONSTRAINT document_requirement_versions_version_format CHECK (version ~ '^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}$'),
    CONSTRAINT document_requirement_versions_source_len CHECK (length(btrim(source)) BETWEEN 3 AND 300)
);

CREATE TABLE IF NOT EXISTS document_requirements (
    version_id UUID     NOT NULL REFERENCES document_requirement_versions (id) ON DELETE CASCADE,
    type_code  TEXT     NOT NULL REFERENCES document_types (code),
    required   BOOLEAN  NOT NULL,
    -- TRUE: o revisor informa a validade ao aprovar; vencido bloqueia ficar online.
    has_expiry BOOLEAN  NOT NULL,
    sort_order SMALLINT NOT NULL,
    CONSTRAINT document_requirements_pkey PRIMARY KEY (version_id, type_code)
);

CREATE OR REPLACE FUNCTION document_requirement_versions_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Toda versão nasce rascunho: publicar é um passo explícito, depois dos itens.
        NEW.published_at := NULL;
        NEW.created_at := now();
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.published_at IS NULL THEN
            RETURN OLD; -- rascunho descartado (os itens vão em cascata)
        END IF;
        RAISE EXCEPTION 'document_requirement_versions: versão publicada é imutável (DELETE não é permitido)'
            USING ERRCODE = '42501';
    END IF;

    -- UPDATE
    IF OLD.published_at IS NOT NULL THEN
        RAISE EXCEPTION 'document_requirement_versions: versão publicada é imutável; publique a versão seguinte'
            USING ERRCODE = '42501';
    END IF;
    NEW.id := OLD.id;
    NEW.created_at := OLD.created_at;
    IF NEW.published_at IS NULL THEN
        RETURN NEW; -- edição do rascunho
    END IF;

    -- Publicação. Duas publicações da mesma cidade entram uma de cada vez; o relógio é lido DEPOIS da trava.
    PERFORM pg_advisory_xact_lock(hashtextextended('document_requirement_versions:' || NEW.city_code, 0));
    NEW.published_at := clock_timestamp();
    IF NOT EXISTS (SELECT 1 FROM document_requirements r WHERE r.version_id = NEW.id AND r.required) THEN
        RAISE EXCEPTION 'document_requirement_versions: a versão precisa de ao menos um documento obrigatório'
            USING ERRCODE = '23514', TABLE = 'document_requirement_versions',
                  CONSTRAINT = 'document_requirement_versions_has_required_item';
    END IF;
    IF EXISTS (SELECT 1 FROM document_requirement_versions v
                WHERE v.city_code = NEW.city_code AND v.id <> NEW.id AND v.published_at >= NEW.published_at) THEN
        RAISE EXCEPTION 'document_requirement_versions: publicação não é posterior à vigente (relógio do banco voltou?)'
            USING ERRCODE = '23514', TABLE = 'document_requirement_versions',
                  CONSTRAINT = 'document_requirement_versions_published_at_monotonic';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_requirement_versions_guard ON document_requirement_versions;
CREATE TRIGGER document_requirement_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON document_requirement_versions
    FOR EACH ROW EXECUTE FUNCTION document_requirement_versions_guard();
DROP TRIGGER IF EXISTS document_requirement_versions_no_truncate ON document_requirement_versions;
CREATE TRIGGER document_requirement_versions_no_truncate BEFORE TRUNCATE ON document_requirement_versions
    FOR EACH STATEMENT EXECUTE FUNCTION driver_catalog_no_truncate();

-- Item só muda enquanto a versão é rascunho. FOR SHARE na versão: a publicação (UPDATE) espera este item.
CREATE OR REPLACE FUNCTION document_requirements_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_published TIMESTAMPTZ;
    v_version   UUID;
    v_versions  UUID[] := ARRAY[]::UUID[];
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_versions := v_versions || OLD.version_id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_versions := v_versions || NEW.version_id;
    END IF;
    FOREACH v_version IN ARRAY v_versions
    LOOP
        SELECT v.published_at INTO v_published FROM document_requirement_versions v WHERE v.id = v_version FOR SHARE;
        -- Versão ausente: no INSERT quem recusa é a FK; no DELETE é a cascata de um rascunho descartado.
        IF FOUND AND v_published IS NOT NULL THEN
            RAISE EXCEPTION 'document_requirements: a versão já foi publicada e é imutável (% não é permitido)', TG_OP
                USING ERRCODE = '42501';
        END IF;
    END LOOP;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_requirements_guard ON document_requirements;
CREATE TRIGGER document_requirements_guard BEFORE INSERT OR UPDATE OR DELETE ON document_requirements
    FOR EACH ROW EXECUTE FUNCTION document_requirements_guard();
DROP TRIGGER IF EXISTS document_requirements_no_truncate ON document_requirements;
CREATE TRIGGER document_requirements_no_truncate BEFORE TRUNCATE ON document_requirements
    FOR EACH STATEMENT EXECUTE FUNCTION driver_catalog_no_truncate();

-- A definição ÚNICA de "lista vigente": a API (GET /v1/driver/verification, upload-url), os gatilhos e os testes leem daqui.
CREATE OR REPLACE VIEW current_document_requirements AS
    SELECT v.city_code, v.id AS version_id, v.version, v.provisional, v.published_at,
           r.type_code, t.label, t.scope, r.required, r.has_expiry, r.sort_order
      FROM (SELECT DISTINCT ON (x.city_code) x.*
              FROM document_requirement_versions x
             WHERE x.published_at IS NOT NULL
             ORDER BY x.city_code, x.published_at DESC) v
      JOIN document_requirements r ON r.version_id = v.id
      JOIN document_types t ON t.code = r.type_code;

COMMENT ON VIEW current_document_requirements IS
    'Itens da versão vigente (a publicada mais recente) da lista de documentos de cada cidade.';

-- Semente: o mínimo federal, provisório, publicado para Natal.
DO $$
DECLARE
    v_id UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM document_requirement_versions WHERE city_code = 'natal' AND version = '2026-11-federal') THEN
        RETURN;
    END IF;
    INSERT INTO document_requirement_versions (city_code, version, provisional, source)
    VALUES ('natal', '2026-11-federal', TRUE,
            'Lei 12.587/2012, art. 11-B (CNH com EAR, CRLV, antecedentes) e art. 11-A, III (INSS) + foto de perfil. Provisória até a lista da STTU.')
    RETURNING id INTO v_id;
    INSERT INTO document_requirements (version_id, type_code, required, has_expiry, sort_order) VALUES
        (v_id, 'cnh',             TRUE, TRUE,  10),
        (v_id, 'crlv',            TRUE, TRUE,  20),
        (v_id, 'criminal_record', TRUE, TRUE,  30),
        (v_id, 'inss',            TRUE, FALSE, 40),
        (v_id, 'profile_photo',   TRUE, FALSE, 50);
    UPDATE document_requirement_versions SET published_at = now() WHERE id = v_id;
END;
$$;

-- ======================================================================
-- 3) document_rejection_reasons (lista fechada; o texto vai ao motorista)
-- ======================================================================

CREATE TABLE IF NOT EXISTS document_rejection_reasons (
    code        TEXT        PRIMARY KEY,
    -- Texto mostrado ao motorista. Nota livre do revisor é só interna (driver_documents.review_note).
    driver_text TEXT        NOT NULL,
    -- FALSE: some da lista do revisor; recusas antigas continuam apontando para ele.
    active      BOOLEAN     NOT NULL DEFAULT TRUE,
    sort_order  SMALLINT    NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT document_rejection_reasons_code_format CHECK (code ~ '^[a-z][a-z0-9_]{1,39}$'),
    CONSTRAINT document_rejection_reasons_text_len CHECK (length(btrim(driver_text)) BETWEEN 10 AND 200)
);

DROP TRIGGER IF EXISTS document_rejection_reasons_no_truncate ON document_rejection_reasons;
CREATE TRIGGER document_rejection_reasons_no_truncate BEFORE TRUNCATE ON document_rejection_reasons
    FOR EACH STATEMENT EXECUTE FUNCTION driver_catalog_no_truncate();

-- Proposta da equipe (plano §6: o dono aprova o catálogo antes de publicar a M04).
INSERT INTO document_rejection_reasons (code, driver_text, sort_order) VALUES
    ('illegible',                'A imagem está ilegível. Envie de novo, com boa luz e sem reflexo.',                        10),
    ('cropped',                  'O documento aparece cortado. Envie com as quatro bordas visíveis.',                         20),
    ('expired',                  'O documento está vencido. Envie a versão dentro da validade.',                              30),
    ('wrong_document',           'Este não é o documento pedido. Confira e envie o documento certo.',                         40),
    ('data_mismatch',            'Os dados não conferem com o seu cadastro (nome, CPF ou placa).',                            50),
    ('cnh_missing_ear',          'A CNH não traz a observação EAR (exerce atividade remunerada).',                            60),
    ('cnh_category_not_allowed', 'A categoria da CNH precisa ser B ou superior.',                                             70),
    ('photo_not_compliant',      'A foto precisa mostrar o seu rosto de frente, sem óculos escuros, boné ou filtro.',         80),
    ('certificate_not_accepted', 'A certidão não pôde ser aceita. Fale com o suporte para saber o próximo passo.',            90),
    ('vehicle_not_compliant',    'O veículo não atende aos requisitos de ano ou modelo.',                                    100),
    ('other',                    'O documento precisa de correção. Fale com o suporte para saber o que ajustar.',           110)
ON CONFLICT (code) DO NOTHING;

-- ======================================================================
-- 4) drivers
-- ======================================================================

CREATE TABLE IF NOT EXISTS drivers (
    -- Chave compartilhada com a conta: não existe motorista sem conta (e o gatilho exige conta 'driver').
    account_id           UUID        PRIMARY KEY REFERENCES accounts (id),
    application_id       UUID        NOT NULL REFERENCES driver_applications (id),
    city_code            TEXT        NOT NULL REFERENCES cities (code),
    status               TEXT        NOT NULL DEFAULT 'pending',
    linked_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at          TIMESTAMPTZ NULL,
    suspended_at         TIMESTAMPTZ NULL,
    suspended_by         UUID        NULL REFERENCES admin_users (id),
    suspension_reason    TEXT        NULL,
    -- Etapa 2 (PUT /v1/driver/onboarding). Nascimento NÃO mora aqui: é accounts.birth_date (0019).
    cpf                  TEXT        NULL,
    cnh_number           TEXT        NULL,
    cnh_category         TEXT        NULL,
    cnh_expires_on       DATE        NULL,
    address_postal_code  TEXT        NULL,
    address_street       TEXT        NULL,
    address_number       TEXT        NULL,
    address_complement   TEXT        NULL,
    address_neighborhood TEXT        NULL,
    address_city         TEXT        NULL,
    address_state        TEXT        NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Uma candidatura vira no máximo um motorista.
    CONSTRAINT drivers_application_key UNIQUE (application_id),
    CONSTRAINT drivers_status_valid CHECK (status IN ('pending', 'approved', 'suspended', 'deleted')),
    CONSTRAINT drivers_approved_has_date CHECK (status <> 'approved' OR approved_at IS NOT NULL),
    CONSTRAINT drivers_suspension_complete CHECK (
        status <> 'suspended' OR (suspended_at IS NOT NULL AND suspended_by IS NOT NULL AND suspension_reason IS NOT NULL)),
    CONSTRAINT drivers_suspension_reason_len CHECK (suspension_reason IS NULL OR length(btrim(suspension_reason)) BETWEEN 3 AND 500),
    CONSTRAINT drivers_cpf_valid CHECK (cpf IS NULL OR is_valid_cpf(cpf)),
    -- Número de registro da CNH: 11 dígitos. Categoria B ou superior (Lei 12.587, art. 11-B, I).
    CONSTRAINT drivers_cnh_number_format CHECK (cnh_number IS NULL OR cnh_number ~ '^[0-9]{11}$'),
    CONSTRAINT drivers_cnh_category_valid CHECK (cnh_category IS NULL OR cnh_category IN ('B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE')),
    CONSTRAINT drivers_cnh_complete CHECK (num_nulls(cnh_number, cnh_category, cnh_expires_on) IN (0, 3)),
    CONSTRAINT drivers_address_complete CHECK (
        num_nulls(address_postal_code, address_street, address_number, address_neighborhood, address_city, address_state) IN (0, 6)
        AND (address_complement IS NULL OR address_postal_code IS NOT NULL)),
    CONSTRAINT drivers_address_format CHECK (
        (address_postal_code IS NULL OR address_postal_code ~ '^[0-9]{8}$')
        AND (address_state IS NULL OR address_state ~ '^[A-Z]{2}$')
        AND (address_street IS NULL OR length(btrim(address_street)) BETWEEN 1 AND 120)
        AND (address_number IS NULL OR length(btrim(address_number)) BETWEEN 1 AND 20)
        AND (address_complement IS NULL OR length(btrim(address_complement)) BETWEEN 1 AND 60)
        AND (address_neighborhood IS NULL OR length(btrim(address_neighborhood)) BETWEEN 1 AND 80)
        AND (address_city IS NULL OR length(btrim(address_city)) BETWEEN 1 AND 80)),
    -- Conta excluída: nenhum dado pessoal da etapa 2 fica (delete_account apaga).
    CONSTRAINT drivers_deleted_scrubbed CHECK (
        status <> 'deleted' OR num_nonnulls(cpf, cnh_number, cnh_category, cnh_expires_on, address_postal_code, address_street,
                                            address_number, address_complement, address_neighborhood, address_city, address_state,
                                            suspension_reason) = 0)
);

-- Uma pessoa, um motorista: o mesmo CPF não abre segunda conta de motorista (ex.: suspenso tentando de novo).
CREATE UNIQUE INDEX IF NOT EXISTS drivers_cpf_key ON drivers (cpf) WHERE cpf IS NOT NULL;

DROP TRIGGER IF EXISTS drivers_set_updated_at ON drivers;
CREATE TRIGGER drivers_set_updated_at BEFORE UPDATE ON drivers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ======================================================================
-- 5) vehicles
-- ======================================================================

CREATE TABLE IF NOT EXISTS vehicles (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id        UUID        NOT NULL REFERENCES drivers (account_id),
    -- Maiúsculas, sem hífen: ABC1234 (antiga) ou ABC1D23 (Mercosul).
    plate            TEXT        NOT NULL,
    brand            TEXT        NOT NULL,
    model            TEXT        NOT NULL,
    -- Ano de FABRICAÇÃO (o do CRLV). A idade máxima vem de driver_settings.
    manufacture_year SMALLINT    NOT NULL,
    color            TEXT        NOT NULL,
    status           TEXT        NOT NULL DEFAULT 'active',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deactivated_at   TIMESTAMPTZ NULL,
    -- Alvo da FK composta de driver_documents: documento de veículo é do veículo DESTE motorista.
    CONSTRAINT vehicles_id_driver_key UNIQUE (id, driver_id),
    CONSTRAINT vehicles_plate_format CHECK (plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
    CONSTRAINT vehicles_brand_len CHECK (length(btrim(brand)) BETWEEN 1 AND 40),
    CONSTRAINT vehicles_model_len CHECK (length(btrim(model)) BETWEEN 1 AND 60),
    CONSTRAINT vehicles_year_range CHECK (manufacture_year BETWEEN 1950 AND 2100),
    CONSTRAINT vehicles_color_len CHECK (length(btrim(color)) BETWEEN 1 AND 30),
    CONSTRAINT vehicles_status_valid CHECK (status IN ('active', 'inactive')),
    CONSTRAINT vehicles_deactivated_consistent CHECK ((status = 'inactive') = (deactivated_at IS NOT NULL))
);

-- `409 plate_in_use`: a placa só está ATIVA para um motorista (o histórico fica). Um veículo ativo por motorista.
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_active_plate_key ON vehicles (plate) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_active_driver_key ON vehicles (driver_id) WHERE status = 'active';

DROP TRIGGER IF EXISTS vehicles_set_updated_at ON vehicles;
CREATE TRIGGER vehicles_set_updated_at BEFORE UPDATE ON vehicles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Outro carro = outro cadastro: senão o CRLV aprovado de um carro valeria para outro (troca de placa na mesma linha).
CREATE OR REPLACE FUNCTION vehicles_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF EXISTS (SELECT 1 FROM drivers d WHERE d.account_id = NEW.driver_id AND d.status = 'deleted') THEN
            RAISE EXCEPTION 'vehicles: motorista de conta excluída'
                USING ERRCODE = '23514', TABLE = 'vehicles', CONSTRAINT = 'vehicles_driver_not_deleted';
        END IF;
        NEW.status := 'active';
        NEW.deactivated_at := NULL;
        NEW.created_at := now();
        RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
       OR NEW.plate IS DISTINCT FROM OLD.plate OR NEW.brand IS DISTINCT FROM OLD.brand
       OR NEW.model IS DISTINCT FROM OLD.model OR NEW.manufacture_year IS DISTINCT FROM OLD.manufacture_year
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'vehicles: placa, marca, modelo e ano são imutáveis (outro carro = novo cadastro)'
            USING ERRCODE = '42501';
    END IF;
    IF OLD.status = 'inactive' AND NEW.status = 'active' THEN
        RAISE EXCEPTION 'vehicles: veículo inativo não volta (cadastre de novo; o CRLV é revisado de novo)'
            USING ERRCODE = '23514', TABLE = 'vehicles', CONSTRAINT = 'vehicles_status_transition';
    END IF;
    IF OLD.status = 'active' AND NEW.status = 'inactive' THEN
        NEW.deactivated_at := now();
    ELSE
        NEW.deactivated_at := OLD.deactivated_at;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vehicles_guard ON vehicles;
CREATE TRIGGER vehicles_guard BEFORE INSERT OR UPDATE ON vehicles
    FOR EACH ROW EXECUTE FUNCTION vehicles_guard();

-- ======================================================================
-- 6) driver_documents (metadados + fila de revisão)
-- ======================================================================

CREATE TABLE IF NOT EXISTS driver_documents (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id         UUID        NOT NULL REFERENCES drivers (account_id),
    type_code         TEXT        NOT NULL REFERENCES document_types (code),
    -- Só para tipo de escopo 'vehicle' (gatilho); a FK composta exige veículo do mesmo motorista.
    vehicle_id        UUID        NULL,
    -- Chave do objeto no armazenamento (prefixo da credencial: driver-docs/). O arquivo NUNCA entra no banco.
    storage_key       TEXT        NOT NULL,
    content_type      TEXT        NOT NULL,
    size_bytes        INTEGER     NOT NULL,
    -- SHA-256 declarado pelo app no upload-url e conferido no submit (409 upload_missing se diferente).
    sha256            TEXT        NOT NULL,
    status            TEXT        NOT NULL DEFAULT 'awaiting_upload',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at      TIMESTAMPTZ NULL,
    reviewed_at       TIMESTAMPTZ NULL,
    reviewed_by       UUID        NULL REFERENCES admin_users (id),
    rejection_code    TEXT        NULL REFERENCES document_rejection_reasons (code),
    -- Nota livre do revisor: INTERNA, nunca vai ao motorista (ele vê o texto do motivo).
    review_note       TEXT        NULL,
    -- Validade informada pelo revisor ao aprovar (tipos com has_expiry).
    expires_on        DATE        NULL,
    CONSTRAINT driver_documents_vehicle_fk FOREIGN KEY (vehicle_id, driver_id) REFERENCES vehicles (id, driver_id),
    CONSTRAINT driver_documents_storage_key_key UNIQUE (storage_key),
    -- Tamanho por length(), não por {m,n}: o regex do Postgres recusa contagem acima de 255 (2201B), e só ao avaliar a linha.
    CONSTRAINT driver_documents_storage_key_format CHECK (
        storage_key ~ '^driver-docs/[A-Za-z0-9][A-Za-z0-9/_.-]*$' AND length(storage_key) <= 400
        AND position('..' IN storage_key) = 0 AND position('//' IN storage_key) = 0),
    CONSTRAINT driver_documents_content_type_valid CHECK (content_type IN ('image/jpeg', 'image/png', 'application/pdf')),
    -- Até 10 MB (10 MiB), como no contrato de upload-url (413 file_too_large).
    CONSTRAINT driver_documents_size_range CHECK (size_bytes BETWEEN 1 AND 10485760),
    CONSTRAINT driver_documents_sha256_format CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT driver_documents_status_valid CHECK (status IN (
        'awaiting_upload', 'submitted', 'approved', 'rejected', 'expired', 'superseded', 'withdrawn')),
    CONSTRAINT driver_documents_submitted_has_date CHECK (
        status NOT IN ('submitted', 'approved', 'rejected', 'expired') OR submitted_at IS NOT NULL),
    CONSTRAINT driver_documents_reviewed_complete CHECK (
        status NOT IN ('approved', 'rejected', 'expired') OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)),
    CONSTRAINT driver_documents_rejected_has_reason CHECK (status <> 'rejected' OR rejection_code IS NOT NULL),
    CONSTRAINT driver_documents_expired_has_date CHECK (status <> 'expired' OR expires_on IS NOT NULL),
    CONSTRAINT driver_documents_review_note_len CHECK (review_note IS NULL OR length(btrim(review_note)) BETWEEN 1 AND 1000)
);

-- Um envio EM ANDAMENTO e um APROVADO por motorista + tipo + veículo (o veículo nulo vira o UUID zero).
CREATE UNIQUE INDEX IF NOT EXISTS driver_documents_one_in_flight_key
    ON driver_documents (driver_id, type_code, COALESCE(vehicle_id, '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE status IN ('awaiting_upload', 'submitted');
CREATE UNIQUE INDEX IF NOT EXISTS driver_documents_one_approved_key
    ON driver_documents (driver_id, type_code, COALESCE(vehicle_id, '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE status = 'approved';
-- Fila do revisor: `WHERE status = $1 ORDER BY submitted_at, id` com cursor (submitted_at, id) — mais antigo primeiro.
CREATE INDEX IF NOT EXISTS driver_documents_review_queue_idx ON driver_documents (status, submitted_at, id);
-- "Os documentos deste motorista" (verificação no app, detalhe no painel, driver_approval_blockers).
CREATE INDEX IF NOT EXISTS driver_documents_driver_idx ON driver_documents (driver_id, type_code, created_at DESC);

CREATE OR REPLACE FUNCTION driver_documents_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_driver_status TEXT;
    v_city          TEXT;
    v_scope         TEXT;
    v_role          TEXT;
    v_deactivated   TIMESTAMPTZ;
    v_active        BOOLEAN;
    v_expected      driver_documents;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT d.status, d.city_code INTO v_driver_status, v_city FROM drivers d WHERE d.account_id = NEW.driver_id;
        IF NOT FOUND THEN
            RETURN NEW; -- quem recusa é a FK de driver_id
        END IF;
        IF v_driver_status = 'deleted' THEN
            RAISE EXCEPTION 'driver_documents: motorista de conta excluída'
                USING ERRCODE = '23514', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_driver_not_deleted';
        END IF;
        -- `422 unknown_document_type`: o tipo tem de estar na lista VIGENTE da cidade do motorista.
        SELECT r.scope INTO v_scope FROM current_document_requirements r WHERE r.city_code = v_city AND r.type_code = NEW.type_code;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'driver_documents: tipo fora da lista vigente da cidade'
                USING ERRCODE = '23514', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_type_in_current_list';
        END IF;
        IF (v_scope = 'vehicle') <> (NEW.vehicle_id IS NOT NULL) THEN
            RAISE EXCEPTION 'driver_documents: documento de veículo exige vehicle_id; documento pessoal não aceita'
                USING ERRCODE = '23514', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_vehicle_scope';
        END IF;
        IF NEW.vehicle_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM vehicles v WHERE v.id = NEW.vehicle_id AND v.status = 'active') THEN
            RAISE EXCEPTION 'driver_documents: o veículo não está ativo'
                USING ERRCODE = '23514', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_vehicle_active';
        END IF;
        -- Todo envio nasce aguardando o arquivo; estado e decisão só mudam pelas transições abaixo.
        NEW.status := 'awaiting_upload';
        NEW.created_at := now();
        NEW.status_changed_at := now();
        NEW.submitted_at := NULL;
        NEW.reviewed_at := NULL;
        NEW.reviewed_by := NULL;
        NEW.rejection_code := NULL;
        NEW.review_note := NULL;
        NEW.expires_on := NULL;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        -- Documento vivo não some (rotina de descarte só apaga o que já saiu de uso).
        IF OLD.status IN ('awaiting_upload', 'submitted', 'approved') THEN
            RAISE EXCEPTION 'driver_documents: documento em uso não se apaga (estado %)', OLD.status
                USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE: só mudança de estado, e só pelas transições permitidas.
    IF NEW.status = OLD.status THEN
        IF NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION 'driver_documents: o documento só muda pela troca de estado'
                USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    IF NOT (
           (OLD.status = 'awaiting_upload' AND NEW.status IN ('submitted', 'superseded', 'withdrawn'))
        OR (OLD.status = 'submitted'       AND NEW.status IN ('approved', 'rejected', 'superseded', 'withdrawn'))
        OR (OLD.status = 'approved'        AND NEW.status IN ('expired', 'superseded', 'withdrawn'))
        OR (OLD.status IN ('rejected', 'expired', 'superseded') AND NEW.status = 'withdrawn')
    ) THEN
        RAISE EXCEPTION 'driver_documents: transição % -> % não é permitida', OLD.status, NEW.status
            USING ERRCODE = '23514', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_status_transition';
    END IF;

    -- Linha esperada: a antiga com o novo estado e, só na decisão, os campos da decisão. Qualquer outra
    -- diferença (chave, hash, revisor de uma decisão já tomada...) é adulteração.
    v_expected := OLD;
    v_expected.status := NEW.status;
    v_expected.status_changed_at := NEW.status_changed_at;
    IF NEW.status = 'submitted' THEN
        v_expected.submitted_at := NEW.submitted_at;
    ELSIF NEW.status = 'approved' THEN
        v_expected.reviewed_at := NEW.reviewed_at;
        v_expected.reviewed_by := NEW.reviewed_by;
        v_expected.review_note := NEW.review_note;
        v_expected.expires_on := NEW.expires_on;
    ELSIF NEW.status = 'rejected' THEN
        v_expected.reviewed_at := NEW.reviewed_at;
        v_expected.reviewed_by := NEW.reviewed_by;
        v_expected.review_note := NEW.review_note;
        v_expected.rejection_code := NEW.rejection_code;
    END IF;
    IF NEW IS DISTINCT FROM v_expected THEN
        RAISE EXCEPTION 'driver_documents: só os campos da transição % -> % podem mudar', OLD.status, NEW.status
            USING ERRCODE = '42501';
    END IF;

    IF NEW.status IN ('approved', 'rejected') THEN
        -- Decisão 9: só revisor de documentos ou dono, com acesso ativo.
        SELECT a.role, a.deactivated_at INTO v_role, v_deactivated FROM admin_users a WHERE a.id = NEW.reviewed_by;
        IF v_role IS NULL OR v_role NOT IN ('revisor_documentos', 'dono') OR v_deactivated IS NOT NULL THEN
            RAISE EXCEPTION 'driver_documents: só revisor_documentos ou dono, ativos, revisam documento'
                USING ERRCODE = '42501', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_reviewer_role';
        END IF;
        NEW.reviewed_at := now();
    END IF;

    -- Sem motivo quem recusa é o CHECK driver_documents_rejected_has_reason; motivo desconhecido ou aposentado, aqui.
    IF NEW.status = 'rejected' AND NEW.rejection_code IS NOT NULL THEN
        SELECT r.active INTO v_active FROM document_rejection_reasons r WHERE r.code = NEW.rejection_code;
        IF v_active IS NOT TRUE THEN
            RAISE EXCEPTION 'driver_documents: motivo de recusa fora da lista ativa'
                USING ERRCODE = '23503', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_rejection_reason_active';
        END IF;
    END IF;

    IF NEW.status = 'approved' AND NEW.expires_on IS NOT NULL
       AND NEW.expires_on < city_today((SELECT d.city_code FROM drivers d WHERE d.account_id = NEW.driver_id)) THEN
        RAISE EXCEPTION 'driver_documents: não se aprova documento já vencido'
            USING ERRCODE = '23514', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_not_expired_on_approval';
    END IF;

    IF NEW.status = 'expired'
       AND NOT (OLD.expires_on < city_today((SELECT d.city_code FROM drivers d WHERE d.account_id = NEW.driver_id))) THEN
        RAISE EXCEPTION 'driver_documents: o documento ainda está dentro da validade'
            USING ERRCODE = '23514', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_expired_after_date';
    END IF;

    IF NEW.status = 'submitted' THEN
        NEW.submitted_at := now();
    END IF;
    NEW.status_changed_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS driver_documents_guard ON driver_documents;
CREATE TRIGGER driver_documents_guard BEFORE INSERT OR UPDATE OR DELETE ON driver_documents
    FOR EACH ROW EXECUTE FUNCTION driver_documents_guard();

-- ======================================================================
-- 7) driver_approval_blockers: o que impede este motorista de ser aprovado (e de ficar online)
-- ======================================================================
-- Zero linhas = pode. Uma consulta só (sem N+1). blocker:
--   driver_not_found | no_published_requirements | onboarding_incomplete | no_active_vehicle
--   | document_missing (type_code) | document_expired (type_code)
-- "Satisfeito" = documento APROVADO do tipo, dentro da validade no dia local da cidade e, se for de veículo,
-- do veículo ATIVO. SECURITY INVOKER: a API lê todas as tabelas envolvidas.
CREATE OR REPLACE FUNCTION driver_approval_blockers(p_driver_id UUID)
RETURNS TABLE (blocker TEXT, type_code TEXT)
LANGUAGE sql STABLE AS $$
    WITH d AS (
        SELECT dr.account_id, dr.city_code, city_today(dr.city_code) AS today,
               (dr.cpf IS NOT NULL AND dr.cnh_number IS NOT NULL AND dr.address_postal_code IS NOT NULL) AS onboarded,
               (SELECT v.id FROM vehicles v WHERE v.driver_id = dr.account_id AND v.status = 'active') AS vehicle_id
          FROM drivers dr
         WHERE dr.account_id = p_driver_id
    ),
    pending AS (
        SELECT r.type_code, r.scope, r.sort_order, d.*
          FROM d
          JOIN current_document_requirements r ON r.city_code = d.city_code AND r.required
         WHERE NOT EXISTS (
                SELECT 1 FROM driver_documents doc
                 WHERE doc.driver_id = d.account_id AND doc.type_code = r.type_code
                   AND doc.status = 'approved'
                   AND (doc.expires_on IS NULL OR doc.expires_on >= d.today)
                   AND (r.scope = 'driver' OR doc.vehicle_id = d.vehicle_id))
    )
    SELECT x.blocker, x.type_code FROM (
        SELECT 'driver_not_found' AS blocker, NULL::text AS type_code, 0 AS ord
         WHERE NOT EXISTS (SELECT 1 FROM d)
        UNION ALL
        SELECT 'no_published_requirements', NULL, 1 FROM d
         WHERE NOT EXISTS (SELECT 1 FROM current_document_requirements r WHERE r.city_code = d.city_code)
        UNION ALL
        SELECT 'onboarding_incomplete', NULL, 2 FROM d WHERE NOT d.onboarded
        UNION ALL
        SELECT 'no_active_vehicle', NULL, 3 FROM d WHERE d.vehicle_id IS NULL
        UNION ALL
        SELECT CASE WHEN EXISTS (
                    SELECT 1 FROM driver_documents doc
                     WHERE doc.driver_id = p.account_id AND doc.type_code = p.type_code
                       AND doc.status IN ('approved', 'expired') AND doc.expires_on < p.today
                       AND (p.scope = 'driver' OR doc.vehicle_id = p.vehicle_id))
                    THEN 'document_expired' ELSE 'document_missing' END,
               p.type_code, 100 + p.sort_order
          FROM pending p
    ) x
    ORDER BY x.ord, x.type_code
$$;

REVOKE ALL ON FUNCTION driver_approval_blockers(UUID) FROM PUBLIC;

-- Gatilho de drivers: vínculo válido no INSERT; no UPDATE, campos de identidade fixos, CPF não troca,
-- transições de estado com as regras de N4 (aprovação) e da decisão 9 (quem suspende).
CREATE OR REPLACE FUNCTION drivers_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_type       TEXT;
    v_email      TEXT;
    v_verified   TIMESTAMPTZ;
    v_acc_status TEXT;
    v_app_email  TEXT;
    v_app_status TEXT;
    v_role       TEXT;
    v_deact      TIMESTAMPTZ;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT a.account_type, a.email, a.email_verified_at, a.status
          INTO v_type, v_email, v_verified, v_acc_status
          FROM accounts a WHERE a.id = NEW.account_id;
        IF NOT FOUND THEN
            RETURN NEW; -- quem recusa é a FK de account_id
        END IF;
        IF v_type <> 'driver' THEN
            RAISE EXCEPTION 'drivers: a conta não é de motorista'
                USING ERRCODE = '23514', TABLE = 'drivers', CONSTRAINT = 'drivers_account_is_driver';
        END IF;
        IF v_acc_status <> 'active' OR v_verified IS NULL THEN
            RAISE EXCEPTION 'drivers: a conta precisa estar ativa e com e-mail verificado'
                USING ERRCODE = '23514', TABLE = 'drivers', CONSTRAINT = 'drivers_account_verified';
        END IF;
        SELECT da.email, da.status INTO v_app_email, v_app_status FROM driver_applications da WHERE da.id = NEW.application_id;
        IF NOT FOUND THEN
            RETURN NEW; -- quem recusa é a FK de application_id
        END IF;
        IF v_app_status <> 'approved' THEN
            RAISE EXCEPTION 'drivers: a candidatura não está aprovada'
                USING ERRCODE = '23514', TABLE = 'drivers', CONSTRAINT = 'drivers_application_approved';
        END IF;
        IF lower(btrim(v_app_email)) <> v_email THEN
            RAISE EXCEPTION 'drivers: o e-mail da candidatura não é o da conta'
                USING ERRCODE = '23514', TABLE = 'drivers', CONSTRAINT = 'drivers_application_email_match';
        END IF;
        NEW.status := 'pending';
        NEW.linked_at := now();
        NEW.created_at := now();
        NEW.approved_at := NULL;
        NEW.suspended_at := NULL;
        NEW.suspended_by := NULL;
        NEW.suspension_reason := NULL;
        RETURN NEW;
    END IF;

    -- UPDATE
    IF OLD.status = 'deleted' THEN
        RAISE EXCEPTION 'drivers: motorista de conta excluída não muda'
            USING ERRCODE = '42501';
    END IF;
    IF NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.application_id IS DISTINCT FROM OLD.application_id
       OR NEW.city_code IS DISTINCT FROM OLD.city_code OR NEW.linked_at IS DISTINCT FROM OLD.linked_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'drivers: conta, candidatura, cidade e data do vínculo são imutáveis'
            USING ERRCODE = '42501';
    END IF;
    -- CPF identifica a pessoa: uma vez informado, não troca (só sai na exclusão da conta).
    IF OLD.cpf IS NOT NULL AND NEW.cpf IS DISTINCT FROM OLD.cpf AND NEW.status <> 'deleted' THEN
        RAISE EXCEPTION 'drivers: o CPF não muda depois de informado'
            USING ERRCODE = '23514', TABLE = 'drivers', CONSTRAINT = 'drivers_cpf_immutable';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'pending' THEN
            RAISE EXCEPTION 'drivers: transição % -> pending não é permitida', OLD.status
                USING ERRCODE = '23514', TABLE = 'drivers', CONSTRAINT = 'drivers_status_transition';
        ELSIF NEW.status = 'approved' THEN
            -- N4: aprovado só com a lista vigente satisfeita, etapa 2 completa e veículo ativo.
            IF EXISTS (SELECT 1 FROM driver_approval_blockers(NEW.account_id)) THEN
                RAISE EXCEPTION 'drivers: há pendências para aprovar o motorista (ver driver_approval_blockers)'
                    USING ERRCODE = '23514', TABLE = 'drivers', CONSTRAINT = 'drivers_approval_blocked';
            END IF;
            NEW.approved_at := now();
            NEW.suspended_at := NULL;
            NEW.suspended_by := NULL;
            NEW.suspension_reason := NULL;
        ELSIF NEW.status = 'suspended' THEN
            SELECT a.role, a.deactivated_at INTO v_role, v_deact FROM admin_users a WHERE a.id = NEW.suspended_by;
            IF v_role IS NULL OR v_role NOT IN ('revisor_documentos', 'dono') OR v_deact IS NOT NULL THEN
                RAISE EXCEPTION 'drivers: só revisor_documentos ou dono, ativos, suspendem motorista'
                    USING ERRCODE = '42501', TABLE = 'drivers', CONSTRAINT = 'drivers_suspender_role';
            END IF;
            NEW.suspended_at := now();
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS drivers_guard ON drivers;
CREATE TRIGGER drivers_guard BEFORE INSERT OR UPDATE ON drivers
    FOR EACH ROW EXECUTE FUNCTION drivers_guard();

-- ======================================================================
-- 8) link_driver_application: o vínculo candidatura -> conta (N3)
-- ======================================================================
-- Idempotente. result:
--   linked | already_linked             -> 200 { driverId, status }
--   email_not_verified                  -> 409 email_not_verified
--   application_not_approved            -> 409 application_not_approved (sem candidatura aprovada com este e-mail)
--   application_already_linked          -> 409 (a candidatura já é de outra conta, ex.: conta anterior excluída)
--   not_found | not_driver_account | account_inactive -> a sessão não deveria existir (401/403)
-- Concorrência: duas chamadas da mesma conta -> o INSERT da segunda espera o da primeira e cai no
-- ON CONFLICT; ela devolve already_linked.
CREATE OR REPLACE FUNCTION link_driver_application(p_account_id UUID, p_city_code TEXT)
RETURNS TABLE (result TEXT, driver_status TEXT)
LANGUAGE plpgsql AS $$
DECLARE
    v_type       TEXT;
    v_email      TEXT;
    v_verified   TIMESTAMPTZ;
    v_acc_status TEXT;
    v_status     TEXT;
    v_app_id     UUID;
    v_inserted   INT;
BEGIN
    SELECT a.account_type, a.email, a.email_verified_at, a.status INTO v_type, v_email, v_verified, v_acc_status
      FROM accounts a WHERE a.id = p_account_id;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_found'::text, NULL::text;
        RETURN;
    END IF;
    IF v_type <> 'driver' THEN
        RETURN QUERY SELECT 'not_driver_account'::text, NULL::text;
        RETURN;
    END IF;

    SELECT d.status INTO v_status FROM drivers d WHERE d.account_id = p_account_id;
    IF FOUND THEN
        RETURN QUERY SELECT 'already_linked'::text, v_status;
        RETURN;
    END IF;

    IF v_acc_status <> 'active' THEN
        RETURN QUERY SELECT 'account_inactive'::text, NULL::text;
        RETURN;
    END IF;
    IF v_verified IS NULL THEN
        RETURN QUERY SELECT 'email_not_verified'::text, NULL::text;
        RETURN;
    END IF;

    -- Igualdade exata: os dois e-mails já estão normalizados (usa driver_applications_email_key).
    -- FOR SHARE: a candidatura não muda de estado enquanto o vínculo é gravado.
    SELECT da.id INTO v_app_id FROM driver_applications da
     WHERE da.email = v_email AND da.status = 'approved'
       FOR SHARE;
    IF v_app_id IS NULL THEN
        RETURN QUERY SELECT 'application_not_approved'::text, NULL::text;
        RETURN;
    END IF;

    INSERT INTO drivers (account_id, application_id, city_code)
    VALUES (p_account_id, v_app_id, p_city_code)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    SELECT d.status INTO v_status FROM drivers d WHERE d.account_id = p_account_id;
    IF v_inserted = 1 THEN
        RETURN QUERY SELECT 'linked'::text, v_status;
    ELSIF v_status IS NOT NULL THEN
        RETURN QUERY SELECT 'already_linked'::text, v_status;
    ELSE
        RETURN QUERY SELECT 'application_already_linked'::text, NULL::text;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION link_driver_application(UUID, TEXT) FROM PUBLIC;

-- ======================================================================
-- 9) Exclusão de conta (0022) passa a cobrir o motorista; trilha de acesso ganha o evento do vínculo
-- ======================================================================

-- O vínculo é ação do MOTORISTA (sem admin): vai para access_log, não para admin_audit_log (admin_id NOT NULL).
ALTER TABLE access_log DROP CONSTRAINT IF EXISTS access_log_event_valid;
ALTER TABLE access_log ADD CONSTRAINT access_log_event_valid CHECK (event IN (
    'login_success', 'login_failure', 'login_blocked', 'token_refresh',
    'token_reuse_detected', 'logout', 'logout_all', 'password_changed',
    'register', 'email_code_sent', 'email_verified', 'password_reset_requested', 'password_reset_completed',
    'account_deleted', 'driver_application_linked'
));

-- Igual à 0022, mais o bloco do motorista: documentos retirados (vão para o descarte do objeto), veículo
-- inativo (libera a placa) e etapa 2 apagada (CPF, CNH, endereço). A candidatura (driver_applications) segue
-- com a regra própria de exclusão (scripts *:delete do operador).
CREATE OR REPLACE FUNCTION delete_account(
    p_account_id           UUID,
    p_scrub_password_hash  TEXT
) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT a.status INTO v_status FROM accounts a WHERE a.id = p_account_id FOR UPDATE;

    IF v_status IS NULL THEN
        RETURN 'not_found';
    END IF;
    IF v_status = 'deleted' THEN
        RETURN 'already_deleted';
    END IF;

    UPDATE accounts AS a
       SET email      = 'excluida-' || p_account_id || '@excluida.vuumbora.invalid',
           full_name  = 'Conta excluída',
           phone      = NULL,
           birth_date = NULL,
           status     = 'deleted',
           deleted_at = now()
     WHERE a.id = p_account_id;

    UPDATE account_credentials AS c
       SET password_hash = p_scrub_password_hash
     WHERE c.account_id = p_account_id;

    UPDATE devices AS d
       SET device_label = NULL,
           revoked_at   = COALESCE(d.revoked_at, now())
     WHERE d.account_id = p_account_id;

    UPDATE refresh_token_families AS f
       SET revoked_at = now(), revoke_reason = 'account_deleted'
     WHERE f.account_id = p_account_id AND f.revoked_at IS NULL;

    UPDATE account_email_codes AS c
       SET closed_at = now(), close_reason = 'account_deleted'
     WHERE c.account_id = p_account_id AND c.closed_at IS NULL;

    -- 0024: motorista (nenhuma linha para conta de passageiro).
    UPDATE driver_documents AS doc
       SET status = 'withdrawn'
     WHERE doc.driver_id = p_account_id AND doc.status <> 'withdrawn';

    UPDATE vehicles AS v
       SET status = 'inactive'
     WHERE v.driver_id = p_account_id AND v.status = 'active';

    UPDATE drivers AS dr
       SET status = 'deleted',
           cpf = NULL, cnh_number = NULL, cnh_category = NULL, cnh_expires_on = NULL,
           address_postal_code = NULL, address_street = NULL, address_number = NULL, address_complement = NULL,
           address_neighborhood = NULL, address_city = NULL, address_state = NULL,
           suspended_at = NULL, suspended_by = NULL, suspension_reason = NULL
     WHERE dr.account_id = p_account_id AND dr.status <> 'deleted';

    RETURN 'ok';
END;
$$;

-- ======================================================================
-- 10) Privilégios do papel de runtime (camada 2)
-- ======================================================================
-- A 0012 deixou DML completo como padrão para tabela (e view) nova: o REVOKE é aqui. Nunca derruba o boot.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vuumbora_api') THEN
        RAISE NOTICE '[0024] o papel vuumbora_api não existe; só os gatilhos protegem as tabelas do motorista.';
        RETURN;
    END IF;

    BEGIN
        -- Catálogo e configuração: a API só lê (quem muda é o operador, com a credencial dona).
        REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
            cities, driver_settings, document_types, document_requirement_versions, document_requirements,
            document_rejection_reasons, current_document_requirements
            FROM vuumbora_api;
        GRANT SELECT ON
            cities, driver_settings, document_types, document_requirement_versions, document_requirements,
            document_rejection_reasons, current_document_requirements
            TO vuumbora_api;
        -- Motorista, veículo e documento: a API cria e muda estado; nunca apaga (descarte é do operador).
        REVOKE DELETE, TRUNCATE ON drivers, vehicles, driver_documents FROM vuumbora_api;
        GRANT SELECT, INSERT, UPDATE ON drivers, vehicles, driver_documents TO vuumbora_api;
        GRANT EXECUTE ON FUNCTION driver_approval_blockers(UUID) TO vuumbora_api;
        GRANT EXECUTE ON FUNCTION link_driver_application(UUID, TEXT) TO vuumbora_api;
    EXCEPTION
        WHEN insufficient_privilege THEN
            RAISE NOTICE '[0024] sem permissão para ajustar grants; só os gatilhos protegem as tabelas do motorista.';
    END;
END;
$$;
