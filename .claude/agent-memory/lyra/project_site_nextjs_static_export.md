---
name: project_site_nextjs_static_export
description: apps/site (site público, Next.js App Router com output:'export') — como os tokens chegam no CSS, como favicon/OG foram gerados, domínio oficial, o que falta.
metadata:
  type: project
---

Criado em 18/11/2026. `apps/site` é workspace novo (`@vuumbora/site`), Next.js
16 + React 19 (mesma versão fixada no `overrides` da raiz), **exportação
estática** (`output:'export'`, `images.unoptimized:true`, `trailingSlash:true`).
Domínio oficial **`https://www.vuumbora.com.br`** — fonte única em
`apps/site/src/lib/site.ts` (`SITE_URL`), lido por `layout.tsx`/`sitemap.ts`/`robots.ts`.

- **Cor/dimensão chegam via gerador, não hex à mão**: `apps/site/scripts/generate-tokens-css.mjs`
  lê `VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json` direto (mesma
  fonte do `@vuumbora/tokens`) e escreve `src/styles/tokens.generated.css`
  (`--color-x`, `--gradient-x`, `--elevation-x`...) a cada `npm run dev`/`build`
  (script `predev`/`prebuild` embutido). Esse CSS é `.gitignore`d, nunca editado
  à mão. Pulei `typography.family` de propósito (nomes de fonte estática
  Expo/Android, sem arquivo no navegador) — tipografia do site é
  `next/font/google` (Plus Jakarta Sans, self-hospedada no build).
  **Única exceção**: `layout.tsx` usa `@vuumbora/tokens` (pacote TS) para
  `viewport.themeColor`, porque isso é valor TS/JSON, não CSS, e
  `check-boundaries.mjs` (raiz) reprova HEX solto em `.ts`/`.tsx`/`.json` de
  `apps/`. Precisou `transpilePackages:['@vuumbora/tokens']` no `next.config.mjs`
  (o pacote expõe TS fonte direto, sem build próprio).
- **`scripts/check-boundaries.mjs` (raiz) ganhou `.next`/`out` no `SKIP_DIRS`**
  (18/11/2026) — antes só tinha `.expo`/`dist`/`build`, e qualquer app Next
  reprovava o `npm run check` da raiz com HEX "solto" vindo do próprio bundle
  compilado (inclusive boilerplate interno do Next, ex. cores do 404 padrão:
  `#fff`/`#171717`/`#ededed`). Mesmo papel que `.expo` já tinha para os apps
  Expo — nunca escanear saída de build.
- **Favicon/ícone/OG gerados uma vez** por script Python de uso único (PIL,
  não versionado, rodado do scratchpad) a partir de `packages/ui/assets/brand/master/`:
  selo da marca (`vuumbora-selo.png`) centralizado sobre `color.brand.navy`
  (squircle) → `src/app/icon.png`/`apple-icon.png`/`favicon.ico` (convenção de
  arquivo do Next, zero metadado manual). Logo horizontal sobre
  `backgrounds/onboarding-noturno.jpg` + `gradient.photoScrim` → `public/og-image.jpg`
  (1200×630, **JPEG, não PNG** — PIL ignora `quality=` em PNG, saiu 529 KB; em
  JPEG caiu para 53 KB), referenciado manualmente em `metadata.openGraph`/`twitter`
  porque o pedido foi deixar em `public/`, não usar a convenção `app/opengraph-image.png`.
  Se a marca mudar, não há pipeline — regenerar à mão com a mesma receita.
- **Imagens de marca copiadas (não symlink) para `public/brand/`,
  `public/backgrounds/`**, redimensionadas/recomprimidas pro peso de web (logo
  horizontal: 217 KB → 34 KB). `packages/ui/assets/` não é importável direto
  por `next/image` fora da árvore do app com `output:'export'` de forma
  confiável — copiar é o caminho usado.
- **`sitemap.ts`/`robots.ts` exigem `export const dynamic = 'force-static'`**
  com `output:'export'` — sem isso o build quebra (`Next` recusa rota
  dinâmica não configurada como estática).
- **CSS Modules + `noPropertyAccessFromIndexSignature` (tsconfig raiz)**:
  `styles.algumaClasse` reprova (`TS4111`, o tipo de `*.module.css` é
  `{[key:string]:string}`) — todo acesso é `styles['algumaClasse']` neste
  projeto. Decisão tomada: bracket notation em vez de enfraquecer a flag
  (que é da raiz, vale pro monorepo inteiro).
