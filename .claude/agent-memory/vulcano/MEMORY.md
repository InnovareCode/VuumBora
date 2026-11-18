# Memória — Vulcano (VuumBora)

- [Monorepo Expo + npm workspaces: hoisting de expo-router quebra após edições incrementais de package.json](expo-monorepo-hoisting.md) — reinstalação limpa (rm -rf node_modules + lockfile) resolve `Cannot find module 'expo-router/internal/testing'`.
- [Upgrade de SDK Expo: o que editar à mão vs. via CLI](expo-sdk-upgrade-fluxo.md) — só a âncora `expo` muda à mão; todo o resto via `npx expo install --fix`.
- [VuumBora: arquitetura do monorepo e convenções de infra](vuumbora-projeto.md) — estrutura, guarda de fronteiras, fonte única de tokens fora dos pacotes.
- [Expo CLI não sobe diretório para achar .env num monorepo](expo-monorepo-env-raiz.md) — corrigir em metro.config.js com `@expo/env`, nunca assumir que `.env` na raiz "simplesmente funciona".
- [@rnmapbox/maps não tem suporte web de verdade](rnmapbox-maps-sem-web.md) — usar mapbox-gl direto em `.web.tsx`; peer dependency não prova suporte.
- [VuumBora: empacotamento e deploy do site no Easypanel](vuumbora-deploy-easypanel.md) — Dockerfile em apps/site com contexto na raiz, root sem script `build` (ambíguo no monorepo), achado de segurança do painel sem HTTPS.
