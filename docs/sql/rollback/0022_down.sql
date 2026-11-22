-- Reverte 0022. Rodar com a credencial DONA do banco, ANTES de 0021_down e das anteriores.
--
-- Não desfaz exclusões já feitas (a anonimização não é reversível por desenho: o dado pessoal
-- já saiu das linhas tocadas). Só remove a função e volta as listas fechadas ao estado da 0019/0011.
BEGIN;

DROP FUNCTION IF EXISTS delete_account(UUID, TEXT);

ALTER TABLE account_email_codes DROP CONSTRAINT IF EXISTS aec_close_reason_valid;
ALTER TABLE account_email_codes ADD CONSTRAINT aec_close_reason_valid CHECK (close_reason IS NULL OR close_reason IN (
    'used', 'superseded', 'expired', 'too_many_attempts', 'password_changed'
));

ALTER TABLE refresh_token_families DROP CONSTRAINT IF EXISTS rtf_reason_valid;
ALTER TABLE refresh_token_families ADD CONSTRAINT rtf_reason_valid CHECK (revoke_reason IS NULL OR revoke_reason IN (
    'logout', 'logout_all', 'reuse_detected', 'password_changed',
    'account_inactive', 'device_revoked', 'admin'
));

ALTER TABLE access_log DROP CONSTRAINT IF EXISTS access_log_event_valid;
ALTER TABLE access_log ADD CONSTRAINT access_log_event_valid CHECK (event IN (
    'login_success', 'login_failure', 'login_blocked', 'token_refresh',
    'token_reuse_detected', 'logout', 'logout_all', 'password_changed',
    'register', 'email_code_sent', 'email_verified', 'password_reset_requested', 'password_reset_completed'
));

DELETE FROM schema_migrations WHERE id = '0022_account_deletion.sql';
COMMIT;
