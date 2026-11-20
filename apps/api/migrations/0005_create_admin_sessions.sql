-- Sessão de admin para o cookie httpOnly (exigência explícita do pedido:
-- nunca localStorage). NÃO está no plano original
-- (docs/plano-sistema-dados.md §2 desenhou só `admin_users` e
-- `admin_audit_log`) — é acréscimo desta entrega: login por cookie
-- precisa de algo revogável no servidor. Sem tabela própria, "logout" só
-- apagaria o cookie do navegador — uma sessão roubada continuaria válida
-- até expirar, mesmo depois do admin pedir para sair. Avisar Nova/Cronos
-- se este desenho precisar entrar no plano formal do dado.
--
-- Só o HASH do token (sha256) fica aqui — o valor bruto só existe no
-- cookie do navegador do admin. Mesmo que esta tabela seja lida por
-- alguém, não dá para fabricar uma sessão válida a partir da linha.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS admin_sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id     UUID NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Expiração deslizante: cada requisição autenticada empurra este valor
    -- para `now() + ADMIN_SESSION_TTL_HOURS` (ver
    -- `src/services/admin-auth-service.ts`) — sessão em uso não cai no
    -- meio do trabalho; sessão esquecida aberta expira sozinha.
    expires_at   TIMESTAMPTZ NOT NULL,
    ip_address   TEXT NULL,
    user_agent   TEXT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_sessions_token_hash_key
    ON admin_sessions (token_hash);

CREATE INDEX IF NOT EXISTS admin_sessions_admin_idx
    ON admin_sessions (admin_id);

-- Suporte a uma futura limpeza periódica (DELETE WHERE expires_at < now()).
-- Nenhum job faz isso ainda nesta entrega — tabela pequena, sem pressa.
CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx
    ON admin_sessions (expires_at);
