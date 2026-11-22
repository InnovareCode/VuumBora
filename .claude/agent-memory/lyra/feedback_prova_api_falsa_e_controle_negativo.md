---
name: feedback_prova_api_falsa_e_controle_negativo
description: Receita para provar no navegador um SPA que fala com API (apps/admin) sem subir a API real — servidor falso com modos, bundle de prova buildado com VITE_API_BASE_URL em outDir de scratch, e controle negativo com `git archive HEAD`. Inclui as armadilhas do Windows.
metadata:
  type: feedback
---

**Quando usar:** provar comportamento de tela contra respostas de API que a API real
não produz mais (formato antigo, campo ausente, papel desconhecido).

**Receita (21/11/2026, 109 verificações):**
1. Bundle de prova SEM tocar no `dist/` real:
   `VITE_API_MODE=http VITE_API_BASE_URL=http://localhost:3199 npx vite build --outDir <scratch>/dist-proof --emptyOutDir`
   (chama `vite` direto, não `npm run build`; variável de shell vence `.env.local`). É o
   artefato minificado real, não o dev server.
2. Um `fake.mjs` com duas portas: API falsa (modos trocados por `POST /__mode`,
   log de requisições em `/__log`, CORS de origem exata + credenciais, cookie
   `sid=1; SameSite=Lax` — localhost↔localhost é same-site) e estático do bundle com
   fallback p/ `index.html`. Playwright cria o cookie com `ctx.addCookies({url: API})`.
3. **Controle negativo obrigatório:** `git archive HEAD apps/admin tsconfig.base.json | tar -x -C <scratch>/old`,
   copiar o `src/styles/tokens.css` gerado (não é versionado), junction de `node_modules`
   (`powershell New-Item -ItemType Junction`; `cmd mklink` com aspas falha no Git Bash),
   buildar com o mesmo `vite build` e rodar o mesmo cenário. Mostrou o bug original
   (cartão vazio) — sem isso, 109 PASS de primeira não provam nada.
4. Medir contraste do pixel composto (cadeia de `background-color` com alpha + cor do
   texto): foi o que achou o 2,92:1 que a leitura do CSS não mostrou.

**Armadilhas:**
- Servidor estático: `path.join(DIST, ...)` troca `/` por `\` e `startsWith(DIST)` com `DIST`
  em barras normais falha SEMPRE -> serve `index.html` no lugar do JS e a página fica em
  branco. Use `path.resolve(argv[2])`.
- `new URL(import.meta.url).pathname` devolve `%20` para "Personal Computer": use
  `fileURLToPath(import.meta.url)`.
- `:focus-visible` após clique de mouse é `false` mesmo com foco programático; após
  Enter no teclado é `true`. Prove os DOIS caminhos antes de afirmar "anel visível".
- Remover a pasta de scratch com junction: apague a junction primeiro
  (`[System.IO.Directory]::Delete(...)`), nunca `rm -rf` por cima — pode seguir para o
  `node_modules` real. Conferi depois: 472 entradas na raiz, intactas.
- Servidor derrubado por `taskkill` gera notificação de "failed": é esperada.
