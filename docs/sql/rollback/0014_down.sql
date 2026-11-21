-- Reverte 0014 (APAGA os códigos de verificação/redefinição vivos; quem estava
-- no meio de uma verificação precisa pedir outro). Credencial dona.
-- Rodar ANTES de 0011_down e 0010_down. Não desfaz contas já verificadas
-- (`accounts.email_verified_at` é da 0010).
BEGIN;
DROP FUNCTION IF EXISTS reset_password_with_code(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS consume_email_code(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS issue_email_code(UUID, TEXT, TEXT, INTERVAL, INTERVAL, INTEGER);
DROP TABLE IF EXISTS account_email_codes;
DELETE FROM schema_migrations WHERE id = '0014_create_email_codes.sql';
COMMIT;
