---
name: feedback_medir_expo_web_playwright
description: Como servir e medir de verdade uma tela Expo Router (monorepo) no navegador com a skill playwright-skill — onde rodar o servidor, como tirar print completo quando o app usa ScrollView interno.
metadata:
  type: feedback
---

Lyra não tem ferramenta de navegador própria; mede via Bash + a skill
`playwright-skill` (que roda scripts Node reais com a lib Playwright, instalada em
`C:/Users/Personal Computer/.claude/skills/playwright-skill/node_modules`). Executar
sempre com `cd` para a pasta da skill e `node run.js <script-ou-código-inline>`
(resolução de módulo depende disso).

**Erro já cometido: `npx expo start --web` rodado na RAIZ do monorepo.** Isso quebra
com `Unable to resolve "../../App" from "node_modules/expo/AppEntry.js"` — a raiz não
é um app Expo, só o workspace. Tem que rodar dentro do pacote do app
(`cd apps/passenger && npx expo start --web --port <porta>`), ou via
`npm run passenger -- --web --port <porta>` na raiz.

**Print completo falha silenciosamente se o app tiver `ScrollView` próprio.**
`AppShell` (deste projeto) usa `ScrollView`, que no React Native Web vira uma `div`
com overflow próprio — o `document.documentElement.scrollHeight` fica igual à
altura da viewport (o body em si não rola), então `page.screenshot({ fullPage: true
})` só captura o que cabe na viewport, cortando o resto **sem erro nem aviso**. Para
pegar a tela inteira:
1. Medir a altura real do contêiner que rola:
   ```js
   await page.evaluate(() => Math.max(...Array.from(document.querySelectorAll('div'))
     .filter(el => el.scrollHeight > el.clientHeight + 5)
     .map(el => el.scrollHeight)));
   ```
2. Recriar a página com `viewport: { width, height: essaAltura }` (sem scroll
   necessário) e tirar um screenshot normal (sem `fullPage`).

**Expo Router (web) mantém a tela anterior da pilha MONTADA ao navegar** (`router.push`),
e `router.replace` troca só a entrada do topo — depois de um fluxo com várias telas
(ex.: Home → Destino → volta → Confirmação → `replace` para Busca → cancelar
`replace('/')`), pode haver **duas instâncias da Home montadas ao mesmo tempo** no DOM.
Consequência prática ao medir/testar com Playwright:
- `page.click('text=Algo')` ou `page.locator('[aria-label="X"]')` pode resolver para
  o elemento da tela ERRADA (ainda montada, só visualmente oculta) — causa tanto falso
  positivo (texto "encontrado" mas a navegação não tinha acontecido de verdade) quanto
  erro de "strict mode violation: resolved to N elements" quando duas telas reaproveitam
  o mesmo rótulo (ex.: botão "Solicitar corrida" existe em Home e em Confirmação ao
  mesmo tempo).
- **Correção:** usar seletor de atributo exato (`[aria-label="..."]`) em vez de
  `text=` (que faz substring match e pode casar o texto de uma tela escondida), e
  **anexar `:visible`** (`'[aria-label="Solicitar corrida"]:visible'`) em qualquer
  seletor cujo rótulo se repete entre telas da mesma pilha. Para rotinas de
  `overflow`/truncamento/alvo de toque que já filtram por `getComputedStyle().display`/
  `offsetParent !== null`, isso já é tratado — o cuidado extra é só nos seletores de
  clique/leitura de atributo feitos direto por `page.locator`/`page.getAttribute`.

**`exactOptionalPropertyTypes: true` (ligado neste projeto) rejeita repassar uma prop
opcional cujo valor pode ser `undefined` por uma variável, mesmo quando a prop em si é
opcional** — `{ testID: maybeUndefined }` não é o mesmo que omitir a chave `testID`.
Isso aparece toda vez que um componente de app encaminha um valor lido de store/estado
(tipo `T | undefined`) para uma prop `foo?: T` de `@vuumbora/ui` ou de outro componente
próprio. Correção no ponto de encaminhamento (não editar o tipo da prop no pacote
compartilhado só por isso): `{...(valor !== undefined ? { foo: valor } : {})}` no JSX,
ou extrair um helper puro que monta o objeto só com as chaves definidas (ex.:
`toRideDraft` em `apps/passenger/src/store/useRideRequestStore.ts`). Quando a prop é a
MINHA própria (de um componente que acabei de criar/vou manter), widenar o tipo para
`foo?: T | undefined` explícito também resolve e é mais simples.

Ver também os dois bugs encontrados assim: [[bug_rn_web_flexwrap_sem_flex1]] e
[[bug_touch_target_hitslop_insuficiente]]. Contraste e cor também devem ser lidos do
DOM real (`getComputedStyle`), nunca assumidos do token — um seletor de texto
"guloso" (ex.: pegar o primeiro `div` descendente) pode capturar nó errado e gerar
leitura de contraste sem sentido (ex.: `rgb(0,0,0)` de um wrapper sem texto); checar
visualmente pelo screenshot antes de reportar um número de contraste estranho como
bug real.
