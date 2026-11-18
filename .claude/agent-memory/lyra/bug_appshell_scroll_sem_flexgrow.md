---
name: bug_appshell_scroll_sem_flexgrow
description: AppShell (@vuumbora/ui) com scroll deixava o conteúdo "terminar antes do fim da tela" (faixa escura sobrando no rodapé) — causa raiz era o wrapper interno não crescer, mesmo o ScrollView já tendo flexGrow:1. Achado na auditoria das boas-vindas, corrigido em 18/11/2026.
metadata:
  type: feedback
---

**Sintoma (auditoria Apolo, item B1):** em `/boas-vindas` a 390×844, o fundo
fotográfico + scrim + bloco de texto/CTA terminavam em y≈666, sobrando ~178pt de tela
"morta" (preto neutro, sem scrim) no rodapé — mesmo a tela tendo `flex:1` no próprio
conteúdo (`styles.content: { flex: 1, minHeight: 480 }`).

**Causa raiz:** `AppShell.tsx` já tinha `scrollContent: { flexGrow: 1 }` no
`contentContainerStyle` do `ScrollView` — mas isso só estica o CONTAINER da rolagem.
O `View` interno que o `AppShell` usa pra aplicar padding (`content`, variável local
dentro do componente) tinha `!scroll && styles.flexFill` — ou seja, com `scroll=true`
ele NUNCA recebia `flex`/`flexGrow` nenhum. Um filho único sem `flexGrow` dentro de um
container com `flexGrow:1` não herda altura automaticamente: ele só ocupa o que seu
próprio conteúdo pede. Resultado: a tela da própria aplicação (que tinha `flex:1` no
SEU `content`) ficava presa dentro de um pai sem altura disponível pra crescer.

**Correção:** `scroll ? styles.scrollFill : styles.flexFill` no lugar de
`!scroll && styles.flexFill`, com `scrollFill: { flexGrow: 1 }` novo no
`StyleSheet.create`. Agora o wrapper cresce pra preencher o `ScrollView`, e QUALQUER
tela que também use `flex:1` no próprio conteúdo (padrão já usado em boas-vindas) passa
a esticar de verdade.

**Medido depois da correção (Playwright, viewport = altura REAL do device, não altura
alta pra caber scroll):** em 390×844, o scrim/foto agora vai até y=824 (praticamente o
fim, a sobra de 20pt é padding normal) — sem faixa morta. Em 320×568 o comportamento
NÃO mudou (o conteúdo já excedia 568pt antes da correção também — ainda precisa de uns
46px de rolagem, como já estava documentado; a correção não piora nem resolve isso,
só garante que o conteúdo CRESCE até pelo menos a altura da tela quando cabe).

**Como verificar isso da próxima vez:** nunca testar com viewport ALTO (ex. 1400) só
pra caber o scroll inteiro no screenshot — isso disfarça o bug (não há "sobra" visível
porque há espaço de sobra em excesso de qualquer jeito). Testar com a altura REAL do
device (390×844, 320×568, 430×932) e olhar se o fundo/scrim chega até a última linha
de pixel, igual ao método do Apolo.

**Afeta toda tela com `AppShell scroll`** — depois de mexer aqui, reconferir não só
boas-vindas: login, cadastro, confirmação, concluída e a home também usam `scroll` e
foram checadas (sem regressão, nenhuma esticou/quebrou layout).
