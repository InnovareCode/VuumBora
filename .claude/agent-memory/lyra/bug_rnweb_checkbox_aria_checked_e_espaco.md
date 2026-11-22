---
name: bug_rnweb_checkbox_aria_checked_e_espaco
description: react-native-web 0.21 — Pressable com role checkbox saía sem aria-checked (accessibilityState.checked não chega ao DOM) e só marcava com Enter, não com Espaço. Causa raiz das duas e a correção no ConsentCheckbox.
metadata:
  type: feedback
---

**Sintoma (medido no DOM, B1, 22/11/2026):** `<div role="checkbox" tabindex="0">` sem `aria-checked` (leitor de tela web não
anuncia marcado/desmarcado) e `Space` não marcava.

**Causa raiz (duas independentes):**
1. `accessibilityState={{ checked }}` NÃO é mapeado para `aria-checked` no RNW 0.21 (o `disabled` sim, via `Pressable disabled`).
2. `PressResponder.isValidKeyPress`: Espaço só vale para elemento `button` ou role `button`/`menuitem`; role `checkbox` só reage a Enter.

**Correção (`packages/ui/src/ConsentCheckbox.tsx`):** `aria-checked={checked}` + `aria-disabled` direto (RN ≥0.71 mapeia `aria-*`
para o estado nativo, então serve aos dois), e `onKeyDown` só no web (`Platform.OS==='web'`, objeto cast para `object` porque o tipo
do RN não tem `onKeyDown`) que trata `' '` com `preventDefault` (senão a página rola).

**Como evitar:** componente novo com role que não seja button → medir no navegador o ATRIBUTO aria no DOM (`getAttribute`) e o
teclado (`page.keyboard.press('Space')`), nunca confiar em `accessibilityState`. Outros usos de `accessibilityState.checked/selected`
no repositório (ex.: `ToggleSwitch`, abas) NÃO foram conferidos — provável mesmo defeito no web.
