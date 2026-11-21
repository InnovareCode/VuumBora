-- Sessão dos apps: tokens de renovação com ROTAÇÃO, limite de tentativas de
-- login e trilha de acesso. Depende de 0010.
--
-- O token de acesso (curto) é JWT sem estado — não mora aqui. Só o de
-- RENOVAÇÃO (longo) é guardado, e só o HASH dele (sha256 do valor bruto,
-- que só existe no aparelho): ler esta tabela não dá para fabricar sessão.
--
-- Rotação: cada renovação consome o token e emite outro na MESMA família.
-- Apresentar um token já consumido = reuso = alguém copiou o token: a
-- família inteira é revogada. Isso é feito por `rotate_refresh_token()`,
-- atômico no banco, para a corrida entre duas requisições simultâneas não
-- depender de cuidado da aplicação.
--
-- Conta sem e-mail verificado não abre sessão (decisão do dono): um trigger
-- recusa a criação de família de token para conta não verificada, e a
-- renovação trata conta que perdeu a verificação como inativa. É regra do
-- banco, não só da aplicação.
--
-- Contas são SEPARADAS por tipo (0010): `account_id` já identifica o tipo,
-- então token/família não precisam de coluna própria. O tipo entra no
-- identificador do limite de tentativas (ver `login_attempts`).
--
-- Reversão: docs/sql/rollback/0011_down.sql

CREATE TABLE IF NOT EXISTS refresh_token_families (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id    UUID NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    device_id     UUID NULL REFERENCES devices (id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Teto absoluto da sessão: a rotação nunca estende além disto, então
    -- um token roubado e rodado para sempre ainda morre aqui.
    expires_at    TIMESTAMPTZ NOT NULL,
    revoked_at    TIMESTAMPTZ NULL,
    revoke_reason TEXT NULL,
    CONSTRAINT rtf_reason_valid CHECK (revoke_reason IS NULL OR revoke_reason IN (
        'logout', 'logout_all', 'reuse_detected', 'password_changed',
        'account_inactive', 'device_revoked', 'admin'
    )),
    CONSTRAINT rtf_revoked_consistent CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL))
);

CREATE OR REPLACE FUNCTION rtf_require_verified_email() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM accounts a
                    WHERE a.id = NEW.account_id AND a.email_verified_at IS NOT NULL) THEN
        RAISE EXCEPTION 'conta sem e-mail verificado não abre sessão'
            USING ERRCODE = '23514'; -- check_violation
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rtf_require_verified_email ON refresh_token_families;
CREATE TRIGGER rtf_require_verified_email BEFORE INSERT ON refresh_token_families
    FOR EACH ROW EXECUTE FUNCTION rtf_require_verified_email();

-- "Sair de todos os aparelhos" / troca de senha: famílias vivas da conta.
CREATE INDEX IF NOT EXISTS rtf_account_live_idx
    ON refresh_token_families (account_id) WHERE revoked_at IS NULL;
-- Revogar um dispositivo acha as famílias dele (e a FK SET NULL).
CREATE INDEX IF NOT EXISTS rtf_device_idx
    ON refresh_token_families (device_id) WHERE device_id IS NOT NULL;
-- Suporte à limpeza periódica de famílias vencidas (cascata apaga os tokens).
CREATE INDEX IF NOT EXISTS rtf_expires_at_idx ON refresh_token_families (expires_at);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id   UUID NOT NULL REFERENCES refresh_token_families (id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    -- Preenchido quando o token é consumido pela rotação.
    used_at     TIMESTAMPTZ NULL,
    replaced_by UUID NULL REFERENCES refresh_tokens (id) ON DELETE SET NULL,
    CONSTRAINT refresh_tokens_hash_len CHECK (length(token_hash) = 64)
);

-- Lookup da renovação: sempre por hash.
CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_hash_key ON refresh_tokens (token_hash);
-- A família nunca tem dois tokens "vivos": a rotação não consegue bifurcar
-- a sessão, nem por bug nem por corrida.
CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_one_live_per_family
    ON refresh_tokens (family_id) WHERE used_at IS NULL;
-- FK da cascata (família -> tokens) cobre também os já usados.
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens (family_id);

