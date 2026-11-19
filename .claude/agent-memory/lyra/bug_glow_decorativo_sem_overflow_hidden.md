---
name: bug_glow_decorativo_sem_overflow_hidden
description: Um div decorativo de "brilho" (glow) com inset negativo (sangra para fora da própria caixa de propósito) cria overflow HORIZONTAL REAL da página em telas estreitas se o contêiner pai não tiver overflow:hidden — medido com Playwright (document.documentElement.scrollWidth > clientWidth), não é falso positivo.
metadata:
  type: feedback
---

Na `HeroScene` da página de pré-lançamento (19/11/2026), um `.glow` com
`position:absolute; inset:-10%` (desbota um radial-gradient além da borda do
cartão de propósito, não corte reto) ficava dentro de um `.scene` só com
`position:relative`, sem `overflow:hidden`. Em 320/390px o `.scene` já
ocupava quase a largura inteira da tela, então os 10% de sangria de cada
lado empurravam `document.documentElement.scrollWidth` para além de
`clientWidth` — overflow horizontal **real** da página (confirmei comparando
os dois valores direto, não só `getBoundingClientRect` de elemento solto, ver
[[feedback_checar_overflow_por_elemento]]), não mascarado por nenhum
`overflow:hidden` ancestral.

**Correção:** `overflow:hidden` no contêiner mais próximo que faz sentido
(aqui, `.scene`) — o brilho continua desbotando visualmente do mesmo jeito,
só não extrapola mais a caixa real.

**Regra geral:** todo elemento decorativo com `inset` negativo (glow, halo,
sombra estourada) PRECISA de um ancestral com `overflow:hidden` definido no
mesmo componente, não deixar para a página inteira descobrir sozinha. Medir
com `document.documentElement.scrollWidth > clientWidth` nos breakpoints
estreitos antes de dar por certo — este é o tipo de overflow que só aparece
≤390px e passa despercebido testando só em 1280/1920.
