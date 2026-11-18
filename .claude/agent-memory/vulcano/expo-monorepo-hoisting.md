---
name: expo-monorepo-hoisting
description: npm workspaces + Expo Router pode deixar expo-router sem hoisting na raiz depois de várias `expo install` incrementais, quebrando `expo start` com "Cannot find module 'expo-router/internal/testing'". Use quando `expo start`/`expo start --web` falhar logo na inicialização com erro de módulo não encontrado dentro de node_modules/expo/node_modules/@expo/router-server.
metadata:
  type: project
---

Depois de rodar `npm install` na raiz e depois várias passagens de
`npx expo install --fix` / `npx expo install <pkg>` em cada app (apps/passenger
e apps/driver), o `expo-router` ficou instalado **só dentro de
`apps/*/node_modules/expo-router`**, sem cópia hoisted em `node_modules/expo-router`
na raiz — mesmo os dois apps pedindo exatamente a mesma versão (`~58.0.32`).

**Sintoma:** `npx expo start` (ou `--web`) falha no boot com:
```
Error: Cannot find module 'expo-router/internal/testing'
Require stack: node_modules/expo/node_modules/@expo/router-server/build/typed-routes/index.js
```
Isso acontece porque o `@expo/cli` embutido em `node_modules/expo` resolve
`expo-router` a partir da própria localização dele (dentro de
`node_modules/expo/node_modules/...`), e a resolução de módulo do Node sobe a
árvore de diretórios a partir daí — nunca entra em `apps/*/node_modules`. Sem
`expo-router` hoisted na raiz, a resolução falha mesmo com o pacote instalado
(só que no lugar "errado" para quem está chamando).

**Por quê:** instalações incrementais (várias chamadas de `npm install` /
`expo install` disparadas por chamadas separadas de `expo install --fix` e
`expo install <pkg>` a cada app) deixam o lockfile em estados intermediários
que podem fixar sub-árvores de dependências transitivas diferentes entre os
dois apps (ex.: `expo-router/node_modules/@radix-ui/react-tabs` com sub-deps
diferentes em cada app), o que impede o npm de deduplicar o pacote para a raiz
mesmo a versão de topo sendo idêntica.

**Correção que funcionou:** `rm -rf node_modules apps/*/node_modules
packages/*/node_modules package-lock.json && npm install` (reinstalação limpa,
do zero, já com os `package.json` finais). Depois disso `expo-router` apareceu
corretamente em `node_modules/expo-router` na raiz e `expo start --web` subiu
sem erro nos dois apps.

**Como aplicar:** depois de qualquer sequência de `expo install --fix` /
`expo install <pkg>` em múltiplos apps de um monorepo, antes de declarar a
instalação "pronta", rode `npx expo start` (ou `expo config`) de fato. Se falhar
com erro de módulo não encontrado vindo de dentro de `node_modules/expo/node_modules`,
não tente remendar à mão — faça reinstalação limpa primeiro; é mais rápido que
depurar hoisting manualmente. Ver também [[expo-sdk-upgrade-fluxo]].
