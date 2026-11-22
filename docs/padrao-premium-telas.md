# Padrão premium das telas do VuumBora

Autor: Apolo · 22/11/2026 · origem: decisão 4 do dono em 22/11/2026 (`docs/decisoes-do-dono.md:945-947`)

**O que é:** a régua única que toda tela dos apps (passageiro e motorista, React Native para Android e iOS) e do painel
administrativo (web) precisa cumprir antes de ser dada como pronta. Ela junta o que já estava decidido e espalhado em seis
documentos e o transforma em **critério medível**.

**O que não é:** não muda nenhum HEX aprovado e não decide regra de negócio. Onde uma tela depende de decisão do dono, a ficha diz
qual é e manda não construir o conteúdo antes dela.

**Status:** proposta. Nada foi aplicado em código nem em tokens. Nada foi visto renderizado nesta tarefa: tudo o que diz "hoje"
saiu da **leitura do código** (arquivo:linha) e das medições registradas em `docs/auditoria-premium.md` (18/11/2026, Expo Web).

Documentos irmãos:

- `docs/fichas-de-tela/README.md`: índice, template da ficha, inventário de todas as telas e ordem de tratamento.
- `docs/fichas-de-tela/P01…P06`, `M01…M05`: fichas completas.

Fontes (a hierarquia é esta; em conflito, vale a de cima):

0. **Alvo visual do dono, 22/11/2026:** `VuumBora_Claude_Design_System/referencias/alvo_passageiro_2026-11-22.png` e
   `alvo_motorista_2026-11-22.png` ("Quero telas neste padrão de layout e qualidade"). **A prancha manda no VISUAL**
   (layout, hierarquia, espaçamento, cartões, ícones, barra inferior). **Conteúdo e função seguem as decisões do dono**
   (`docs/decisoes-do-dono.md`). Onde as duas divergem, vale a tabela da §18. As pranchas passam à frente das
   `*_telas_premium.webp` de 18/11 como referência de layout.
1. `VuumBora_Claude_Design_System/DESIGN_SYSTEM_MESTRE.md`, `especificacoes/PASSAGEIRO.md`, `especificacoes/MOTORISTA.md`
2. `VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json` (fonte única de valores; `packages/tokens/src/index.ts` só converte)
3. `docs/decisoes-do-dono.md`
4. `docs/direcao-de-arte.md`, `docs/auditoria-premium.md`, `docs/movimento.md`, `docs/responsividade.md`, `docs/tipografia.md`
5. `docs/escopo-telas.md` (⚠ desatualizado: é de 18/11 e dá como "não existe" telas que já existem; usar só a §3 e a §4)
6. `docs/padrao-visual-site.md` (vale para o site; daqui só o método, não os números)

---

## 0. Decisões em aberto que este padrão expõe

| # | Assunto | Por que importa | Quem decide |
|---|---|---|---|
| **PP-1** | **Tipografia dos apps: Poppins ou Plus Jakarta Sans?** | O briefing desta tarefa diz Poppins, e o plano mestre também (`docs/plano-mestre.md:175`, portão 4.3, item 4). O registro diz outra coisa: "Plus Jakarta Sans confirmada" (`docs/decisoes-do-dono.md:273`, `docs/direcao-de-arte.md:394`). O código também: os dois apps carregam Jakarta (`apps/passenger/app/_layout.tsx:8-11`, `apps/driver/app/_layout.tsx:8-11`), e o painel também (`apps/admin/src/styles/global.css:17`). Poppins é a fonte **do site** (`docs/padrao-visual-site.md:65`). **Risco medido:** a Poppins não tem algarismos tabulares. "11" e "88" a 40 px dão 31,0 e 52,3 px **com e sem** `tabular-nums` (`docs/especificacao-formulario-e-secoes.md:57-59`). No app isso faz preço, ETA, contador da oferta, placa e ganhos "dançarem" a cada atualização. A Jakarta tem `tnum` real (`docs/tipografia.md:33-34`). **DECIDIDO pelo dono em 22/11/2026: apps e painel com Plus Jakarta Sans; o site continua com Poppins ("no app diferente do site").** As regras abaixo que dizem "se PP-1 = Poppins" não se aplicam aos apps | Dono (decidido) |
| PP-2 | Categorias e "Solicitar corrida" saem do início (P03) e vão para a P05 | A P03 da spec não tem categoria (`PASSAGEIRO.md`, linha P03). Mostrar preço antes de existir rota é um número sem base. A referência premium também não tem categoria no início | Atlas (fluxo), avisando o dono |
| PP-3 | P05 e P06 viram uma tela só (mapa + painel com categoria, pagamento e CTA), com a revisão como segundo estado do painel | Na referência premium, "Escolha uma categoria" e "Confirmar corrida" ficam na mesma tela. Hoje são 3 toques e 2 telas para a mesma decisão | Atlas |
| PP-4 | A oferta de corrida (M06) sai de dentro do painel do motorista e vira tela cheia | Na referência é tela cheia. Dentro do painel, ela divide atenção com mapa, banner, métricas e atalhos, e o contador de 15 s some na rolagem | Atlas |
| PP-5 | O motorista começa **offline**, e `registrationApproved` deixa de ser `true` fixo | Hoje começa online e aprovado (`apps/driver/app/(app)/index.tsx:48,54`), enquanto o aviso da mesma tela diz que o cadastro nem abriu (`RegistrationNotice`). A regra da spec é "não permitir online antes de cadastro e documentação aprovados" (`MOTORISTA.md`, regras de interação) | Atlas |
| PP-6 | Banner com "Motoristas verificados e suporte 24h" e "10% OFF na sua 1ª corrida" sai do início | São exatamente as três promessas que o design system proíbe (`DESIGN_SYSTEM_MESTRE.md` §9). O selo "promoção fictícia" não basta, porque a frase continua prometendo (`apps/passenger/src/components/home/SafetyPromoBanner.tsx:34-35,42-45`) | Atlas (remoção); o dono decide se algum dia existe |
| PP-7 | Tokens que a direção de arte propôs e nunca entraram no JSON: `gradient.promo`, `tint.yellowSoft`, `map.*` (camadas), `map.balloon`, `chart.*` e `motion.*` (novo) | Sem eles, cada tela improvisa: o banner "Alta demanda" ficou amarelo (`HighDemandBanner.tsx:7-8`) porque não havia o navy de promoção | Atlas (é acréscimo, nenhum HEX aprovado muda) |
| PP-9 | Navegação do passageiro: barra de abas ou menu? | A prancha do passageiro **não tem barra de abas** em nenhuma tela: o início tem menu (☰) e sino. A do motorista tem barra de 4 abas (Início, Ganhos, Histórico, Perfil). Hoje o passageiro tem barra de 4 abas, e a aba "Mensagens" não faz nada (`apps/passenger/app/(app)/index.tsx:57-63`). Recomendo seguir a prancha: ☰ abre um menu com Viagens, Carteira (quando existir), Perfil, Configurações e Ajuda. O motorista fica com a barra da prancha | Atlas (muda a navegação) |
| PP-8 | Dependências novas: `react-native-reanimated` (movimento), `@react-native-community/netinfo` (estado "sem rede") e `expo-haptics` (resposta tátil) | O `docs/movimento.md` pede o Reanimated, e ele não está instalado. Sem o NetInfo, o estado "sem rede" só aparece depois que uma chamada falha | Atlas |

---

## 1. Princípios (o que faz uma tela do VuumBora parecer cara)

Em ordem de peso, como medido na direção de arte (`docs/direcao-de-arte.md` §2):

1. **Um amarelo por área de decisão.** O CTA é o único bloco amarelo. Fora dele, o amarelo aparece só como **sinal**: o traço de
   um ícone de atalho, o item ativo da barra de abas, a rota no mapa, o anel de foco, a estrela da avaliação e o link de texto.
   Nunca é fundo de tela, nunca fica atrás de texto branco e nunca aparece em parágrafo.
2. **Luz de cima.** Todo card, campo, linha de lista e botão secundário tem a borda de cima mais clara (`role.edgeTop`) que as
   outras (`role.edgeBottom`). Card "chapado" (borda igual nos quatro lados ou sem borda) é defeito.
