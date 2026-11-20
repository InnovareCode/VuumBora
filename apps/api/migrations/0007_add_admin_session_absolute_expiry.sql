-- Teto absoluto da sessão de admin — achado do Órion na revisão: a sessão
-- tinha expiração deslizante (renovada a cada requisição,
-- `admin_sessions.expires_at`) mas NENHUM limite independente de uso. Um
-- cookie roubado e usado de vez em quando nunca expirava. Esta coluna é o
-- segundo relógio: fixado no login (`services/admin-auth-service.ts`,
-- `ADMIN_SESSION_ABSOLUTE_TTL_HOURS`), nunca avançado por
-- `touchAdminSession` — só a sliding `expires_at` se move.
--
-- DEFAULT só para proteger linhas pré-existentes (ambiente de teste/dev);
-- toda sessão nova grava o valor calculado explicitamente no INSERT.

ALTER TABLE admin_sessions
    ADD COLUMN IF NOT EXISTS absolute_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days');
