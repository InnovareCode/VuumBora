# Página de pré-lançamento do VuumBora, versão cinematográfica.
#
# Diferente do Dockerfile de apps/site, aqui NÃO existe estágio de build:
# a página é HTML, CSS e JavaScript puro, sem framework, sem npm e sem passo
# de compilação. O que está em `public/` é exatamente o que vai ao ar.
#
# Isso é o que torna a publicação barata e o rollback imediato: nada pode
# falhar entre o repositório e o servidor, porque não há nada sendo gerado.
#
# Contexto de build = RAIZ do monorepo, igual ao outro Dockerfile, para os
# dois serviços do Easypanel apontarem para o mesmo lugar e só trocarem o
# "Dockerfile Path". Localmente:
#   docker build -f site-cine/Dockerfile -t vuumbora-cine .   (rodar da raiz)

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

COPY site-cine/nginx.conf /etc/nginx/conf.d/default.conf

# Só o conteúdo de public/. A pasta `revisao/`, com os PNG originais de
# vários megabytes, fica de fora por estar no .gitignore e por não ser
# copiada aqui: material de revisão nunca entra na imagem.
COPY site-cine/public/ /usr/share/nginx/html/

# Depois do public/, de propósito: sobrescreve o version.js versionado no
# git (que existe para o desenvolvimento local) pelo gerado neste build.
COPY --from=versao /gen/version.js /usr/share/nginx/html/assets/js/version.js

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
