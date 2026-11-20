---
name: project-admin-v0-aprovar-recusar
description: Backend da primeira mutação real do painel admin (apps/api) — aprovar/recusar candidatura de motorista, CSRF, idempotência e concorrência. Contrato real para Lyra/Íris/Órion.
metadata:
  type: project
---

Implementado em 20/11/2026, `apps/api`. Primeira rota `/v1/admin/*` que
MUDA ESTADO (até aqui só login/logout e leitura — ver [[project-admin-v0]]).

## Rotas novas

- `POST /v1/admin/driver-applications/:id/approve` — sem corpo.
- `POST /v1/admin/driver-applications/:id/reject` — corpo `{ reason }`,
  obrigatório, mínimo 10 caracteres, máx 1000.
- Ambas exigem: `requireAdminRole('dono', 'operacao')`, header
  `Idempotency-Key` (qualquer string 1-200 chars), header `X-CSRF-Token`
  (ver seção CSRF abaixo).
- Resposta de sucesso (200): `{ id, status, decidedAt, decidedBy:{id,name} }`
  — `decisionReason` só aparece na recusa (campo OMITIDO, nunca `null`, na
  aprovação — contrato combinado com `apps/admin/src/api/types.ts`,
  `DriverApplicationDecision.decisionReason?: string`).
- `404 not_found` se o id não existe. `409 invalid_transition` (com
  `error.reason: 'invalid_transition'`, não só `code` — o cliente admin lê
  `error.reason` para `ApiError.kind === 'conflict'`) se a candidatura já
  não está `pending`.
- Lista e detalhe (`GET /v1/admin/driver-applications[/:id]`) agora também
  devolvem `decidedAt`, `decidedBy`, `decisionReason` (os três `null`
  enquanto `pending`).

## Migrações

- `0008_add_driver_application_decision.sql` — `driver_applications` ganha
  `decided_by` (FK `admin_users`), `decided_at`, `decision_reason`,
  `decision_idempotency_key`. `ADD COLUMN IF NOT EXISTS ... NULL`, sem
  backfill — mesmo padrão do projeto.
- `0009_add_admin_session_csrf_token.sql` — `admin_sessions.csrf_token`
  (TEXTO, não hash — ver por quê na seção CSRF). Sessão criada antes desta
  migração fica com `NULL` e `requireCsrfToken` recusa sempre — força
  relogin, documentado como consequência aceita, não bug.

## Concorrência e idempotência — mesma query resolve as duas

`UPDATE driver_applications SET status=$2, ... WHERE id=$1 AND
status='pending' RETURNING ...` (`repositories/admin-driver-application-repository.ts`,
`updateDriverApplicationStatus`) é a defesa real: duas requisições
simultâneas na MESMA linha só deixam uma mudar o estado (provado com dois
`curl` em paralelo na mesma máquina — um `approved`, o outro `409`, sem
`SELECT FOR UPDATE` nenhum, só o `WHERE`).

`decision_idempotency_key` (coluna por LINHA, não uma tabela genérica de
idempotência) é só para RESPONDER DE NOVO a um retry com a MESMA chave: se
`UPDATE` não afeta nenhuma linha, o serviço
(`services/admin-driver-application-service.ts::decideDriverApplication`)
relê o estado — se `status === action` E a chave bate, devolve o MESMO 200
de sucesso (sem reauditar); senão, 409. Provado: a mesma `Idempotency-Key`
repetida devolve `decidedAt` IDÊNTICO ao da primeira chamada, e
`admin_audit_log` tem só UMA linha para aquela decisão mesmo chamando duas
vezes.

**Escopo deliberadamente limitado:** a chave de idempotência é por
RECURSO (uma coluna em `driver_applications`), não um registro global —
reusar a mesma chave em dois ids diferentes não é detectado como conflito.
Suficiente para esta fatia (só duas rotas, cada uma decide UM recurso);
se nascer uma terceira mutação que precise de idempotência cross-recurso,
avaliar uma tabela dedicada ali.

## CSRF — por que NÃO é o "double-submit cookie" clássico

