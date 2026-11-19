-- Candidatura de pré-cadastro de motorista — etapa 1 de 2
-- (docs/decisoes-do-dono.md → "Campos do pré-cadastro de motorista" e
-- "DECISÃO: duas etapas", 19/11/2026).
--
-- Tabela PRÓPRIA, separada de `waitlist_signups` (migração 0001): são
-- públicos e fluxos diferentes. `waitlist_signups` continua sendo a lista
-- de espera simples do passageiro (só e-mail, perfil sempre 'passenger',
-- endpoint `/v1/waitlist`, sem mudança nesta migração). Esta tabela nova
-- atende o endpoint `/v1/driver-applications`, consumido pelo
-- `DriverApplicationForm` do site.
--
-- Etapa 2 (endereço, bairro, CEP, documentos) NÃO entra aqui de propósito
-- — só existe depois que houver processo de aprovação e guarda segura
-- (decisão 9, docs/decisoes-do-dono.md). Quando chegar a hora, o padrão é
-- `ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS ... NULL`,
-- igual à migração 0002 original da lista de espera — sem backfill, sem
-- quebrar linha existente.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS driver_applications (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                   TEXT NOT NULL,
    email                  TEXT NOT NULL,
    phone                  TEXT NOT NULL,
    city                   TEXT NOT NULL,
    state                  TEXT NOT NULL,
    already_drives_for_app BOOLEAN NULL,
    has_own_vehicle        BOOLEAN NULL,
    -- Estado da candidatura. Hoje só o INSERT escreve (sempre 'pending', via
    -- este DEFAULT) — nenhum endpoint ou script desta entrega lê ou altera.
    -- Criada agora para não exigir outra migração quando o fluxo de
    -- aprovação for definido (quem analisa, prazo, critério — pendência
    -- registrada em docs/decisoes-do-dono.md). Trocar para 'approved'/
    -- 'rejected' é, por ora, manual (SQL direto), até existir volume que
    -- justifique um script dedicado.
    status                 TEXT NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'rejected')),
    source                 TEXT NOT NULL DEFAULT 'site',
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mesmo padrão anti-duplicata da lista de espera: unicidade por e-mail a
-- nível de banco, não no código — resolve concorrência de graça (duas
-- requisições simultâneas com o mesmo e-mail nunca criam duas linhas) e é
-- a base do `ON CONFLICT (email) DO NOTHING` no repositório.
--
-- `phone` NÃO é único de propósito: duas pessoas podem compartilhar o
-- mesmo WhatsApp (ex. número de família), e isso não é motivo para
-- rejeitar a segunda candidatura.
CREATE UNIQUE INDEX IF NOT EXISTS driver_applications_email_key
    ON driver_applications (email);

CREATE INDEX IF NOT EXISTS driver_applications_created_at_idx
    ON driver_applications (created_at);

CREATE INDEX IF NOT EXISTS driver_applications_status_idx
    ON driver_applications (status);
