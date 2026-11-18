# Auditoria premium: todas as telas contra a direção de arte

Autor: Apolo · 18/11/2026 · etapa 1.7 do PLANO.md · referência: `docs/direcao-de-arte.md` (§2, §4, §9, §11)

**Status: auditoria. Nada foi corrigido.** As correções saem daqui e outra missão aplica.

## Como foi medido

- Passageiro servido em `localhost:8125` (Expo Web). Motorista servido por mim em `localhost:8131`.
- Cada tela foi aberta no Chromium (playwright-core) em **390×844** e **320×568**, e também com viewport alta (1500) para ver o `ScrollView` inteiro. O fluxo da corrida (`/buscando` → `/concluida`) foi percorrido de verdade: início → destino "Casa" → Solicitar corrida → Pix → Solicitar, com o simulador avançando sozinho. Abrir essas rotas direto redireciona para `/`.
- Em cada tela, um script injetado leu o `getComputedStyle` de toda caixa visível: fundo, `background-image` (gradiente), cor da borda de cima e de baixo, sombra, família e corpo da fonte, e todo texto ou fundo amarelo. Truncamento foi lido por `scrollWidth > clientWidth` em 320, 360, 390 e 430.
- Contraste: fórmula WCAG 2.x.
- Scripts e prints ficaram no scratchpad da sessão, fora do repositório.

**Como ler as cores medidas.** São 4 assinaturas, e qualquer caixa da tela cai numa delas:

| Assinatura medida | O que é |
|---|---|
| `linear-gradient(#132033 → #0F1A28)`, borda de cima `#46566C` e as outras `#1E2A3B` | **Premium.** `gradient.surface.raised` + `stroke.edgeTop`/`edgeBottom` |
| fundo `#111B2A`, borda de cima `#46566C` e as outras `#1E2A3B` | Meio caminho: borda certa, superfície chapada |
| fundo `#111B2A`, borda `#2D3A4C` igual nos 4 lados | **Legado.** O "chapado" do diagnóstico §2 item 2 |
| fundo `#111B2A`, sem borda | Legado, e pior que o anterior: o card não se separa do fundo |

### Limites desta auditoria (leia antes de delegar)

1. **O app do passageiro quebrou às 16h12, no meio da auditoria.** `packages/ui/src/demoAssets.ts:12` chama `Image.resolveAssetSource`, que não existe no react-native-web. A tela inteira vira "Uncaught Error: Image.default.resolveAssetSource is not a function", nos dois apps, porque `packages/ui/src/index.ts:99` importa esse arquivo. Outra frente está editando `packages/ui` em paralelo. **Todas as medidas do passageiro são de antes das 16h12.** As que ficaram faltando estão em "Não medido", no fim.
2. **A home do motorista estava sendo alterada durante a auditoria.** Os arquivos de `apps/driver/src/components/home/` mudaram entre 16h10 e 16h15, e `MapPreviewBackground`/`MetricCard` mudaram às 16h09–16h12. O meu servidor do motorista subiu com `CI=1`, que desliga o watch do Metro. Por isso **o retrato do motorista é o código de ~16h03**. Quando reiniciei para medir de novo, ele já caía no mesmo erro do `demoAssets`. Parte dos achados do motorista (mapa, MetricCard) pode já ter sido tratada por essa frente. **Antes de delegar a seção do motorista, reaudite** (4 chamadas: subir, print 390/320, sonda de estilo, sonda de truncamento).
3. Isto é Expo Web no Chromium. Sombra (`boxShadow`) e gradiente no Android continuam sem prova em aparelho (§5 da direção de arte).

---

## Placar

| Tela | Nota | Em uma linha |
|---|---|---|
| `/` início (passageiro) | **8** | Tratada. Sobram o selo do mapa em cima do botão, a moldura do mapa legada e título amarelo no banner |
| `/destino` | **7,5** | Tratada. Seta de voltar em glifo, título trunca em 320 |
| `/confirmacao` | **7** | Tratada. Dois cards chapados, selo de mock quebra título em 2 linhas |
| `/boas-vindas` | **7** | Foto, scrim e CTA certos, mas há uma **emenda visível** em 390×844 |
| `/login` | **6** | Campos e CTA certos. Sem brilho de topo, CTA abaixo da dobra em 320×568 |
| `/cadastro` | **5** | Campos certos. Botões sociais legados, sem brilho de topo |
| `/concluida` | **4,5** | 3 cards legados, estrelas em glifo do sistema, sem brilho |
| `/a-caminho` | **4** | Cards legados, selo de status azul cheio é o elemento mais alto da tela, botão vermelho cheio |
| home do motorista (retrato 16h03) | **4** | 6 blocos amarelos, banner amarelo com selo ilegível (1,17:1), valor em dinheiro truncado |
| `/buscando` | **3** | Parece protótipo: disco amarelo de 133 pt como decoração, nada além disso na tela |
| `/em-andamento` | **3** | Parece protótipo: metade inferior vazia, sem mapa |
| `/catalogo` | n/a (5) | Tela interna de dev. Proponho tirar do build de produção, não tratar |

