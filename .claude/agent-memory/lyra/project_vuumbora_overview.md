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
- **Tipografia:** Plus Jakarta Sans (`@expo-google-fonts/plus-jakarta-sans`,
  instalado em 18/11/2026 nos dois apps). Carregamento via `useFonts` +
  `expo-splash-screen` em cada `_layout.tsx`. Nunca combine `fontSize`/`fontWeight`
  à mão num componente — use `textStyle`/`textStyleForSize`/`tabularNums` de
  `packages/ui/src/typography.ts` (exportados de `@vuumbora/ui`). Detalhe completo,
  incluindo por que glifo/símbolo decorativo fica fora da fonte da marca, em
  [[licoes-tipografia-plus-jakarta-sans]].
