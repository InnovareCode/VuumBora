-- Reverte 0024. Rodar com a credencial DONA do banco, ANTES de 0023/0022 e das anteriores.
--
-- APAGA motoristas, veículos e os metadados dos documentos (e as linhas de access_log com o evento
-- 'driver_application_linked', senão a lista fechada da 0022 não volta). Exportar antes:
--   pg_dump --data-only -t drivers -t vehicles -t driver_documents -t document_requirement_versions \
--           -t document_requirements -t document_types -t document_rejection_reasons -t driver_settings -t cities ...
-- Os OBJETOS no armazenamento não são tocados (o banco não os alcança): sem os metadados, ficam órfãos.
-- Exclusões de conta já feitas continuam feitas (anonimização não se desfaz).
BEGIN;

-- 1) delete_account volta à forma da 0022 (sem o bloco do motorista) ANTES de as tabelas sumirem.
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

    RETURN 'ok';
END;
$$;

-- 2) access_log volta à lista da 0022.
DELETE FROM access_log WHERE event = 'driver_application_linked';
ALTER TABLE access_log DROP CONSTRAINT IF EXISTS access_log_event_valid;
ALTER TABLE access_log ADD CONSTRAINT access_log_event_valid CHECK (event IN (
    'login_success', 'login_failure', 'login_blocked', 'token_refresh',
    'token_reuse_detected', 'logout', 'logout_all', 'password_changed',
    'register', 'email_code_sent', 'email_verified', 'password_reset_requested', 'password_reset_completed',
    'account_deleted'
));

-- 3) Funções que leem as tabelas, depois as tabelas (os gatilhos vão junto), depois as funções dos gatilhos.
DROP FUNCTION IF EXISTS link_driver_application(UUID, TEXT);
DROP TABLE IF EXISTS driver_documents;
DROP TABLE IF EXISTS vehicles;
DROP TABLE IF EXISTS drivers;
DROP FUNCTION IF EXISTS driver_approval_blockers(UUID);
DROP FUNCTION IF EXISTS drivers_guard();
DROP FUNCTION IF EXISTS vehicles_guard();
DROP FUNCTION IF EXISTS driver_documents_guard();

DROP VIEW IF EXISTS current_document_requirements;
DROP TABLE IF EXISTS document_requirements;
DROP TABLE IF EXISTS document_requirement_versions;
DROP TABLE IF EXISTS document_rejection_reasons;
DROP TABLE IF EXISTS document_types;
DROP TABLE IF EXISTS driver_settings;
DROP TABLE IF EXISTS cities;
DROP FUNCTION IF EXISTS document_requirements_guard();
DROP FUNCTION IF EXISTS document_requirement_versions_guard();
DROP FUNCTION IF EXISTS city_today(TEXT);
DROP FUNCTION IF EXISTS is_valid_cpf(TEXT);
DROP FUNCTION IF EXISTS driver_catalog_no_truncate();

DELETE FROM schema_migrations WHERE id = '0024_create_driver_documents.sql';
COMMIT;