Nota 10 é a maquete `tools/art-assets/home-premium.html`. O que tira ponto, em ordem de peso: (1) tela que parece de outro app ao lado das tratadas, (2) amarelo fora de ação, (3) card legado, (4) defeito de layout medido (sobreposição, truncamento, emenda), (5) detalhe tipográfico.

---

## O que já está certo (não "corrija")

Medido e conforme à especificação. Não mexa nisto:

- **CTA primário** em todas as telas onde aparece (boas-vindas, login, cadastro, destino com destino, confirmação, concluída, "Aceitar" do motorista): `gradient.cta` `#FED202 → #FFCC00 45% → #FDB601`, sombra `0 4px 12px rgba(0,0,0,.45)` + aro claro inset, **56 pt** de altura, raio 12.
- **CTA desabilitado** (início, destino, confirmação, "Enviar avaliação"): `gradient.surface.overlay` `#1D2B40 → #152132`, sem brilho, texto apagado. Certo.
- **Botão secundário** (Cadastrar das boas-vindas, Ligar, Mensagem, Compartilhar/SOS, Preciso de ajuda, Recusar): gradiente overlay + borda de cima `#46566C`.
- **Campos** (`InputCore`): borda de cima `#46566C`, demais `#1E2A3B`, 52 pt, raio 12.
- **MockBadge**: já é o chip neutro tracejado (`#66768E`, 1 px, 20 pt). A decisão §8.5 foi aplicada. O problema que sobra é de **posição** (quebra títulos) e de **fundo** (sobre amarelo), não do componente.
- **Início do passageiro**: brilho de topo (`#0E1A2E → #070D18`, 420 pt), pílula de destino clara `#FEFEFE → #EEF1F9` com raio 20, atalhos e categorias em `surface.raised` com borda iluminada, categoria selecionada com borda 2 pt + `glow.selected`, avatar com **anel** (não disco cheio), tab bar `rgba(9,15,27,.94)` + `elevation.3` + traço amarelo de 3 pt na aba ativa, chips sobre o mapa em `glassOnMap` `rgba(17,27,42,.88)`.
- **Grade 2×2 de atalhos e categorias em lista com caixa de ícone em 320** (§6): aplicada e sem truncamento medido em 320/360/390/430.
- **Destino e confirmação**: brilho de topo, lugares salvos e formas de pagamento em `surface.raised` + borda iluminada, pagamento selecionado com borda 2 pt + halo.
- **Boas-vindas**: `photoScrim` atrás do texto, lockup só aqui, CTA e secundário corretos, título amarelo no "VuumBora!" (é a marca, igual à maquete).
- **Fonte**: Plus Jakarta Sans carregada em todo texto de interface (`PlusJakartaSans_400Regular` a `_700Bold`). A escala está coerente: título de tela 22 Bold, seção 16 Bold, corpo 16/14, legenda 12.
- **Fundo dos renders de veículo**: preto, aceito pelo dono por ora (§11.2). Não é divergência.

---

## Tela a tela

### `/` início do passageiro: 8

**Por que não é 10:** o selo "mapa ilustrativo" (117×20 em x 244, y 157) fica **em cima** do botão de localizar (44×44 em x 312, y 161). Os dois se sobrepõem em 49×16 pt nas duas larguras, e é o primeiro defeito que o olho acha. Fora isso, é a tela de referência.

