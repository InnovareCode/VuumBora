---
name: project-lista-de-espera
description: Estado e decisões do backend do VuumBora (apps/api) — lista de espera do passageiro E candidatura de pré-cadastro de motorista. Stack, contratos, pendências do dono.
metadata:
  type: project
---

Implementado em 18-19/11/2026: `apps/api` (Fastify + TypeScript + `pg`,
sem ORM). **Dois endpoints, duas tabelas, dois públicos** (desde
19/11/2026 — ver "Pivô 19/11/2026" abaixo):

- `POST /v1/waitlist` — lista de espera simples do passageiro (só e-mail,
  perfil sempre `'passenger'`). Tabela `waitlist_signups`. Contrato em
  `packages/api-client/src/waitlist` (`WaitlistPort` +
  `createWaitlistHttpAdapter`). **Não mudou** no pivô de 19/11 — só o
  motorista ganhou formulário próprio.
- `POST /v1/driver-applications` — candidatura de motorista (nome,
  telefone, e-mail, cidade, UF, + 2 campos opcionais de elegibilidade).
  Tabela `driver_applications`, separada por decisão deliberada (ver
  `docs/lista-de-espera.md` → "Por que `driver_applications` é uma tabela
  separada"). Contrato em `packages/api-client/src/driver-applications`
  (`DriverApplicationPort` + `createDriverApplicationHttpAdapter`).

Documentação operacional completa em `docs/lista-de-espera.md`.

## Pivô 19/11/2026: NÃO estenda `/v1/waitlist` — crie endpoint novo

Quando o dono pediu campos extras (nome/telefone/cidade/UF) "para o
pré-cadastro de motorista", a primeira leitura óbvia é estender o
`bodySchema` de `/v1/waitlist`. **Isso estava errado** e eu cheguei a
implementar assim antes de descobrir o motivo — tive que reverter todo o
código feito em cima dessa suposição (`domain/waitlist.ts`,
`repositories/waitlist-repository.ts`, `services/waitlist-service.ts`,
`routes/waitlist-route.ts`, `packages/api-client/src/waitlist/index.ts`,
os scripts de export/delete).

**Causa raiz:** `apps/site` já tinha, em paralelo (outro agente —
"outra frente" — trabalhando na mesma janela de tempo), um
`DriverApplicationForm.tsx` + `lib/driver-application-client.ts`
PROVISÓRIO já escrito contra um endpoint **diferente**,
`/v1/driver-applications`, com um body shape próprio
(`{name, phone, email, city, state, alreadyDrivesForApp?, hasOwnVehicle?}`).
O `WaitlistForm.tsx` (passageiro) continuava simples, só e-mail, perfil
sempre `'passenger'` — os dois formulários/públicos tinham sido
deliberadamente separados no front ANTES de eu tocar no backend.

**Como evitar a próxima vez:** antes de estender um endpoint existente por
pedido de "adicionar campos", `grep -rn` em `apps/site/src/lib` e
`apps/site/src/components` por algum `*-client.ts`/`*Form.tsx` novo ou
modificado que já fale com um endpoint diferente do que eu assumi. Em
monorepo com vários agentes simultâneos, o código já escrito no front (mesmo
que marcado "PROVISÓRIO") costuma refletir uma decisão de produto mais
recente do que o briefing que me chegou — ele é a fonte de verdade a
checar antes de desenhar o contrato, não minha suposição inicial.

## Decisões técnicas da candidatura de motorista (`driver_applications`)

- **Tabela própria**, não colunas extras em `waitlist_signups`: públicos e
  fluxos diferentes (um é inscrição simples, o outro é candidatura
  avaliada pelo dono).
- **Telefone normalizado para E.164** (`+55DDXXXXXXXXX`) no servidor —
  `apps/api/src/domain/phone.ts`, `normalizeBrazilianPhone`. Aceita
  qualquer formato digitado (com/sem DDI, parênteses, espaço, hífen,
  com/sem o 9º dígito — insere automaticamente se faltar e o total bater
  com DDD+8 dígitos). Reutilizável para qualquer campo de telefone futuro
  no projeto.
- **UF aceita qualquer uma das 27** (`normalizeBrazilianState`, mesma
  arquivo) — o servidor NÃO filtra por região; é o dono que decide depois
  quem prioriza. Pedido explícito do Atlas/dono: "aceite qualquer UF e
  deixe o dono filtrar".
- **Erro de validação devolve TODOS os campos inválidos de uma vez**
  (`{"error":{"code":"validation_failed","fields":{"name":"...","phone":"..."}}}`),
  não só o primeiro — diferente do padrão antigo de `/v1/waitlist`
  (`invalid_<campo>` único). Motivo: `ApiError.validation.fields` em
  `packages/api-client/src/index.ts` já suporta mapa multi-campo, e o
  `DriverApplicationForm.tsx` já lê `error.fields['name']`,
  `error.fields['phone']` etc. individualmente — então popular vários de
  uma vez é estritamente melhor pro formulário, sem exigir mudança nele.
- **Coluna `status`** (`pending`/`approved`/`rejected`, default `pending`)
  criada na migração 0002 **sem nenhum fluxo de aprovação construído em
  cima** — proposta minha, aceita implicitamente (ninguém pediu reverter).
  Só existe para não exigir outra migração quando o dono definir quem
  aprova/quando. Nenhum endpoint/script lê ou altera; mudar é manual (SQL)
  por ora.
- **Etapa 2 (endereço, CEP, documentos) deliberadamente NÃO existe** —
  nem coluna, nem campo de input. Decisão do dono: não coletar endereço
  residencial de quem ainda não foi aprovado. Quando a etapa 2 for
  construída, usar o mesmo padrão: `ALTER TABLE ... ADD COLUMN IF NOT
  EXISTS ... NULL` (sem backfill).

**Decisões técnicas que valem para continuar este trabalho:**
- Motor de banco assumido como **Postgres** (`vuumbora-banco` no Easypanel
  existe mas estava vazio, sem motor escolhido) — documentado como suposição
  a confirmar antes de publicar, não decisão fechada. Se mudar, a migração
  SQL em `apps/api/migrations/0001_create_waitlist_signups.sql` precisa de
  adaptação.
- Valores de enum na API ficam em **inglês** (`passenger`/`driver`), mesmo
  o produto falando português — segue a convenção já estabelecida em
  `packages/domain` (`TripStatus`, `VerificationStatus` etc. também são
  strings em inglês).
- `apps/api` é **standalone**: não importa `packages/domain` nem
  `packages/api-client` em runtime (só o contrato de tipos fica documentado
  em `api-client`). Motivo: o `.dockerignore` da raiz já exclui
  `packages/domain`/`packages/api-client`/`packages/ui`/`apps/passenger`/
  `apps/driver` do contexto de build (pensado originalmente só para o
  Dockerfile do site) — manter o backend sem essas dependências evita
  precisar editar esse arquivo compartilhado.
- Rate limit da rota de inscrição é **em memória, por IP**, sem persistir
  IP em lugar nenhum (nem banco, nem log) — decisão deliberada para não
  precisar guardar IP junto do e-mail. Reseta ao reiniciar o processo;
  aceitável no volume atual. Se crescer, a saída documentada é Redis
  guardando `IP → contagem` (nunca `IP → email`) com expiração curta.
- Sem `idempotencyKey` no `WaitlistPort.signUp` (diferente das portas de
  corrida) — o e-mail já é a chave natural, garantida por `UNIQUE INDEX` +
  `ON CONFLICT DO NOTHING` no banco.

**Pendências do dono — resolvidas (acompanhar só por histórico, ver
`docs/lista-de-espera.md` §7 e `docs/decisoes-do-dono.md`):**
- Controlador dos dados: **resolvido em 19/11/2026** — Innovare Code, CNPJ
  09.813.446/0001-00.
- Canal de contato para exclusão: **resolvido em 19/11/2026** —
  contato@vuumbora.com.br. Vale para os dois formulários (passageiro e
  motorista); nenhum dos dois está mais bloqueado por falta desse dado.

**Pendência real que continua aberta:** quem analisa as candidaturas de
motorista, em quanto tempo, com qual critério — e, quando isso existir,
quem/como muda a coluna `status`. Registrado em
`docs/decisoes-do-dono.md` → "Campos do pré-cadastro de motorista" →
"Pendência que isso cria". Não é bloqueio técnico — é decisão de produto
do dono.

Ver também [[feedback-fastify-error-handler-statuscode]] — bug real
encontrado e corrigido durante a implementação, relevante para qualquer
rota Fastify futura neste serviço.
