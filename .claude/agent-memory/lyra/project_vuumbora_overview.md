---
name: project_vuumbora_overview
description: Estrutura do monorepo Vuumbora (Expo SDK 58, npm workspaces), onde ficam tokens, UI compartilhada e o catálogo de componentes.
metadata:
  type: project
---

Monorepo em `C:\Projetos\Web\Vuumbora`. Dois apps (`apps/passenger`, `apps/driver`,
Expo Router) + pacotes (`packages/tokens`, `packages/ui`, `packages/api-client`,
`packages/domain`).

- **Fonte única de cor/dimensão:** `VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json`
  (W3C DTCG). `packages/tokens/src/index.ts` só espelha/converte — nunca escrever HEX
  fora do JSON. `theme.role.*` é o que os componentes consomem (`screen`, `surface`,
  `surfaceElevated`, `input`, `textPrimary/Secondary/Muted`, `ctaBackground(Pressed)`,
  `ctaText`, `border`, `borderEmphasis`, `borderControl`, `success`, `danger`,
  `dangerFill`, `warning`, `info`).
- **Regra de cor (docs/identidade-visual.md §7):** amarelo nunca é fundo de tela, só
  destaque/CTA/link. Texto sobre preenchimento claro é sempre `ctaText` (navy). Erro
  preenchido usa `dangerFill` (nunca `danger`) com texto branco. Borda de
  controle (input/checkbox/toggle) é sempre `borderControl`. Desabilitado é
  `surfaceElevated` + `textMuted`, cores sólidas, **sem opacidade**.
- **`scripts/check-boundaries.mjs`** (rodado por `npm run check`) reprova qualquer HEX
  solto em `apps/` ou `packages/` e import cruzado passenger↔driver. Só isso — não
  pega "número mágico" de layout, então uso de tokens de spacing/radius/layout onde
  existir é convenção, não é enforced por script.
- **`packages/ui/src/index.ts`** é o catálogo oficial de componentes transversais
  (AppShell, ScreenHeader, BrandLogo, PrimaryButton/SecondaryButton/DangerButton,
  TextInput/PasswordInput/PhoneInput/SearchInput, InfoCard, MetricCard, StatusBadge,
  EmptyState, ErrorState, LoadingSkeleton, Avatar, MockBadge, BottomTabBar —
  os 3 últimos entraram na P03/Home do passageiro em 18/11/2026, ainda faltam no
  catálogo visual `apps/passenger/app/catalogo.tsx`). Faltam: Toast, Modal,
  BottomSheet, StarRating e o adaptador de mapa (MapView/RouteOverlay/LocationMarker,
  aguarda escolha de SDK).
- **Ícones: `lucide-react-native` + `react-native-svg`** instalados em
  `apps/passenger` em 18/11/2026 (decisão do dono para a P03 — ícones de traço
  consistente). Decisão de arquitetura: `packages/ui` continua SEM depender da lib de
  ícone — componentes transversais que precisam de ícone (`BottomTabBar`,
  `ButtonCore.icon`) recebem o ícone pronto via prop `ReactNode`/render-prop
  `({active, color}) => ReactNode`, nunca importam `lucide-react-native` direto. Isso
  mantém a `ui` agnóstica de lib de ícone; só o app escolhe e importa. Se o driver
  também precisar de ícones, instalar lá também (ainda não feito).
- **`AppShell` ganhou prop `footer?: ReactNode`** (18/11/2026) para telas com
  `BottomTabBar` fixo abaixo da área rolável. Empiricamente confirmado: o
  `ScrollView` interno do `AppShell` **não precisa de `style={{flex:1}}` explícito**
  para respeitar o espaço do `footer` — ele já herda `clientHeight = altura do
  SafeAreaView − altura do footer` corretamente (medido: viewport 800, footer 68,
  `ScrollView.clientHeight` = 732, exatamente a conta). Rolar até o fim não causa
  sobreposição com o footer (medido nos 3 breakpoints). Não "consertar" isso de novo
  sem medir primeiro — já foi confirmado correto.
- **`ButtonCore` ganhou prop `icon?: ReactNode`** (ícone à esquerda do rótulo,
  oculto durante `loading`) — passa por `PrimaryButton`/`SecondaryButton`/
  `DangerButton` automaticamente (são só `Omit<ButtonCoreProps,'variant'>`).
- **Botões/Inputs são compostos sobre uma base interna não exportada**
  (`ButtonCore.tsx`, `InputCore.tsx`) — os 3 botões e os 4 campos são wrappers finos.
  Ao adicionar um novo botão/input, estender a base em vez de duplicar lógica de
  estado (padrão/pressionado/desabilitado/carregando/erro).
