-- Versões publicadas dos documentos legais e aceite com a versão EXIBIDA (achado M-3 da rodada 3 do
-- Órion; fatia B3 de docs/plano-apps-execucao.md).
--
-- Problema: a 0019 grava em `account_consents.version` a versão que o SERVIDOR tem na variável de
-- ambiente, não a que a pessoa viu; a versão é só um rótulo livre (nada impede reaproveitar "v1" com
-- o texto editado) e o banco não guarda quando a "versão vigente" mudou. Em disputa (LGPD art. 8º §2º:
-- o ônus de provar o consentimento é do controlador), a linha provaria que a API gravou um rótulo, não
-- que AQUELE texto foi apresentado.
--
-- Solução, em três peças:
--   1) `legal_document_versions` — o catálogo de versões PUBLICADAS: documento, perfil (audience),
--      versão, SHA-256 do texto e quando foi publicada. Imutável por versão.
--   2) `account_consents` passa a apontar para o catálogo (FK) e a guardar o `audience` e o
--      `text_sha256` do texto daquela versão. A versão gravada é a EXIBIDA: vem do cliente, e o banco só
--      aceita se for uma versão publicada e vigente (senão 409 `consent_outdated` na API).
--   3) `legal_pending_for_account(conta)` — a ÚNICA definição de "esta conta precisa reaceitar?".
--
-- ---------- Decisões ----------
--
-- DOCUMENTO e PERFIL. `document` usa os mesmos valores do CHECK da 0019 (`terms_of_use`,
-- `privacy_policy`; a API os expõe como `terms`/`privacy`). `audience` é `passenger` ou `driver`
-- (o `accounts.account_type` da conta): o dono ainda não decidiu se há Termos distintos por perfil, e a
-- estrutura serve aos dois cenários. Texto único para os dois perfis = DUAS linhas (uma por perfil) com o
-- mesmo SHA-256; não existe `audience` "todos", para "a vigente de (documento, perfil)" ter resposta única.
--
-- VIGENTE = a de `published_at` mais recente do par (documento, perfil), derivada pela view
-- `legal_current_versions`. Por que derivada e não uma coluna `vigente`/`retired_at`: marcar a anterior
-- como aposentada exigiria UPDATE na linha publicada, e a versão tem de ser imutável (nem o texto, nem o
-- hash, nem uma data de "fim" mudam). Derivar dá "no máximo uma vigente" POR CONSTRUÇÃO (a view devolve
-- uma linha por par, nunca duas) e ainda responde "qual valia em tal dia" (a de maior `published_at` até
-- aquela data). Para a ordem ser inequívoca o gatilho exige `published_at` ESTRITAMENTE crescente no par.
-- Publicar = passar a valer: não há agendamento (a data é o relógio do banco, como `accepted_at`: quem
-- publica não "ajusta" quando publicou nem retroage uma versão).
--
-- REACEITE (a regra está em `legal_pending_for_account`; o fluxo da API, no contrato):
--   * `requires_reacceptance` (padrão TRUE, a escolha segura) diz se a versão muda algo que exige novo
--     aceite de quem já aceitou antes. Correção editorial (typo, formatação) entra com FALSE e não
--     incomoda ninguém; mudança material entra com TRUE.
--   * a conta está em dia no documento se aceitou uma versão publicada em ou depois da última versão
--     MATERIAL do par. Não é "aceitou exatamente a vigente": quem aceitou a v2 (material) segue em dia
--     quando sai a v3 editorial; quem só aceitou a v1 fica pendente, e o que aceita é a vigente (a v3).
--   * sem nenhuma versão publicada para o perfil não há pendência (e o cadastro responde 503).
--   * aceite LEGADO (feito antes desta migração, sem hash) NÃO conta: está sem `text_sha256`/`audience`
--     e fica fora da regra. Em produção não existe nenhum (o banco está na 0009; a identidade dos apps
--     nasce na 0010), então não há dado a migrar; em banco de desenvolvimento a conta antiga simplesmente
--     reaceita a primeira versão publicada. Nada é apagado nem inventado: o aceite legado fica como estava.
--
-- QUEM PUBLICA: só a credencial DONA do banco (tarefa de operador, nunca o contêiner da API: o papel
-- `vuumbora_api` tem SÓ SELECT aqui — quem conseguisse SQL com a credencial da API não publicaria nem
-- trocaria o texto que as pessoas "aceitaram"). Exemplo:
--   INSERT INTO legal_document_versions (document, audience, version, text_sha256, requires_reacceptance)
--   VALUES ('terms_of_use', 'passenger', '2026-12-01', '<sha256 hex minúsculo do arquivo publicado>', TRUE);
-- O hash é do ARQUIVO exato (bytes UTF-8, o mesmo servido na URL daquela versão): `sha256sum arquivo`.
-- (O SHA-256 do texto vazio é recusado: hash de pipe que falhou.) Publicação errada não se edita nem se
-- apaga: publica-se a versão seguinte. Emergência (dono do banco): ALTER TABLE ... DISABLE TRIGGER.
--
-- GATILHO DO ACEITE (`account_consents_guard`, substituído aqui): no INSERT, o banco
--   * grava `accepted_at` = relógio do banco (como na 0019);
--   * grava `audience` = o tipo da CONTA (descarta o que a aplicação mandar);
--   * recusa versão NÃO publicada (23503, restrição `account_consents_version_published`) e versão
--     publicada mas JÁ SUBSTITUÍDA (23514, `account_consents_version_current`): a API traduz as duas em
--     409 `consent_outdated`. É a rede do banco para a corrida "publicaram a v2 enquanto a v1 era aceita";
--   * grava `text_sha256` = o hash do catálogo (a aplicação não o informa nem o falsifica); a FK composta
--     de 4 colunas garante, de forma declarativa, que o hash gravado é o da versão publicada.
-- No UPDATE a única mutação continua sendo `ip_hash` -> NULL, agora comparando a LINHA INTEIRA (coluna
-- nova no futuro entra na regra sem esquecer de ninguém).
--
-- Zero downtime / expand-contract: não há tabela grande nem dado em produção. As colunas novas de
-- `account_consents` são NULLABLE (só catálogo, sem reescrever a tabela), porque o aceite legado não tem
-- como ganhar hash; "obrigatório" para aceite NOVO mora no gatilho. Em tabela já populada, os CHECKs e a
-- FK abaixo fariam varredura: aqui a tabela é pequena/vazia; se um dia não for, usar NOT VALID + VALIDATE.
--
-- Índices: nenhum além dos das restrições. O catálogo terá dezenas de linhas na vida do produto; a
-- consulta "vigente" e a de pendência leem tabela minúscula, e o índice de `account_consents` pela conta
-- (0019) já cobre "o que esta conta aceitou".
--
-- Backup: restore COMPLETO preserva `published_at` e `accepted_at` (os gatilhos só nascem depois dos
-- dados). Restore data-only COM gatilhos reescreve as duas datas para o relógio do restore — usar
-- `--disable-triggers`/`session_replication_role = replica`, e restaurar o catálogo ANTES dos aceites.
--
-- Reversão: docs/sql/rollback/0021_down.sql (APAGA `audience` e `text_sha256` dos aceites; exportar antes).

