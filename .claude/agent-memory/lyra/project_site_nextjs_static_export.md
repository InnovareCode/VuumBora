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
