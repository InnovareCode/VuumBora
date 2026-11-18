---
name: vuumbora-projeto
description: Estrutura e convenções de infra do monorepo VuumBora (apps/passenger, apps/driver, packages/*). Use ao tocar instalação, build, CI ou deploy deste projeto.
metadata:
  type: project
---

Monorepo npm workspaces: `apps/passenger`, `apps/driver` (Expo Router, SDK 58
desde 18/11/2026), `packages/{tokens,ui,domain,api-client}`.

- Fonte única de cores/dimensões: `VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json`,
  **fora** de `apps/` e `packages/` (na raiz do repo). `@vuumbora/tokens` importa
  esse JSON por caminho relativo (`../../../.../vuumbora.tokens.json`) e
  `app.config.ts` de cada app importa o mesmo arquivo direto por
  `../../VuumBora_Claude_Design_System/...`. Confirmado (18/11/2026) que tanto
  o `expo config` (resolução Node) quanto o bundle real do Metro (`expo start`)
  resolvem esse caminho sem configuração extra — o `metro.config.js` de cada
  app só usa `getDefaultConfig` padrão, sem watchFolders customizados; a
  detecção de monorepo do Expo SDK 52+ já cobre isso.
- Guarda de arquitetura: `npm run check:boundaries` (script
  `scripts/check-boundaries.mjs`, zero dependências) — bloqueia HEX solto fora
  do JSON de tokens e import cruzado entre o perfil passenger/driver.
  `npm run check` = `check:boundaries` + `typecheck` de todos os workspaces.
- Alvo **web** foi habilitado nos dois apps (`web.bundler: "metro"` em
  `app.config.ts`, `react-native-web`/`react-dom` instalados via
  `expo install`) **só para preview/screenshot em desenvolvimento** — pedido
  pontual do dono para acompanhar telas por print. A entrega de produto
  continua sendo Android (.aab) + iOS (.ipa); não introduzir código
  específico de web nas telas.
- Build/deploy real (EAS, contas pagas envolvidas) documentado em
  `docs/build-e-deploy.md` — não editar `docs/decisions.md` nem
  `docs/identidade-visual.md` (são do domínio de Nova/Apolo).
- Ainda não existe `eas.json` nem CI configurado (sem GitHub Actions/pipeline
  neste momento) — fase 1 do `PROGRESSO.md` cobriu só instalação e boot local.
- Mapbox instalado e provado (18/11/2026) nos dois apps — infraestrutura em
  `docs/mapbox.md`. Ver [[expo-monorepo-env-raiz]] e [[rnmapbox-maps-sem-web]]
  para as duas armadilhas reais que apareceram (token vazio por causa do
  monorepo, e `@rnmapbox/maps` sem web de verdade apesar da peer dependency).
  `docs/decisions.md` D-11 ficou desatualizado (ainda diz "Em aberto") — fora
  da minha fronteira, sinalizado para Nova/Atlas atualizar.
- `apps/site` (Next.js) apareceu no workspace durante a sessão de 18/11/2026,
  criado por outra missão em paralelo — não é meu. Tinha `tsconfig.json` com
  `baseUrl` deprecated (TS5101) quebrando o `npm run check` do monorepo
  inteiro (os workspaces que eu toquei passam limpo isolados). Não tentei
  corrigir (fora da minha fronteira); confirmar se segue quebrado antes de
  assumir que "`npm run check` = 0" vale para o repo inteiro.
