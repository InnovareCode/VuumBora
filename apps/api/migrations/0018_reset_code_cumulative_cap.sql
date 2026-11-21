-- Teto CUMULATIVO de tentativas do código de redefinição de senha por conta.
-- Revisão de segurança S1, rodada 2, achado I-7.
--
-- Antes: 5 palpites por código x até 5 códigos por hora = 25 palpites por hora
-- contra UMA conta (600 por dia). Sobre 1.000.000 de possibilidades isso dá ~0,06%
-- por dia e ~1,8% em 30 dias de ataque contínuo; e acertar significa trocar a
-- senha e tomar a conta. O limite por código (5) não sabe que o código anterior
-- foi massacrado.
--
-- Agora: as FALHAS (`attempts`) dos códigos de redefinição da conta criados nas
-- últimas 24 horas se somam. Atingido o teto (`p_max_failures`, a aplicação passa 10):
--   * `consume_email_code` / `reset_password_with_code` recusam com 'account_locked'
--     SEM comparar o código (nem o certo passa) e SEM gastar tentativa;
--   * `issue_email_code` deixa de emitir código de redefinição ('reset_locked'): não faz
--     sentido (nem é gentil com o titular) mandar um e-mail com código que não vale.
-- O bloqueio rola com a janela: some quando as falhas saem das últimas 24 h.
-- A soma é lida DEPOIS do lock da linha do código vivo (`FOR UPDATE`), então duas
-- tentativas simultâneas não driblam o teto. Vale só para 'password_reset'
-- (a verificação de e-mail não troca senha); `p_max_failures` nulo = sem teto
-- (comportamento da 0014).
--
-- As funções mudam de assinatura (parâmetro novo no fim, com padrão), então as
-- versões antigas são removidas antes: um CREATE OR REPLACE criaria uma sobrecarga
-- ao lado da antiga, e a antiga continuaria sem teto.
--
-- Reversão: docs/sql/rollback/0018_down.sql

CREATE INDEX IF NOT EXISTS aec_reset_failures_idx
    ON account_email_codes (account_id, created_at DESC) WHERE purpose = 'password_reset' AND attempts > 0;

