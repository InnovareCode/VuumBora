-- Endurece as regras da 0024 (documentos do motorista) enquanto as tabelas ainda estão vazias
-- (revisão de segurança da fatia D1). Cada regra vale até para a credencial dona (gatilho ou CHECK).
--
-- ---------- Regras novas ----------
--
-- VALIDADE OBRIGATÓRIA. Aprovar documento de um tipo com validade (has_expiry na lista vigente da cidade do
-- motorista) exige expires_on (23514 driver_documents_expiry_required). Aprovar exige o tipo na lista vigente
-- (23514 driver_documents_type_in_current_list): sem ele não há como saber se a validade é obrigatória.
-- driver_approval_blockers() deixa de contar como satisfeito o documento aprovado SEM data cujo tipo exige
-- validade (vira document_missing): vale também para lista nova que passe a exigir validade de um tipo.
--
-- TETO DA VALIDADE. expires_on até o dia local da cidade + document_types.max_validity_days
-- (23514 driver_documents_expiry_within_limit): pega erro de digitação como o ano 2099. Valores PROVISÓRIOS
-- da equipe, ajustáveis pelo operador (UPDATE em document_types, credencial dona): CNH 10 anos (prazo máximo
-- do CTB), CRLV 2 anos, certidão de antecedentes 1 ano; demais tipos, 10 anos.
--
-- CONFLITO DE INTERESSE. Ninguém decide sobre o próprio cadastro de motorista: o administrador cujo e-mail é
-- o da conta do motorista não aprova nem recusa documento dele (42501 driver_documents_reviewer_not_self) e
-- não o suspende nem reativa (42501 drivers_actor_not_self). Comparação pelo e-mail normalizado.
--
-- SUSPENSÃO.
--   - Sair da suspensão (suspended -> approved) exige autor: reinstated_by de revisor_documentos/dono ativo
--     (42501 drivers_reinstater_role), além das pendências zeradas (drivers_approval_blocked, como na 0024).
--     O banco grava reinstated_at. A suspensão (suspended_at, suspended_by, suspension_reason) FICA na linha
--     como prova; uma suspensão nova substitui a anterior e limpa a reativação. O histórico completo de
--     suspensões e reativações é o admin_audit_log, gravado pela rota na mesma transação.
--   - approved_at guarda a PRIMEIRA aprovação (a reativação não o reescreve).
--   - Aprovação, suspensão e reativação só mudam na troca de estado correspondente (42501 fora dela), como a
--     decisão em driver_documents. Na exclusão da conta esses campos só podem ser apagados.
--
-- DISPONIBILIDADE. driver_availability_blockers(id) é a definição ÚNICA de "pode ficar online": o status do
-- motorista (driver_not_approved | driver_suspended | driver_deleted) seguido das pendências de
-- driver_approval_blockers(). Zero linhas = pode. driver_approval_blockers() continua respondendo só "pode ser
-- aprovado" (ela não olha o status).
--
-- EXCLUSÃO. drivers.status = 'deleted' só com a conta excluída (23514 drivers_deleted_requires_account_deleted);
-- delete_account já exclui a conta antes, na mesma transação.
--
-- ARQUIVO DO PRÓPRIO MOTORISTA. storage_key começa por 'driver-docs/<driver_id>/' (CHECK
-- driver_documents_storage_key_owner): uma rota com defeito não grava a chave do objeto de outro motorista.
--
-- NOTA DO REVISOR. A nota interna (review_note, texto livre) pode ser apagada ao retirar o documento
-- (-> withdrawn) e num documento já retirado (só apagada, nunca reescrita). delete_account passa a apagá-la;
-- motivo, autor e data da revisão continuam sendo a prova. Os documentos já retirados de contas excluídas
-- têm a nota apagada aqui.
--
-- Autor: reviewed_by, suspended_by e reinstated_by são conferidos aqui quanto a papel e acesso ativo; que o
-- autor é quem está logado, quem garante é a rota (o autor vem sempre da sessão, nunca do corpo).
--
-- ---------- Correções a comentários da 0024 (migração aplicada não se edita) ----------
--
-- 1) Índice drivers_cpf_key (0024, perto da linha 453). O comentário diz que o mesmo CPF não abre segunda conta
--    de motorista "(ex.: suspenso tentando de novo)". Isso só vale entre motoristas VIVOS: a exclusão da conta
--    apaga o CPF e a suspensão, e o CPF fica livre para uma conta nova. Lembrar um impedimento depois da
--    exclusão depende de decisão do dono com o advogado (o que guardar, por quanto tempo); até lá o banco NÃO
--    garante isso. O comentário do índice no catálogo passa a dizer o que vale.
-- 2) Cabeçalho da 0024 (APROVAÇÃO DO MOTORISTA): "a regra de disponibilidade consulta driver_approval_blockers()".
--    Ficar online é driver_availability_blockers() (acima); driver_approval_blockers() não olha o status.
--
-- Zero downtime: colunas novas anuláveis ou com DEFAULT constante (sem reescrita), CHECKs novos em tabelas
-- vazias em produção (nenhum código as escreve ainda) e CREATE OR REPLACE de funções. Se houver linha fora
-- da regra nova, a migração falha inteira (transação) em vez de aceitar dado inválido.
--
-- Reversão: docs/sql/rollback/0025_down.sql (perde reinstated_* e max_validity_days; exportar antes).

