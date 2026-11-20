-- Administradores do painel interno (não confundir com `accounts`, que é a
-- identidade do passageiro/motorista nos apps — ver
-- docs/plano-sistema-dados.md §1: "admin_users fica FORA de `accounts` de
-- propósito: é fronteira de segurança").
--
-- SEM AUTO-CADASTRO: a ÚNICA forma de nascer um admin é
-- `apps/api/scripts/create-admin.mjs`, rodado manualmente por alguém que já
-- tem acesso à infraestrutura. Não existe (e não deve existir) endpoint
-- HTTP de registro de admin.
--
-- `account_id` fica de fora desta migração: o plano (docs/plano-sistema-
-- -dados.md §2) prevê uma FK opcional para `accounts`, mas essa tabela
-- ainda não existe neste banco (ainda não migrada). Quando `accounts`
-- nascer, um `ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS account_id
-- UUID NULL REFERENCES accounts(id)` resolve, sem quebrar nada aqui.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS admin_users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT NOT NULL,
    email          TEXT NOT NULL,
    -- Hash bcrypt (custo 12), gerado só por `create-admin.mjs`. NUNCA a
    -- senha em texto puro — nem de passagem, nem em log, nem nesta coluna.
    password_hash  TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'support'
                       CHECK (role IN ('support', 'finance', 'superadmin')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Desativar (não apagar): preserva a referência em `admin_audit_log`
    -- (migração 0004) — um admin desligado continua aparecendo como autor
    -- do que ele viu/aprovou/rejeitou no passado. Login de admin
    -- desativado é sempre rejeitado (ver admin-auth-service.ts).
    deactivated_at TIMESTAMPTZ NULL
);

-- Login é por e-mail — unicidade a nível de banco, igual ao padrão já
-- usado em `waitlist_signups`/`driver_applications`.
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_key
    ON admin_users (email);
