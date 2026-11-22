# Admin — segundo fator (TOTP): contrato da API

Para a Lyra consumir. Prefixo `/v1/admin`; envelope `{ ok: true, data }` / `{ ok: false, error: { code, message } }`;
`fetch(..., { credentials: 'include' })` sempre. Corpo JSON.

**Quem é obrigado:** `dono` e `financeiro` (nunca recebem sessão sem 2FA). Os outros papéis podem ligar, opcionalmente.
**Códigos aceitos nos campos `code`:** 6 dígitos do app autenticador (TOTP, 30 s, tolera ±1 passo; cada código vale uma vez)
ou, no login, um código de recuperação (`ABCDE-FGHIJ`, caixa/hífen/espaço indiferentes).

> **Revisão S1 (21/11/2026) — mudanças que quebram o contrato anterior** (a Lyra precisa ajustar):
> 1. `/auth/2fa/enroll/start` e `/auth/2fa/enroll/confirm` (dono/financeiro) agora exigem **`enrollmentToken`** — um código de
>    ativação entregue fora de banda (§2).
> 2. `/2fa/enroll/start`, `/2fa/recovery-codes/regenerate` e `/2fa/disable` (com sessão) agora exigem **`password`** (senha atual).
> 3. Novos erros: `enrollment_token_invalid` (403), `password_invalid` (403), `account_locked` (429, também no login).
>
> **Revisão S1 rodada 2 (I-6, decisão do dono, 21/11/2026) — o SIGNIFICADO de `account_locked` mudou (o formato não):** continua `429` com
> `error.code: "account_locked"`, `error.retryAfterSeconds` e `Retry-After`, mas deixou de ser "conta bloqueada por 10 senhas erradas de
> qualquer IP". Agora é a **espera progressiva do par (e-mail + IP)**: 1 s, 2 s, 4 s, 8 s… até 900 s (15 min) depois de cada senha errada
> **daquele IP**. Quem erra de outro IP não atrapalha o dono legítimo. **A tela deve mostrar uma contagem regressiva com
> `retryAfterSeconds`** (pode ser 1 s logo depois do primeiro erro — não é "conta bloqueada") e não bloquear o formulário além disso.
> O bloqueio de 15 min do **código** do 2FA (`two_factor_locked`) **não mudou**.
> 4. Respostas com segredo/sessão/desafio saem com `Cache-Control: no-store` (nada a fazer no cliente, só não cachear por conta própria).

## 1. Login (muda `POST /auth/login`)

`POST /auth/login { email, password }` agora devolve `200` com `data.status`:

| `status` | O que é | Campos extras | Próximo passo da tela |
|---|---|---|---|
| `authenticated` | Entrou (papel sem 2FA ativo). Cookie emitido. | `id, name, email, role, csrfToken` (igual a antes) | Painel |
| `second_factor_required` | Senha certa, 2FA ativo. **Sem cookie.** | `challengeToken`, `challengeExpiresAt` | Tela "digite o código" → `/auth/2fa/verify` |
| `enrollment_required` | Senha certa, papel obriga e ainda não há 2FA. **Sem cookie.** | `challengeToken`, `challengeExpiresAt` | Tela de ativação → `/auth/2fa/enroll/*` |

**Espera progressiva por par (e-mail + IP)** — substitui o teto de 10 falhas / 15 min por conta. Depois da falha número *n* de um par, a próxima
tentativa **desse par** só é aceita passados 1, 2, 4, 8, 16, 32, 64, 128, 256, 512 s e, da 11ª falha em diante, 900 s. Antes disso o login devolve
`429 account_locked` com `error.retryAfterSeconds` — mesmo com a senha certa — e a tentativa recusada **não** alonga a espera. E-mail que não
existe se comporta igual (sem oráculo). Senha certa zera o par; sem errar por 24 h também. As senhas erradas de reautenticação (§3) contam no
**mesmo par**. Custo de adivinhação **por par**: 13 tentativas na 1ª hora e 105 em 24 h; o total é a soma dos pares (cada IP/ /64 novo abre um par).

O `challengeToken` fica em memória (não em storage), vale 10 min e **uma única vez**. Mudança aditiva: `status` é campo novo,
o resto do corpo de `authenticated` é o de antes.

## 2. Antes da sessão (usam o `challengeToken`; sem cookie, sem CSRF)

| Rota | Corpo | Sucesso |
|---|---|---|
| `POST /auth/2fa/verify` | `{ challengeToken, code }` | `200` + cookie + `{ status:'authenticated', id, name, email, role, csrfToken, recoveryCodesRemaining }` |
| `POST /auth/2fa/enroll/start` | `{ challengeToken, enrollmentToken }` | `200 { secret, otpauthUri }` — `otpauthUri` vira o QR; `secret` (base32) é a digitação manual. **Idempotente:** repetir enquanto o segredo pendente vale (15 min) devolve o MESMO segredo (o QR já escaneado continua valendo) |
| `POST /auth/2fa/enroll/confirm` | `{ challengeToken, enrollmentToken, code }` | `200` + cookie + `{ status:'authenticated', …, recoveryCodes: string[10] }` |

`recoveryCodes` aparece **uma única vez** (nunca mais é possível lê-los): a tela precisa mostrar, pedir para guardar e só então seguir.
**`enrollmentToken` (primeiro enrolamento de dono/financeiro):** código de ativação de uso único, formato `ABCDE-FGHIJ-KLMNO-PQRST`
(caixa e hífen indiferentes), que **não vem pela API**: o responsável técnico o gera no servidor (`npm run create-admin` imprime um ao criar
dono/financeiro; `npm run reissue-2fa-enrollment -- --email=...` emite outro) e entrega à pessoa por um canal seguro. Vale 48 h e é gasto
no `confirm`. A tela de ativação precisa de um campo "Código de ativação" (guardado em memória, enviado nas duas chamadas). Só a senha
não basta — é de propósito (revisão S1, M-2). Sem ele: `403 enrollment_token_invalid` e nada é gravado.
Se o segredo pendente vencer (15 min sem confirmar), `confirm` devolve `409 two_factor_enrollment_not_started`: chamar `start` de novo.