- **Ícones:** não há `@expo/vector-icons` nem nenhuma lib de ícone instalada no
  projeto ainda. Os componentes atuais usam só glifos de texto Unicode simples
  (`✓ ✕ ! i •`) ou formas desenhadas com `View` (ex.: lupa do `SearchInput`) — nunca
  emoji. Se uma lib de ícones for adicionada no futuro, é decisão de projeto (falar
  com Atlas/Nova), não assumir silenciosamente.
- **`apps/passenger/app/catalogo.tsx`** é a tela de revisão visual (print) de todo
  componente de `@vuumbora/ui` e seus 5 estados. Helpers só dela, não exportados de
  `ui`, ficam em `apps/passenger/src/components/catalog/` (`CatalogSection`,
  `CatalogRow`, `PressedButtonPreview`, `FocusedFieldPreview`). "Pressionado" e
  "focado" são estados de interação real — essas duas preview são amostras
  **estáticas** (reaproveitam as mesmas cores do componente real) só para aparecer
  no print; não confundir com os componentes de produto.
- `AppShell` usa `SafeAreaView` de `react-native-safe-area-context` → precisa de
  `SafeAreaProvider` no `_layout.tsx` raiz de cada app (adicionado no passenger em
  18/11/2026; o driver AINDA NÃO TEM — conferir antes de usar `AppShell` lá).
- **`BrandLogo` é provisório.** O dono mandou a logomarca de verdade
  (`Imagens/LogoMarca.png`). O Apolo vai gerar os recortes antes de qualquer
  integração — **não mexer em `BrandLogo` por conta própria** até o Atlas passar
  os assets prontos (combinado em 18/11/2026).
