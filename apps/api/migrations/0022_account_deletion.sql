-- Exclusão de conta de ponta a ponta (item 3 das pendências jurídicas,
-- `docs/juridico/pendencias-para-o-advogado.md`): a conta estava sem rota de
-- exclusão, e `status = 'deleted'` existia no banco (0010) sem nada que o
-- gravasse. O comentário da 0010 já dizia o caminho: "exclusão é
-- anonimização" — a linha fica (prova de aceite, trilha de acesso), o dado
-- pessoal sai.
--
-- `delete_account()` faz tudo numa transação só (padrão já usado em
-- `reset_password_with_code`, 0014/0018, e em `rotate_refresh_token`, 0011):
--   * accounts: e-mail, nome e telefone viram texto genérico (o e-mail some
--     da unicidade POR CONTA — um e-mail excluído pode ser recadastrado),
--     birth_date vira NULL (o gatilho da 0019 aceita NULL quando status é
--     'deleted'), status = 'deleted', deleted_at = now();
--   * account_credentials: o hash vira um hash DESCARTÁVEL (parâmetro da
--     aplicação — o mesmo hash de senha aleatória que o login já usa para
--     disfarçar e-mail inexistente, `identity-service.ts::getDummyHash`).
--     Não é DELETE porque a API não tem esse privilégio na tabela (0017,
--     "ninguém é apagado pela API") e não precisa: sem credencial que
--     funcione, a conta já não entra, e a formatação (CHECK de hash) segue
--     satisfeita;
--   * devices: rótulo (texto livre, pode ter nome de pessoa) vira NULL e o
--     aparelho é revogado;
--   * refresh_token_families: revogadas (reaproveita a coluna que já existe,
--     só acrescenta o motivo 'account_deleted' à lista fechada);
--   * account_email_codes: qualquer código ainda vivo é fechado (mesma ideia
--     de `reset_password_with_code` ao trocar a senha).
--
-- `account_consents` (prova do aceite, LGPD art. 8º §2º) e `access_log`
-- (auditoria) NÃO são tocados: são exatamente o que a lei obriga manter, e o
-- gatilho da 0019 já impede qualquer UPDATE/DELETE no aceite.
--
-- SECURITY INVOKER (padrão, sem DEFINER): roda com os privilégios de quem
-- chama. A API já tem UPDATE em todas as tabelas tocadas (0017); nada de
-- grant novo. Diferente de `reclaim_unverified_account` (0020, que PRECISA de
-- DEFINER porque faz DELETE, privilégio que a API não tem e não deve ganhar).
--
-- Concorrência: `SELECT ... FOR UPDATE` na linha da conta serializa duas
-- exclusões simultâneas (ex.: duas abas com o mesmo token). A segunda vê
-- `status = 'deleted'` depois que a primeira comita e devolve
-- 'already_deleted' sem tocar em nada — idempotente, sem erro.
--
-- Reversão: docs/sql/rollback/0022_down.sql

-- ======================================================================
-- 1) Vocabulário novo nas listas FECHADAS que já existiam
-- ======================================================================

ALTER TABLE access_log DROP CONSTRAINT IF EXISTS access_log_event_valid;
ALTER TABLE access_log ADD CONSTRAINT access_log_event_valid CHECK (event IN (
    'login_success', 'login_failure', 'login_blocked', 'token_refresh',
    'token_reuse_detected', 'logout', 'logout_all', 'password_changed',
    'register', 'email_code_sent', 'email_verified', 'password_reset_requested', 'password_reset_completed',
    'account_deleted'
));

ALTER TABLE refresh_token_families DROP CONSTRAINT IF EXISTS rtf_reason_valid;
ALTER TABLE refresh_token_families ADD CONSTRAINT rtf_reason_valid CHECK (revoke_reason IS NULL OR revoke_reason IN (
    'logout', 'logout_all', 'reuse_detected', 'password_changed',
    'account_inactive', 'device_revoked', 'admin', 'account_deleted'
));

ALTER TABLE account_email_codes DROP CONSTRAINT IF EXISTS aec_close_reason_valid;
ALTER TABLE account_email_codes ADD CONSTRAINT aec_close_reason_valid CHECK (close_reason IS NULL OR close_reason IN (
    'used', 'superseded', 'expired', 'too_many_attempts', 'password_changed', 'account_deleted'
));

-- ======================================================================
-- 2) delete_account(): a exclusão (anonimização) de ponta a ponta
-- ======================================================================

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

    RETURN 'ok';
END;
$$;
