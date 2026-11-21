-- Idade mínima e registro de aceite (decisões do dono, 21/11/2026):
--   * 18 anos, para passageiro e para motorista -> `accounts.birth_date`, com a
--     regra GARANTIDA PELO BANCO (a aplicação valida primeiro; o banco é a rede);
--   * aceite dos Termos de Uso e da Política de Privacidade, com a VERSÃO aceita
--     -> `account_consents`, uma linha por aceite, que a API só acrescenta.
-- Os textos e os números de versão dos documentos AINDA NÃO existem e não são
-- inventados aqui: a versão é entrada da aplicação (texto livre e curto).
--
-- ---------- 1) accounts.birth_date ----------
--
-- A coluna é NULLABLE de propósito, e o "obrigatória" mora no gatilho:
--   (a) exclusão = anonimização (0010): o dado pessoal sai e a linha fica.
--       Minimização LGPD: a data de nascimento pode ser APAGADA nessa hora, e o
--       gatilho aceita NULL quando `status = 'deleted'`. (Não exige apagar: a
--       rotina de anonimização, que ainda não existe, é quem decide o conjunto.)
--   (b) contas anteriores a esta migração não têm data e não dá para inventá-la:
--       elas seguem NULL e continuam podendo ser atualizadas (e-mail verificado,
--       senha...). Em produção não há nenhuma: o banco está na 0009 e a
--       identidade dos apps nasce na 0010. A migração AVISA (NOTICE) quantas
--       existem. Se algum dia sobrarem, quem as trata é a aplicação (pedir a data
--       antes de abrir sessão) — o banco só recusa conta NOVA sem data.
-- "Obrigatória para conta nova": INSERT sem data (e status diferente de
-- 'deleted') é recusado (23502). Uma conta que TEM data não volta a ficar sem
-- ela, nem uma conta excluída "ressuscita" sem ela.
--
-- Por que gatilho e não CHECK: "idade >= 18" depende do dia de hoje, e CHECK com
-- now() não é imutável — o restore e o pg_dump deixam de ser confiáveis. O que é
-- estático (data plausível: não anterior a 1900) é CHECK; o que depende do
-- relógio (não futura, 18 anos completos) é gatilho, avaliado só quando a data é
-- inserida ou alterada (quem já tem 18 não "perde" os 18 com o tempo).
--
-- "Hoje" é o dia em Natal (America/Fortaleza, UTC-3, sem horário de verão), não o
-- do fuso da sessão: o servidor costuma estar em UTC, e às 21h em Natal já é o dia
-- seguinte lá — a conta de quem faz 18 anos amanhã seria aceita 3 horas antes.
-- Quem nasceu em 29/02 completa 18 anos em 01/03 nos anos não bissextos (leitura do
-- art. 132 §3º do Código Civil, "no dia imediato se faltar exata correspondência"
-- — é o que o Postgres calcula por padrão; confirmar com o jurídico se importar).
--
-- A mensagem de erro NUNCA ecoa a data informada (dado pessoal vai para log).
-- Os erros trazem o nome da restrição (err.constraint no `pg`) para a API mapear:
--   accounts_birth_date_min_age      23514  menos de 18 anos completos
--   accounts_birth_date_not_future   23514  data no futuro
--   accounts_birth_date_plausible    23514  anterior a 1900 (CHECK estático)
--   (coluna birth_date)              23502  ausente em conta nova
--
-- Zero downtime: `ADD COLUMN` nullable e sem DEFAULT é só catálogo (não reescreve
-- a tabela); o CHECK novo recai sobre coluna 100% NULL; o gatilho é criado com
-- lock curto. Sem índice: ninguém consulta por data de nascimento.
--
-- ---------- 2) account_consents ----------
--
-- Prova do aceite (LGPD art. 8º §2º: o ônus de provar o consentimento é do
-- controlador), em duas camadas, como o `admin_audit_log` (0012):
--   1) GATILHO (vale até para o dono do banco, que é a credencial que a API usa
--      enquanto não conectar como `vuumbora_api`):
--        - INSERT: `accepted_at` é SEMPRE o relógio do banco (o valor enviado é
--          descartado — a API não pode "ajustar" quando aceitou);
--        - UPDATE: recusado, com UMA exceção — `ip_hash` -> NULL (minimização: o
--          hash do IP pode ser apagado depois de um prazo, o resto é evidência);
--        - DELETE: recusado, exceto em CASCATA da exclusão da própria conta (a
--          retenção apaga conta nunca verificada, e o aceite dela vai junto).
--      NÃO há gatilho de TRUNCATE (diferente do `admin_audit_log`): os testes e a
--      retenção usam `TRUNCATE accounts CASCADE`, que passa por aqui. A defesa
--      contra TRUNCATE é de privilégio (a API nunca o tem).
--   2) PAPEL `vuumbora_api`: só SELECT e INSERT. UPDATE/DELETE/TRUNCATE negados.
--      A 0012 deixou DML completo como padrão para tabela nova; o REVOKE é aqui.
-- Efeito para a aplicação: INSERT ... ON CONFLICT (account_id, document, version)
-- DO NOTHING funciona (não precisa de UPDATE); DO UPDATE seria negado.
--
-- A exclusão da conta é ANONIMIZAÇÃO e a linha de `accounts` permanece; os aceites
-- dela permanecem também (são a prova, e só carregam o id da conta + documento +
-- versão + data).
--
-- `document` é lista FECHADA: documento novo (ex.: termo do motorista) é migração
-- nova, porque é decisão de produto/jurídica, não dado de formulário.
--
-- Reversão: docs/sql/rollback/0019_down.sql

