---
name: vuumbora-deploy-easypanel
description: Empacotamento Docker e deploy do site institucional e do painel admin no Easypanel do dono — monorepo, serviços já existentes no painel, achados de segurança e de build por workspace isolado.
metadata:
  type: project
---

## Sessão 20/11/2026 — `apps/admin` (React + Vite) no serviço `vuumbora-admin`

Dockerfile em `apps/admin/Dockerfile`, contexto = raiz do monorepo (mesmo
padrão do site e da API). Dois achados que não apareceriam sem simular o
build fora de contêiner — guardar para o próximo Dockerfile de um workspace
com estágio de compilação de verdade (TS + bundler), diferente do site
(sem build) e da API (sem Vite):

- **Bug real, não só armadilha de Docker:** `apps/admin/vite.config.ts` usa
  `process.cwd()`, que precisa de `@types/node` para tipar. O projeto
  funcionava no monorepo inteiro só porque `@types/node` está declarado em
  `apps/api/package.json` e o npm faz *hoist* dele para a raiz — `tsc` do
  admin resolvia por acidente, via um workspace que não tem nada a ver com
  ele. Isso quebra assim que o workspace é isolado (exatamente o que o
  Dockerfile faz, copiando só `apps/admin/package.json`): erro
  `TS2591 Cannot find name 'process'`. Corrigido na fonte, não só no
  Dockerfile: `@types/node` entrou como devDependency direto de
  `apps/admin/package.json` (+ `npm install --package-lock-only` pra
  sincronizar o lockfile). **Lição geral:** `npm run check` passando no
  monorepo inteiro NÃO prova que um workspace builda isolado — só provar
  copiando exatamente os arquivos que o Dockerfile copia, num diretório
  limpo, prova isso. Vale conferir em qualquer workspace novo que ganhe
  Dockerfile próprio.
- **Vite 8 deste projeto usa Rolldown (Rust), não esbuild** — por isso
  `npm ci --ignore-scripts` É seguro aqui (confirmado rodando o build com e
  sem a flag): os binários nativos por plataforma (ex.
  `lightningcss-linux-x64-musl` dentro do Alpine) vêm via
  `optionalDependencies` resolvidas pelo próprio npm, sem script de
  pós-instalação. `esbuild` existe no `package-lock.json` da raiz (é o único
  pacote do monorepo, junto de `fsevents`, com `hasInstallScript: true`),
  mas pertence à árvore de outro workspace — não aparece quando só
  `apps/admin/package.json` é copiado. Não assumir que "Vite = esbuild":
  conferir a árvore de dependências instalada antes de decidir
  `--ignore-scripts` sim/não.
- **Vite grava `VITE_API_MODE`/`VITE_API_BASE_URL` dentro do bundle em tempo
  de BUILD**, não de execução — por isso são `ARG` do Dockerfile (com
  `--build-arg` no Easypanel), nunca Variável de Ambiente do serviço. Prova:
  simulação do build sem Docker, grep no JS gerado confirmando a URL
  presente, e confirmação de que sem os dois args o build falha com o erro
  da guarda `fail-build-on-mock-api` (apontada pelo Órion) — guarda que
  existe para nunca publicar o admin em modo demonstração sem ninguém notar,
  e que **não deve ser contornada**.
- **Nginx do admin precisa de duas coisas que o do site não precisa:**
  fallback de SPA (`try_files $uri $uri/ /index.html`, porque o React
  Router resolve rotas como `/driver-applications` no cliente, sem arquivo
  correspondente no disco) e cache diferenciado — `assets/` do Vite tem
  hash de conteúdo no nome (cache longo e imutável), mas `index.html` não
  pode ter cache longo (ele referencia o hash da vez).
- **Endereço do admin: `admin.vuumbora.com.br`**, decidido pelo dono — **não
  confundir com `painel.vuumbora.com.br`**, que é o painel do próprio
  Easypanel (passo 0 de `docs/deploy-easypanel.md`, ainda pendente). Os dois
  nomes pareciam a mesma divergência numa auditoria do Órion, mas eram duas
  coisas diferentes — ver `docs/decisoes-do-dono.md` §7. `ALLOWED_ORIGINS`
  da API ganhou `https://admin.vuumbora.com.br` (`apps/api/.env.example`
  corrigido). Cookie de sessão continua `SameSite=Lax` porque os dois
  subdomínios são o mesmo site para o navegador (cross-origin, não
  cross-site).
- `scripts/check-docker-context.mjs` tem uma lista fixa (`DOCKERFILES`) dos
  Dockerfiles que ele conhece — um Dockerfile novo não entra na guarda
  sozinho. Acrescentei `apps/admin/Dockerfile` ali.
- Sem Docker nesta máquina, de novo — mesma limitação da sessão do site.
  Simulação fora de contêiner prova conteúdo/pipeline, não o
  Dockerfile/Nginx dentro de um contêiner real.

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