DROP FUNCTION IF EXISTS issue_email_code(UUID, TEXT, TEXT, INTERVAL, INTERVAL, INTEGER);
DROP FUNCTION IF EXISTS consume_email_code(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS reset_password_with_code(UUID, TEXT, TEXT, TEXT);

-- Falhas acumuladas dos códigos de redefinição da conta nas últimas 24 horas.
CREATE OR REPLACE FUNCTION reset_failures_last_day(p_account_id UUID) RETURNS INTEGER
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(sum(c.attempts), 0)::INTEGER
      FROM account_email_codes c
     WHERE c.account_id = p_account_id AND c.purpose = 'password_reset'
       AND c.created_at > now() - INTERVAL '24 hours';
$$;

-- Emite um código (primeiro envio OU reenvio), ou diz por que não. Igual à 0014, mais:
--   reset_locked      (password_reset) teto cumulativo de falhas do dia atingido
CREATE OR REPLACE FUNCTION issue_email_code(
    p_account_id   UUID,
    p_purpose      TEXT,
    p_code_hash    TEXT,
    p_ttl          INTERVAL DEFAULT INTERVAL '15 minutes',
    p_min_interval INTERVAL DEFAULT INTERVAL '60 seconds',
    p_max_per_hour INTEGER  DEFAULT 5,
    p_max_reset_failures INTEGER DEFAULT NULL
) RETURNS TABLE (outcome TEXT, code_id UUID, retry_after_s INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
    a_status   TEXT;
    a_verified TIMESTAMPTZ;
    last_at    TIMESTAMPTZ;
    hour_count INTEGER;
    oldest_in_hour TIMESTAMPTZ;
    new_id     UUID;
BEGIN
    IF p_purpose NOT IN ('verify_email', 'password_reset') THEN
        RAISE EXCEPTION 'purpose inválido: %', p_purpose USING ERRCODE = '22023';
    END IF;

    -- Trava a conta: dois pedidos simultâneos de reenvio se serializam, então
    -- o intervalo mínimo e o teto por hora não têm corrida.
    SELECT a.status, a.email_verified_at INTO a_status, a_verified
      FROM accounts a WHERE a.id = p_account_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'unknown'::TEXT, NULL::UUID, NULL::INTEGER;
        RETURN;
    END IF;
    IF a_status <> 'active' THEN
        RETURN QUERY SELECT 'account_inactive'::TEXT, NULL::UUID, NULL::INTEGER;
        RETURN;
    END IF;
    IF p_purpose = 'verify_email' AND a_verified IS NOT NULL THEN
        RETURN QUERY SELECT 'already_verified'::TEXT, NULL::UUID, NULL::INTEGER;
        RETURN;
    END IF;
    IF p_purpose = 'password_reset' AND a_verified IS NULL THEN
        RETURN QUERY SELECT 'email_not_verified'::TEXT, NULL::UUID, NULL::INTEGER;
        RETURN;
    END IF;
    IF p_purpose = 'password_reset' AND p_max_reset_failures IS NOT NULL
       AND reset_failures_last_day(p_account_id) >= p_max_reset_failures THEN
        RETURN QUERY SELECT 'reset_locked'::TEXT, NULL::UUID, NULL::INTEGER;
        RETURN;
    END IF;

    SELECT max(c.created_at) INTO last_at
      FROM account_email_codes c
     WHERE c.account_id = p_account_id AND c.purpose = p_purpose;
    IF last_at IS NOT NULL AND last_at + p_min_interval > now() THEN
        RETURN QUERY SELECT 'too_soon'::TEXT, NULL::UUID,
            GREATEST(1, ceil(extract(epoch FROM (last_at + p_min_interval - now())))::INTEGER);
        RETURN;
    END IF;

    SELECT count(*)::INTEGER, min(c.created_at) INTO hour_count, oldest_in_hour
      FROM account_email_codes c
     WHERE c.account_id = p_account_id AND c.purpose = p_purpose
       AND c.created_at > now() - INTERVAL '1 hour';
    IF hour_count >= p_max_per_hour THEN
        RETURN QUERY SELECT 'rate_limited'::TEXT, NULL::UUID,
            GREATEST(1, ceil(extract(epoch FROM (oldest_in_hour + INTERVAL '1 hour' - now())))::INTEGER);
        RETURN;
    END IF;

    UPDATE account_email_codes AS c
       SET closed_at = now(), close_reason = 'superseded'
     WHERE c.account_id = p_account_id AND c.purpose = p_purpose AND c.closed_at IS NULL;

    INSERT INTO account_email_codes (account_id, purpose, code_hash, expires_at)
    VALUES (p_account_id, p_purpose, p_code_hash, now() + p_ttl)
    RETURNING id INTO new_id;

    RETURN QUERY SELECT 'issued'::TEXT, new_id, NULL::INTEGER;
END;
$$;

-- Confere um código. Igual à 0014, mais:
--   account_locked    (password_reset) teto cumulativo do dia atingido: nada é comparado
-- Não levanta exceção nas recusas (uma exceção desfaria a contagem da tentativa errada).
CREATE OR REPLACE FUNCTION consume_email_code(
    p_account_id UUID,
    p_purpose    TEXT,
    p_code_hash  TEXT,
    p_max_failures INTEGER DEFAULT NULL
) RETURNS TABLE (outcome TEXT, attempts_left INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
    c_id       UUID;
    c_hash     TEXT;
    c_expires  TIMESTAMPTZ;
    c_attempts SMALLINT;
    c_max      SMALLINT;
BEGIN
    SELECT c.id, c.code_hash, c.expires_at, c.attempts, c.max_attempts
      INTO c_id, c_hash, c_expires, c_attempts, c_max
      FROM account_email_codes c
     WHERE c.account_id = p_account_id AND c.purpose = p_purpose AND c.closed_at IS NULL
       FOR UPDATE;

    IF c_id IS NULL THEN
        RETURN QUERY SELECT 'no_code'::TEXT, 0;
        RETURN;
    END IF;

    -- Depois do lock da linha: o teto é lido com as falhas já confirmadas por quem veio antes.
    IF p_purpose = 'password_reset' AND p_max_failures IS NOT NULL
       AND reset_failures_last_day(p_account_id) >= p_max_failures THEN
        RETURN QUERY SELECT 'account_locked'::TEXT, 0;
        RETURN;
    END IF;

    IF c_expires <= now() THEN
        UPDATE account_email_codes AS c SET closed_at = now(), close_reason = 'expired' WHERE c.id = c_id;
        RETURN QUERY SELECT 'expired'::TEXT, 0;
        RETURN;
    END IF;

    IF c_hash <> p_code_hash THEN
        c_attempts := c_attempts + 1;
        IF c_attempts >= c_max THEN
            UPDATE account_email_codes AS c
               SET attempts = c_attempts, closed_at = now(), close_reason = 'too_many_attempts'
             WHERE c.id = c_id;
            RETURN QUERY SELECT 'locked'::TEXT, 0;
        ELSE
            UPDATE account_email_codes AS c SET attempts = c_attempts WHERE c.id = c_id;
            RETURN QUERY SELECT 'invalid'::TEXT, (c_max - c_attempts)::INTEGER;
        END IF;
        RETURN;
    END IF;

    UPDATE account_email_codes AS c SET closed_at = now(), close_reason = 'used' WHERE c.id = c_id;
    IF p_purpose = 'verify_email' THEN
        UPDATE accounts AS a SET email_verified_at = COALESCE(a.email_verified_at, now())
         WHERE a.id = p_account_id;
    END IF;
    RETURN QUERY SELECT 'ok'::TEXT, (c_max - c_attempts)::INTEGER;
END;
$$;

-- Redefinição de senha: igual à 0014; repassa o teto cumulativo e, com ele atingido, devolve 'account_locked'.
CREATE OR REPLACE FUNCTION reset_password_with_code(
    p_account_id    UUID,
    p_code_hash     TEXT,
    p_new_password_hash TEXT,
    p_new_hash_algo TEXT DEFAULT 'bcrypt',
    p_max_failures  INTEGER DEFAULT NULL
) RETURNS TABLE (outcome TEXT, attempts_left INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
    r_outcome TEXT;
    r_left    INTEGER;
BEGIN
    SELECT x.outcome, x.attempts_left INTO r_outcome, r_left
      FROM consume_email_code(p_account_id, 'password_reset', p_code_hash, p_max_failures) x;

    IF r_outcome <> 'ok' THEN
        RETURN QUERY SELECT r_outcome, r_left;
        RETURN;
    END IF;

    UPDATE account_credentials AS cr
       SET password_hash = p_new_password_hash, hash_algo = p_new_hash_algo,
           password_changed_at = now()
     WHERE cr.account_id = p_account_id;

    UPDATE refresh_token_families AS f
       SET revoked_at = now(), revoke_reason = 'password_changed'
     WHERE f.account_id = p_account_id AND f.revoked_at IS NULL;

    UPDATE account_email_codes AS c
       SET closed_at = now(), close_reason = 'password_changed'
     WHERE c.account_id = p_account_id AND c.closed_at IS NULL;

    RETURN QUERY SELECT 'ok'::TEXT, r_left;
END;
$$;
