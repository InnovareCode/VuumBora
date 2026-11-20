# O site público do VuumBora.
#
# Até 20/11/2026 este caminho servia um site em Next.js, e a página
# cinematográfica vivia em paralelo, em `site-cine/`. Dois sites no mesmo
# repositório significavam duas respostas para "qual é o site?", e o painel
# apontando para um enquanto o trabalho acontecia no outro — foi exatamente
# o que travou a publicação daquele dia. Agora existe um só, aqui.
#
# NÃO há estágio de compilação da página: ela é HTML, CSS e JavaScript
# puros, sem framework e sem bundler. O que está em `public/` é exatamente
# o que vai ao ar. É isso que torna a publicação barata e o rollback
# imediato: nada pode falhar entre o repositório e o servidor, porque nada
# é gerado no caminho. O único estágio de build existe para carimbar a
# versão no rodapé, e ele não toca na página.
#
# Contexto de build = RAIZ do monorepo (o estágio da versão precisa do
# package.json da raiz). Localmente:
#   docker build -f apps/site/Dockerfile -t vuumbora-site .   (rodar da raiz)

# ---------- Estágio 1: a versão que vai ao ar ----------
# O único passo "de build" desta página, e ele não compila nada: lê o
# `version` do package.json da raiz e escreve o version.js com ele mais a
# data de HOJE. Assim o rodapé mostra a data real da imagem no ar, em vez
# da data em que alguém lembrou de editar um arquivo à mão.
FROM node:22-alpine AS versao
WORKDIR /gen
COPY package.json ./
COPY scripts/gerar-versao.mjs ./scripts/gerar-versao.mjs
RUN node scripts/gerar-versao.mjs --stdout > version.js

# ---------- Estágio 2: servir ----------
FROM nginx:1.27-alpine

COPY apps/site/nginx.conf /etc/nginx/conf.d/default.conf

# Só o conteúdo de public/. A pasta `revisao/`, com os PNG originais de
# vários megabytes, fica de fora por estar no .gitignore e por não ser
# copiada aqui: material de revisão nunca entra na imagem.
COPY apps/site/public/ /usr/share/nginx/html/

# Depois do public/, de propósito: sobrescreve o version.js versionado no
# git (que existe para o desenvolvimento local) pelo gerado neste build.
COPY --from=versao /gen/version.js /usr/share/nginx/html/assets/js/version.js

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
