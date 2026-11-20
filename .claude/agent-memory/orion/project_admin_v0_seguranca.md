---
name: project-admin-v0-seguranca
description: Estado da auditoria de segurança do Admin v0 (2026-11-20) — o que já está correto e quais pendências ficaram abertas para a próxima fatia (documentos/financeiro/mutação)
metadata:
  type: project
---

Auditoria feita em 2026-11-20 sobre a primeira superfície autenticada do
VuumBora (`/v1/admin/*` — login, sessão, leitura de candidaturas de
motorista). Nenhum CRÍTICO encontrado. Controles bem feitos e já
verificados (não precisa reauditar do zero numa próxima passada, só
confirmar que não regrediram):

- Mensagem de login genérica + `DUMMY_PASSWORD_HASH` para custo de bcrypt
  constante (mitiga timing attack de enumeração de e-mail) —
  `admin-auth-service.ts`.
- bcryptjs custo 12, nunca senha em texto puro, `create-admin.mjs` exige
  12+ caracteres e não ecoa senha no terminal.
- Cookie de sessão httpOnly, `secure` condicionado a `NODE_ENV=production`
  (não é bug, é de propósito para dev http), `sameSite: lax`. Token
  opaco aleatório; banco guarda só o hash SHA-256 (não dá pra forjar
  sessão a partir da linha).
- Logout revoga no servidor (DELETE em `admin_sessions`), não só apaga
  cookie do client. Expiração deslizante implementada corretamente.
- Nenhuma SQL injection nas camadas admin — tudo parametrizado, inclusive
  ILIKE e o cursor de paginação.
- `admin_audit_log` é append-only no CÓDIGO (repositório só expõe INSERT,
  nenhuma rota HTTP expõe update/delete). Auditoria de listagem grava só
  filtro+contagem, nunca a lista de PII (boa minimização).
- Erro handler genérico nunca ecoa `err.message` do Fastify pro cliente.

**Pendências confirmadas (abertas, para entrar no board antes da próxima
fatia que mexe em documento/financeiro/mutação):**

1. **Sem RBAC por papel** — `requireAdmin` (`hooks/require-admin.ts`) só
   valida sessão, nunca `request.admin.role`. O plano
   (`docs/plano-sistema.md:208`) já prevê granularidade por área
   (documentos, financeiro, auditoria com papel próprio) mas não existe
   NENHUM middleware de papel construído ainda. Risco real: a primeira
   rota de documento sensível que copiar o padrão `preHandler:
   requireAdmin` fica acessível a qualquer um dos três papéis
   (`support`/`finance`/`superadmin`). Construir `requireAdminRole(...)`
   ANTES dessa próxima rota, não depois.
2. **`admin_audit_log` adulterável em nível de banco** — confirmado pelo
   próprio comentário da migração 0004: hoje só existe uma role/conexão
   Postgres (mesma `DATABASE_URL` para migração e runtime), sem
   `REVOKE UPDATE, DELETE` para uma role de aplicação separada. Append-only
   é hoje uma disciplina de CÓDIGO, não uma garantia de BANCO — vazamento
   de credencial ou bug futuro de injeção poderia alterar a trilha sem
   deixar rastro. Resolver antes de a auditoria carregar peso real de
   accountability (aprovação/rejeição, financeiro).
3. **Sem 2FA** — `docs/plano-sistema-arquitetura.md:196` já diz que o
   domínio do admin fica "atrás de login com segundo fator obrigatório";
   Admin v0 é só e-mail+senha. Aceitável para esta fatia (só leitura),
   mas entra como requisito antes de abrir documento/financeiro.
4. **Sessão sem teto absoluto** — TTL deslizante (`ADMIN_SESSION_TTL_HOURS`)
   nunca expira enquanto a sessão for usada. Um cookie vazado e usado
   esporadicamente nunca força reautenticação.
5. **CORS/SameSite=Lax**: correto para o domínio real de produção — painel
   e API são subdomínios do MESMO domínio registrável (`vuumbora.com.br`),
   então é tráfego same-site, e Lax protege contra CSRF cross-site
   genuíno (cookie não viaja em POST cross-site). Resíduo: Lax não protege
   contra um subdomínio-irmão comprometido (same-site não é restringido
   por Lax) — hoje sem impacto prático (só login/logout mutam estado), mas
   antes de aprovar/rejeitar virar mutação real, vale token CSRF de defesa
   em profundidade. Also achei inconsistência de nome de domínio do
   painel entre docs (`admin.vuumbora.com.br` vs `painel.vuumbora.com.br`)
   — checar `ALLOWED_ORIGINS` real em produção usa o domínio certo.
6. Fastify loga `url` (com query string) por padrão em toda requisição —
   o parâmetro de busca livre `q` em `/v1/admin/driver-applications` pode
   carregar PII de candidato digitada pelo admin, e isso vai pro log de
   aplicação (fora do controle de acesso que protege `admin_audit_log`).

Ver também [[fonte-vem-do-dono]] e [[vuumbora-contexto]] (memórias de
outros agentes) para contexto geral do produto.
