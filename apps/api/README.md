# @vuumbora/api

API mínima do VuumBora — primeira peça real de backend do projeto (Fase 5).
Dois endpoints até agora: a lista de espera do passageiro (`/v1/waitlist`)
e a candidatura de pré-cadastro de motorista (`/v1/driver-applications`).

Guia completo (rodar local, publicar no Easypanel, exportar e excluir):
**`docs/lista-de-espera.md`** na raiz do monorepo.

Contrato consumido pelo front (tipos + adaptador `http`):
`packages/api-client/src/waitlist` e `packages/api-client/src/driver-applications`.
