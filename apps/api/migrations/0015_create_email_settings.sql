-- Configuracao SMTP editavel pelo painel admin (so papel `dono`).
--
-- UMA linha so (`id = 1`, travado por CHECK): e a configuracao do sistema, nao
-- de um admin. Cada coluna NULL significa "nao definido no painel" — o valor
-- efetivo cai para a variavel de ambiente (SMTP_HOST, SMTP_PORT, SMTP_USER,
-- SMTP_PASS, EMAIL_FROM) e, sem ela, fica "nao definido".
--
-- `password_encrypted` guarda a senha cifrada (AES-256-GCM, lib/secret-box.ts,
-- formato `v1.iv.tag.texto`) — nunca texto puro, e a API nunca a devolve.
-- Reversao: DROP TABLE email_settings;

CREATE TABLE IF NOT EXISTS email_settings (
    id                 SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    host               TEXT NULL,
    port               INTEGER NULL CHECK (port IS NULL OR (port BETWEEN 1 AND 65535)),
    username           TEXT NULL,
    password_encrypted TEXT NULL,
    -- Remetente como o dono digita: `Nome <email@dominio>` ou so `email@dominio`.
    from_address       TEXT NULL,
    updated_by         UUID NULL REFERENCES admin_users (id),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
