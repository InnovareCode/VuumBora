---
name: bug_nginx_add_header_location_zera_heranca
description: No nginx, um add_header dentro de um location SUBSTITUI todos os add_header herdados do server — cabeçalhos de segurança (CSP) somem justo do index.html/assets que tinham Cache-Control próprio.
metadata:
  type: feedback
---

**Causa raiz:** regra de herança do nginx — `add_header` só herda do nível acima se o nível atual
NÃO tiver nenhum. O `nginx.conf` do admin tinha `add_header Cache-Control` em `location = /index.html`
e `/assets/` e `add_header Content-Type` em `/healthz`; colocar a CSP só no `server` a deixaria fora do
index.html (a resposta que mais importa).

**Correção que ficou:** TODOS os `add_header` no nível do `server`; o Cache-Control por caminho virou
um `map $uri $admin_cache_control` no topo do arquivo (valor vazio = cabeçalho não é enviado) e o
`/healthz` usa `default_type text/plain`. Comentário no arquivo proíbe `add_header` em `location`.
CSP montada com `set $csp "${csp}…"` só para comentar cada diretiva (string multilinha dá header inválido).
Confirmado com nginx real: index no-cache, asset immutable, healthz sem cache, os 5 cabeçalhos em todas.

**Como evitar:** ao pedir cabeçalho de segurança num nginx que já tem `add_header` em location, testar
com `curl -I` em TODAS as rotas (/, rota SPA, asset com hash, healthz), não só em `/`.
Relacionado: [[project_admin_email_stepup_csp_ui]].