Órion pediu defesa de CSRF antes da primeira mutação real
([[project-admin-v0-seguranca]] item 5): painel e API são subdomínios do
MESMO site registrável (`vuumbora.com.br`), então `SameSite=Lax` no
cookie de sessão NÃO bloqueia um subdomínio-irmão comprometido (XSS numa
área menos crítica do site) — é tráfego "same-site", Lax só restringe
cross-SITE.

**Lyra já tinha escrito um placeholder** (`apps/admin/src/api/csrf.ts`)
assumindo double-submit cookie clássico (cookie `vuumbora_admin_csrf`
legível por JS, ecoado em header) e marcou "PENDÊNCIA A CONFIRMAR COM A
VEGA". **Esse padrão não funciona aqui**: para o JS do painel
(`admin.vuumbora.com.br`) ler o cookie via `document.cookie`, ele precisa
de `Domain=.vuumbora.com.br` — mas um `Domain` tão amplo também deixa o
subdomínio-irmão comprometido ler o MESMO cookie, destruindo exatamente a
defesa que se queria construir.

**Escolhido: token sincronizador por SESSÃO**, nunca em cookie:
- Gerado em `admin-auth-service.ts::loginAdmin` (random 32 bytes), guardado
  em TEXTO (não hash — sozinho não autentica nada sem o cookie de sessão
  httpOnly) em `admin_sessions.csrf_token`.
- Sai só no CORPO de `POST /v1/admin/auth/login` e `GET /v1/admin/me`
  (`data.csrfToken`) — nunca em `Set-Cookie`.
- Cliente guarda em memória, reenvia em `X-CSRF-Token` em toda mutação.
- Por que isso defende do subdomínio-irmão: ler um corpo de resposta
  cross-origin exige CORS explícito (`ALLOWED_ORIGINS` em `app.ts`,
  reflexão de origem exata + `credentials:true`, nunca `*`). Um
  subdomínio fora da lista nunca recebe o token no corpo — só consegue
  disparar a requisição mutante (o navegador manda o cookie de sessão
  sozinho), mas não sabe que valor pôr em `X-CSRF-Token`.
- `requireCsrfToken` (`hooks/require-admin.ts`) compara em tempo constante
  (`timingSafeEqual`, só quando os tamanhos batem) — preHandler SEMPRE
  depois de `requireAdminRole` na lista (`requireMutationAccess` em
  `admin-driver-application-route.ts`), porque depende de
  `request.adminCsrfToken` preenchido por ele.
- CORS (`app.ts`) precisou de `allowedHeaders` explícito
  (`X-CSRF-Token`, `Idempotency-Key`, `Content-Type`) — o default do
  `@fastify/cors` reflete de volta o que o preflight pedir, então não
  quebraria sem isso, mas deixei explícito de propósito (documenta a
  intenção, evita alguém "arrumar" isso depois pensando que é um buraco).

**Correção aplicada (achado do Órion, "Rodada 3"): CORS segregado por
contexto.** A primeira versão registrava `@fastify/cors` UMA VEZ,
globalmente, com a mesma `ALLOWED_ORIGINS` e `credentials:true` para TODA
rota — inclusive as públicas. Como o site (`www.vuumbora.com.br`) PRECISA
estar numa lista de CORS por motivo legítimo (`/v1/waitlist`,
`/v1/driver-applications`), um XSS nele ganhava `credentials:true` de
brinde: `fetch('/v1/admin/me', {credentials:'include'})` → cookie de
sessão do admin viaja sozinho (same-site, `SameSite=Lax` não bloqueia) →
CORS refletia a origem do site COM credenciais → atacante lê
`data.csrfToken` do corpo → CSRF completo mesmo com o token sincronizador.

Corrigido em `app.ts`: dois registros SEPARADOS de `@fastify/cors`, cada
um dentro do seu `app.register(async (instance) => {...})` (contexto
encapsulado):
- Público (`/healthz`, `/v1/waitlist`, `/v1/driver-applications`):
  `origin: env.ALLOWED_ORIGINS`, `credentials: false` SEMPRE — nunca usa
  cookie, não importa quem esteja na lista.
