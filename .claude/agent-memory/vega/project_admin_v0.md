---
name: project-admin-v0
description: Backend do Admin v0 (apps/api) — login por cookie httpOnly, leitura de candidaturas, autorização por papel (requireAdminRole), teto absoluto de sessão e correção de PII em log. Schema, contrato e decisões.
metadata:
  type: project
---

Implementado em 20/11/2026, `apps/api`. Fatia explicitamente SEM
aprovar/recusar — só autenticação de admin e consulta de
`driver_applications`.

## Migrações novas

- `0003_create_admin_users.sql` — `admin_users` (id, name, email, password_hash
  bcrypt custo 12, role `support|finance|superadmin`, created_at,
  deactivated_at). Sem auto-cadastro: a única forma de nascer um admin é
  `apps/api/scripts/create-admin.mjs` (nunca endpoint HTTP).
- `0004_create_admin_audit_log.sql` — `admin_audit_log` (admin_id, action,
  target_type, target_id sem FK — polimórfico, before/after JSONB,
  ip_address, created_at). Ambas seguem exatamente
  `docs/plano-sistema-dados.md` §2.
- `0005_create_admin_sessions.sql` — **NÃO estava no plano original**
  (que só previa `admin_users`/`admin_audit_log`). Acréscimo necessário
  porque sessão por cookie httpOnly precisa de algo revogável no servidor
  — sem tabela própria, logout só apagaria o cookie do navegador e uma
  sessão roubada continuaria válida até expirar. Guarda só o SHA-256 do
  token (nunca o valor bruto). Expiração deslizante (`expires_at` avançado
  a cada requisição autenticada, em
  `services/admin-auth-service.ts::resolveAdminSession`). Avisar
  Nova/Cronos se isso precisar entrar no plano formal.

## Decisões técnicas

- **bcryptjs (puro JS), não `argon2`/`bcrypt` nativo** — evita compilação
  nativa (node-gyp) em ambiente Windows sem toolchain garantido. Custo 12.
  Satisfaz o requisito ("argon2id ou bcrypt") pelo lado bcrypt.
- **Timing-safe contra enumeração de e-mail**: login SEMPRE roda
  `bcrypt.compare` (contra o hash real OU contra um `DUMMY_PASSWORD_HASH`
  gerado uma vez no boot) antes de decidir — nunca responde mais rápido só
  porque o e-mail não existe. E-mail inexistente, senha errada e admin
  desativado devolvem exatamente a mesma resposta (`401
  invalid_credentials`, "E-mail ou senha incorretos.").
- **Rate limit do login**: mesmo padrão em memória por IP já usado em
  `/v1/waitlist`/`/v1/driver-applications` (`@fastify/rate-limit`,
  `config.rateLimit` por rota) — não é tabela de tentativas no banco, de
  propósito (mesma decisão documentada em
  [[project-lista-de-espera]]: nunca persistir IP). Default
  `ADMIN_LOGIN_RATE_LIMIT_MAX=5` / `_WINDOW_MINUTES=15`.
- **Cookie de sessão**: `vb_admin_session`, httpOnly, `secure` só em
  produção (`NODE_ENV==='production'`), `sameSite:'lax'`. Sem assinatura/
  segredo no `@fastify/cookie` — o valor é um token aleatório opaco
  (32 bytes), e quem autentica de verdade é o hash comparado contra
  `admin_sessions` no banco; cookie adulterado só não acha sessão, não
  precisa de HMAC para isso.
- **CORS com `credentials: true`** (`src/app.ts`) — obrigatório para o
  cookie ir/voltar entre o painel admin e esta API, mesmo que fiquem em
  subdomínios diferentes (same-site, cross-origin: `sameSite:'lax'` ainda
  manda o cookie porque SameSite só restringe entre sites diferentes, não
  entre subdomínios do mesmo registrable domain). **Lyra precisa chamar
  com `fetch(..., { credentials: 'include' })`** em toda rota `/v1/admin/*`.
- **Paginação por cursor (keyset), não OFFSET** — `domain/pagination.ts`
  (`encodeCursor`/`decodeCursor`) + `(created_at, id) DESC` em
  `admin-driver-application-repository.ts`. Ver bug real encontrado e
  corrigido em [[feedback-cursor-pagination-timestamp-precision]].
- **Auditoria**: toda leitura de candidatura (`listar`, `detalhe`) grava em
  `admin_audit_log` dentro da camada de SERVIÇO
  (`admin-driver-application-service.ts`), não na rota — assim nenhuma
  rota nova de leitura pode esquecer de auditar. `listar` grava os filtros
  usados + contagem de resultado (não a lista inteira de PII, para não
  duplicar dado sensível na trilha). `summary` (contagem agregada por
  status) **não é auditado** — decisão deliberada: não lê PII individual,
  só agrega; se o dono quiser auditar isso também, é um `insertAuditLog`
  extra na rota. `admin.login`/`admin.logout` também geram linha de
  auditoria (bônus, não exigido explicitamente, mas útil — e viável porque
  o `admin_id` sempre existe quando a sessão foi resolvida).
