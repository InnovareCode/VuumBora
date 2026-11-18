---
name: boxshadow_rn088_android_evidencia
description: O que já foi verificado (e o que NÃO foi) sobre a prop de estilo boxShadow do RN 0.88 funcionar de verdade no Android deste projeto — consulte antes de reabrir essa dúvida ou de decidir usar/evitar boxShadow num componente novo.
metadata:
  type: project
---

**Pergunta recorrente:** o React Native 0.88 (New Architecture, Expo 58) tem
`boxShadow` (incl. `inset`) como prop de estilo real, ou é só coisa de
web/RN Web? Isso importa porque a direção de arte (docs/direcao-de-arte.md
§4/§5, 18/11/2026) usa `boxShadow` para o "rim light" do CTA
(`stroke.ctaRim`), para o halo do card selecionado (`glow.selected`) e para as
sombras de elevação (`elevation.*`).

**O que FOI verificado (18/11/2026, aplicação dos itens 1-6 da direção de
arte):**
- `node_modules/react-native/Libraries/StyleSheet/processBoxShadow.js` existe
  e é consumido por `StyleSheetTypes.js` (`boxShadow?: ReadonlyArray<BoxShadowValue> | string`)
  — não é prop experimental nem exclusiva de web.
- Há implementação NATIVA ANDROID dedicada em Kotlin dentro do próprio
  `node_modules/react-native` desta instalação (0.88.1):
  `ReactAndroid/.../uimanager/style/BoxShadow.kt`,
  `.../drawable/InsetBoxShadowDrawable.kt`,
  `.../drawable/OutsetBoxShadowDrawable.kt`, ligados via
  `BackgroundStyleApplicator.kt`. Isso é leitura de CÓDIGO-FONTE da versão
  exata instalada, não documentação genérica da Meta.
- No navegador (RN Web, via Playwright), o array de `BoxShadowValue` que os
  tokens guardam (`theme.elevation`, `theme.glow`, o `CTA_SHADOW` montado em
  `ButtonCore.tsx`) é traduzido 1:1 para `box-shadow` CSS correto, inclusive
  `inset` e múltiplas sombras na mesma declaração — confirmado lendo
  `getComputedStyle(el).boxShadow` real no DOM, não suposto.

**O que NÃO foi verificado:** render num Android físico ou emulado. Este
ambiente de execução (sandbox do agente) não tem `adb`, `emulator` nem
`ANDROID_HOME` configurado — não há como abrir um emulador aqui. A prova acima
é "o código nativo existe e está ligado" (forte, mas estática), não "eu vi
renderizar num telefone" (dinâmica).

**Como aplicar:** se alguém (Vulcano, Íris, ou o dono num device físico) rodar
o app Android e confirmar visualmente o CTA/halo/tab bar, ATUALIZE este
registro com a data e o resultado — isso fecha a pendência de vez. Até lá,
trate "funciona no Android" como "evidência forte de código-fonte, não
confirmado em device" ao reportar, e não repita a investigação de
`node_modules` do zero — os caminhos exatos já estão listados acima.
