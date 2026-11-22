---
name: bug_stack_protected_sem_redirectto_vira_unmatched_route
description: Expo Router 58 — Stack.Protected sem `redirectTo` manda quem não tem sessão para a URL `/(auth)` (grupo, não rota) e mostra "Unmatched Route"; como foi achado e corrigido nos apps passageiro/motorista (fatia A1, 21/11/2026).
metadata:
  type: feedback
---

**Sintoma (medido no export web, Playwright):** com `<Stack.Protected guard={isSignedIn}>` em volta de
`<Stack.Screen name="(app)" />`, abrir `/perfil` sem sessão NÃO abre a tela protegida (a guarda funciona),
mas a URL vira `/(auth)` e a página mostra "Unmatched Route / Page could not be found". Mesmo para `/`.

**Causa raiz:** sem `redirectTo`, o destino é a **âncora do navegador raiz**, que é o próprio grupo `(auth)`.
Grupo não tem `index`, então `/(auth)` não casa com rota nenhuma. O `unstable_settings = { anchor: 'boas-vindas' }`
do `(auth)/_layout.tsx` vale para o navegador ANINHADO, não para esse redirect do raiz.

**Correção:** `redirectTo` explícito nos dois `Stack.Protected` do `_layout.tsx` raiz:
`guard={!isSignedIn} redirectTo="/"` no `(auth)` e `guard={isSignedIn} redirectTo="/boas-vindas"` (passageiro) ou
`"/entrar"` (motorista) no `(app)`. Com isso: 11 rotas protegidas do passageiro → `/boas-vindas`, Home do motorista →
`/entrar`; chunk JS das rotas protegidas nem é baixado.

**Como evitar:** em todo `Stack.Protected` que guarda um GRUPO, declarar `redirectTo` para uma rota-folha real.
Testar com URL direta num contexto limpo (sem sessão) e olhar `location.pathname`, não só "não abriu a tela".
Estrutura que funcionou: `(auth)/_layout.tsx` e `(app)/_layout.tsx` com `Stack` próprio + `unstable_settings.anchor`
(`initialRouteName` está deprecated no 58).

Relacionado: [[project_vuumbora_overview]], [[feedback_medir_expo_web_playwright]].
