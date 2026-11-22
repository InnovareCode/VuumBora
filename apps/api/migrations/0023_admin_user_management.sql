-- Gestão de usuários do painel (F07, docs/decisoes-do-dono.md -> "Papéis do
-- painel administrativo"): só o papel `dono` lista, cria, desativa, reativa
-- e troca o papel de outro admin, pela API HTTP.
--
-- ISTO REABRE, DE PROPÓSITO E DE FORMA NARROW, uma porta que a migração 0017
-- tinha fechado por completo ("Contas e credenciais de ADMINISTRADOR: a API
-- só lê"). Na época, nada no código da API escrevia `admin_users`/
-- `admin_enrollment_tokens` — toda criação de admin era CLI, com a
-- credencial dona (`create-admin.mjs`/`reissue-2fa-enrollment.mjs`). O F07
-- muda essa premissa: o dono pediu uma tela no painel para isto, então o
-- CÓDIGO da API agora de fato precisa escrever essas duas tabelas (mesma
-- régua da 0017: "cada tabela fica só com o que o código da API escreve").
--
-- O que passa a ser permitido, e só isto:
--   admin_users:              + INSERT, UPDATE (nunca DELETE — ninguém é
--                             apagado, só desativado; `deactivated_at`)
--   admin_enrollment_tokens:  + INSERT, DELETE (emitir token de ativação do
--                             primeiro acesso e o de 2FA obrigatório, e
--                             invalidar o anterior ao reemitir — mesma regra
--                             de `insertEnrollmentToken`, já usada pelos
--                             scripts)
--
-- Compensação (porque o risco que a 0017 descreveu continua real: quem
-- conseguisse SQL livre com esta credencial poderia forjar um dono): a
-- ÚNICA rota que grava nestas tabelas é `/v1/admin/users/*`, atrás de
-- `requireAdminRole('dono')` + CSRF + REAUTENTICAÇÃO POR SENHA na própria
-- requisição (mesmo padrão M-3 já usado em `/2fa/disable` e
-- `/settings/email`), nunca derruba o último `dono` ativo (lock sobre as
-- linhas `role='dono' AND deactivated_at IS NULL`), e toda escrita grava em
-- `admin_audit_log` (append-only, fora do alcance desta credencial desde a
-- 0012). `test/runtime-role.test.ts` tem a matriz atualizada; a prova de
-- que DELETE em `admin_users` continua recusado está lá.
--
-- Revisado pelo Órion (S1 rodada 3g, docs/privado/revisao-seguranca-s1-rodada3g.md): classificação PARCIAL.
-- As compensações acima (papel dono + CSRF + senha + trava do último dono + auditoria) protegem bem contra
-- sessão/cookie roubado e CSRF; NENHUMA delas reabre a proteção original contra SQL livre com esta credencial
-- (injeção, dependência comprometida, ambiente vazado) — isso exigiria reescrever a regra em PL/pgSQL, o que o
-- Órion NÃO recomendou agora (nenhuma rodada até hoje achou SQL injetável). Em vez disso, ele recomendou — e o
-- Atlas decidiu fazer, na mesma fatia que corrigiu esta revisão — senha E TOTP (reuso do `verifyStepUp` de
-- `/settings/email`) nas três mutações mais perigosas: criar ou promover para `dono`/`financeiro`, e reativar
-- um `dono` (`admin-user-service.ts::gateForRole`). As outras mutações (desativar, criar/promover papel normal,
-- rebaixar um dono) continuam só com senha — degrau proporcional ao risco, não um step-up genérico em tudo.
--
-- Esta migração nunca derruba o boot: sem permissão para ajustar grants
-- (a credencial que migra não é dona das tabelas) ou sem o papel, avisa
-- (NOTICE) e segue — mesma rede de segurança da 0012/0017.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vuumbora_api') THEN
        RAISE NOTICE '[0023] o papel vuumbora_api não existe; nada a conceder.';
        RETURN;
    END IF;

    BEGIN
        GRANT INSERT, UPDATE ON admin_users TO vuumbora_api;
        GRANT INSERT, DELETE ON admin_enrollment_tokens TO vuumbora_api;
    EXCEPTION
        WHEN insufficient_privilege THEN
            RAISE NOTICE '[0023] sem permissão para ajustar grants (a credencial não é dona das tabelas); privilégio NÃO concedido.';
    END;
END;
$$;
