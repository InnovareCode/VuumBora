# @vuumbora/site

Site público do VuumBora. Next.js (App Router) com **exportação estática**
(`output: 'export'`) — gera HTML/CSS/JS puros, sem servidor Node, publicáveis
em qualquer hospedagem estática (Vercel, Netlify, S3+CDN, Nginx etc.).

Domínio oficial: **`https://www.vuumbora.com.br`** (configurado em
`src/lib/site.ts` — único lugar onde o domínio é escrito; `sitemap.ts`,
`robots.ts` e os metadados em `layout.tsx` leem dali).

## Como rodar localmente

```bash
# a partir da raiz do monorepo (workspaces npm)
npm install

cd apps/site
npm run dev
```

Abre em `http://localhost:3000`.

## Como gerar a exportação estática

```bash
cd apps/site
npm run build
```

O resultado fica em `apps/site/out/` — é uma pasta de arquivos estáticos
prontos para subir numa hospedagem (ver "Pendências" abaixo sobre DNS/deploy,
que é do Vulcano). `npm run build` roda o gerador de CSS dos tokens antes do
`next build` (ver abaixo).

## `AGENTS.md`

Arquivo gerado automaticamente pelo próprio Next.js 16 (`next dev` recria se
for removido — ver comentário dentro dele). Não é meu, não editar à mão.

## Checagens

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint . (eslint-config-next/core-web-vitals)
```

Essas duas também rodam de dentro do `npm run check` da raiz do monorepo
(`check:boundaries` + `typecheck --workspaces`).

## Como a identidade visual chega aqui

- **Cor/dimensão/gradiente/sombra**: gerados em build
  (`scripts/generate-tokens-css.mjs`) direto de
  `VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json` (a mesma fonte
  única que `@vuumbora/tokens` usa nos apps) para
  `src/styles/tokens.generated.css` (`:root { --cor-x: ...}`). **Esse CSS é
  gerado — não editar à mão**, ele é regenerado a cada `npm run dev`/`build`
  (scripts `predev`/`prebuild` embutidos nos scripts `dev`/`build` do
  `package.json`) e está no `.gitignore`.
  - Exceção: `src/app/layout.tsx` usa `@vuumbora/tokens` (o pacote TS, não o
    CSS gerado) para o único valor que o Next pede fora de CSS —
    `viewport.themeColor` — porque `check-boundaries.mjs` (raiz) reprova HEX
    solto em arquivo `.ts`/`.tsx`/`.json` em todo `apps/`.
  - `typography.family` do JSON (nomes de fonte estática do Expo/Android) é
    ignorado de propósito pelo gerador — a tipografia do site usa
    `next/font/google` (Plus Jakarta Sans, `docs/tipografia.md`), que
    self-hospeda o WOFF2 no build, sem chamada ao Google em produção.
- **Imagens de marca**: cópias (não symlink) de `packages/ui/assets/` em
  `public/brand/` e `public/backgrounds/`, redimensionadas/recomprimidas para
  peso de web (ex. o logo horizontal caiu de 217 KB para 34 KB). Se a marca
  mudar em `packages/ui/assets/`, recopiar e recomprimir manualmente — não há
  pipeline automático disso ainda.
- **Acabamento "premium"** (`docs/direcao-de-arte.md`): gradiente
  `surfaceRaised` + borda com luz de cima (`edgeTop`/`edgeBottom`) nos cards
  (`src/components/Card.module.css`), `gradient.photoScrim` atrás do título
  no hero sobre foto (`src/components/Hero.module.css`), CTA desabilitado em
  `gradient.surfaceOverlay` (nunca o amarelo do CTA ativo — ver
  `DisabledAction.tsx`).

## Favicon e cartão de compartilhamento (Open Graph/Twitter)

Gerados uma vez a partir dos assets de marca já aprovados (script Python de
uso único, não versionado — não faz parte do app) e commitados como
artefatos finais:

- `src/app/icon.png`, `src/app/apple-icon.png`, `src/app/favicon.ico`
  (16/32/48): selo da marca (`vuumbora-selo.png`) centralizado sobre
  `color.brand.navy`, cantos squircle — convenção de arquivo do Next
  (`app/icon.png` etc.), sem nenhuma linha de metadado manual.
- `public/og-image.jpg` (1200×630, JPEG ~53 KB): logomarca horizontal sobre
  `backgrounds/onboarding-noturno.jpg`, com `gradient.photoScrim` por trás —
  referenciada em `metadata.openGraph.images` e `metadata.twitter.images`
  (`src/app/layout.tsx`), porque o pedido foi "deixar em `public/`" em vez de
  usar a convenção de arquivo `app/opengraph-image.png`.
- Se a marca mudar, regenerar as 4 imagens (não há script versionado — avisar
  a Lyra ou escrever um novo a partir da mesma receita: selo sobre navy para
  os ícones, logo horizontal sobre a foto noturna com scrim para o OG).

## `sitemap.xml` e `robots.txt`

`src/app/sitemap.ts` e `src/app/robots.ts` (ambos com
`export const dynamic = 'force-static'`, exigido pelo `output: 'export'`).
Uma entrada só no sitemap (site de página única); crescer é só acrescentar
itens no array.

## O que falta / decisões que não são minhas

- **Nenhum canal de contato real existe ainda** (telefone/e-mail/chat —
  `docs/decisoes-do-dono.md`, item 11, ainda em aberto). O rodapé diz isso
  explicitamente em vez de inventar um e-mail. Quando o dono decidir o canal,
  atualizar `src/components/Footer.tsx`.
- **Termos de Uso e Política de Privacidade não existem como texto.** O
  rodapé mostra os nomes como texto simples (não link) com a nota "em
  elaboração" — não há rota `/termos` nem `/privacidade`. Quando o texto
  existir, essas entram como páginas novas (`src/app/termos/page.tsx` etc.)
  e o rodapé vira link de verdade.
- **Botões de loja ("Google Play"/"App Store") e "Cadastro de motorista" são
  `<button disabled>`** — de propósito, o app ainda não foi publicado e não
  há formulário de cadastro. Não são links quebrados nem formulário
  coletando dado pessoal (nenhum dos dois existe no site).
- **DNS e hospedagem são do Vulcano** (e dependem de decisão do dono sobre
  onde hospedar) — este app só produz os arquivos estáticos corretos, com o
  domínio certo escrito neles.
- **Categorias de veículo (Econômico/Comfort/Plus) não aparecem no site de
  propósito.** `docs/decisoes-do-dono.md` item 13 mostra 3 nomenclaturas
  divergentes nas referências — o site não comete a nenhuma até o dono
  decidir os nomes definitivos.
