---
name: feedback_photocard_variar_forma_sem_duplicar
description: Como variar a FORMA de blocos de página que reaproveitam o mesmo componente de foto, sem cair em "5 cartões idênticos leem como lista" nem duplicar componente para cada forma. Use quando o dono (ou a referência de design) pedir composição variada numa sequência de seções foto+texto.
metadata:
  type: feedback
---

**O padrão:** o dono reprovou `apps/site` porque 5 seções com o mesmo cartão
(mesma proporção, mesmo layout) em sequência "leem como lista, não como
página" — mesmo cada cartão tendo conteúdo e foto diferentes. A correção não
foi trocar o componente, foi fazer o componente aceitar **proporção como
dado** (`ratio`/`ratioDesktop`, aplicados via CSS custom property
`aspect-ratio: var(--pc-ratio, ...)`) em vez de fixa — porque `object-fit:
cover` numa foto cobre qualquer proporção que o layout pedir, não precisa de
um recorte por composição.

**Por que isso resolve sem virar "componente gigante que faz tudo":** o
`PhotoCard` continua fazendo uma coisa só (foto + véu duplo + texto). Quem
varia a forma da página é o componente de LAYOUT ao redor
(`ArtworkPairSection` com `columns='1fr 1fr'` vs `columns='3fr 2fr'`,
`PhotoBand` com `ratio='16/9'`) — a variação vive na composição, não na
peça.

**Como aplicar:**
1. Antes de repetir o mesmo bloco N vezes numa sequência de conteúdo
   homogêneo (N fotos+texto), agrupe por tema e escolha pelo menos 2-3 formas
   diferentes (par de peso igual, par assimétrico, faixa única) — olhando o
   conteúdo real, não inventando just para variar.
2. O componente de foto recebe proporção como prop, nunca hardcoded no CSS
   do próprio componente.
3. Prove com screenshot (não só a régua do `getBoundingClientRect`) que as
   formas realmente leem como diferentes — um `3fr 2fr` numa tela estreita
   pode virar visualmente igual a `1fr 1fr` se o conteúdo não permitir a
   diferença de altura aparecer.

Ver [[project_site_nextjs_static_export]] (seção "2ª reescrita") para a
implementação completa.
