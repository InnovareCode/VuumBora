---
name: bug_clamp_vw_vs_container_maxwidth
description: Título em clamp(min,Nvw,max) continua crescendo com a LARGURA DA JANELA mesmo depois que o container (max-width fixo) parou de crescer — acima de um certo breakpoint o texto deixa de caber e quebra em mais linhas do que em telas menores. Use ao dimensionar H1/título com vw dentro de um container com max-width.
metadata:
  type: bug
---

**Sintoma:** H1 do Hero da VuumBora ("Dirija com a VuumBora.") quebrava em TRÊS
linhas em 1920px mas cabia em DUAS em 1440px — o oposto do que a intuição
sugere (tela maior deveria sobrar mais espaço, não menos).

**Causa raiz:** `font-size: clamp(3.4rem, 6.8vw, 7rem)` usa `vw` = largura da
**janela**. Mas o container do site (`--site-container-max: 1180px`) já
platea o conteúdo numa largura FIXA a partir de ~1276px de janela — ou seja,
para qualquer janela ≥1276px, a coluna de texto (`.intro`, dentro do grid do
container) tinha SEMPRE a mesma largura disponível (543,9px, medido, igual
em 1280/1440/1920px). O `font-size`, porém, não sabe disso: continua
crescendo com `6.8vw` até bater no teto fixo do `clamp` (7rem=112px, que só
é alcançado a partir de ~1647px de janela). Resultado: em qualquer janela
entre "o container já platou" (~1276px) e "o font-size também platô"
(~1647px) o texto ainda cabia por pouco; acima de 1647px o font-size ficava
MAIOR (112px) sem a coluna ter ficado mais larga — e o texto que antes mal
cabia agora estourava e quebrava.

**Como achar isso (medir, não deduzir):** `getComputedStyle(h1).fontSize` +
`intro.getBoundingClientRect().width` nas três larguras reclamadas pelo
dono (1280/1440/1920) via Playwright. Reparar que `grid-template-columns`
do grid pai era IDÊNTICO nas três larguras — esse é o sinal de que o
container já platô e o problema está no font-size, não no layout.

**Correção:** reduzir o TETO do `clamp` (não o `vw` nem o mínimo) até que,
no pior caso (font-size no teto), o texto mais longo sem quebra forçada
("Dirija com a", antes do `<strong>` que já é `display:block`) caiba na
largura real e fixa do container. Achei o maior font-size que ainda cabe
por BISSECÇÃO real no navegador (criar um `<span>` com a mesma
`font-family`/`font-weight`/`letter-spacing` proporcional, medir
`getBoundingClientRect().width`, testar contra a largura disponível menos
uma margem de segurança de ~4px) — não estimar por regra de três a partir
de uma única medição, a curva não é perfeitamente linear por causa de
kerning/hinting em tamanhos diferentes.

**Lição geral:** sempre que um título usar `vw` dentro de um container com
`max-width`, o `clamp` precisa ter o teto calibrado contra a largura REAL
do container platô, não contra "a fração de vw que dava certo na largura
que eu testei primeiro" — testar só a largura "de referência" (aqui, 1440px,
que o dono já tinha aprovado) não detecta o bug, que só aparece ACIMA do
ponto onde o container platô e o vw ainda não platô.

Ver [[project_site_nextjs_static_export]].
