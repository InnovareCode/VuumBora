-- Identidade dos apps (passageiro e motorista): conta, credencial e
-- dispositivo. Decisão do dono (21/11/2026): login por E-MAIL ou ID + SENHA,
-- conta intransferível (NÃO é código por WhatsApp).
--
-- CONTAS SEPARADAS (decisão do dono, 21/11/2026): passageiro e motorista são
-- contas distintas; cada linha de `accounts` tem UM `account_type`, que não
-- muda nunca (trigger). Não existe "conta com dois papéis" (`account_roles`
-- foi removida). Hipótese de implementação, a confirmar com o dono: o MESMO
-- e-mail pode abrir uma conta de cada tipo, então a unicidade do e-mail é
-- por (account_type, email). `public_id` (o "ID" de login) segue único
-- GLOBAL, para que ele sozinho identifique a conta sem precisar do tipo.
-- Consequência: login e refresh sempre informam o tipo (o app sabe qual é).
--
-- E-mail verificado é obrigatório (decisão do dono): `email_verified_at`
-- NULL = conta sem sessão (ver 0011: nenhuma família de token nasce, nem
-- renova, para conta não verificada). Os códigos moram em 0014.
--
-- `admin_users` (painel) continua separado de propósito: privilégio
-- administrativo nunca nasce de `accounts`.
--
-- Reversão: docs/sql/rollback/0010_down.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Mantém `updated_at` honesto sem depender de cada UPDATE lembrar dele.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS accounts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Contas SEPARADAS: um tipo por conta, imutável. 'admin' NÃO entra aqui.
    account_type      TEXT NOT NULL,
    -- "ID" de login: curto, aleatório (não sequencial — não revela quantas
    -- contas existem). Maiúsculas/dígitos. Colisão é barrada pelo UNIQUE; a
    -- aplicação repete o INSERT na (improvável) colisão.
    public_id         TEXT NOT NULL DEFAULT upper(encode(gen_random_bytes(5), 'hex')),
    -- Sempre minúsculo: a normalização é regra do banco, não torcida da
    -- aplicação — assim a unicidade realmente impede "A@x.com" e "a@x.com".
    email             TEXT NOT NULL,
    email_verified_at TIMESTAMPTZ NULL,
    full_name         TEXT NOT NULL,
    -- Contato opcional (não é mais o login). Dado pessoal: anonimizar na exclusão.
    phone             TEXT NULL,
    status            TEXT NOT NULL DEFAULT 'active',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ NULL,
    CONSTRAINT accounts_type_valid CHECK (account_type IN ('passenger', 'driver')),
    CONSTRAINT accounts_public_id_format CHECK (public_id ~ '^[0-9A-Z]{6,32}$'),
    CONSTRAINT accounts_email_normalized CHECK (
        email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254 AND position('@' IN email) > 1
    ),
    CONSTRAINT accounts_full_name_len CHECK (length(btrim(full_name)) BETWEEN 1 AND 120),
    CONSTRAINT accounts_status_valid CHECK (status IN ('active', 'blocked', 'deleted')),
    -- Exclusão é ANONIMIZAÇÃO (a linha fica: corridas e pagamentos apontam
    -- para ela). `deleted` e `deleted_at` andam juntos.
    CONSTRAINT accounts_deleted_consistent CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))
);

-- Login por e-mail OU por ID. E-mail único POR TIPO (o mesmo e-mail pode ter
-- uma conta de passageiro e uma de motorista); a coluna líder `account_type`
-- atende também "buscar por tipo + e-mail", que é a consulta do login.
CREATE UNIQUE INDEX IF NOT EXISTS accounts_type_email_key ON accounts (account_type, email);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_public_id_key ON accounts (public_id);

DROP TRIGGER IF EXISTS accounts_set_updated_at ON accounts;
CREATE TRIGGER accounts_set_updated_at BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- O tipo e o ID público não mudam: trocar o tipo seria promover uma conta a
-- "motorista" por UPDATE, e o ID de login é o que o usuário decorou.
CREATE OR REPLACE FUNCTION accounts_block_identity_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.account_type IS DISTINCT FROM OLD.account_type
       OR NEW.public_id IS DISTINCT FROM OLD.public_id THEN
        RAISE EXCEPTION 'accounts: account_type e public_id são imutáveis'
            USING ERRCODE = '23514'; -- check_violation
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_identity_immutable ON accounts;
CREATE TRIGGER accounts_identity_immutable BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION accounts_block_identity_change();

-- Credencial em tabela própria: `SELECT * FROM accounts` (ou um export, ou
-- um log de query) nunca carrega o hash junto.
CREATE TABLE IF NOT EXISTS account_credentials (
    account_id          UUID PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
    password_hash       TEXT NOT NULL,
    hash_algo           TEXT NOT NULL DEFAULT 'bcrypt',
    password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT account_credentials_algo_valid CHECK (hash_algo IN ('bcrypt', 'argon2id')),
    -- Garantia por desenho de que o que entra é um HASH, não a senha: o
    -- formato `$2a$/$2b$/$2y$` (bcrypt) ou `$argon2id$` é exigido.
    CONSTRAINT account_credentials_is_hash CHECK (password_hash ~ '^\$(2[aby]|argon2id)\$')
);

CREATE TABLE IF NOT EXISTS devices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    -- UUID gerado pelo app na instalação (não é IMEI nem ID de hardware —
    -- minimização: some se o app for reinstalado).
    installation_id TEXT NOT NULL,
    platform        TEXT NOT NULL,
    device_label    TEXT NULL,
    app_version     TEXT NULL,
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ NULL,
    CONSTRAINT devices_platform_valid CHECK (platform IN ('android', 'ios', 'web')),
    CONSTRAINT devices_installation_len CHECK (length(installation_id) BETWEEN 8 AND 128),
    CONSTRAINT devices_label_len CHECK (device_label IS NULL OR length(device_label) <= 80)
);

-- Um aparelho por conta e instalação; a mesma linha é reaproveitada a cada
-- login (UPSERT). Também atende "listar os dispositivos desta conta".
CREATE UNIQUE INDEX IF NOT EXISTS devices_account_installation_key
    ON devices (account_id, installation_id);