- Admin (`/v1/admin/*`, agora com `{ prefix: '/v1/admin' }` no
  `register`): `origin: env.ADMIN_ALLOWED_ORIGINS` (variável NOVA,
  separada — NUNCA deve conter o domínio do site), `credentials: true`.

**Pegadinha real encontrada rodando (não aparece no typecheck):**
`@fastify/cors` é `fastify-plugin` e registra sozinho uma rota
`OPTIONS *` para responder preflight. Sem o `prefix: '/v1/admin'` no
`register` do contexto admin, as DUAS chamadas a
`instance.register(cors, ...)` tentam criar a MESMA rota `OPTIONS *` e o
Fastify recusa o boot inteiro (`FST_ERR_DUPLICATED_ROUTE`). Com o prefixo,
a rota de preflight do admin vira `OPTIONS /v1/admin/*` — diferente da
pública. Por isso as rotas de `admin-auth-route.ts` e
`admin-driver-application-route.ts` passaram a usar caminhos RELATIVOS
(`/auth/login`, `/me`, `/driver-applications/:id/approve` etc.) em vez do
`/v1/admin/...` por extenso — o prefixo é aplicado uma vez só, em
`app.ts`.

**Como provar isolamento de CORS (sem navegador, só olhando os headers):**
`curl -i` com `Origin` de quem NÃO devia receber: resposta não tem
`access-control-allow-origin` nenhum (mesmo que `access-control-allow-credentials:
true` apareça sozinho — o `@fastify/cors` manda esse header sempre que
`credentials:true` está configurado, INDEPENDENTE do origin bater; o que
importa é que SEM `Allow-Origin` casando, o navegador bloqueia o JS de
ler o corpo da resposta — confirmado lendo `node_modules/@fastify/cors/index.js`,
função `addCorsHeaders`). Provado: origem do site (`localhost:3101`) em
`GET /v1/admin/me` não recebe `access-control-allow-origin`; a mesma
origem em `/v1/waitlist` recebe `allow-origin` SEM `allow-credentials`
(`credentials:false` ali); origem do painel (`localhost:4310`) em
`/v1/admin/auth/login` recebe os dois headers certos.

**Env nova, obrigatória:** `ADMIN_ALLOWED_ORIGINS` (separada de
`ALLOWED_ORIGINS`) — `.env.example` atualizado. Produção (Vulcano) precisa
setar `ADMIN_ALLOWED_ORIGINS=https://admin.vuumbora.com.br` no Easypanel
e TIRAR esse domínio de `ALLOWED_ORIGINS` se estiver lá hoje.

**Pendência real para Lyra:** reescrever `apps/admin/src/api/csrf.ts`
(parar de ler cookie) e `client.ts` (guardar `csrfToken` em memória a
partir do retorno de login/`GET /v1/admin/me`, reenviar em
`X-CSRF-Token`). O resto do que ela já escreveu (`DriverApplicationPort`,
tipos em `types.ts`, `idempotency.ts`, `permissions.ts`,
`ApproveDialog`/`RejectDialog`) já bate com o contrato real — só o
mecanismo de transporte do token CSRF mudou.

## Como provar de novo (sem Docker nesta máquina)

Ver a memória da Íris `project-admin-v0-ambiente-de-teste` (cluster Postgres
descartável com os binários de `C:/Program Files/PostgreSQL/18/bin`,
`initdb`/`pg_ctl -o "-p 5434"`/`createdb`) — mesma receita que usei aqui,
num cluster novo no scratchpad da sessão (o antigo já tinha sido limpo).
Fluxo completo testado com `curl`/`node fetch` contra Postgres real: aprovar,
recusar com/sem motivo, replay de Idempotency-Key, chave diferente em
recurso já decidido (409), aprovar algo já recusado (409), 404, papel sem
permissão (403, bloqueia ANTES do CSRF), sem CSRF (403), CSRF errado (403),
sem Idempotency-Key (400), duas requisições concorrentes na mesma linha
(uma vence, outra 409), sessão sem `csrf_token` (simulada, 403).