- **Pendências que não são técnicas, são decisão do dono** (ver README do
  site): canal de contato real não existe (rodapé diz isso em vez de
  inventar e-mail), Termos/Privacidade não têm texto (rodapé mostra nome sem
  link), botões de loja e "cadastro de motorista" são `<button disabled>` de
  propósito, categorias de veículo (nomes ainda não definidos,
  `docs/decisoes-do-dono.md` #13) não aparecem no site.

Ver também [[bug_css_module_ordem_override_perde_para_base]] e
[[bug_playwright_fullpage_sticky_fantasma]].

## Reforma "premium" de 18/11/2026 (hero cinematográfico, telas reais, movimento)

Pedido do dono: sair de "correto" para "premium de verdade" — cena noturna no
topo, telas reais do app em molduras de celular alternando com fotografia,
movimento real com `prefers-reduced-motion` respeitado. No meio do trabalho,
o Atlas avisou que **o texto inteiro ia ser reescrito pelo Apolo**
(`docs/conteudo-site.md`) — decisão importante que mudou a arquitetura:

- **Todo texto de marketing saiu dos componentes e foi para `src/content/*.ts`**
  (um arquivo por seção: `hero.ts`, `passenger.ts`, `driver.ts`, `services.ts`,
  `credibility.ts`, `faq.ts`, `footer.ts`, `finalBanner.ts`, `nav.ts`). Os
  componentes só importam e renderizam — trocar o texto do Apolo depois foi
  editar dado, não reescrever JSX. **Vale para qualquer página de conteúdo
  deste projeto**: nunca hardcodar copy comercial dentro do componente desde
  o início, mesmo que o texto ainda seja provisório.
- **`NAV_LINKS` virou fonte única** (`content/nav.ts`) consumida por
  `Header`, `MobileNavToggle` e `Footer` — antes cada um tinha a própria
  lista hardcoded (risco de divergência).
- **`PhoneFrame.tsx`**: moldura de celular 100% CSS (bezel + botões
  laterais), nunca imagem de moldura. Ver
  [[bug_phoneframe_ilha_sobre_print_real]] sobre a ilha dinâmica removida.
- **`ParallaxScene.tsx`**: paralaxe discreta por `transform: translateY()`
  calculado em `scroll` com `requestAnimationFrame`, desligado sob
  `prefers-reduced-motion: reduce` e sem efeito nenhum se o JS não rodar
  (a imagem já cobre o recorte sem transform).
- **`Reveal.tsx`**: entrada "fade + sobe" ao rolar. Estado inicial do HTML é
  sempre visível (`data-hidden="false"`); só depois de montado (e só sem
  `prefers-reduced-motion`) um `useLayoutEffect` marca `data-hidden="true"`
  via `ref.dataset`, nunca `useState` — evita re-render por item revelado e
  evita o lint `react-hooks/set-state-in-effect`. `<noscript>` em
  `layout.tsx` força `data-hidden='true']{opacity:1}` como cinto de
  segurança extra.
- **`ScreensStrip.tsx`**: carrossel por rolagem horizontal (`overflow-x:auto`
  + `scroll-snap`) abaixo de 900px, vira linha sem rolagem acima disso — é a
  resposta a "em celular as molduras viram carrossel ou empilham".
- **`StatusTag.tsx`**: rótulo de situação do projeto (já existe / construindo
  / a decidir) sempre ícone + texto, nunca só cor — usado nos cartões de
  reclamação do motorista e nas 3 colunas de credibilidade.
- **`CommitmentBanner.tsx`**: quando o dono aprova um `[compromisso]` do
  Apolo, ele não vira só mais uma frase no meio do texto — vira este
  componente (borda amarela 2px + `glow.selected` + ícone de escudo),
  reservado para o argumento mais importante de uma seção. Única exceção
  deliberada à regra "amarelo só em ação".
- **Tokens da direção de arte (`docs/direcao-de-arte.md`) já estavam no
  `vuumbora.tokens.json`** quando cheguei (`--gradient-cta`,
  `--gradient-surface-overlay`, `--color-semantic-*`, `--elevation-cta`,
  `--glow-selected`) — outro agente já tinha aplicado. Conferir
  `tokens.generated.css` antes de inventar cor/gradiente novo.
- **`docs/conteudo-site.md` usa `[confirmar]`/`[compromisso]`** para marcar
  frase que depende de aprovação do dono, sempre com uma versão alternativa
  ao lado. Nunca publicar a versão principal sem o "sim" registrado em
  `docs/decisoes-do-dono.md` — o Atlas avisa quando a resposta chega.

Ver também [[bug_phoneframe_ilha_sobre_print_real]] e
[[feedback_medir_site_sem_browser_tool]].

## Mockups fotográficos + lista de espera + "Quem está por trás" (19/11/2026)

Pedido do dono: trocar o `PhoneFrame` (moldura CSS) por mockups fotográficos
de verdade onde existirem, e elevar a animação. No meio do trabalho o Atlas
liberou duas coisas que estavam bloqueadas por decisão do dono: a lista de
espera (backend pronto, `POST /v1/waitlist`) e o bloco institucional.

- **`PhoneMockup.tsx`** (novo, substitui `PhoneFrame` onde há mockup): uma
  única `<img>`/`<picture>` com a composição inteira (celular + brilho +
  sombra + fundo quase-preto já embutidos pelo dono em
  `public/mockups/*.jpg`, 1120px desktop / `-560.jpg` abaixo de 768px) —
  nunca `filter:drop-shadow` por cima (a imagem já tem sombra própria, dobrar
  borra a borda). `PhoneFrame` (CSS) virou fallback só para telas SEM
  mockup ainda.
  **Resolvido em 19/11/2026**: o dono entregou os dois mockups que
  faltavam (`boas-vindas`, `acompanhar-corrida`) — as 6 telas do site têm
  mockup fotográfico hoje. `PhoneFrame.tsx`/`.module.css` e
  `ParallaxScene.tsx`/`.module.css` foram **removidos do projeto** (nenhum
  uso restante) — `ShowcaseRow` perdeu a discriminated union `visual:
  {kind:'mockup'}|{kind:'scene'}` e virou só `{src1120,src560,alt}`, mais
  simples. Resultado colateral bom: trocar a linha "acompanhar-corrida" (que
  antes carregava DUAS imagens — print recortado + foto de cena de fundo,
  ~203 KB) por UMA imagem de mockup (~72 KB) **baixou o peso total da
  página** (~1,51 MB → ~1,37 MB em 1280px, medido).
  **Decisão de produto mantida no Hero**: mesmo com `boas-vindas.jpg`
  disponível agora, o Hero continua mostrando `home-passageiro` (mapa +
  categorias) — tela mais forte para o primeiro impacto que uma tela de
  login. `boas-vindas.jpg` fica no disco sem lugar fixo no site hoje.
  `public/screens/*.jpg` e `public/cenas/motorista-noite.jpg` ficaram
  órfãos (sem referência no código) — não apaguei por não ter sido pedido,
  mas é limpeza segura se alguém for arrumar `public/` depois.
- **`ShowcaseRow`/`ScreensStrip` viraram discriminated union** (`visual:
  {kind:'mockup',...} | {kind:'scene',...}`) em vez de sempre exigir
  `screen`+`scene` — deixa explícito no tipo quando uma linha tem mockup e
  quando ainda usa o fallback. Ver [[bug_fundo_mockup_vs_tom_secao]] para o
  acerto de fundo que isso exigiu.
- **`Reveal` ganhou `variant="media"`**: fade+subida igual ao padrão, mas com
  leve `scale(0.94)` extra e transição mais longa (0.65s vs 0.5s) — reservado
  para mockup/imagem, nunca para texto (seguindo docs/movimento.md: o
  "herói" da composição merece deslocamento mais perceptível). O cinto de
  segurança de `prefers-reduced-motion` precisa cobrir a combinação
  `[data-hidden='true'][data-variant='media']` explicitamente — a regra só
  para `[data-hidden='true']` tem especificidade MENOR e perde para a regra
  da variante fora do media query se não for repetida dentro dele.
- **Hero**: o mockup é decorativo (`aria-hidden`) e só aparece ≥1024px
  (`display:none` abaixo disso) — por isso ficou de fora de qualquer
  `Reveal` que pudesse atrasar o LCP real da página (a foto de fundo com
  `fetchPriority="high"`); só ele ganhou `variant="media"`, o texto do Hero
  continua sem Reveal nenhum, visível de cara.
- **`@vuumbora/api-client`** precisou entrar em `apps/site/package.json`
  (não estava — só os apps mobile tinham) + `next.config.mjs`
  `transpilePackages` (ele e `@vuumbora/domain` expõem TS fonte direto, sem
  build próprio, igual `@vuumbora/tokens`).
- **`WaitlistForm.tsx`** (novo, client component): um único formulário serve
  os dois públicos (campo `profile` é opcional no contrato) — rótulo do
  botão e texto de apoio trocam ao vivo conforme a pessoa marca
  "Passageiro"/"Motorista" (`src/content/waitlist.ts`, frases exatas de
  `docs/conteudo-site.md` §7 "versão B"). Usa `createWaitlistHttpAdapter` de
  `@vuumbora/api-client/waitlist`, `baseUrl` vindo de
  `NEXT_PUBLIC_WAITLIST_API_URL` (lida em BUILD TIME — export estático não
  tem servidor depois). **Sem a env var, mostra aviso honesto** em vez de
  formulário quebrado — `getWaitlistPort()` em `src/lib/waitlist-client.ts`
  devolve `null` e o componente troca o form por uma nota. Testei os 6
  estados (idle, e-mail inválido, trocar perfil ao vivo, loading, sucesso,
  429, 503) com um mock HTTP local batendo o contrato de
  `docs/lista-de-espera.md` §5 — todos corretos.
  `process.env['NEXT_PUBLIC_X']` (colchete, não ponto — regra do projeto é
  bracket notation por causa de `noPropertyAccessFromIndexSignature`, ver
  acima) **É substituído em build time pelo Next normalmente** — confirmado
  grepando o bundle gerado, não só suposto.
- **Backend (`apps/api`) ainda não publicado** (19/11/2026) — o build final
  entregue NÃO tem `NEXT_PUBLIC_WAITLIST_API_URL` definida de propósito (é o
  estado real). Vulcano precisa setar essa env var no Easypanel do
  `vuumbora-frontend` quando o `vuumbora-backend` for ao ar, senão o
  formulário fica desabilitado para sempre em produção.
- **`AboutBlock.tsx`** ("Quem está por trás", dentro de `CredibilitySection`,
  depois do `ScreensStrip`): Innovare Code, CNPJ, e-mail de contato. Sem
  cidade — o dono decidiu não publicar, então nada de campo opcional "a
  definir" reservado para ela (`src/content/about.ts`), é texto fechado.
- **Rodapé**: `contactNote` mudou de "ainda não temos canal" (falso agora)
  para apontar `contato@vuumbora.com.br` — mesmo e-mail do aviso de
  privacidade da lista de espera.

## Virada para página única de pré-lançamento (19/11/2026)

O dono: "está com cara de site amador feito por um estagiário". Pedido
mudou de vitrine longa e explicativa para **uma página só, clean, com uma
ação clara** — candidatura de motorista. Reescrevi `apps/site` quase por
inteiro (ver `docs/decisoes-do-dono.md` → "Virada do site").

- **Removidos do projeto** (sem uso restante, confirmado por grep antes de
  apagar): `PassengerSection`, `DriverSection`, `ServicesSection`,
  `CredibilitySection`, `FaqSection`, `ClosingBanner`, `JourneyShowcase`,
  `ScreensStrip`, `ShowcaseRow`, `Card`, `FeatureGrid`,
  `CredibilityColumns`, `StatusTag`, `DisabledAction`, `StoreBadges`,
  `Section`, `SectionHeading`, `MobileNavToggle`, `AnchorCta` + os
  `content/*.ts` que só eles usavam (`credibility`, `driver`, `faq`,
  `finalBanner`, `passenger`, `services`, `nav`). `Header` virou só a logo
  (sem menu — página única não tem seção para linkar). `PhoneMockup`
  sobrevive, reaproveitado em `ProductGlimpse` (uma tela só, perto do
  compromisso de taxa/repasse, para não parecer vitrine de novo).
- **Candidatura de motorista em DUAS etapas, decisão fechada do dono em
  19/11/2026** (`docs/decisoes-do-dono.md` → "DECISÃO: duas etapas"): etapa
  1 (`DriverApplicationForm.tsx`, nesta página) pede nome completo,
  telefone/WhatsApp, e-mail, cidade, UF (`<select>`, nunca texto livre,
  RN pré-selecionado) + duas perguntas opcionais (já dirige por
  app / tem veículo próprio). **Nada de endereço/CEP/documento** — isso é
  a etapa 2, só depois da aprovação, fora do escopo desta página.
  `DEFAULT_STATE='RN'` e a lista das 27 UFs vivem em
  `content/driverApplication.ts`.
- **Contrato do backend é PROVISÓRIO** — o Vega estava estendendo
  `apps/api`/`packages/api-client` em paralelo a esta tarefa, sem entregar
  a tempo. Criei `src/lib/driver-application-client.ts` por fora do
  `@vuumbora/api-client` (não editei o pacote do Vega, para não colidir),
  com uma porta própria (`DriverApplicationPort.apply`) que supõe
  `POST {baseUrl}/v1/driver-applications` em camelCase, mesma convenção de
  `/v1/waitlist` (`docs/lista-de-espera.md` §5: código de erro
  `invalid_<campo>`, `429`→rate_limited, `5xx`→unavailable). **Quando o
  contrato real chegar, o único arquivo que deveria mudar é esse** — o
  componente já fala com a interface, não com `fetch` direto. Testei o
  caminho inteiro (campo vazio → 4 erros sem chamar rede; erro do
  servidor mapeado pro campo certo; valores preservados após erro; sucesso)
  interceptando a rota com Playwright contra este contrato suposto — real
  até onde dá para testar sem o Vega, mas a FORMA exata do contrato real
  pode divergir (nome do endpoint, nomes de campo).
- **`WaitlistForm` virou exclusivo do passageiro** (perfil sempre
  `'passenger'`, sem seletor) — o motorista tem agora o seu próprio
  formulário completo. Reaproveitado dentro de `PassengerNote.tsx`, caixa
  discreta depois da candidatura (passageiro é secundário nesta página,
  pedido do dono).
- **`HeroScene.tsx`** é a animação pedida ("profissional, podendo ser
  3D"): pino da marca girando em CSS 3D (`perspective` + `rotateY`
  oscilando, sem spin completo) sobre uma rota SVG que se desenha uma vez
  (`stroke-dashoffset`), tudo SSR/sem JavaScript — zero custo de bundle,
  respeita `prefers-reduced-motion` via `@media` (estado padrão SEM media
  query já é o estado final correto, igual ao resto do projeto). **Decisão
  deliberada: nada de three.js/WebGL** — Runway (vídeo) estava fora por
  exigir plano pago, e uma lib 3D pesaria o bundle à toa quando CSS puro
  já entrega o efeito pedido ("pino em 3D" + "rota se desenhando").
  Ver [[bug_glow_decorativo_sem_overflow_hidden]] pelo overflow horizontal
  real que o brilho decorativo da cena causou em 320/390px antes da
  correção, e [[bug_playwright_fullpage_sticky_fantasma]] (atualizado)
  pelos vários falsos positivos de "fantasma" que descartei medindo com
  `clip` em vez de `fullPage:true`.
- **Tamanho da `HeroScene` varia por breakpoint de propósito**
  (`max-width: 220px` <480px, `280px` <1024px, `360px` ≥1024px) — a
  primeira versão (sempre até 360px) empurrava o formulário (a AÇÃO da
  página) para ~1300px rolagem abaixo no celular; depois do ajuste de
  tamanho + espaçamento do Hero, ficou ~870-970px (pouco mais de 1 tela).
- **Peso medido** (Playwright, `response.body()` somado, servidor estático
  sem compressão): ~711 KB total na home (JS ~478 KB é runtime
  Next/React padrão — comprime bem com gzip/brotli em produção; JPG dos
  mockups ~122 KB, CSS ~25 KB, fontes ~27 KB). Sem vídeo, sem lib 3D.
- **Build final entregue de novo SEM `NEXT_PUBLIC_WAITLIST_API_URL`**
  (mesma situação já registrada acima para a lista de espera) — usei a env
  var só durante o teste manual do formulário (Playwright + `page.route`
  mockando `/v1/driver-applications`) e removi antes de entregar. Os dois
  formulários (motorista e passageiro) mostram o aviso "ainda não
  pronto"/"ainda não estamos recebendo" até o Vulcano configurar essa var
  no Easypanel quando `vuumbora-backend` for ao ar.

## Reconstrução sobre as artes do dono (19/11/2026, mesmo dia da virada)

Pedido do dono: nada de imagem gerada por IA — a página inteira construída em
cima das artes fotográficas reais que ele entregou (`Imagens_Site/`, copiadas
para `apps/site/public/artes/`), catalogadas com texto literal em
`src/content/artes.ts` (um `Arte` por peça: `completa`/`completa800` 16:9 com
o texto desenhado dentro, `vertical` 4:5 só-foto para celular, e os mesmos
dizeres em campos `olho`/`titulo`/`tituloDestaque`/`apoio`).

- **`ArtworkPanel.tsx`** (novo, reutilizável): `<picture>` com `<source
  media="(min-width:768px)">` apontando pra `completa800`/`completa` (texto
  já desenhado na imagem) e `<img>` fallback = `vertical` (só foto, sem
  texto — abaixo de 768px a faixa de texto da arte renderiza com ~7px de
  altura, ilegível). O bloco de texto em HTML (`figcaption` com
  olho/título/destaque/apoio) **nunca sai do DOM**: vira sr-only (técnica
  idêntica a `.visually-hidden` de `globals.css`: `width:1px;height:1px;
  clip:rect(0,0,0,0)`) a partir de 768px, em vez de `display:none` —
  decisão de acessibilidade real, não só visual: a arte completa não expõe
  esse texto pra quem não vê a imagem, então quem usa leitor de tela precisa
  continuar recebendo os dizeres em QUALQUER largura. `headingLevel` prop
  (`'h1'|'h2'`) deixa o Hero usar h1 e as seções usarem h2, hierarquia única
  na página.
- **`ArteSection.tsx`** (novo): `Container` + `Reveal variant="media"` +
  `ArtworkPanel`, uma seção por item de `ARTES_SECOES` (5 hoje). Children
  opcional — único uso real é a seção `repasse-rapido` carregando o
  `CommitmentBanner` (compromisso público de taxa/repasse já aprovado pelo
  dono) como reforço, porque esse compromisso não tem arte própria e a
  estrutura pedida era "uma seção por arte", não uma seção extra.
- **`Hero.tsx` reescrito**: `ArtworkPanel` (arte `ARTE_HERO`, `priority`,
  `headingLevel="h1"`) + `DriverApplicationForm` lado a lado (≥1024px) /
  empilhados (abaixo disso) — a candidatura nunca desce da primeira seção.
  O texto de abertura (`HERO_CONTENT.eyebrow/title/subtitle` antigos) saiu:
  agora é a própria arte que fala (`olho`/`titulo`/`tituloDestaque`/`apoio`
  dela). Sobrou só `HERO_HONESTY` (aviso de transparência, que não é texto
  de nenhuma arte) perto do formulário. Ver
  [[bug_align_items_center_vao_vazio_colunas_desiguais]] pelo acerto de
  alinhamento entre a arte (16:9, curta) e o formulário (bem mais alto).
- **Foto de fundo gerada por IA removida**: o `::before` de `Hero.module.css`
  com `public/hero/natal-noite-*.jpg` (que o dono recusou) foi apagado por
  inteiro, junto com os dois arquivos de imagem.
- **`ProductGlimpse.tsx`/`PhoneMockup.tsx` removidos do projeto** (e seus
  `.module.css`) — a estrutura nova da página é "Hero + uma seção por arte +
  PassengerNote + AboutBlock + Footer", sem vitrine de mockup fotográfico;
  ficaram sem nenhum uso depois da reescrita (confirmado por grep antes de
  apagar). `public/mockups/*.jpg` ficou órfão, não apaguei (fora do escopo).
- **`HeroScene.tsx`/`.module.css` seguem no projeto sem uso** (decisão
  herdada da sessão anterior, não mexi) — pino 3D em CSS, reservado "caso o
  fundo mude"; com o Hero agora baseado em foto real da arte, provavelmente
  nunca mais entra, mas não é desta tarefa decidir apagar.
- **Medido no navegador** (Playwright via `playwright-core`, ver
  [[feedback_medir_site_sem_browser_tool]]) em 320/390/768/1440:
  `scrollWidth === clientWidth` nas quatro, zero elemento com
  `right > clientWidth`, `figcaption` visível (overlay) nas duas larguras
  <768 e sr-only (1×1px) nas duas ≥768 — comportamento batendo com a regra
  pedida, não só suposto.

## 2ª reescrita: composição em vez de lista (19/11/2026, mesmo dia)

O dono reprovou a versão acima: "parece um site que só jogou as imagens e
pronto" — `ArteSection` empilhava as 5 artes como retângulos idênticos, cada
uma com o mesmo peso. Ele apontou `docs/padrao-visual-site.md` (medido por
quem orquestrou, não por mim) como a receita a seguir. `ArtworkPanel`/
`ArteSection` foram **apagados** e substituídos:

- **`PhotoCard.tsx`** (substitui `ArtworkPanel`): sempre usa `foto900`/
  `foto560` (o recorte SEM texto desenhado) com overlay HTML por cima — nunca
  mais troca pra `completa` (texto já desenhado) a partir de 768px como o
  componente antigo fazia. Isso elimina a razão de existir do truque
  sr-only/visually-hidden: o texto é HTML em QUALQUER largura, sempre a
  mesma árvore. Dois véus reais (`::before`/`::after`-like via dois `<span>`
  absolutos): um vertical "de baixo" (onde o texto senta, 3 stops) + um "de
  cima" (profundidade, 2 stops) — `rgba(var(--site-veil-rgb), alfa)`, cor
  igual ao token `--color-background-base` decomposta em R,G,B (não é HEX
  solto para o `check-boundaries.mjs`, é `rgba()` com números).
  **O pulo do gato para variar a FORMA sem duplicar componente**: `ratio`/
  `ratioDesktop` viram `aspect-ratio` via CSS custom property
  (`--pc-ratio`/`--pc-ratio-desktop`) passada por `style` inline — a MESMA
  arte (`foto900`, sempre ~0,92 de proporção intrínseca) cobre
  (`object-fit:cover`) qualquer proporção que o layout pedir. Isso é o que
  permite reaproveitar `PhotoCard` em 3 blocos de forma diferente sem violar
  "componentes pequenos, nunca um gigante que faz tudo".
- **`ArtworkPairSection.tsx`** (novo): duas `PhotoCard` lado a lado
  (`grid-template-columns` via prop `columns`, empilha <768px). Usado duas
  vezes com `columns` diferente — `'1fr 1fr'` (par de peso igual,
  repasse-rápido + candidatura motorista-mulher, com `CommitmentBanner`
  como `children` reforçando embaixo) e `'3fr 2fr'` (par assimétrico,
  prefere-motorista-mulher grande + sua-escolha pequena). Mesmo componente,
  dois blocos que LEEM como formas diferentes — é a resposta direta a
  "blocos precisam variar de forma, não repetir o mesmo cartão".
- **`PhotoBand.tsx`** (novo): uma `PhotoCard` só, `ratio="16/9"` (faixa baixa
  e larga) — a 3ª forma da página, reservada pra `suporte-local`. Risco que
  cogitei e descartei: cortar pra uma proporção muito mais larga (21:9)
  arriscava cortar o rosto da pessoa num recorte de foto que é ~0,92
  (quase quadrado); 16:9 já lê como "faixa" (claramente mais baixa que os
  cartões 4:5 dos outros blocos) sem arriscar o enquadramento — confirmei
  olhando o screenshot, não só calculando.
- **`Hero.tsx` 2ª versão**: `PhotoCard` (ratio 4/5 mobile, 3/4 ≥1024px) ao
  lado da candidatura — a mudança que tornou isso seguro (a 1ª tentativa de
  hero lado a lado, registrada na seção anterior desta memória, tinha
  falhado por usar a arte `completa` 16:9 com texto desenhado, que
  encolhia pra 39% da tela numa coluna). Com `foto900` (recorte sem texto,
  proporção livre), o mesmo problema não existe — a prova foi medir de novo,
  não assumir que "dessa vez ia dar certo".
- **`globals.css` ganhou 3 tokens só do site** (mesmo padrão de
  `--site-container-max`, não mexe em `tokens.generated.css`):
  `--site-veil-rgb: 7, 13, 24` (p/ os véus), `--site-radius-photo: 28px`
  (raio medido na referência, diferente do nosso `--radius-xxl` de 24px),
  `--site-tracking-titulo: -0.025em` (tracking negativo nos títulos grandes
  — o detalhe que a referência aponta como "o que separa amador de
  acabado"). O olho/eyebrow também virou pílula de verdade (fundo +
  padding 4px/10px + raio 10px), não só texto colorido solto.
- **Contraste medido por pixel de verdade, não estimado**: screenshot via
  Playwright + `sharp().extract()` lendo o pixel real atrás de cada texto
  (amostra ao lado do fim do texto, mesma linha = mesma opacidade de véu),
  fórmula WCAG de luminância relativa calculada à mão. Todos os textos sobre
  foto deram >9:1 nas 4 larguras (320/390/768/1440) — o véu de baixo garante
  isso por construção (alfa 0,8–0,95 onde o texto senta), mas medir pixel
  real é o que prova, não o CSS.

Ver também [[feedback_photocard_variar_forma_sem_duplicar]].

## 4ª reescrita: vidro fosco + alternância clara/escura + carrossel automático (19/11/2026, mesmo dia)

O dono reprovou nível zero: "está muito muito muito feito". Chegou um exemplo
PRONTO dele (`VuumBora_Pre_Lancamento_Web/public/index.html`+`site.css`) e uma
auditoria do Apolo (`docs/auditoria-arte-site.md`) medindo cada defeito com
número — reimplementei em cima disso, não por cima da versão anterior.
Durante o trabalho o Atlas trouxe DUAS correções do dono por cima do pedido
original (chegaram via mensagem do coordenador, não por mim ter perguntado):
candidatura flutuando em vidro sobre a arte, e depois "o carrossel passa
sozinho" revogando o "sem autoplay" que eu tinha acabado de implementar.

- **`.light-section` (`globals.css`): REDEFINE os tokens de cor, não
  reescreve componente nenhum.** Em vez de criar uma variante clara de
  `WaitlistForm`/`AboutBlock`/`PassengerNote`, criei uma classe que troca
  `--color-background-surface`/`--color-text-primary`/etc. para os
  equivalentes claros DENTRO do seu escopo — qualquer componente que já
  consome esses tokens (todos consomem, é a convenção do projeto) vira claro
  automaticamente. `<div className="light-section"><PassengerNote/></div>`
  foi a mudança inteira. Padrão a reaproveitar sempre que pedirem alternância
  clara/escura num projeto que já é token-driven — fica em `globals.css`.
- **Hero vira foto de fundo de TODA a seção** (`position:absolute;inset:0`
  no `<img>`, `isolation:isolate` no `<section>`), não mais grid foto-lado-a-
  lado-com-formulário. O cartão da candidatura (`DriverApplicationForm`)
  senta em cima da MESMA foto, em vidro fosco
  (`backdrop-filter:blur(20px) saturate(140%)` + `rgba(veil,0.62)`, fallback
  `@supports` com alpha 0.86 sólido pra navegador sem suporte). Causa raiz
  do H1 caindo abaixo da dobra (auditoria C3) era `align-items:center` no
  grid — a correção REAL foi trocar para `align-items:start`: o H1 fica
  preso perto do topo não importa a altura do card ao lado, então "flutuar
  o formulário sobre a arte" e "H1 acima da dobra" deixam de competir.
  Medido (Playwright): H1 a 97,92px em 1440px e tracking -5,4px, exatamente o
  número que o exemplo do dono tinha — `clamp(3.4rem,6.8vw,7rem)` +
  `letter-spacing:-0.055em`, copiado do `site.css` dele, não reinventado.
  Contraste de TODO texto do cartão de vidro medido por pixel real (receita
  de [[feedback_medir_site_sem_browser_tool]]) nas 4 larguras: pior caso
  5,73:1 (texto de privacidade em 1440px), todos acima do mínimo WCAG AA.
- **`ArtCard`/`ArtCarousel` substituem `PhotoCard`/`ArtworkPairSection`/
  `PhotoBand` (apagados)**: cartão BRANCO de borda com foto LIMPA (sem véu
  algum) + texto abaixo em tinta navy — resolve de raiz a crítica C1 da
  auditoria ("véu apagou as fotos") porque não sobrou véu pra apagar nada.
  O destaque amarelo do título (assinatura visual das artes) virou
  sublinhado grosso em vez de TEXTO amarelo — amarelo da marca sobre branco
  dá ~1,6:1 de contraste, reprova; sublinhado preserva a assinatura sem
  reprovar.
- **Carrossel automático com toda a acessibilidade que movimento automático
  exige** — pedido final do dono, revogando o "sem autoplay" do pedido
  anterior no MESMO dia (guardar isso: direção pode mudar DENTRO da mesma
  tarefa, o handoff anterior não é garantia do que vem a seguir). Receita
  testada (Playwright, não só lida no código):
  - Avança sozinho a cada 5,5s via `track.scrollTo({left,behavior:'smooth'})`
    — o deslize suave É o próprio `scroll-snap` nativo, não existe motor de
    animação paralelo pra manter.
  - Pausa com `onPointerEnter`/`onFocusCapture` (dois estados: pausa
    MANUAL via botão, que persiste, vs. pausa de INTERAÇÃO via hover/foco,
    que é transitória — resolvi com dois booleans combinados em
    `playing = !reduced && !manual && !interaction && !tabHidden`, nunca um
    só).
  - Pausa com `document.visibilitychange` (aba oculta).
  - `prefers-reduced-motion` nunca inicia o intervalo — inicializado por
    `useState(() => matchMedia(...).matches)` (inicializador preguiçoso),
    NUNCA por `setState` dentro de `useEffect`: isso dispara
    `react-hooks/set-state-in-effect` (erro de lint, não warning) porque o
    projeto trata "cascading render síncrono" como erro de build.
  - Funciona SEM JavaScript: a `<ul>` já é `overflow-x:auto` + `scroll-snap`
    puro CSS; confirmado com `context = browser.newContext({
    javaScriptEnabled:false })` — a seção e os 5 slides continuam no DOM,
    roláveis por gesto/scroll nativo mesmo sem hidratar.
  - Testei cada comportamento isoladamente esperando ~6,2s real (não só lendo
    o código): avança sozinho, pausa no hover, retoma ao sair, pausa ao
    focar por teclado, retoma ao perder foco, botão pausa persiste, reduced
    motion não inicia E esconde o botão de pausa (não faz sentido oferecer
    pausar o que nunca anda), aba oculta não avança.
- **`SectionHeading`** (novo, pequeno e reutilizável): pílula+H2 para toda
  seção nova — piso do `clamp` calibrado a 24px (não 28px) depois de medir
  que em 320–768px o H1 do Hero também bate no piso dele (54,4px): com H2 a
  28px a razão caía pra 1,94× e reprovava o critério "H1 ≥ 2× qualquer H2"
  por uma margem pequena só nessas larguras — 24px resolveu com folga
  (2,21–2,27×) sem mexer no H1 aprovado.
- **Armadilha nova**: `DriverApplicationForm`'s `.title` usava
  `var(--font-size-heading)` (28px, token de tela de app) — é um título de
  CARTÃO, devia ser 22-24px (`docs/padrao-visual-site.md` §2), e também era
  o verdadeiro responsável por reprovar o "H1 ≥ 2×" em mobile (não o
  `SectionHeading`, que eu suspeitei primeiro — medir qual heading é o
  culpado real antes de ajustar, `document.querySelectorAll('h2,h3')` com
  `fontSize` de cada um, em vez de corrigir o primeiro candidato óbvio).

Ver também [[feedback_light_section_token_scoping]] e
[[feedback_carrossel_autoplay_acessivel]].
