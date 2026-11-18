---
name: bug_screenheader_title_fixo_trunca_320
description: ScreenHeader (@vuumbora/ui) tem numberOfLines={1} fixo no título — qualquer título com mais de ~16 caracteres em textStyle('bold','title') trunca a 320pt quando a tela também tem rightSlot (back+rightSlot consomem 88pt dos 280pt de conteúdo). Achado real na P11/P10.
metadata:
  type: feedback
---

**Causa raiz:** `ScreenHeader` reserva `theme.layout.touchTarget` (44pt) para o botão
de voltar E para o `rightSlot` — mesmo quando `rightSlot` está vazio, a `View` existe
(`<View style={styles.rightSlot}>{rightSlot}</View>`, sempre renderizada). A 320pt,
conteúdo útil = 280pt (320 − 2×`screenPadding`); subtraindo os dois slots de 44pt +
2 gaps de 8pt, sobra só **176pt** para o `titleBlock`. O título (`numberOfLines={1}`,
fixo no componente, sem prop para mudar) corta com reticências qualquer string que
passe disso — "Histórico de viagens" (20 caracteres, ~217px em bold/title 22px)
truncava, medido no Playwright (`scrollWidth 217` vs `clientWidth 176`).

**Já tinha acontecido antes:** `concluida.tsx` usa título "Concluída" em vez de
"Corrida concluída" pelo mesmo motivo (comentário inline no próprio arquivo, mas
nunca tinha virado memória persistente — por isso o mesmo tipo de erro quase se
repetiu na P11).

**Correção:** escolher um título CURTO de propósito para toda tela com `ScreenHeader`
(≲16 caracteres em bold/title, menos ainda se a tela também usa `rightSlot`) — nunca
confiar que o texto da referência de design cabe. Não é pra editar `ScreenHeader` em
`packages/ui` (não é bug do componente, é orçamento de espaço esperado). Resolvido em
`apps/passenger/app/historico.tsx`: "Minhas viagens" no lugar de "Histórico de
viagens" da referência.

**Como detectar da próxima vez:** todo título de `ScreenHeader` precisa ser medido a
320pt — comparar `scrollWidth` vs `clientWidth` do nó de texto do título, igual ao
método de truncamento geral em [[feedback_medir_expo_web_playwright]]. Se a tela
também tiver `rightSlot` (ex.: ícone de ação), o orçamento de largura é ainda menor.
