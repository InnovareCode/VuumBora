-- Endurecimento do login e do primeiro enrolamento do 2FA do admin
-- (achados A-1, M-2 e M-3 da revisao S1, docs/revisao-seguranca-s1.md).
--
-- 1) `admin_login_failures`: contador de falhas de senha POR CONTA (alem do
--    limite por IP, que vive em memoria). Sem ele, quem forja o IP faz
--    brute force ilimitado contra papeis que nao exigem 2FA. A chave e o
--    hash do e-mail normalizado — e-mail INEXISTENTE conta igual a existente,
--    para o bloqueio nao virar oraculo de "esta conta existe". A linha nasce
--    ANTES de a senha ser comparada (reserva sob advisory lock) e e apagada
--    se a senha estiver certa: 50 palpites paralelos nao driblam o limite.
--
-- 2) `admin_enrollment_tokens`: token de uso unico, entregue FORA DE BANDA
--    (script create-admin / reissue-2fa-enrollment, com acesso ao servidor),
--    exigido no primeiro enrolamento de dono/financeiro. So a senha nao basta.
--    Guarda so o SHA-256; o token bruto existe uma vez, no terminal do operador.
--
-- 3) `admin_totp.pending_expires_at`: ate quando o segredo PENDENTE (ainda nao
--    confirmado) vale. Dentro do prazo ele nao e sobrescrito por um novo
--    `enroll/start` (so devolvido de novo, idempotente) — ninguem com so a
--    senha derruba o QR que o dono acabou de escanear.
--
-- Papel `vuumbora_api`: as tabelas novas herdam DML por ALTER DEFAULT
-- PRIVILEGES da 0012 (nenhuma e append-only, a API apaga o que expirou).
-- Reversao: docs/sql/rollback/0016_down.sql

CREATE TABLE IF NOT EXISTS admin_login_failures (
    id         BIGSERIAL PRIMARY KEY,
    -- sha256('admin-login-v1:' || e-mail normalizado). Nunca o e-mail em claro.
    email_hash TEXT NOT NULL,
    -- Preenchido so quando o e-mail existe (apoio forense); sem FK de proposito.
    admin_id   UUID NULL,
    ip_address TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_login_failures_email_created_idx
    ON admin_login_failures (email_hash, created_at);
CREATE INDEX IF NOT EXISTS admin_login_failures_created_idx
    ON admin_login_failures (created_at);

CREATE TABLE IF NOT EXISTS admin_enrollment_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id   UUID NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_enrollment_tokens_token_hash_key
    ON admin_enrollment_tokens (token_hash);
CREATE INDEX IF NOT EXISTS admin_enrollment_tokens_admin_idx
    ON admin_enrollment_tokens (admin_id);

ALTER TABLE admin_totp ADD COLUMN IF NOT EXISTS pending_expires_at TIMESTAMPTZ NULL;
