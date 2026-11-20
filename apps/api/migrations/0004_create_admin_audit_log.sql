-- Trilha de auditoria do painel admin: quem viu/mudou o quê, quando, de
-- que IP. Nesta fatia (Admin v0) só existe LEITURA de candidatura de
-- motorista — nenhum endpoint aprova/recusa ainda —, mas a tabela já
-- nasce completa porque é o mesmo desenho que vai registrar
-- aprovação/rejeição depois (docs/plano-sistema-dados.md §2,
-- `admin_audit_log`).
--
-- `target_id` é polimórfico e PROPOSITALMENTE sem FK (mesmo trade-off de
-- `trip_events`, ver plano §2): é trilha de prestação de contas, não dado
-- operacional. O ideal, quando a role de aplicação do Postgres for
-- separada da role de migração, é revogar UPDATE/DELETE nesta tabela para
-- a role que a API usa em runtime — não feito aqui porque hoje as duas
-- roles são a mesma conexão (DATABASE_URL única); fica registrado como
-- pendência de infraestrutura (Vulcano/Cronos), não de schema.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id    UUID NOT NULL REFERENCES admin_users (id),
    -- Ex.: 'admin.login', 'admin.logout', 'driver_application.viewed',
    -- 'driver_application.listed'. Texto livre, não enum: a lista de
    -- ações cresce mais rápido do que vale a pena travar num CHECK.
    action      TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id   TEXT NULL,
    before      JSONB NULL,
    after       JSONB NULL,
    ip_address  TEXT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx
    ON admin_audit_log (target_type, target_id);

CREATE INDEX IF NOT EXISTS admin_audit_log_admin_created_idx
    ON admin_audit_log (admin_id, created_at);
