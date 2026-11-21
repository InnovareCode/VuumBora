-- Segundo fator (TOTP, RFC 6238) do login do admin.
--
-- Tres tabelas novas, nenhuma coluna em `admin_users`: o segredo e o
-- estado de tentativas vivem separados da linha que o resto da API le a
-- cada requisicao (`findAdminByEmail`, sessao), para um SELECT descuidado
-- nunca trazer o segredo junto.
--
-- 0010 a 0012 sao do Cronos; esta migracao nao depende delas.

-- Um segredo por admin. `secret_encrypted` e AES-256-GCM (chave em
-- ADMIN_TOTP_ENCRYPTION_KEY, fora do banco) — nunca o segredo em claro.
-- `confirmed_at IS NULL` = enrolamento iniciado e ainda nao provado com um
-- codigo; so depois de confirmado o segundo fator passa a valer no login.
CREATE TABLE IF NOT EXISTS admin_totp (
    admin_id         UUID PRIMARY KEY REFERENCES admin_users (id) ON DELETE CASCADE,
    secret_encrypted TEXT NOT NULL,
    confirmed_at     TIMESTAMPTZ NULL,
    -- Passo de 30s do ultimo codigo aceito: um codigo TOTP so vale uma vez
    -- (quem espiou o codigo por cima do ombro nao o reusa dentro da janela).
    last_used_step   BIGINT NULL,
    -- Tentativas erradas seguidas; zera no acerto e ao travar.
    failed_attempts  INTEGER NOT NULL DEFAULT 0,
    locked_until     TIMESTAMPTZ NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Codigos de recuperacao de uso unico. Guarda so o SHA-256 (o codigo tem
-- 50 bits aleatorios; hash lento nao agrega, e o codigo bruto so existe na
-- resposta em que foi gerado).
CREATE TABLE IF NOT EXISTS admin_recovery_codes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id   UUID NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
    code_hash  TEXT NOT NULL,
    used_at    TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT admin_recovery_codes_admin_hash_key UNIQUE (admin_id, code_hash)
);

-- Desafio do login em duas etapas: senha certa gera um desafio curto, SEM
-- sessao. So o segundo fator troca o desafio por sessao. Guarda so o hash
-- do token, como `admin_sessions`.
CREATE TABLE IF NOT EXISTS admin_login_challenges (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id   UUID NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    ip_address TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_login_challenges_token_hash_key
    ON admin_login_challenges (token_hash);
CREATE INDEX IF NOT EXISTS admin_login_challenges_expires_at_idx
    ON admin_login_challenges (expires_at);

-- Papeis que OBRIGAM segundo fator (dono e financeiro): sessoes abertas
-- antes desta migracao nunca passaram por ele. Derruba-as, para o proximo
-- acesso ja cair no enrolamento obrigatorio. Sem isto, um cookie ja
-- emitido contornaria a regra ate expirar (ate 7 dias).
DELETE FROM admin_sessions
WHERE admin_id IN (SELECT id FROM admin_users WHERE role IN ('dono', 'financeiro'));
