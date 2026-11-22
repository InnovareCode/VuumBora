---
name: feedback_expo_router_notfound_sitemap_e_cache_do_manifesto
description: Expo Router 58 no web — como trocar o "Unmatched Route" em inglês por +not-found em português, como desligar /_sitemap (opção do plugin, que só vale com --clear porque o manifesto é inlinado no bundle e fica no cache do Metro) e como provar no export de produção.
metadata:
  type: feedback
---

**Achado F8 (Íris S1 passada 3, corrigido 22/11/2026):** no export web de produção do passageiro, URL inexistente mostrava "Unmatched Route /
Page could not be found / Go back / Sitemap" (inglês, e a URL do navegador na tela) e `/_sitemap` abria "System Information" com a lista de
TODAS as rotas, "Expo SDK 58.0.0" e a origem do app.

**Correção:** (1) `apps/passenger/app/+not-found.tsx` (rota do Expo Router: substitui o `Unmatched` padrão; texto nosso, `accessibilityRole="header"`,
botão `router.replace('/')` — `/` é a Home com sessão e a guarda manda às boas-vindas sem sessão, então o botão não precisa saber da sessão).
(2) `['expo-router', { sitemap: false }]` em `app.config.ts` (a opção existe no `plugin/src/withRouter.ts`; copia as props para `extra.router`,
que `useStore.js`/`utils.js` leem em runtime via `Constants.expoConfig.extra.router`).

**ARMADILHA que enganou a primeira prova:** mudei o `app.config.ts` e o export seguinte AINDA abria `/_sitemap`. O manifesto vai INLINADO no
bundle (`expo-constants` → `get manifest(){...}`) e o Metro o guarda no cache de transformação: a prop nova só aparece com
`expo export --clear` (e `expo start --clear`). Conferir no bundle: `grep -o 'extra\\":{[^}]*}[^}]*}' _expo/static/js/web/entry-*.js` deve mostrar
`"router":{"sitemap":false,...}`. Mesma família de "Cache do Metro não trouxe as telas de volta ao trocar de perfil sem --clear"
([[feedback_telas_de_dev_fora_do_build_por_metro_blocklist]]). Em CI (checkout limpo, sem cache) não acontece.

**Como provar:** `VUUMBORA_ALLOW_MOCK_IDENTITY_IN_PRODUCTION=1 CI=1 node ../../node_modules/expo/bin/cli export --platform web --clear
--output-dir <scratch>` (production com identidade mock aborta sem o escape; ver a memória acima) + servidor estático com fallback de SPA
(arquivo existente = ele; extensão inexistente = 404; resto = index.html — `scratchpad/iris3/e2e/spa-server.mjs` serviu). Verificar em `/rota-qualquer`,
`/_sitemap`, `/(auth)` e `/catalogo` (rota de dev, ausente em produção): "Página não encontrada", sem "Unmatched Route"/"Sitemap"/"System
Information"/"Expo SDK", sem link para `/_sitemap`, botão >= 44, vai às boas-vindas, sem rolagem horizontal a 320, `justifyContent:'center'`
com `flexGrow:1` (não `flex:1`) para não cortar o topo em viewport curto (320x360 medido). **Controle negativo:** exportar de novo SEM o arquivo e
SEM a opção (`--clear`) → "Unmatched Route", link "Sitemap", `/_sitemap` com "Expo SDK 58.0.0" e a página padrão ainda estoura 339 px a 320.

Relacionado: [[bug_stack_protected_sem_redirectto_vira_unmatched_route]].