-- ======================================================================
-- 1) Colunas e restrições
-- ======================================================================

ALTER TABLE document_types
    ADD COLUMN IF NOT EXISTS max_validity_days SMALLINT NOT NULL DEFAULT 3653;
ALTER TABLE document_types DROP CONSTRAINT IF EXISTS document_types_max_validity_range;
ALTER TABLE document_types
    ADD CONSTRAINT document_types_max_validity_range CHECK (max_validity_days BETWEEN 1 AND 3653);

COMMENT ON COLUMN document_types.max_validity_days IS
    'Teto da validade informada na aprovação: dia local da cidade + N dias. Provisório (proposta da equipe).';

UPDATE document_types SET max_validity_days = 731 WHERE code = 'crlv';
UPDATE document_types SET max_validity_days = 365 WHERE code = 'criminal_record';

ALTER TABLE drivers
    ADD COLUMN IF NOT EXISTS reinstated_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS reinstated_by UUID NULL REFERENCES admin_users (id);
ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_reinstatement_consistent;
-- Reativação: autor e data juntos, só em motorista aprovado, depois da suspensão que ela encerrou.
ALTER TABLE drivers
    ADD CONSTRAINT drivers_reinstatement_consistent CHECK (
        num_nulls(reinstated_at, reinstated_by) IN (0, 2)
        AND (reinstated_at IS NULL
             OR (status = 'approved' AND suspended_at IS NOT NULL AND reinstated_at >= suspended_at)));

ALTER TABLE driver_documents DROP CONSTRAINT IF EXISTS driver_documents_storage_key_owner;
ALTER TABLE driver_documents
    ADD CONSTRAINT driver_documents_storage_key_owner CHECK (
        storage_key LIKE 'driver-docs/' || driver_id::text || '/%');

COMMENT ON INDEX drivers_cpf_key IS
    'Um CPF por motorista VIVO. A exclusão da conta apaga o CPF: ele não impede uma conta nova (ver 0025).';

-- ======================================================================
-- 2) driver_documents_guard: validade obrigatória, teto, conflito de interesse, nota apagável na retirada
-- ======================================================================

