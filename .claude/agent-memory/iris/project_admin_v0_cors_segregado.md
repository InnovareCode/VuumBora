---
name: project-admin-v0-cors-segregado
description: Correção do Órion/Vega para o CORS global com credentials:true vazando pro site público — testada com navegador real (não só curl) em 20/11/2026
metadata:
  type: project
---

Commit de referência: working tree em cima de `1516d4a`, `apps/api/src/app.ts`
com dois registros `@fastify/cors` separados (contexto público sem prefixo,
`credentials:false`, `ALLOWED_ORIGINS`; contexto `/v1/admin/*` com
`prefix:'/v1/admin'`, `credentials:true`, `ADMIN_ALLOWED_ORIGINS` nova) e
`env.ts` com a variável nova obrigatória.

**Boot:** confirmado que a API sobe limpa com as duas variáveis preenchidas
— o perigo real aqui (`FST_ERR_DUPLICATED_ROUTE` por dois registros de CORS
sem prefixo tentando criar a mesma rota `OPTIONS *`) só aparece RODANDO,
nunca no `tsc --noEmit`. `npm run check` da raiz (typecheck de todos os
workspaces) também rodei de novo, exit 0 — não só confiei no que o Atlas
reportou.

**Achado curioso no curl, resolvido com navegador real:** testando só por
curl, a resposta para a origem do SITE em `/v1/admin/me` vinha SEM
`Access-Control-Allow-Origin` (correto) mas AINDA com
`Access-Control-Allow-Credentials: true` (comportamento do próprio
`@fastify/cors`: esse header é posto incondicionalmente quando
`credentials:true` é passado como booleano estático, independente do
`origin` ter batido). Isso pareceria reprovação lendo só o header — mas
curl não aplica CORS, só mostra os headers brutos. **O que importa é se o
NAVEGADOR deixa o JS ler a resposta**, e isso depende só do
`Access-Control-Allow-Origin` bater (ausente aqui = bloqueado), não do
`Allow-Credentials` sozinho.

**Prova decisiva, Playwright com navegador real (Chromium), não curl:**
logado de verdade no painel (`localhost:4310`, cookie de sessão setado sem
`Domain` — por isso escopado ao host "localhost", poroso entre portas, igual
ao cenário real de subdomínios-irmãos), abri uma aba separada em
`localhost:4300` (site público de verdade, `apps/site`, não um mock) e rodei
`fetch('.../v1/admin/me', {credentials:'include'})` de dentro dela: **`
TypeError: Failed to fetch`** — o navegador bloqueou antes mesmo de entregar
qualquer corpo pro JS. `csrfToken` não vazou. Mutação (`/approve`) disparada
do site, mesma coisa: bloqueada no preflight. Rota pública
(`POST /v1/driver-applications`) disparada da MESMA aba do site: 200,
funcionando normal, sem credenciais.

**Nota pro Órion (não bloqueante):** o header `Access-Control-Allow-Credentials: true` solto (sem `Allow-Origin` junto) pra origem não-permitida é um cheiro de CORS que vale around — não é explorável aqui (testado com navegador real), mas um scanner de segurança vai acusar, e defesa em profundidade preferiria o plugin nem mandar esse header quando a origem não bate. Não reprovei por causa disso.

Ver [[project-admin-v0-aprovar-recusar-revalidado]] (API/UI da mesma fatia,
testada antes desta correção de CORS entrar).
