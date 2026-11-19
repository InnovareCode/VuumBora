---
name: bug_opacity_botao_dilui_contraste_texto
description: "`opacity` aplicado no elemento inteiro do botão (pra sinalizar \"desabilitado\") dilui o contraste do TEXTO dentro dele junto com a borda — a cor nominal do token passa no cálculo CSS-vs-fundo, mas o pixel renderizado real (depois da opacidade compor com o fundo) pode cair abaixo de 4,5:1. Use ao estilizar qualquer controle desabilitado/esmaecido com opacity, e ao medir contraste de texto dentro de um ancestral com opacity<1."
metadata:
  type: bug
---

**Sintoma:** botão "Google Play" desabilitado (`AppDownloadBlock`) com
`.storeButton { opacity: 0.55; color: var(--color-text-secondary); }` —
calculando contraste pela cor NOMINAL do token (`getComputedStyle(el).color`)
contra o fundo, dava >6:1 (parecia ok). Medindo o PIXEL REAL renderizado
(screenshot + amostra), a legenda pequena dentro do botão saía em 3,95:1 —
reprova WCAG AA (4,5:1 pra texto normal).

**Causa raiz:** `opacity` no elemento-pai comprime (faz blend com o fundo)
TUDO que está dentro, inclusive texto — `getComputedStyle(x).color` devolve
a cor declarada em CSS, não o pixel final depois da composição de opacidade.
Então "calcular contraste a partir da cor computada" dá um número otimista
demais sempre que algum ancestral tem `opacity<1` (ou `color-mix`/filtro
equivalente) — só o pixel renderizado conta a história real.

**Correção:** não usar `opacity` no CONTAINER inteiro do botão para
sinalizar estado desabilitado quando há texto pequeno dentro. Em vez disso:
- Deixe o TEXTO na cor cheia do token (já pensada pra passar contraste).
- Sinalize "desabilitado"/"secundário" por outros canais que não dependem
  de diluir o texto: borda mais discreta (`--color-border-subtle` em vez de
  `--color-border-emphasis`), ausência da cor/gradiente de marca que os
  CTAs de verdade usam, `cursor:not-allowed`, e (o que realmente importa
  pra quem não vê cor) o atributo `disabled` nativo + `aria-describedby`
  apontando pro motivo em texto sempre visível.
- Se precisar esmaecer ALGO visualmente, aplique a opacidade num elemento
  MENOR e puramente decorativo (ex.: só o ícone SVG), nunca no wrapper que
  também contém o texto.

**Como pegar isso cedo:** sempre medir contraste pelo PIXEL do screenshot
(receita de [[feedback_medir_site_sem_browser_tool]]), nunca só pela cor
computada do CSS, toda vez que o elemento de texto tiver um ancestral com
`opacity`, `filter`, ou mix-blend-mode — a cor computada mente nesses casos.

Ver [[project_site_nextjs_static_export]].