CREATE OR REPLACE FUNCTION driver_documents_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_driver_status TEXT;
    v_city          TEXT;
    v_scope         TEXT;
    v_role          TEXT;
    v_deactivated   TIMESTAMPTZ;
    v_admin_email   TEXT;
    v_active        BOOLEAN;
    v_has_expiry    BOOLEAN;
    v_max_days      SMALLINT;
    v_today         DATE;
    v_expected      driver_documents;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT d.status, d.city_code INTO v_driver_status, v_city FROM drivers d WHERE d.account_id = NEW.driver_id;
        IF NOT FOUND THEN
            RETURN NEW; -- quem recusa é a FK de driver_id
        END IF;
        IF v_driver_status = 'deleted' THEN
            RAISE EXCEPTION 'driver_documents: motorista de conta excluída'
                USING ERRCODE = '23514', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_driver_not_deleted';
        END IF;
        -- `422 unknown_document_type`: o tipo tem de estar na lista VIGENTE da cidade do motorista.
        SELECT r.scope INTO v_scope FROM current_document_requirements r WHERE r.city_code = v_city AND r.type_code = NEW.type_code;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'driver_documents: tipo fora da lista vigente da cidade'
                USING ERRCODE = '23514', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_type_in_current_list';
        END IF;
        IF (v_scope = 'vehicle') <> (NEW.vehicle_id IS NOT NULL) THEN
            RAISE EXCEPTION 'driver_documents: documento de veículo exige vehicle_id; documento pessoal não aceita'
                USING ERRCODE = '23514', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_vehicle_scope';
        END IF;
        IF NEW.vehicle_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM vehicles v WHERE v.id = NEW.vehicle_id AND v.status = 'active') THEN
            RAISE EXCEPTION 'driver_documents: o veículo não está ativo'
                USING ERRCODE = '23514', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_vehicle_active';
        END IF;
        -- Todo envio nasce aguardando o arquivo; estado e decisão só mudam pelas transições abaixo.
        NEW.status := 'awaiting_upload';
        NEW.created_at := now();
        NEW.status_changed_at := now();
        NEW.submitted_at := NULL;
        NEW.reviewed_at := NULL;
        NEW.reviewed_by := NULL;
        NEW.rejection_code := NULL;
        NEW.review_note := NULL;
        NEW.expires_on := NULL;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        -- Documento vivo não some (rotina de descarte só apaga o que já saiu de uso).
        IF OLD.status IN ('awaiting_upload', 'submitted', 'approved') THEN
            RAISE EXCEPTION 'driver_documents: documento em uso não se apaga (estado %)', OLD.status
                USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE: só mudança de estado, e só pelas transições permitidas.
    IF NEW.status = OLD.status THEN
        IF NEW IS DISTINCT FROM OLD THEN
            -- Exceção única: documento retirado pode ter a nota interna do revisor apagada (só apagada).
            v_expected := OLD;
            v_expected.review_note := NULL;
            IF OLD.status = 'withdrawn' AND NEW IS NOT DISTINCT FROM v_expected THEN
                RETURN NEW;
            END IF;
            RAISE EXCEPTION 'driver_documents: o documento só muda pela troca de estado'
                USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    IF NOT (
           (OLD.status = 'awaiting_upload' AND NEW.status IN ('submitted', 'superseded', 'withdrawn'))
        OR (OLD.status = 'submitted'       AND NEW.status IN ('approved', 'rejected', 'superseded', 'withdrawn'))
        OR (OLD.status = 'approved'        AND NEW.status IN ('expired', 'superseded', 'withdrawn'))
        OR (OLD.status IN ('rejected', 'expired', 'superseded') AND NEW.status = 'withdrawn')
    ) THEN
        RAISE EXCEPTION 'driver_documents: transição % -> % não é permitida', OLD.status, NEW.status
            USING ERRCODE = '23514', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_status_transition';
    END IF;

    -- Linha esperada: a antiga com o novo estado e, só na decisão, os campos da decisão. Qualquer outra
    -- diferença (chave, hash, revisor de uma decisão já tomada...) é adulteração. Na retirada, a nota pode sumir.
    v_expected := OLD;
    v_expected.status := NEW.status;
    v_expected.status_changed_at := NEW.status_changed_at;
    IF NEW.status = 'submitted' THEN
        v_expected.submitted_at := NEW.submitted_at;
    ELSIF NEW.status = 'approved' THEN
        v_expected.reviewed_at := NEW.reviewed_at;
        v_expected.reviewed_by := NEW.reviewed_by;
        v_expected.review_note := NEW.review_note;
        v_expected.expires_on := NEW.expires_on;
    ELSIF NEW.status = 'rejected' THEN
        v_expected.reviewed_at := NEW.reviewed_at;
        v_expected.reviewed_by := NEW.reviewed_by;
        v_expected.review_note := NEW.review_note;
        v_expected.rejection_code := NEW.rejection_code;
    ELSIF NEW.status = 'withdrawn' AND NEW.review_note IS NULL THEN
        v_expected.review_note := NULL;
    END IF;
    IF NEW IS DISTINCT FROM v_expected THEN
        RAISE EXCEPTION 'driver_documents: só os campos da transição % -> % podem mudar', OLD.status, NEW.status
            USING ERRCODE = '42501';
    END IF;

    IF NEW.status IN ('approved', 'rejected') THEN
        -- Decisão 9: só revisor de documentos ou dono, com acesso ativo.
        SELECT a.role, a.deactivated_at, lower(btrim(a.email)) INTO v_role, v_deactivated, v_admin_email
          FROM admin_users a WHERE a.id = NEW.reviewed_by;
        IF v_role IS NULL OR v_role NOT IN ('revisor_documentos', 'dono') OR v_deactivated IS NOT NULL THEN
            RAISE EXCEPTION 'driver_documents: só revisor_documentos ou dono, ativos, revisam documento'
                USING ERRCODE = '42501', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_reviewer_role';
        END IF;
        -- 0025: ninguém decide documento do próprio cadastro (e-mail da conta = e-mail do administrador).
        IF EXISTS (SELECT 1 FROM accounts acc WHERE acc.id = NEW.driver_id AND acc.email = v_admin_email) THEN
            RAISE EXCEPTION 'driver_documents: o revisor não decide documento do próprio cadastro'
                USING ERRCODE = '42501', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_reviewer_not_self';
        END IF;
        NEW.reviewed_at := now();
    END IF;

    -- Sem motivo quem recusa é o CHECK driver_documents_rejected_has_reason; motivo desconhecido ou aposentado, aqui.
    IF NEW.status = 'rejected' AND NEW.rejection_code IS NOT NULL THEN
        SELECT r.active INTO v_active FROM document_rejection_reasons r WHERE r.code = NEW.rejection_code;
        IF v_active IS NOT TRUE THEN
            RAISE EXCEPTION 'driver_documents: motivo de recusa fora da lista ativa'
                USING ERRCODE = '23503', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_rejection_reason_active';
        END IF;
    END IF;

    IF NEW.status = 'approved' THEN
        SELECT d.city_code INTO v_city FROM drivers d WHERE d.account_id = NEW.driver_id;
        v_today := city_today(v_city);
        -- 0025: a lista vigente diz se o tipo exige validade; fora dela não se aprova.
        SELECT r.has_expiry INTO v_has_expiry
          FROM current_document_requirements r WHERE r.city_code = v_city AND r.type_code = NEW.type_code;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'driver_documents: só se aprova documento de tipo da lista vigente da cidade'
                USING ERRCODE = '23514', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_type_in_current_list';
        END IF;
        IF v_has_expiry AND NEW.expires_on IS NULL THEN
            RAISE EXCEPTION 'driver_documents: este tipo de documento exige a validade na aprovação'
                USING ERRCODE = '23514', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_expiry_required';
        END IF;
        IF NEW.expires_on IS NOT NULL AND NEW.expires_on < v_today THEN
            RAISE EXCEPTION 'driver_documents: não se aprova documento já vencido'
                USING ERRCODE = '23514', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_not_expired_on_approval';
        END IF;
        SELECT t.max_validity_days INTO v_max_days FROM document_types t WHERE t.code = NEW.type_code;
        IF NEW.expires_on IS NOT NULL AND NEW.expires_on > v_today + v_max_days THEN
            RAISE EXCEPTION 'driver_documents: validade além do teto do tipo de documento (confira a data)'
                USING ERRCODE = '23514', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_expiry_within_limit';
        END IF;
    END IF;

    IF NEW.status = 'expired'
       AND NOT (OLD.expires_on < city_today((SELECT d.city_code FROM drivers d WHERE d.account_id = NEW.driver_id))) THEN
        RAISE EXCEPTION 'driver_documents: o documento ainda está dentro da validade'
            USING ERRCODE = '23514', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_expired_after_date';
    END IF;

    IF NEW.status = 'submitted' THEN
        NEW.submitted_at := now();
    END IF;
    NEW.status_changed_at := now();
    RETURN NEW;
