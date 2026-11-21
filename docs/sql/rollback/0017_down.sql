-- Reverte 0017: devolve ao papel da API os privilégios que a 0012 dava (DML completo).
-- ATENCAO: isto REABRE o achado I-3 da revisao S1 rodada 2 (quem tem a credencial da
-- API volta a poder criar administrador e token de ativacao do 2FA). So reverter
-- junto com o codigo antigo, se algum fluxo legitimo tiver ficado sem privilegio.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vuumbora_api') THEN
        GRANT INSERT, UPDATE, DELETE ON admin_users TO vuumbora_api;
        GRANT INSERT, DELETE ON admin_enrollment_tokens TO vuumbora_api;
        GRANT UPDATE ON admin_login_challenges TO vuumbora_api;
        GRANT UPDATE ON admin_login_failures TO vuumbora_api;
        GRANT DELETE ON accounts, account_credentials, account_email_codes, devices, refresh_token_families, refresh_tokens TO vuumbora_api;
        GRANT UPDATE, DELETE ON login_attempts TO vuumbora_api;
        GRANT UPDATE, DELETE ON waitlist_signups TO vuumbora_api;
        GRANT DELETE ON driver_applications, email_settings TO vuumbora_api;
    END IF;
END;
$$;
DELETE FROM schema_migrations WHERE id = '0017_least_privilege_runtime_role.sql';
