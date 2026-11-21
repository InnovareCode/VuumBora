---
name: bug_cn_sem_tailwind_merge_classes_conflitantes
description: apps/admin — cn() só junta strings (sem tailwind-merge): duas classes de tamanho de fonte coexistem e vale a ordem do CSS gerado, não a do className. Campo de ativação saiu com 14 px (zoom no iOS).
metadata:
  type: feedback
---

**Causa raiz:** `LabeledIconInput` tem `text-body` na base e `ActivationField` passava `text-small`
em `className`; `cn()` não resolve conflito, então o computado foi 14 px (< 16 px dá zoom no Safari iOS).
O `TotpField` (`text-subtitle`) deu 18 px pelo mesmo mecanismo, por sorte. O campo de recuperação
já estava em 16 px (medido) — o relato do QA estava certo só para a ativação.

**Correção:** não repetir classe de tamanho no `className` de quem estende o campo base (os 16 px já
vêm de `text-body`); comentário no `CodeField.tsx`.

**Como evitar:** MEDIR `getComputedStyle().fontSize` de todo `input/select/textarea` em 390 px (varredura
por script em todas as telas e diálogos), nunca ler a classe. Em 320 px o código de ativação (23 caracteres
monoespaçados a 16 px) rola dentro do campo; cabe a partir de ~360.
