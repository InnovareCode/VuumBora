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

Ver também os dois bugs encontrados assim: [[bug_rn_web_flexwrap_sem_flex1]] e
[[bug_touch_target_hitslop_insuficiente]]. Contraste e cor também devem ser lidos do
DOM real (`getComputedStyle`), nunca assumidos do token — um seletor de texto
"guloso" (ex.: pegar o primeiro `div` descendente) pode capturar nó errado e gerar
leitura de contraste sem sentido (ex.: `rgb(0,0,0)` de um wrapper sem texto); checar
visualmente pelo screenshot antes de reportar um número de contraste estranho como
bug real.
