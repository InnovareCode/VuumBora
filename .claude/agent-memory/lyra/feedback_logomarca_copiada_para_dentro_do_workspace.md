---
name: feedback_logomarca_copiada_para_dentro_do_workspace
description: Asset de marca usado por um app com Dockerfile próprio (apps/admin) tem que ser copiado PARA DENTRO do workspace do app, nunca referenciado de outro diretório do monorepo — mesmo que o arquivo já exista em apps/site/public.
metadata:
  type: feedback
---

**Contexto:** o dono pediu para trocar "VuumBora Admin" escrito em texto pela
logomarca oficial na tela de login e na `AppShell` do `apps/admin`
(20/11/2026). A fonte certa era `apps/site/public/assets/img/logo-vuumbora.png`
(34 KB, 480×118, já recortado/otimizado — o site serve esse arquivo em
produção hoje). A referência bruta em
`VuumBora_Claude_Design_System/referencias/logo_aprovada.png` (2,2 MB) NÃO
deve ir para uma tela: é material de conferência, não asset de produto.

**Por que não dá para só importar o caminho do outro workspace:**
`apps/admin/Dockerfile` só copia `apps/admin` e
`VuumBora_Claude_Design_System/tokens` para o contexto de build (ver o
próprio arquivo, seção de comentários no topo). Um `import` apontando para
`apps/site/public/...` funciona perfeitamente no dev server local (que lê o
monorepo inteiro do disco) e quebra SÓ no build do Docker — exatamente o tipo
de erro que não aparece na própria máquina, só no servidor.

**Correção aplicada:** copiar o PNG para dentro de
`apps/admin/src/assets/brand/logo-vuumbora.png` e importar normalmente
(`import logoVuumbora from '../assets/brand/logo-vuumbora.png'` — o Vite
resolve, otimiza e gera hash do asset no build). Como o arquivo já nasce
DENTRO de `apps/admin`, nenhuma linha nova de `COPY` nem ajuste de
`.dockerignore` foi necessário — a cópia já é coberta pela linha existente
`COPY apps/admin apps/admin`. Componente resultante:
`apps/admin/src/components/BrandLogo.tsx` (comentário no arquivo explica a
origem e que o site continua sendo a fonte — se o logo mudar lá, repetir a
cópia aqui).

**Como verificar que ficou dentro do contexto de build (sem precisar de
Docker nesta máquina):**
1. `npm run check:docker-context` (raiz) — cruza os `COPY` do Dockerfile
   contra o `.dockerignore`; já existia, cobre exatamente essa classe de erro
   (ver guarda em `scripts/check-docker-context.mjs`, criada em 19/11/2026
   por uma falha real de deploy do site).
2. `npm run build --workspace @vuumbora/admin` local (fora do Docker) e
   conferir o PNG aparecendo em `dist/assets/` na saída do Vite — prova que o
   asset entra no bundle de produção de verdade, não só no dev server.

**Como aplicar de novo:** qualquer asset de marca/mídia usado por um app que
tem Dockerfile próprio neste monorepo (`apps/admin`, `apps/api`, `apps/site`)
tem que morar FISICAMENTE dentro da pasta daquele app — nunca um import
cruzando para outro workspace só porque "o arquivo já existe lá". Antes de
declarar pronto, rodar `check:docker-context` e, se possível, um build local
do workspace alterado.

Ver [[project_apps_admin_shell_moda_shop]] (onde a `AppShell`/`LoginPage`
vivem) e [[feedback_painel_dark_only_sem_tom_claro_geral]] (mesma tela de
login, outra armadilha de direção de arte).