- **Fluxo de pedido de corrida (P04 destino, P06 confirmação, P07 busca) implementado em
  18/11/2026**, saindo da Home (`apps/passenger/app/{destino,confirmacao,buscando}.tsx`).
  Sem mockup de referência — derivadas do design system. Estado do pedido (origem,
  destino, categoria, forma de pagamento, fase) vive em
  `apps/passenger/src/store/useRideRequestStore.ts` (Zustand — primeira vez que a lib
  entra no projeto, só em `apps/passenger`; `docs/decisions.md` previa isso: "entra
  quando a primeira tela precisar"). `RideDraft`/`canRequestRide` continuam vindo de
  `@vuumbora/domain/passenger` (regra de negócio já existia, só não tinha consumidor).
  Dados mock específicos da store ficam em `apps/passenger/src/data/` (`mockPlaces.ts`,
  `mockPaymentMethods.ts`, `mockRideCategories.ts` — este último também é a fonte única
  de categoria/preço/ETA que a Home (P03) já usava antes espalhado inline).
  **Navegação:** `router.push` para telas pré-corrida (Destino, Confirmação — permitem
  voltar); `router.replace('/buscando')` ao solicitar, para que a tela de Confirmação
  saia da pilha (regra de domínio "em corrida ativa não volta pra escolha de destino");
  P07 não tem botão de voltar no cabeçalho. Cancelar a busca (`cancelSearch()`) só reseta
  `phase` para `'draft'` — mantém origem/destino/categoria/pagamento já escolhidos.
  **`InputCore` ganhou `onFocus?`/`onBlur?`** (opcionais, repassados do `RNTextInput`
  interno) para a P04 saber qual campo (origem/destino) está ativo e aplicar o resultado
  do autocomplete nele — primeiro caso de extensão da base de input desde que ela existe.
- **Telas de entrada do passageiro (P01/P02 + Login, 18/11/2026):**
  `apps/passenger/app/{boas-vindas,login,cadastro}.tsx` — rotas FLAT (sem grupo
  `(auth)`, seguindo o precedente de `destino.tsx`/`confirmacao.tsx` etc., não o
  grupo que o comentário do `_layout.tsx` cogitava). **`react-hook-form` +
  `zod` + `@hookform/resolvers` entraram só em `apps/passenger`** (instalados via
  `npx expo install`, primeira vez que a dupla aparece no projeto — schemas em
  `apps/passenger/src/schemas/authSchemas.ts`, mensagens em português, validação
  de FORMATO apenas, não regra de negócio). Padrão de campo: `Controller` do RHF +
  `TextInput`/`PhoneInput`/`PasswordInput` de `@vuumbora/ui`, ícone via
  `leftAccessory` (primeiro uso dessa prop no app) com ícone `lucide-react-native`
  cor `theme.role.textMuted`. Erro de campo: ver helper `fieldErrorProps` em
  [[feedback_medir_expo_web_playwright]] (mesma causa raiz do `exactOptionalPropertyTypes`
  já documentada ali, agora também pra `errorMessage`).
  **Sem autenticação real** (`src/lib/simulateAuthRequest.ts` é only placeholder —
  pendência pro Vega): ao "logar"/"cadastrar", navega com
  `router.replace({pathname:'/', params:{simulated:'1'}})` e a Home
  (`apps/passenger/app/index.tsx`) lê esse param via `useLocalSearchParams` e mostra
  um `MockBadge` — é assim que a ação fica **visivelmente** marcada como simulada
  (mesmo padrão do [[feedback_marcar_dado_mock_visivelmente]]).
  **Login social (Google/Apple) é decisão de negócio pendente** (docs/decisoes-do-dono.md
  item 8) — botões sempre `disabled` + `MockBadge`, sem SDK nenhum instalado; vivem em
  `apps/passenger/src/components/auth/SocialSignInSection.tsx`.
  **Termos de Uso/Política de Privacidade e "Recuperar acesso" não existem de
  verdade** — em vez de navegar pra rota vazia, o toque revela um aviso inline
  (`UnavailableNoticeBanner`, `accessibilityLiveRegion="polite"`, não é erro então
  não usa `accessibilityRole="alert"`) explicando que ainda não está disponível.
  **Componentes locais ficam em `apps/passenger/src/components/auth/`**
  (`AuthHeader`, `LegalNotice`, `SocialSignInSection`, `UnavailableNoticeBanner`) —
  não em `packages/ui`, por restrição de coordenação (outra missão mexendo em
  `packages/ui`/tokens em paralelo em 18/11/2026); se algo ali for de fato
  transversal (ex.: `UnavailableNoticeBanner`), avaliar promover depois.
- **Direção de arte "premium" (`docs/direcao-de-arte.md`, Apolo, 18/11/2026)
  aplicada — itens 1 a 6 da seção 9 (18/11/2026).** Tokens novos em
  `vuumbora.tokens.json`: `gradient.cta/surfaceRaised/surfaceOverlay/searchLight/screen`,
  `elevation.0-3/cta`, `glow.selected`, `color.border.subtle` (`edgeBottom`),
  `color.highlight.*` (rim do CTA, halo do selecionado), `color.overlay.*`
  (`glassOnMap`, `tabBar`), `color.text.onLightMuted`, e dimensões
  `screenPaddingCompact/buttonHeightProminent/searchHeight(Compact)/mockChipHeight`
  — todos espelhados em `theme.role.*`/`theme.gradient`/`theme.elevation`/`theme.glow`
  por `packages/tokens/src/index.ts`. `BoxShadowValue`/`GradientStop` são os tipos
  exportados; a prop RN `boxShadow` aceita o array de shadow direto, sem
  serializar string CSS — ver [[boxshadow_rn088_android_evidencia]] antes de
  assumir que funciona (ou não) no Android.
- **`expo-linear-gradient` e `expo-image` instalados nos dois apps** (decisão do
  dono, 18/11/2026) — `expo-linear-gradient` também é peerDependency de
  `packages/ui` (ButtonCore/SurfaceRaised/AppShell importam direto). Plugin
  `expo-image` adicionado em `app.config.ts` dos dois apps (config dinâmico não
  escreve plugin sozinho, precisa editar à mão). **Não usar `expo-blur`**
  (decisão do dono: custa quadros no Android, "vidro" da referência é opaco).
- **`SurfaceRaised` (novo componente em `packages/ui`)**: `LinearGradient` fino
  que aplica `gradient.surface.raised` — todo card/atalho (`InfoCard`,
  `QuickAccessGrid`, `RideCategoryCard`, `PaymentMethodOption`,
  `SafetyPromoBanner`) usa ele no lugar de `backgroundColor: theme.role.surface`
  chapado. Quem dá volume ao card é a borda (`theme.role.edgeTop`/`edgeBottom`,
  "top-lit edge"), não o gradiente — ele é quase imperceptível sozinho, de
  propósito. `gradientColors`/`gradientLocations` (`packages/ui/src/gradient.ts`)
  convertem `theme.gradient.*` (array `{color,position}`) para o par
  `colors`/`locations` do `expo-linear-gradient`.
- **Bug real achado aplicando a grade 2×2 do `QuickAccessGrid`** (ícone ao lado
  do texto abaixo de 375pt): colocar o `MockBadge` como IRMÃO de largura fixa do
  bloco de texto `flex:1`, com `marginLeft:'auto'`, espremeu o texto a ~12px
  (cortou "Agendar" para "A."). Corrigido empilhando o badge DENTRO do bloco de
  texto. Causa raiz generalizável em [[bug_flex_fixo_espreme_texto_flex1_vizinho]].
- **Itens 7/8/9 da direção de arte + os 3 sub-itens bloqueados por arquivo
  aplicados (18/11/2026, `apps/passenger/app/` liberado).** `RideCategoryCard`
  ganhou responsividade própria (`useWindowDimensions`, igual ao padrão do
  `QuickAccessGrid`): lista vertical com `iconBox` 48pt (`theme.spacing['9']`)
  abaixo de 375pt, ilustração do veículo (`VehicleIllustration`, novo em
  `packages/ui`) a partir de 360pt — logo a zona 360–374 é lista COM
  ilustração, não ícone genérico. `index.tsx` escolhe `categoryRow` (linha) vs
  `categoryColumn` (pilha) no mesmo breakpoint 375. Medido @320: touch target
  das linhas ≥66pt de altura (sobra folgada sobre os 44pt mínimos).
  `confirmacao.tsx` (`styles.card`, inline): borda trocou `theme.role.border`
  por `borderTopColor: edgeTop` / `borderColor: edgeBottom`. `AppShell` ganhou
  `glow` ligado em `index.tsx` (home), `confirmacao.tsx` e `destino.tsx` — o
  comentário do próprio `AppShell` ("Nunca sobre mapa") não se aplica aqui
  porque `HomeMapPreview` é um card opaco de 260pt, não uma tela de mapa
  cheia; o `glow` (absoluto, 420pt do topo) fica atrás do card e nunca
  aparece por cima dele (confirmado via DOM: o nó do gradiente mede
  top:0/height:420, o card do mapa começa bem depois). `HomeMapPreview` trocou
  o placeholder desenhado (vias procedurais com `View`) pelo asset
  `mapa-escuro-natal.jpg` via novo componente `MapPreviewBackground`
  (`packages/ui`, `Image` do RN core, `resizeMode="cover"`) — os chips (cidade,
  marco, controles, chip de endereço) viraram `theme.role.glassOnMap` em vez
  de `theme.role.surface` chapado. `boas-vindas.tsx` ganhou o fundo fotográfico
  + scrim da maquete `tools/art-assets/onboarding-premium.html`: novo
  componente `OnboardingBackground` (`packages/ui`, único lugar do pacote que
  usa **`expo-image`** — peerDependency nova, só porque `contentPosition`
  percentual não existe no `Image` do RN core e a maquete pede `center 30%`)
  renderizado ATRÁS do `AppShell`, que por sua vez precisou de uma prop nova
  `transparent` (omite o `backgroundColor: theme.role.screen` opaco pra foto
  aparecer). O bloco de texto/CTA migrou pro rodapé (headline+promise+botões
  juntos, como a maquete — antes ficavam junto do logo no topo) sobre
  `gradient.photoScrim` (token NOVO, `vuumbora.tokens.json`, não existia antes
  desta sessão). Logo menor (`BrandLogo size="md"` em vez de `"lg"`) quando
  `useWindowDimensions().height < 640` — span de 320×568 ainda passa de
  568 pra ~614px de conteúdo (medido), ou seja **precisa de ~46px de rolagem
  nesse breakpoint específico**, não é "cabe 100% sem rolar" como a maquete
  HTML original. Dois `declare module` novos em `packages/ui/src/assets.d.ts`
  (`*.jpg`, além do `*.png` que já existia) — mesma mecânica de visibilidade
  transitiva via triple-slash já documentada ali (qualquer arquivo do
  programa que importe algo de `BrandLogo` já puxa o `.d.ts` inteiro).
- **Tipografia:** Plus Jakarta Sans (`@expo-google-fonts/plus-jakarta-sans`,
  instalado em 18/11/2026 nos dois apps). Carregamento via `useFonts` +
  `expo-splash-screen` em cada `_layout.tsx`. Nunca combine `fontSize`/`fontWeight`
  à mão num componente — use `textStyle`/`textStyleForSize`/`tabularNums` de
  `packages/ui/src/typography.ts` (exportados de `@vuumbora/ui`). Detalhe completo,
  incluindo por que glifo/símbolo decorativo fica fora da fonte da marca, em
  [[licoes-tipografia-plus-jakarta-sans]].
