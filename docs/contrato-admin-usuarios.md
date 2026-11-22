# Admin — gestão de usuários (F07): contrato da API

Para a Lyra consumir. Prefixo `/v1/admin`; envelope `{ ok: true, data }` / `{ ok: false, error: { code, message } }`;
`fetch(..., { credentials: 'include' })` sempre (exceto `/auth/activate`, que não usa cookie). Corpo JSON.

**Quem acessa:** só o papel `dono` — toda rota abaixo (menos `/auth/activate`) usa `requireAdminRole('dono')`. Os outros
quatro papéis recebem `403 forbidden` em qualquer uma delas. Mutações (`POST`) também exigem `X-CSRF-Token`
(`docs/contrato-admin-2fa.md` explica de onde ele vem) e a **senha atual do dono** no corpo (`password`) —
reautenticação, mesmo padrão já usado em `/2fa/disable` e `/settings/email`. É a senha de quem está CHAMANDO, nunca a
do usuário alvo.

Papéis válidos: `dono`, `operacao`, `revisor_documentos`, `financeiro`, `suporte` (`docs/decisoes-do-dono.md` →
"Papéis do painel administrativo").

## 1. Listar — `GET /users`

Query: `role` (um dos cinco papéis, opcional), `includeDeactivated` (`true`/`false`, padrão `false` — só ativos),
`cursor` (opaco, da página anterior), `limit` (1–100, padrão 20).

```json
{ "ok": true, "data": { "items": [ { "id", "name", "email", "role", "createdAt", "deactivatedAt" } ], "nextCursor": "..." } }
```

`nextCursor: null` = não há próxima página. Mesma paginação por cursor (keyset) das candidaturas de motorista —
nunca repita a última linha como `offset`, sempre mande o `nextCursor` recebido.

## 2. Criar — `POST /users`

Corpo: `{ name, email, role, password }` (`password` é a senha ATUAL do dono, reautenticação).

**O novo usuário nasce SEM senha que alguém escolheu por ele.** A resposta de sucesso (`201`) traz um
`activationToken` de uso único, que **só aparece esta vez** — nunca mais é recuperável pela API. O dono entrega esse
token à pessoa por um canal fora do painel (WhatsApp, e-mail, em mãos) para ela definir a própria senha em
`/auth/activate` (§6).

```json
{ "ok": true, "data": { "id", "name", "email", "role", "createdAt", "deactivatedAt": null, "activationToken": "ABCDE-FGHIJ-KLMNO-PQRST", "activationTokenExpiresAt": "2026-11-29T12:00:00.000Z" } }
```

**A tela deve mostrar esse token com aviso explícito de "copie agora, não aparece de novo"** — não há endpoint de
"ver de novo" nesta fatia; se a pessoa perder o prazo (7 dias) ou o token, o único jeito hoje é desativar e criar de
novo (ou pedir ao Vega um "reemitir ativação" numa próxima fatia, se isso incomodar no uso real).

Erros: `409 email_taken` (e-mail já cadastrado), `401 password_invalid`, `423 account_locked` (espera progressiva do
par e-mail+IP do PRÓPRIO dono — mesma mecânica do login).

## 3. Desativar — `POST /users/:id/deactivate`

Corpo: `{ password }`. Idempotente: desativar quem já está desativado devolve `200` com o estado atual, sem novo
registro de auditoria. Derruba toda sessão ativa daquele usuário (logout forçado).

```json
{ "ok": true, "data": { "id", "name", "email", "role", "createdAt", "deactivatedAt": "2026-11-22T18:00:00.000Z" } }
```

Erros: `404 not_found`, `409 last_owner` (é o último `dono` ativo — recusado), `401 password_invalid`, `423 account_locked`.

## 4. Reativar — `POST /users/:id/reactivate`

Corpo: `{ password }`. Idempotente (reativar quem já está ativo devolve `200` sem novo registro). Mesmo formato de
resposta do item 3, com `deactivatedAt: null`.

Erros: `404 not_found`, `401 password_invalid`, `423 account_locked`.

## 5. Trocar papel — `POST /users/:id/role`

Corpo: `{ role, password }`. Idempotente (mesmo papel = `200` sem novo registro).

Erros: `404 not_found`, `409 last_owner` (o usuário é o último `dono` ATIVO e o novo papel não é `dono`),
`401 password_invalid`, `423 account_locked`, `400 validation_failed` (papel fora da lista).

## 6. Primeiro acesso — `POST /auth/activate` (SEM sessão, SEM cookie)

Quem acabou de ser criado chama isto para definir a própria senha. Não usa `credentials: 'include'` — é uma rota
pública (limite de taxa da mesma classe do login: poucas tentativas por IP).

Corpo: `{ email, token, newPassword }` (`newPassword`: 12–200 caracteres).

```json
{ "ok": true, "data": { "role": "financeiro", "requiresTwoFactorEnrollment": true, "enrollmentToken": "...", "enrollmentTokenExpiresAt": "..." } }
```

- `requiresTwoFactorEnrollment: false` → a senha já está pronta; a tela manda a pessoa para `/auth/login` normal.
- `requiresTwoFactorEnrollment: true` (papel `dono`/`financeiro`) → `enrollmentToken`/`enrollmentTokenExpiresAt`
  vêm JUNTO, nesta MESMA resposta — não é preciso pedir ao dono um segundo token. A tela deve seguir direto para o
  fluxo de ativação obrigatória do 2FA (`docs/contrato-admin-2fa.md` §2), usando este token.

Erro único, sempre a mesma resposta (sem distinguir e-mail inexistente de token errado/vencido/já usado — nunca dá
pista de quais e-mails existem): `400 activation_token_invalid`.

## Decisão de segurança registrada (ler antes de perguntar "por que a API escreve `admin_users` agora?")

Até esta fatia, `admin_users` e `admin_enrollment_tokens` eram **só leitura** para a API em produção (migração
0017) — todo admin nascia por script de terminal, com a credencial dona do banco. A migração 0023 reabre, de forma
estreita, INSERT/UPDATE em `admin_users` (nunca DELETE) e INSERT/DELETE em `admin_enrollment_tokens`, só porque
agora existe código real que precisa escrever ali: esta API, atrás de `requireAdminRole('dono')` + CSRF +
reautenticação por senha + auditoria em toda escrita + a trava do "último dono ativo". **Órion precisa revisar isso
antes do próximo deploy** — é uma mudança de postura de segurança, não só uma feature nova (detalhe completo no
cabeçalho da migração `0023_admin_user_management.sql`).
