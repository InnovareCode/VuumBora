-- Reverte 0011 (APAGA tokens, tentativas e trilha de acesso). Credencial dona.
-- Rodar DEPOIS de 0014_down e ANTES de 0010_down.
BEGIN;
DROP TABLE IF EXISTS access_log;
DROP FUNCTION IF EXISTS login_failures_in_window(TEXT, INTERVAL, TEXT);
DROP TABLE IF EXISTS login_attempts;
DROP FUNCTION IF EXISTS rotate_refresh_token(TEXT, TEXT, TIMESTAMPTZ);
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS refresh_token_families;
DROP FUNCTION IF EXISTS rtf_require_verified_email();
DELETE FROM schema_migrations WHERE id = '0011_create_auth_tokens_and_logs.sql';
COMMIT;