| # | Divergência | Grav. | Correção |
|---|---|---|---|
| H1 | Selo "mapa ilustrativo" sobreposto ao botão de localizar, medido em 390 e 320 | **alta** | `apps/passenger/src/components/home/HomeMapPreview.tsx:92`: trocar `mockTag` para `{ position:'absolute', left: theme.spacing['3'], bottom: theme.spacing['3'] + 36 + theme.spacing['2'], zIndex: 2 }`, logo acima da pílula de endereço. Previsão: em 390 o chip vai para x 33, y ≈ 332, sem cruzar os controles (x ≥ 311) |
| H2 | Moldura do mapa legada: borda `#2D3A4C` nos 4 lados | média | `HomeMapPreview.tsx:84-91` (`root`): `borderTopColor: theme.role.edgeTop`, `borderColor: theme.role.edgeBottom` |
| H3 | Botões de localizar e zoom sobre o mapa com borda `#2D3A4C` igual nos 4 lados | baixa | `HomeMapPreview.tsx:159,165,186`: borda `rgba(255,255,255,.08)` com topo `rgba(255,255,255,.14)` (spec `surface.glassOnMap`) |
| H4 | Banner promo: títulos "Segurança em todas as viagens" e "10% OFF" em **texto amarelo** (14 pt Bold). Não é ação, e são 2 focos amarelos a mais | média | `apps/passenger/src/components/home/SafetyPromoBanner.tsx:72`: `title` em `theme.role.textPrimary`. Os ícones ficam amarelos |
| H5 | Banner promo em `surface.raised`, não em `gradient.promo` (navy `#1D3A66 → #0F213D`, 135°) | baixa | Mesmo arquivo: fundo `gradient.promo`. **Proibido `text.muted` sobre ele** (3,97:1, §4.1): a legenda passa a `textSecondary` |
| H6 | Atalhos com alturas diferentes em 390: Casa 84, Trabalho 100, Favoritos 100, Agendar 126 (o selo "demo" empurra) | baixa | `QuickAccessGrid.tsx`: `alignItems: 'stretch'` na linha, e o selo "demo" passa para o canto superior direito do atalho (absoluto, 4 pt) |

### `/destino`: 7,5

**Por que não é 10:** em 320 o título "Para onde vamos?" trunca (medido). A causa é o `ScreenHeader` reservar 44 pt vazios à direita sem `rightSlot`. A seta de voltar é o caractere "‹" em 28 pt da fonte do sistema, o único elemento da tela que não é Plus Jakarta nem lucide.

| # | Divergência | Grav. | Correção |
|---|---|---|---|
| D1 | Título trunca em 320 ("Para onde vamos?") | média | `packages/ui/src/ScreenHeader.tsx:35`: renderizar o `rightSlot` só se existir (`{rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}`). Ganha 52 pt (44 + vão de 8) |
| D2 | Seta de voltar é glifo "‹" do sistema | baixa | `ScreenHeader.tsx:20`: `<ChevronLeft size={24} color={theme.role.textPrimary} strokeWidth={2} />` (lucide). Mantém o alvo de 44×44 |
| D3 | Campo de origem tem a mesma cara do destino editável | baixa | Origem com fundo `surface.raised` sem foco, ou rótulo "Atual" à direita. Opcional |

### `/confirmacao`: 7

**Por que não é 10:** os cards "Origem/Destino" e "Categoria e preço" têm a borda certa mas fundo chapado `#111B2A`, ao lado das formas de pagamento em gradiente. A diferença é visível porque estão empilhados. Em 390, o título "Forma de pagamento" **quebra em 2 linhas** porque o selo "formas de pagamento fictícias" (200 pt) divide a linha com ele. Em 320, "Confirmar corrida" trunca e "Categoria e preço" também quebra.

| # | Divergência | Grav. | Correção |
|---|---|---|---|
| C1 | Selo de mock quebra título de seção ("Forma de pagamento" em 390; "Categoria e preço" em 320) | média | `apps/passenger/app/confirmacao.tsx:63` e `:82`: o `MockBadge` sai da linha do título e vai para a linha de baixo (`alignSelf:'flex-start'`, `marginTop: spacing['1']`). Regra geral: **selo de mock nunca divide linha com título de seção**, vale para todas as telas |
| C2 | Cards de rota e categoria chapados (`#111B2A`) | baixa | `confirmacao.tsx:118-128` (`card`): envolver com `SurfaceRaised` (já existe em `packages/ui/src/SurfaceRaised.tsx`) ou trocar o fundo para `gradient.surface.raised` |
| C3 | Título trunca em 320 | média | Resolvido por D1 |
| C4 | Ícone de carro amarelo na linha da categoria | baixa | `textSecondary`. Na confirmação, o amarelo é do CTA "Solicitar" |

### `/boas-vindas`: 7

**Por que não é 10:** em 390×844 o bloco de texto e o scrim **não descem até o pé da tela**. O scrim termina em y = 666, e daí para baixo aparece a base da foto, preta neutra. Medi a média de cada linha: y 664 = `rgb(7,13,24)` (o navy da marca), y 668 = `rgb(6,8,8)`, y 720 = `rgb(1,2,2)`. É uma emenda horizontal visível de navy para preto, com 178 pt de tela "morta" embaixo. Em 320×568 não aparece, porque o conteúdo excede a altura.

