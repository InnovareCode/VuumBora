---
name: bug_login_status_ausente_vira_desafio
description: apps/admin 21/11/2026 — painel do S1 publicado contra a API antiga: login sem `status` caía no ramo "desafio" e a tela ficava vazia. Causa raiz (atalho `!== 'authenticated'` + tipo de rede mentiroso), correção (validação `unknown` + `contract_mismatch` + foco no alerta) e armadilhas.
metadata:
  type: project
---

**Sintoma (medido, código antigo + API de formato antigo):** após o POST do login a
página ficava em `/login` com 0 alertas, 0 inputs, 0 botões — o cartão do
formulário inteiro sumia (`setStage({ name: undefined })` não casa com nenhum dos
três ramos do `LoginPage`). Beco sem saída e sem mensagem.

**Causa raiz (dupla):**
1. `request<LoginResponse>()` declarava o tipo da resposta SEM validar — o tipo
   mentia para qualquer corpo 200 de forma diferente.
2. `AuthContext.login` e o adaptador tratavam "não é `authenticated`" como
   "é desafio". Atalho por exclusão: ausência de campo virava um ramo válido.

**Regra:** resposta de rede entra como `unknown` e só vira tipo do app depois de
passar por um validador de lista FECHADA (cada desfecho por nome; o resto é erro).
Nunca decidir autenticação por exclusão.

**Como ficou (apps/admin/src):**
- `api/authResponses.ts`: validadores puros (`parseLoginResponse`, `parseMeResponse`,
  verify, enroll/start, enroll/confirm). `reason` só com NOMES de campo e TIPOS —
  nunca valores (corpo traz e-mail/nome/token). Exceção: `status` e `role`, e só se
  parecerem snake_case curto.
- `ApiError` ganhou `contract_mismatch`; `errorMessage` dá o texto fixo em português.
- `api/auth.ts`: `contractMismatch()` limpa o token de CSRF + `console.error` com o motivo.
  `csrfToken` ausente é tolerado como `null` (decisão minha: só afeta mutação, que
  já falha com mensagem própria; o dono pode endurecer).
- `AuthContext.login`: ramos por nome + fallthrough que NUNCA autentica (defesa em
  profundidade; vale p/ qualquer adaptador futuro). `/me` fora do formato cai em
  `unavailable` e `SessionUnavailable` tem variante própria (tom de erro, sem
  "você não foi desconectado", que seria falso).
- `AuthAlert focusOnMount` + `TwoFactorFeedback.focus`: só beco sem saída rouba o foco
  (erro comum de senha mantém o foco no botão — provado). O alerta usa tabIndex -1.
- `ADMIN_ROLES` em `api/types.ts` virou const (o tipo deriva dela) para validar `role`
  em runtime; `ROLE_LABEL: Record<AdminRole,string>` quebraria com papel desconhecido.

**Armadilhas que pegaram:**
- `text-text-secondary` sobre `bg-danger-fill` dá 2,92:1 (reprova AA); `text-text`
  (branco) dá 5,16:1. Em superfície vermelha, texto corrido é `text-text`.
- Efeito colateral NÃO resolvido por desenho: com a API antiga o servidor JÁ emitiu
  o cookie no login recusado; um F5 entra pelo `/me` (que tem o formato certo). Não
  é bypass (credencial válida), mas o painel "recusa e depois aceita". Corrigir
  exigiria logout best-effort na recusa — decisão do dono/Vega.
- `request<T>` genérico segue assumindo tipo nos OUTROS adaptadores
  (driverApplications, emailSettings, twoFactor com sessão) — mesma classe de
  problema, fora do escopo desta rodada.

Ver [[project_admin_2fa_totp_ui]] e [[feedback_prova_api_falsa_e_controle_negativo]].
