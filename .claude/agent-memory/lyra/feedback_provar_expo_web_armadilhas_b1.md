---
name: feedback_provar_expo_web_armadilhas_b1
description: Armadilhas ao provar fluxos de formulário do Expo web com Playwright (B1, 22/11/2026) — `CI=1 expo start` serve bundle velho, `text=` casa helper text, helper de preenchimento tem que ser idempotente, gancho __DEV__ para forçar erros que o mock não produz, e heredoc grande falha no Bash tool.
metadata:
  type: feedback
---

- **`CI=1 npx expo start --web` NÃO observa arquivos**: o bundle fica congelado na 1ª requisição. Edições seguintes não aparecem e o
  teste "reprova uma correção que está no disco" (perdi tempo com a ação "Pedir novo código" sem a espera). Para provar, subir SEM
  `CI=1` (`npx expo start --web --port N --offline`) e matar pelo PID da porta (`netstat -ano | grep :N`, `taskkill //F //T //PID`).
  `CI=1` só serve para regenerar `.expo/types` (ver [[bug_typedroutes_expo_types_velho_quebra_check]]).
- **Mock vive na memória da página**: `page.goto` no meio do roteiro zera contas/sessão. Navegar por clique ou
  `history.pushState`+`popstate` (`spaGo`); só usar `goto` em teste de URL direta/guarda.
- **Forçar o que o mock não produz** (503, sem rede, `invalid_body`, `emailSent:false`): trocar o método no objeto exposto pelo
  gancho `__DEV__` (`__vuumboraIdentity.register = async () => ({ ok:false, error:{...} })`); as telas chamam `identity.x()` na hora,
  então a troca vale. Funciona só no `expo start` (em `export` o gancho some, provado por grep no bundle + controle positivo).
- **`waitForSelector('text=...')` casa helper text sempre visível** ("É preciso ter 18 anos..." é o helper do campo): usar
  `waitForFunction(() => document.body.innerText.includes(frase completa da resposta))`.
- **Helper de preenchimento tem que ser idempotente**: `fillRegister` que CLICA checkbox desmarca o que já estava marcado (e o
  campo de celular inválido de uma etapa anterior bloqueia o envio no cliente). Ler `aria-checked` antes de clicar e limpar campos.
- **Bash tool: heredoc grande com vários `cat <<'EOF'` encadeados falhou** ("unexpected EOF") e não gravou nada; usar Write.
  Idem para QUALQUER arquivo com regex/barra invertida: o heredoc (e `node -e "..."` com crases) engole `\\` e gera
  `SyntaxError` no arquivo gravado (aconteceu com um probe `replace(/\\/g, ...)`). Arquivo de script → Write; edição de repo → Edit.
- **(B3, 22/11)** O scratchpad da sessão PERSISTE entre tarefas e já tinha `pw/lib.mjs` de outra fatia: `Write` recusa ("não foi lido") em vez de
  sobrescrever — dar nome novo (`lib-b3.mjs`) e conferir com `ls` antes. `playwright-core@1.63.0` casou com o Chromium em cache.
- (B3) Tab bar do app tem `role="tab"` (não `button`); usar `[data-testid="home-tab-bar"]` + `getByText`. Voltar de `/termos` aberto por URL direta vai à
  P01 (o stack tem âncora), não ao cadastro. Depois de reverter uma mutação de controle, rodar o roteiro SOZINHO: em paralelo com outros 2 browsers o Metro
  recompilando estourou um timeout falso. `node -e` com regex de barra invertida quebra de novo (use Edit/Write).
- (B3) Estado do portão do layout capturado com `MutationObserver` instalado ANTES do login (`window.__seen`): é a forma de provar "a Home nunca apareceu".
- **(B2, 22/11) Telas empilhadas ficam MONTADAS e `waitForSelector('[data-testid="entrar-screen"]')` resolve para a de baixo (oculta)**: com 2 elementos
  no DOM o Playwright "segue com o primeiro" e dá timeout em vez de achar o visível. Usar `:visible` (`'[data-testid="x"]:visible'`) em todo `waitForSelector`
  de tela, e passar o `ready` da PRÓPRIA rota ao abrir por URL direta (`/criar-conta` tem `entrar` montada embaixo, por causa da âncora).
- (B2) Helper `spy(method)` chamado duas vezes na mesma página EMPILHA dois embrulhos e cada chamada conta em dobro (apareceu como "reenviou sozinho" +
  "2º envio manda versão velha": falso positivo do teste, não do app). Guardar o original UMA vez (`__spyOrig`). Idem `patch`/`unpatch`: guardar `__orig[method]`.
- (B2) `expo export` SEM o escape aborta com exit 1 mas deixa a pasta de saída VAZIA (o CLI a cria antes de carregar o `metro.config.js`): provar "sem
  artefato" listando-a, não por "pasta inexistente". Bundle Hermes (.hbc): string com acento é UTF-16 e o `grep` ASCII não acha — controle positivo precisa de
  string ASCII pura (testID: `driver-sign-out-button`), não de texto em português.
- (B2) Foco "visível" se prova por imagem do alvo focado × desfocado (`Buffer.compare`), não por `document.activeElement` — ver
  [[bug_inputcore_foco_invisivel_em_campo_invalido]]. Escanear copy de duas formas: AST do TypeScript (literais/JsxText) para o código e `TreeWalker` + atributos
  (`aria-label`, `placeholder`) para o DOM renderizado; um só dos dois deixa passar (o `aria-label` do selo da Home só o DOM pegou).
- Detector de contraste por CSS não compõe `background-image` (botão CTA em gradiente deu 1,03:1 falso): pular nós com ancestral
  em gradiente antes do primeiro fundo opaco. Controle positivo do detector de overflow: injetar `div` clipado/largo/pequeno e ver
  `docX`/`beyond`/`clippedX`/`small` subirem.
- **(A3, 22/11) `spaGo` logo depois do `goto` perde para o redirect inicial** (`/` → `/boas-vindas`): o `pushState` é desfeito e a tela
  esperada nunca aparece. Esperar a tela de pouso (`welcome-screen`; motorista `entrar-screen`) ANTES de navegar por cliente; e "página
  nova" = `goto(base + '/')`, não `reload()` (recarregar uma URL profunda pousa nela, não no início).
- (A3) Firefox/WebKit: `playwright-core` solto de `pw/` pede revisões que não estão no cache; usar o `playwright` 1.62.1 da skill com
  `createRequire('C:/Users/Personal Computer/.claude/skills/playwright-skill/package.json')('playwright')[engine].launch()`.
- (A3) Servidor estático de um `expo export` no Windows: `path.resolve` no diretório E no arquivo antes do `startsWith` (com `C:/` vs `C:\`
  tudo caía no fallback `index.html` e o app nunca subia). Servidor de textos de teste com CORS `*` e `Location` absoluto para provar
  redirecionamento entre origens (o `Response.url` do navegador é a URL final).
- (A3) Provar "nada em localStorage" exige CONTROLE POSITIVO do detector (plantar o token e ver acusar) e varrer sessionStorage, cookie e
  `indexedDB.databases()`; nas dumps, procurar o token EXATO (`session.run(async t => ({ok:true,data:t}))` entrega o access token do mock).

