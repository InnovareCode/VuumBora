-- Torna `admin_audit_log` inviolável PELO BANCO (não pela boa vontade do
-- código da aplicação). Duas camadas, de propósito:
--
--  1) TRIGGERS (valem para QUALQUER credencial, inclusive a dona da
--     tabela, que é a única que a API usa hoje — DATABASE_URL única):
--     UPDATE, DELETE e TRUNCATE na trilha de auditoria levantam erro.
--     Já protege hoje, sem mudar nada de infraestrutura. Quem é dono do
--     banco ainda pode desligar o trigger (ALTER TABLE ... DISABLE TRIGGER)
--     — mas isso é DDL deliberado, auditável, e não acontece por bug nem
--     por SQL injection na API.
--
--  2) PAPEL `vuumbora_api` (credencial separada da API em runtime): sem
--     UPDATE/DELETE/TRUNCATE em `admin_audit_log`, sem tocar em
--     `schema_migrations`, sem DDL. A migração só CRIA o papel (NOLOGIN) e
--     os grants; quem dá LOGIN e senha é a infraestrutura
--     (docs/sql/ativar-papel-api.sql) — senha nunca mora em migração.
--     A camada 2 só fecha de fato quando a API passar a conectar com esse
--     papel (DATABASE_URL) e a migração com a credencial dona
--     (MIGRATION_DATABASE_URL, lida por `src/migrate.ts`).
--
-- Esta migração NUNCA derruba o boot: se a credencial que migra não puder
-- criar papéis (Postgres gerenciado, sem CREATEROLE), o bloco da camada 2
-- avisa (NOTICE) e segue; a camada 1 já está aplicada.
--
-- Reversão: docs/sql/rollback/0012_down.sql

-- ---------- Camada 1: triggers ----------

CREATE OR REPLACE FUNCTION admin_audit_log_block_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'admin_audit_log é append-only: % não é permitido', TG_OP
        USING ERRCODE = '42501'; -- insufficient_privilege: mesma família do REVOKE
END;
$$;

DROP TRIGGER IF EXISTS admin_audit_log_no_update_delete ON admin_audit_log;
CREATE TRIGGER admin_audit_log_no_update_delete
    BEFORE UPDATE OR DELETE ON admin_audit_log
    FOR EACH ROW EXECUTE FUNCTION admin_audit_log_block_mutation();

DROP TRIGGER IF EXISTS admin_audit_log_no_truncate ON admin_audit_log;
CREATE TRIGGER admin_audit_log_no_truncate
    BEFORE TRUNCATE ON admin_audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION admin_audit_log_block_mutation();

-- ---------- Camada 2: papel de runtime da API ----------

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vuumbora_api') THEN
        BEGIN
            -- Sem LOGIN, sem SUPERUSER/CREATEDB/CREATEROLE: o mínimo.
            CREATE ROLE vuumbora_api NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
        EXCEPTION
            WHEN insufficient_privilege THEN
                RAISE NOTICE '[0012] sem permissão para criar o papel vuumbora_api; só os triggers valem.';
                RETURN;
            WHEN duplicate_object THEN
                NULL; -- outra réplica criou entre o IF e o CREATE
        END;
    END IF;

    BEGIN
        EXECUTE format('GRANT CONNECT ON DATABASE %I TO vuumbora_api', current_database());
        GRANT USAGE ON SCHEMA public TO vuumbora_api;

        -- DML nas tabelas do sistema...
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vuumbora_api;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vuumbora_api;
        -- ...e nas tabelas FUTURAS criadas por esta mesma credencial (as
        -- próximas migrações). Tabela que precise ser mais restrita
        -- (append-only) faz o próprio REVOKE na migração dela.
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
            GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vuumbora_api;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
            GRANT USAGE, SELECT ON SEQUENCES TO vuumbora_api;

        -- Exceções: o que a API NÃO pode alterar.
        -- Trilha de auditoria: só ler e acrescentar.
        REVOKE UPDATE, DELETE, TRUNCATE ON admin_audit_log FROM vuumbora_api;
        -- Controle de migração: só o dono mexe.
        REVOKE ALL ON schema_migrations FROM vuumbora_api;
        -- Trilha de acesso: só ler e acrescentar (retenção roda como dono).
        REVOKE UPDATE, DELETE, TRUNCATE ON access_log FROM vuumbora_api;
        -- TRUNCATE não é DML de aplicação em lugar nenhum.
        REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM vuumbora_api;
    EXCEPTION
        WHEN insufficient_privilege THEN
            RAISE NOTICE '[0012] sem permissão para ajustar grants (a credencial não é dona das tabelas); só os triggers valem.';
    END;
END;
$$;
