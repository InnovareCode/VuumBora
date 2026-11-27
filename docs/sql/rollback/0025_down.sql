-- Reverte 0025. Rodar com a credencial DONA do banco, ANTES de 0024_down.sql (se for descer mais).
--
-- Volta as funções da 0024 (driver_documents_guard, drivers_guard, driver_approval_blockers, delete_account) e
-- apaga o que a 0025 criou. PERDE a reativação gravada (drivers.reinstated_at/reinstated_by) e o teto de validade
-- por tipo (document_types.max_validity_days). Exportar antes:
--   \copy (SELECT account_id, suspended_at, suspended_by, reinstated_at, reinstated_by FROM drivers WHERE reinstated_at IS NOT NULL) TO 'drivers_reinstated.csv' CSV HEADER
--   \copy (SELECT code, max_validity_days FROM document_types) TO 'document_types_max_validity.csv' CSV HEADER
-- Notas de revisor apagadas pela 0025 não voltam (apagar foi o objetivo). Motorista reativado continua 'approved'
-- com a suspensão anterior na linha: as regras da 0024 aceitam essa linha.
BEGIN;

-- 1) Funções voltam ao texto da 0024 (antes de as colunas sumirem: as da 0025 as citam).
CREATE OR REPLACE FUNCTION driver_documents_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_driver_status TEXT;
    v_city          TEXT;
    v_scope         TEXT;
    v_role          TEXT;
    v_deactivated   TIMESTAMPTZ;
    v_active        BOOLEAN;
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
    -- diferença (chave, hash, revisor de uma decisão já tomada...) é adulteração.
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
    END IF;
    IF NEW IS DISTINCT FROM v_expected THEN
        RAISE EXCEPTION 'driver_documents: só os campos da transição % -> % podem mudar', OLD.status, NEW.status
            USING ERRCODE = '42501';
    END IF;

    IF NEW.status IN ('approved', 'rejected') THEN
        -- Decisão 9: só revisor de documentos ou dono, com acesso ativo.
        SELECT a.role, a.deactivated_at INTO v_role, v_deactivated FROM admin_users a WHERE a.id = NEW.reviewed_by;
        IF v_role IS NULL OR v_role NOT IN ('revisor_documentos', 'dono') OR v_deactivated IS NOT NULL THEN
            RAISE EXCEPTION 'driver_documents: só revisor_documentos ou dono, ativos, revisam documento'
                USING ERRCODE = '42501', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_reviewer_role';
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

    IF NEW.status = 'approved' AND NEW.expires_on IS NOT NULL
       AND NEW.expires_on < city_today((SELECT d.city_code FROM drivers d WHERE d.account_id = NEW.driver_id)) THEN
        RAISE EXCEPTION 'driver_documents: não se aprova documento já vencido'
            USING ERRCODE = '23514', TABLE = 'driver_documents', CONSTRAINT = 'driver_documents_not_expired_on_approval';
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
                   AND (doc.expires_on IS NULL OR doc.expires_on >= d.today)
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

COMMENT ON FUNCTION driver_approval_blockers(UUID) IS NULL;

CREATE OR REPLACE FUNCTION drivers_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_type       TEXT;
    v_email      TEXT;
    v_verified   TIMESTAMPTZ;
    v_acc_status TEXT;
    v_app_email  TEXT;
    v_app_status TEXT;
    v_role       TEXT;
    v_deact      TIMESTAMPTZ;
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

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'pending' THEN
            RAISE EXCEPTION 'drivers: transição % -> pending não é permitida', OLD.status
                USING ERRCODE = '23514', TABLE = 'drivers', CONSTRAINT = 'drivers_status_transition';
        ELSIF NEW.status = 'approved' THEN
            -- N4: aprovado só com a lista vigente satisfeita, etapa 2 completa e veículo ativo.
            IF EXISTS (SELECT 1 FROM driver_approval_blockers(NEW.account_id)) THEN
                RAISE EXCEPTION 'drivers: há pendências para aprovar o motorista (ver driver_approval_blockers)'
                    USING ERRCODE = '23514', TABLE = 'drivers', CONSTRAINT = 'drivers_approval_blocked';
            END IF;
            NEW.approved_at := now();
            NEW.suspended_at := NULL;
            NEW.suspended_by := NULL;
            NEW.suspension_reason := NULL;
        ELSIF NEW.status = 'suspended' THEN
            SELECT a.role, a.deactivated_at INTO v_role, v_deact FROM admin_users a WHERE a.id = NEW.suspended_by;
            IF v_role IS NULL OR v_role NOT IN ('revisor_documentos', 'dono') OR v_deact IS NOT NULL THEN
                RAISE EXCEPTION 'drivers: só revisor_documentos ou dono, ativos, suspendem motorista'
                    USING ERRCODE = '42501', TABLE = 'drivers', CONSTRAINT = 'drivers_suspender_role';
            END IF;
            NEW.suspended_at := now();
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

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

    -- 0024: motorista (nenhuma linha para conta de passageiro).
    UPDATE driver_documents AS doc
       SET status = 'withdrawn'
     WHERE doc.driver_id = p_account_id AND doc.status <> 'withdrawn';

    UPDATE vehicles AS v
       SET status = 'inactive'
     WHERE v.driver_id = p_account_id AND v.status = 'active';

    UPDATE drivers AS dr
       SET status = 'deleted',
           cpf = NULL, cnh_number = NULL, cnh_category = NULL, cnh_expires_on = NULL,
           address_postal_code = NULL, address_street = NULL, address_number = NULL, address_complement = NULL,
           address_neighborhood = NULL, address_city = NULL, address_state = NULL,
           suspended_at = NULL, suspended_by = NULL, suspension_reason = NULL
     WHERE dr.account_id = p_account_id AND dr.status <> 'deleted';

    RETURN 'ok';
END;
$$;

-- 2) O que a 0025 criou.
DROP FUNCTION IF EXISTS driver_availability_blockers(UUID);
COMMENT ON INDEX drivers_cpf_key IS NULL;
ALTER TABLE driver_documents DROP CONSTRAINT IF EXISTS driver_documents_storage_key_owner;
ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_reinstatement_consistent;
ALTER TABLE drivers DROP COLUMN IF EXISTS reinstated_by;
ALTER TABLE drivers DROP COLUMN IF EXISTS reinstated_at;
ALTER TABLE document_types DROP CONSTRAINT IF EXISTS document_types_max_validity_range;
ALTER TABLE document_types DROP COLUMN IF EXISTS max_validity_days;

DELETE FROM schema_migrations WHERE id = '0025_harden_driver_documents.sql';
COMMIT;
