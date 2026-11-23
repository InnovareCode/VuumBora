# Veredito da Íris — Portão de qualidade, onda 3 do padrão premium ("pedido")

**VEREDITO: APROVADO.**

**Candidata:** `fatia/f09-onda3` (`940832a`), sobre `main` (`c971581`). Cópia limpa fora do repositório
real (`git archive 940832a` + `npm install` de verdade, Node do ambiente; symlinks de workspace
conferidos por `ls -la node_modules/@vuumbora` — todos presentes, incluindo `tokens`/`ui`, ver
[[feedback-cp-r-quebra-symlink-workspace]]). Linha de base "antes" montada do mesmo jeito a partir de
`c971581`.

Telas no escopo: **P05** (`/categoria`, nova — as categorias saíram da Home, PP-2) e **P06**
(`/confirmacao`, reescrita). Fichas: `docs/fichas-de-tela/P05-categoria-e-orcamento.md` e
`docs/fichas-de-tela/P06-confirmacao.md`.

## Como medi

- `tools/qualidade-tela` com o Metro ao vivo (`dev-server.mjs`/`auth-bootstrap.mjs`), porta 10601
  (passageiro) — acima de 10500 como pedido, nenhum processo sobrando ao final (conferido por
  `netstat`, só `TIME_WAIT`). `capturar` + `sondas` (estilo, geometria, texto, contraste, foco) nas 4
  larguras × 2 estados (padrão/sem-rede) para P05 e P06 — 16 combinações, abertas a olho, não só o
  resumo numérico ([[feedback-comparador-pixel-contra-baseline-com-bug]]).
- `lado-a-lado` (G-07b) de P05 e P06 contra o recorte "Escolha de categoria" de
  `alvo_passageiro_2026-11-22.png`.
- **Fluxo real de clique, com login pelo gancho de identidade** (`window.__vuumboraIdentity`, nunca
  `page.goto` depois de logado — a sessão mock vive só em memória): Home → atalho "Casa" → P05 →
  seleciona categoria → "Continuar" → P06 → "Solicitar corrida" → `/buscando` → simulação completa →
  `/concluida`. Repeti o mesmo roteiro trocando "Casa" por "Trabalho" e por "Favoritos" (este último
  sem lugar salvo fixo — vai para `/destino`, como o código prevê). Zero erros de página
  (`pageerror`) em toda a passada.
- **Mutação real** (editar o arquivo no disco + reiniciar o Metro,
  [[feedback-mutacao-real-precisa-restart-metro]]) para provar que os 3 pontos de regressão pedidos
  realmente são travados pelo meu roteiro — ver seção própria.
- Build de produção real (`expo export --platform web`, sem `--dev`,
  `VUUMBORA_BUILD_PROFILE=production`) para provar que `?devSeed` não sobrevive ao bundler.
- `npm run check` (boundaries + docker-context + typecheck) no monorepo inteiro.
- Nada ficou na `.baseline`/`.saida` compartilhada nem no repositório real — tudo rodou no meu
  scratchpad, apagado ao final.

## Nota por tela (meta: 7 ou mais)

| Tela | Antes | Depois | O que mudou (evidência) |
|---|---|---|---|
| P05 categoria e orçamento | não existia (categorias moravam inline na Home, sem mapa, sem painel) | **8** | Tela nova: mapa 45% com balões de origem/destino (`map.pickup`/`map.destination`), painel com categorias da cotação viva, pagamento e CTA fixo no rodapé. Medido: linha de categoria 68pt (ficha pede 64–68), vão de 8pt, caixa de ícone 48×48, borda do selecionado 2pt amarela + halo, CTA 56pt — todos batendo com a ficha §13 (ver tabela G-07b abaixo). `lado-a-lado` bate em proporção/cores/iconografia com a prancha. G-11 (CTA visível sem rolar) = true nas 4 larguras. 0 overflow, 0 sobreposição, 0 texto truncado, 0 contraste reprovado nas 16 combinações. |
| P06 confirmação | 7 (18/11) | **9** | As 6 lacunas da ficha §11 fechadas, conferidas lendo o código E capturando a tela: cartão chapado → `SurfaceRaised` com borda iluminada; 2 selos na linha do título → 1 selo embaixo do cartão; carro/origem amarelos e destino laranja → `map.pickup`/`map.destination`/ícone `textSecondary`; preço em `subtitle` → `heading` (N2 real); aviso de falta em texto solto → `InlineAlert tone="warning"`; margem fora da escala corrigida. CTA fixo no rodapé (G-11 = true em 320×568). Fluxo real prova preço igual P05→P06→recibo (ver mutação) e segundo toque no CTA não duplica nem trava o pedido. |

