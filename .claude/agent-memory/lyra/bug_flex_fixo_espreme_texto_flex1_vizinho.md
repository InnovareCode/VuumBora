---
name: bug_flex_fixo_espreme_texto_flex1_vizinho
description: Por que um Text com flex:1 pode encolher a quase 0px (texto cortado para 1 letra) quando um irmão de largura fixa divide a mesma linha flex — achado real na grade 2x2 do QuickAccessGrid (direção de arte, 18/11/2026).
metadata:
  type: feedback
---

**Causa raiz:** em React Native (diferente da web), um item com `flex: 1`
(`flexGrow:1, flexShrink:1, flexBasis:0%`) pode encolher **abaixo do tamanho do
seu próprio conteúdo** porque não há `minWidth`/conteúdo mínimo implícito. Num
container `flexDirection:'row'` com 3 filhos — ícone (tamanho fixo), bloco de
texto (`flex:1`) e um badge de largura fixa com `marginLeft:'auto'` — o badge
"ganha" o espaço que sobra, e o bloco de texto (`flex:1`, sem conteúdo mínimo
imposto) é espremido para ~4-12px. O resultado visual: `numberOfLines={1}`
corta "Agendar" para "A." e "Escolha data e hora" para "E..".

**Como foi achado:** não foi visto lendo o código — o JSX parecia razoável.
Foi a medição real no navegador (Playwright, 320pt) que capturou
`clientWidth: 12` num nó-folha de texto, confirmado depois pelo screenshot. Ver
skill `medir-antes-de-afirmar`.

**Correção:** nunca colocar um elemento de largura fixa (badge, selo, ícone)
como IRMÃO de um bloco `flex:1` que contém o texto principal quando os dois
dividem a mesma linha com pouco espaço. Em vez disso, colocar o elemento de
largura fixa DENTRO do bloco de texto, como linha extra empilhada
(`alignSelf:'flex-start'`, sem `marginLeft:'auto'`) — ele some da disputa
horizontal porque passa a ocupar sua própria linha vertical.

**Como aplicar:** sempre que um card estreito (<150pt) combinar ícone + texto
variável + selo/badge na mesma `flexDirection:'row'`, ou (a) dar `minWidth` ao
bloco de texto compatível com o texto mais longo esperado, ou (b) empilhar o
elemento extra em vez de colocá-lo ao lado. Visto em
`apps/passenger/src/components/home/QuickAccessGrid.tsx` (modo "narrow",
grade 2×2 abaixo de 375pt — ver [[project_vuumbora_overview]]).
