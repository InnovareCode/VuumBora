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