## Fluxo real provado (não só devSeed)

A Lyra só tinha provado pelo `?devSeed=1` direto na rota. Eu refiz pelo clique de verdade, com sessão
real criada pelo gancho de identidade:

- Home → **Casa** (endereço salvo) → navega direto para `/categoria`, painel mostra "Escolha uma
  categoria" com a cotação já carregada.
- Mesmo resultado trocando por **Trabalho**.
- **Favoritos** (sem endereço fixo) → vai para `/destino`, como o código documenta — não tenta abrir
  P05 sem destino.
- Em P05, selecionar **Conforto** (R$ 24,90, a 2ª/mais cara — escolhida de propósito para não coincidir
  com a 1ª por acaso) → "Continuar" → P06 mostra **R$ 24,90**, a categoria selecionada, não a 1ª.
- Em P06, **dois cliques rápidos** em "Solicitar corrida" (`Promise.all` dos dois cliques) resultam em
  **uma única navegação** para `/buscando`, sem erro de página e sem avanço de fase duplicado/errático
  na simulação seguinte — G-13/§13 ("segundo toque não gera segundo pedido") confirmado por
  interação, não só por leitura do guard `submitting` no código.
- Deixei a simulação correr até `/concluida`: o cartão de tarifa final mostra **R$ 26,80**
  (`baseFare` de Conforto, 24,90, **+** a taxa de serviço fabricada de 1,90 — `buildMockReceipt`,
  comportamento documentado, não um erro de cálculo) — ou seja, o preço da categoria **pedida**
  (Conforto) propagou corretamente da P05 até o recibo, não o da 1ª categoria da cotação (Vuumbora,
  18,90, que teria dado R$ 20,80).

## Regressão provada por mutação (edição real no disco + restart do Metro)

Rodei cada checagem no código real (passa), apliquei a mutação (pega), revertive confirmei:

1. **Categorias só da cotação.** `packages/api-client/.../mock-adapter.ts`: mudei `pet` de
   `enabled: false` para `enabled: true`. Antes: DOM tinha só `vuumbora`/`conforto` (motorista_mulher,
   entrega e pet ausentes). Com a mutação: `pet` passou a aparecer no DOM. Revertido.
2. **Preço igual P05→P06.** `confirmacao.tsx`: troquei
   `quoteCategories.find(c => c.categoryId === categoryId)` por `quoteCategories[0]` (sempre a 1ª,
   ignorando a seleção). Antes: selecionando Conforto em P05, P06 mostrava R$ 24,90. Com a mutação:
   P06 passou a mostrar R$ 18,90 (a 1ª, errada). Revertido.
3. **Recibo pela `requestedCategory`.** `useRideRequestStore.ts`, `onCompleted`: troquei
   `get().requestedCategory` por `get().quoteCategories[0]`. Antes: pedindo Conforto, o recibo mostrava
   R$ 26,80. Com a mutação: o recibo passou a mostrar R$ 20,80 (preço de Vuumbora, a 1ª da cotação,
   não o que foi de fato pedido). Revertido. Este trecho não foi tocado pelo diff desta onda (`git show
   --stat` mostra só 4 linhas adicionadas em `useRideRequestStore.ts`, nenhuma removida), mas o pedido
   do Atlas foi provar com mutação mesmo assim — feito.

## Tabela G-07b (ficha P05 §13) — 8 pontos medidos contra a prancha

| Item da ficha | Pedido | Medido (DOM real, 390×844 salvo exceção) |
|---|---|---|
| Altura da linha de categoria | 64–68pt | **68pt** (320×568 e 390×844) |
| Vão entre linhas | 8 | **8pt** |
| Caixa de ícone | 48pt | **48×48px** (a 320px, categoria sem ilustração de veículo) |
| Raio da caixa de ícone | 12 (ficha) | **16px** (`radius.lg`) — divergência **documentada no código**: "pedido do dono: a caixa acompanha a curvatura do card" (`RideCategoryCard.tsx`), não é defeito |
| Borda do selecionado | 2pt amarelo | **2px, `rgb(255,204,0)`** |
| Halo do selecionado | glow | `boxShadow` com cor presente (`theme.glow.selected`), confirmado visualmente |
| CTA | 56pt | **56px** (320×568) |
| CTA visível sem rolar (G-11) | sim, 320×568 | **true** nas 4 larguras, P05 e P06 |

