# Admin — gestão de usuários (F07): contrato da API

Para a Lyra consumir. Prefixo `/v1/admin`; envelope `{ ok: true, data }` / `{ ok: false, error: { code, message } }`;
`fetch(..., { credentials: 'include' })` sempre (exceto `/auth/activate`, que não usa cookie). Corpo JSON.

**Quem acessa:** só o papel `dono` — toda rota abaixo (menos `/auth/activate`) usa `requireAdminRole('dono')`. Os outros
quatro papéis recebem `403 forbidden` em qualquer uma delas. Mutações (`POST`) também exigem `X-CSRF-Token`
(`docs/contrato-admin-2fa.md` explica de onde ele vem) e a **senha atual do dono** no corpo (`password`) —
reautenticação, mesmo padrão já usado em `/2fa/disable` e `/settings/email`. É a senha de quem está CHAMANDO, nunca a
do usuário alvo.

**Senha + TOTP quando a mutação envolve `dono`/`financeiro`** (revisão de segurança S1 rodada 3g, ponto 3; decisão do
Atlas em 22/11/2026 — reuso do `verifyStepUp` que já existe em `/settings/email`): junto com `password`, o corpo
também aceita `code` (6 dígitos do TOTP do dono que está chamando). `code` só é **exigido e checado** em três
mutações, e só quando o papel envolvido é `dono` ou `financeiro`:
- **criar** (`POST /users`) com `role: "dono"` ou `role: "financeiro"`;
- **trocar papel** (`POST /users/:id/role`) quando o **novo** papel é `dono`/`financeiro` (promoção);
- **reativar** (`POST /users/:id/reactivate`) quando o alvo **já é** `dono` (reativar `financeiro` continua só com senha).

Nas demais combinações (criar/promover papel normal, desativar, reativar quem não é `dono`, rebaixar um `dono`
para papel normal), `code` é ignorado — nem precisa ser enviado. Sem `code`, ou com `code` errado, nessas três
mutações: `401 invalid_second_factor`. Chave de TOTP ausente no servidor: `503 two_factor_unavailable` (falha
fechada, nunca aberta). Dono sem 2FA confirmado: `409 two_factor_not_enrolled`.

**Toda troca de papel aplicada (`changed: true`) derruba as sessões do alvo** (ponto 2 da mesma revisão) — o mesmo
"logout forçado" que a desativação já fazia, agora também quando o papel muda (inclusive entre dois papéis
normais): um admin promovido a `dono`/`financeiro` entra de novo e passa pelo 2FA que o papel novo exige; nenhuma
sessão aberta ANTES da troca sobrevive a ela, sensível ou não.

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

Corpo: `{ name, email, role, password, code? }` (`password` é a senha ATUAL do dono, reautenticação; `code` é o
TOTP dele — **obrigatório** quando `role` é `dono`/`financeiro`, ignorado nos outros três papéis).

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
par e-mail+IP do PRÓPRIO dono — mesma mecânica do login), e (só quando `role` é `dono`/`financeiro`)
`401 invalid_second_factor`, `429 two_factor_locked`, `503 two_factor_unavailable`, `409 two_factor_not_enrolled`.

## 3. Desativar — `POST /users/:id/deactivate`

Corpo: `{ password }` (nunca pede `code` — desativar não é promoção nem reativação de dono). Idempotente: desativar
quem já está desativado devolve `200` com o estado atual, sem novo registro de auditoria. Derruba toda sessão ativa
daquele usuário (logout forçado).

```json
{ "ok": true, "data": { "id", "name", "email", "role", "createdAt", "deactivatedAt": "2026-11-22T18:00:00.000Z" } }
```

Erros: `404 not_found`, `409 last_owner` (é o último `dono` ativo — recusado), `401 password_invalid`, `423 account_locked`,
`409 concurrent_update` (deadlock passageiro contra outra mutação concorrente sobre um dono diferente — repita a
chamada).

