---
name: bug_resolveassetsource_react_native_web
description: "Image.resolveAssetSource is not a function" ao tentar converter um asset local (require/import de .jpg/.png) numa URI de string para passar em Avatar.imageUri — a API não existe no react-native-web. Achado real montando a foto demo do motorista (18/11/2026).
metadata:
  type: feedback
---

**Causa raiz:** `Image.resolveAssetSource(source)` (API do RN nativo que converte o
número de asset do Metro numa `{uri, width, height, scale}`) **não existe** no
`react-native-web`. Chamar isso explode em runtime (`Image.default.resolveAssetSource
is not a function`), só visível rodando no navegador — `tsc` não pega porque o tipo
declarado em `node_modules/react-native/types_generated` é o da API nativa, não do
shim web.

**Como foi achado:** não foi visto lendo o código — passou no `tsc --noEmit` limpo.
Só apareceu como "Uncaught Error" na tela ao medir com Playwright (ver skill
`medir-antes-de-afirmar`) — print mostrou a RedBox do Expo web em vez da Home.

**Correção:** nunca resolver um asset local para `string` via `resolveAssetSource`
antes de passar pra uma prop que só aceitava `imageUri: string`. Em vez disso, criar
uma segunda prop (`imageSource?: ImageSourcePropType`) que recebe o número de asset
**direto** (`require`/import do Metro já funciona como `Image.source` tanto nativo
quanto web, sem conversão nenhuma — é exatamente como `MapPreviewBackground`
[[project_vuumbora_overview]] sempre fez, sem erro). No `Avatar`
(`packages/ui/src/Avatar.tsx`), a prioridade é `imageSource ?? (imageUri ? {uri:
imageUri} : undefined)`.

**Como detectar da próxima vez:** qualquer `Image.resolveAssetSource`,
`Image.getSize` com asset local, ou outra API estática de `Image` que não seja
`source`/`resizeMode`/`style` básicos — suspeitar que pode não existir no
`react-native-web` e checar rodando no navegador antes de dar como pronto, não só
typecheck limpo.
