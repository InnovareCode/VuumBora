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
