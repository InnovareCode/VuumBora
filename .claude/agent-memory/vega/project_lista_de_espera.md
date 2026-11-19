---
name: project-lista-de-espera
description: Estado e decisões da primeira peça real de backend do VuumBora (apps/api, lista de espera) — stack, contrato, pendências do dono.
metadata:
  type: project
---

Implementado em 18-19/11/2026: `apps/api` (Fastify + TypeScript + `pg`,
sem ORM), endpoint único `POST /v1/waitlist`, contrato em
`packages/api-client/src/waitlist` (`WaitlistPort` + `createWaitlistHttpAdapter`).
Documentação operacional completa em `docs/lista-de-espera.md`.

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

**Pendências do dono (acompanhar — ver `docs/lista-de-espera.md` §7 e
`docs/decisoes-do-dono.md` → "Lista de espera"):**
- Controlador dos dados: **resolvido em 19/11/2026** — Innovare Code, CNPJ
  09.813.446/0001-00.
- **Ainda falta (19/11/2026):** canal de contato (e-mail) para pedido de
  exclusão. Sem isso o aviso de privacidade do formulário fica incompleto
  e **o formulário não pode ir ao ar no site**, mesmo com o backend pronto
  e funcionando. O mecanismo técnico de exclusão já existe
  (`apps/api/scripts/delete-waitlist.mjs`) — só falta o endereço para a
  pessoa pedir.

Ver também [[feedback-fastify-error-handler-statuscode]] — bug real
encontrado e corrigido durante a implementação, relevante para qualquer
rota Fastify futura neste serviço.