| # | Divergência | Grav. | Correção |
|---|---|---|---|
| B1 | Emenda navy→preto em y 666 (390×844), bloco de CTA flutuando no meio da tela | **alta** | **Causa raiz no design system:** `packages/ui/src/AppShell.tsx:49`. Com `scroll`, o wrapper de conteúdo não cresce (`!scroll && styles.flexFill`), então o `flex:1` da tela não tem altura para ocupar. Trocar por `scroll ? styles.scrollFill : styles.flexFill`, com `scrollFill: { flexGrow: 1 }`. Previsão em 390×844: o CTA "Entrar" desce de y 478 para y ≈ 640 e o scrim vai até o pé (linha 840 com média ≈ `rgb(7,13,24)`). **Afeta toda tela com `scroll`**: Íris precisa rodar login, cadastro, confirmação, concluída e o início depois da troca |
| B2 | Base da foto `onboarding-noturno.jpg` é preto neutro, não navy | baixa | Fica coberta depois de B1. Se reaparecer em tela alta (430×932), escurecer os 28% finais do asset para `#070D18` (o §7.1 já especifica isso; a foto atual não segue) |
| B3 | Links "Termos de Uso"/"Política de Privacidade" em amarelo sublinhado | baixa | Aceitável: são ação. Se o dono achar ruidoso, trocar por `textPrimary` sublinhado |

### `/login`: 6

**Por que não é 10:** é a tela de entrada para quem já tem conta e não tem o brilho de topo (fundo chapado `#070D18`, sem gradiente). Em 320×568 o botão "Entrar" fica **abaixo da dobra** (y 525 a 581, com a tela acabando em 568), porque o lockup de 160×122 come o topo. São 3 amarelos numa tela de formulário: CTA, "Mostrar" e "Recuperar acesso".

| # | Divergência | Grav. | Correção |
|---|---|---|---|
| L1 | Sem brilho de topo | média | `apps/passenger/app/login.tsx:44`: `<AppShell scroll glow …>` |
| L2 | CTA abaixo da dobra em 320×568 | média | Lockup compacto quando a altura < 640 (mesma regra do §6 para o onboarding: 52% da largura, máx. 120 de altura). Previsão: o CTA termina em y ≈ 540 |
| L3 | "Mostrar" (dentro do campo de senha) em amarelo | baixa | `PasswordInput.tsx`: `textSecondary` semibold. É controle de campo, não ação da tela. "Recuperar acesso" continua amarelo |

### `/cadastro`: 5

**Por que não é 10:** os botões "Continuar com Google" e "Continuar com Apple" são os únicos botões do app com a assinatura **legada**: fundo chapado `#192536` e borda `#66768E` igual nos 4 lados. Ficam logo abaixo de um CTA premium e parecem de outro produto. Também não tem brilho de topo.

| # | Divergência | Grav. | Correção |
|---|---|---|---|
| R1 | Botões sociais legados | média | `apps/passenger/src/components/auth/SocialSignInSection.tsx`: usar `SecondaryButton` (gradiente overlay + borda iluminada) no estado desabilitado. Manter o selo "login social pendente de decisão" |
| R2 | Sem brilho de topo | média | `apps/passenger/app/cadastro.tsx:43`: `glow` |
| R3 | "Mostrar" amarelo | baixa | Resolvido por L3 |

### `/concluida`: 4,5

**Por que não é 10:** os 3 cards da tela (valor final, comprovante, avaliação) são **legados**: `#111B2A` com borda `#2D3A4C` nos 4 lados. As estrelas de avaliação são o glifo "☆" em 28 pt da fonte do sistema, cinza, sem nada de marca. O título "Concluída" começa em x 72 sem seta de voltar, então fica desalinhado de todo o conteúdo, que começa em x 20. Não há brilho de topo nem selo de sucesso: é a tela de fechamento da experiência e é a mais seca.

| # | Divergência | Grav. | Correção |
|---|---|---|---|
| F1 | 3 cards legados | **alta** | `apps/passenger/app/concluida.tsx:154-163` (`fareCard`), `:170-177` (`receiptCard`), `:179-187` (`ratingCard`): envolver em `SurfaceRaised` ou aplicar `gradient.surface.raised` + `edgeTop`/`edgeBottom`. `divider` (`:178`) em `edgeBottom` |
| F2 | Título desalinhado (x 72) por causa da caixa de 44 pt reservada para a seta, que não existe | média | `packages/ui/src/ScreenHeader.tsx:22-23`: sem `onBack`, não renderizar o `View` vazio. Previsão: o título vai para x 20. Corrige também `/a-caminho` e `/em-andamento` |
| F3 | Estrelas em glifo "★/☆" do sistema | média | `packages/ui/src/StarRating.tsx:51,70`: `Star` do lucide. Vazia: `textMuted`, traço 1,75. Cheia: `fill` e `color` `brand.yellow`. 32 pt na avaliação, 14 pt no card do motorista. Aqui o amarelo é correto, porque a estrela **é** a ação de avaliar |
| F4 | Sem brilho de topo | baixa | `concluida.tsx:60`: `glow` |
| F5 | Nenhuma marca de sucesso | baixa | `StatusBadge` "Corrida concluída", variante success **tintada** (ver A2). Nunca branco sobre verde (2,28:1, §2.1) |

