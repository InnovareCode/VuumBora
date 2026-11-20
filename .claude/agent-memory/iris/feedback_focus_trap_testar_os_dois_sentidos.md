---
name: feedback-focus-trap-testar-os-dois-sentidos
description: Ao achar um bug de focus trap (modal/gaveta/paleta), sempre testar Tab E Shift+Tab nas DUAS superfícies — um sentido corrigido não garante o outro
metadata:
  type: feedback
---

Achei o primeiro bug de focus trap (gaveta mobile do admin VuumBora) testando
só Tab pra frente. O Atlas apontou depois que o mesmo tipo de bug existia na
`CommandPalette` do mesmo painel, só que pelo lado contrário (Shift+Tab a
partir do primeiro campo focável escapava pro fim do documento, que por
acaso é o conteúdo da página de fundo). Eu não tinha testado esse sentido —
só descobri porque o Atlas pediu explicitamente.

**Por quê:** um overlay pode ter a ordem de Tab certa (porque está depois do
gatilho no DOM) e ainda assim vazar por Shift+Tab (porque o primeiro
elemento focável do overlay, ao receber Shift+Tab, cai no ÚLTIMO elemento
focável do documento — se o overlay for o último bloco do DOM, isso é
justamente o conteúdo de fundo). As duas direções têm causas independentes.

**Como aplicar:** toda vez que testar (ou revalidar correção de) focus trap
em modal/gaveta/paleta/popover, rodar os quatro cantos: Tab a partir do
primeiro elemento do overlay, Tab a partir do último, Shift+Tab a partir do
primeiro, Shift+Tab a partir do último — nas duas superfícies do projeto que
tiverem overlay (não assumir que a correção numa generaliza pra outra, mesmo
quando as duas usam o mesmo hook, porque o bug só aparece quando o DOM muda
de fato).

Ver [[project-admin-v0-gaveta-mobile-sem-focus-trap]].
