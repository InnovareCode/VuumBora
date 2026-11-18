---
name: bug_playwright_fullpage_sticky_fantasma
description: page.screenshot({fullPage:true}) pode desenhar um "fantasma" duplicado de um elemento position:sticky numa posição errada da página — confirmar com screenshot de viewport único antes de reportar como bug de layout.
metadata:
  type: feedback
---

**O que vi:** no screenshot `fullPage:true` de `apps/site` em 1440px, aparecia
um logo "VuumBora" pequeno e sozinho flutuando no meio do fundo escuro, entre
a seção de Segurança e a de FAQ — sem nenhum elemento ali no DOM que
explicasse isso.

**Como descartei que fosse bug real, sem deduzir:**
1. Contei elementos reais: `document.querySelectorAll('header').length === 1`
   e `img[alt="VuumBora"]` com `count === 2` (header + rodapé, os dois
   esperados). Nenhum nó fantasma no DOM.
2. Tirei um segundo screenshot, desta vez SEM `fullPage` — rolando a página
   até a seção certa com `scrollIntoView` e fotografando só o viewport. O
   "fantasma" não apareceu; o header (sticky, `position:sticky; top:0`)
   estava exatamente onde devia, uma vez só, grudado no topo.

**Conclusão:** é o mesmo tipo de causa já visto em
[[bug_chrome_screenshot_cli_viewport_mentiroso]] — o INSTRUMENTO de captura,
não o layout. `page.screenshot({fullPage:true})` do Playwright/Chromium pode
pintar um elemento `position:sticky` duas vezes durante a composição da
imagem alta (uma na posição "grudada" real, outra como resíduo da posição de
fluxo original) quando a página é mais alta que o viewport.

**Regra para a próxima vez:** se o `fullPage:true` mostrar algo estranho
perto de onde há `position:sticky`/`position:fixed` na página, não reportar
direto — tirar um screenshot de viewport único (sem `fullPage`), rolado até
o ponto suspeito (`scrollIntoView` + `screenshot()` normal), antes de
concluir que é bug de layout.
