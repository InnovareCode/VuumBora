---
name: nginx-cabecalhos-heranca-e-hsts
description: Cabeçalhos de segurança nos nginx do site e do admin (VuumBora) — a armadilha do add_header em location, por que a home do site passa por location de regex, e como o HSTS sobe em etapas atrás do Traefik.
metadata:
  type: project
---

**Regra:** nos dois `nginx.conf` (apps/admin e apps/site), TODO `add_header` de segurança fica no
nível do `server` e NENHUM `location` pode ter `add_header` (ele descarta os herdados). O que
precisaria de `add_header` num location vai para um `map` (Cache-Control) ou `default_type`
(Content-Type do `/healthz`).

**Why (descoberto em 21/11/2026, M-4 da Órion, rodada 3):** o site tinha `add_header` nos três
`location`. A home `/` é atendida por `index index.html`, que faz redirecionamento interno para
`/index.html`, e quem responde é o location de regex `\.(html|css|js)$` — então cabeçalhos no
`server` seriam descartados exatamente na resposta da página, sem erro nenhum. O admin já tinha
resolvido isso com `map $uri $admin_cache_control` (I-8 da rodada 2); o site ganhou o equivalente
(`$site_cache_control`). O `/healthz` do site usava `add_header Content-Type`: trocado por
`default_type`.

**How to apply:**
- Ao mexer em qualquer `location` desses arquivos, reler procurando `add_header`. `try_files $uri =404`
  no location de extensões mantém 404 de verdade para `.js`/`.css` ausente (sem ele o fallback
  de SPA serviria HTML com 200).
- HSTS: `max-age=300` sem `includeSubDomains` e sem `preload`. Sobe em etapas (300 -> 604800 ->
  31536000) trocando o número nos DOIS arquivos. `includeSubDomains` só no domínio raiz importa; o
  nginx do site pode responder no apex e não sabe o Host. Desfazer = publicar `max-age=0`.
  Um só emissor: conferir com `curl -sI` que `strict-transport-security` aparece UMA vez (Traefik
  ou Cloudflare também mandando duplica; o navegador usa só a primeira).
- Site sem CSP por decisão: `index.html` tem vários `style="..."` inline (partículas) e usa Google
  Fonts; CSP exige medição no navegador (skill medir-antes-de-afirmar). Quando entrar, leva
  `frame-ancestors 'none'`. Site usa `Referrer-Policy: strict-origin-when-cross-origin` (tem links
  para wa.me/instagram); admin usa `no-referrer`.
- Sem nginx nesta máquina: a sintaxe NÃO foi validada com `nginx -t`; só releitura. Rodar
  `nginx -t` (ou `docker run --rm -v ...:/etc/nginx/conf.d/default.conf nginx:1.27-alpine nginx -t`)
  quando houver Docker.
- Os arquivos do repo estão em CRLF (já estavam no HEAD; `.gitattributes` manda LF). Edição
  mantém CRLF consistente; nginx trata CR como espaço.
- `/healthz` da API tem `rateLimit: false`: teste de enchente contra ele só mostra 429 se vier da
  borda (Traefik/Cloudflare). Nunca testar limite contra `/v1/auth/login`.
