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

# ---------- Estágio 1: preparar o que vai ao ar ----------
# Não compila a página: ela já está pronta. Faz duas coisas sobre uma
# CÓPIA dela, para o repositório continuar limpo:
#
#   1. Escreve o version.js com a versão do package.json e a data de hoje,
#      para o rodapé mostrar a data real da imagem no ar.
#   2. Carimba os links de CSS e JS com o hash do próprio conteúdo.
#      Sem isso, uma correção publicada pode levar até 4 horas para
#      aparecer: a Cloudflare sobrescreve o `max-age=300` do nginx por
#      `max-age=14400` nos arquivos estáticos. Medido em 20/11/2026, com
#      uma correção de CSS presa no cache enquanto o servidor já servia a
#      nova. Ver scripts/carimbar-assets.mjs.
FROM node:22-alpine AS preparar
WORKDIR /gen
COPY package.json ./
COPY scripts/gerar-versao.mjs ./scripts/gerar-versao.mjs
COPY scripts/carimbar-assets.mjs ./scripts/carimbar-assets.mjs
COPY apps/site/public ./public
RUN node scripts/gerar-versao.mjs --stdout > public/assets/js/version.js \
 && node scripts/carimbar-assets.mjs public

# ---------- Estágio 2: servir ----------
FROM nginx:1.27-alpine

COPY apps/site/nginx.conf /etc/nginx/conf.d/default.conf

# Só o conteúdo de public/. A pasta `revisao/`, com os PNG originais de
# vários megabytes, fica de fora por estar no .gitignore e por não ser
# copiada aqui: material de revisão nunca entra na imagem.
# A cópia já preparada no estágio anterior: com o version.js deste build e
# os links de CSS/JS carimbados. A pasta `revisao/`, com os PNG originais
# de vários megabytes, não entra: está no .gitignore e não é copiada.
COPY --from=preparar /gen/public/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
