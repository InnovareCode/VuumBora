-- Reverte 0012. Rodar com a credencial DONA do banco. NÃO apaga o papel
-- vuumbora_api (é do cluster, pode ser usado por outro banco): só tira os grants.
BEGIN;
DROP TRIGGER IF EXISTS admin_audit_log_no_update_delete ON admin_audit_log;
DROP TRIGGER IF EXISTS admin_audit_log_no_truncate ON admin_audit_log;
DROP FUNCTION IF EXISTS admin_audit_log_block_mutation();
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vuumbora_api') THEN
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM vuumbora_api;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM vuumbora_api;
  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM vuumbora_api;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM vuumbora_api;
END IF; END $$;
DELETE FROM schema_migrations WHERE id = '0012_harden_audit_log_and_runtime_role.sql';
COMMIT;
