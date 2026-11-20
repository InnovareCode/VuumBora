---
name: feedback_tailwind_v4_theme_alias_mesmo_nome_do_token
description: Em Tailwind v4 CSS-first, `@theme { --radius-sm: var(--radius-sm); }` (mesmo nome do token já gerado em :root fora de layer) NÃO é um loop — o token unlayered sempre vence o alias dentro do layer "theme". Use ao configurar @theme referenciando tokens já existentes em :root.
metadata:
  type: feedback
---

**Contexto:** `apps/admin` adotou Tailwind v4 CSS-first (`@theme` em `global.css`)
mantendo `tokens.css` (gerado do JSON) como única fonte. Onde o NOME da escala
do Tailwind já bate com o nome do token (`--radius-sm`, `--font-weight-bold`),
eu queria sobrescrever só o VALOR sem trocar o nome da utilidade (`rounded-sm`,
`font-bold` continuam existindo, só passam a usar o valor do design system).

**A dúvida:** escrever `--radius-sm: var(--radius-sm);` dentro de `@theme`
parece uma referência circular ao mesmo nome.

**Por que não é:** `@theme` emite suas variáveis dentro do `@layer theme`
(baixa prioridade por cascade layers — layers não nomeados, como o `:root{}`
que `tokens.css` já declara, SEMPRE vencem um layer nomeado, não importa a
ordem no arquivo). Então existem duas declarações de `--radius-sm` em `:root`
disputando a cascata: a de `tokens.css` (sem layer, vence) e a do `@theme`
(dentro de `theme`, perde — e seu `var(--radius-sm)` nunca chega a ser
avaliado porque a declaração inteira é descartada da cascata). Confirmado
lendo o CSS do `vite build`: `--radius-sm` aparece no `:root` final como
`8px` literal, não como `var(...)`.

**Como aplicar:** é seguro reusar o mesmo nome em `@theme` quando o objetivo é
"manter o nome da utilidade Tailwind, trocar o valor pelo token equivalente
que já existe em `:root` sem layer". Quando o token NÃO existe com esse nome
(ex. `--color-navy` não existe em `tokens.css`, só `--color-brand-navy`), aí
sim o alias precisa de nome DIFERENTE do destino (senão fica
`var(--color-navy)` apontando pra ele mesmo sem nenhuma declaração unlayered
pra vencer — essa estrutura NÃO tem fallback, fica inválida/vazia).

**Armadilha irmã, mesmo arquivo:** o `@import` de fonte do Google (depois de
`@import 'tailwindcss'`) é silenciosamente ignorado pelo navegador em
produção — `@import 'tailwindcss'` se expande em regras de verdade (não só
outro `@import`), e qualquer `@import` depois de uma regra não-`@import` é
inválido por spec. O `vite build` acusa isso como *warning* ("CssSyntaxError"
ou "@import rules must precede..."), não erro — fácil de passar batido.
Solução: o `@import` de fonte externa tem que ser a PRIMEIRA linha do
arquivo, antes até do `@import 'tailwindcss'`.

**Como pegar isso de novo:** depois de montar o `@theme`, rodar `vite build`
de verdade e grepar o CSS final por `:root{` pra conferir se os valores
críticos saíram como literal (confirma que o token venceu) — não confiar só
no typecheck/lint, que não enxergam isso. E prestar atenção em qualquer
"warning" do build de CSS, não só nos erros.
