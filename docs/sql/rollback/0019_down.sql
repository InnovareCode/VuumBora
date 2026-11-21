-- Reverte 0019. Rodar com a credencial DONA do banco, ANTES de 0018_down, 0017_down e das
-- anteriores (ordem inversa: 0019, 0018, 0017, 0016, 0014, 0012, 0011, 0010).
--
-- ATENCAO, isto APAGA DADO (e o dado de aceite é PROVA, LGPD art. 8 §2):
--   * `account_consents` inteira: exporte antes se alguma conta já aceitou algo
--       \copy account_consents TO 'account_consents.csv' CSV HEADER
--   * `accounts.birth_date`: a data de nascimento de todas as contas.
-- Depois do rollback o banco volta a aceitar conta sem idade verificada; só
-- reverter junto com o código que não envia mais a data nem o aceite.
BEGIN;
DROP TABLE IF EXISTS account_consents;   -- leva o gatilho e os índices junto
DROP FUNCTION IF EXISTS account_consents_guard();
DROP TRIGGER IF EXISTS accounts_birth_date_guard ON accounts;
DROP FUNCTION IF EXISTS accounts_enforce_birth_date();
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_birth_date_plausible;
ALTER TABLE accounts DROP COLUMN IF EXISTS birth_date;
DELETE FROM schema_migrations WHERE id = '0019_add_birth_date_and_account_consents.sql';
COMMIT;
