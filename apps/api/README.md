# @vuumbora/api

API mínima do VuumBora — primeira peça real de backend do projeto (Fase 5).
Dois endpoints até agora: a lista de espera do passageiro (`/v1/waitlist`)
e a candidatura de pré-cadastro de motorista (`/v1/driver-applications`).

Guia completo (rodar local, publicar no Easypanel, exportar e excluir):
**`docs/lista-de-espera.md`** na raiz do monorepo.

Contrato consumido pelo front (tipos + adaptador `http`):
`packages/api-client/src/waitlist` e `packages/api-client/src/driver-applications`.

## Rotinas de operador (cron diário do Easypanel, dentro do contêiner da API)

Os comandos abaixo são os de DENTRO do contêiner: na imagem, a raiz é o próprio `apps/api`, então é `node scripts/...` (ou
`npm run <rotina>`) **sem** `-w`. Com `-w @vuumbora/api` o npm responde `No workspaces found` ali (achado do Vulcano,
27/11/2026, `docs/publicar-o-backend.md`). A forma `npm run <rotina> -w @vuumbora/api` só serve no monorepo, em
desenvolvimento (e `documents:expiry` lê `dist/`: `npm run build -w @vuumbora/api` antes).

| Comando (no contêiner) | Credencial | O que faz |
|---|---|---|
| `node scripts/retention-identity.mjs` | `MIGRATION_DATABASE_URL` (dona) | Retenção da identidade, candidaturas e lista de espera (ver o cabeçalho de `scripts/retention-identity.mjs`). |
| `node scripts/document-expiry.mjs` | a `DATABASE_URL` do serviço (papel restrito basta) | Documento de motorista aprovado e vencido no dia de Natal vira `expired`; aviso por e-mail 30 e 7 dias antes, se o SMTP estiver configurado (sem SMTP, só uma linha de log com contagens). |
| `node scripts/purge-fare-quotes.mjs` | a `DATABASE_URL` do serviço (papel restrito basta) | Apaga as cotações com mais de 30 dias (origem e destino são localização), repetindo `purge_fare_quotes` até zerar. Imprime só contagens. |

`documents:expiry`: agende UMA vez por dia (sugestão: 09:00 de Natal = 12:00 UTC). Rodar duas vezes no mesmo dia repete o
aviso; duas execuções simultâneas não (a segunda desiste). Dia perdido: rode à mão com `--now=<instante ISO do dia>`
(`node scripts/document-expiry.mjs --now=2026-11-27T12:00:00Z`) para recuperar os avisos daquele dia. Precisa de
`ADMIN_TOTP_ENCRYPTION_KEY` para ler a senha SMTP salva no painel.
Detalhes e motivos: `scripts/document-expiry.mjs` e `src/services/document-expiry-service.ts`.

`quotes:purge`: agende uma vez por dia (sugestão: 04:00 de Natal = 07:00 UTC, fora do pico). O prazo de 30 dias é do
banco (`purge_fare_quotes`, migração 0026), não do script. Rodar de novo ou atrasar um dia não faz mal; duas execuções
simultâneas não brigam (a segunda vê a trava e desiste). Lote ajustável com `--batch=N` (1 a 50000; padrão 5000). A
exclusão de conta já apaga as cotações dela na hora; esta rotina cuida do resto. Detalhes: `scripts/purge-fare-quotes.mjs`.