## 4. Reativar — `POST /users/:id/reactivate`

Corpo: `{ password, code? }`. `code` (TOTP do dono que chama) é **obrigatório quando o ALVO já é `dono`** —
reativar `financeiro` ou qualquer outro papel continua só com senha. Idempotente (reativar quem já está ativo
devolve `200` sem novo registro). Mesmo formato de resposta do item 3, com `deactivatedAt: null`.

Erros: `404 not_found`, `401 password_invalid`, `423 account_locked`, `409 concurrent_update` (mesmo motivo do
item 3; aqui também cobre o papel do alvo ter mudado entre a checagem e a aplicação — repita a chamada), e (só
quando o alvo é `dono`) `401 invalid_second_factor`, `429 two_factor_locked`, `503 two_factor_unavailable`,
`409 two_factor_not_enrolled`.

## 5. Trocar papel — `POST /users/:id/role`

Corpo: `{ role, password, code? }`. `code` é **obrigatório quando o NOVO papel é `dono`/`financeiro`** (promoção);
rebaixar um `dono` para papel normal continua só com senha. Idempotente (mesmo papel = `200` sem novo registro,
sem derrubar sessão). Toda troca **aplicada** (papel de fato mudou) derruba as sessões do alvo — sensível ou não.

Erros: `404 not_found`, `409 last_owner` (o usuário é o último `dono` ATIVO e o novo papel não é `dono`),
`401 password_invalid`, `423 account_locked`, `400 validation_failed` (papel fora da lista), `409 concurrent_update`
(mesmo motivo do item 3), e (só quando o novo papel é `dono`/`financeiro`) `401 invalid_second_factor`,
`429 two_factor_locked`, `503 two_factor_unavailable`, `409 two_factor_not_enrolled`.

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
pista de quais e-mails existem): `400 activation_token_invalid`. Isso vale também em TEMPO: e-mail inexistente e
e-mail existente com token errado fazem exatamente o mesmo trabalho (1 SELECT + 1 hash + 1 UPDATE) — revisão de
segurança S1 rodada 3g, achado 1 (sem isso, a resposta mais rápida do caminho "e-mail inexistente" era, ela
mesma, um oráculo de quais e-mails de admin existem).

## Decisão de segurança registrada (ler antes de perguntar "por que a API escreve `admin_users` agora?")

Até esta fatia, `admin_users` e `admin_enrollment_tokens` eram **só leitura** para a API em produção (migração
0017) — todo admin nascia por script de terminal, com a credencial dona do banco. A migração 0023 reabre, de forma
estreita, INSERT/UPDATE em `admin_users` (nunca DELETE) e INSERT/DELETE em `admin_enrollment_tokens`, só porque
agora existe código real que precisa escrever ali: esta API, atrás de `requireAdminRole('dono')` + CSRF +
reautenticação por senha + auditoria em toda escrita + a trava do "último dono ativo". O Órion revisou (S1 rodada
3g) e classificou a 0023 como **PARCIAL**: as compensações acima protegem bem contra sessão/cookie roubado e CSRF,
mas nenhuma delas reabre a proteção original contra SQL livre com a credencial da API (injeção, dependência
comprometida, ambiente vazado) — fechar isso de verdade exigiria reescrever a regra em PL/pgSQL, o que o Órion
**não recomendou** fazer agora (nenhuma rodada até hoje achou SQL injetável). A recomendação que ele deu em troca —
senha **e** TOTP nas mutações mais perigosas (criar/promover para `dono`/`financeiro`, reativar um `dono`) — é o
que esta fatia implementa (ponto 3, acima); **o Atlas decidiu fazer isso agora**, por ser reuso de mecanismo já
pronto (`verifyStepUp`) e custo baixo (o dono já usa 2FA obrigatório). Nada além disso mudou na avaliação de risco
da 0023 em si (detalhe completo no cabeçalho da migração `0023_admin_user_management.sql`).