## Triagem dos achados automáticos das sondas (nenhum é regressão)

- **`semIndicadorDeFoco` no balão "‹ voltar" da P05 — falso negativo da sonda, confirmado por
  `getComputedStyle` depois de Tab de verdade** (pedido explícito do Atlas, por aviso da Lyra). A sonda
  mede cobertura de pixel do anel; o balão usa `focusRingStyle('outside', ...)` (anel FORA do
  elemento), que a heurística de cobertura não captura. Testei com Tab real repetido: o elemento com
  `aria-label="Voltar e editar o trajeto"` recebe `outline: rgb(255, 204, 0) solid 2px` ao focar —
  funciona. O mesmo padrão de "2 sem indicador" já aparece em P04 (já aprovada, onda 2) com a sonda
  rodando no código-base — ruído pré-existente da ferramenta, não desta fatia.
- **`corForaDoConjunto: rgb(242,242,242)`** — presente igualmente em P04 (já aprovada); é ruído de
  fundo (provável artefato de scrollbar/root do RN Web), não um elemento de produto pintado fora do
  conjunto de tokens.
- **`possivelLegado` em P06 (1 ocorrência)** — inspecionei o elemento exato: é o círculo de seleção
  (24×24, `radio`/`radioSelected`) de `PaymentMethodOption` quando marcado — fundo amarelo sólido +
  borda amarela nas 4 bordas (indicador de "selecionado", decisão de design), não um card chapado
  "legado". A própria sonda documenta esse achado como indício para revisão humana, não reprovação.
- **`contagemAmarelo: 2` em P05`** — o 2º bloco amarelo é o `checkBadge` (selo de check na categoria
  selecionada) do `RideCategoryCard`, componente **não tocado por este diff** (`git show --stat`: a
  renomeação `home/RideCategoryCard.tsx → categoria/RideCategoryCard.tsx` teve 0 linhas alteradas) —
  já existia antes da onda 3.

## Produção: `?devSeed` não sobrevive ao bundler

`npx expo export --platform web` sem `--dev`, `VUUMBORA_BUILD_PROFILE=production`,
`EXPO_PUBLIC_API_URL=https://...` (exigido pelo `metro.config.js` em build de produção). `grep` nos
bundles minificados das rotas `categoria` e `confirmacao`: **0 ocorrências de `__DEV__` e 0 de
`devSeed`** nos dois — o hook `useDevRideSeed` inteiro foi eliminado por dead-code-elimination, não só
o texto do gate. Mesmo padrão já provado para a M05b ([[feedback-producao-devdev-eliminado-no-bundle]]).

## Verificações de projeto

`npm run check` (boundaries + docker-context + typecheck) no monorepo: `check-boundaries` e
`check-docker-context` OK; `typecheck` falha em `apps/driver` (`mapbox-check.web.tsx`, import de CSS
sem declaração de tipo) — **confirmado pré-existente**: o mesmo erro aparece rodando `typecheck` na
cópia "antes" (`c971581`, antes desta fatia). `apps/driver` não é tocado pelo diff desta onda. Não
bloqueia este portão, mas vale uma missão de limpeza à parte.

## Lacunas (não bloqueiam, registradas para quem vier depois)

- **Estados "vazio" e "erro" da P05 não têm gancho para provocar sem editar código.** O mock
  (`createMockPassengerRidePort()`) é chamado sem `options.isOutsideServiceArea`, e as categorias
  habilitadas (`vuumbora`/`conforto`) sempre respondem pra qualquer par origem/destino — não existe
  hoje um endereço ou flag acessível pela UI que force `quoteStatus: 'error'` ou uma cotação com 0
  categorias. Confirmado por leitura de `mock-adapter.ts`; não tentei contornar editando código, como
  pedido. Fica como lacuna de teste, não como defeito da tela (o componente `EmptyState`/`ErrorState`
  já existe e está correto por leitura).
- Contraste da rota amarela sobre o mapa (ficha: "previsto 10,5:1") não foi medido numericamente — é
  um elemento decorativo sem texto, fora do escopo da sonda de contraste (que mede texto/fundo). Visual
  a olho bate com a prancha.

## Processos e portas

Nenhum processo deixado ao final (`expo start --web` fechado por `server.close()` em cada script,
confirmado por `netstat` só com `TIME_WAIT`). Portas usadas: 10601 (acima de 10500, como pedido).
Scripts ad hoc e cópias ficaram só no scratchpad, nada no repositório real.