END;
$$;

-- ======================================================================
-- 3) driver_approval_blockers: aprovado SEM data não satisfaz tipo que exige validade
-- ======================================================================
-- Igual à 0024, exceto a condição de "satisfeito" (CTE pending).
CREATE OR REPLACE FUNCTION driver_approval_blockers(p_driver_id UUID)
RETURNS TABLE (blocker TEXT, type_code TEXT)
LANGUAGE sql STABLE AS $$
    WITH d AS (
        SELECT dr.account_id, dr.city_code, city_today(dr.city_code) AS today,
               (dr.cpf IS NOT NULL AND dr.cnh_number IS NOT NULL AND dr.address_postal_code IS NOT NULL) AS onboarded,
               (SELECT v.id FROM vehicles v WHERE v.driver_id = dr.account_id AND v.status = 'active') AS vehicle_id
          FROM drivers dr
         WHERE dr.account_id = p_driver_id
    ),
    pending AS (
        SELECT r.type_code, r.scope, r.sort_order, d.*
          FROM d
          JOIN current_document_requirements r ON r.city_code = d.city_code AND r.required
         WHERE NOT EXISTS (
                SELECT 1 FROM driver_documents doc
                 WHERE doc.driver_id = d.account_id AND doc.type_code = r.type_code
                   AND doc.status = 'approved'
                   AND (doc.expires_on >= d.today OR (doc.expires_on IS NULL AND NOT r.has_expiry))
                   AND (r.scope = 'driver' OR doc.vehicle_id = d.vehicle_id))
    )
    SELECT x.blocker, x.type_code FROM (
        SELECT 'driver_not_found' AS blocker, NULL::text AS type_code, 0 AS ord
         WHERE NOT EXISTS (SELECT 1 FROM d)
        UNION ALL
        SELECT 'no_published_requirements', NULL, 1 FROM d
         WHERE NOT EXISTS (SELECT 1 FROM current_document_requirements r WHERE r.city_code = d.city_code)
        UNION ALL
        SELECT 'onboarding_incomplete', NULL, 2 FROM d WHERE NOT d.onboarded
        UNION ALL
        SELECT 'no_active_vehicle', NULL, 3 FROM d WHERE d.vehicle_id IS NULL
        UNION ALL
        SELECT CASE WHEN EXISTS (
                    SELECT 1 FROM driver_documents doc
                     WHERE doc.driver_id = p.account_id AND doc.type_code = p.type_code
                       AND doc.status IN ('approved', 'expired') AND doc.expires_on < p.today
                       AND (p.scope = 'driver' OR doc.vehicle_id = p.vehicle_id))
                    THEN 'document_expired' ELSE 'document_missing' END,
               p.type_code, 100 + p.sort_order
          FROM pending p
    ) x
    ORDER BY x.ord, x.type_code
