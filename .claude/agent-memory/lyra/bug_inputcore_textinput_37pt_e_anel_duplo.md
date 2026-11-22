---
name: bug_inputcore_textinput_37pt_e_anel_duplo
description: InputCore (@vuumbora/ui) — o <input> real media 37px dentro de um campo de 52 (alvo de toque abaixo de 44) e, ao esticá-lo, apareceu o anel branco de foco do navegador dentro da borda amarela. Causa raiz e correção.
metadata:
  type: feedback
---

**Sintoma:** varredura de alvos (`input` visível < 44) acusou 37px em TODO campo, em 320/360/390/430 — o `field` tem `minHeight: 52`
(`theme.layout.inputHeight`) mas o `TextInput` interno (`paddingVertical: 8` + lineHeight 21) só ocupa 37px centralizado; no nativo
o toque nas faixas de cima/baixo do wrapper não foca nada. Já existia antes da B1 (todos os campos do app).

**Correção (`packages/ui/src/InputCore.tsx`):** `alignSelf: 'stretch'` no estilo do input (o campo nativo vira a altura inteira do
`field`; texto continua centralizado). Efeito colateral: o `<input>` agora cobre o campo todo e o anel de foco padrão do navegador
(retângulo branco) ficou visível dentro da borda de 2pt amarela → `outlineStyle: 'none'` só no web (cast `as object`: o tipo nativo
só aceita solid/dotted/dashed). O indicador de foco é a borda do wrapper (medido: 2px, cor de destaque).

**Como evitar:** "o pai tem 52" não prova que o elemento que RECEBE o toque tem 52 — medir `getBoundingClientRect` do próprio
`input`/`[role=button]` (mesma lição de [[bug_touch_target_hitslop_insuficiente]]). Ao ampliar a área de um input, reconferir o
anel de foco no screenshot com o campo focado (o último campo preenchido costuma estar focado no print).
