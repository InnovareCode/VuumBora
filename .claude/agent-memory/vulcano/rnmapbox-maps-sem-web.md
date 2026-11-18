---
name: rnmapbox-maps-sem-web
description: "@rnmapbox/maps declara mapbox-gl como peer dependency mas NÃO tem suporte web utilizável (experimental, não exportado, pede Webpack que o projeto não usa). Use mapbox-gl direto num arquivo .web.tsx para o alvo web. Consulte antes de integrar qualquer SDK de mapa num app Expo com alvo web habilitado."
metadata:
  type: project
---

Confirmado no VuumBora (18/11/2026): `@rnmapbox/maps@10.3.18` lista
`mapbox-gl: ^2.9.0` como peer dependency, o que sugere suporte web — mas
**não tem**, de verdade, para uso direto.

**Evidência:** `node_modules/@rnmapbox/maps/src/web/install.md` diz
literalmente "Web support is work in progress, only basic map components
works" e pede configuração de `@expo/webpack-config`
(`dangerouslyAddModulePathsToTranspile`) — ferramenta que projetos novos no
Metro bundler para web (`web.bundler: "metro"` no `app.config.ts`, padrão
desde SDK ~52) não usam mais. Além disso o `package.json` do pacote não tem
campo `browser` nem variante `.web.js` do `index.js` — o módulo web
(`lib/module/web/`) existe no pacote mas não é alcançável por import normal.

**Correção que funcionou:** não tentar fazer o `@rnmapbox/maps` funcionar no
web. Instalar `mapbox-gl` (fixado na major compatível com o peer dep do
`@rnmapbox/maps`, não a latest) e escrever a tela do mapa em dois arquivos
por extensão de plataforma do Metro/Expo Router:
- `tela.tsx` — nativo, usa `MapView` do `@rnmapbox/maps`.
- `tela.web.tsx` — web, usa `mapboxgl.Map` direto (API JS pura, com
  `import 'mapbox-gl/dist/mapbox-gl.css'` — Metro web do Expo SDK 49+ já
  suporta import de CSS sem config extra).

Mesmo token de runtime (`EXPO_PUBLIC_*`) funciona nos dois arquivos sem
mudança. Ver [[expo-monorepo-env-raiz]] para o token chegar até lá num
monorepo.

**Como aplicar:** antes de confiar numa peer dependency como sinal de
"suporte a X", ler o `install.md`/README do pacote de verdade. Peer dep
declarada não é prova de suporte funcional — só de que o pacote referencia o
outro em algum ponto do código (às vezes legado/experimental).