### `/a-caminho`: 4

**Por que não é 10:** o card do motorista e o card de ETA são legados (`#111B2A`, `#2D3A4C` nos 4 lados), logo acima de 3 botões secundários premium: a mistura fica evidente. O selo de status "Motorista encontrado" é uma pílula **cheia** em `#6EA8FF` (180×26), a cor mais saturada da tela e puxada para o ciano que o dono vetou. Ela chama mais atenção que o nome do motorista e que a placa, que é o que o passageiro procura. "Cancelar corrida" é um bloco **vermelho cheio** de 350×52 (`#D02A38`), o maior bloco de cor da tela. O §3.1 define cancelamento como contorno vermelho com fundo levemente vermelho. São 3 selos de mock numa tela de 4 cards.

| # | Divergência | Grav. | Correção |
|---|---|---|---|
| A1 | Cards legados (motorista e ETA) | **alta** | `apps/passenger/src/components/assignedDriver/DriverInfoCard.tsx:47-56` e `apps/passenger/app/a-caminho.tsx:115-124` (`etaCard`): `gradient.surface.raised` + `edgeTop`/`edgeBottom`. Padding 16 (hoje 12; os outros cards do app usam 16) |
| A2 | `StatusBadge` cheio (`#6EA8FF` com texto navy) | **alta** | **No design system**, `packages/ui/src/StatusBadge.tsx:20-24`: trocar todas as variantes para **tintadas**: fundo = cor a 14% sobre `surface`, borda 1 px a 40%, texto e glifo na própria cor. Contraste previsto: success `#22C55E` sobre `#0F2A1E` ≈ 6,7:1 (o §2.1 mediu 6,74). Info: confirmar com medição antes de aplicar. Se `#6EA8FF` tintado ficar ciano demais ao lado do navy, usar `textSecondary` para "encontrado" e success para "chegou" |
| A3 | "Cancelar corrida" em vermelho cheio | **alta** | `packages/ui/src/ButtonCore.tsx:111-119` (variante danger): fundo `rgba(208,42,56,.10)`, borda 1 px `dangerFill`, texto `danger`. Afeta `/buscando` também. É regra do §3.1, não opinião. **Confirmar contraste do texto `danger` sobre o composto** (previsão > 4,5:1 sobre `#1A1A26`, medir) |
| A4 | Título desalinhado (x 72) | média | Resolvido por F2 |
| A5 | Sem mapa. Na referência (P09), o mapa é o protagonista desta fase | média (esforço alto) | Faixa de mapa no topo com `MapPreviewBackground` (já existe), 200 pt (168 em altura < 640), pino do motorista e do embarque, cards abaixo. Sem brilho de topo nessa tela (regra do `glow`: nunca sobre mapa) |
| A6 | 3 selos de mock empilhados | baixa | Juntar "progresso simulado" + "ETA simulado" + "contato e SOS simulados" num selo só no topo: "corrida simulada: progresso, ETA e contato". Continua honesto, com 2 focos a menos |
| A7 | Estrelas em glifo | baixa | Resolvido por F3 |

### Home do motorista (retrato de ~16h03): 4

**Por que não é 10:** é a tela com mais amarelo do produto. Contei **6 blocos de fundo amarelo** (ponto do avatar, pílula ONLINE, traço da rota, banner "Alta demanda" de 350×96, selo "Nova corrida", CTA "Aceitar"), mais 3 textos amarelos, borda amarela no card de oferta, borda amarela no chip "Dinâmica", e ícones amarelos em métricas e atalhos. A referência tem **um** bloco amarelo por tela. O banner "Alta demanda" tem um selo de mock com texto `#B9C4D2` **sobre amarelo: 1,17:1**. O selo de honestidade está ilegível, e ainda quebra a regra "sobre amarelo, só navy". Em 360, 390 **e** 430, o valor "R$ 247,90" do card "Ganhos hoje" **trunca** ("R$ 247…"): dinheiro truncado é defeito de dado, não de estética. Os cards de métrica não têm borda nenhuma, e os de status, mapa, oferta e atalhos são legados.

