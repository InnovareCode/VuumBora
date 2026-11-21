-- Reverte 0018_reset_code_cumulative_cap (teto cumulativo de tentativas do código de
-- redefinição, achado I-7): remove as funções novas e o índice e RESTAURA as três
-- funções como eram na 0014. Credencial dona. Rodar depois de 0019_down e antes de
-- 0017_down. Não apaga dado.
--
-- RECONSTRUÍDO PELO CRONOS em 21/11/2026: o arquivo original foi sobrescrito por
-- engano quando a migração de idade/aceite (hoje 0019) nasceu com o mesmo número
-- 0018. O corpo das funções abaixo é copiado byte a byte da 0014; se a Vega tiver
-- uma versão própria, vale a dela (confira que restaura as mesmas assinaturas).
BEGIN;
DROP FUNCTION IF EXISTS reset_password_with_code(UUID, TEXT, TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS consume_email_code(UUID, TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS issue_email_code(UUID, TEXT, TEXT, INTERVAL, INTERVAL, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS reset_failures_last_day(UUID);
DROP INDEX IF EXISTS aec_reset_failures_idx;

-- ---- funções da 0014 (versão sem teto cumulativo) ----

-- Emite um código (primeiro envio OU reenvio), ou diz por que não. Devolve
-- SEMPRE uma linha:
--   issued            emitido; o anterior vivo (se havia) foi fechado
--   unknown           conta não existe
--   account_inactive  conta bloqueada/excluída
--   already_verified  (verify_email) e-mail já verificado: nada a enviar
--   email_not_verified (password_reset) e-mail ainda não verificado: a
--                     recuperação só vale para conta verificada
--   too_soon          reenvio antes do intervalo mínimo (`retry_after_s`)
--   rate_limited      teto de envios por hora atingido (`retry_after_s`)
-- A aplicação só envia o e-mail quando `outcome = 'issued'`, e o código em
-- claro só existe na memória dela, entre gerar e enviar.
CREATE OR REPLACE FUNCTION issue_email_code(
    p_account_id   UUID,
    p_purpose      TEXT,
    p_code_hash    TEXT,
    p_ttl          INTERVAL DEFAULT INTERVAL '15 minutes',
    p_min_interval INTERVAL DEFAULT INTERVAL '60 seconds',
    p_max_per_hour INTEGER  DEFAULT 5
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

-- Confere um código. Devolve SEMPRE uma linha:
--   ok         código certo e vivo: foi CONSUMIDO (uso único). Para
--              'verify_email', `accounts.email_verified_at` é preenchido
--              na mesma transação.
--   invalid    código errado; `attempts_left` diz quantas tentativas restam
--   locked     tentativas esgotadas: o código morreu, peça outro
--   expired    passou do prazo: o código foi fechado, peça outro
--   no_code    não há código vivo para esta conta/finalidade
-- Não levanta exceção nas recusas: uma exceção desfaria a contagem da
-- tentativa errada (e o brute force sairia de graça).
-- Para 'password_reset' use `reset_password_with_code()`, que consome o
-- código E troca a senha atomicamente.
CREATE OR REPLACE FUNCTION consume_email_code(
    p_account_id UUID,
    p_purpose    TEXT,
    p_code_hash  TEXT
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

-- Redefinição de senha: confere o código (mesmas saídas de
-- `consume_email_code`) e, só se for `ok`, na MESMA transação: troca o hash
-- da senha, revoga todas as sessões vivas da conta ('password_changed') e
-- fecha qualquer outro código de redefinição vivo. O hash novo é gerado pela
-- aplicação (bcrypt/argon2id); o banco só o aceita no formato de hash (CHECK
-- de `account_credentials`).
CREATE OR REPLACE FUNCTION reset_password_with_code(
    p_account_id    UUID,
    p_code_hash     TEXT,
    p_new_password_hash TEXT,
    p_new_hash_algo TEXT DEFAULT 'bcrypt'
) RETURNS TABLE (outcome TEXT, attempts_left INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
    r_outcome TEXT;
    r_left    INTEGER;
BEGIN
    SELECT x.outcome, x.attempts_left INTO r_outcome, r_left
      FROM consume_email_code(p_account_id, 'password_reset', p_code_hash) x;

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

DELETE FROM schema_migrations WHERE id = '0018_reset_code_cumulative_cap.sql';
COMMIT;
