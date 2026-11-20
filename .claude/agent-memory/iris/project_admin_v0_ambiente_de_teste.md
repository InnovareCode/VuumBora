---
name: project-admin-v0-ambiente-de-teste
description: Como montar um ambiente real (Postgres + API + SPA) para testar o Admin v0 do VuumBora nesta máquina, sem Docker
metadata:
  type: project
---

Esta máquina não tem Docker. O Postgres local da porta 5432 tem credencial
desconhecida (Vega já bateu nisso). A saída que funcionou: usar os binários
de `C:/Program Files/PostgreSQL/18/bin` (`initdb.exe`, `pg_ctl.exe`,
`createdb.exe`, `psql.exe`) para subir um cluster descartável próprio num
diretório do scratchpad, com `-A trust` (sem senha) numa porta livre (usei
5434 — 5433 também apareceu usada por sessão anterior do Vega, não confie
que esteja livre sem checar `Test-NetConnection`).

**Por quê:** sem isso, qualquer validação ponta-a-ponta do Admin v0 trava na
largada (API não sobe sem `DATABASE_URL` válido). O boot da API aplica as
migrações sozinho (`RUN_MIGRATIONS_ON_BOOT`), então basta apontar
`DATABASE_URL` pro cluster novo e rodar `npm run dev` em `apps/api` — não
precisa rodar migração à mão.

**Como aplicar:** `apps/api/.env` e `apps/admin/.env.local` são
gitignored — se já existirem (de outra sessão/agente), sobrescrevê-los para
teste é seguro para o git, mas destrutivo para quem usava aquele arquivo
(ex.: Vega apontando pro cluster dele na 5433). Avise no handoff quando
sobrescrever, e lembre quem retomar o trabalho de recriar o `.env` deles.

Fluxo completo provado: `initdb` → `pg_ctl start -o "-p 5434"` → `createdb`
→ `.env` da API com essa `DATABASE_URL` → `npm run dev` (migra sozinho) →
`node scripts/create-admin.mjs --password=...` para nascer o primeiro admin
→ `apps/admin/.env.local` com `VITE_API_MODE=http` e
`VITE_API_BASE_URL=http://localhost:3100` (a porta que você deu pra API) →
`npm run dev` no admin (porta fixa 4310, ver `vite.config.ts`) →
[[playwright-skill-login-fluxo-real]].

Ver também [[feedback-rate-limit-login-reseta-so-reiniciando-api]].
