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

**Com vários agentes/sessões rodando em paralelo na mesma máquina, uma porta
"responder 200" não prova que é O SEU app servindo.** Achado real (18/11/2026):
`localhost:8098` respondeu HTTP 200 com título "VuumBora" genérico, mas era
`expo start` de uma sessão PASSADA (o `npx expo start --web --port 8098` que eu
tentei dar falhou silenciosamente em segundo plano com "Port already in use" —
o processo antigo continuou de pé). Antes de medir, checar o log do processo que
você mesma iniciou (confirma "Waiting on http://localhost:PORT") e, se a porta já
estava ocupada, escolher outra livre (`netstat -ano | grep LISTENING` no Git Bash)
em vez de confiar que "o healthcheck passou".

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

**O mesmo erro de `exactOptionalPropertyTypes` aparece com `errorMessage?: string`**
em `InputCore`/`ButtonCore` quando a mensagem vem de `fieldState.error?.message`
(React Hook Form) ou de um `useState<string | undefined>` de erro de envio —
`errorMessage={algo}` com `algo: string | undefined` quebra do mesmo jeito que
`testID`. Resolvido nas telas de auth (P01/Login/Cadastro, 18/11/2026) com um
helper puro `fieldErrorProps(fieldState.error)` em
`apps/passenger/src/lib/fieldErrorProps.ts` que devolve `{error:true, errorMessage}`
ou `{error:true}` (nunca a chave com `undefined`) e é espalhado (`{...fieldErrorProps(...)}`)
no JSX — mesma ideia de `toRideDraft`, extraída para o caso de campo de formulário.

**`testID` em `InputCore` vai no `<RNTextInput>` interno, não no `View` wrapper.**
Isso significa que no DOM renderizado (RN Web) o atributo `data-testid` cai direto
no elemento `<input>` — um seletor Playwright `'[data-testid="x"] input'` (tratando
o testID como se fosse de um container) não encontra nada e **dá timeout silencioso**,
não erro de sintaxe. O seletor certo é `'input[data-testid="x"]'` (ou
`page.fill('input[data-testid="x"]', valor)`). `ButtonCore`/`Pressable` já colocam
`testID` no próprio elemento clicável, então `'[data-testid="x"]'` funciona normal
para botões — a pegadinha é só em campo de texto.

**Um detector de overflow que só checa `scrollWidth > clientWidth` (horizontal)
PERDE truncamento de `numberOfLines` quando o texto quebra em MAIS linhas do que o
limite** — isso trunca verticalmente (corta a última linha visível com "…"), não
horizontalmente, então `scrollWidth` do próprio nó de texto fica igual a
`clientWidth` (ele não "vaza" pros lados, só perde linha pra baixo). Achado real
medindo a Home do motorista (18/11/2026): `MetricCard` com `numberOfLines={2}`
cortava "Taxa de aceitação" em 3 linhas reais e `OnlineToggle` cortava "Você está
online e recebendo corridas." em 4 — nenhum dos dois apareceu no scanner de
`scrollWidth`. Scanner correto precisa comparar **os dois eixos**:
```js
if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) { /* truncado */ }
```
(a margem de `+2` no vertical evita falso positivo por arredondamento de
`lineHeight`). Rodar esse scanner em TODOS os breakpoints pedidos, não só no mais
estreito — a tolerância de `+2` e o próprio limite de linhas podem só estourar num
breakpoint do meio (ver [[bug_referencia_linha_unica_nao_cabe_breakpoint]], achado
assim).

**Placeholder de `RNTextInput` não quebra linha nem recebe reticências** — se o texto
do placeholder for mais largo que o campo (comum em telas de 320px com
`leftAccessory` tomando espaço), ele é cortado no meio sem aviso visual (ex.:
"seu@email.com ou (00) 00000-0000" virou "seu@email.com ou (00) 0000" em 320px na
tela de Login). Só aparece numa screenshot real no menor breakpoint — não dá pra
prever pelo tamanho da string. Correção: placeholder mais curto, não CSS.
