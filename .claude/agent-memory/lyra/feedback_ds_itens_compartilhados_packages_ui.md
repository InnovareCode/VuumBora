---
name: feedback_ds_itens_compartilhados_packages_ui
description: Itens da direção de arte/auditoria Apolo que viviam em packages/ui e ficaram pendentes por coordenação (outra frente mexendo no pacote em paralelo) — resolvidos em 18/11/2026 quando o pacote ficou livre. Padrão de "variante tingida" (withAlpha) criado aqui.
metadata:
  type: feedback
---

**Contexto:** várias frentes anteriores (home do passageiro, home do motorista, fluxo
de corrida) tocaram `apps/*` mas evitaram editar `packages/ui` porque outra missão
mexia nele em paralelo — por isso ficaram registradas como "ficou de fora" em
[[project_vuumbora_overview]]. Resolvidas de uma vez quando o Atlas liberou o pacote.

**1. `StatusBadge` — todas as variantes viraram TINGIDAS** (fundo a 14% de opacidade
sobre `surface`, borda a 40%, texto/glifo na cor cheia; nunca mais preenchida —
inclusive `success`, apesar do pedido inicial soar como "talvez preenchida só pra
sucesso": o F5 da auditoria já pedia `success` tingido por causa do contraste branco-
sobre-verde reprovado). `danger` usa `theme.role.danger` (não `dangerFill`, reservado a
fundo CHEIO). Contraste MEDIDO no navegador (Playwright + fórmula WCAG, não só
calculado): success 6,96:1, warning 7,74:1, info 6,56:1, danger 5,98:1, neutral 8,75:1
— todos acima do mínimo 4,5:1 (resolve a lacuna "não medido" que a auditoria deixava
pra info/danger).

**2. `ButtonCore` variante `danger` virou contorno** (`borderWidth:1.5`, cor
`dangerFill`) **+ fundo tingido a 10%** (`withAlpha(dangerFill, 0.1)`), texto em
`danger` — nunca mais vermelho cheio. Contraste medido: 6,70:1. Estado desabilitado
passou a se comportar como `secondary` (borda + fundo `surfaceElevated`) em vez de
ficar sem nenhum fundo/borda — `hasOutline = variant==='secondary' || variant==='danger'`
no `getVisualState`. O preview estático do catálogo (`apps/passenger/src/components/
catalog/PressedButtonPreview.tsx`) tinha cores do "danger cheio" hardcoded — precisou
de ajuste junto, senão o catálogo mentia sobre o visual real.

**3. `ScreenHeader`: a caixa de 44pt da seta só é renderizada quando `onBack` existe**
(antes: `<View style={styles.backButton} />` vazio sempre, mesmo sem seta — por isso o
título começava em x72 mesmo em telas sem botão de voltar). Fix de 1 linha (`: null`
no lugar do `View` vazio). **Não mexi no `rightSlot`** (D1 da auditoria, truncamento em
320 no `/destino`) nem troquei a seta `‹` por `ChevronLeft` do lucide (D2) — os dois
ficaram de fora porque `packages/ui` não importa lib de ícone direto (ver
[[project_vuumbora_overview]], decisão de arquitetura) e não foram pedidos
explicitamente desta vez. Em aberto pro Atlas se quiser mandar numa próxima.

**4. `StarRating` trocou o glifo `★/☆` por um RENDER-PROP `icon?: (props: {filled,
size, color}) => ReactNode`** — mesmo padrão já estabelecido em `BottomTabBar.icon`/
`ButtonCore.icon` ("ui agnóstica de lib de ícone, o app injeta pronto"). Sem a prop,
cai no glifo (compatibilidade pra quem ainda não tem lucide instalado, ex. driver).
Os 2 call sites em `apps/passenger` (`concluida.tsx`, `DriverInfoCard.tsx`) passam
`Star` do lucide com `fill={filled ? color : 'none'}`. Cor vazia trocou de
`borderControl` pra `textMuted` (pedido F3 da auditoria — mais visível).

**5. `MetricCard` ganhou a mesma borda iluminada dos outros cards** — trocou `View` +
`backgroundColor: theme.role.surface` chapado por `<SurfaceRaised>` (gradiente sutil) +
`borderWidth:1`/`borderTopColor: edgeTop`/`borderColor: edgeBottom`. Precisou estender
`SurfaceRaisedProps` com `accessibilityLabel?` (não existia; `MetricCard` repassa o
rótulo de valor+loading pro componente) — os outros ~11 usos de `SurfaceRaised` no
projeto não passavam essa prop e continuam funcionando (opcional, não quebra nada).

**Helper novo: `packages/ui/src/colorAlpha.ts` → `withAlpha(hexDoToken, alpha)`.**
Converte uma cor já resolvida de `theme.role.*` pra `rgba(...)` — usado por
`StatusBadge` e `ButtonCore`. Não é HEX literal (o `scripts/check-boundaries.mjs`
reprovaria): a função só faz `slice`/`parseInt` em cima de uma STRING recebida em
runtime, nunca escreve `#RRGGBB` no código-fonte. Exportado de `@vuumbora/ui` (usado
também pelo preview estático do catálogo, item 2 acima). Se precisar de outra cor
tingida no futuro, reusar isto — não reinventar outra conversão hex→rgba.

**Dois ajustes finos pedidos à parte (não da auditoria, pedido direto do dono):**
- `RideCategoryCard.tsx` (`apps/passenger`): `iconBox` (caixa do ícone de carro
  genérico, abaixo de 360pt) trocou `radius.md` (12) por `radius.lg` (16) — mesmo raio
  do card que a contém, "acompanhando a curvatura" em vez de ter um raio menor e
  destoar por dentro.
- `AppShell` com `scroll` cresce até preencher a tela — ver [[bug_appshell_scroll_sem_flexgrow]].
