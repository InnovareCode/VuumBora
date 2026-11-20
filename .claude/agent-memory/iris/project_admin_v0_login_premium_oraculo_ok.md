---
name: project-admin-v0-login-premium-oraculo-ok
description: Reforma visual do login do admin (duas colunas, ícones, revelar senha, amber vs vermelho) em 20/11/2026 — testada e sem oráculo de credenciais
metadata:
  type: project
---

Commit de referência: `apps/admin/src/pages/LoginPage.tsx` +
`src/components/auth/{AuthSplitLayout,LabeledIconInput}.tsx` (ainda não
commitado no momento do teste, em cima de `1516d4a`). Mudança: duas colunas
(`AuthSplitLayout`, lado escuro só ≥1024px), campos com ícone
(`LabeledIconInput`), botão de revelar senha, e separação visual entre erro
de credencial (vermelho) e bloqueio/infra (âmbar) — `AuthContext.login`
retorna `kind: 'credentials' | 'blocked'`.

**O que testei e por quê isso não virou oráculo de conta:**
- 3 causas de 401 (e-mail inexistente, senha errada, usuário desativado —
  desativei `suporte@teste.com` na mão via SQL pra testar) devolvem a MESMA
  mensagem ("E-mail ou senha incorretos.") e o MESMO vermelho. Tempo de
  resposta nos três: 0.75–0.80s (bcrypt cost 12 domina, sem diferença
  visível).
- O 429 (`ADMIN_LOGIN_RATE_LIMIT_MAX` baixado pra 3 só durante o teste)
  dispara mesmo com credenciais 100% CORRETAS na tentativa que estoura o
  limite — prova que "foi bloqueado" é função só da contagem por IP, nunca
  de a conta existir/senha bater. Mensagem e cor (âmbar) diferentes das de
  credencial, nunca junto com detalhe de qual conta.
- Teclado: ordem email → senha → botão revelar → Entrar, nos dois sentidos
  (Tab e Shift+Tab), foco visível (ring) no botão Entrar. Revelar é
  `<button type="button">` de verdade, `aria-label` alterna "Mostrar
  senha"/"Ocultar senha", ativa com Enter sem perder o foco.
- Responsivo: lado escuro (`aside`) visível em 1280px, some em 1023px E
  375px — breakpoint exatamente em `lg` (1024px) como esperado.

**Cuidado ao reproduzir:** `ADMIN_LOGIN_RATE_LIMIT_MAX` baixo esgota rápido
— depois de testar o 429, reiniciar a API (limite em memória, ver
[[feedback-rate-limit-login-reseta-so-reiniciando-api]]) antes de qualquer
teste que precise de login bem-sucedido.

Ver [[project-admin-v0-ambiente-de-teste]].
