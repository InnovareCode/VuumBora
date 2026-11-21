-- Reverte 0010 (APAGA contas, credenciais e dispositivos). Credencial dona.
-- Rodar DEPOIS de 0014_down e 0011_down (e de qualquer tabela que referencie accounts).
BEGIN;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS account_credentials;
DROP TABLE IF EXISTS accounts;
DROP FUNCTION IF EXISTS accounts_block_identity_change();
DROP FUNCTION IF EXISTS set_updated_at();
DELETE FROM schema_migrations WHERE id = '0010_create_accounts_identity.sql';
COMMIT;
