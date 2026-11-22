---
name: bug_rnweb_backhandler_console_error
description: BackHandler.addEventListener no react-native-web faz console.error("BackHandler is not supported on web") e o Expo mostra o #error-toast, que cobre a tela e intercepta cliques — causa raiz do toque que "não acontece" no Playwright.
metadata:
  type: bug
---

**Sintoma:** no roteiro do reaceite um clique no tab bar da Home dava timeout com `<div id="error-toast"> intercepts pointer events`, mas só DEPOIS de abrir a
subtela do texto (o mesmo clique funcionava num fluxo mais curto).

**Causa raiz:** `useEffect` com `BackHandler.addEventListener('hardwareBackPress', ...)` rodando no web. O RNW registra `console.error` e o Expo dev
mostra o toast de erro por cima da UI. Nada quebrava de fato na tela — o toast é que atrapalhava.

**Correção/como evitar:** proteger com `Platform.OS === 'android'` antes de registrar (o hardware back só existe lá). E em todo roteiro de prova, tratar QUALQUER
`console.error` como falha (`page.errors.length === 0`), não só `pageerror` — foi o filtro por `pageerror` que deixou isto passar no 1º run.
`#error-toast` interceptando clique = há um console.error no app, vá achá-lo (`page.on('console')` em `warning`/`error`).
