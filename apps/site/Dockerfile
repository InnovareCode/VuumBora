# syntax=docker/dockerfile:1
#
# Build de `apps/site` (Next.js, output: 'export') dentro do monorepo npm
# workspaces. Por que Dockerfile próprio em vez da detecção automática do
# Easypanel (Nixpacks/Buildpacks):
#
# 1. O build PRECISA rodar a partir da raiz do monorepo — `npm ci` só resolve
#    corretamente o workspace `@vuumbora/tokens` (fonte dos tokens de design)
#    se a instalação acontecer no nível do repo, não dentro de `apps/site`
#    isolado. A detecção automática assume um app de pasta única e não tem
#    como saber disso sem configuração extra equivalente a este arquivo.
# 2. O resultado final é HTML/CSS/JS estático (sem servidor Node em
#    produção) — não precisa de runtime Node rodando 24/7, só de um servidor
#    de arquivos. Nginx é a imagem final: mais leve, inicia mais rápido e
#    tem menos superfície de ataque (nenhum pacote npm presente no contêiner
#    publicado) do que manter `next start`/Node ligado.
# 3. Testável localmente com o comando padrão do Docker, igual ao que o
#    Easypanel executa — sem adivinhar o que a detecção automática faria.
#
# Contexto de build = RAIZ do monorepo (não apps/site). No Easypanel, aponte
# "Build Path"/contexto para a raiz do repositório e "Dockerfile Path" para
# apps/site/Dockerfile — ver docs/deploy-easypanel.md. Localmente:
#   docker build -f apps/site/Dockerfile -t vuumbora-site .   (rodar da raiz)

# ---------- Stage 1: build ----------
FROM node:22-alpine AS build
WORKDIR /repo

# Primeiro só os manifests (os workspaces que o site realmente usa) para
# cachear `npm ci` entre builds quando só o código-fonte muda.
COPY package.json package-lock.json ./
COPY apps/site/package.json apps/site/package.json
COPY packages/tokens/package.json packages/tokens/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN npm ci --ignore-scripts

# Agora o código-fonte necessário. Nada de passenger/driver/ui aqui — o site
# não depende deles (ver `dependencies` em apps/site/package.json).
#
# `api-client` e `domain` ENTRAM, e isso é obrigatório: o site fala com o
# backend por `@vuumbora/api-client/waitlist` e `/driver-applications`, e o
# api-client declara `@vuumbora/domain`. Estes pacotes publicam TypeScript
# direto (`"exports": "./src/index.ts"`), então o bundler precisa dos fontes,
# não de um dist compilado — copiar só o package.json faz o `npm ci` criar um
# link de workspace apontando para pasta vazia, o `npm ci` PASSA, e o build
# quebra depois com "Module not found".
#
# Foi exatamente o que derrubou o deploy de 19/11/2026: este arquivo dizia em
# comentário que o site não dependia do api-client, o que era verdade quando
# foi escrito e deixou de ser quando a lista de espera e a candidatura
# surgiram. Ao acrescentar aqui qualquer import de outro workspace, a linha
# correspondente tem que entrar nas duas listas abaixo (manifesto e fonte).
COPY tsconfig.base.json ./
COPY apps/site apps/site
COPY packages/tokens packages/tokens
COPY packages/api-client packages/api-client
COPY packages/domain packages/domain
COPY VuumBora_Claude_Design_System/tokens VuumBora_Claude_Design_System/tokens

# `npm run build` (dentro do workspace) roda generate-tokens-css.mjs e depois
# `next build` com output: 'export' -> gera apps/site/out/.
RUN npm run build --workspace @vuumbora/site

# ---------- Stage 2: runtime ----------
FROM nginx:1.27-alpine AS runtime

COPY apps/site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/site/out /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O- http://127.0.0.1:80/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