-- ======================================================================
-- 1) legal_document_versions
-- ======================================================================

CREATE TABLE IF NOT EXISTS legal_document_versions (
    document              TEXT        NOT NULL,
    audience              TEXT        NOT NULL,
    -- Mesmo formato de `account_consents.version` (0019): curto, sem espaço nem quebra de linha.
    version               TEXT        NOT NULL,
    -- SHA-256 do texto publicado, em hexadecimal minúsculo (64 caracteres).
    text_sha256           TEXT        NOT NULL,
    requires_reacceptance BOOLEAN     NOT NULL DEFAULT TRUE,
    -- O gatilho SEMPRE substitui pelo relógio do banco; o padrão só documenta a intenção.
    published_at          TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT legal_document_versions_pkey PRIMARY KEY (document, audience, version),
    -- Alvo da FK composta dos aceites: o hash gravado no aceite TEM de ser o da versão publicada.
    CONSTRAINT legal_document_versions_with_sha_key UNIQUE (document, audience, version, text_sha256),
    CONSTRAINT legal_document_versions_document_valid CHECK (document IN ('terms_of_use', 'privacy_policy')),
    CONSTRAINT legal_document_versions_audience_valid CHECK (audience IN ('passenger', 'driver')),
    CONSTRAINT legal_document_versions_version_format CHECK (version ~ '^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}$'),
    CONSTRAINT legal_document_versions_sha256_format CHECK (text_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT legal_document_versions_sha256_not_empty_text
        CHECK (text_sha256 <> 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
);

COMMENT ON TABLE legal_document_versions IS
    'Versões PUBLICADAS dos Termos e da Política, por perfil, com o SHA-256 do texto. Imutável (gatilho vale até para o dono); só o dono insere.';
COMMENT ON COLUMN legal_document_versions.text_sha256 IS
    'SHA-256 (hex minúsculo) do arquivo exato publicado nesta versão. A versão é imutável: texto novo = versão nova.';
COMMENT ON COLUMN legal_document_versions.requires_reacceptance IS
    'TRUE: quem aceitou versão anterior precisa aceitar de novo (mudança material). FALSE: correção editorial, não pede novo aceite.';
COMMENT ON COLUMN legal_document_versions.published_at IS
    'Relógio do banco no INSERT (estritamente crescente por documento+perfil). A de maior valor é a vigente (view legal_current_versions).';

CREATE OR REPLACE FUNCTION legal_document_versions_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Reenvio da MESMA versão (script de publicação rodado de novo): não é publicação nova; a chave
        -- primária (ou o ON CONFLICT DO NOTHING de quem chamou) decide, sem tocar na linha existente.
        IF EXISTS (SELECT 1 FROM legal_document_versions v
                    WHERE v.document = NEW.document AND v.audience = NEW.audience AND v.version = NEW.version) THEN
            RETURN NEW;
        END IF;

        -- Duas publicações simultâneas do mesmo par entram uma de cada vez. O relógio é lido DEPOIS da
        -- trava: quem espera ganha um instante posterior ao do que acabou de publicar.
        PERFORM pg_advisory_xact_lock(hashtextextended('legal_document_versions:' || NEW.document || ':' || NEW.audience, 0));
        NEW.published_at := clock_timestamp();

        -- "No máximo uma vigente" depende de a ordem ser inequívoca: nunca empate nem relógio que anda para trás.
        IF EXISTS (SELECT 1 FROM legal_document_versions v
                    WHERE v.document = NEW.document AND v.audience = NEW.audience AND v.published_at >= NEW.published_at) THEN
            RAISE EXCEPTION 'legal_document_versions: publicação não é posterior à vigente (relógio do banco voltou?); tente de novo'
                USING ERRCODE = '23514', TABLE = 'legal_document_versions',
                      CONSTRAINT = 'legal_document_versions_published_at_monotonic';
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE, DELETE e TRUNCATE: versão publicada é imutável (a de texto errado se substitui por outra).
    RAISE EXCEPTION 'legal_document_versions é imutável: % não é permitido', TG_OP
        USING ERRCODE = '42501'; -- insufficient_privilege: mesma família do REVOKE
END;
$$;

DROP TRIGGER IF EXISTS legal_document_versions_guard ON legal_document_versions;
CREATE TRIGGER legal_document_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON legal_document_versions
    FOR EACH ROW EXECUTE FUNCTION legal_document_versions_guard();

-- TRUNCATE aqui, ao contrário de `account_consents`: nenhum caminho legítimo esvazia o catálogo
-- (`TRUNCATE accounts CASCADE` não o alcança), e `TRUNCATE legal_document_versions CASCADE` apagaria também os aceites.
DROP TRIGGER IF EXISTS legal_document_versions_no_truncate ON legal_document_versions;
CREATE TRIGGER legal_document_versions_no_truncate BEFORE TRUNCATE ON legal_document_versions
    FOR EACH STATEMENT EXECUTE FUNCTION legal_document_versions_guard();

-- A definição ÚNICA de "vigente": a API, o script de operador e os testes leem daqui.
CREATE OR REPLACE VIEW legal_current_versions AS
    SELECT DISTINCT ON (v.document, v.audience)
           v.document, v.audience, v.version, v.text_sha256, v.requires_reacceptance, v.published_at
      FROM legal_document_versions v
     ORDER BY v.document, v.audience, v.published_at DESC;

COMMENT ON VIEW legal_current_versions IS
    'A versão vigente (a mais recente) de cada documento por perfil. No máximo uma linha por (document, audience).';

-- ======================================================================
-- 2) account_consents: aponta para o catálogo e guarda o hash do texto exibido
-- ======================================================================

ALTER TABLE account_consents ADD COLUMN IF NOT EXISTS audience    TEXT NULL;
ALTER TABLE account_consents ADD COLUMN IF NOT EXISTS text_sha256 TEXT NULL;

COMMENT ON COLUMN account_consents.audience IS
    'Perfil da conta no aceite (accounts.account_type), gravado pelo gatilho. NULL = aceite legado, anterior ao catálogo de versões.';
COMMENT ON COLUMN account_consents.text_sha256 IS
    'SHA-256 do texto da versão aceita, copiado do catálogo pelo gatilho. NULL = aceite legado (só rótulo, sem prova do texto).';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_consents_audience_valid' AND conrelid = 'account_consents'::regclass) THEN
        ALTER TABLE account_consents ADD CONSTRAINT account_consents_audience_valid
            CHECK (audience IS NULL OR audience IN ('passenger', 'driver'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_consents_sha256_format' AND conrelid = 'account_consents'::regclass) THEN
        ALTER TABLE account_consents ADD CONSTRAINT account_consents_sha256_format
            CHECK (text_sha256 IS NULL OR text_sha256 ~ '^[0-9a-f]{64}$');
    END IF;
    -- As duas colunas andam juntas: ou é aceite com prova do texto, ou é legado.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_consents_audience_sha256_paired' AND conrelid = 'account_consents'::regclass) THEN
        ALTER TABLE account_consents ADD CONSTRAINT account_consents_audience_sha256_paired
            CHECK ((audience IS NULL) = (text_sha256 IS NULL));
    END IF;
    -- Integridade referencial POR DESENHO: o aceite aponta para uma versão publicada e o hash gravado é o dela.
    -- MATCH SIMPLE (padrão): linha legada (colunas NULL) não é checada; aceite novo nunca é NULL (gatilho).
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_consents_published_version_fk' AND conrelid = 'account_consents'::regclass) THEN
        ALTER TABLE account_consents ADD CONSTRAINT account_consents_published_version_fk
            FOREIGN KEY (document, audience, version, text_sha256)
            REFERENCES legal_document_versions (document, audience, version, text_sha256);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION account_consents_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_audience  TEXT;
    v_published TIMESTAMPTZ;
    v_sha       TEXT;
    v_expected  account_consents;
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Quando aceitou é fato do banco, não dado enviado pela aplicação.
        NEW.accepted_at := now();

        SELECT a.account_type INTO v_audience FROM accounts a WHERE a.id = NEW.account_id;
        IF v_audience IS NULL THEN
            RETURN NEW; -- conta inexistente: quem recusa é a FK de account_id (logo depois deste gatilho)
        END IF;
        NEW.audience := v_audience;

        SELECT v.published_at, v.text_sha256 INTO v_published, v_sha
          FROM legal_document_versions v
         WHERE v.document = NEW.document AND v.audience = v_audience AND v.version = NEW.version;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'account_consents: versão não publicada para este documento e perfil'
                USING ERRCODE = '23503', TABLE = 'account_consents', CONSTRAINT = 'account_consents_version_published';
        END IF;

        -- Versão publicada, mas já substituída por outra mais nova (a pessoa viu a anterior): recusa.
        IF EXISTS (SELECT 1 FROM legal_document_versions w
                    WHERE w.document = NEW.document AND w.audience = v_audience AND w.published_at > v_published) THEN
            RAISE EXCEPTION 'account_consents: a versão aceita já foi substituída por outra mais nova'
                USING ERRCODE = '23514', TABLE = 'account_consents', CONSTRAINT = 'account_consents_version_current';
        END IF;

        NEW.text_sha256 := v_sha;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Única mutação permitida: apagar o ip_hash (minimização). A linha inteira, igual ao resto.
        v_expected := OLD;
        v_expected.ip_hash := NULL;
        IF OLD.ip_hash IS NOT NULL AND NEW IS NOT DISTINCT FROM v_expected THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'account_consents é append-only: UPDATE não é permitido'
            USING ERRCODE = '42501'; -- insufficient_privilege: mesma família do REVOKE
    END IF;

    -- DELETE: só como cascata da exclusão da conta (a linha-mãe já saiu nesta mesma
    -- instrução; o gatilho de integridade referencial roda um nível acima).
    IF pg_trigger_depth() > 1
       AND NOT EXISTS (SELECT 1 FROM accounts WHERE id = OLD.account_id) THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'account_consents é append-only: DELETE não é permitido'
        USING ERRCODE = '42501';
END;
$$;

DO $$
DECLARE
    v_legacy BIGINT;
BEGIN
    SELECT count(*) INTO v_legacy FROM account_consents WHERE text_sha256 IS NULL;
    IF v_legacy > 0 THEN
        RAISE NOTICE '[0021] % aceite(s) legado(s) sem hash do texto: ficam como estão e não contam para o reaceite.', v_legacy;
    END IF;
END;
$$;

-- ======================================================================
-- 3) legal_pending_for_account: a conta precisa reaceitar o quê?
-- ======================================================================
-- Uma linha por documento pendente (a versão VIGENTE, que é a que a pessoa deve aceitar), ordenada por
-- documento. Zero linhas = em dia (ou nada publicado para o perfil). Uma consulta só para os dois
-- documentos (sem N+1). SECURITY INVOKER: vale o que o chamador pode ler (a API lê as três tabelas).
CREATE OR REPLACE FUNCTION legal_pending_for_account(p_account_id UUID)
RETURNS TABLE (document TEXT, version TEXT, text_sha256 TEXT, published_at TIMESTAMPTZ)
LANGUAGE sql STABLE AS $$
    SELECT cur.document, cur.version, cur.text_sha256, cur.published_at
      FROM accounts a
      JOIN legal_current_versions cur ON cur.audience = a.account_type
     WHERE a.id = p_account_id
       AND NOT EXISTS (
            -- Em dia: aceitou uma versão publicada em ou depois da última versão MATERIAL do par.
            -- Aceite legado (audience NULL) não casa com o catálogo e, portanto, não conta.
            SELECT 1
              FROM account_consents c
              JOIN legal_document_versions cv
                ON cv.document = c.document AND cv.audience = c.audience AND cv.version = c.version
             WHERE c.account_id = a.id
               AND c.document = cur.document
               AND cv.published_at >= COALESCE(
                       (SELECT max(m.published_at)
                          FROM legal_document_versions m
                         WHERE m.document = cur.document AND m.audience = cur.audience AND m.requires_reacceptance),
                       '-infinity'::timestamptz))
     ORDER BY cur.document
$$;

REVOKE ALL ON FUNCTION legal_pending_for_account(UUID) FROM PUBLIC;

-- ======================================================================
-- 4) Privilégios do papel de runtime: SÓ LEITURA no catálogo
-- ======================================================================
-- Camada 1 (gatilho) vale para qualquer credencial; esta é a camada 2. A 0012 deixou DML completo como
-- padrão para tabela nova (e para a view): o REVOKE é aqui, e a tabela entra na matriz de
-- test/runtime-role.test.ts (`legal_document_versions: []`). Nunca derruba o boot: sem o papel ou sem
-- permissão para ajustar grants, avisa e segue (o gatilho já vale).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vuumbora_api') THEN
        RAISE NOTICE '[0021] o papel vuumbora_api não existe; só o gatilho protege legal_document_versions (e só o dono executa legal_pending_for_account).';
        RETURN;
    END IF;

    BEGIN
        REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON legal_document_versions FROM vuumbora_api;
        GRANT SELECT ON legal_document_versions TO vuumbora_api;
        REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON legal_current_versions FROM vuumbora_api;
        GRANT SELECT ON legal_current_versions TO vuumbora_api;
        GRANT EXECUTE ON FUNCTION legal_pending_for_account(UUID) TO vuumbora_api;
    EXCEPTION
        WHEN insufficient_privilege THEN
            RAISE NOTICE '[0021] sem permissão para ajustar grants; só o gatilho protege legal_document_versions.';
    END;
END;
$$;