| # | Divergência | Grav. | Correção |
|---|---|---|---|
| M1 | Banner "Alta demanda" amarelo cheio + selo de mock ilegível (1,17:1) | **alta** | `apps/driver/src/components/home/HighDemandBanner.tsx:45,51,54-55`: fundo `gradient.promo`, borda iluminada, ícone `Zap` e seta em `brand.yellow`, título `textPrimary`, legenda `textSecondary` (`textMuted` é proibido no promo). Pressionado: `surfaceElevated`. O selo passa a ter fundo escuro, e o contraste volta ao padrão (11:1) |
| M2 | "R$ 247,90" truncado em 360/390/430 | **alta** | `apps/driver/src/components/home/DailySummarySection.tsx:33`: grade 4 em linha só a partir de **430** (`width >= 430`). Abaixo, 2×2 (em 320 o 2×2 já mostrou o valor inteiro). Medir em 360/390/430 depois: nenhum valor pode truncar |
| M3 | MetricCard sem borda nenhuma | **alta** | `packages/ui/src/MetricCard.tsx:80-86` (`card`): `gradient.surface.raised` + `edgeTop`/`edgeBottom`, `borderWidth: 1` |
| M4 | Cards legados: status, mapa, oferta, atalhos | **alta** | `OnlineToggle`, `DriverMapPreview`, `NewRideOfferCard` (`card`), `QuickActionsRow`: superfície raised + borda iluminada. **Lido no código às 16h20, não medido:** `OnlineToggle` e `QuickActionsRow` já passaram a usar `SurfaceRaised`, e `NewRideOfferCard` ganhou halo. A frente paralela pode já ter fechado este item; os números de linha deste bloco valem para o código de 16h03. No card de oferta, a borda amarela de 1 px vira o tratamento de **selecionado** (2 pt + `glow.selected`), porque a oferta é o item em foco |
| M5 | Selo "Nova corrida" amarelo cheio (fica dentro de um card que já tem borda amarela) | média | `NewRideOfferCard.tsx:144`: chip tintado (`tint.yellowSoft`, texto amarelo). O destaque fica com a borda do card |
| M6 | "Recusar" 52 pt ao lado de "Aceitar" 56 pt, desalinhados na base | média | Mesma altura nos dois (56). Em `ButtonCore`, aceitar `size="prominent"` também na variante secundária, ou `minHeight` igual no par |
| M7 | Ícones amarelos em métricas (carteira, estrela) e nos 3 atalhos | média | `DailySummarySection.tsx:40,59` e `apps/driver/app/index.tsx:26-28`: `textSecondary` (regra do §3.1: ícone de lista em `text.secondary`). A estrela da avaliação pode continuar amarela, por semântica |
| M8 | Sem brilho de topo | média | `apps/driver/app/index.tsx:74`: `glow`. O mapa começa em y 292; o brilho cobre até 420 e já convive com o mapa no início do passageiro, sem conflito medido lá |
| M9 | Mapa placeholder de linhas chapadas (`#2D3A4C`), não o asset | média | Pode já estar resolvido pela frente paralela (`DriverMapPreview.tsx` agora importa `MapPreviewBackground variant="motorista"`). **Reauditar** |
| M10 | Truncamento em 320: "Ajuda e contato", "Você está online e…" | baixa | Atalhos: subtítulo `numberOfLines={2}`. Status: texto embaixo do toggle em < 360, não ao lado |
| M11 | "São Paulo - SP" no motorista; o passageiro e o asset de mapa são Natal | baixa | Dado de mock, não estética. Alinhar para "Natal - RN" (coerência de demo) |

### `/buscando`: 3

**Por que não é 10:** a tela tem 4 elementos: um selo de mock solto no canto (y 20, sem cabeçalho), dois discos amarelos concêntricos (133×133 e 76×76, `#FFCC00`), um título e o botão vermelho cheio no pé. O maior bloco amarelo da tela é **decoração** de animação, e o CTA da tela é vermelho. Não há brilho, superfície, borda iluminada nem marca. De todas as telas do fluxo, é a que mais parece protótipo ao lado do início.