-- ======================================================================
-- 1) accounts.birth_date
-- ======================================================================

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS birth_date DATE NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'accounts_birth_date_plausible' AND conrelid = 'accounts'::regclass
    ) THEN
        ALTER TABLE accounts ADD CONSTRAINT accounts_birth_date_plausible
            CHECK (birth_date IS NULL OR birth_date >= DATE '1900-01-01');
    END IF;
END;
$$;

COMMENT ON COLUMN accounts.birth_date IS
    'Dado pessoal. Só para provar 18+ no cadastro; não exibir, não logar, não exportar. NULL em conta excluída (anonimizada).';

CREATE OR REPLACE FUNCTION accounts_enforce_birth_date() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    -- "Hoje" no fuso do negócio, e a data de nascimento mais recente que já tem 18 anos completos.
    v_today  DATE := (now() AT TIME ZONE 'America/Fortaleza')::date;
    v_cutoff DATE := ((now() AT TIME ZONE 'America/Fortaleza')::date - INTERVAL '18 years')::date;
BEGIN
    IF NEW.birth_date IS NULL THEN
        -- Ausente só vale para conta excluída, ou para conta que JÁ era assim antes desta migração e não ganhou data.
        IF NEW.status <> 'deleted'
           AND (TG_OP = 'INSERT' OR OLD.birth_date IS NOT NULL OR OLD.status = 'deleted') THEN
            RAISE EXCEPTION 'accounts: birth_date é obrigatória'
                USING ERRCODE = '23502', TABLE = 'accounts', COLUMN = 'birth_date'; -- not_null_violation
        END IF;
        RETURN NEW;
    END IF;

    -- Só reavalia quando a data entra ou muda (o tempo só aumenta a idade).
    IF TG_OP = 'INSERT' OR NEW.birth_date IS DISTINCT FROM OLD.birth_date THEN
        IF NEW.birth_date > v_today THEN
            RAISE EXCEPTION 'accounts: data de nascimento no futuro'
                USING ERRCODE = '23514', TABLE = 'accounts', CONSTRAINT = 'accounts_birth_date_not_future';
        END IF;
        IF NEW.birth_date > v_cutoff THEN
            RAISE EXCEPTION 'accounts: idade mínima de 18 anos completos'
                USING ERRCODE = '23514', TABLE = 'accounts', CONSTRAINT = 'accounts_birth_date_min_age';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_birth_date_guard ON accounts;
CREATE TRIGGER accounts_birth_date_guard BEFORE INSERT OR UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION accounts_enforce_birth_date();

DO $$
DECLARE
    v_legacy BIGINT;
