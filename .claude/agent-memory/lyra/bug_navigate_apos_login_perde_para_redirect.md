---
name: bug_navigate_apos_login_perde_para_redirect
description: apps/admin — chamar navigate('/security') logo depois de acceptSession() perde: a rota /login (Navigate para o destino padrão) redireciona antes. O destino tem de viajar no MESMO estado da sessão.
metadata:
  type: feedback
---

**Causa raiz:** `App.tsx` renderiza `/login` como `<Navigate to="/driver-applications">` assim que
`status==='signedIn'`; o `navigate()` do router entra em transição (menor prioridade) e chega depois.
Medido: o botão "Gerar novos códigos agora" caía em `/driver-applications`.

**Correção:** `acceptSession(admin, origin, goTo)` grava `postLoginPath` no `AuthContext` junto com a
sessão (um único estado, batched) e a rota `/login` navega para `postLoginPath ?? padrão`. Lista
FECHADA de destinos (`PostLoginDestination = '/security'`), nunca caminho vindo de fora. Limpo em
logout, 401 e login sem 2FA (senão um destino velho vazaria para o login seguinte).

**Como evitar:** em redirecionamento pós-autenticação, o destino é dado da sessão, não um navigate paralelo.