| # | Divergência | Grav. | Correção |
|---|---|---|---|
| S1 | Disco amarelo cheio como animação | **alta** | `apps/passenger/src/components/search/SearchingPulse.tsx:69-76`: núcleo em `surface.raised` com borda 2 pt `brand.yellow` e ícone de carro amarelo (o `vehicle.iconBoxSelected` do §4 serve de base). Anel pulsante em `brand.yellow` só como **traço** de 2 pt (sem preenchimento), opacidade 0,45→0 como hoje. Amarelo vira linha, não bloco |
| S2 | Botão vermelho cheio | **alta** | Resolvido por A3 |
| S3 | Sem brilho e sem âncora visual | média | `apps/passenger/app/buscando.tsx:56`: `<AppShell glow>`. Card `surface.raised` abaixo do título com destino e categoria ("Vuum Econômico · R$ 23,90"), que dá ao usuário o que conferir enquanto espera |
| S4 | Selo de mock solto no topo, sem cabeçalho | baixa | Logo horizontal pequeno (30 pt, §2.1) no topo, com o selo abaixo do título |

### `/em-andamento`: 3

**Por que não é 10:** em 390×844, tudo acaba em y 408. Mais da metade da tela é fundo vazio `#070D18`. A barra de progresso é um traço de 8 pt (`#192536` + `#FFCC00`), o card do motorista é legado e o título fica desalinhado (x 72). É a fase mais longa da corrida e a tela com menos conteúdo.

| # | Divergência | Grav. | Correção |
|---|---|---|---|
| E1 | Sem mapa, metade da tela vazia | **alta** (esforço alto) | Mesma solução de A5: mapa no topo (`MapPreviewBackground`), rota amarela de 7 pt com halo (`map.route`), balão de destino (`map.balloon`). Cards abaixo, num bottom sheet (`surface` + `elevation.3`) |
| E2 | Card do motorista legado | **alta** | Resolvido por A1 (mesmo `DriverInfoCard`) |
| E3 | Barra de progresso chapada | média | `apps/passenger/src/components/trip/TripProgressBar.tsx`: trilho `#1E2A3B`, preenchimento `gradient.cta` (horizontal), e ponta com halo `glow.selected`. Altura 6 |
| E4 | Título desalinhado | média | Resolvido por F2 |
| E5 | Hierarquia: "6 min" (16 Bold) disputa com o endereço (14) | baixa | ETA em 28 Bold tabular ("6 min"), rótulo "Chegada estimada" acima em 12. É a informação que o passageiro procura nesta fase |

### `/catalogo`: n/a (5 se fosse avaliada)

Tela de dev (vitrine do design system). O título "Catálogo de compon…" trunca em 390. **Não recomendo tratar**: recomendo que não vá para o build de produção (`__DEV__` ou rota fora do bundle). Se ficar, D1 resolve o título.

---

## Ordem de aplicação (maior impacto por esforço primeiro)

Mesma lógica do §9. Cada linha diz o que corrige e em quantas telas, para delegar direto. **"DS"** é mudança no design system: corrige várias telas de uma vez e por isso vem antes.