- **Contrato fixo (Lyra constrói contra ele em paralelo)**: envelope
  `{ ok, data }` / `{ ok:false, error:{code,message} }` SÓ nas rotas
  `/v1/admin/*` — as rotas públicas antigas (`/v1/waitlist`,
  `/v1/driver-applications`) continuam `{ ok:true }` sem `data`, não
  retroativo.

## Pendência/observação para o próximo

- `apps/admin` (workspace novo, não tocado por mim) já existe no repo —
  é a Lyra construindo o front em paralelo. Em 20/11/2026 `npm run
  typecheck` na raiz já estava limpo nos dois workspaces (o erro
  pré-existente em `apps/admin/src/api/client.ts` mencionado numa versão
  anterior desta nota não existe mais).
- `admin_users.account_id` (FK opcional para `accounts`) ficou de fora da
  migração 0003 porque `accounts` ainda não existe no banco — documentado
  no próprio SQL.

## Papéis definitivos + autorização por papel (20/11/2026, revisão do Órion)

- Migração **0006** troca o conjunto provisório `support|finance|superadmin`
  (0003) para os papéis aprovados pelo dono: `dono`, `operacao`,
  `revisor_documentos`, `financeiro`, `suporte` (matriz completa em
  `docs/decisoes-do-dono.md` → "Proposta de papéis"). Migra dado existente
  (`UPDATE` antes do `ALTER ... ADD CONSTRAINT`), não é destrutiva. Não
  editei a migração 0003 original — migração já criada nunca se edita
  retroativamente, mesmo sem admin em produção ainda.
- **Causa raiz do achado do Órion:** `requireAdmin` (hook) só validava
  sessão, nenhuma rota olhava `request.admin.role` — qualquer papel
  autenticado acessava qualquer rota admin. Correção:
  `requireAdminRole(...papéis)` em `src/hooks/require-admin.ts`, fábrica de
  `preHandler` que chama `requireAdmin` internamente e devolve 403
  `{code:'forbidden'}` se o papel não estiver na lista. Aplicado nas 3
  rotas de candidatura (`admin-driver-application-route.ts`) com
  `requireAdminRole('dono', 'operacao')` — `/v1/admin/me` continua só
  `requireAdmin` (qualquer papel autenticado vê o próprio perfil).
  **Como evitar a próxima vez:** toda rota `/v1/admin/*` nova PRECISA
  decidir papéis no momento de registrar, nunca "deixar para depois" —
  `requireAdmin` sozinho não é suficiente nenhuma rota sensível.

## Teto absoluto de sessão (achado do Órion: sliding sem hard cap)

- `admin_sessions.absolute_expires_at` (migração 0007) — fixado UMA VEZ no
  login (`ADMIN_SESSION_ABSOLUTE_TTL_HOURS`, default 168h/7 dias) e NUNCA
  avançado por `touchAdminSession` (só `expires_at`/`last_seen_at` se
  movem). `findActiveAdminSessionByTokenHash` exige os dois campos no
  futuro (`expires_at > now() AND absolute_expires_at > now()`). Provado
  no Postgres real: duas leituras da mesma sessão com segundos de
  intervalo mostram `expires_at` avançando e `absolute_expires_at` parado
  no valor do login.

## Vazamento de PII no log (reprovação da Íris)

- **Causa raiz:** o serializer `req` padrão do Fastify/pino loga
  `request.url` inteiro (com querystring) em toda linha "incoming
  request"/"request completed". `GET /v1/admin/driver-applications?q=...`
  é busca livre por nome/e-mail/telefone — qualquer valor buscado virava
  texto puro no log.
- **Correção:** `app.ts` passa `logger.serializers.req` customizado que
  corta a querystring (`url.split('?')[0]`) antes de logar — vale para
  TODA rota do serviço, não só esta, de propósito (nenhuma querystring
  futura é segura por padrão). Não dava para confiar em redigir só o `q`
  rota a rota: a próxima rota com parâmetro sensível esqueceria.
- **Pegadinha de tipagem:** o retorno do serializer customizado tem que
  omitir `remotePort` quando `undefined` via spread condicional
  (`...(x !== undefined ? {remotePort: x} : {})`), não
  `remotePort: x ?? undefined` — o tipo do Fastify é `remotePort?: number`
  (ausente ou number, nunca `undefined` explícito). Esse erro de tipo
  sozinho fez o TypeScript cair num overload errado de `Fastify(...)` e
  gerar ~6 erros aparentemente desconexos (`Http2SecureServer`,
  `maxHeadersCount` etc.) — se isso reaparecer num serializer custom,
  olhar primeiro o tipo de retorno, não a assinatura de `Fastify()`.
- **Como provar (padrão para a Íris revalidar):** rodar a rota com um
  valor único em `q`, depois `grep` o arquivo de log inteiro por esse
  valor — tem que dar zero ocorrências. Ler só a linha específica não
  basta (prova pouco); grep no arquivo inteiro prova a ausência.
