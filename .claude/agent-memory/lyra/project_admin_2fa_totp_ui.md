---
name: project_admin_2fa_totp_ui
description: apps/admin — telas do segundo fator (TOTP) em 21/11/2026; decisões não óbvias (401 de código errado não é sessão expirada, challengeToken só em estado, sessão só depois dos códigos, qrcode lazy) e como foi medido contra a API real.
metadata:
  type: project
---

Contrato: `docs/contrato-admin-2fa.md`. Peças em `apps/admin/src`:
`api/twoFactor.ts` (porta com sessão), `api/auth.ts` (login devolve
`LoginOutcome`; `verifySecondFactor`/`startEnrollment`/`confirmEnrollment` por
challengeToken), `components/auth/{SecondFactorStep,EnrollmentStep,EnrollmentScan,
RecoveryCodesPanel,CodeField,QrCode,AuthAlert,TwoFactorAlert}`,
`components/security/{EnableTwoFactorDialog,CodeConfirmDialog}`,
`pages/SecuritySettingsPage.tsx` (rota `/security`, menu "Minha conta").

Decisões que não se deduzem do código:
- **401 `invalid_second_factor` NÃO pode cair no `unauthorized` genérico** do
  `client.ts`: senão errar o código ao regenerar/desativar derruba a sessão
  inteira (listener global). Mapear por `error.code` ANTES do 401 genérico.
- `challengeToken` vive só em `useState` do `LoginPage` (nunca contexto/storage);
  `AuthContext.login` devolve `next` e a tela conduz. `acceptSession` só roda
  DEPOIS do "guardei os códigos" — senão a rota `/login` redireciona e os
  códigos únicos somem. Verificado: localStorage/sessionStorage vazios.
- Enrolamento: `start` rotaciona o segredo no servidor → uma promessa por
  montagem (ref), senão StrictMode mostra QR diferente do segredo guardado.
  Efeito que reaplica resultado antigo por cima de fase posterior: ler
  callbacks por ref, nunca nas deps.
- QR: lib `qrcode` só calcula a matriz (`create`), SVG desenhado por nós (zero
  innerHTML), `import()` lazy (chunk ~23 kB). Fundo branco de propósito.
- Contagem do bloqueio (15 min): `aria-hidden` + frase `sr-only` estática, porque
  texto mudando por segundo dentro de `role=alert` é anunciado sem parar.
- Não desabilitar o `<input>` durante o envio (foco cai no body); desabilitar
  só o botão.
- 44px: botões de texto secundários precisam `min-h-11` explícito.

Como foi provado (Playwright + API real em :3101, Postgres de teste :5434, TOTP
calculado no script, 390 e 1280): login → enrolamento → códigos → painel;
código inválido; recuperação; replay rejeitado; 5 erros → 429 com contagem;
settings ligar/regenerar/desativar; dono sem "Desativar". NÃO provados com o
servidor real: expiração de 10 min e `challenge_invalid` (simulados por
interceptação de rota), fim de bloqueio (429 simulado de 3 s).

## Revisão S1 do contrato (21/11/2026) — o que mudou na UI
- Ativação obrigatória começa pelo campo "Código de ativação" (`enrollmentToken`,
  48 h, uso único, fora de banda). Enviado em `enroll/start` E `enroll/confirm`
  junto com `challengeToken`; só em estado de componente. `start` é idempotente
  por 15 min (mesmo segredo) -> não há mais efeito automático de start; é o submit
  do formulário. 409 `two_factor_enrollment_not_started` no confirm refaz o start
  com aviso "QR venceu" (login) ou volta à senha (configurações).
- Com sessão: ligar/regenerar/desativar pedem a SENHA atual. `password_invalid` e
  `enrollment_token_invalid` são 403 (NÃO 401): mapeados por `error.code` no
  `client.ts`, nunca derrubam a sessão. Erro vai ao campo certo via
  `TwoFactorFeedback.field` ('code'|'password'|'activation').
- `account_locked` (429, `retryAfterSeconds`) vale no login e na reautenticação.
  **Rodada 2 (21/11/2026): deixou de ser bloqueio de conta** — é ESPERA CURTA por par
  e-mail+IP (1, 2, 4, 8 s… até 15 min). Texto próprio ("pausa curta de segurança… a conta
  não está bloqueada"), contagem em SEGUNDOS quando a espera inicial < 60 s (mm:ss acima),
  frase sr-only calculada do tempo INICIAL (estática). `two_factor_locked` (15 min do
  código) segue como bloqueio. Ver [[project_admin_email_stepup_csp_ui]].
- Botões de envio usam `aria-disabled` + guarda no handler (Playwright trata como
  "not enabled": usar `click({force:true})` para provar que a trava segura).

## Pós-rodada 2 (21/11/2026)
- Entrou com CÓDIGO DE RECUPERAÇÃO: `RecoveryUsedNotice` antes de aceitar a sessão ("Restam N",
  destaque se < `LOW_RECOVERY_CODES_THRESHOLD`=3) + atalho "Gerar novos códigos agora" -> `/security`
  (destino viaja em `acceptSession(admin, origin, goTo)`; `navigate()` à parte PERDE, ver
  [[bug_navigate_apos_login_perde_para_redirect]]). `verifySecondFactor` devolve `{admin, recoveryCodesRemaining}`.
- Texto de `invalid_second_factor` depende do método (`twoFactorFeedback(error, 'totp'|'recovery')`);
  o de TOTP avisa do replay do mesmo passo de 30 s.
- `GET /me` com 429/rede/5xx NÃO vai ao login: `AuthContext.status='unavailable'` + `SessionUnavailable`.
- QR: preenchimento por token (`fill-navy`), não HEX (o `check:boundaries` do CI reprova HEX solto).