$$;

COMMENT ON FUNCTION driver_approval_blockers(UUID) IS
    'O que impede APROVAR o motorista (N4). Não olha o status: ficar online é driver_availability_blockers().';

-- ======================================================================
-- 4) driver_availability_blockers: a definição ÚNICA de "pode ficar online"
-- ======================================================================
-- Zero linhas = pode. Primeiro o status (driver_not_approved | driver_suspended | driver_deleted), depois as
-- pendências de driver_approval_blockers() na ordem dela (driver_not_found se o motorista não existe).
-- WITH ORDINALITY preserva a ordem da função interna. SECURITY INVOKER, como as da 0024.
CREATE OR REPLACE FUNCTION driver_availability_blockers(p_driver_id UUID)
RETURNS TABLE (blocker TEXT, type_code TEXT)
LANGUAGE sql STABLE AS $$
    SELECT x.blocker, x.type_code FROM (
        SELECT CASE dr.status WHEN 'pending' THEN 'driver_not_approved'
                              WHEN 'suspended' THEN 'driver_suspended'
                              ELSE 'driver_deleted' END AS blocker,
               NULL::text AS type_code, 0 AS ord, 0::bigint AS n
          FROM drivers dr
         WHERE dr.account_id = p_driver_id AND dr.status <> 'approved'
        UNION ALL
        SELECT b.blocker, b.type_code, 1, b.n
          FROM driver_approval_blockers(p_driver_id) WITH ORDINALITY AS b (blocker, type_code, n)
    ) x
    ORDER BY x.ord, x.n
$$;

REVOKE ALL ON FUNCTION driver_availability_blockers(UUID) FROM PUBLIC;

-- ======================================================================
-- 5) drivers_guard: reativação com autor, campos de decisão travados, exclusão só com conta excluída
-- ======================================================================

