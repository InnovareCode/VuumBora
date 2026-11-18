---
name: expo-monorepo-env-raiz
description: Expo CLI só carrega .env do diretório do app (__dirname), nunca sobe para a raiz do monorepo — token/env sempre chega vazio no bundle se o .env só existir na raiz. Use ao configurar qualquer variável de ambiente (EXPO_PUBLIC_*) num monorepo Expo com npm workspaces.
metadata:
  type: project
---

Confirmado no VuumBora (18/11/2026, integração Mapbox): o app lia
`process.env.EXPO_PUBLIC_MAPBOX_TOKEN` como string vazia mesmo com o `.env`
da raiz do monorepo preenchido e correto.

**Causa raiz:** `@expo/env` (usado internamente pelo `@expo/cli` para
`expo start`) resolve os arquivos `.env*` relativos a `projectRoot`, que é
sempre o `__dirname` do app (`apps/passenger`, `apps/driver`) — **nunca sobe
diretório**, mesmo o Expo já detectando o monorepo para `watchFolders`/
`nodeModulesPaths` (ver [[expo-monorepo-hoisting]], funcionalidade diferente).
Confirmado lendo `node_modules/@expo/env/build/index.js`
(`parseProjectEnv(projectRoot, ...)` faz `path.join(projectRoot, envFile)`
sem nenhuma busca ascendente).

**Correção que funcionou:** em cada `apps/<app>/metro.config.js`, ANTES de
`getDefaultConfig`:
```js
const path = require('path');
require('@expo/env').load(path.resolve(__dirname, '../..')); // raiz do monorepo
```
`@expo/env.load()` muta `process.env` no processo do Metro (que é o mesmo
processo que faz o babel-inlining de `process.env.EXPO_PUBLIC_*` no bundle) e
**não sobrescreve** variável já definida no ambiente — mesma regra do próprio
Expo, então uma var exportada no shell continua tendo prioridade.
`@expo/env` precisa virar devDependency explícita do app (estava só
transitivo via `@expo/cli`, hoisted por acaso — não confiar nisso).

**Como aplicar:** sempre que um monorepo Expo tiver UMA fonte única de
`.env` fora de `apps/*` (prática correta para não duplicar segredo por app),
rodar `expo start`/`expo config` de dentro do app e CONFERIR de verdade
(`npx expo config` não mostra env vars; precisa rodar a app e olhar o valor
real, ou inspecionar o bundle) antes de dar a variável como "configurada".
Não basta o `.env` existir e estar correto — o ponto de carregamento importa.