Confirmar o enrolamento já conclui o login (não precisa voltar ao e-mail/senha).

## 3. Com sessão (`requireAdmin`; as que mutam exigem `X-CSRF-Token`)

| Rota | Corpo | Sucesso |
|---|---|---|
| `GET /2fa/status` | — | `{ enabled, required, recoveryCodesRemaining }` |
| `POST /2fa/enroll/start` | `{ password }` (senha atual) | `{ secret, otpauthUri }` (papéis opcionais ligando o 2FA; idempotente como acima) |
| `POST /2fa/enroll/confirm` | `{ code }` (sem senha: só quem fez o `start` com a senha conhece o segredo) | `{ recoveryCodes: string[10] }`; **as outras sessões do admin caem** (a atual fica) |
| `POST /2fa/recovery-codes/regenerate` | `{ code, password }` (só TOTP, não vale código de recuperação) | `{ recoveryCodes: string[10] }`; os antigos morrem |
| `POST /2fa/disable` | `{ code, password }` (TOTP ou recuperação) | `{}` — só papéis opcionais; **as outras sessões do admin caem** (a atual fica) |

## 4. Erros (tratar por `error.code`)

| HTTP | `code` | Quando | Tela |
|---|---|---|---|
| 400 | `validation_failed` | corpo fora do formato | — |
| 401 | `invalid_credentials` | e-mail/senha | mensagem genérica |
| 401 | `invalid_second_factor` | código errado, já usado, ou de recuperação já gasto | "Código inválido", manter na tela |
| 401 | `challenge_invalid` | desafio expirou, já foi usado, ou é de outro tipo | voltar ao e-mail/senha |
| 401 | `unauthorized` | sem sessão | login |
| 403 | `csrf_token_invalid` | falta/erro `X-CSRF-Token` | — |
| 403 | `password_invalid` | senha atual errada em `enroll/start`, `regenerate` ou `disable` | "Senha incorreta", manter na tela (não é sessão expirada) |
| 403 | `enrollment_token_invalid` | código de ativação ausente/errado/vencido/já usado, ou de outro admin | "Código de ativação inválido — peça um novo ao responsável técnico" |
| 403 | `two_factor_required_for_role` | `disable` por dono/financeiro | esconder o botão (`status.required`) |
| 409 | `two_factor_already_enrolled` | `enroll/start` com 2FA já ativo | — |
| 409 | `two_factor_not_enrolled` | `regenerate`/`disable` sem 2FA | — |
| 409 | `two_factor_enrollment_not_started` | `confirm` sem `start` antes | refazer `start` |
| 429 | `two_factor_locked` | 5 códigos errados seguidos: bloqueio de 15 min **por admin** | mostrar `error.retryAfterSeconds` (também no header `Retry-After`); nem o código certo entra até lá |
| 429 | `account_locked` | espera progressiva do par (e-mail + IP) depois de senha errada (login OU reautenticação): 1 s … 15 min | mostrar `error.retryAfterSeconds` (e header `Retry-After`); nem a senha certa entra até lá |
| 429 | `rate_limited` | limite por IP (mesmo do login: 5/15 min) | "aguarde" |
| 503 | `two_factor_unavailable` | servidor sem `ADMIN_TOTP_ENCRYPTION_KEY` | "indisponível, contate o responsável técnico" |
| 503 | `server_busy` (`Retry-After: 3`, `error.retryAfterSeconds: 3`) | pista do bcrypt cheia, no **login** (`POST /v1/admin/auth/login`) e na **reautenticação por senha** (`enroll/start`, `regenerate`, `disable` e o `stepUp` de salvar/remover a senha do SMTP em `settings/email`). Recusada antes de qualquer comparação | "Muitas solicitações, tente de novo em instantes"; não é sessão expirada. Código: `src/app.ts:106-111` (handler global; a rota não captura), `src/services/admin-auth-service.ts:125-134` |

## 5. Para o deploy (Vulcano)

- Variável **`ADMIN_TOTP_ENCRYPTION_KEY`** = 32 bytes em base64 (`openssl rand -base64 32`). **Sem ela, dono e financeiro não logam (503)** —
  é de propósito (falha fechada). Perder ou trocar a chave invalida todos os segredos já enrolados. Opcionais: `ADMIN_TOTP_ISSUER`,
  `ADMIN_TOTP_MAX_ATTEMPTS` (5), `ADMIN_TOTP_LOCK_MINUTES` (15), `ADMIN_LOGIN_CHALLENGE_TTL_MINUTES` (10).
- **`TRUST_PROXY`** agora é o número de proxies à frente da API (padrão `1`), não "confiar em tudo" — ver `docs/publicar-o-backend.md`.
- A migração `0016` cria o contador de falhas, os tokens de ativação e o prazo do segredo pendente. **Dono/financeiro que ainda não
  enrolaram precisam de um código de ativação**: `npm run reissue-2fa-enrollment -w @vuumbora/api -- --email=...` (no terminal do serviço
  no Easypanel) e entregar à pessoa. Procedimentos de emergência: `docs/break-glass-admin.md`.
- A migração `0013` derruba as sessões abertas de dono/financeiro: o próximo acesso cai no enrolamento.
