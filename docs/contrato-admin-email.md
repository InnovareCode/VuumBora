# Contrato — configuração de e-mail (SMTP) do painel admin

Só o papel `dono`. Base `/v1/admin`, cookie de sessão + `X-CSRF-Token` nos POST. Envelope `{ ok, data }` /
`{ ok:false, error:{ code, message, ... } }`. O CORS do admin só libera GET/POST, por isso "salvar" é POST.

> **Revisão S1 rodada 2 (21/11/2026) — mudanças que QUEBRAM o contrato anterior** (a Lyra precisa ajustar a tela):
> 1. **I-2 — reautenticação.** `POST /settings/email` e `POST /settings/email/password/remove` agora exigem o bloco
>    **`stepUp`**: `{ "password": "<senha ATUAL do dono>", "code": "<código TOTP de 6 dígitos do dono>" }`. Sem ele: `400 validation_failed`
>    com `fields: ["stepUp"]`. O nome é `stepUp` (e não `password`) porque `password`, no corpo de "salvar", é a senha do **servidor SMTP**.
> 2. **I-1 — servidor, porta, usuário e senha são UMA unidade de origem.** O que vale deixou de ser "campo a campo": ver
>    [Valor efetivo e origem](#valor-efetivo-e-origem). Combinação mista é recusada (`400`).
> 3. Novos erros de salvar/remover senha: `403 password_invalid`, `401 invalid_second_factor`, `429 account_locked`,
>    `429 two_factor_locked`, `409 two_factor_not_enrolled`, `503 two_factor_unavailable` (tabela em [Erros da reautenticação](#erros-da-reautenticação)).

## Valor efetivo e origem

**Remetente (`from`)** é independente: painel > ambiente (`EMAIL_FROM`) > não definido.

**Servidor, porta, usuário e senha formam uma unidade** e a **origem de todos é a do servidor**:

- Se o **servidor** está no painel (`host` preenchido no painel), **porta, usuário e senha só valem se vierem do painel**. O que
  `SMTP_PORT`, `SMTP_USER` e `SMTP_PASS` do ambiente dizem **nunca** é usado com um servidor do painel (a credencial da infraestrutura
  não pode ser enviada a um endereço escolhido no painel). Falta algum? Fica `unset`/`missing` — não cai no ambiente.
- Se o **servidor** vem do ambiente (`host` em branco no painel), porta, usuário e senha vêm **todos do ambiente**; o que sobrou
  gravado no painel para esses campos é ignorado (e é apagado ao salvar, ver abaixo).

`source` é `"panel"` | `"env"` | `"unset"`. A senha **nunca** volta: só `saved` (sim/não) e a origem.

## GET `/settings/email`

```json
{ "ok": true, "data": {
  "fields": {
    "host": { "value": "smtp.x.com.br", "source": "panel" },
    "port": { "value": 587, "source": "panel" },
    "user": { "value": null, "source": "unset" },
    "from": { "value": "VuumBora <ola@x.com.br>", "source": "panel" },
    "password": { "saved": true, "source": "panel" }
  },
  "panel": { "host": "smtp.x.com.br", "port": 587, "user": null, "from": "VuumBora <ola@x.com.br>", "passwordSaved": true },
  "configured": true, "missing": [],
  "summary": "Enviando por smtp.x.com.br:587 como VuumBora <ola@x.com.br>",
  "updatedAt": "2026-11-21T12:00:00.000Z", "canStorePassword": true } }
```

- `fields` = o que vale de fato (mostre o valor + um selo da origem). `panel` = o que está gravado no painel
  (pré-preenche o formulário; `null` = em branco, cai no ambiente).
- `configured:false` => `missing` lista o que falta (`host`, `port`, `from`, `password` quando há usuário) e `summary` é `null`.
  Com servidor do painel e sem porta do painel, `missing` traz `port` (a porta do ambiente não é usada).
- `canStorePassword:false` => servidor sem chave de cifra: esconda/desative o campo de senha (salvar senha dá 503).

## POST `/settings/email` — salvar

Corpo = estado inteiro do formulário **+ a reautenticação**. **Campo ausente, `""` ou `null` = em branco.**

```json
{ "host": "smtp.x.com.br", "port": 587, "user": "envio@x.com.br", "from": "VuumBora <ola@x.com.br>", "password": "...",
  "stepUp": { "password": "senha atual do dono", "code": "123456" } }
```

- `stepUp` **obrigatório**. `stepUp.password` = senha atual **do dono logado**; `stepUp.code` = **TOTP** de 6 dígitos do app autenticador
  (código de recuperação **não** vale aqui; o código é de uso único, então um código usado no login do mesmo passo de 30 s é recusado: peça o
  seguinte). Falhas de senha contam na **espera progressiva** (1 s, 2 s, 4 s… 15 min por par e-mail + IP; mesmo contador do login).
- `password`: ausente/`""` = **mantém** a salva; texto = troca; `"clearPassword": true` = remove (não envie os dois).
- `host`: só o endereço (sem `http://`, porta ou `/`). `port`: 25, 465, 587 ou 2525 (465 = TLS direto; demais exigem STARTTLS).
- `from`: `Nome <email@dominio>` ou `email@dominio`.
- **Unidade de origem (I-1) — recusas `400 validation_failed` (`error.fields` = nomes dos campos):**
  - sem `host`: **`port`, `user` e `password` também têm de estar em branco** (a tela deve limpá-los e mostrar que tudo vem do ambiente);
    só o `from` pode ficar preenchido;
  - com `host`: **`port` é obrigatória**.
  Salvar **sem `host`** devolve o servidor ao ambiente **e apaga a senha salva do painel** (não fica senha órfã).
- 200 => `data` igual ao GET. Erros: `400 validation_failed`, `422 smtp_host_blocked` (host aponta para rede interna/reservada),
  `503 encryption_unavailable` (sem chave para guardar senha) e os da reautenticação.
- **Cada alteração gera auditoria e alerta fora do SMTP:** `admin_audit_log` (`email_settings.updated`, com `changedFields`
  — só os **nomes** dos campos alterados — e `stepUp: "password+totp"`, nunca a senha) **e** uma linha de log de aplicação de nível `warn`
  `email_settings_changed` (`adminId`, `changedFields`). A notificação pelo próprio SMTP alterado não serviria como alerta: por isso o log/auditoria.

## POST `/settings/email/password/remove` — "remover senha salva"

Corpo `{ "stepUp": { "password": "...", "code": "123456" } }` (obrigatório). Idempotente. 200 => `data` igual ao GET.
Auditoria `email_settings.password_removed` + o mesmo alerta de log.

## Erros da reautenticação

| HTTP | `code` | Quando | Tela |
|---|---|---|---|
| 400 | `validation_failed` (`fields:["stepUp"]`) | bloco `stepUp` ausente ou fora do formato | pedir a senha e o código |
| 403 | `password_invalid` | senha atual errada | "Senha incorreta" (não é sessão expirada) |
| 401 | `invalid_second_factor` | código TOTP errado ou já usado | "Código inválido" |
| 429 | `account_locked` | espera progressiva de senha errada ainda não passou (`error.retryAfterSeconds`, cabeçalho `Retry-After`) | contagem regressiva |
| 429 | `two_factor_locked` | 5 códigos errados seguidos: bloqueio de 15 min do **código** (inalterado) | contagem regressiva |
| 409 | `two_factor_not_enrolled` | dono sem 2FA ativo | (não ocorre: dono sempre tem) |
| 503 | `two_factor_unavailable` | servidor sem `ADMIN_TOTP_ENCRYPTION_KEY` | "indisponível" |
| 503 | `server_busy` (`Retry-After: 3`) | pista do bcrypt cheia (a senha do `stepUp` ainda não foi comparada) | "tente de novo em instantes" |

## POST `/settings/email/test` — e-mail de teste

(Sem mudança; **não** exige `stepUp`.) Corpo opcional `{ "to": "alguem@dominio.com" }` (padrão: e-mail do próprio dono). Usa a configuração
efetiva **salva** (salve antes de testar). Limite: **5 por hora por admin** (falha também gasta tentativa).

| Resultado | HTTP | Corpo |
|---|---|---|
| enviado | 200 | `data: { delivered: true, to }` |
| faltam campos | 409 | `error.code: "email_not_configured"`, `error.missing: [...]` |
| host bloqueado | 422 | `error.code: "smtp_host_blocked"` |
| servidor recusou / não conectou | 502 | `error.code: "smtp_delivery_failed"`, `error.details: { kind, serverMessage, smtpCode?, responseCode?, command? }` |
| limite | 429 | `error.code: "test_email_rate_limited"`, `error.retryAfterSeconds`, cabeçalho `Retry-After` |

`details.serverMessage` é o texto exato do servidor (ex.: `Invalid login: 535 5.7.8 ...`) — mostre como está.
`details.kind`: `smtp` | `unresolvable_host` | `password_unreadable` (chave trocada: pedir para salvar a senha de novo).

## Segurança (para quem revisa)

- **Origem única das credenciais (I-1):** `resolveEffective` (`domain/email-settings.ts`) deriva porta/usuário/senha da origem do servidor e o
  envio ainda recusa configuração mista (`credentialOriginViolation`). Teste que prova: um servidor SMTP falso recebe a mensagem do host do painel
  **sem nenhum `AUTH`** quando só `SMTP_USER`/`SMTP_PASS` do ambiente existem.
- **Reautenticação (I-2):** quem controla o SMTP recebe os códigos de verificação e de redefinição de senha dos apps; cookie de sessão roubado,
  sozinho, não o redireciona. A reautenticação roda **antes** de qualquer consulta de DNS ou gravação.
- Host digitado no painel passa por trava de SSRF a cada envio: resolve o nome, recusa loopback, rede privada, link-local/metadados
  de nuvem, CGNAT, ULA e multicast, e conecta ao **IP aprovado** (sem rebinding). Host vindo de variável de ambiente é do
  operador e não passa pela trava. `SMTP_ALLOW_INSECURE_DEV=true` (ignorada em produção) libera rede privada e conexão sem TLS.
- Senha cifrada em repouso (AES-256-GCM, `lib/secret-box.ts`, mesma `ADMIN_TOTP_ENCRYPTION_KEY`, AAD `email_settings:smtp_password`).
- Auditoria (`admin_audit_log`): `email_settings.updated`, `.password_removed`, `.test_requested`, `.test_result` — sem senha.
  (Pendência S-3 da revisão: o usuário SMTP ainda vai em claro para a auditoria.)
- Log: `email_sent` / `email_send_failed` com códigos e `email_settings_changed` com nomes de campos; nunca host, usuário, senha ou destinatário.

## Serviço de envio (para a verificação de e-mail e recuperação de senha)

`apps/api/src/services/mailer.ts`: `createSmtpMailer({ pool, encryptionKey, log }).send({ to, subject, text, html? })`.
Relê a configuração efetiva a cada envio. Sem SMTP: rejeita `EmailNotConfiguredError(missing)`; falha de entrega:
`EmailDeliveryError(kind, message, details)`. Interface `Mailer` para trocar por falso nos testes.
