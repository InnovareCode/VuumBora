# @vuumbora/api

API mínima do VuumBora — primeira peça real de backend do projeto (Fase 5).
Dois endpoints até agora: a lista de espera do passageiro (`/v1/waitlist`)
e a candidatura de pré-cadastro de motorista (`/v1/driver-applications`).

Guia completo (rodar local, publicar no Easypanel, exportar e excluir):
**`docs/lista-de-espera.md`** na raiz do monorepo.

Contrato consumido pelo front (tipos + adaptador `http`):
`packages/api-client/src/waitlist` e `packages/api-client/src/driver-applications`.

## Rotinas de operador (cron diário do Easypanel, dentro do contêiner da API)

| Comando | Credencial | O que faz |
|---|---|---|
| `npm run identity:retention -w @vuumbora/api` | `MIGRATION_DATABASE_URL` (dona) | Retenção da identidade, candidaturas e lista de espera (ver o cabeçalho de `scripts/retention-identity.mjs`). |
| `npm run documents:expiry -w @vuumbora/api` | a `DATABASE_URL` do serviço (papel restrito basta) | Documento de motorista aprovado e vencido no dia de Natal vira `expired`; aviso por e-mail 30 e 7 dias antes, se o SMTP estiver configurado (sem SMTP, só uma linha de log com contagens). |

`documents:expiry`: agende UMA vez por dia (sugestão: 09:00 de Natal = 12:00 UTC). Rodar duas vezes no mesmo dia repete o
aviso; duas execuções simultâneas não (a segunda desiste). Dia perdido: rode à mão com `-- --now=<instante ISO do dia>`
para recuperar os avisos daquele dia. Precisa de `ADMIN_TOTP_ENCRYPTION_KEY` para ler a senha SMTP salva no painel.
Detalhes e motivos: `scripts/document-expiry.mjs` e `src/services/document-expiry-service.ts`.
