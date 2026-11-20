-- Token CSRF por sessão de admin — defesa exigida antes da primeira
-- mutação real do painel (achado do Órion em
-- `.claude/agent-memory/orion/project_admin_v0_seguranca.md` item 5):
-- `SameSite=Lax` protege contra CSRF cross-SITE genuíno, mas painel e API
-- são subdomínios do MESMO site registrável (`vuumbora.com.br`), então o
-- cookie de sessão viaja em requisição disparada por QUALQUER subdomínio
-- irmão — inclusive um comprometido por XSS, que o Lax não distingue de
-- tráfego legítimo do painel.
--
-- Padrão escolhido: token sincronizador por sessão (não é o "double-submit
-- cookie" clássico). Justificativa no código, não só aqui: ver
-- `services/admin-auth-service.ts` e `hooks/require-admin.ts`.
--
-- Guardado em TEXTO, não hash (diferente de `token_hash` desta mesma
-- tabela): o valor sozinho não autentica nada — sem o cookie de sessão
-- httpOnly (que este token NUNCA substitui, só acompanha), ele não abre
-- porta nenhuma. Ler o banco não é o ataque que este token evita.
--
-- Sem backfill, mesmo padrão do projeto: sessão criada ANTES desta
-- migração fica com `csrf_token` NULL e `requireCsrfToken` sempre recusa
-- NULL — admin com sessão aberta antes do deploy precisa logar de novo
-- para mutar algo. Consequência aceita, não é bug.

ALTER TABLE admin_sessions
    ADD COLUMN IF NOT EXISTS csrf_token text NULL;
