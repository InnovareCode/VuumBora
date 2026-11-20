# syntax=docker/dockerfile:1
#
# Build do painel administrativo (apps/admin — React + Vite + TypeScript)
# dentro do monorepo npm workspaces. Mesma lógica dos outros dois Dockerfiles
# do projeto (ver apps/site/Dockerfile e apps/api/Dockerfile): o build roda a
# partir da RAIZ do repositório, mas a imagem final não leva Node nem
# devDependencies — só o estático compilado pelo Vite, servido por Nginx.
#
# Diferente dos outros dois, aqui HÁ um estágio de compilação de verdade
# (geração de CSS + checagem de tipos + bundle), e o resultado depende de
# duas coisas fora de apps/admin que o contexto também precisa trazer:
#   1. tsconfig.base.json (raiz) — apps/admin/tsconfig.json faz `extends` dele.
#   2. VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json — fonte única
#      dos tokens de design; `npm run tokens:css` (primeiro passo do script
#      `build`) lê esse JSON e GERA apps/admin/src/styles/tokens.css antes do
#      `vite build` — sem o JSON no contexto, o build quebra na geração do CSS,
#      não no bundle.
#
# ⚠️ ARMADILHA Nº 1 DESTE DEPLOY — leia antes de mexer em qualquer variável:
# VITE_API_MODE e VITE_API_BASE_URL são ARG de BUILD, não variável de ambiente
# de execução. O Vite resolve `import.meta.env.VITE_*` e GRAVA o valor dentro
# do JavaScript já no momento do `vite build` — diferente do apps/api, onde a
# env var é lida em runtime. Trocar a variável de ambiente do contêiner DEPOIS
# de buildado não muda nada no artefato que já foi gerado; é preciso rebuildar
# a imagem com um novo `--build-arg`. Por isso os dois entram como `ARG` aqui
# e NÃO aparecem na aba "Variáveis de Ambiente" do serviço no Easypanel — vão
# na aba/campo "Argumentos de Build" (ver docs/deploy-easypanel.md).
#
# Se os dois build-args não forem passados (ou vier `VITE_API_MODE` diferente
# de "http"), `apps/admin/vite.config.ts` FALHA o build de propósito (guarda
# `fail-build-on-mock-api`, apontada pelo Órion): ela existe para nunca
# publicarmos o painel servindo dado fabricado sem ninguém notar.
# NÃO CONTORNE essa guarda — nem "só para testar o Dockerfile".
#
# No Easypanel, no serviço `vuumbora-admin`: método "Dockerfile",
# Caminho do Dockerfile = apps/admin/Dockerfile, Caminho de build/contexto =
# raiz do repositório, e os dois Argumentos de Build abaixo. Ver
# docs/deploy-easypanel.md.
# Local (rodar da raiz):
#   docker build -f apps/admin/Dockerfile \
#     --build-arg VITE_API_MODE=http \
#     --build-arg VITE_API_BASE_URL=https://api.vuumbora.com.br \
#     -t vuumbora-admin .

# ---------- Estágio 1: build (tokens -> CSS, TypeScript -> checagem, Vite -> dist/) ----------
FROM node:22-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/admin/package.json apps/admin/package.json

# `--ignore-scripts`, igual ao apps/api/Dockerfile: confirmado por simulação
# (sem Docker nesta máquina, ver handoff) que isso NÃO deixa nenhum binário
# nativo faltando. O Vite deste projeto usa Rolldown (Rust), não esbuild —
# o binário certo da plataforma (ex. lightningcss-linux-x64-musl, aqui) vem
# resolvido pelo próprio `npm ci` via `optionalDependencies`, sem precisar de
# script de pós-instalação. Verificado: `npm ci` com e sem --ignore-scripts
# produziram o mesmo `vite build` funcionando.
RUN npm ci --ignore-scripts

COPY tsconfig.base.json ./
COPY VuumBora_Claude_Design_System/tokens VuumBora_Claude_Design_System/tokens
COPY apps/admin apps/admin

# Valores gravados DENTRO do JavaScript na hora de compilar — por isso são
# argumento de build, e não variável de execução: trocar depois, no painel,
# não muda nada no arquivo já gerado.
#
# POR QUE TÊM VALOR PADRÃO DE PRODUÇÃO (20/11/2026)
# O primeiro build real no Easypanel passou apenas `--build-arg GIT_SHA=...`:
# o painel não entregou estes dois, `VITE_API_MODE` chegou vazio e a guarda
# do `vite.config.ts` abortou o build — corretamente, mas por uma causa que
# estava fora do repositório e que ninguém enxerga lendo o código.
#
# Depender de alguém preencher um campo certo, num painel, toda vez que
# criar o serviço, é o tipo de passo que falha calado meses depois. O
# endereço da API não é segredo (ele vai dentro do JavaScript que qualquer
# visitante baixa), então o padrão aqui é o de produção, e quem precisar de
# outro ambiente sobrescreve com `--build-arg`.
#
# A guarda continua valendo: ela existe para impedir publicar o painel em
# modo demonstração, e com este padrão isso deixa de depender de memória
# humana. Para construir em modo demonstração é preciso pedir, explicitamente.
ARG VITE_API_MODE=http
ARG VITE_API_BASE_URL=https://api.vuumbora.com.br
ENV VITE_API_MODE=$VITE_API_MODE
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build --workspace @vuumbora/admin

# ---------- Estágio 2: servir ----------
FROM nginx:1.27-alpine

COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf

# Só o dist/ gerado no estágio anterior — sem node_modules, sem código-fonte,
# sem o JSON de tokens (ele já foi consumido e virou CSS).
COPY --from=build /repo/apps/admin/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
