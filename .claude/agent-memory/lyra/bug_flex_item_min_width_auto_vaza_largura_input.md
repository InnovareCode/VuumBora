---
name: bug_flex_item_min_width_auto_vaza_largura_input
description: Input/select sem width:100% explícito vaza sua largura mínima intrínseca (~20ch da UA) pela cadeia flex/grid acima e estoura qualquer flex-basis/width do ancestral, mesmo com flex-grow:0 — "o pai tem flex:0 0 380px" não é prova de que o filho mede 380px. Use ao montar card/coluna com flex-basis fixo contendo campos de formulário.
metadata:
  type: bug
---

**Sintoma:** `.hero-card` (cartão de candidatura, site-cine) tinha
`flex: 0 0 380px` dentro de um `.hero-grid` flex-row, mas media **532px**
reais (`getBoundingClientRect`), mesmo com `flex-grow:0` e `flex-shrink:0`.

**Causa raiz:** nenhum `<input>`/`<select>` tinha `width` explícito. O
`.field` (flex column) já fazia eles ESTICAREM pro próprio width do `.field`
via `align-items:stretch` padrão — isso iludia a leitura do código, porque
visualmente pareciam ocupar 100% do campo. O problema é outro: cada campo de
formulário tem uma largura intrínseca (`min-content`) default da UA (o
`size=20` do input de texto ≈ 170-220px). Flexbox tem "automatic minimum
size": por padrão, `min-width` de um item flex é `auto`, que resolve para o
`min-content size` do conteúdo — e isso vale INDEPENDENTE de `flex-grow`/
`flex-shrink`. Com um `.form-row` de 2 colunas (grid) dentro do card, dois
inputs lado a lado pediam ~220px cada de mínimo, e esse mínimo propagava pela
cadeia grid→flex column→flex item (`.hero-card`), ignorando o
`flex-basis:380px` combinado com `flex-shrink:0` (que só impede ENCOLHER
abaixo do basis, não impede o automatic-minimum-size forçar o item a ficar
MAIOR que o basis quando o conteúdo não cabe).

**Correção:** dar `width:100%; min-width:0;` explícito em TODO
`<input>`/`<select>` dentro de `.field` — isso derruba o `min-content` que
estava vazando, em vez de empilhar `min-width:0` em cada ancestral da cadeia
(mais frágil, fácil esquecer um nível). Ver
[[bug_touch_target_hitslop_insuficiente]] — mesma família de lição: "o pai
tem o valor certo no CSS" não é prova do que o FILHO real mede.

**Como detectar:** sempre que um flex/grid item tiver `flex-basis`/`width`
fixo e CONTIVER controles de formulário, medir `getBoundingClientRect` do
item real no navegador — nunca confiar que `flex-shrink:0` more `flex-grow:0`
bastam para travar a largura.
