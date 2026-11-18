---
name: vuumbora-deploy-easypanel
description: Empacotamento Docker e deploy do site institucional (apps/site) no Easypanel do dono — monorepo, serviços já existentes no painel, achado de segurança do painel.
metadata:
  type: project
---

Sessão 18/11/2026: empacotei `apps/site` (Next.js, `output: 'export'`) para
publicação no Easypanel do dono. Projeto `vuumbora` no painel dele já tinha
quatro serviços criados antes de eu chegar: `vuumbora-backend`,
`vuumbora-banco`, `vuumbora-frontend`, `vuumbora-redis`. O site vai no
`vuumbora-frontend`; banco/redis ficam reservados para a Fase 5 (backend) —
não tocar neles num deploy de site.

- **Dockerfile em `apps/site/Dockerfile`, mas contexto de build = raiz do
  monorepo.** Decisão: Dockerfile próprio em vez da detecção automática do
  Easypanel (Nixpacks/Buildpacks), porque o build do site precisa instalar a
  partir da raiz (workspace `@vuumbora/tokens`) e o resultado final não
  precisa de Node rodando em produção (é estático) — imagem final é
  `nginx:1.27-alpine` servindo `apps/site/out/`, bem mais leve e com menos
  superfície de ataque que manter `next start`.
- **Comprovado sem Docker instalado nesta máquina** (não havia `docker` no
  PATH nem em `Program Files` — confirmado, não suposto). Como alternativa,
  simulei o pipeline completo do Dockerfile fora de contêiner, num diretório
  temporário: copiei só os arquivos que o build realmente usa (ver abaixo),
  rodei `npm ci` + `npm run build --workspace @vuumbora/site`, e servi
  `out/` com `python -m http.server` confirmando HTTP 200 em `/`, favicon,
  imagem OG e um chunk JS hasheado, e 404 correto em rota inexistente. É
  prova do conteúdo/pipeline, não do Dockerfile/Nginx em si — reportado como
  tal, não disfarçado de "testei o contêiner".
- **Achado-chave testado empiricamente:** `npm ci` num monorepo com
  `workspaces: ["apps/*","packages/*"]` **não exige** que todos os workspaces
  do glob estejam presentes/com `package.json` — só os que o lockfile
  referencia e você efetivamente copiou. Isso permite, no Dockerfile, copiar
  **só** `package.json` da raiz + `apps/site/package.json` +
  `packages/tokens/package.json` (as únicas dependências reais do site, ver
  `apps/site/package.json`) em vez do monorepo inteiro — build mais rápido e
  contexto menor, sem puxar `apps/passenger`/`apps/driver`/`packages/ui`
  /`packages/domain`/`packages/api-client` (não usados pelo site).
- **`VuumBora_Claude_Design_System/` tem 12 MB, mas o build só usa
  `tokens/vuumbora.tokens.json`** (usado por `packages/tokens/src/index.ts` e
  por `apps/site/scripts/generate-tokens-css.mjs`, caminho relativo
  `../../../VuumBora_Claude_Design_System/tokens/...`). `.dockerignore` na
  raiz exclui o resto da pasta (codigo/especificacoes/prompts/referencias) —
  o Dockerfile copia só `VuumBora_Claude_Design_System/tokens`.
- **O site não usa nenhuma variável de ambiente** (grep em `apps/site/src`
  por `process.env`/`MAPBOX`/`NEXT_PUBLIC_` não bateu nada) — é
  diferente dos apps Expo, que usam `EXPO_PUBLIC_MAPBOX_TOKEN`. Documentado
  em `docs/deploy-easypanel.md` para não confundir "o projeto usa Mapbox"
  (verdade pros apps) com "o site usa Mapbox" (falso).
- **Achado de segurança reportado ao dono (via Atlas), não meu de resolver
  sozinho:** o painel Easypanel estava sendo acessado por HTTP sem
  certificado, direto por IP — senha do painel em texto claro na rede. Dono
  aprovou tratar como prioridade: seção 0 de `docs/deploy-easypanel.md` cobre
  pôr o próprio painel (não o serviço do site) atrás de um subdomínio com
  HTTPS (`painel.vuumbora.com.br` sugerido) **antes** de seguir com a
  publicação do site. Esse domínio do painel é separado do domínio do site
  (`www.vuumbora.com.br`) e configurado nas Configurações gerais do
  Easypanel, não na aba Domínios de um serviço.
- `docs/deploy-easypanel.md` documenta dois caminhos de build no painel:
  Dockerfile (recomendado, apontando pra `apps/site/Dockerfile` com contexto
  na raiz) e o que fazer se a detecção automática (Nixpacks) for tentada
  primeiro e falhar no monorepo — trocar o método pra Dockerfile.
- Fronteira respeitada: não tentei acessar o servidor nem o painel do dono
  em nenhum momento — só documentei os cliques, a partir de prints que o
  Atlas repassou.
- **`package.json` da raiz não tem script `build`** (só `passenger`,
  `driver`, `typecheck`, `check:boundaries`, `check`) — de propósito não
  acrescentei um, porque num monorepo com dois apps Expo ao lado do site um
  `build` genérico na raiz seria ambíguo ("build de quê?"). Isso quebra
  qualquer detecção automática do Easypanel que tente rodar `npm run build`
  cru na raiz — documentado explicitamente em `docs/deploy-easypanel.md`
  seção 4, com o comando exato pro campo manual de build do painel, caso ele
  não use o Dockerfile: `npm run build --workspace @vuumbora/site`
  (instalação `npm ci`, saída `apps/site/out`). Se outro app do monorepo
  precisar do mesmo tipo de deploy por painel auto-detect no futuro, usar
  `--workspace <nome>` em vez de criar um `build` ambíguo na raiz.
- `gh` não estava autenticado nesta máquina/sessão — não consegui confirmar
  se `InnovareCode/VuumBora` é público ou privado. O guia cobre os dois
  casos para a autorização do Github no Easypanel em vez de assumir um.