| Ordem | Item | Arquivo(s) | Telas que melhoram | Esforço | Grav. |
|---|---|---|---|---|---|
| 0 | **Pré-requisito, não é estética:** consertar `demoAssets.ts:12` (`Image.resolveAssetSource` não existe no web; hoje os dois apps não abrem) | `packages/ui/src/demoAssets.ts` | todas | baixo | bloqueante |
| 1 | `AppShell` com `scroll` passa a crescer (`flexGrow:1` no wrapper) | DS `AppShell.tsx:49` | boas-vindas (emenda), e prevenção em toda tela com scroll | 1 linha | alta |
| 2 | Banner "Alta demanda" sai do amarelo, vai para `gradient.promo` | `HighDemandBanner.tsx` | motorista | baixo | alta |
| 3 | `ScreenHeader`: sem `onBack` não reserva caixa; sem `rightSlot` não reserva caixa; seta em `ChevronLeft` | DS `ScreenHeader.tsx:20-35` | a-caminho, em-andamento, concluída (alinhamento); destino, confirmação, catálogo (truncamento em 320) | baixo | média |
| 4 | Variante danger em contorno + fundo 10% | DS `ButtonCore.tsx:111-119` | buscando, a-caminho | baixo | alta |
| 5 | `StatusBadge` tintado em todas as variantes | DS `StatusBadge.tsx:20-24` | a-caminho (e toda tela futura com status) | baixo | alta |
| 6 | `glow` no `AppShell` | `login.tsx:44`, `cadastro.tsx:43`, `buscando.tsx:56`, `concluida.tsx:60`, `apps/driver/app/index.tsx:74` (a-caminho/em-andamento só se não ganharem mapa, item 13) | 5–7 telas | 1 prop cada | média |
| 7 | Cards legados → `SurfaceRaised`/borda iluminada | `DriverInfoCard.tsx:47`, `a-caminho.tsx:115`, `concluida.tsx:154,170,179`, `confirmacao.tsx:118`, `HomeMapPreview.tsx:84`, `MetricCard.tsx:80` (DS), `OnlineToggle.tsx:80`, `DriverMapPreview.tsx:83`, `NewRideOfferCard.tsx:132`, `QuickActionsRow.tsx:47`, `SocialSignInSection.tsx` | a-caminho, em-andamento, concluída, confirmação, início, cadastro, motorista | médio (troca de estilo, 12 pontos) | alta |
| 8 | Valor em dinheiro truncado: grade 2×2 abaixo de 430 | `DailySummarySection.tsx:33` | motorista | baixo | alta |
| 9 | Selo do mapa sobre o botão de localizar | `HomeMapPreview.tsx:92` | início | baixo | alta |
| 10 | Amarelo fora de ação: títulos do promo, ícones de lista/métrica, "Mostrar", selo "Nova corrida", ícone da categoria na confirmação | `SafetyPromoBanner.tsx:72`, `DailySummarySection.tsx:40`, `apps/driver/app/index.tsx:26-28`, `PasswordInput.tsx`, `NewRideOfferCard.tsx:144`, `confirmacao.tsx` | início, login, cadastro, confirmação, motorista | baixo | média |
| 11 | Pulso da busca: amarelo vira traço, núcleo em superfície | `SearchingPulse.tsx:69-76` | buscando | baixo | alta |
| 12 | Selo de mock nunca divide linha com título; juntar selos redundantes | `confirmacao.tsx:63,82`, `a-caminho.tsx:79,90`, home "Escolha sua viagem" em 320 | confirmação, a-caminho, início | baixo | média |
| 13 | Mapa como protagonista em a-caminho e em-andamento (faixa de mapa + bottom sheet) | `a-caminho.tsx`, `em-andamento.tsx`, reuso de `MapPreviewBackground` | a-caminho, em-andamento | **alto** | alta |
| 14 | `StarRating` com lucide `Star` | DS `StarRating.tsx:51,70` | a-caminho, em-andamento, concluída | baixo | média |
| 15 | "Recusar" e "Aceitar" com a mesma altura | `ButtonCore`/`NewRideOfferCard` | motorista | baixo | média |
| 16 | Lockup compacto em altura < 640 (CTA acima da dobra) | `login.tsx`, `cadastro.tsx` | login, cadastro | baixo | média |
| 17 | Barra de progresso com gradiente e ETA em 28 pt | `TripProgressBar.tsx`, `em-andamento.tsx` | em-andamento | baixo | média |
| 18 | Itens baixos restantes: H3, H5, H6, D3, B2, B3, M10, M11, S4, E5, catálogo fora do build | vários | — | baixo | baixa |

**Sugestão de agrupamento para delegar** (uma frente por área, para não pagar o custo fixo várias vezes):

- **Frente DS (Lyra)**: itens 0, 1, 3, 4, 5, 14 e o `MetricCard` do item 7. Tudo em `packages/ui`, corrige várias telas de uma vez. Íris valida as telas afetadas, não só o componente.
- **Frente passageiro (Lyra)**: itens 6, 7 (passageiro), 9, 10, 11, 12, 16, 17.
- **Frente motorista (Lyra)**: itens 2, 7 (motorista), 8, 10 (motorista), 15. **Só depois de reauditar** a home do motorista (ver "Limites").
- **Frente mapa (Lyra, com a Nova se precisar)**: item 13. É a única de esforço alto e a que mais muda a percepção de a-caminho e em-andamento. Pode rodar em paralelo com as outras.

Para cada item: medir em 320/360/390/430 no navegador (`medir-antes-de-afirmar`) e passar pela Íris. As previsões numéricas acima (y do CTA nas boas-vindas, posição do selo do mapa, x do título) são para conferir, não resultado.

---

## Não medido (honestidade)

- **Fluxo da corrida em 320×568.** A captura em 320 foi bloqueada pela quebra do `demoAssets` (16h12). O fluxo só foi medido em 390. Previsão: `/a-caminho` em 320 quebra a linha de status (o código já tem `flexWrap` para isso, `a-caminho.tsx:110-114`) e "Compartilhar viagem / SOS" cabe (texto ≈ 210 pt em 280).
- **Home do motorista depois das 16h03**: ver "Limites".
- **Boas-vindas em 430×932 depois de B1**: não medi se a base preta da foto reaparece (B2).
- **Contraste das variantes tintadas** (A2, A3): calculado para success pelo §2.1, **não medido** para info e danger.
- **Android**: nada aqui foi visto num aparelho.
