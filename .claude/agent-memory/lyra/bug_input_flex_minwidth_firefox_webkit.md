---
name: bug_input_flex_minwidth_firefox_webkit
description: InputCore — o <input> em linha flex sem minWidth:0 empurrava o "Mostrar senha" para fora do campo no Firefox (<=373px) e no WebKit (<=365px), mas NÃO no Chromium. Causa raiz, como provar nos 3 motores e o controle negativo.
metadata:
  type: feedback
---

**Sintoma (achado F3 da Íris, S1 passada 3, corrigido 22/11/2026):** em TODA `PasswordInput` (login, cadastro, código, redefinir) o botão
"Mostrar senha" sumia em tela estreita: Firefox 320 px → botão em x=320..373 (fora da tela), WebKit 320 px → x=313..365. Chromium estava certo
(176 px). O campo cortava o acessório; o toque ficava inalcançável.

**Causa raiz:** `<input>` é item flex de uma linha (`field`: row) com `flex: 1`. O `min-width: auto` de um flex item usa a largura
INTRÍNSECA do conteúdo, e `<input>` tem largura intrínseca por `size=20` (Firefox ~253 px, WebKit ~246 px). Isso ganha do `flex: 1 1 0` e
estoura a linha; o Chromium trata o `<input>` diferente e encolhe. Mesma família de [[bug_flex_item_min_width_auto_vaza_largura_input]]
(site) — lá era um input sem `width:100%`, aqui é input flex dentro de um campo com acessório.

**Correção:** `minWidth: 0` no estilo `input` de `packages/ui/src/InputCore.tsx` (afeta TextInput/PasswordInput/PhoneInput/DateInput/CodeInput/
SearchInput, e o motorista). No nativo é inofensivo.

**Como evitar / provar:** qualquer campo em linha flex com `flex:1` precisa de `minWidth:0`. E **só se descobre medindo nos três motores**
(o Chromium não mostra): ao testar layout de formulário no web, rodar Firefox e WebKit também (Playwright 1.62.1 da skill
`C:/Users/Personal Computer/.claude/skills/playwright-skill/` abre os 3; o `playwright-core` solto de `pw/` pede revisões que não estão no
cache). Prova usada: botão com `l >= 0 && r <= vw`, dentro do `field`, alvo >= 44x44, `elementFromPoint` no centro = o botão (rolar até o
campo ANTES: fora da viewport devolve `null`), nada do `field` além da borda dele, sem rolagem horizontal; 4 telas x 3 motores x 320/360/373
= 324 verificações. **Controle negativo:** apagar a linha `minWidth: 0` → 88 falhas (44 Firefox + 44 WebKit, 0 Chromium); restaurar → 324/324.

Relacionado: [[bug_inputcore_textinput_37pt_e_anel_duplo]], [[feedback_checar_overflow_por_elemento]].
