---
name: bug_typedroutes_expo_types_velho_quebra_check
description: `.expo/types/router.d.ts` (gerado, ignorado pelo git) fica velho ao criar rota nova e faz `npm run check` falhar só nesta máquina; só `expo start` regenera (export não). Também as duas armadilhas do Git Bash ao passar caminho/URL para script Node de Playwright.
metadata:
  type: feedback
---

**Typed routes velhos:** `typedRoutes: true` gera `apps/*/.expo/types/router.d.ts` só no `expo start` (o `expo export`
NÃO regenera). Criar rota nova (ex. `/entrar` no motorista) ou usar `redirectTo="/entrar"` com o arquivo velho dá
`TS2322: Type '"/entrar"' is not assignable...` no `npm run check` — e NÃO acontece em clone limpo/CI (sem o arquivo, `Href`
vira `string`). Correção local: `CI=1 timeout 60 npx expo start --port <livre> --offline` dentro do app (gera o arquivo e
morre pelo timeout). O passageiro passou "por sorte" porque as URLs não mudaram ao mover para `(auth)`/`(app)`.
Avisar quem roda o check (Íris/Atlas) quando a fatia cria rota.

**Git Bash + Node (Playwright):** (1) argumento que começa com `/` (ex. `/perfil`) vira `C:/Program Files/Git/perfil` —
usar `MSYS_NO_PATHCONV=1` OU montar a URL dentro do script; (2) com `MSYS_NO_PATHCONV=1`, um caminho `/c/Users/...`
passado a `node` é lido como `C:\c\Users\...` e os prints vão parar numa pasta `C:\c` — passar caminho de saída no formato
`C:/Users/...` (ou hardcode no script). Antes de apagar `C:\c`, conferir: outros agentes caem na mesma armadilha e deixam
arquivos lá — apague só os seus.

Relacionado: [[feedback_medir_expo_web_playwright]], [[feedback_medir_site_sem_browser_tool]].
