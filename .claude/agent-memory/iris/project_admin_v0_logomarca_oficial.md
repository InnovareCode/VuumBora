---
name: project-admin-v0-logomarca-oficial
description: Troca do texto "VuumBora Admin" pela imagem oficial do logo (480x118) em 20/11/2026, nos 3 lugares do apps/admin — testada em 1280/375 e densidade 2x
metadata:
  type: project
---

Commit de referência: working tree em cima de `1516d4a`, arquivos novos
`apps/admin/src/components/BrandLogo.tsx` e `src/assets/brand/logo-vuumbora.png`
(480×118, cópia da mesma imagem que `apps/site` serve), consumidos por
`AuthSplitLayout.tsx` (lado escuro do login + cabeçalho compacto mobile) e
`AppShell.tsx` (sidebar da casca autenticada).

**Testado:** nos 3 lugares, 1280 e 375, `deviceScaleFactor` 1 e 2 — sem
nenhum resquício de texto "VuumBora Admin" visível (`body.innerText` sem a
string). `alt="VuumBora"` (não "VuumBora Admin") nas 3 imagens — correto,
porque a imagem substitui a palavra, não o produto.

**Nitidez em 2x, medida de verdade (não só visual):** comparei
`naturalWidth` (480, fixo) contra o `renderedWidth` real em CSS px de cada
instância, multiplicado pelo `deviceScaleFactor`:
- Sidebar: ~130px CSS → ~260px efetivos em 2x (headroom até ~3.7x).
- Login lado escuro: ~163px CSS → ~325px efetivos em 2x (headroom até ~2.95x).
- Login mobile (cabeçalho compacto): ~195px CSS → ~390px efetivos em 2x
  (headroom até ~2.46x).
Nos 3 casos o nativo (480px) sempre cobre a densidade 2x sem upscaling —
é a diferença entre "a Lyra verificou por folga de resolução" (olhar e achar
que tá bom) e medir a razão naturalWidth/renderedWidth de propósito.

**Resquício fora de escopo, não é defeito:** `apps/admin/index.html` ainda
tem `<title>VuumBora Admin</title>` — é o título da aba do navegador
(metadado, não UI visível substituída pela imagem), correto ter texto ali
por acessibilidade. Não reprovei por isso, só registrei.

Ver [[project-admin-v0-login-premium-oraculo-ok]] e
[[project-admin-v0-ambiente-de-teste]].