CREATE OR REPLACE FUNCTION drivers_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_type        TEXT;
    v_email       TEXT;
    v_verified    TIMESTAMPTZ;
    v_acc_status  TEXT;
    v_app_email   TEXT;
    v_app_status  TEXT;
    v_actor       UUID;
    v_role        TEXT;
    v_deact       TIMESTAMPTZ;
    v_admin_email TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT a.account_type, a.email, a.email_verified_at, a.status
          INTO v_type, v_email, v_verified, v_acc_status
          FROM accounts a WHERE a.id = NEW.account_id;
        IF NOT FOUND THEN
            RETURN NEW; -- quem recusa é a FK de account_id
        END IF;
        IF v_type <> 'driver' THEN
            RAISE EXCEPTION 'drivers: a conta não é de motorista'
                USING ERRCODE = '23514', TABLE = 'drivers', CONSTRAINT = 'drivers_account_is_driver';
        END IF;
        IF v_acc_status <> 'active' OR v_verified IS NULL THEN
            RAISE EXCEPTION 'drivers: a conta precisa estar ativa e com e-mail verificado'
                USING ERRCODE = '23514', TABLE = 'drivers', CONSTRAINT = 'drivers_account_verified';
        END IF;
        SELECT da.email, da.status INTO v_app_email, v_app_status FROM driver_applications da WHERE da.id = NEW.application_id;
        IF NOT FOUND THEN
            RETURN NEW; -- quem recusa é a FK de application_id
        END IF;
        IF v_app_status <> 'approved' THEN
            RAISE EXCEPTION 'drivers: a candidatura não está aprovada'
                USING ERRCODE = '23514', TABLE = 'drivers', CONSTRAINT = 'drivers_application_approved';
        END IF;
        IF lower(btrim(v_app_email)) <> v_email THEN
            RAISE EXCEPTION 'drivers: o e-mail da candidatura não é o da conta'
                USING ERRCODE = '23514', TABLE = 'drivers', CONSTRAINT = 'drivers_application_email_match';
        END IF;
        NEW.status := 'pending';
        NEW.linked_at := now();
        NEW.created_at := now();
        NEW.approved_at := NULL;
        NEW.suspended_at := NULL;
        NEW.suspended_by := NULL;
        NEW.suspension_reason := NULL;
        NEW.reinstated_at := NULL;
        NEW.reinstated_by := NULL;
        RETURN NEW;
    END IF;

    -- UPDATE
    IF OLD.status = 'deleted' THEN
        RAISE EXCEPTION 'drivers: motorista de conta excluída não muda'
            USING ERRCODE = '42501';
    END IF;
    IF NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.application_id IS DISTINCT FROM OLD.application_id
       OR NEW.city_code IS DISTINCT FROM OLD.city_code OR NEW.linked_at IS DISTINCT FROM OLD.linked_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'drivers: conta, candidatura, cidade e data do vínculo são imutáveis'
            USING ERRCODE = '42501';
    END IF;
    -- CPF identifica a pessoa: uma vez informado, não troca (só sai na exclusão da conta).
    IF OLD.cpf IS NOT NULL AND NEW.cpf IS DISTINCT FROM OLD.cpf AND NEW.status <> 'deleted' THEN
        RAISE EXCEPTION 'drivers: o CPF não muda depois de informado'
            USING ERRCODE = '23514', TABLE = 'drivers', CONSTRAINT = 'drivers_cpf_immutable';
    END IF;

    -- 0025: aprovação, suspensão e reativação são a prova da decisão; sem troca de estado, não mudam.
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        IF NEW.approved_at IS DISTINCT FROM OLD.approved_at
           OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at OR NEW.suspended_by IS DISTINCT FROM OLD.suspended_by
           OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason
           OR NEW.reinstated_at IS DISTINCT FROM OLD.reinstated_at OR NEW.reinstated_by IS DISTINCT FROM OLD.reinstated_by THEN
            RAISE EXCEPTION 'drivers: aprovação, suspensão e reativação só mudam na troca de estado'
                USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status = 'pending' THEN
        RAISE EXCEPTION 'drivers: transição % -> pending não é permitida', OLD.status
            USING ERRCODE = '23514', TABLE = 'drivers', CONSTRAINT = 'drivers_status_transition';
    END IF;

    IF NEW.status = 'deleted' THEN
        -- Só a exclusão da conta leva o motorista a 'deleted' (delete_account exclui a conta antes).
        IF NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = NEW.account_id AND a.status = 'deleted') THEN
            RAISE EXCEPTION 'drivers: motorista só é excluído junto com a conta'
                USING ERRCODE = '23514', TABLE = 'drivers', CONSTRAINT = 'drivers_deleted_requires_account_deleted';
        END IF;
        -- Na exclusão, os campos da decisão só podem ser apagados.
        IF (NEW.approved_at IS NOT NULL AND NEW.approved_at IS DISTINCT FROM OLD.approved_at)
           OR (NEW.suspended_at IS NOT NULL AND NEW.suspended_at IS DISTINCT FROM OLD.suspended_at)
           OR (NEW.suspended_by IS NOT NULL AND NEW.suspended_by IS DISTINCT FROM OLD.suspended_by)
           OR (NEW.suspension_reason IS NOT NULL AND NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason)
           OR (NEW.reinstated_at IS NOT NULL AND NEW.reinstated_at IS DISTINCT FROM OLD.reinstated_at)
           OR (NEW.reinstated_by IS NOT NULL AND NEW.reinstated_by IS DISTINCT FROM OLD.reinstated_by) THEN
            RAISE EXCEPTION 'drivers: na exclusão, aprovação, suspensão e reativação só se apagam'
                USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    -- approved (aprovação ou reativação) e suspended: o autor, quando há, é revisor_documentos/dono ativo e não
    -- é o próprio motorista.
    IF NEW.status = 'suspended' THEN
        v_actor := NEW.suspended_by;
    ELSIF OLD.status = 'suspended' THEN
        v_actor := NEW.reinstated_by;
    END IF;
    IF NEW.status = 'suspended' OR OLD.status = 'suspended' THEN
        SELECT a.role, a.deactivated_at, lower(btrim(a.email)) INTO v_role, v_deact, v_admin_email
          FROM admin_users a WHERE a.id = v_actor;
        IF v_role IS NULL OR v_role NOT IN ('revisor_documentos', 'dono') OR v_deact IS NOT NULL THEN
            IF NEW.status = 'suspended' THEN
                RAISE EXCEPTION 'drivers: só revisor_documentos ou dono, ativos, suspendem motorista'
                    USING ERRCODE = '42501', TABLE = 'drivers', CONSTRAINT = 'drivers_suspender_role';
            END IF;
            RAISE EXCEPTION 'drivers: sair da suspensão exige autor (revisor_documentos ou dono, ativos)'
                USING ERRCODE = '42501', TABLE = 'drivers', CONSTRAINT = 'drivers_reinstater_role';
        END IF;
        IF EXISTS (SELECT 1 FROM accounts acc WHERE acc.id = NEW.account_id AND acc.email = v_admin_email) THEN
            RAISE EXCEPTION 'drivers: ninguém suspende nem reativa o próprio cadastro de motorista'
                USING ERRCODE = '42501', TABLE = 'drivers', CONSTRAINT = 'drivers_actor_not_self';
        END IF;
    END IF;

    IF NEW.status = 'suspended' THEN
        -- Suspensão nova: substitui a anterior e encerra a reativação; a aprovação fica.
        IF NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
            RAISE EXCEPTION 'drivers: a suspensão não reescreve a aprovação'
                USING ERRCODE = '42501';
        END IF;
        NEW.suspended_at := now();
        NEW.reinstated_at := NULL;
        NEW.reinstated_by := NULL;
        RETURN NEW;
    END IF;

    -- NEW.status = 'approved'
    IF OLD.status = 'pending' THEN
        IF NEW.suspended_at IS DISTINCT FROM OLD.suspended_at OR NEW.suspended_by IS DISTINCT FROM OLD.suspended_by
           OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason
           OR NEW.reinstated_at IS DISTINCT FROM OLD.reinstated_at OR NEW.reinstated_by IS DISTINCT FROM OLD.reinstated_by THEN
            RAISE EXCEPTION 'drivers: a aprovação não grava suspensão nem reativação'
                USING ERRCODE = '42501';
        END IF;
    ELSE
        -- Reativação: a suspensão fica na linha como prova.
        IF NEW.suspended_at IS DISTINCT FROM OLD.suspended_at OR NEW.suspended_by IS DISTINCT FROM OLD.suspended_by
           OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason THEN
            RAISE EXCEPTION 'drivers: a reativação não apaga nem reescreve a suspensão'
                USING ERRCODE = '42501';
        END IF;
        NEW.reinstated_at := now();
    END IF;
    -- N4: aprovado só com a lista vigente satisfeita, etapa 2 completa e veículo ativo.
    IF EXISTS (SELECT 1 FROM driver_approval_blockers(NEW.account_id)) THEN
        RAISE EXCEPTION 'drivers: há pendências para aprovar o motorista (ver driver_approval_blockers)'
            USING ERRCODE = '23514', TABLE = 'drivers', CONSTRAINT = 'drivers_approval_blocked';
    END IF;
    NEW.approved_at := COALESCE(OLD.approved_at, now());
    RETURN NEW;
