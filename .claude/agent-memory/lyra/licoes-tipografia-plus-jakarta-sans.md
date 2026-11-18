---
name: licoes-tipografia-plus-jakarta-sans
description: Como a fonte da marca (Plus Jakarta Sans) está implementada no Vuumbora — fontFamily por peso, tabular-nums, lineHeight explícito, e por que símbolos/glifos ficam de fora da fonte da marca.
metadata:
  type: project
---

Decisão do dono em 18/11/2026 (análise completa do Apolo em `docs/tipografia.md`):
**Plus Jakarta Sans**, 4 TTF estáticos via `@expo-google-fonts/plus-jakarta-sans`
(instalado com `npx expo install`, nunca versão escolhida à mão). Substituiu
`Inter`. Alternativas descartadas pelo dono: Manrope, Sora (passam nos critérios
técnicos, personalidade diferente) e Montserrat Alternates (reprovada — deforma
maiúsculas, `EMU` vira `ɛmu`, problema real numa placa de carro).

## Por que `typography.family` é um GRUPO, não uma string

Fonte **variável** não é confiável no Android: o eixo `wght` não mapeia por
`fontWeight` dentro de uma família só. Por isso `VuumBora_Claude_Design_System/
tokens/vuumbora.tokens.json` tem `typography.family.{regular,medium,semibold,bold}`,
cada um apontando pro nome exato que o `@expo-google-fonts` exporta
(`PlusJakartaSans_400Regular`, `_500Medium`, `_600SemiBold`, `_700Bold`). Nunca
existe peso abaixo de 400 no token — regra do Apolo, sobre fundo escuro peso fino
some visualmente.

## Como qualquer componente usa isso

`packages/ui/src/typography.ts` exporta `textStyle(peso, tamanho)` (composição
fontFamily + fontSize + **lineHeight explícito**, proporção 1.3×) e
`textStyleForSize(peso, fontSizeNumérico)` para os raros casos de tamanho calculado
em runtime (ex.: `BrandLogo`, que escala o selo). Nenhum componente combina
`fontFamily`/`fontSize`/`fontWeight` à mão — isso é exatamente o tipo de decisão
que vira inconsistência se cada tela resolver sozinha.

**`tabularNums`** (também exportado de `typography.ts`) é obrigatório em todo valor
que muda na tela: preço, ETA, distância, placa, horário, contador
(`docs/tipografia.md` §5). Único uso hoje: `MetricCard.value`. Qualquer componente
numérico futuro (`FareEstimate`, `RideOfferCountdown`, `EarningsSummary`...)
**tem** que usar `tabularNums`, não é opcional por tela.

## Por que símbolos (✓ ✕ ! i • ▲ ▼ ○ ‹) ficam FORA da fonte da marca

Plus Jakarta Sans é um charset latino — nada garante que cubra dingbat/seta/
geométrico. No **navegador**, um glifo ausente cai pro próximo da pilha CSS
(fallback automático). No **RN nativo** (iOS/Android) não existe essa pilha: um
glifo ausente vira "tofu" (caixa vazia), não cai pra fonte do sistema sozinho. Por
isso todo glifo decorativo continua só com `fontWeight` (sem `fontFamily`),
usando a fonte do sistema. Ver a lista completa em cada componente: `ButtonCore`,
`InputCore`, `StatusBadge`, `EmptyState`, `ErrorState`, `SearchInput`,
`ScreenHeader` (glifo `‹`), `MetricCard` (glifo de tendência).

**Consequência de design:** quando o glifo e a palavra aparecem juntos (ex.:
badge "✓ Aprovado", tendência "▲ alta"), eles precisam ser **dois `<Text>`
irmãos**, nunca um aninhado dentro do outro — `fontFamily` É herdado por `<Text>`
aninhado no React Native, então aninhar o glifo dentro do texto da palavra faria
ele herdar a fonte da marca por engano.

## Carregamento (Expo Router)

`useFonts` de `@expo-google-fonts/plus-jakarta-sans` + `expo-splash-screen`
(`preventAutoHideAsync`/`hideAsync`) no `_layout.tsx` raiz de **cada** app
(passenger e driver — `@vuumbora/ui` é compartilhada). Enquanto não carrega, o
layout retorna `null` (tela nativa de splash segura). Sem isso, o primeiro frame
sai na fonte do sistema e pisca pra marca (FOUT) — e pior, é exatamente essa
troca de métrica de fonte que pode mudar onde um texto quebra linha, então medir
layout ANTES da fonte carregar é medir o estado errado.
