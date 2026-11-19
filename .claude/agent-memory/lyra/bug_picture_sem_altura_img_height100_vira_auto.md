---
name: bug_picture_sem_altura_img_height100_vira_auto
description: "`<picture>{display:block}` sem altura própria faz `img{height:100%}` dentro dele virar 'auto' (CSS2.1 10.5), e a imagem cai pra proporção intrínseca (ex. 1920x1080) em vez de preencher o container absoluto por fora. Use sempre que uma foto full-bleed dentro de `<picture>` aparecer cortada/pequena mesmo com `object-fit:cover` e o pai em `position:absolute;inset:0`."
metadata:
  type: bug
---

**Sintoma:** no site estático do VuumBora (`site-cine/public`), a foto de
cada faixa da jornada (`.faixa__media > picture > img`, `object-fit:cover`,
`width/height:100%`) preenchia certinho no modo cinematográfico (sticky
stage, 1440px), mas no modo empilhado (mobile/`prefers-reduced-motion`,
390px) a imagem aparecia só como uma faixa de ~220px no topo, com um vão
escuro enorme embaixo antes do texto. Medido via
`getBoundingClientRect()` do `<img>`: altura real = 217,75px =
exatamente `390 × (1080/1920)` — a proporção INTRÍNSECA da imagem, como
se `height:100%` não estivesse aplicando.

**Causa raiz:** `.faixa__media{position:absolute;inset:0}` tem altura
definida (herda do ancestral posicionado). Mas entre ele e o `<img>` existe
o `<picture>`, e eu só tinha dado `display:block` a ele (no reset genérico
`img,picture{display:block}`) — sem `height` própria. Por CSS2.1 §10.5: a
porcentagem de `height` de um filho só resolve contra a altura do
container se essa altura foi **especificada explicitamente**; se o
container tem altura "auto"/dependente do conteúdo (o caso do `<picture>`
sem `height` no CSS, mesmo sendo `display:block` e mesmo o AVÔ tendo
altura definida), o `height:100%` do filho vira `auto` — e um `<img>`
substituído com `width:100%;height:auto` desenha pela proporção
intrínseca. Funcionava no modo cinematográfico só porque lá `.faixa`
TAMBÉM é `position:absolute;inset:0` (altura definida por herança
direta), mascarando o sintoma; no modo empilhado, `.faixa` é
`position:relative;min-height:100svh` (altura por conteúdo também, mas
alta o bastante pra não cortar) e foi aí que a cadeia quebrou visualmente
de um jeito óbvio.

**Correção:** dar altura EXPLÍCITA ao `<picture>` também, não só ao avô:
```css
.faixa__media picture { display:block; width:100%; height:100%; }
.faixa__media img { width:100%; height:100%; object-fit:cover; }
```
Com isso a cadeia de "altura explícita" não quebra em nenhum nó entre o
container posicionado e o `<img>`.

**Lição geral:** toda vez que `<picture>` entrar no meio de uma cadeia
`position:absolute;inset:0` → `img{height:100%}`, dar altura (100%)
explícita ao próprio `<picture>` também — ele não herda "virtualmente" a
altura do avô só por estar em display:block dentro de um container de
altura definida; a regra do CSS2.1 olha se a altura do PAI IMEDIATO foi
especificada, não se algum ancestral mais acima tem.

**Como achei isso (medir, não deduzir):** comparei
`getBoundingClientRect()` do `<img>` nos dois modos (cinematográfico vs.
empilhado) com Playwright; a altura empilhada batendo EXATAMENTE com a
razão de aspecto intrínseca da imagem (390×1080/1920=217,75) foi a pista
que fechou a causa — não "parece que o CSS tá errado", é a conta batendo.

Ver [[project_site_cine_pagina_estatica]].
