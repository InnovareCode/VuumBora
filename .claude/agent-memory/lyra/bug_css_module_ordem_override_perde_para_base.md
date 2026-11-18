---
name: bug_css_module_ordem_override_perde_para_base
description: Em CSS puro (sem pré-processador), uma regra responsiva (@media) declarada ANTES da regra base de mesma especificidade perde para a base, mesmo a base vindo depois no arquivo — o menu hamburguer de apps/site não sumia no desktop por causa disso.
metadata:
  type: feedback
---

**O que aconteceu** (`apps/site/src/components/Header.module.css`, 18/11/2026):
escrevi `@media (min-width:900px){ .toggle{display:none} }` ANTES da regra
base `.toggle{display:inline-flex; ...}`. As duas têm a mesma especificidade
(uma classe). Cascata CSS decide empate de especificidade por ORDEM NO
ARQUIVO — e a base, vindo DEPOIS, ganhava em qualquer largura, inclusive
≥900px. Resultado: o botão de menu mobile nunca sumia no desktop, mesmo a
`nav` desktop aparecendo corretamente ao lado dele (o `desktopNav` estava no
mesmo bloco de media query e funcionava, porque não tinha regra base
conflitante depois dele).

**Como medi e confirmei (não deduzi lendo o CSS):** Playwright,
`getComputedStyle(botao).display` em 1440px → `"flex"` (esperado `"none"`).
Pra achar a causa, iterei `document.styleSheets` procurando o nome de classe
hasheado (`cls.split(' ')[0]`) em `rule.cssText` — a primeira tentativa
truncou a saída em 160 caracteres e pareceu que a regra de override nem
existia; só ao imprimir o `cssText` inteiro do `@media` ficou claro que a
regra estava lá, mas perdia por ordem.

**Correção generalizável:** toda regra de override responsivo entra DEPOIS
da regra base que ela sobrescreve, no mesmo arquivo — nunca antes, não
importa a especificidade aparente. Se o override e a base tiverem que ficar
em ordem "errada" por algum motivo de organização do arquivo, usar seletor
com especificidade maior no override (ex. `.pai .toggle` em vez de
`.toggle`) em vez de confiar na ordem.

**Por que isso pode voltar:** CSS Modules do Next/Turbopack não reordenam
regras dentro do mesmo arquivo — a ordem de saída bate com a ordem de
entrada. O risco é só humano (escrever o media query antes "porque fez
sentido ao ler de cima pra baixo"). Não vi indício de que o bundler reordene
entre arquivos diferentes nesta sessão, então o risco de ordem entre chunks
separados (ex. dois `.module.css` diferentes) não foi testado — só o caso
dentro do MESMO arquivo, que foi o bug real.
