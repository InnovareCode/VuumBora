-- Papéis definitivos de `admin_users`, aprovados pelo dono em 20/11/2026
-- (docs/decisoes-do-dono.md → "Proposta de papéis"). Substitui o conjunto
-- provisório da migração 0003 (`support`/`finance`/`superadmin`) — não há
-- admin em produção ainda, então não existe dado real para perder, mas o
-- UPDATE abaixo cobre qualquer admin de ambiente de teste/dev criado antes
-- desta migração.
--
-- Mapeamento: superadmin -> dono · finance -> financeiro · support -> suporte.
-- `revisor_documentos` e `operacao` são papéis novos, sem equivalente
-- anterior — ninguém migra para eles automaticamente.

ALTER TABLE admin_users
    DROP CONSTRAINT IF EXISTS admin_users_role_check;

UPDATE admin_users
SET role = CASE role
    WHEN 'superadmin' THEN 'dono'
    WHEN 'finance' THEN 'financeiro'
    WHEN 'support' THEN 'suporte'
    ELSE role
END
WHERE role IN ('superadmin', 'finance', 'support');

ALTER TABLE admin_users
    ALTER COLUMN role SET DEFAULT 'suporte';

ALTER TABLE admin_users
    ADD CONSTRAINT admin_users_role_check
        CHECK (role IN ('dono', 'operacao', 'revisor_documentos', 'financeiro', 'suporte'));