-- Consome `p_old_hash` e emite `p_new_hash` na mesma família, ou diz por que
-- não. Devolve SEMPRE uma linha com `outcome`:
--   rotated          renovado; `p_new_hash` agora é o token vivo
--   reuse_detected   token já consumido: família revogada
--   revoked          família já estava revogada
--   expired          token ou teto da família vencido (nada é revogado)
--   account_inactive conta bloqueada/excluída/sem e-mail verificado: família revogada
--   unknown          hash não existe
-- Não levanta exceção nas recusas: uma exceção desfaria a própria
-- revogação por reuso. A linha da família é travada (FOR UPDATE), então
-- duas renovações simultâneas com o mesmo token são serializadas — a
-- segunda vê `used_at` preenchido e cai em `reuse_detected`.
CREATE OR REPLACE FUNCTION rotate_refresh_token(
    p_old_hash    TEXT,
    p_new_hash    TEXT,
    p_new_expires TIMESTAMPTZ
) RETURNS TABLE (outcome TEXT, family_id UUID, account_id UUID, device_id UUID)
LANGUAGE plpgsql AS $$
DECLARE
    t_id      UUID;
    t_used    TIMESTAMPTZ;
    t_expires TIMESTAMPTZ;
    f_id      UUID;
    f_account UUID;
    f_device  UUID;
    f_revoked TIMESTAMPTZ;
    f_expires TIMESTAMPTZ;
    a_status  TEXT;
    a_verified TIMESTAMPTZ;
    new_id    UUID;
BEGIN
    SELECT t.id, t.used_at, t.expires_at, f.id, f.account_id, f.device_id, f.revoked_at, f.expires_at, a.status, a.email_verified_at
      INTO t_id, t_used, t_expires, f_id, f_account, f_device, f_revoked, f_expires, a_status, a_verified
      FROM refresh_tokens t
      JOIN refresh_token_families f ON f.id = t.family_id
      JOIN accounts a ON a.id = f.account_id
     WHERE t.token_hash = p_old_hash
       FOR UPDATE OF t, f;

    IF t_id IS NULL THEN
        RETURN QUERY SELECT 'unknown'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID;
        RETURN;
    END IF;

    IF f_revoked IS NOT NULL THEN
        RETURN QUERY SELECT 'revoked'::TEXT, f_id, f_account, f_device;
        RETURN;
    END IF;

    IF t_used IS NOT NULL THEN
        UPDATE refresh_token_families AS rf
           SET revoked_at = now(), revoke_reason = 'reuse_detected'
         WHERE rf.id = f_id;
        RETURN QUERY SELECT 'reuse_detected'::TEXT, f_id, f_account, f_device;
        RETURN;
    END IF;

    IF a_status <> 'active' OR a_verified IS NULL THEN
        UPDATE refresh_token_families AS rf
           SET revoked_at = now(), revoke_reason = 'account_inactive'
         WHERE rf.id = f_id;
        RETURN QUERY SELECT 'account_inactive'::TEXT, f_id, f_account, f_device;
        RETURN;
    END IF;

    IF t_expires <= now() OR f_expires <= now() THEN
        RETURN QUERY SELECT 'expired'::TEXT, f_id, f_account, f_device;
        RETURN;
    END IF;

    -- Consome primeiro, insere depois: o índice parcial "um vivo por
    -- família" só aceita o novo depois que o antigo deixou de estar vivo.
    UPDATE refresh_tokens AS rt SET used_at = now() WHERE rt.id = t_id;
    INSERT INTO refresh_tokens (family_id, token_hash, expires_at)
    VALUES (f_id, p_new_hash, LEAST(p_new_expires, f_expires))
    RETURNING id INTO new_id;
    UPDATE refresh_tokens AS rt SET replaced_by = new_id WHERE rt.id = t_id;

    RETURN QUERY SELECT 'rotated'::TEXT, f_id, f_account, f_device;
END;
$$;

