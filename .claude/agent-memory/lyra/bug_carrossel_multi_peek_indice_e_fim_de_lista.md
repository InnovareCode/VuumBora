---
name: bug_carrossel_multi_peek_indice_e_fim_de_lista
description: Dois bugs do mesmo carrossel "várias cartas visíveis ao mesmo tempo" (peek) com scroll-snap — (1) IntersectionObserver com limiar fixo é ambíguo para decidir "qual é o índice atual" quando 2-3+ cards cruzam o limiar junto; (2) o último card nunca alcança scroll-snap-align:start quando sobra menos conteúdo à frente dele do que a largura visível, travando o scroll antes do alvo. Use sempre que montar carrossel de scroll-snap que mostra mais de 1 item por vez.
metadata:
  type: bug
---

**Contexto:** carrossel de 5 artes do site-cine (`.carousel__track`,
scroll-snap-x mandatory, ~3,2 cards visíveis por vez em telas largas).

**Bug 1 — índice "atual" por IntersectionObserver é loteria com peek:**
usar `IntersectionObserver({threshold:[0.6]})` por slide, e marcar
"ativo" o primeiro que cruzar 0,6, funciona bem em carrossel "um por vez"
(full-bleed). Com 3+ cards simultaneamente ≥60% visíveis, VÁRIOS entries
disparam na mesma leva e qual vence depende da ordem de entrada do array —
medido: clicar na bolinha 4 assentava às vezes na bolinha 5.
**Correção:** abandonar o observer para decidir o índice. Medir a posição
de cada slide uma vez (`getBoundingClientRect` relativo ao track, não
`offsetLeft` — contexto de posicionamento do pai pode não ser o `track`) e
guardar num array `slideLefts`. Navegação PROGRAMÁTICA (clique em seta/
bolinha/autoplay) seta o índice ativo IMEDIATAMENTE (otimista, antes de
rolar) — não espera o scroll assentar. Rolagem ORGÂNICA (dedo/trackpad)
sincroniza as bolinhas comparando `track.scrollLeft` contra `slideLefts` e
escolhendo o MAIS PRÓXIMO (determinístico, nunca ambíguo mesmo com vários
visíveis).

**Bug 2 — o último slide nunca vira "o da esquerda":** com scroll-snap e
vários cards por tela, o scroll MÁXIMO possível (`scrollWidth - clientWidth`)
pode ser menor que a posição que o último slide precisaria para alinhar à
esquerda — o navegador trava o `scrollTo` antes de chegar lá, e o ponto de
parada nem bate com nenhum snap-point (sobra num meio-termo). Medido: pedir
`scrollTo(1032)` (início do slide 4 de 5) resultava em `scrollLeft:596`,
mais perto do slide 2. **Correção:** acrescentar um `<li class="carousel__
spacer" aria-hidden="true">` depois do último slide real, com `scroll-snap-
align:none` e `width:0` por padrão (inofensivo sem JS). O JS mede
`track.clientWidth - larguraDoÚltimoSlide` e ajusta a largura do espaçador
pra exatamente essa sobra, toda vez que mede as posições (inclusive no
resize) — aí o último slide SEMPRE consegue alinhar à esquerda, igual aos
outros.

**Como detectar:** não aceitar "parece ter avançado" pelo screenshot — medir
`scrollLeft` real contra o array de posições esperadas, e testar
explicitamente clicar na ÚLTIMA bolinha/seta (é onde esses dois bugs
aparecem).
