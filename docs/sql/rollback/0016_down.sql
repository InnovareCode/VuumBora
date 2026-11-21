-- Reverte 0016. Remove o contador por conta e os tokens de enrolamento.
-- ATENCAO: sem os tokens, dono/financeiro ainda sem 2FA voltam a poder
-- enrolar so com a senha (achado M-2) — so reverter junto com o codigo antigo.
DROP TABLE IF EXISTS admin_login_failures;
DROP TABLE IF EXISTS admin_enrollment_tokens;
ALTER TABLE admin_totp DROP COLUMN IF EXISTS pending_expires_at;
DELETE FROM schema_migrations WHERE id = '0016_admin_login_guard_and_enrollment_tokens.sql';
