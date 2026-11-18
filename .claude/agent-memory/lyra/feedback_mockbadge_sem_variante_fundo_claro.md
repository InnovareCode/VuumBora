---
name: feedback_mockbadge_sem_variante_fundo_claro
description: MockBadge (@vuumbora/ui) só tinha cores fixas para fundo escuro (textSecondary/borderControl) — sobre fundo claro (ex. gradient.cta amarelo) o texto quase some. RESOLVIDO em 18/11/2026 — promovido a prop onLight do componente compartilhado (ver atualização no fim).
metadata:
  type: feedback
---

**ATUALIZAÇÃO (18/11/2026, mesmo dia à tarde, packages/ui liberado):** promovido —
`MockBadge` ganhou `onLight?: boolean` (troca `textSecondary`/`borderControl` por
`theme.role.ctaText`). `HighDemandBanner.tsx` foi reescrito pra usar
`<MockBadge onLight ... />` no lugar do `MockNoticeOnLight` local (removido, junto com
os 3 estilos `mockBadgeLight`/`mockGlyphLight`/`mockLabelLight` que ele usava). Se
aparecer um TERCEIRO caso de selo sobre fundo claro, é só passar `onLight` — nada a
inventar de novo. O raciocínio original (abaixo) explica por que esperei até agora.

**Causa raiz:** `packages/ui/src/MockBadge.tsx` não tem prop de variante — `glyph`/
`label` sempre usam `theme.role.textSecondary` e a borda `theme.role.borderControl`,
cores pensadas para fundo escuro (`surface`/`screen`). Sobre um fundo CLARO (ex.
`HighDemandBanner.tsx` do motorista, fundo `gradient.cta` amarelo), o contraste medido
pelo Apolo foi **1,17:1** — o selo "sinal de demanda ilustrativo" praticamente
desaparecia.

**Decisão (não editei o componente compartilhado):** com 28 usos de `MockBadge` no
projeto e só ESTE sobre fundo claro, não editei `packages/ui/src/MockBadge.tsx` (shared,
quebraria/mudaria nada nos outros 27 usos se eu mudasse cor fixa; e Atlas pediu para
avisar antes de mexer em componente compartilhado). Fiz um componente local
`MockNoticeOnLight` dentro do próprio `HighDemandBanner.tsx` — mesmo desenho visual
(chip tracejado + glifo "!", mesmos `theme.layout.mockChipHeight`/`radius.pill`), só
com `color`/`borderColor` em `theme.role.ctaText` (navy) em vez de `textSecondary`/
`borderControl`. Mesma regra que já vale para qualquer texto sobre amarelo no projeto
(`docs/identidade-visual.md` §7).

**Contraste medido depois (Playwright, `getComputedStyle` + fórmula WCAG), não só
calculado:** texto navy `rgb(12,17,27)` sobre os 3 stops do gradiente `gradient.cta`
(`#FED202`/`#FFCC00`/`#FDB601`) deu **10,8:1 a 13,1:1** — bem acima do mínimo 4,5:1.

**Se aparecer um SEGUNDO caso** de selo de mock sobre fundo claro, não duplicar de
novo: vale promover isto a uma prop `onLight`/variante no próprio `MockBadge` — aí sim
avisar o Atlas antes, porque é mudança no componente compartilhado (ver
[[project_vuumbora_overview]]).
