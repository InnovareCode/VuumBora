-- Tabela da lista de espera (lançamento do VuumBora).
--
-- Guarda só o necessário para avisar do lançamento: e-mail, perfil
-- (opcional) e quando/de onde a inscrição chegou. De propósito NÃO tem
-- CPF, telefone, endereço, documento nem IP — ver docs/lista-de-espera.md
-- ("Por que não guardamos o IP").

-- gen_random_uuid() já é nativo desde o Postgres 13; a extensão é só
-- garantia de compatibilidade com versões mais antigas, e é barata e idempotente.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS waitlist_signups (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email      TEXT NOT NULL,
    profile    TEXT NULL CHECK (profile IN ('passenger', 'driver')),
    source     TEXT NOT NULL DEFAULT 'site',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unicidade a nível de banco: garante, mesmo sob requisições concorrentes,
-- que o mesmo e-mail nunca duplica (a aplicação usa ON CONFLICT DO NOTHING
-- em cima disso — ver src/repositories/waitlist-repository.ts).
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_signups_email_key
    ON waitlist_signups (email);

CREATE INDEX IF NOT EXISTS waitlist_signups_created_at_idx
    ON waitlist_signups (created_at);
