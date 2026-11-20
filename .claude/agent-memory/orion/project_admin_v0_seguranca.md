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

**Rodada 2 (2026-11-20, mesma data): RESOLVIDOS e reconfirmados sem
regressão** — RBAC por papel (`requireAdminRole`, 5 papéis definitivos
`dono|operacao|revisor_documentos|financeiro|suporte`, migração 0006 com
CHECK constraint e preservação de dado, `create-admin.mjs` validando a
mesma lista); PII de querystring no log (serializer corta a partir de `?`
em `app.ts`); teto absoluto de sessão (`absolute_expires_at`, migração
0007, nunca avançado por `touchAdminSession`, exigido junto com `expires_at`
na query de sessão ativa); guarda de build (`apps/admin/vite.config.ts`
aborta `vite build` em modo mock). Nota de correção: o nome do domínio do
painel oscilou entre rodadas — o nome CORRETO e definitivo (decisão do
dono, `docs/decisoes-do-dono.md` §7, 2026-11-20) é **`admin.vuumbora.com.br`**;
`painel.vuumbora.com.br` é o painel do PRÓPRIO Easypanel, coisa diferente.
Não confundir de novo.

**Rodada 3 (2026-11-20, mutação real: aprovar/recusar candidatura) —
achado novo, IMPORTANTE, ainda sem correção quando esta nota foi escrita:**

**CSRF — token sincronizador (`csrfToken`) tem gap real pela borda que
`ALLOWED_ORIGINS` precisa manter aberta.** Desenho: token aleatório de 32
bytes por sessão (`admin-auth-service.ts::loginAdmin`), nunca em cookie, só
no CORPO de `POST /v1/admin/auth/login` e `GET /v1/admin/me`
(`admin-auth-route.ts:83,114`), conferido em tempo constante
(`hooks/require-admin.ts::requireCsrfToken`, `timingSafeEqual`). A premissa
documentada no código ("origem fora de `ALLOWED_ORIGINS` nunca recebe o
token") é verdadeira, MAS `ALLOWED_ORIGINS` precisa conter
`www.vuumbora.com.br` (site público, formulário de candidatura/lista de
espera) pelo MESMO motivo que precisa conter `admin.vuumbora.com.br` — e o
CORS é registrado uma vez só, globalmente, em `app.ts:58-71`, com
`credentials: true` para TODA origem da lista, em TODA rota (não há
segregação entre rotas públicas e `/v1/admin/*`). Cookie de sessão do admin
é host-only pra `api.vuumbora.com.br`, mas `SameSite=Lax` não bloqueia o
envio porque `www.vuumbora.com.br` e `api.vuumbora.com.br` são o MESMO SITE
(mesmo domínio registrável) — exatamente o cenário que o próprio comentário
do código em `hooks/require-admin.ts:85-103` descreve como ameaça
("subdomínio-irmão comprometido, inclusive por XSS"), só que o subdomínio
mais exposto a XSS de todos (site público, formulário de terceiro,
dependências de marketing) é precisamente o que TEM que ficar na lista.
Caminho de ataque: XSS em `www.vuumbora.com.br` → `fetch('.../v1/admin/me',
{credentials:'include'})` → cookie vai sozinho (same-site) → CORS reflete
`www.vuumbora.com.br` com `Access-Control-Allow-Credentials: true` → JS lê
`data.csrfToken` do corpo → CSRF completo contra `/approve`/`/reject`.
Pré-requisito (XSS no site público) impede classificar como crítico
isolado, mas a defesa inteira depende de uma premissa que já nasce falsa
num ponto concreto — não é teórico. Correção sugerida (não escrevi código,
é auditoria): `@fastify/cors` com `credentials:true` só no contexto
encapsulado de `/v1/admin/*` e lista de origem restrita a
`admin.vuumbora.com.br`; rotas públicas sem `credentials` (não usam
cookie), lista própria com `www.vuumbora.com.br`/`vuumbora.com.br`.

**Confirmado funcionando sem problema (rodada 3):** autorização das rotas
de mutação (`requireAdminRole('dono','operacao')` seguido de
`requireCsrfToken`, nesta ordem, `admin-driver-application-route.ts:52-56`);
idempotência+concorrência resolvidas numa UPDATE atômica só
(`WHERE id = $1 AND status = 'pending'`,
`admin-driver-application-repository.ts:208-217` — sem SELECT FOR UPDATE
separado, o WHERE faz o papel do lock); toda decisão grava em
`admin_audit_log` com `before`/`after`/motivo (`admin-driver-application-
service.ts:153-162`), nunca duplicado em replay; motivo de recusa (texto
de uma pessoa) só vai para `admin_audit_log`/`driver_applications.decision_
reason` (ambas access-controlled) — varrido todo `request.log`/`console.*`
do serviço, nenhum log de aplicação grava o texto do motivo.

**Pendências que seguem abertas (reavaliadas em peso na rodada 3, agora
que existe mutação real com efeito na vida de alguém):**

1. **`admin_audit_log` adulterável em nível de banco** — mesma
   `DATABASE_URL`/role pra migração e runtime, sem `REVOKE UPDATE, DELETE`
   numa role de aplicação separada. PESO SUBIU: antes protegia só trilha
   de LEITURA; agora é o único registro de quem aprovou/recusou uma pessoa
   real, e appendonly-por-código não resiste a uma credencial vazada ou bug
   de injeção futuro. Resolver antes do próximo deploy real (é
   infra/DevOps — Vulcano/Cronos, não rota de API).
2. **Sem 2FA** — e-mail+senha só, papéis `dono`/`operacao` já conseguem
   decidir vida real de candidato. PESO SUBIU: antes o risco de conta
   comprometida era "ver dado"; agora é "ver E DECIDIR". Vira requisito
   para liberar a mutação em produção, não só para "antes de abrir
   financeiro".
3. **CSRF**: item novo acima SUBSTITUI a pendência antiga "resíduo de
   SameSite=Lax" — a lacuna concreta agora tem nome (origem pública
   necessariamente na lista de CORS com credentials).

Ver também [[fonte-vem-do-dono]] e [[vuumbora-contexto]] (memórias de
outros agentes) para contexto geral do produto.
