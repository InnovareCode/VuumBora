-- Recadastro sobre conta NUNCA verificada, com o aceite honesto (achado I-4 da revisão S1 rodada 2 + 0019).
--
-- Problema: o cadastro reaproveitava a linha de uma conta não verificada (quem cadastrou o e-mail de OUTRA
-- pessoa não o "reserva" para sempre). Mas `account_consents` é só-acrescenta (0019: gatilho barra UPDATE e DELETE,
-- e a API nem tem o privilégio): o aceite da MESMA versão ficava com a data e o HMAC de IP do primeiro
-- cadastrante (o possível invasor), e o aceite de quem de fato é dono do e-mail não ficava registrado.
--
-- Solução (sem enfraquecer o gatilho do Cronos): o recadastro NÃO atualiza a conta, SUBSTITUI-A. Esta função
-- apaga a conta ainda não verificada do mesmo (tipo, e-mail) — o gatilho de `account_consents` aceita o DELETE
-- porque é a CASCATA da exclusão da própria conta (única exceção da 0019) — e a API insere uma conta nova, com id
-- novo, credencial nova, código novo e aceite novo (data e IP do último cadastro). Efeitos úteis:
--   * o aceite final é, por construção, o do último cadastro (a linha do primeiro some com a conta);
--   * a verificação em andamento da conta antiga morre junto (os códigos caem em cascata), e uma verificação que
--     já tinha lido a conta antiga cai em "código expirado": ela nunca marca como verificada a conta nova;
--   * `access_log.account_id` vira NULL (a trilha fica, sem o vínculo): a conta nunca teve sessão.
--
-- SECURITY DEFINER de mínimo privilégio (a API não tem DELETE em `accounts`, 0017):
--   * só apaga conta ATIVA e NUNCA verificada do (tipo, e-mail) EXATO informado: conta verificada, bloqueada ou
--     excluída é intocável (devolve FALSE e quem chama trata como "e-mail já cadastrado");
--   * `search_path` fixo (sem função/tabela "plantada" por quem chama), EXECUTE só para o papel da API
--     (`PUBLIC` sem acesso). Se o papel não existir (a credencial que migra não cria papéis), só o dono executa — e é o
--     dono que a API usa nesse cenário.
--   * o pior que um chamador malicioso consegue é antecipar a purga de 7 dias de uma conta que nunca foi verificada.
--
-- Concorrência: o `SELECT ... FOR UPDATE` serializa duas substituições do mesmo e-mail; quem perde a corrida vê a
-- linha sumida (FALSE) e a aplicação tenta de novo (insere a conta nova ou substitui a que o vencedor criou).
--
-- Reversão: docs/sql/rollback/0020_down.sql

CREATE OR REPLACE FUNCTION reclaim_unverified_account(p_account_type TEXT, p_email TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id UUID;
BEGIN
    SELECT a.id INTO v_id
      FROM accounts a
     WHERE a.account_type = p_account_type
       AND a.email = p_email
       AND a.email_verified_at IS NULL
       AND a.status = 'active'
       FOR UPDATE;

    IF v_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Cascata: credencial, dispositivos, famílias de sessão, códigos e o aceite (account_consents) vão junto.
    DELETE FROM accounts WHERE id = v_id;
    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION reclaim_unverified_account(TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vuumbora_api') THEN
        RAISE NOTICE '[0020] o papel vuumbora_api não existe; só o dono executa reclaim_unverified_account.';
        RETURN;
    END IF;

    BEGIN
        GRANT EXECUTE ON FUNCTION reclaim_unverified_account(TEXT, TEXT) TO vuumbora_api;
    EXCEPTION
        WHEN insufficient_privilege THEN
            RAISE NOTICE '[0020] sem permissão para ajustar grants; reclaim_unverified_account só roda como dono.';
    END;
END;
$$;