3. **Uma tela, uma pergunta.** Cada tela responde a uma pergunta do usuário ("para onde vou?", "quanto custa?", "cadê o
   motorista?"). O que não ajuda a responder vai para outra tela. A tela mais cheia do produto hoje, o painel do motorista, tenta
   responder a seis.
4. **Número antes de enfeite.** Preço, ETA, placa e ganho são a informação; ilustração, gráfico e mapa dão contexto. O número
   vem em texto grande e tabular, e o enfeite nunca o empurra para fora da primeira dobra.
5. **Honestidade visível, sem poluir.** Dado de demonstração leva o `MockBadge` (chip neutro tracejado). Um selo por bloco, nunca
   na mesma linha do título, nunca sobre amarelo e nunca como desculpa para prometer o que o design system proíbe (§9 do mestre).
6. **O mapa é protagonista na corrida.** Da P05 à P10 e da M05 à M10, o mapa ocupa o topo e as informações sobem num painel
   inferior. Tela de corrida sem mapa parece protótipo (auditoria: `/em-andamento` nota 3).
7. **Movimento que explica.** Todo toque responde em menos de 100 ms. A animação mostra de onde veio e para onde foi, e com
   "reduzir movimento" ligado vira troca de opacidade (`docs/movimento.md`).
8. **Consistência é o padrão; exceção precisa de motivo escrito.** Se duas telas resolvem o mesmo problema de dois jeitos, uma
   delas está errada.

---

## 2. Hierarquia

Toda tela é lida em até **cinco níveis**. A ficha declara, para cada elemento, em que nível ele está. Uma tela com dois
elementos no nível 1 está errada.

| Nível | O que é | Tratamento | Limite por tela |
|---|---|---|---|
| **N1: Ação** | O CTA primário | `PrimaryButton` (gradiente `gradient.cta`, 56 pt; 52 com altura < 640) | **1** por área de decisão (um por tela, ou um por painel inferior) |
| **N2: Resposta** | A informação que a tela existe para dar (título, preço, ETA, placa, total do dia) | `heading` ou `title` em negrito; número com `tabularNums` | 1 |
| **N3: Apoio** | O que contextualiza a resposta (endereço, categoria, nome do motorista) | `body`/`small`, `textPrimary` ou `textSecondary` | livre |
| **N4: Ação secundária** | Voltar, cancelar, ações alternativas | `SecondaryButton`, `DangerButton` (contorno), `LinkButton` | até 3 visíveis |
| **N5: Metadado** | Selo de mock, legenda, hora, rótulo | `caption`, `textMuted` | livre |

**Regras de amarelo (contáveis).** Por tela: no máximo **1 bloco** amarelo (CTA ou carteira, se existir), mais sinais. Sinais
permitidos: ícone de atalho principal; aba ativa; rota; marcador de embarque da marca; estrela de avaliação; anel de foco e borda de
campo focado; `LinkButton`; borda e halo do item selecionado; o "VuumBora!" do título da P01. **Proibido:** título de seção
amarelo, ícone de linha de lista amarelo (regra de `docs/direcao-de-arte.md` §3.1), texto de apoio amarelo, pílula cheia
amarela que não seja o CTA e `MockBadge` sobre amarelo.

**Destrutivo e neutro não se confundem** (`docs/direcao-de-arte.md` §3.1): cancelar corrida e sair da conta usam `DangerButton`
(contorno vermelho, fundo a 10%, `ButtonCore.tsx:125-139`). Recusar oferta é neutro e usa `SecondaryButton`.

---

## 3. Espaçamento e grade

Grade de **4 pt**. Todo espaço vem de `theme.spacing` (`tokens.json` `spacing.0…10` = 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64).
Valor fora da escala (ex.: `marginTop: 2` em `confirmacao.tsx:136`) é defeito, salvo ajuste óptico de 1 a 2 pt documentado no
comentário.

| Medida | Valor | Token |
|---|---|---|
| Margem lateral da tela | 20 pt (16 pt com largura < 375) | `layout.screenPadding` / `layout.screenPaddingCompact`. ⚠ Hoje o `AppShell` aplica 20 fixo (`AppShell.tsx:95`). O token compacto existe e ninguém usa |
| Entre seções da tela | 20 pt | `spacing.5` (já é o `gap` do início, `index.tsx:125`) |
| Entre título de seção e conteúdo | 12 pt | `spacing.3` |
| Entre itens de lista ou cards irmãos | 8 pt | `spacing.2` |
| Padding interno de card | 16 pt | `spacing.4` (o `DriverInfoCard` com 12 está fora; auditoria A1) |
| Entre rótulo e campo | 4 a 8 pt | `spacing.1`/`spacing.2` |
| Entre campos de formulário | 16 pt | `spacing.4` (já é o `form` do login, `login.tsx:205`) |
| Grupo de ações (CTA + secundário) | 12 pt | `spacing.3` |
| Respiro do CTA fixo ao indicador de gestos | 8 pt acima da safe area inferior | `spacing.2` |

**Raio:** campo, botão e linha de lista com `radius.md` (12). Card, atalho e painel interno com `radius.lg` (16). Pílula de
destino com `radius.xl` (20). Painel inferior com `radius.xxl` (24) só nos cantos de cima. Selo e chip com `radius.pill`.

**Larguras-alvo** (`docs/responsividade.md`): 320, 360, 375, 390/393 e 430. Altura curta: 568. Tablet (≥ 600) não é alvo, mas o
conteúdo fica centralizado com largura máxima de 480 pt e não pode quebrar feio. ⚠ Nenhum componente limita essa largura hoje.

**Comportamento por largura (regra geral, cada ficha detalha):**

- < 360: grades de 3 ou 4 colunas viram 2×2 ou lista. Texto de 2 colunas lado a lado empilha.
- 360 a 429: o layout padrão.
- ≥ 430: nada estica além de 480 pt de conteúdo útil. Número em dinheiro não pode depender da largura para caber.

---

## 4. Tokens: papel de cada um

Componentes consomem **papéis** (`theme.role.*`, `packages/tokens/src/index.ts:128-166`), nunca HEX. O
`scripts/check-boundaries.mjs` barra HEX solto no commit.

| Papel | Token | Uso | Nunca |
|---|---|---|---|
| `role.screen` | `background.base` `#070D18` | Fundo de toda tela | — |
| `gradient.screen` | `#0E1A2E → #070D18` | Brilho de topo (`AppShell glow`) em toda tela **sem mapa** | Sobre mapa ou foto |
| `gradient.surfaceRaised` + `role.edgeTop`/`edgeBottom` | `SurfaceRaised` | Card, atalho, linha de lista | Card com `role.surface` chapado |
| `gradient.surfaceOverlay` | — | Botão secundário, botão de ícone, CTA desabilitado | — |
| `role.surface` | `#111B2A` | Painel inferior e barra de abas (com `elevation.3`) | Card |
| `role.surfaceElevated` | `#192536` | Pastilha de avatar e de ícone neutro, pressionado | — |
| `role.input` | `#1F2B3D` | Fundo de campo | — |
| `gradient.searchLight` + `role.textOnLight` | claro | **Só** a pílula de destino (P03) | Outro elemento claro |
| `gradient.cta` + `role.ctaText` | amarelo + navy | Só CTA | Texto branco sobre amarelo (1,45:1) |
| `role.glassOnMap` | `rgba(17,27,42,.88)` | Chip, balão e botão sobre mapa, **sem blur** | `expo-blur` |
| `gradient.photoScrim` | — | Atrás de todo texto sobre foto (P01) | Foto sem scrim |
| `role.textPrimary` / `textSecondary` / `textMuted` | 17:1 / 9:1 / 6:1 sobre a base | Título / apoio / metadado | `textMuted` sobre `gradient.promo` (3,97:1) |
| `role.borderControl` | `#66768E` | Limite de controle (campo, toggle, checkbox): único que passa 3:1 | Borda decorativa |
| `role.success` / `danger` / `warning` / `info` | — | Texto e ícone de estado; `StatusBadge` tingido | Preenchimento com texto branco |
| `role.dangerFill` | `#D02A38` | Borda de erro, contorno do `DangerButton` | Fundo cheio de botão |
| `map.route` / `pickup` / `destination` / `userLocation` | amarelo / verde / vermelho / azul | **Marcadores de rota em toda tela**, no mapa **e** fora dele | Ver o defeito abaixo |

⚠ **Defeito de consistência medido no código:** fora do mapa, a origem aparece como **disco amarelo** e o destino como **pino
laranja** (`role.warning`) em `destino.tsx:74`, `confirmacao.tsx:46,53`, `buscando.tsx:76`, `a-caminho.tsx:71` e
`concluida.tsx:97`. O design system diz embarque verde e destino vermelho (`DESIGN_SYSTEM_MESTRE.md` §3, `tokens.json`
`map.pickup`/`map.destination`). Quando o mapa real entrar, a mesma origem vai aparecer verde no mapa e amarela na lista. Regra:
**marcador de origem = `map.pickup` (círculo), marcador de destino = `map.destination` (pino)**, em toda tela.

**Tokens que faltam (PP-7).** Propostos em `docs/direcao-de-arte.md` §4 e nunca acrescentados ao JSON:

| Token | Para quê | Telas |
|---|---|---|
| `gradient.promo` (`#1D3A66 → #0F213D`, 135°) | Banner informativo, aviso de demanda | M05, P03 (se algum banner sobreviver) |
| `tint.yellowSoft` (`rgba(255,204,0,.10)`) | Pastilha atrás do ícone amarelo de atalho | P03, M05 |
| `map.land/block/roadMinor/roadMajor/water/park/label/balloon` | Estilo do Mapbox (decisão 1: Mapbox) | P03 a P10, M05 a M10 |
| `chart.barActive/barInactive/barMock/grid/label` | Gráfico de ganhos | M11 |
| `motion.duration.{instant:120, fast:150, base:200, panel:250, screen:300, pulse:1400}` e `motion.easing.{out, inOut, linear}` | Movimento sem número mágico | todas |
| `layout.contentMaxWidth` (480) | Largura máxima em tablet e em tela grande | todas |
| `layout.sheetHandle` (36×4) e `radius` do painel inferior | `BottomSheet` | P05 a P10, M06 a M10 |

---

## 5. Tipografia

> A família está em aberto (PP-1). Este padrão é escrito por **papel**: todo texto passa por `textStyle(peso, tamanho)`
> (`packages/ui/src/typography.ts:31-38`). A família, seja qual for, muda em **um** token (`typography.family`) e em **um**
> `useFonts` por app. Nenhuma tela precisa ser reescrita para trocar de fonte.

| Papel | Chamada | Corpo / altura de linha | Uso |
|---|---|---|---|
| Display | `textStyle('bold','display')` | 34 / 44 | Total de ganhos (M11), valor final (P10) |
| Heading | `textStyle('bold','heading')` | 28 / 36 | Título de entrada (P01, P02, M01, M02), ETA em destaque |
| Title | `textStyle('bold','title')` | 22 / 29 | Título de tela no `ScreenHeader` |
| Subtitle | `textStyle('semibold','subtitle')` | 18 / 23 | Preço em linha, título de estado vazio |
| Body | `textStyle('regular','body')` · `semibold` em rótulo de botão | 16 / 21 | Texto corrido, campo, botão |
| Section | `textStyle('bold','body')` | 16 / 21 | Título de seção |
| Small | `textStyle('regular','small')` | 14 / 18 | Apoio, endereço, erro de campo |
| Caption | `textStyle('medium','caption')` | 12 / 16 | Metadado, rótulo de métrica, selo |

Regras:

1. **Número que muda leva `tabularNums`** (`typography.ts:58`): preço, ETA, distância, contador, placa, hora, ganhos e nota. Se
   a decisão PP-1 for Poppins, isso deixa de funcionar e cada número precisa de **caixa de largura fixa, alinhada à direita**
   (solução do site, `docs/especificacao-formulario-e-secoes.md` §5), que precisa ser medida tela a tela.
2. **Título de tela pode quebrar em 2 linhas.** Hoje o `ScreenHeader` corta em 1 (`ScreenHeader.tsx:21`), e o rótulo do botão
   também (`ButtonCore.tsx:190`). Com fonte a 200%, "Confirmar corrida" e "Solicitar corrida" viram reticências. Regra: título
   com `numberOfLines={2}`, rótulo de botão com quebra permitida e altura mínima no lugar de altura fixa. **Informação nunca
   termina em reticências:** endereço pode, preço e placa não.
3. **Nunca limitar a escala de fonte do sistema** (`maxFontSizeMultiplier`/`allowFontScaling={false}`). Hoje ninguém limita, o
   que está certo. A tela é que precisa aguentar 200%.
4. **Peso mínimo 400 sobre fundo escuro.** Não existe peso light (regra já em `typography.ts:8-9`).
5. **Glifo do sistema só onde já é regra** (✓ ✕ ! i • em selo e alerta, `typography.ts:11-17`). Seta, estrela, círculo de
   estado vazio e ícone de ação usam **lucide**. Hoje violam: o "‹" do `ScreenHeader` (`ScreenHeader.tsx:50`), o "○" do
   `EmptyState` (`EmptyState.tsx:18`), o "✕" grande do `ErrorState` (`ErrorState.tsx:78`) e o ★/☆ padrão do `StarRating`
   (`StarRating.tsx:58`; a P10 já passa o lucide pela prop `icon`).
6. **Título grande com tracking levemente negativo** (−0,2 a −0,5 pt em `heading`/`display`) é o detalhe que mais separa
   "acabado" de "amador" no site (`docs/padrao-visual-site.md` §2). Nos apps, isso **não está em token** e pede o acréscimo de
   `typography.tracking` antes de alguém escrever `letterSpacing` solto.

---

## 6. Elevação

| Nível | Token | Onde | Observação |
|---|---|---|---|
| 0 | — | Conteúdo direto no fundo | — |
| 1 | `elevation.1` | Card sobre fundo | Quase invisível; quem separa é a borda de cima |
| 2 | `elevation.2` | Tudo que fica **sobre mapa ou foto**: pílula de destino, balão, chip, cartão de instrução | Aqui a sombra importa |
| 3 | `elevation.3` (para cima) | Painel inferior, barra de abas, rodapé de CTA fixo | — |
| CTA | `elevation.cta` + aro interno | Só o `PrimaryButton` | Sem halo amarelo (medido: não existe na referência) |
| Selecionado | `glow.selected` + borda 2 pt `brand.yellow` | Categoria, pagamento, oferta em foco | Um item selecionado por grupo |

Sem blur. Sem sombra colorida. Sem animar sombra. **Android:** `boxShadow` e gradiente ainda não foram provados em aparelho
(`docs/direcao-de-arte.md` §5; `ButtonCore.tsx:46-52`). Até essa prova, o portão de toda tela com elevação 2 ou 3 inclui a
captura em emulador Android (§11, G-24).

---

## 7. Movimento

Resumo operacional de `docs/movimento.md` (a fonte continua sendo ele):

| Interação | Duração | Curva | Componente |
|---|---|---|---|
| Toque (botão encolhe para 0,97 e escurece) | 120 ms | saída rápida | `ButtonCore`, linhas e cards tocáveis. ⚠ Hoje só troca a cor (`ButtonCore.tsx:183-209`) |
| Seleção (borda acende e o card sobe 2 pt) | 150 ms | saída | categoria, pagamento |
| Foco de campo (borda amarela) | 150 ms | — | `InputCore` (hoje troca seco, `InputCore.tsx:123`) |
| Erro de campo (mensagem desce) | 200 ms | saída suave | `InputCore` |
| Painel inferior abre e fecha | 250 ms | entrada e saída | `BottomSheet` (não existe) |
| Troca de tela | 300 ms | entrada e saída | `stackScreenOptions` de cada app |
| Pulso de busca | 1400 ms em laço | senoidal | `SearchingPulse` (já respeita "reduzir movimento") |
| Esqueleto | 1200 ms (600 + 600) | inOut | `LoadingSkeleton` (já respeita, `LoadingSkeleton.tsx:31-32`) |

Regras: nada acima de 400 ms em interação direta; no máximo 2 elementos animando na mesma área; nunca bloquear toque durante
a animação; nunca animar entrada em tela vista dezenas de vezes por dia (início, painel do motorista). **Com "reduzir
movimento":** sem deslocamento nem escala, só opacidade em 150 ms; pulso e esqueleto param.

**Resposta tátil** (depende do PP-8): leve no aceite de oferta, na confirmação de corrida e no envio de avaliação; de aviso na
oferta que expira e no erro de formulário. Nunca em rolagem nem em digitação.

---

## 8. Ícones

- **Biblioteca única:** `lucide-react-native` (já usada nos dois apps) e `lucide-react` no painel. Ícone de outra família só para
  marca de terceiro (logo do Pix, que mantém a cor da marca dele; `docs/direcao-de-arte.md` §2.1).
- **Tamanhos:** 14 (marcador em linha), 18 (dentro de campo), 20 (botão, atalho, linha de lista), 22 (barra de abas), 24
  (cabeçalho, voltar, ação de topo). Ícone grande de estado vazio ou erro: 32 dentro de pastilha de 56.
- **Traço:** 1,75 em repouso; 2,25 no item ativo (padrão já usado na barra de abas, `index.tsx:55`). Ícone dentro do CTA: 2,25
  em `role.ctaText`.
- **Cor:** `textSecondary` em linha de lista e métrica; `textMuted` em campo; `textPrimary` no cabeçalho; `brand.yellow` só nos
  sinais da §2. Estado sempre com ícone **e** texto, nunca só cor.
- **Alvo:** ícone tocável fica dentro de caixa de 44×44 no mínimo, mesmo quando o desenho tem 20.
- **Carro de frente** (caixa de veículo da P05): o lucide não tem. O SVG da maquete (`tools/art-assets/home-premium.html`) vira
  componente (pedido de componente C-11).

---

## 9. Imagens e ilustração

| Asset | Onde | Regra |
|---|---|---|
| `backgrounds/onboarding-noturno.jpg` (`OnboardingBackground`) | Só P01 | Sempre com `gradient.photoScrim` atrás do texto. ⚠ Base da foto é preto neutro, não navy (auditoria B2); medir em 430×932 |
| `map/mapa-escuro-natal.jpg` (`MapPreviewBackground`) | Porta de mapa até o Mapbox | É ilustração: chip "mapa ilustrativo" **fora** dos controles (auditoria H1, ainda aberta em `HomeMapPreview.tsx:92`) |
| `vehicles/veiculo-*.png` (`VehicleIllustration`) | Linha de categoria ≥ 360 pt | Fundo preto aceito pelo dono por ora (`docs/direcao-de-arte.md` §11.2) |
| Logo (`BrandLogo`) | lockup só na P01, P02 e M01/M02; horizontal pequeno (28 a 30 pt) nas telas internas; nenhum nas telas de corrida | Nunca sobre amarelo (`BrandLogo.tsx:48-55`). ⚠ O lockup tem largura fixa (`BrandLogo.tsx:36`: 160/240/320) e não encolhe com o container. O `lg` de 320 não cabe nos 280 úteis de uma tela de 320 de largura com altura ≥ 640 (`boas-vindas.tsx:48`) |
| Rosto de pessoa | **Nunca gerado por IA, nunca banco de imagens** dentro do app | Avatar = inicial do nome sobre disco (`Avatar`) até o usuário enviar a foto. Foto de motorista só a real e verificada (`docs/direcao-de-arte.md` §3.4). ⚠ `driverDemoAvatarSource` (`apps/driver/app/(app)/index.tsx:95`) precisa ser conferido: se for um rosto, sai |

Formatos: PNG com `@2x`/`@3x` para ilustração com transparência; JPG em qualidade 80 para foto; SVG via componente para ícone
e marcador. Toda imagem com `accessibilityLabel` ou marcada como decorativa (`accessible={false}`).

---

## 10. Tom de voz

**Quem fala:** um motorista de confiança de Natal. Direto, cordial e sem gíria de app. Trata por **você**.

| Regra | Sim | Não |
|---|---|---|
| Botão é verbo no infinitivo, com o objeto quando cabe | "Solicitar corrida", "Ficar online", "Enviar avaliação" | "OK", "Confirmar" sozinho em tela com mais de uma confirmação |
| Título responde à pergunta da tela | "Para onde vamos?", "Seu motorista está a caminho" | "Tela de destino" |
| Erro diz **o que houve e o que fazer**, sem culpar | "Sem conexão. Confira a internet e tente de novo." | "Erro 503", "Você digitou errado" |
| Estimativa é chamada de estimativa | "Preço estimado", "Chega em cerca de 5 min" | "R$ 23,90" sem rótulo antes da cotação real |
| Conta não é cadastro (motorista) | "Criar conta", "cadastro de motorista é outra etapa" | "Cadastre-se como motorista" na tela de conta |
| Candidatura é a do site; cadastro é a etapa futura | (ver memória `vuumbora-candidatura-vs-cadastro`) | usar uma pela outra |
| Promessa só do que existe | "Atendimento por WhatsApp" (quando o canal estiver ligado) | "Suporte 24h", "motorista verificado", "10% OFF", "saque imediato" (`DESIGN_SYSTEM_MESTRE.md` §9) |
| Número em pt-BR | `Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})`, "2,3 km", "10:24" | "R$23.90", "2.3km" |
| Selo de mock em minúsculas, curto e específico | "preço de demonstração" | "MOCK", "dados fake" |

Um fato, um bloco: a mesma promessa ou o mesmo aviso aparece **uma vez** por tela (lição do site, 20/11/2026).

---

## 11. Áreas seguras, teclado e orientação

- **Toda tela parte do `AppShell`** (`packages/ui/src/AppShell.tsx`), que aplica a safe area em todas as bordas, ou em três
  quando há `footer` (`AppShell.tsx:8-9,61`). Tela que monta `SafeAreaView` própria é defeito.
- **Conteúdo sobre mapa** (pílula, botão de localizar, balão) respeita a safe area de cima. O mapa em si sangra até a borda,
  inclusive embaixo do recorte da câmera.
- **CTA fixo no rodapé** (pedido C-04, `FooterActions`) fica acima do indicador de gestos com 8 pt de respiro, ganha
  `elevation.3` quando há conteúdo rolando por baixo e **nunca cobre** o último campo nem a última informação. Em 568 pt de
  altura, o CTA principal da tela precisa estar visível sem rolar **ou** fixo no rodapé (auditoria L2: o "Entrar" do login fica
  abaixo da dobra).
- **Teclado:** o `AppShell` com `scroll` já usa `keyboardShouldPersistTaps="handled"` e `automaticallyAdjustKeyboardInsets` no
  iOS (`AppShell.tsx:73-81`); no Android depende do `adjustResize`. Critério: o campo em foco e o botão de envio ficam visíveis
  com o teclado aberto nas duas plataformas (só se prova em aparelho).
- **Orientação:** retrato travado nos dois apps, por decisão explícita. A navegação do motorista (M07) é a única candidata a
  paisagem, e fica para quando a navegação existir.
- **Barra de status:** `light` em todas as telas (`apps/passenger/app/_layout.tsx:51`).

---

## 12. Estados obrigatórios por tela

Toda ficha tem a tabela de estados com **todas** as linhas abaixo. Uma linha que não se aplica é marcada "n/a" com o motivo,
nunca omitida.

| Estado | Definição | Como deve parecer | Componente |
|---|---|---|---|
| **Padrão** | Dados prontos | A tela da ficha | — |
| **Carregando** | Esperando a primeira resposta | Esqueleto **com a forma do conteúdo final** (mesmas alturas), nunca spinner de tela cheia. Depois de 8 s, frase "Está demorando mais que o normal" com "Tentar de novo" | `LoadingSkeleton` (`line`/`block`/`circle`) |
| **Carregando ação** | Depois de tocar num CTA | Spinner **dentro** do botão, sem mudar o tamanho dele (`ButtonCore.tsx:185-186`), com o resto da tela legível; segundo toque ignorado | `PrimaryButton loading` |
| **Vazio** | Resposta certa, sem itens | Ícone em pastilha de 56, título que diz o que não há, frase que diz o próximo passo, e **uma** ação | `EmptyState` (pedido: aceitar ícone lucide, C-09) |
| **Erro recuperável** | API respondeu com falha | Erro de **campo** embaixo do campo; erro de **envio** num `InlineAlert` acima do CTA, que recebe o foco (padrão já do login, `login.tsx:54-56,101`); erro de **carga** na tela inteira com `ErrorState` e "Tentar de novo" | `InputCore`, `InlineAlert`, `ErrorState` |
| **Sem rede** | Aparelho offline ou API inalcançável | Faixa fixa no topo, abaixo da safe area: "Sem conexão. Tentando reconectar…", com `role.warning` tingido; **o conteúdo já carregado continua visível**; ações que exigem rede ficam desabilitadas e dizem por quê. Na corrida ativa, o estado da corrida **não muda** por falta de rede | Pedido C-01 (`NetworkBanner`) |
| **Texto longo** | Nome de 40 caracteres, endereço de 2 linhas, rua com número e complemento, valor de R$ 1.234,56 | Endereço quebra em até 2 linhas e depois reticências; nome em até 2 linhas; **valor e placa nunca truncam** | — |
| **Tela pequena** | 320×568 | Sem rolagem horizontal, sem texto de informação truncado, CTA alcançável, grades reorganizadas (§3) | — |
| **Tela grande** | 430×932 | Nada estica além de 480 de conteúdo; sem "buraco" de fundo entre conteúdo e rodapé (auditoria B1) | — |
| **Fonte 200%** | Escala de texto do sistema no máximo | Nenhum texto sobreposto ou cortado na vertical; título e botão quebram linha; nada sai do card | — |
| **Teclado aberto** | Telas com campo | Campo em foco e botão de envio visíveis | `AppShell scroll` |
| **Permissão negada** | Localização, câmera, notificação | Explica o motivo antes do pedido do sistema; se negada, oferece o caminho manual (endereço digitado) e o atalho para Ajustes | Pedido C-06 (`PermissionPrompt`) |
| **Mock** | Dado de demonstração | Um `MockBadge` por bloco, abaixo do título do bloco | `MockBadge` |
| **Acessibilidade** | Leitor de tela, teclado, contraste | §13 | — |

---

## 13. Acessibilidade (WCAG 2.2 AA como piso)

| Critério | Regra | Como se mede |
|---|---|---|
| Contraste de texto | ≥ 4,5:1; ≥ 3:1 para texto ≥ 18,66 pt em negrito ou ≥ 24 pt. A tabela de pares aprovados está em `docs/identidade-visual.md` e em `docs/direcao-de-arte.md` §4.1 | Cor computada de cada texto contra o fundo efetivo **composto** (gradiente: pior parada; translúcido: composto sobre o que está atrás) |
| Contraste de não-texto | ≥ 3:1 para limite de controle, ícone que informa, foco, marcador de mapa e barra de gráfico | Idem. `role.border`/`edgeTop` são decorativos e **reprovam** como limite de controle; campo usa `role.borderControl` |
| Alvo de toque | ≥ 44×44 pt em todo elemento tocável (área efetiva, contando o `hitSlop`) | Retângulo do elemento tocável |
| Foco de teclado (web e teclado físico) | Anel visível por `useKeyboardFocusRing`/`focusRingStyle` (`packages/ui/src/useFocusRing.ts`), por fora com vão de 2 pt; por dentro quando encosta na borda da tela | Tab por toda a tela: todo interativo recebe foco, na ordem visual, e o anel aparece no Chromium **e** no WebKit (a lição do commit `818d655`) |
| Leitor de tela | Todo interativo com `accessibilityRole` e rótulo em pt-BR que diz a ação ("Cancelar corrida", não "Botão vermelho"); estado em `accessibilityState` (selected, disabled, busy, checked); título da tela com `accessibilityRole="header"`; imagem decorativa fora da árvore; grupo de informação lido como uma frase (card de motorista: "Carlos, Honda HB20 prata, placa QWE 7B34, chega em 5 minutos") | TalkBack (Android) e VoiceOver (iOS, na fase final pela decisão 3 de 22/11) percorrendo a tela inteira |
| Anúncio | Mudança que o usuário não provocou diretamente (motorista encontrado, oferta nova, oferta expirada, erro de envio) é anunciada: `accessibilityLiveRegion` no Android e `AccessibilityInfo.announceForAccessibility` no iOS (padrão do `InlineAlert`, `InlineAlert.tsx:7-8,57,72`) | Leitor ligado durante a transição |
| Cor não é o único sinal | Estado com ícone e texto (`StatusBadge` já faz, `StatusBadge.tsx:31-37`); marcador de mapa com forma diferente (círculo × pino) | Captura em tons de cinza: tudo continua distinguível |
| Movimento | "Reduzir movimento" respeitado (§7) | Ligado no sistema: nada depende de animação para ser entendido |
| Tempo | Contador com prazo (oferta do motorista) anunciado no início e aos 5 s; o prazo é do servidor | — |
| Escala de fonte | §5, regra 3 | Fonte a 200% em aparelho |

---

## 14. Portão de qualidade por tela

Uma tela só é dada como **pronta** quando passa por todos os itens abaixo e pelos itens próprios da ficha dela. A **Lyra**
cumpre e anexa as provas ao handoff (autoverificação); a **Íris** verifica de forma independente e emite o veredito
APROVADO/REPROVADO. Item sem prova anexada conta como reprovado, não como "provavelmente ok" (skills `quem-valida-o-que` e
`medir-antes-de-afirmar`).

Notação: **[W]** = medido no navegador (Expo Web exportado, Chromium e WebKit); **[A]** = só se prova em aparelho ou emulador
Android; **[i]** = iPhone (fase final, decisão 3 de 22/11); **[C]** = conferido no código.

### 14.1 Checklist geral

**Fidelidade ao design system**

- **G-01 [C]** Nenhum HEX, `rgba` ou dimensão literal fora de `@vuumbora/tokens` (`npm run check:boundaries` verde) e nenhum
  número mágico de espaço fora da escala de 4 pt, salvo ajuste óptico comentado.
- **G-02 [W]** Sonda de estilo: toda caixa com fundo cai numa assinatura **premium** (gradiente `surfaceRaised` + borda de cima
  `edgeTop`) ou numa exceção da tabela da §4 (pílula clara, `glassOnMap`, painel inferior). **Zero caixas "legado"** (fundo
  `#111B2A` chapado, ou borda igual nos quatro lados). As quatro assinaturas estão definidas em `docs/auditoria-premium.md`
  ("Como ler as cores medidas").
- **G-03 [W]** Toda cor computada pertence ao conjunto dos tokens (mais as composições `withAlpha` declaradas). Cor fora do
  conjunto = reprovado.
- **G-04 [W]** Contagem de amarelo: no máximo 1 bloco com fundo `gradient.cta`/`brand.yellow` por área de decisão; todo texto
  ou ícone amarelo está na lista de sinais permitidos da §2.
- **G-05 [W]** Tipografia: todo texto de palavra usa a família da marca no peso certo; todo corpo pertence à escala (12, 14,
  16, 18, 22, 28, 34); nenhum glifo do sistema fora da lista da §5, regra 5.
- **G-06 [W]** Todo número que muda tem `font-variant-numeric: tabular-nums` (ou a caixa fixa, se PP-1 = Poppins).
- **G-07 [W]** Para telas com referência premium (P01, P02, P03, P05, P09, P11, P12, P13 e a home do motorista): as
  medidas-chave da `docs/direcao-de-arte.md` §1.1 conferem com tolerância de ±2 pt (altura do CTA, raio, pílula de destino,
  linha de categoria, borda do selecionado).
- **G-07b [W] Comparação lado a lado com o alvo de 22/11.** Para toda tela que tem recorte na prancha (§18.1): uma imagem
  composta com o recorte da prancha à esquerda e a captura 390×844 da tela à direita, na mesma altura. Quem verifica preenche
  uma tabela de 8 linhas, cada uma "confere / diverge (motivo)": (1) ordem dos blocos de cima para baixo; (2) quantidade e
  posição de cartões; (3) proporção dos cartões (altura ÷ largura, ±10%); (4) posição e largura do CTA; (5) ícones (mesmo
  significado e mesma posição); (6) barra inferior (existe ou não, quantas abas); (7) contagem de amarelo; (8) ilustração ou
  mapa (onde fica e quanto ocupa, ±10% da altura). Toda "diverge" precisa citar uma linha da tabela de divergências (§18.2)
  ou uma regra deste padrão; divergência sem motivo reprova. **A prancha é render de IA:** não se comparam pixels, HEX,
  fontes nem textos dela (os HEX vêm dos tokens, os textos das fichas).
- **G-08 [W]** Nota premium ≥ 8 na rubrica da `docs/auditoria-premium.md` (Placar): o que tira ponto é, em ordem, tela que
  parece de outro app, amarelo fora de ação, card legado, defeito de layout medido e detalhe tipográfico.

**Layout e responsividade** (em 320×568, 360×800, 375×667, 390×844 e 430×932)

- **G-09 [W]** Nenhum elemento ultrapassa a viewport (retângulo de cada elemento; **não** `document.scrollWidth`, que não vê
  dentro do `ScrollView` do RN Web).
- **G-10 [W]** Nenhum texto de informação truncado (`scrollWidth > clientWidth` ou `scrollHeight > clientHeight` em cada nó
  de texto). Endereço pode ter reticências depois da 2ª linha; preço, placa, ETA, nome de botão e título não.
- **G-11 [W]** O CTA principal está visível sem rolar em 320×568, ou fixo no rodapé.
- **G-12 [W]** Nenhum elemento sobrepõe outro sem intenção (interseção de retângulos entre irmãos tocáveis ou de texto = 0;
  auditoria H1 é o exemplo).
- **G-13 [W]** Em 430×932, nenhum "buraco" de fundo entre o conteúdo e o pé da tela quando a ficha diz que o conteúdo ocupa a
  altura (auditoria B1).
- **G-14 [A]** Fonte a 200% (`adb shell settings put system font_scale 2.0`): nada sobreposto, cortado na vertical ou para fora
  do card.
- **G-15 [A]** Teclado aberto: campo em foco e botão de envio visíveis.
- **G-16 [A]** Safe area: nada sob o recorte da câmera nem sob a barra de gestos, num aparelho com recorte e num com botões.

**Estados**

- **G-17 [W]** Cada estado da tabela da ficha existe e foi capturado (§14.2). Estado "n/a" tem motivo escrito.
- **G-18 [W]** O estado "sem rede" foi provocado (`page.context().setOffline(true)` no web; modo avião no aparelho) e a tela
  se comporta como a ficha diz.
- **G-19 [C]** Nenhum botão com `onPress={() => {}}` ou equivalente sem sinalização: ou navega, ou mostra o aviso de
  indisponível (padrão `UnavailableNoticeBanner`), ou não aparece (`DESIGN_SYSTEM_MESTRE.md` §10).

**Acessibilidade**

- **G-20 [W]** Contraste de todo texto e todo não-texto informativo conforme a §13 (sonda automática, com a lista dos piores
  pares no relatório).
- **G-21 [W]** Todo alvo tocável ≥ 44×44.
- **G-22 [W]** Tab percorre todos os interativos na ordem visual, com anel de foco visível no Chromium e no WebKit; Enter e
  Espaço ativam.
- **G-23 [A]** TalkBack: a tela inteira percorrida; todo interativo anuncia papel, rótulo e estado; o título é anunciado como
  cabeçalho; anúncios dinâmicos da ficha acontecem.
- **G-24 [A]** Captura em emulador Android de cada estado com elevação 2/3, gradiente ou `boxShadow`, lado a lado com a do web
  (até a prova em aparelho de `docs/direcao-de-arte.md` §5 sair).

**Conteúdo e honestidade**

- **G-25 [C]** Todo dado de demonstração tem `MockBadge`; um selo por bloco; nenhum selo na mesma linha de título (regra da
  auditoria C1); nenhum selo sobre amarelo.
- **G-26 [C]** Nenhuma promessa proibida pelo `DESIGN_SYSTEM_MESTRE.md` §9 aparece, nem com selo.
- **G-27 [C]** Copy da ficha aplicada literalmente; desvio só com motivo no handoff (e o texto novo volta para a ficha).
- **G-28 [W]** Movimento: com `reducedMotion: 'reduce'`, nada se desloca nem escala, e nada depende de animação.

### 14.2 Regressão visual por captura

**Matriz:** cada tela × cada estado da ficha × 4 tamanhos (320×568, 360×800, 390×844 e 430×932). Fonte a 200% e teclado
aberto entram como capturas de aparelho, não de regressão automática.

**Nome do arquivo:** `<app>/<ID>-<estado>-<largura>x<altura>.png`. Exemplos: `passageiro/P03-padrao-390x844.png`,
`passageiro/P04-vazio-320x568.png`, `motorista/M05-offline-430x932.png`.

**Como gerar (proposta, a construir; hoje não existe no repositório):**

1. `expo export --platform web` de cada app, servido como estático. Nada de Metro em modo de desenvolvimento: o bundle precisa
   ser o mesmo entre execuções.
2. Playwright (Chromium; o WebKit só para os itens de foco) com `deviceScaleFactor: 2`, `reducedMotion: 'reduce'`, relógio
   congelado (`page.clock`), fontes carregadas (`document.fonts.ready`) e o simulador de corrida avançado por função de teste, não
   por espera de tempo.
3. Cada estado é alcançado por **parâmetro de teste** (identidade em modo `mock`, rede cortada, lista vazia), nunca editando o
   código para tirar a foto.
4. Viewport alta (1500) para a captura de página inteira, porque o `fullPage` não pega o `ScrollView` do RN Web; mais uma
   captura exatamente no tamanho do aparelho, para a dobra.
5. Seletores com `>> visible=true`: o expo-router mantém as telas anteriores no DOM, ocultas.

**Comparação:** contra a linha de base aprovada, com diferença máxima de 0,2% dos pixels (`maxDiffPixelRatio: 0.002`, limiar
de cor 0,1). Diferença acima disso reprova até alguém (Íris) aprovar a nova base e escrever o motivo. A base só muda junto com
uma ficha ou um token que justifique.

**Onde guardar a base:** decisão do Atlas e do Vulcano (pasta versionada × armazenamento fora do git). São cerca de 11 fichas ×
6 estados × 4 tamanhos ≈ 260 PNGs só nas primeiras fichas.

**Nativo:** capturas de emulador Android (`adb exec-out screencap -p`) nos estados com elevação, de cada tela, **sem**
comparação automática no início: a renderização de fonte muda de aparelho para aparelho. Revisão lado a lado com o web (G-24).

### 14.3 Sondas automáticas (proposta, a construir)

As sondas abaixo já foram escritas uma vez, no scratchpad da auditoria de 18/11, e se perderam. Elas viram ferramenta
versionada em `tools/qualidade-tela/` (pedido à Íris, com o Vulcano no CI):

| Sonda | Mede | Itens |
|---|---|---|
| `estilo` | Fundo, gradiente, cor da borda de cima e de baixo, sombra, família e corpo de cada caixa visível | G-02, G-03, G-04, G-05, G-06 |
| `geometria` | Retângulo de cada elemento contra a viewport e contra os irmãos; alvo de toque | G-09, G-11, G-12, G-13, G-21 |
| `texto` | Truncamento horizontal e vertical de cada nó de texto | G-10 |
| `contraste` | Cor do texto contra o fundo efetivo composto | G-20 |
| `foco` | Ordem de tabulação e anel visível | G-22 |

Saída: um JSON por tela e tamanho, e um resumo em tabela que vai no handoff. A sonda **não substitui o olho**: a nota premium
(G-08) é dada por alguém que olha as capturas.

### 14.4 Quando o portão roda

- **Primeira entrega de uma tela:** portão completo, mais a nota premium dada pelo Apolo.
- **Mudança em `packages/ui` ou em tokens:** regressão visual de **todas** as telas que usam o componente (a lição da auditoria
  B1: uma linha no `AppShell` muda todas as telas com rolagem).
- **Mudança só de dados (mock para real):** G-10, G-17, G-18, G-25 e a regressão da tela.

---

## 15. Pedidos de componente novo (consolidado)

Os itens marcados "DS" estão na lista de componentes do `DESIGN_SYSTEM_MESTRE.md` §6 e ainda não existem
(`packages/ui/src/index.ts:24-26`).

| # | Componente | Onde mora | Justificativa | Telas |
|---|---|---|---|---|
| C-01 | `NetworkBanner` + `useNetworkStatus` | `packages/ui` | Estado "sem rede" obrigatório em toda tela (§12); sem ele, cada tela improvisa e o estado só aparece depois de uma chamada falhar. Depende do PP-8 | todas |
| C-02 | `BottomSheet` (DS) | `packages/ui` | Painel inferior sobre mapa; é a estrutura de todas as telas de corrida | P05 a P10, M06 a M10 |
| C-03 | `ConfirmDialog` (o `Modal` do DS) | `packages/ui` | Cancelar corrida, sair da conta e recusar oferta com consequência precisam de confirmação. Hoje "Cancelar" age no primeiro toque (`buscando.tsx:50-53`) | P07, P08, P13, M05, M06 |
| C-04 | `FooterActions` (CTA fixo no rodapé) | `packages/ui` (prop do `AppShell` ou componente) | O `footer` do `AppShell` existe para a barra de abas (`AppShell.tsx:32-33`); falta o rodapé de ação com safe area, `elevation.3` e sem cobrir o conteúdo. Resolve o CTA abaixo da dobra em 568 | P02, P04, P06, M01, M02 |
| C-05 | `Toast` (DS) | `packages/ui` | Confirmação curta sem mudar de tela ("Avaliação enviada", "Endereço salvo") | P10, P13, M13 |
| C-06 | `PermissionPrompt` | `packages/ui` | Tela de explicação antes do pedido de localização do sistema, e o estado "negada" com o caminho manual (`PASSAGEIRO.md`, padrões de UX) | P03, P04, M05 |
| C-07 | `SectionHeader` (título + ação opcional + selo de mock **embaixo**) | `packages/ui` | A regra "selo nunca na linha do título" é violada hoje em 3 telas (`destino.tsx:91-93`, `confirmacao.tsx:61-63,80-82`). Um componente torna a regra impossível de quebrar | P03 a P06, P11, M05, M11 |
| C-08 | `ListRow` (promovido de `apps/passenger/src/components/shared/ListMenuRow.tsx`) e `ToggleSwitch` (promovido de `shared/ToggleSwitch.tsx`) | `packages/ui` | Perfil, configurações e documentos dos **dois** apps usam a mesma linha; hoje só o passageiro tem. Pela regra do pacote (`index.ts:9-11`), o que os dois perfis usam vai para o `ui` | P13, M13, M03, M14 |
| C-09 | `EmptyState`/`ErrorState` com `icon` (lucide) | mudança em `packages/ui` | Tirar os glifos "○" e "✕" do sistema (§5, regra 5) e deixar cada vazio dizer o que falta com um ícone | todas com lista |
| C-10 | `MoneyText` / `EstimateLabel` | `packages/ui` | Junta `Intl.NumberFormat` pt-BR, `tabularNums` e o rótulo "estimado" quando não é o preço final; impede preço sem rótulo e número que dança | P05, P06, P10, P11, M05, M06, M11 |
| C-11 | `VehicleIconBox` (carro de frente, 48×48, raio 12, normal e selecionado) | `packages/ui` | Especificado em `docs/direcao-de-arte.md` §4 (`vehicle.iconBox`); o lucide não tem carro de frente | P05, P06, P11, M12 |
| C-12 | `MapView`, `RouteOverlay`, `LocationMarker` (DS), atrás do adaptador de mapa | `packages/ui` + adaptador (decisão 1: Mapbox) | Já previsto (`index.ts:9-11`); bloqueia o princípio 6 | P03 a P10, M05 a M10 |
| C-13 | `PressableScale` (resposta de toque 0,97) | `packages/ui` | O `docs/movimento.md` pede para todo botão e card tocável; centraliza a regra de "reduzir movimento". Depende do PP-8 | todas |
| C-14 | `OfferCountdown` (anel de tempo da oferta) | `apps/driver/src/components` | `RideOfferCountdown` do DS; é só do motorista | M06 |
| C-16 | `SegmentedControl` (pílulas de período e filtro; ativa em amarelo com texto navy) | `packages/ui` (promove `apps/passenger/src/components/history/TripFilterChip.tsx`) | Prancha: Histórico dos dois apps e Ganhos usam o mesmo controle; hoje só existe o chip do passageiro | P11, M11, M12 |
| C-17 | `ScreenHeader align="center"` | mudança em `packages/ui` | A prancha centraliza o título das telas internas (§18.1, item 1) | todas as internas |
| C-15 | `DocumentStatusCard` | `apps/driver/src/components` | `DriverDocumentCard` do DS; é só do motorista. **Não construir antes da decisão 9 e da lista de documentos confirmada** (`docs/plano-apps-execucao.md:261-266`) | M03, M04, M13 |

Mudanças em componentes existentes, que corrigem várias telas de uma vez (de `docs/auditoria-premium.md`, ainda abertas no
código de hoje):

| Componente | Mudança | Linha | Estado |
|---|---|---|---|
| `ScreenHeader` | Não reservar a caixa da direita sem `rightSlot`; seta lucide `ChevronLeft`; título em até 2 linhas | `ScreenHeader.tsx:30`, `:50`, `:21` | **aberto** (a caixa da esquerda já foi corrigida, `:19`) |
| `ButtonCore` | Rótulo pode quebrar em 2 linhas com fonte grande; `size="prominent"` no secundário (Recusar e Aceitar da mesma altura, M6); resposta de escala | `ButtonCore.tsx:190`, `:200`, `:183` | aberto |
| `PasswordInput` | "Mostrar" em `textSecondary` (é controle de campo, não ação) | `PasswordInput.tsx:70` | aberto (L3) |
| `AppShell` | Margem 16 em < 375 (`layout.screenPaddingCompact`); largura máxima de 480 | `AppShell.tsx:95` | aberto |
| `BrandLogo` | Lockup limitado à largura do container | `BrandLogo.tsx:36-46` | aberto |
| `StarRating` | Estrela lucide como padrão | `StarRating.tsx:58` | aberto (a P10 contorna) |

---

## 16. Painel administrativo (web)

O painel segue a **anatomia** do ModaShop com a paleta e a tipografia do VuumBora, em escala só escura (decisões 6 e 8 de
20/11/2026). Tudo deste padrão vale, com três adaptações:

1. **Tamanhos de tela:** 1280×800 e 1440×900 (desktop), 768×1024 (tablet) e 390×844 (gaveta no celular). Não há 320.
2. **Alvo:** 44 pt no celular; 32 px no desktop com mouse, desde que o foco de teclado seja visível.
3. **Componentes:** os do próprio painel (`apps/admin/src/components`: `PageHeader`, `RequestState` com
   `LoadingState`/`EmptyState`/`ErrorState`, `StatusPill`, `Dialog`, `DemoModeBanner`). Tokens via CSS gerado
   (`apps/admin/src/styles/tokens.css`). O portão é o mesmo, com Playwright direto (é web de verdade, sem as armadilhas do RN Web).

---

## 18. Alvo visual de 22/11/2026: recortes e divergências

### 18.1 Recortes da prancha por tela

As duas pranchas têm 1536×1024 px. As coordenadas abaixo (x0, y0, x1, y1) foram lidas na imagem, **aproximadas em ±6 px**.
Para recortar, use uma folga de 8 px. Comparando a olho, o conteúdo das pranchas é o mesmo das `*_telas_premium.webp` de 18/11
(mesmo tamanho; a comparação por pixel não foi feita). Por isso, as medidas em pt de `docs/direcao-de-arte.md` §1.1 continuam
valendo, porque saíram das telas em alta resolução dessa mesma arte.

| Prancha | Tela na prancha | ID | Recorte (px) |
|---|---|---|---|
| passageiro | Bem-vindo | P01 | 318, 12, 553, 508 |
| passageiro | Criar conta | P02 | 566, 12, 801, 508 |
| passageiro | Home | P03 | 813, 12, 1049, 508 |
| passageiro | Escolha de categoria | P05 + P06 (PP-3) | 1061, 12, 1297, 508 |
| passageiro | Corrida em andamento | P08 e P09 | 1309, 12, 1536, 508 (cortada na borda direita) |
| passageiro | Histórico | P11 | 376, 522, 640, 976 |
| passageiro | Carteira | P12 | 651, 522, 913, 976 |
| passageiro | Meu Perfil | P13 | 925, 522, 1189, 976 |
| passageiro | Configurações | P13 (configurações) | 1200, 522, 1470, 976 |
| motorista | Login | M01 | 316, 14, 545, 462 |
| motorista | Cadastro | M02 | 561, 14, 791, 462 |
| motorista | Dashboard Inicial | M05 | 807, 14, 1037, 462 |
| motorista | Solicitação de Corrida | M06 | 1053, 14, 1281, 462 |
| motorista | Corrida em Andamento | M08 e M09 | 1298, 14, 1528, 462 |
| motorista | Navegação (GPS) | M07 | 290, 516, 487, 926 |
| motorista | Ganhos | M11 | 498, 516, 696, 926 |
| motorista | Histórico de Corridas | M12 | 708, 516, 906, 926 |
| motorista | Documentos | M03 e M13 | 918, 516, 1116, 926 |
| motorista | Perfil | M13 | 1127, 516, 1324, 926 |
| motorista | Suporte | M14 | 1336, 516, 1532, 926 |

**Sem recorte na prancha:** P04 (origem e destino), P07 (buscando), P10 (concluída), P14 (ajuda), M04 (análise), M08
(embarque confirmado; aproveita a "Corrida em Andamento"), M10 (finalizar) e todo o painel admin. Essas telas herdam a
linguagem da prancha pela tela vizinha mais próxima, que a ficha indica.

**O que a prancha ensina e vale para todas as telas** (leitura visual, convertida para regra):

1. Cabeçalho interno: seta de voltar à esquerda e título **centralizado** no motorista e na maioria do passageiro (Histórico,
   Carteira, Perfil, Configurações). Hoje o `ScreenHeader` alinha o título à esquerda, ao lado da seta (`ScreenHeader.tsx:16-33`).
   Pedido: `ScreenHeader` com `align="center"` (padrão) e a caixa da direita espelhando a da esquerda, para o título ficar no
   centro de verdade.
2. Lista = cartões-linha de altura igual (cerca de 52 a 56 pt), ícone de 20 em pastilha à esquerda, título e legenda, chevron
   à direita, vão de 8 entre eles. É o `ListRow` (pedido C-08).
3. Filtro de período = pílulas lado a lado, a ativa em amarelo cheio com texto navy (Histórico e Ganhos). **É o único "bloco"
   amarelo permitido além do CTA**, por ser a seleção ativa de um controle segmentado. Pedido: `SegmentedControl` (C-16).
4. Valor em destaque = rótulo pequeno em cima e número grande embaixo (Ganhos "Total hoje", Solicitação "Valor da corrida",
   Corrida "Chegada em 5 min"). É a regra N2 da §2.
5. Ação destrutiva = contorno vermelho em largura total no pé (Cancelar corrida, Sair da conta). Já é o `DangerButton`.
6. Ícones de linha **amarelos** na prancha (Perfil, Configurações, Suporte e Documentos do motorista). Isso contradiz a regra
   de economia de amarelo (§2; `docs/direcao-de-arte.md` §3.1). Como a prancha manda no visual, a decisão é do Atlas/dono.
   **Recomendo manter a regra** (ícone de linha em `textSecondary`), porque é o que deixa o CTA como único foco. Ver a linha
   D-30 da §18.2.

### 18.2 Divergências entre a prancha e o que já está decidido

"Dono?" = a resolução depende de decisão do dono ainda aberta. "Decidido" = já há decisão; vale a decisão, não a prancha.

| # | Tela | O que a prancha mostra | O que o app faz hoje (arquivo:linha) | Recomendação | Dono? |
|---|---|---|---|---|---|
| D-01 | P02, M01 | Login com Google e Apple ("Continuar com Google/Apple", separador "ou") | Escondido por `SOCIAL_SIGN_IN_ENABLED = false` (`apps/passenger/src/config/featureFlags.ts:13`; `cadastro.tsx:337`); o motorista não tem | Manter oculto. O layout reserva o bloco "ou + botões" só quando a chave ligar; sem a chave, o CTA fica colado ao rodapé e não sobra separador órfão. Se entrar Google, a Apple entra junto (regra da Apple) | **Sim**, decisão 8 |
| D-02 | M01 | Campo "E-mail ou celular" | "E-mail ou ID público" (`entrar.tsx:145`; `login.tsx:123`); o contrato não aceita celular (`login.tsx:41`) | Seguir o decidido. Mesmo visual do campo, rótulo nosso | Decidido |
| D-03 | M01 | Caixa "Lembrar meu acesso" | Não existe; a sessão já fica guardada no aparelho (cofre da A3) | Não pôr. Uma caixa que não muda nada é botão de mentira (G-19). Só vira opção se o dono quiser sessão curta em aparelho compartilhado, que é decisão de segurança | Só se ele quiser sessão curta |
| D-04 | M02 | "Criar sua conta · Comece a dirigir com a VuumBora", campos nome, celular, e-mail, senha e confirmar senha | "Informe seus dados para criar a sua conta de motorista", com `RegistrationNotice` antes do formulário (`criar-conta.tsx:197-202`); data de nascimento; uma senha com mostrar/ocultar | Subtítulo nosso ("comece a dirigir" promete o que a conta não dá). Sem "confirmar senha": o mostrar/ocultar resolve o erro de digitação com um campo a menos. Campos e ordem do contrato | Decidido (conta ≠ cadastro) |
| D-05 | P02 | "Celular (WhatsApp)" parece obrigatório; não há data de nascimento | "Celular com WhatsApp (opcional)" e data de nascimento (`cadastro.tsx:250,270`) | Seguir o contrato; visual da prancha (campo com ícone à esquerda, 48 a 52 pt) | Decidido (contrato de identidade) |
| D-06 | P03 | Menu ☰, logo e sino; sem barra de abas | Barra de 4 abas com "Mensagens" sem ação (`index.tsx:54-68`); sino com 3 fabricado (`index.tsx:70`) | Seguir a prancha (PP-9). Sino só com notificação real (D5, push); até lá, sino sem número | Atlas |
| D-07 | P03 | "Indique e ganhe · Convide amigos e ganhe créditos" com presente 3D | Banner de segurança e "10% OFF" (`SafetyPromoBanner.tsx:34-45`) | Tirar os dois (PP-6). O lugar do banner fica vazio até haver um fato verdadeiro para pôr ali (ex.: "Atendimento no WhatsApp com gente de Natal", quando o canal estiver ligado) | **Sim**, decisão 12 |
| D-08 | P03 | Faixa de mapa no pé com pino e carro fotorrealista com a marca | Mapa ilustrativo em cima e categorias embaixo (`index.tsx:75,79-102`) | Layout da prancha (mapa na base, sangrando), com o mapa ilustrativo até o Mapbox. Sem carro de modelo reconhecível (`docs/direcao-de-arte.md` §7.2, trade dress) | Não |
| D-09 | P05 | Categorias "VuumBora / Comfort / Premium" a R$ 14,90 / 19,90 / 29,90 | 5 categorias decididas, com preço fabricado no início (`mockRideCategories.ts:37-41`) | Nomes decididos: VuumBora, Conforto, Motorista mulher, Entrega e Pet (`docs/plano-sistema.md:56`). **Motorista mulher, Entrega e Pet nascem desligadas** (`docs/plano-mestre.md:235-236`), então no lançamento a lista mostra 2. Preço só da cotação; até lá, com selo | Nomes decididos; preço é a decisão 7/13 |
| D-10 | P05, P12 | "Pagamento: PIX" com o logo do Pix; cartões "•••• 7684" | Formas de pagamento fictícias com selo (`confirmacao.tsx:80-95`) | Linha da prancha; logo do Pix na cor da marca Pix; cartão só quando houver provedor | **Sim**, decisão 3 |
| D-11 | P08/P09 | Foto do motorista, nota 4,9, placa, botões de mensagem e ligar | Sem mapa; Ligar/Mensagem/SOS sem ação (`docs/plano-apps-execucao.md:81`) | Foto só a real e verificada; sem ela, inicial. Contato só por canal intermediário real | **Sim**, decisão 11 (canal) |
| D-12 | P11 | Selo "Concluída" com texto branco sobre verde | `StatusBadge` tingido (`StatusBadge.tsx:15-23`) | Manter o tingido: branco sobre verde dá 2,28:1 e reprova | Não |
| D-13 | P12 | "Saldo VuumBora R$ 35,00", "Adicionar saldo", "Transferir saldo", "Cupons e promoções" | Tela não existe | Construir só "Formas de pagamento" (a metade de baixo da prancha). O cartão de saldo e as três ações ficam fora até as decisões | **Sim**, decisões 4, 5 (recomendado "não"), 12 |
| D-14 | P13 | Foto, nome e telefone "(84) 9 9972-7583" | Dados de exemplo com selo (`perfil.tsx:73`) | Nome, e-mail e ID público vindos de `me()`; telefone só se a pessoa informou; foto só se enviou | Não |
| D-15 | P13 config. | "Tema do aplicativo: Escuro", "Idioma: Português (BR)", "Limpar cache 12,4 MB", chaves de "Localização em tempo real" e "Receber promoções" | Linhas com aviso de indisponível (`configuracoes.tsx:40-78`) | Tema e idioma têm uma opção só: mostrar como informação, sem chevron, ou não mostrar. A chave de localização reflete a permissão do sistema (nunca uma chave de enfeite). "Receber promoções" exige consentimento de marketing (LGPD), com o advogado | Promoções: dono e advogado |
| D-16 | M05 | Começa "Offline" com o CTA "Ficar Online"; 4 cartões (ganhos, corridas, avaliação, taxa de aceitação); barra de abas; **sem** mapa, banner, oferta e atalhos | Começa online e aprovado (`apps/driver/app/(app)/index.tsx:48,54`); mapa, banner "Alta demanda", oferta, atalhos e "Sair" na mesma tela (`:90-124`) | Seguir a prancha (PP-4, PP-5). "Ficar online" só com aprovação vinda do servidor; antes disso, o cartão de status explica por quê | Atlas |
| D-17 | M05 | Cartão "Taxa de aceitação" | Mostrado com "92%" (`index.tsx:100`) | Tirar até existir uma regra que use o número (`docs/decisoes-do-dono.md:361-367`). Número sem consequência gera pressão e pergunta de suporte. No lugar: "Tempo online hoje", que é um fato do próprio motorista | **Sim** (se o número entra) |
| D-18 | M06 | "5 min · 2,3 km · Passageiro a 320 m", embarque, destino, "Valor da corrida R$ 18,90", "Aceitar corrida", "Recusar" | Oferta dentro do painel, com o nome "Ana Oliveira" e "Dinâmica +20%" (`index.tsx:102-112`) | Tela cheia da prancha. Destino visível (decidido em 18/11). **Sem nome do passageiro antes do aceite** (minimização). Sem "dinâmica" até haver regra de tarifa. "Valor estimado" vindo da API, sem percentual de taxa | Tarifa e dinâmica: **sim**, decisão 7 |
| D-19 | M08/M09 | Passageira "Ana Souza ★ 4,9 (127 viagens)" | Não existe | **Sem nota do passageiro:** só o passageiro avalia (`docs/decisoes-do-dono.md:369-372`). Só o primeiro nome | Decidido |
| D-20 | M09 | "Navegar com GPS" e "Finalizar corrida" | Não existe | O botão abre o Waze ou o Google Maps instalado (recomendação da decisão 10, `docs/plano-apps-execucao.md:291`). "Finalizar" com confirmação do servidor | **Sim**, decisão 10 |
| D-21 | M07 | Navegação passo a passo dentro do app ("300 m, vire à direita") | Não existe | Não construir dentro do app enquanto a decisão 10 for "app externo". A M07 vira "A caminho do embarque": mapa, endereço e o botão para o app externo | **Sim**, decisão 10 |
| D-22 | M11 | "Total hoje R$ 236,70", gráfico sem eixo, "Saldo disponível", "Solicitar saque", "Extrato" | Não existe | Total e gráfico com as regras de `docs/direcao-de-arte.md` §3.3. Sem saldo e sem saque até as decisões. Nenhuma cifra de mockup | **Sim**, decisões 6 e 7 |
| D-23 | M12 | Valor por corrida (R$ 18,90) | Não existe | O rótulo diz o que o valor é ("valor da corrida" ou "você recebeu") só depois da decisão 7; até lá, "valor da corrida" | **Sim**, decisão 7 |
| D-24 | M03, M13 | CNH, CRLV, seguro e vistoria, todos "Aprovado" | Não existe | Layout pronto, lista vazia: os documentos e o processo só entram com a decisão 9 e a lista da STTU (`docs/plano-apps-execucao.md:261-266`) | **Sim**, decisão 9 |
| D-25 | M13 | "4,9 (436 avaliações)", "Forma de recebimento" | Não existe | Nota só a real (o motorista é avaliado). "Forma de recebimento" fora até as decisões 3 e 6 | **Sim**, decisões 3 e 6 |
| D-26 | M14, P14 | "Falar com o Suporte · Atendimento via chat"; "Solicitar reavaliação" | Não existe | "Falar no WhatsApp" (canal já decidido para o site: pessoa de Natal). "Central de ajuda" só com conteúdo escrito. "Solicitar reavaliação" pressupõe um processo de contestação que não existe | Canal decidido; contestação: **sim** |
| D-27 | todas | Rostos (Juarez, Carlos, Ana) e o motorista uniformizado na margem | `driverDemoAvatarSource` no painel do motorista (`index.tsx:95`) | Avatar com inicial; foto só a real. Motorista de uniforme é peça de marketing, não entra no app (`docs/direcao-de-arte.md` §3.4) | Decidido |
| D-28 | todas | Nomes, valores, placas, distâncias e endereços de São Paulo, Natal e outros | Dados de exemplo com selo; o motorista ainda diz "São Paulo - SP" (`index.tsx:97`) | Mockup não é funcionalidade: todo valor vem da API ou leva o selo. Dado de demonstração coerente com Natal | Decidido |
| D-29 | P03, M01, M02 | Lockup grande do logo no topo do início | `HomeHeader` já usa o logo horizontal `sm` (28 pt) e o sino (`HomeHeader.tsx:15,23`); não tem ☰ | Logo horizontal de 28 a 30 pt no cabeçalho do início, como na composição da prancha; o lockup grande fica só na entrada (P01, P02, M01, M02) | Atlas |
| D-30 | P13, M13, M14, M03 | Ícones de linha de lista em amarelo | O perfil do passageiro **já usa amarelo** nos ícones de linha (`perfil.tsx:78,84,90…`), contra a regra | Manter a regra da economia de amarelo: ícone de linha em `textSecondary` (§18.1, item 6). Se o dono quiser o amarelo da prancha, a regra muda **em todas** as listas, nunca numa só | **Sim**, se quiser a prancha literal |

---

## 19. O que este documento não conferiu

- **Nada foi visto renderizado nesta tarefa.** Nenhum app foi rodado. As notas de tela e as medidas são da auditoria de
  18/11/2026, e o código mudou depois disso (por exemplo, o `ScreenHeader` já não reserva a caixa da esquerda; o `StatusBadge` e
  o `DangerButton` já estão tingidos; a busca ganhou o card de destino).
- O estado "corrigido ou aberto" de cada achado da auditoria foi conferido **lendo o código**, não medindo. Achado de layout
  (truncamento, sobreposição) pode ter mudado por efeito colateral de outra mudança. Ele precisa de nova medição antes de entrar
  numa missão.
- `DailySummarySection.tsx:33` usa 4 colunas a partir de 360; a auditoria mediu o valor truncado em 360, 390 e 430 e pediu 4
  colunas só a partir de 430. Não sei se o valor ainda trunca: **reauditar**.
- `driverDemoAvatarSource`: não abri o asset para saber se é um rosto.
- Painel admin: li só as rotas, a navegação e os nomes de componentes; não li o CSS das páginas.
- Contraste de `role.info` tingido e de `role.danger` sobre o fundo a 10% do `DangerButton`: calculado na auditoria como
  previsão, **nunca medido**.
- Tudo de Android e iPhone: zero prova em aparelho.
- As pranchas de 22/11 foram comparadas com as de 18/11 **a olho** (mesmo tamanho, 1536×1024, e mesmo conteúdo aparente), não
  por pixel. As coordenadas dos recortes (§18.1) são leitura visual, com ±6 px.