BEGIN
    SELECT count(*) INTO v_legacy FROM accounts WHERE birth_date IS NULL AND status <> 'deleted';
    IF v_legacy > 0 THEN
        RAISE NOTICE '[0019] % conta(s) anterior(es) sem data de nascimento: o banco não as recusa, a aplicação precisa pedir a data.', v_legacy;
    END IF;
END;
$$;

-- ======================================================================
-- 2) account_consents
-- ======================================================================

CREATE TABLE IF NOT EXISTS account_consents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- CASCADE: a retenção apaga conta nunca verificada (credencial dona) e o aceite vai junto.
    account_id  UUID NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    document    TEXT NOT NULL,
    -- Entrada da aplicação (ex.: a data/rótulo da versão publicada). O banco só exige
    -- formato sensato e curto: sem espaço nas pontas, sem quebra de linha.
    version     TEXT NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- HMAC do IP com pepper (mesma regra de login_attempts/access_log): nunca o IP em claro.
    ip_hash     TEXT NULL,
    CONSTRAINT account_consents_document_valid CHECK (document IN ('terms_of_use', 'privacy_policy')),
    CONSTRAINT account_consents_version_format CHECK (version ~ '^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}$'),
    CONSTRAINT account_consents_ip_len CHECK (ip_hash IS NULL OR length(ip_hash) = 64)
);

-- Um aceite por conta + documento + versão. Também é o índice da consulta que a
-- API faz ("esta conta já aceitou a versão X do documento Y?") e de "listar os
-- aceites desta conta" (coluna líder account_id). Nenhum outro índice: não há
-- consulta por documento/versão em produção hoje.
CREATE UNIQUE INDEX IF NOT EXISTS account_consents_account_document_version_key
    ON account_consents (account_id, document, version);

COMMENT ON TABLE account_consents IS
    'Aceite de Termos de Uso / Política de Privacidade. Append-only: a API só lê e acrescenta.';

CREATE OR REPLACE FUNCTION account_consents_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Quando aceitou é fato do banco, não dado enviado pela aplicação.
        NEW.accepted_at := now();
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Única mutação permitida: apagar o ip_hash (minimização). Nada mais muda.
        IF OLD.ip_hash IS NOT NULL AND NEW.ip_hash IS NULL
           AND NEW.id = OLD.id AND NEW.account_id = OLD.account_id
           AND NEW.document = OLD.document AND NEW.version = OLD.version
           AND NEW.accepted_at = OLD.accepted_at THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'account_consents é append-only: UPDATE não é permitido'
            USING ERRCODE = '42501'; -- insufficient_privilege: mesma família do REVOKE
    END IF;

    -- DELETE: só como cascata da exclusão da conta (a linha-mãe já saiu nesta mesma
    -- instrução; o gatilho de integridade referencial roda um nível acima).
    IF pg_trigger_depth() > 1
       AND NOT EXISTS (SELECT 1 FROM accounts WHERE id = OLD.account_id) THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'account_consents é append-only: DELETE não é permitido'
        USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS account_consents_append_only ON account_consents;
CREATE TRIGGER account_consents_append_only BEFORE INSERT OR UPDATE OR DELETE ON account_consents
    FOR EACH ROW EXECUTE FUNCTION account_consents_guard();

-- Camada 2: o papel de runtime só lê e acrescenta. Nunca derruba o boot: sem
-- permissão para ajustar grants (a credencial que migra não é dona das tabelas)
-- ou sem o papel, avisa e segue; o gatilho acima já vale.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vuumbora_api') THEN
        RAISE NOTICE '[0019] o papel vuumbora_api não existe; só o gatilho protege account_consents.';
        RETURN;
    END IF;

    BEGIN
        GRANT SELECT, INSERT ON account_consents TO vuumbora_api;
        REVOKE UPDATE, DELETE, TRUNCATE ON account_consents FROM vuumbora_api;
    EXCEPTION
        WHEN insufficient_privilege THEN
            RAISE NOTICE '[0019] sem permissão para ajustar grants; só o gatilho protege account_consents.';
    END;
END;
$$;
