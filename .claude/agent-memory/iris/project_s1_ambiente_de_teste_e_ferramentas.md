---
name: project-s1-ambiente-de-teste-e-ferramentas
description: Como montar nesta máquina (Windows, Git Bash) Postgres isolado, Node 22 do CI, cópia limpa do repo, mutação em cópia e Playwright com WebKit/Firefox
metadata:
  type: project
---

Complementa [[project-admin-v0-ambiente-de-teste]].

- **O scratchpad é compartilhado entre agentes da mesma sessão** (havia `pgvega2fa`, `pw/` da Lyra). Trabalhe num subdiretório próprio (`scratchpad/iris/`) e NUNCA faça `rm -rf` fora dele; o `pgdata` que usei era meu, o cluster da 5434 era da Vega.
- Cluster descartável: `initdb -D ... -U postgres -A trust` + `pg_ctl ... -o "-p 5436 -c max_connections=200" -l log start` (sem `-w`: no Windows o `pg_ctl -w` pendura o shell mesmo com o servidor no ar; confira a porta com netstat).
- `DATABASE_URL` exportada no shell vence o `apps/api/.env` (dotenv não sobrescreve). O banco precisa terminar em `_test`.
- **Node 22 (o do CI) sem instalar nada:** `npm i node@22` num diretório vazio, copiar só `node.exe` para uma pasta própria e pôr essa pasta no PATH (a pasta do pacote tem um `node` de 34 bytes que mascara). `npm` chamado como `node "/c/Program Files/nodejs/node_modules/npm/bin/npm-cli.js"`.
- **CI fiel:** `git ls-files -co --exclude-standard -z | tar --null -T - -cf - | tar -xf - -C <dir>` (sem `.env`, sem node_modules) e `npm ci` lá. Só assim aparecem lockfile fora de sincronia e arquivos gitignored de que o build depende.
- **Mutação sem tocar no repo:** backup de `src/migrations/scripts` na cópia limpa, aplicar a troca com um script que FALHA se o trecho não existir (arquivos `.sql` e alguns `.ts` são CRLF — troca textual com `\n` não casa) e restaurar do backup. Rodar cada mutação num banco recriado, porque as migrações mutadas só entram em banco novo.
- **Playwright:** o skill (`~/.claude/skills/playwright-skill/node_modules/playwright`) pede webkit-2336/firefox-1538; instalei com `node node_modules/playwright/cli.js install webkit firefox` (aditivo, ~120 MB cada). Escreva scripts por `Write`, não por heredoc no Bash (aspas/crases quebram). O vite do admin escuta só em `[::1]:4310`: o Firefox falhou 1ª navegação com CONNECTION_REFUSED e passou na segunda.
- Limite global da API é 100 req/min por IP (`app.ts`): várias execuções do navegador seguidas fazem `GET /me` devolver 429 e a UI mostra a tela de login como se a sessão tivesse caído. Espere ~1 min ou reaproveite `storageState`.
- Teto de teste de e-mail do painel: 5/h por admin (conta até o que falha). Para repetir o fluxo use outro dono (`create-admin --role=dono`).
