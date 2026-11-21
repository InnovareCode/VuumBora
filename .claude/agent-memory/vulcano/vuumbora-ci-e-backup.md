---
name: vuumbora-ci-e-backup
description: CI do GitHub e backup/restauracao do Postgres do VuumBora (preparados 21/11/2026, nada ligado em producao) e as armadilhas que apareceram ao provar.
metadata:
  type: project
---

Preparado no repo, **nao ativado**: `.github/workflows/ci.yml` (jobs check, api, backup-drill, gate `ci-ok`),
`scripts/backup/*` (backup, restore, drill, Dockerfile do servico `vuumbora-backup`),
`docs/backup-e-restauracao.md`, `docs/producao-passo-a-passo-dono.md`.

- **Migracao nova pode quebrar o drill de restauracao**: a 0012 faz REVOKE em `schema_migrations`,
  tabela que o runner da API cria. Aplicar `*.sql` cru num banco limpo falha. O drill agora cria
  `schema_migrations` e registra cada arquivo (imita `apps/api/src/migrate.ts`). Se o runner mudar,
  ajustar o drill. Causa raiz: duas implementacoes do mesmo passo (runner x drill).
- Nao existe script `test` em `apps/api` (21/11/2026) e a API nao usa Redis; o job `api` falha de
  proposito sem o script, e Redis entra so como service pedido.
- CI usa `postgres:18`; cliente pg_dump precisa ser >= servidor (imagem de backup e `postgres:18-alpine`).
  Versao do Postgres de producao no Easypanel nao confirmada.
- Docker do runtime da API so tem `node scripts/create-admin.mjs` (sem workspace npm); guia do dono usa isso.
- Sem Docker nesta maquina: Dockerfile de backup e envio rclone nao foram provados, so os scripts.
- Ferramentas locais: Postgres 18 em `C:\Program Files\PostgreSQL\18\bin` (initdb/pg_ctl, cluster
  temporario em porta propria); actionlint e shellcheck via `pip install actionlint-py shellcheck-py` num venv.
- Tool Bash nesta maquina quebra heredoc com apostrofo em linha de texto: usar Write para criar scripts.
