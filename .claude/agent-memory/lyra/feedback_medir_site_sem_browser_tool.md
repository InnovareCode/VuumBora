---
name: feedback_medir_site_sem_browser_tool
description: Como a Lyra mediu layout/peso/overflow de verdade no navegador numa sessão SEM ferramenta de browser dedicada (sem MCP de navegador) — playwright-core + revisão de versão para casar com o cache de Chromium já no disco. Use quando precisar medir um site e não houver tool de browser disponível.
metadata:
  type: feedback
---

**Contexto:** a convenção da squad é "agentes especialistas não têm
ferramenta de navegador; só o Atlas tem" (skill `medir-antes-de-afirmar`). Mas
o Atlas pode delegar uma tarefa que EXIGE medir no navegador diretamente (ex.:
"meça em 320/390/768/1280/1920 com screenshot de cada"). Quando isso acontece
e a sessão não tem MCP de navegador, dá pra medir mesmo assim pelo Bash.

**O problema real:** `npx playwright install` baixa o Chromium certo, mas
pode não ter rede liberada ou ser lento/caro. A máquina já tinha vários
Chromium em cache (`%LOCALAPPDATA%/ms-playwright/chromium-*`,
`chromium_headless_shell-*`) de sessões anteriores — mas a versão mais nova
do `playwright-core` do npm pede uma revisão de Chromium mais nova que não
está no cache, e dá erro `Executable doesn't exist at .../chromium_headless_shell-1194/...`.

**Solução, sem baixar nada:** instalar `playwright-core` (não `playwright`
completo) numa pasta isolada do scratchpad e ir testando versões até achar
uma cujo Chromium pedido já exista no cache local:

```bash
npm install playwright-core@1.60.0   # tente várias, ex. 1.48, 1.52, 1.58, 1.60, 1.63
node -e "require('playwright-core').chromium.launch().then(b=>{console.log('OK');b.close()}).catch(e=>console.log(e.message.split('\n')[0]))"
```

O erro, quando falha, já diz a revisão exata que a versão pediu
(`chromium_headless_shell-1194`, por exemplo) — dá pra ver a progressão (versões
mais novas do playwright-core pedem revisão mais alta) e mirar numa versão
cujo número bate com uma pasta que já existe em `ms-playwright/`. Achei
`1.60.0`/`1.63.0` batendo com `chromium_headless_shell-1248`/`1254` já em cache
nesta máquina (18/11/2026) — pode mudar se o cache for limpo.

**Depois disso, o resto é Playwright normal:** `chromium.launch()`,
`newContext({viewport})`, `page.goto(url, {waitUntil:'networkidle'})`,
`page.screenshot()`, `page.evaluate()` pra `getBoundingClientRect`. Servi a
exportação estática (`apps/site/out`) com `python3 -m http.server`, não
`next dev` — é o artefato real que vai pro ar.

**Contraste de texto sobre foto, medido por pixel real (19/11/2026):** depois
de ter o `playwright-core` rodando, dá para provar contraste WCAG sem
estimar. `sharp` (já está em `node_modules` da raiz do monorepo, resolvível
por `require.resolve('sharp')`) decodifica o PNG do screenshot;
`sharp(buffer).extract({left,top,width,height}).raw().toBuffer()` devolve os
bytes RGB de um recorte pequeno (4×4) em volta de um ponto. Receita:
1. Pegue a cor do texto via `getComputedStyle(el).color` (já é a cor final
   renderizada, sem precisar calcular nada do CSS).
2. Amostre o FUNDO num ponto ao lado do texto, na MESMA linha (mesmo `y`) —
   um véu em gradiente vertical tem a mesma opacidade naquela altura, então
   o ponto vizinho representa bem o fundo atrás do texto sem precisar
   decompor glifo de anti-aliasing.
3. Calcule luminância relativa WCAG à mão (fórmula padrão, sRGB→linear) e a
   razão de contraste — não existe lib pronta leve o suficiente para valer a
   pena instalar só para isso.
4. Em ESM (`.mjs`), `import sharp from 'C:/caminho/absoluto'` falha
   (`ERR_UNSUPPORTED_ESM_URL_SCHEME`, Node não aceita URL `c:` como import
   relativo). Use `createRequire(import.meta.url)('C:/caminho/absoluto')` —
   `require()` aceita caminho absoluto Windows, `import` não.
5. Rode o script na MESMA pasta onde `npm install playwright-core` foi
   feito (resolução de módulo é por localização do arquivo, não do `cwd` —
   copiar o `.mjs` pra lá antes de rodar, ou `ERR_MODULE_NOT_FOUND`).
6. Para capturar texto que fica abaixo da dobra sem usar `fullPage:true`
   (que cria fantasma de elemento sticky, ver
   [[bug_playwright_fullpage_sticky_fantasma]]): abra a `viewport` já BEM
   alta (ex. 4000px) antes de navegar, em vez de rolar por seção — tudo
   cabe num screenshot só, sem scroll, sem sticky, sem recorte cortando
   texto no meio.

**Armadilhas que pegaram nesta sessão:**
- `python -m http.server` trava o diretório no Windows (`EBUSY` no próximo
  `next build`) — derrubar o processo pela porta
  (`netstat -ano | grep :PORTA` → `taskkill //F //PID`) antes de rebuildar.
- `scrollIntoView()` sem `behavior:'instant'` herda `scroll-behavior:smooth`
  do CSS global — um `waitForTimeout` curto depois disso tira screenshot
  NO MEIO da rolagem, parecendo bug de layout que não existe. Sempre passar
  `behavior:'instant'` em script de medição.
- Overflow "por elemento" pode acusar falso positivo dentro de um
  carrossel de rolagem horizontal de propósito (`overflow-x:auto`) — excluir
  elementos com ancestral `overflow-x:auto/scroll` antes de reportar como bug
  (ver [[feedback_checar_overflow_por_elemento]]).
