---
name: bug_fundo_mockup_vs_tom_secao
description: Halo/fundo atrás de um mockup fotográfico (fundo quase-preto embutido na imagem) ficava visível como caixa retangular em seção de tom "elevated" — correção foi desbotar até transparente, não até uma cor fixa.
metadata:
  type: feedback
---

**O que aconteceu:** ao trocar `PhoneFrame` (moldura 100% CSS) por
`PhoneMockup` (celular fotografado de verdade, com fundo quase-preto e
brilho âmbar já embutidos na própria imagem — ver [[project_site_nextjs_static_export]]),
dei ao container `.visual` um `radial-gradient` que desbotava até
`var(--color-background-base)` para "casar" com o fundo da página. Fechava
visualmente na seção de tom `base` (fundo da página = quase a mesma cor do
canto da imagem, ~#060D20 vs #070D18). Na seção de tom `elevated`
(`Section.tsx` com `background: var(--color-background-surface)`, mais
clara), a MESMA técnica criava uma caixa retangular nitidamente visível —
exatamente o "fundo brigando com o mockup" que o dono pediu para evitar.

**Causa raiz:** eu estava desbotando para uma COR FIXA (a cor certa para um
tom de seção, errada para o outro) dentro de um container com
`overflow:hidden` + `border-radius` — ou seja, um retângulo com borda nítida
onde o gradiente terminava. Qualquer cor fixa de destino só funciona para UM
tom de seção.

**Correção:** desbotar até `rgba(...,0)` (transparência total), com
`overflow: visible` e sem `border-radius` no container — o halo âmbar/escuro
desaparece completamente bem antes da borda lógica do elemento, então o que
aparece por baixo é sempre o fundo REAL da seção (seja qual for), sem
costura, em qualquer tom. Testei nas duas seções que usam mockup hoje
(`base` e `elevated`) depois do fix — ver `ShowcaseRow.module.css`
`.visualMockup`.

**Como aplicar:** sempre que compuser uma imagem com fundo próprio (preto,
branco, qualquer cor sólida) sobre um container cujo fundo pode variar por
contexto (tema, tom de seção, variante), NUNCA desbote para uma cor fixa —
desbote para transparente. Só funciona pra qualquer fundo por trás porque
não tenta "adivinhar" a cor certa. Vale para qualquer composição de imagem +
halo/vinheta neste ou em outro projeto.
