-- Reverte 0021. Rodar com a credencial DONA do banco, ANTES de 0020_down e das anteriores
-- (ordem inversa: 0021, 0020, 0019, 0018, 0017, 0016, 0014, 0012, 0011, 0010).
--
-- ATENCAO, isto APAGA DADO (e o dado de aceite é PROVA, LGPD art. 8 §2):
--   * `legal_document_versions` inteira: o catálogo de versões publicadas e o SHA-256 de cada texto;
--   * `account_consents.audience` e `account_consents.text_sha256`: os aceites ficam só com o rótulo da versão
--     (o que a 0019 gravava), sem a prova de qual texto foi exibido. Exporte antes se algum aceite já foi feito:
--       \copy (SELECT * FROM account_consents) TO 'account_consents.csv' CSV HEADER
--       \copy (SELECT * FROM legal_document_versions) TO 'legal_document_versions.csv' CSV HEADER
-- Só reverter junto com o código que não lê mais o catálogo (GET /v1/legal/current, reaceite, 409 consent_outdated).
-- O gatilho do aceite volta à forma da 0019 (sem exigir versão publicada) ANTES de as colunas saírem.
BEGIN;

-- 1) Gatilho do aceite como na 0019 (nenhuma coluna nova é lida por ele).
CREATE OR REPLACE FUNCTION account_consents_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Quando aceitou é fato do banco, não dado enviado pela aplicação.
        NEW.accepted_at := now();
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Única mutação permitida: apagar o ip_hash (minimização). Nada mais muda.
        IF OLD.ip_hash IS NOT NULL AND NEW.ip_hash IS NULL
           AND NEW.id = OLD.id AND NEW.account_id = OLD.account_id
           AND NEW.document = OLD.document AND NEW.version = OLD.version
           AND NEW.accepted_at = OLD.accepted_at THEN
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

-- 2) Leitura derivada, restrições e colunas novas do aceite.
DROP FUNCTION IF EXISTS legal_pending_for_account(UUID);
DROP VIEW IF EXISTS legal_current_versions;
ALTER TABLE account_consents DROP CONSTRAINT IF EXISTS account_consents_published_version_fk;
ALTER TABLE account_consents DROP CONSTRAINT IF EXISTS account_consents_audience_sha256_paired;
ALTER TABLE account_consents DROP CONSTRAINT IF EXISTS account_consents_sha256_format;
ALTER TABLE account_consents DROP CONSTRAINT IF EXISTS account_consents_audience_valid;
ALTER TABLE account_consents DROP COLUMN IF EXISTS text_sha256;
ALTER TABLE account_consents DROP COLUMN IF EXISTS audience;

-- 3) O catálogo (leva os gatilhos, os índices e as restrições junto).
DROP TABLE IF EXISTS legal_document_versions;
DROP FUNCTION IF EXISTS legal_document_versions_guard();

DELETE FROM schema_migrations WHERE id = '0021_create_legal_document_versions.sql';
COMMIT;
