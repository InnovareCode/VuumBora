---
name: project_admin_email_smtp_ui
description: apps/admin — tela "E-mail" (SMTP, só dono) de 21/11/2026; decisões não óbvias e como foi medida com API real + SMTP falso (e a armadilha de bootstrap de dono de teste).
metadata:
  type: project
---

Peças: `pages/EmailSettingsPage.tsx` (rota `/email`, grupo de menu "Configurações",
`roles:['dono']`), `components/email/{EmailSummaryBand,EmailSettingsForm,SettingField,
TestEmailPanel,DeliverabilityNotice}`, `api/emailSettings.ts`, `hooks/useEmailSettings.ts`.
Contrato: `docs/contrato-admin-email.md`. **Salvar/remover senha agora exigem step-up (senha + TOTP) e servidor/porta/usuário/senha são uma unidade: ver [[project_admin_email_stepup_csp_ui]].**

Decisões que não se deduzem do código:
- `error.fields` do 400 de e-mail é uma LISTA de nomes, não mapa — `client.ts`
  normaliza (array → `{nome: ''}`) e a página mapeia mensagem por nome de campo.
- Códigos novos viram `ApiError.kind` próprios (`smtp_delivery_failed` com
  `details`, `smtp_host_blocked`, `encryption_unavailable`, `email_not_configured`);
  429 `test_email_rate_limited` reaproveita `rate_limited` + `retryAfterSeconds`.
- Teste usa a config SALVA: com formulário sujo o botão de teste fica travado
  (`aria-disabled` + motivo visível). `aria-disabled` em vez de `disabled` nos
  botões que têm o foco durante o envio (disabled joga o foco no body).
- Bloco de falha de entrega: fundo translúcido (`danger/10`), NÃO o vermelho
  cheio do login — texto secundário sobre `#D02A38` reprova contraste, e o bloco
  tem texto longo de diagnóstico.
- Após "Remover a senha salva" o botão some: foco explícito no campo da senha.
- Senha digitada só em `useState`, apagada após salvar; nunca em storage; o POST
  leva a senha, nenhuma resposta a devolve (conferido em todas as respostas).

Bug achado e corrigido nesta tela (e AINDA presente nos diálogos do 2FA):
`flex-col` + filho `flex h-11 flex-1` → no eixo vertical `flex-1` (basis 0) zera
a altura e o botão colapsa para ~21 px no mobile. Usar `sm:flex-1` (coluna fica
`h-11` stretch). Corrigido também nos diálogos do 2FA na revisão S1 (21/11/2026).

Como testar sem o dono real: `create-admin.mjs` agora imprime um CÓDIGO DE ATIVAÇÃO
do 2FA (uso único, 48 h) para dono/financeiro; enrolar por script (login →
`/auth/2fa/enroll/start|confirm` com `{challengeToken, enrollmentToken}`), depois
logar pela UI com TOTP calculado. Código TOTP usado no enrolamento não vale de
novo no mesmo passo de 30 s: esperar a virada antes do 1º login. API local precisa
de `ADMIN_TOTP_ENCRYPTION_KEY` fixa na sessão (segredos antigos viram ilegíveis se
a chave mudar), `SMTP_ALLOW_INSECURE_DEV=true` e SMTP falso em porta permitida
(2525/587). Admins criados antes da mudança de hash podem dar `invalid_credentials`.
