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

FROM nginx:1.27-alpine

COPY site-cine/nginx.conf /etc/nginx/conf.d/default.conf

# Só o conteúdo de public/. A pasta `revisao/`, com os PNG originais de
# vários megabytes, fica de fora por estar no .gitignore e por não ser
# copiada aqui: material de revisão nunca entra na imagem.
COPY site-cine/public/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
