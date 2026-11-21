-- Privilégio MÍNIMO do papel de runtime da API (`vuumbora_api`). Revisão de
-- segurança S1, rodada 2, achado I-3.
--
-- A 0012 deu SELECT/INSERT/UPDATE/DELETE em TODAS as tabelas ao papel da API e
-- só tirou o que era trilha de auditoria. Resultado: quem conseguisse SQL com a
-- credencial da API (SQL injection, dependência comprometida, vazamento do
-- ambiente do contêiner) fazia `INSERT INTO admin_users` com hash próprio e papel
-- `dono`, ou `INSERT INTO admin_enrollment_tokens` com um token que ele conhece:
-- criava um dono com o 2FA dele. Aqui cada tabela fica só com o que o CÓDIGO da
-- API de fato escreve.
--
-- O que a API escreve (levantado nos repositórios, nos serviços e nas funções SQL
-- das migrações — todas SECURITY INVOKER, então valem os privilégios de quem chama):
--
--   tabela                    a API faz                       tirado agora
--   ------------------------  ------------------------------  ----------------------
--   admin_users               SELECT                          INSERT, UPDATE, DELETE
--   admin_enrollment_tokens   SELECT, UPDATE (consome)        INSERT, DELETE
--   admin_login_challenges    INSERT, DELETE                  UPDATE
--   admin_login_failures      INSERT, DELETE                  UPDATE
--   admin_sessions            INSERT, UPDATE, DELETE          -
--   admin_totp                INSERT, UPDATE, DELETE          -
--   admin_recovery_codes      INSERT, UPDATE, DELETE          -
--   admin_audit_log           INSERT (0012: sem UPDATE/DELETE) -
--   accounts                  INSERT, UPDATE                  DELETE
--   account_credentials       INSERT, UPDATE                  DELETE
--   account_email_codes       INSERT, UPDATE (funções 0014)   DELETE
--   devices                   INSERT, UPDATE                  DELETE
--   refresh_token_families    INSERT, UPDATE                  DELETE
--   refresh_tokens            INSERT, UPDATE                  DELETE
--   login_attempts            INSERT                          UPDATE, DELETE
--   access_log                INSERT (0012)                   -
--   driver_applications       INSERT, UPDATE (decisão)        DELETE
--   waitlist_signups          INSERT                          UPDATE, DELETE
--   email_settings            INSERT, UPDATE (upsert)         DELETE
--   schema_migrations         nada (0012)                     -
--
-- Quem passa a escrever o que a API não escreve mais (todos com a credencial
-- DONA, em tarefa/terminal de operador, nunca no contêiner da API):
--   * criar dono/administrador e emitir token de ativação do 2FA:
--     `npm run create-admin`, `npm run reissue-2fa-enrollment`;
--   * apagar lista de espera e candidatura (LGPD): scripts `*:delete`;
--   * retenção (apagar tentativas, trilha, sessões, códigos e contas não
--     verificadas vencidas): `npm run identity:retention`.
--
-- Esta migração NUNCA derruba o boot: sem permissão para ajustar grants (a
-- credencial que migra não é dona das tabelas) ou sem o papel, avisa (NOTICE) e
-- segue; os triggers da 0012 continuam valendo.
--
-- Tabela nova de migração futura: o padrão de grants da 0012 (DML completo)
-- continua valendo para ela; a migração que a criar deve fazer o próprio REVOKE
-- do que a API não precisa e acrescentá-la à matriz de test/runtime-role.test.ts
-- (o teste falha enquanto houver tabela fora da matriz).
--
-- Reversão: docs/sql/rollback/0017_down.sql

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vuumbora_api') THEN
        RAISE NOTICE '[0017] o papel vuumbora_api não existe; nada a restringir.';
        RETURN;
    END IF;

    BEGIN
        -- Contas e credenciais de ADMINISTRADOR: a API só lê.
        REVOKE INSERT, UPDATE, DELETE ON admin_users FROM vuumbora_api;
        -- Token de ativação do 2FA: a API só consulta e consome (UPDATE used_at); emitir é com o operador.
        REVOKE INSERT, DELETE ON admin_enrollment_tokens FROM vuumbora_api;
        REVOKE UPDATE ON admin_login_challenges FROM vuumbora_api;
        REVOKE UPDATE ON admin_login_failures FROM vuumbora_api;

        -- Identidade dos apps: ninguém é apagado pela API (exclusão é anonimização; retenção é do operador).
        REVOKE DELETE ON accounts FROM vuumbora_api;
        REVOKE DELETE ON account_credentials FROM vuumbora_api;
        REVOKE DELETE ON account_email_codes FROM vuumbora_api;
        REVOKE DELETE ON devices FROM vuumbora_api;
        REVOKE DELETE ON refresh_token_families FROM vuumbora_api;
        REVOKE DELETE ON refresh_tokens FROM vuumbora_api;
        -- Contador de tentativas: só se acrescenta (a janela é calculada na leitura; quem apaga é a retenção).
        REVOKE UPDATE, DELETE ON login_attempts FROM vuumbora_api;

        -- Formulários públicos: a API insere; exportar/apagar é com o operador (LGPD).
        REVOKE UPDATE, DELETE ON waitlist_signups FROM vuumbora_api;
        REVOKE DELETE ON driver_applications FROM vuumbora_api;
        REVOKE DELETE ON email_settings FROM vuumbora_api;
    EXCEPTION
        WHEN insufficient_privilege THEN
            RAISE NOTICE '[0017] sem permissão para ajustar grants (a credencial não é dona das tabelas); privilégio mínimo NÃO aplicado.';
    END;
END;
$$;
