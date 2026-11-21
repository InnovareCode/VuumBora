---
name: bug_focustrap_onescape_inline_rouba_foco
description: useFocusTrap com onEscape inline re-rodava o efeito a cada render e devolvia o foco ao botão "Fechar" — só dava para digitar 1 caractere por vez em qualquer campo de diálogo (corrigido 21/11/2026). Playwright fill() não revela.
metadata:
  type: project
---

Sintoma real: em qualquer `Dialog`/gaveta/paleta, a 2ª tecla digitada jogava o
foco no "Fechar". Causa raiz: `useFocusTrap(ref, active, () => ...)` recebia
arrow inline (identidade nova a cada render) e `onEscape` estava nas deps do
`useEffect`; digitar muda estado do pai → re-render → efeito refeito → "foca o
primeiro focável" + devolve o foco ao gatilho no cleanup.

Correção: `onEscape` fica em ref (`onEscapeRef.current = onEscape`), deps só
`[active, containerRef]` (`apps/admin/src/nav/useFocusTrap.ts`).

Como NÃO cair de novo: todo teste de campo dentro de diálogo/overlay deve usar
`page.keyboard.type(...)` (teclado real) e conferir `document.activeElement`
depois — `locator.fill()` foca o campo sozinho a cada chamada e esconde o bug.
Vale para qualquer hook que registre efeito com callback vindo de props.

Também: `flex-col` + filho `flex-1` zera a altura (basis 0 no eixo vertical) —
botão `h-11` colapsa a ~21 px no celular. Usar `sm:flex-1`.