END;
$$;

-- ======================================================================
-- 6) delete_account: a nota interna do revisor sai junto; a reativação também
-- ======================================================================
-- Igual à 0024, mais review_note e reinstated_* apagados.
CREATE OR REPLACE FUNCTION delete_account(
    p_account_id           UUID,
    p_scrub_password_hash  TEXT
) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT a.status INTO v_status FROM accounts a WHERE a.id = p_account_id FOR UPDATE;

    IF v_status IS NULL THEN
        RETURN 'not_found';
    END IF;
    IF v_status = 'deleted' THEN
        RETURN 'already_deleted';
    END IF;

    UPDATE accounts AS a
       SET email      = 'excluida-' || p_account_id || '@excluida.vuumbora.invalid',
           full_name  = 'Conta excluída',
           phone      = NULL,
           birth_date = NULL,
           status     = 'deleted',
           deleted_at = now()
     WHERE a.id = p_account_id;

    UPDATE account_credentials AS c
       SET password_hash = p_scrub_password_hash
     WHERE c.account_id = p_account_id;

    UPDATE devices AS d
       SET device_label = NULL,
           revoked_at   = COALESCE(d.revoked_at, now())
     WHERE d.account_id = p_account_id;

    UPDATE refresh_token_families AS f
       SET revoked_at = now(), revoke_reason = 'account_deleted'
     WHERE f.account_id = p_account_id AND f.revoked_at IS NULL;

    UPDATE account_email_codes AS c
       SET closed_at = now(), close_reason = 'account_deleted'
     WHERE c.account_id = p_account_id AND c.closed_at IS NULL;

    -- 0024/0025: motorista (nenhuma linha para conta de passageiro).
    UPDATE driver_documents AS doc
       SET status = 'withdrawn', review_note = NULL
     WHERE doc.driver_id = p_account_id AND (doc.status <> 'withdrawn' OR doc.review_note IS NOT NULL);

    UPDATE vehicles AS v
       SET status = 'inactive'
     WHERE v.driver_id = p_account_id AND v.status = 'active';

    UPDATE drivers AS dr
       SET status = 'deleted',
           cpf = NULL, cnh_number = NULL, cnh_category = NULL, cnh_expires_on = NULL,
           address_postal_code = NULL, address_street = NULL, address_number = NULL, address_complement = NULL,
           address_neighborhood = NULL, address_city = NULL, address_state = NULL,
           suspended_at = NULL, suspended_by = NULL, suspension_reason = NULL,
           reinstated_at = NULL, reinstated_by = NULL
     WHERE dr.account_id = p_account_id AND dr.status <> 'deleted';

    RETURN 'ok';
END;
$$;

-- Contas já excluídas antes desta migração: a nota interna dos documentos retirados sai agora.
UPDATE driver_documents AS doc
   SET review_note = NULL
  FROM drivers AS dr
 WHERE dr.account_id = doc.driver_id AND dr.status = 'deleted'
   AND doc.status = 'withdrawn' AND doc.review_note IS NOT NULL;

-- ======================================================================
-- 7) Privilégios do papel de runtime (camada 2)
-- ======================================================================
-- Colunas novas herdam o privilégio da tabela (document_types segue só leitura; drivers segue com UPDATE,
-- porque a rota grava a reativação). Conferência em produção: scripts/conferir-papel-api.mjs.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vuumbora_api') THEN
        RAISE NOTICE '[0025] o papel vuumbora_api não existe; driver_availability_blockers fica só para o dono.';
        RETURN;
    END IF;

    BEGIN
        GRANT EXECUTE ON FUNCTION driver_availability_blockers(UUID) TO vuumbora_api;
    EXCEPTION
        WHEN insufficient_privilege THEN
            RAISE NOTICE '[0025] sem permissão para ajustar grants; a API não executa driver_availability_blockers.';
    END;
END;
$$;
