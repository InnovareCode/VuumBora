---
name: expo-sdk-upgrade-fluxo
description: Fluxo confirmado para subir a versão do Expo SDK num monorepo (qual versão editar à mão vs. deixar o CLI resolver). Use antes de alinhar apps Expo numa nova versão de SDK.
metadata:
  type: feedback
---

Regra confirmada no bump VuumBora de SDK 54 para 58 (18/11/2026):

1. Confirme a versão `latest` real antes de tudo: `npm view expo dist-tags`
   (não confie em memória/treino — dist-tags muda).
2. **Só a âncora `"expo": "~X.0.0"` em cada `package.json` de app é editada à
   mão** — é literalmente o que significa "alinhar no SDK novo".
3. Todo o resto (expo-router, expo-constants, expo-status-bar, react,
   react-native, react-native-screens, react-native-safe-area-context,
   @types/react, typescript...) vem de `npx expo install --fix`, roda **duas
   vezes** por app: a primeira instala os pacotes nativos corretos mas pode
   deixar devDependencies (`@types/react`, `typescript`) desatualizadas; a
   segunda pega essas sobras. Nunca escrever essas versões à mão — o CLI sabe
   a tabela de compatibilidade exata do SDK, eu não.
4. **Cuidado com `npx expo install <pkg>` manual para devDependencies**: ele
   pode adicionar o pacote tanto em `dependencies` quanto `devDependencies` ao
   mesmo tempo (visto com `@types/react`/`typescript` num dos dois apps),
   duplicando a entrada. Prefira sempre `--fix` (idempotente, não duplica) e
   só use a forma `expo install <pkg>` para pacote novo que ainda não existe
   no projeto.
5. `app.config.ts`/plugins pode precisar de ajuste manual que o `--fix` não
   faz: SDK 58 passou a exigir `expo-status-bar` explícito em `plugins` (antes
   funcionava sem). O próprio `expo install --fix` avisa isso no stderr
   ("Cannot automatically write to dynamic config... Add the following to your
   Expo config") — ler a saída até o fim, não parar no primeiro erro.
6. Overrides de `react`/`react-native` na raiz do monorepo: deixar como `"*"`
   durante a migração (evita a raiz brigar com a versão nova resolvida pelo
   app), rodar tudo, e só então travar o override na versão exata que o
   `--fix` escolheu (evita builds divergentes entre apps do mesmo monorepo).
7. Depois de tudo isso, **prove de verdade**: `npx expo config` (confirma
   `sdkVersion` novo) e `npx expo start` de fato subindo — não basta o
   `package.json` parecer certo. Ver [[expo-monorepo-hoisting]] para o
   problema mais comum nessa prova final.