-- Tentativas de login, para o limite de 5 por janela. NÃO guarda e-mail
-- nem IP em claro: `identifier_hash` é HMAC-SHA256 (hex) do identificador
-- normalizado e `ip_hash` é HMAC do IP, ambos com segredo (pepper) da
-- aplicação. Hash SEM chave de IPv4 se desfaz por força bruta em segundos —
-- por isso HMAC, não sha256 puro.
CREATE TABLE IF NOT EXISTS login_attempts (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- O que está sendo limitado. 'login' = tentativa de entrar; 'register' =
    -- consulta de "e-mail já cadastrado" no cadastro (decisão do dono: a
    -- resposta é explícita, então a consulta tem teto); 'code_request' =
    -- pedido de reenvio de código de verificação/redefinição.
    scope           TEXT NOT NULL DEFAULT 'login',
    -- HMAC do identificador JÁ ESCOPADO PELO TIPO DE CONTA (ex.: HMAC de
    -- 'passenger:ana@x.com'), senão errar a senha do passageiro bloquearia o
    -- motorista de mesmo e-mail — e vice-versa.
    identifier_hash TEXT NOT NULL,
    ip_hash         TEXT NULL,
    succeeded       BOOLEAN NOT NULL,
    attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT login_attempts_scope_valid CHECK (scope IN ('login', 'register', 'code_request')),
    CONSTRAINT login_attempts_identifier_len CHECK (length(identifier_hash) = 64),
    CONSTRAINT login_attempts_ip_len CHECK (ip_hash IS NULL OR length(ip_hash) = 64)
);

-- Duas perguntas só: "quantas falhas deste identificador na janela" e "…
-- deste IP". Sem índice solto em `attempted_at`: a retenção é curta (a
-- aplicação apaga o que passou da janela), a tabela fica pequena.
CREATE INDEX IF NOT EXISTS login_attempts_identifier_idx
    ON login_attempts (scope, identifier_hash, attempted_at DESC);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx
    ON login_attempts (scope, ip_hash, attempted_at DESC) WHERE ip_hash IS NOT NULL;

-- Falhas desde o último sucesso, dentro da janela, NO ESCOPO pedido.
-- Bloqueia quando >= o limite da aplicação (5 no login). Um sucesso zera a
-- contagem (falhas anteriores a ele deixam de contar). No escopo 'register'
-- e 'code_request' a aplicação registra toda tentativa como succeeded=false:
-- a conta é "tentativas na janela".
CREATE OR REPLACE FUNCTION login_failures_in_window(
    p_identifier_hash TEXT,
    p_window INTERVAL,
    p_scope TEXT DEFAULT 'login'
) RETURNS INTEGER LANGUAGE sql STABLE AS $$
    SELECT count(*)::INTEGER
      FROM login_attempts
     WHERE scope = p_scope
       AND identifier_hash = p_identifier_hash
       AND NOT succeeded
       AND attempted_at > now() - p_window
       AND attempted_at > COALESCE(
             (SELECT max(attempted_at) FROM login_attempts
               WHERE scope = p_scope AND identifier_hash = p_identifier_hash AND succeeded),
             '-infinity'::TIMESTAMPTZ);
$$;

-- Trilha de acesso (quem entrou, saiu, renovou, foi recusado). SEM dado
-- pessoal em claro: nem e-mail, nem IP, nem User-Agent completo — só ids
-- internos, HMAC do IP e a FAMÍLIA do UA (ex.: 'android'). Uso: suporte e
-- investigação de fraude. A API só faz INSERT/SELECT (ver 0012); retenção
-- de 90 dias por rotina rodada com a credencial dona do banco.
CREATE TABLE IF NOT EXISTS access_log (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    event             TEXT NOT NULL,
    account_id        UUID NULL REFERENCES accounts (id) ON DELETE SET NULL,
    device_id         UUID NULL REFERENCES devices (id) ON DELETE SET NULL,
    ip_hash           TEXT NULL,
    user_agent_family TEXT NULL,
    request_id        TEXT NULL,
    CONSTRAINT access_log_event_valid CHECK (event IN (
        'login_success', 'login_failure', 'login_blocked', 'token_refresh',
        'token_reuse_detected', 'logout', 'logout_all', 'password_changed',
        'register', 'email_code_sent', 'email_verified', 'password_reset_requested', 'password_reset_completed'
    )),
    CONSTRAINT access_log_ip_len CHECK (ip_hash IS NULL OR length(ip_hash) = 64),
    CONSTRAINT access_log_ua_len CHECK (user_agent_family IS NULL OR length(user_agent_family) <= 40)
);

-- "Atividade desta conta, mais recente primeiro" (suporte/fraude).
CREATE INDEX IF NOT EXISTS access_log_account_idx
    ON access_log (account_id, occurred_at DESC) WHERE account_id IS NOT NULL;
-- Retenção: apagar por data.
CREATE INDEX IF NOT EXISTS access_log_occurred_idx ON access_log (occurred_at);
