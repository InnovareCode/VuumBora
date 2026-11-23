# Contrato — identidade dos apps (`/v1/auth/*`)

Passageiro e motorista, **contas separadas** (decisão do dono, 21/11/2026): cada conta tem UM `accountType`
(`"passenger"` | `"driver"`), que não muda. O mesmo e-mail pode ter uma conta de cada tipo. O app **sempre informa o
tipo** (ele sabe qual app é). Não existe conta com dois papéis; `admin` nunca entra aqui.

Envelope: sucesso `{ "ok": true, "data": ... }`; erro `{ "ok": false, "error": { "code", "message", ...extras } }`.
Toda resposta de `/v1/auth/*` sai com `Cache-Control: no-store`. Mensagens são fixas (nunca ecoam a entrada).
Sem `AUTH_PEPPER`/`AUTH_JWT_SECRET` válidos (≥32 caracteres, entropia de gerador, **diferentes entre si**) todas as
rotas respondem `503 auth_unavailable`. Corpo inválido: `400 invalid_body` (ou `invalid_email`, `invalid_password`,
`invalid_phone`). Qualquer 4xx de transporte (corpo grande demais, `Content-Type` inesperado, JSON ilegível) também volta como `400 invalid_body`.
Limites por IP em memória, em duas classes (`429` do rate limit, corpo `rate_limited`): **credenciais e códigos** (`register`, `login`,
`verify-email`, `resend-verification`, `forgot-password`, `reset-password`, **`delete-account`** — gasta bcrypt, mesma classe): padrão 100 pedidos por
rota em 15 min por endereço IPv4 ou /64 IPv6, e teto de 1000 por /48 IPv6; **sessão** (`refresh`, `logout`, `logout-all`, `consents`): sem cota por rota,
só o limite global (100 por minuto por endereço ou /64, e teto de 3000 por minuto por /48). Tudo configurável por variável de ambiente (`apps/api/.env.example`).
Pista do bcrypt cheia (sem vaga e sem lugar na fila): `503 server_busy` + `Retry-After: 3` e `error.retryAfterSeconds: 3`, em
login, `register`, `verify-email` e `reset-password` (e no login do admin). A recusa acontece antes de gravar qualquer coisa
(`src/routes/auth-http.ts:40-44`, `src/lib/bcrypt-pool.ts:62`). O app deve mostrar "tente de novo em instantes", não queda.

> **Revisão S1 rodada 2 + idade/aceite (21/11/2026) — o que muda para o app** (a Lyra/os apps precisam ajustar):
> 1. `POST /register` ganhou **três campos obrigatórios**: `birthDate` (`"AAAA-MM-DD"`, 18 anos completos) e o aceite
>    (`termsAccepted: true`, `privacyAccepted: true`). Novos erros: `400 invalid_birth_date`, `403 underage`,
>    `400 consent_required`, `503 consent_unavailable`.
> 2. `POST /register` sobre e-mail **não verificado** deixou de dar `409`: **substitui** a conta pendente por uma nova (`201`).
>    `409 email_taken` só para conta já **verificada**.
> 2b. **`POST /verify-email` agora exige `password`** — a senha escolhida no cadastro, além do código (I-4b). Senha errada é
>    tratada como código errado (`400 invalid_code`, mesma resposta). O app precisa pedir a senha de novo na tela do código.
> 3. `POST /login`: o bloqueio por contagem (5 falhas / teto global de 20) acabou. Agora há **espera progressiva** por par
>    (identificador + IP): `429 too_many_attempts` com `Retry-After` e `error.retryAfterSeconds` de 1 s a 15 min.
> 4. `POST /reset-password`: novo `429 reset_locked` (teto cumulativo de falhas por conta em 24 h) e o titular recebe um
>    **e-mail "sua senha foi alterada"** depois da troca.
> 5. Todo `429 too_many_attempts` agora traz `error.retryAfterSeconds` (além do cabeçalho `Retry-After`).
>
> **B3 (M-3 da rodada 3) — IMPLEMENTADO na API em 22/11/2026 (Vega), ainda sem validação independente da Íris e da Órion.** O que vale
> é o **contrato real**, que difere do desenho original em três pontos: (1) o sucesso sai no envelope `{ ok: true, data }`, e o erro em
> `{ ok: false, error: { code, message, current? } }`; (2) `GET /me` devolve `consent: null` quando `LEGAL_DOCUMENTS_BASE_URL` não está
> configurada (a sessão continua valendo, mas o app não consegue mostrar reaceite); (3) `url` = `<LEGAL_DOCUMENTS_BASE_URL>/<terms|privacy>/<passenger|driver>/<versão>`,
> sem extensão. `GET /v1/legal/current` é público e responde com `Cache-Control: public, max-age=60`. Texto original do desenho, abaixo: A migração 0021 já existe; o
> aceite passa a registrar a **versão exibida** e o **hash do texto**, e há reaceite quando a versão muda. O que muda para o app
> está na seção "Aceite com versão exibida e reaceite" (fim do documento): `GET /v1/legal/current`, `termsVersion`/`privacyVersion`
> no cadastro, `409 consent_outdated`, `consent` em `GET /me` e `POST /v1/auth/consents`. As variáveis `AUTH_TERMS_VERSION` e
> `AUTH_PRIVACY_VERSION` foram removidas do código e do `.env.example`; o trecho "versão da configuração" abaixo é histórico (desenho original).

## Fluxo

1. `POST /register` (**sem sessão**) → e-mail com código de 6 dígitos.
2. `POST /verify-email` com o código → e-mail verificado.
3. `POST /login` → sessão (`accessToken` 15 min + `refreshToken` 30 dias, rotação, teto de sessão 90 dias).
Conta com e-mail não verificado **nunca** abre sessão (regra também no banco).

## POST `/v1/auth/register`

`{ "accountType", "fullName", "email", "password" (8–72 bytes), "phone"?, "birthDate", "termsAccepted": true, "privacyAccepted": true }`

- **`birthDate`** — texto `"AAAA-MM-DD"` (ex.: `"1990-05-15"`), data real do calendário, não futura, não anterior a 1900 e com **18 anos
  completos hoje no fuso de Natal** (`America/Fortaleza`). Quem nasceu em 29/02 completa 18 em 01/03 nos anos não bissextos.
  Vale para passageiro **e** motorista. A data é dado pessoal: o servidor a grava e **nunca** a devolve, nem a loga; o app não
  deve guardá-la depois do cadastro. Erros: `400 invalid_birth_date` (ausente, formato errado, data impossível, futura ou
  anterior a 1900) e `403 underage` ("É preciso ter 18 anos ou mais para criar uma conta."). Nada é criado.
- **Aceite** — `termsAccepted` e `privacyAccepted` têm de ser exatamente `true` (os dois). Ausentes, `false` ou de outro tipo:
  `400 consent_required` e nada é criado. Hoje (B3 implementado) o cadastro também exige **`termsVersion`** e **`privacyVersion`**: as versões que o app exibiu
  (vindas de `GET /v1/legal/current`). Se não forem as vigentes do perfil, `409 consent_outdated` com `error.current` e nada é
  criado; sem versão publicada para o perfil, `503 consent_unavailable`. O aceite dos dois documentos (**Termos de Uso** e
  **Política de Privacidade**) é gravado na **mesma transação** da conta, com `audience`, hash do texto e instante do relógio do
  banco. Quem preenche `audience` e hash é o banco; a API não grava versão de variável de ambiente
  (`src/services/identity-service.ts:150`, `src/routes/auth-route.ts:86-89`). A trilha é só-acrescenta. Detalhes na seção B3, no fim deste documento.
- `503 server_busy` + `Retry-After: 3` — pista do bcrypt cheia (ver a nota do topo). Nada foi criado.
- `201` → `{ account: { id, publicId, fullName, accountType }, verification: { required: true, emailSent: boolean, resendAfterSeconds: 60 } }`.
  **Nenhum token.** `emailSent:false` = a conta existe mas o e-mail não saiu (SMTP indisponível): o app oferece
  "reenviar código" (`/resend-verification`). Não é erro HTTP.
- `409 email_taken` ("Este e-mail já está cadastrado.") — resposta **explícita** (decisão do dono: aceita-se revelar que o
  e-mail existe), só dentro do mesmo `accountType` e **só para conta já verificada** (ou bloqueada). Cadastrou e perdeu o código?
  Use `/resend-verification` ou o login (que responde `email_not_verified`).
- **Recadastro sobre conta NÃO verificada (I-4):** se o e-mail já tem uma conta do mesmo tipo que **nunca foi verificada**, o
  cadastro **substitui** essa conta por uma **nova**: a antiga é apagada (com o código e o aceite dela) e nasce outra, com **`account.id`
  e `publicId` novos**, os dados, a data de nascimento, a **senha**, o código e o **aceite** desta requisição. Resposta `201` igual à de
  uma conta nova. Quem guardou o `id`/`publicId` do cadastro anterior (o invasor, p.ex.) fica com um identificador morto. Sem isso, quem
  cadastrasse o e-mail de outra pessoa o "reservaria" para sempre. **Cada recadastro manda o código na hora**; o teto de e-mails por
  endereço é o do próprio cadastro (5 por e-mail canonical por hora, abaixo), então são no máximo 5 e-mails por hora por caixa.
- `429 too_many_attempts` + `Retry-After`: toda consulta conta (escopo `register`): 5 por **e-mail canonical** e 30 por **IP** por
  hora, além de um **teto global** de e-mails de verificação por hora (`AUTH_EMAIL_GLOBAL_MAX_PER_HOUR`, padrão 100, vale a todos). O e-mail
  canonical junta `+tag` e os pontos do Gmail (`vi.tima+1@gmail.com` = `vitima@gmail.com`): serve **só** para o limite; a conta é gravada com o
  e-mail digitado. IPv6 é limitado por **/64** (o balde), não por endereço.
- **Saudação do e-mail (I-5e):** o e-mail de verificação/redefinição usa só o **primeiro nome**, se for curto (até 30 letras, com
  hífen/apóstrofo); qualquer outra coisa (URL, número, símbolo) vira "Olá!". O nome gravado não muda.

## POST `/v1/auth/verify-email`

`{ "accountType", "identifier" (e-mail ou ID público), "code" (6 dígitos), "password" }` → `200 { verified: true }` (não abre sessão; o app
chama `/login` em seguida).

**`password` é a senha que a pessoa escolheu no cadastro (I-4b)** e é obrigatória (`400 invalid_body` se faltar). Sem ela, quem
sobrescrevesse o cadastro pendente de uma vítima (recadastro com a senha DELE) faria a vítima — que só digita o código que chegou ao
e-mail dela — verificar uma conta que não controla. Agora o código só verifica a conta se a senha confere com a da conta.

- `400 invalid_code` + `error.attemptsLeft` — **código OU senha errados** (mesma resposta, mesma mensagem "Código ou senha
  incorretos."; a senha errada gasta uma das 5 tentativas do código, então a rota não serve para adivinhar a senha de uma conta
  pendente e não diz qual dos dois estava errado). Dica de tela: "confira o código e a senha que você escolheu no cadastro; se o
  e-mail não foi você que cadastrou, cadastre-se de novo (isso substitui o cadastro pendente)".
- `429 code_locked` — tentativas esgotadas: o código morreu, peça outro.
- `429 too_many_attempts` + `Retry-After` e `error.retryAfterSeconds: 900` — **11ª conferência do par em 15 min**. O par é
  (finalidade `verify_email` + tipo da conta + alvo, e-mail canônico ou ID público + balde de IP). Limites:
  `AUTH_CODE_CHECK_MAX_PER_PAIR` = 10 e `AUTH_CODE_CHECK_WINDOW_MINUTES` = 15 (`src/lib/auth-config.ts:60-61`). Toda tentativa
  conta, inclusive a certa; a recusada não grava nada. Código em `src/services/account-recovery-service.ts:80-89` e `:174`;
  `src/routes/auth-recovery-route.ts:42`. **`retryAfterSeconds` é a janela inteira (900 s), não o tempo exato até liberar**:
  a liberação real depende de quando a tentativa mais antiga sai da janela (a confirmar: não medido).
- `503 server_busy` + `Retry-After: 3` — pista do bcrypt cheia, recusada antes da conferência (ver a nota do topo).
- `400 code_expired` — expirado, inexistente, já usado **ou conta desconhecida** (indistinguíveis de propósito): peça outro.

## POST `/v1/auth/resend-verification`

`{ "accountType", "identifier" }` → **sempre** `200 { resendAfterSeconds: 60 }`, exista a conta ou não, já esteja verificada
ou não, esteja dentro do intervalo mínimo ou não (o e-mail só sai quando cabe). Tetos: 1 código por 60 s e 5 por hora por
conta (banco), e 5 pedidos por e-mail canonical / 20 por IP (/64 no IPv6) por hora, mais o teto global do balde "verificação" → `429 too_many_attempts`.

## POST `/v1/auth/forgot-password` (recuperação só por e-mail)

`{ "accountType", "email" }` → **sempre** `200 { resendAfterSeconds: 60 }`: igual para e-mail inexistente, conta de outro tipo
e conta **não verificada** (esta não recebe e-mail: a recuperação só vale para e-mail verificado). O envio roda em segundo
plano para o tempo de resposta não revelar a existência. Mesmos tetos do reenvio (teto global do balde "redefinição", independente do de
verificação); `429` idem. Conta com o **teto cumulativo de falhas** atingido (abaixo) também recebe `200`, mas **nenhum e-mail sai**.

## POST `/v1/auth/reset-password`

`{ "accountType", "email", "code", "newPassword" (8–72 bytes) }` → `200 { passwordChanged: true, sessionsRevoked: true }`.
Troca a senha e **revoga todas as sessões** (refresh e access tokens caem na hora), atomicamente; o código é de uso único.
**Não** marca o e-mail como verificado. Depois da troca o servidor envia ao titular o e-mail **"Sua senha do VuumBora foi alterada"**
(sem código, senha nem link; em segundo plano — falha do envio não desfaz a troca). Erros iguais aos de `/verify-email`
(`invalid_code`+`attemptsLeft`, `code_locked`, `code_expired`) e `400 invalid_password`, mais:

- `429 too_many_attempts` + `Retry-After` e `error.retryAfterSeconds: 900` — **11ª conferência do par em 15 min** (finalidade
  `password_reset` + tipo + e-mail canônico + balde de IP; mesmos limites de `verify-email`, `src/services/account-recovery-service.ts:200`).
  Vale antes de o código ser comparado: nem o código certo entra até a janela passar. Mesma ressalva: `retryAfterSeconds` é a janela cheia.
- `503 server_busy` + `Retry-After: 3` — pista do bcrypt cheia (ver a nota do topo).
- `429 reset_locked` + `Retry-After: 86400` e `error.retryAfterSeconds` — **teto cumulativo (I-7)**: as falhas de código de redefinição da
  conta **somam entre os códigos** das últimas 24 h; com 10 falhas (`AUTH_RESET_MAX_FAILURES_PER_DAY`) **nem o código certo vale** e
  nenhum código novo é emitido, até as falhas saírem da janela (rolante de 24 h). Pedir outro código não adianta: o app deve
  orientar "tente novamente mais tarde ou fale com o suporte". (`code_locked` continua sendo o limite de 5 por **código**.)

## POST `/v1/auth/login`

`{ "accountType", "identifier" (e-mail ou ID público), "password", "device"? { installationId, platform, label?, appVersion? } }`

- `200` → `{ account, accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt }`.
- `503 server_busy` + `Retry-After: 3` — pista do bcrypt cheia. Recusada **antes** de reservar o par: não conta como falha
  (`src/services/identity-service.ts:277`, comentário de B-1, rodada 3b). Ver a nota do topo.
- `401 invalid_credentials` — e-mail/ID inexistente, senha errada, tipo errado ou conta bloqueada **pela operação** (status da conta, não a espera por tentativas, descrita abaixo): **mesma resposta**.
- `403 email_not_verified` — senha CERTA, e-mail pendente; **sem sessão** (só quem acertou a senha vê isto). O app leva à tela
  do código e oferece `/resend-verification`.
- `429 too_many_attempts` + `Retry-After` e `error.retryAfterSeconds` — **espera progressiva por par (decisão do dono, I-6)**. A conta
  **nunca** é bloqueada por inteiro: a espera é do par (tipo + identificador + **IP**, /64 no IPv6). Depois da falha número *n* a
  próxima tentativa **daquele par** só é aceita passados 1 s, 2 s, 4 s, 8 s, 16 s, 32 s, 64 s, 128 s, 256 s, 512 s e, da 11ª em diante,
  **900 s (15 min)**. Antes disso é `429` — **mesmo com a senha certa** — e a tentativa recusada **não** alonga a espera nem grava falha.
  Quem só sabe o e-mail da vítima espera no **próprio** par; a vítima, de outro IP, tem um par limpo e entra sem espera. Login certo
  zera as falhas do par; sem errar por 24 h o par também zera. Escopo pelo tipo (errar a senha do passageiro não atrasa o motorista).
  O app deve mostrar a contagem de `retryAfterSeconds` (pode ser 1 s logo depois do primeiro erro) e **não** tratar como "conta bloqueada".
  - **Custo de adivinhação** (atacante esperando sempre o mínimo): **por par**, 11 tentativas nos primeiros 17 min, **13 na primeira hora** e
    **105 em 24 h** (depois do teto, 4 por hora). **No total** é a soma dos pares: cada IP novo (cada /64) abre um par com a mesma cota, então
    N IPs = N × 13 na primeira hora. O freio por IP (`rate limit`) e a força da senha fazem o resto. É o preço de nunca trancar o titular por
    causa de terceiros.

## Demais rotas (sem mudança de contrato, exceto o que está dito)

- `POST /refresh` `{ refreshToken }` → `{ accessToken, ..., refreshToken, ... }`; qualquer recusa é `401 invalid_refresh_token`.
  Conta que perdeu o e-mail verificado também é recusada. Corpo malformado (`refreshToken` ausente, curto ou longo demais)
  É `400 invalid_refresh_body`, código PRÓPRIO: o app o trata como o 401 (sessão encerrada), e só ele — **mas só quando o
  corpo chegou como OBJETO JSON válido** e a falha é mesmo no formato do `refreshToken` (Q2, passada 6 da Íris). O
  `invalid_body` genérico (um 4xx de transporte: corpo grande, tipo de conteúdo errado, JSON ilegível — **e também**
  `text/plain` e requisição sem corpo nem `Content-Type`, que nunca chegam a ser um objeto) **não** encerra sessão
  nenhuma (B5, rodada 3c).
- `POST /logout` `{ refreshToken }` (idempotente); `POST /logout-all` (Bearer) → `{ revokedSessions }`.
- `POST /delete-account` (Bearer) `{ "password" }` → **exclusão de conta** (item 3 das pendências jurídicas,
  `docs/juridico/pendencias-para-o-advogado.md`). Ver seção própria abaixo.
- `GET /me` (Bearer) → `{ id, publicId, fullName, accountType }` (**`roles` foi removido**). Com a B3 ganha `consent` (ver o fim do documento).
- Breaking vs. versão anterior: `role` → `accountType` (em register, login e na resposta); `register` não devolve mais tokens
  nem aceita `device`; `login` exige `accountType`.

## POST `/v1/auth/delete-account` (exclusão de conta, item 3 das pendências jurídicas)

`{ "password" }` (Bearer) → `200 { "accountDeleted": true }`. Reautentica por senha (gasta bcrypt — mesma classe de
limite por IP do login/cadastro, `limits.credentials()`) e, só se ela confere, **anonimiza** a conta na mesma
transação (`delete_account()`, migração 0022):

- `accounts`: `email`, `full_name` e `phone` viram texto genérico (o e-mail some da unicidade `(account_type, email)`
  — fica livre para um recadastro), `birth_date` vira `NULL`, `status = 'deleted'`, `deleted_at = now()`.
  `account_type` e `public_id` continuam imutáveis (gatilho da 0010).
- `account_credentials`: o hash da senha é **sobrescrito** por um hash descartável (o mesmo de
  `identity-service.ts::getDummyHash`, usado para disfarçar e-mail inexistente no login) — nunca `DELETE` (a API não
  tem esse privilégio, 0017), mas a senha antiga nunca mais autentica nada, e `status = 'deleted'` já bloqueia o login
  de qualquer forma.
- `devices`: `device_label` vira `NULL`, todo aparelho é revogado (`revoked_at`).
- `refresh_token_families`: **todas** as sessões da conta são revogadas (`revoke_reason = 'account_deleted'`), não só
  a sessão usada na própria chamada.
- `account_email_codes`: qualquer código ainda vivo é fechado (`close_reason = 'account_deleted'`).
- **Nunca tocados** (é o que a lei obriga manter): `account_consents` (prova do aceite, LGPD art. 8º §2º) e
  `access_log` (auditoria — ganha a linha `account_deleted`).

Erros: `400 invalid_body` (sem senha); `403 wrong_password` (senha errada — a conta e as sessões continuam vivas;
**403, não 401** — decisão do Atlas em 22/11/2026, conferência PP-12 da Nova, `docs/contratos/conferencia-pp12-nova.md`:
`401` tem o mesmo `kind` de "token de acesso inválido" no cliente, que renovava a sessão e repetia a chamada sozinho
— a senha errada era conferida duas vezes e a repetição automática caía dentro da espera progressiva abaixo, virando
`429 too_many_attempts` em vez de "senha incorreta". Mesmo desenho de `403 email_not_verified`, acima);
`401 unauthorized` (sem Bearer ou sessão inválida); `429 too_many_attempts` com `Retry-After` e
`error.retryAfterSeconds` — **mesma espera progressiva do login (I-6)**, por um par PRÓPRIO (`accountId` + IP, não o
`identifier` do login: não há "e-mail de outra pessoa" a proteger aqui), então errar a senha na exclusão não atrasa o
login da mesma conta, e vice-versa; `503 server_busy` + `Retry-After: 3` — pista do bcrypt cheia (ver a nota do topo).
Idempotente a nível de banco (`delete_account()` devolve `already_deleted` numa 2ª chamada), mas pela HTTP isso quase
nunca se manifesta: a 1ª chamada já revoga a sessão usada, então uma 2ª com o MESMO token cai em `401 unauthorized`
antes de chegar à função. **Nunca** bloqueada por aceite pendente (`requireCurrentConsent`): excluir a conta é o
oposto de um compromisso novo.

## Operação

- **Login do admin** (`POST /v1/admin/auth/login`, fora deste contrato): também responde `503 server_busy` + `Retry-After: 3` quando a
  pista do bcrypt está cheia (o erro escapa da rota e cai no handler global, `src/app.ts:106-111`). A tabela de erros do admin está em
  `docs/contrato-admin-2fa.md`, seção 4.
- **IP no log do servidor fora de `/v1/auth`** (item 16 das pendências jurídicas): candidatura, lista de espera, painel e
  `/healthz` nunca logam o IP em claro — vai um hash curto (`lib/ip-bucket.ts::hashIpForLog`, chave aleatória do processo,
  sem relação com `AUTH_PEPPER`), só para reconhecer "é o mesmo IP" numa investigação. Dentro de `/v1/auth` o log não traz
  IP nenhum (nem em claro, nem hash) — a trilha estável (HMAC com `AUTH_PEPPER`) mora só no banco (`access_log`/`login_attempts`).
  A configuração do nginx/Easypanel do site é outra frente (Vulcano), fora deste contrato.
- **E-mail:** `buildApp({ mail })` recebe um `MailPort` (`src/lib/mail-port.ts`). Em produção usa
  `createSmtpMailer` (`src/services/mailer.ts`, SMTP do painel/ambiente, lido a cada envio). Falha de envio nunca vira erro
  HTTP: no cadastro aparece como `emailSent:false`; nas rotas "iguais" é só log (`auth_mail_send_failed`, com nome/código do erro).
- **Retenção (M-5):** `npm run identity:retention -w @vuumbora/api` (cron diário do Easypanel, dentro do contêiner, com
  **`MIGRATION_DATABASE_URL`** = credencial dona; `access_log` é append-only para o papel da API). Apaga `login_attempts` > 2 dias,
  `access_log` > **180 dias** (6 meses — item 12 das pendências jurídicas, Marco Civil art. 15; era 90), famílias de sessão
  vencidas/revogadas há > 7 dias, códigos de e-mail fechados/vencidos há > 7 dias.
  Também apaga **contas NUNCA verificadas e paradas há > 7 dias** (I-4: nome, e-mail e telefone de quem não provou ser dono do e-mail;
  leva junto a credencial, os códigos e o aceite, por cascata) — "paradas" = sem cadastro, recadastro nem pedido de código nesse prazo.
  **Candidatura de motorista e lista de espera** (item 14) entram na mesma rotina: `driver_applications` e
  `waitlist_signups` com mais de **180 dias de criação** (prazo PROVISÓRIO — a pergunta ao advogado sobre o prazo certo
  ainda não tem resposta; revisar quando vier). Flags: `--login-attempts-days --access-log-days --session-families-days
  --email-codes-days --unverified-accounts-days --driver-applications-days --waitlist-signups-days`. Requer `dist/` (build).
  `admin_audit_log` não é coberto (trigger de inviolabilidade; procedimento próprio). Exclusão de conta por pedido do
  titular é `POST /v1/auth/delete-account` (acima), não esta rotina — a rotina só cobre contas NUNCA verificadas.
- **Variáveis** (todas opcionais, ver `apps/api/.env.example`): `AUTH_LOGIN_DELAY_BASE_SECONDS` (1) e `AUTH_LOGIN_DELAY_MAX_SECONDS` (900) —
  substituem `AUTH_LOGIN_MAX_FAILURES`, `AUTH_LOGIN_IDENTIFIER_CEILING` e `AUTH_LOGIN_WINDOW_MINUTES`, que não existem mais; `AUTH_REGISTER_*`,
  `AUTH_CODE_REQUEST_*`, `AUTH_EMAIL_CODE_*`, `AUTH_EMAIL_GLOBAL_MAX_PER_HOUR` (100), `AUTH_RESET_MAX_FAILURES_PER_DAY` (10).
  `AUTH_CODE_CHECK_MAX_PER_PAIR` (10) e `AUTH_CODE_CHECK_WINDOW_MINUTES` (15): o limite de conferências do par (verify-email e reset). `AUTH_BCRYPT_CONCURRENCY`,
  `AUTH_BCRYPT_QUEUE_MAX` (8, de 0 a 64) e `AUTH_BCRYPT_MAX_PER_ORIGIN` (de 1 a 8): a pista do bcrypt (`src/lib/bcrypt-pool.ts:396-400`).
  **Removidas (B3):** `AUTH_TERMS_VERSION` e `AUTH_PRIVACY_VERSION` não existem mais no código nem no `.env.example`
  (`apps/api/.env.example:99`). A versão vigente vem da tabela `legal_document_versions` (migração 0021), publicada pelo operador com o
  script `legal:publish` (`apps/api/package.json:21`; argumentos a confirmar em `apps/api/scripts/publish-legal.mjs`). Sem versão publicada, `503 consent_unavailable`.
- **Risco residual (I-6, aceito pelo dono):** sem bloqueio por conta, um atacante com muitos IPs faz ~13 tentativas na 1ª hora **por IP** contra uma
  conta (a conta acima). Para mitigar mais: CAPTCHA a partir de certa contagem e alerta de "muitas falhas distribuídas" (decisão do dono).
- **Aceite e substituição de conta (resolvido, migração 0020):** o aceite é só-acrescenta para a API (sem UPDATE/DELETE). No recadastro a conta
  pendente é **substituída**, não editada: a função `reclaim_unverified_account` (SECURITY DEFINER, só apaga conta ativa e nunca verificada do
  e-mail exato; EXECUTE só para o papel da API) apaga a antiga — o aceite dela cai em **cascata**, única exceção que o gatilho do aceite permite — e a
  API insere a conta nova com o aceite novo. O aceite final é, por construção, o do **último cadastro** (data e HMAC de IP dele).
- **Tempo de resposta:** "esqueci a senha"/reenvio fazem um pouco mais de trabalho de banco quando a conta existe (milissegundos,
  sem esperar o SMTP). Não é indistinguível ao microssegundo; o vazamento que importa (corpo, status, e-mail) é idêntico.

## Aceite com versão exibida e reaceite (B3 · M-3) — IMPLEMENTADO em 22/11/2026 (ver as diferenças no aviso do topo)

Problema (M-3): hoje o servidor grava a versão da variável de ambiente, não a que a pessoa viu, e o rótulo "v1" pode ser reaproveitado
com texto editado. Daqui em diante o aceite prova **qual texto** foi exibido. Estrutura de dados: migração `0021_create_legal_document_versions.sql`
(reversão em `docs/sql/rollback/0021_down.sql`). Nomes no banco: `terms_of_use` e `privacy_policy`; no JSON: `terms` e `privacy`.

### O que existe no banco

| Objeto | O que é |
|---|---|
| `legal_document_versions` | Catálogo das versões **publicadas**: `document`, `audience` (`passenger`\|`driver`), `version`, `text_sha256` (hex minúsculo), `requires_reacceptance` (padrão `true`), `published_at` (relógio do banco). Chave `(document, audience, version)`. **Imutável**: sem UPDATE/DELETE/TRUNCATE para ninguém (gatilho, vale até para o dono) e a API (`vuumbora_api`) só tem SELECT. |
| `legal_current_versions` (view) | A vigente de cada `(document, audience)` = a de maior `published_at`. **No máximo uma por par, por construção.** É a única definição de "vigente". |
| `account_consents` (ganhou 2 colunas) | `audience` (perfil da conta) e `text_sha256` (hash do texto daquela versão), **preenchidos pelo banco** (a API só informa `document` e `version`; o que mandar a mais é descartado). FK composta de 4 colunas para o catálogo. Só aceita versão **publicada e vigente** (senão recusa, ver abaixo). Aceite anterior à 0021 fica com as duas colunas `NULL` (legado: só rótulo). |
| `legal_pending_for_account(conta)` | Função: uma linha por documento que a conta ainda precisa aceitar (a versão **vigente**), numa consulta só. Zero linhas = em dia. |

**Vigente é derivada, não marcada** (marcar a anterior como "aposentada" exigiria UPDATE na linha publicada, e ela é imutável); isto também
responde "qual valia no dia X". `published_at` é sempre o relógio do banco e estritamente crescente por par: não há agendamento nem
retroação. **Publicar = passar a valer.** Texto igual para os dois perfis = duas linhas (uma por perfil) com o mesmo hash; se o dono decidir Termos
distintos por perfil, é só publicar textos diferentes. Não existe `audience` "todos".

### `GET /v1/legal/current?audience=passenger|driver` (sem sessão)

`200` → `{ audience, terms: { version, sha256, publishedAt, url }, privacy: { version, sha256, publishedAt, url } }` (sempre os **dois** documentos).

- `sha256`: SHA-256 hex minúsculo do **arquivo exato** servido em `url` (bytes UTF-8). O app pode baixar e conferir.
- `url`: aponta para texto **imutável por versão**; a API a monta a partir de configuração (URL base + documento/perfil/versão), **não** fica no banco
  (um host que muda não pode deixar uma linha imutável com endereço velho). Onde os textos ficam hospedados é decisão aberta (ver PENDÊNCIAS do handoff).
- `400 invalid_body` (`audience` ausente ou inválido); `503 consent_unavailable` se qualquer um dos dois documentos ainda não tem versão publicada para o perfil.
- Cache: `Cache-Control: public, max-age=60` (o `409 consent_outdated` já traz `error.current`, então um cache velho se corrige sozinho).

### `POST /v1/auth/register` — o que muda

Acrescenta **`termsVersion`** e **`privacyVersion`** (texto): as versões que o app **exibiu** (as que recebeu de `GET /v1/legal/current`).
`termsAccepted`/`privacyAccepted: true` continuam obrigatórios (as caixas de seleção).

- Versões ausentes ou com formato inválido: `400 consent_required` (nada criado).
- Bem formadas, mas **diferentes da vigente** do `accountType` (ou de versão que nunca foi publicada): `409 consent_outdated`, nada criado:
  `{ "ok": false, "error": { "code": "consent_outdated", "message": "Os Termos ou a Política mudaram. Leia a versão atual e aceite de novo.", "current": <mesmo corpo do GET /v1/legal/current> } }`.
  O app recarrega o texto de `error.current`, mostra de novo e reenvia.
- Sem versão publicada para o perfil: `503 consent_unavailable` (como hoje).
- O servidor grava, na mesma transação da conta, **as versões que o cliente enviou** (já confirmadas como vigentes); `audience`, `text_sha256` e a data
  são do banco. Rede de segurança: se publicarem outra versão entre a conferência e o INSERT, o banco recusa (restrições abaixo) e a API devolve o mesmo 409.

### Reaceite quando a versão muda

Regra (está em `legal_pending_for_account`; a API não a reimplementa):

- Cada versão nasce com `requires_reacceptance`: **`true` = mudança material** (quem aceitou antes precisa aceitar de novo); **`false` = correção
  editorial** (typo, formatação: ninguém é incomodado). Quem decide é o dono/jurídico, no ato de publicar. Padrão seguro: `true`.
- A conta está **em dia** num documento se aceitou uma versão publicada **em ou depois da última versão material**. Quem aceitou a v2 (material) segue em dia
  quando sai a v3 editorial; quem só aceitou a v1 fica pendente — e o que ele aceita é a **vigente** (v3), não a material.
- Aceite **legado** (anterior à 0021, sem hash) **não conta**: a conta reaceita a primeira versão publicada. Conta sem aceite nenhum idem. Em produção não há conta
  nenhuma ainda (o banco está na 0009 e a identidade dos apps nasce na 0010), então **não há dado a migrar**; em banco de desenvolvimento nada é apagado nem inventado.
- Sem versão publicada para o perfil, não há pendência (e o cadastro responde 503).

Sinal e rota (implementados em `d75b9b9`: `POST /v1/auth/consents` em `src/routes/auth-consent-route.ts:24`; `consent` em `/me`).
O preHandler `requireCurrentConsent` existe (`src/hooks/require-current-consent.ts`), mas nenhuma rota o usa ainda (verificado por grep em `apps/api/src`: só aparece no próprio hook e num comentário em `src/app.ts:47`). Texto original do desenho:

- **`GET /v1/auth/me`** passa a trazer `consent: { upToDate: boolean, pending: [ { document: "terms"|"privacy", version, sha256, publishedAt, url } ] }`
  (uma consulta a `legal_pending_for_account`; os dois documentos juntos, sem N+1). `pending` lista a versão **vigente** de cada documento pendente.
- **`POST /v1/auth/consents`** (Bearer) `{ termsVersion?, privacyVersion? }` (ao menos uma): cada versão enviada tem de ser a vigente do perfil da conta, senão
  `409 consent_outdated` (com `error.current`). Idempotente: reaceitar a mesma versão devolve `200` sem duplicar. Resposta `200 { consent: { upToDate, pending } }`.
  Registra o HMAC do IP como no cadastro. O app pode mandar sempre as duas versões que exibiu.
- **Quem NÃO é bloqueado por aceite pendente:** `login`, `refresh`, `logout`, `logout-all`, `me`, `consents`, `legal/current` — e, quando existirem, tudo que
  mexe em **viagem em andamento** (posição, concluir, cancelar), exclusão de conta e acesso aos próprios dados. Ninguém é jogado para fora no meio de uma corrida.
- **Quem é bloqueado:** só as rotas que criam **compromisso novo** (motorista ficar online, passageiro pedir corrida, aceitar corrida — S-fatias futuras), por um
  `preHandler` único (`requireCurrentConsent`): aceite pendente → `409 consent_outdated` com `error.pending: ["terms"|"privacy", ...]` e `error.current`. O app abre a tela
  de reaceite (texto da versão, botão aceitar → `POST /v1/auth/consents`). **Proposta** a confirmar com o dono/jurídico; sem prazo de carência: a regra vale desde a publicação, e
  quem publica escolhe o momento (e `requires_reacceptance=false` para o que é só editorial).

### Publicação (operador, nunca a API)

Só a credencial **dona** do banco insere em `legal_document_versions` (o papel da API não tem INSERT: quem conseguisse SQL com a credencial da API não publicaria nem trocaria
o texto "aceito"). Passos: (1) subir o arquivo na URL daquela versão, que não muda mais; (2) `sha256sum` do arquivo; (3) `INSERT (document, audience, version, text_sha256,
requires_reacceptance)`; (4) conferir com `SELECT * FROM legal_current_versions` e `GET /v1/legal/current` (o `sha256` devolvido deve bater com o do arquivo baixado da `url`).
A Vega pode embrulhar isto num script (`legal:publish`) com a credencial de migração. Reenviar a mesma versão não altera nada (o hash original permanece). Publicação errada
**não se edita nem se apaga**: publica-se a versão seguinte. Hash do texto vazio é recusado (pipe que falhou). Duas publicações simultâneas do mesmo par entram em fila.

### Erros do banco que a API traduz (`err.constraint`)

| Restrição | SQLSTATE | Significa | API |
|---|---|---|---|
| `account_consents_version_published` | 23503 | versão que nunca foi publicada para o perfil da conta | `409 consent_outdated` (relê a vigente para o corpo) |
| `account_consents_version_current` | 23514 | versão publicada, mas já substituída | `409 consent_outdated` |
| `legal_document_versions_published_at_monotonic` | 23514 | publicação não é posterior à vigente (relógio voltou) | script de publicação: tentar de novo |
| `account_consents_published_version_fk`, `account_consents_audience_sha256_paired` | 23503 / 23514 | não deveriam ocorrer (o gatilho preenche as colunas) | `503 unavailable` + log (é bug) |

### Migração 0021: efeito sobre o código atual

Estado atual (B3 implementado): o gatilho do aceite **exige versão publicada** (fail-closed, de propósito), e a API grava as versões
que o cliente enviou, já confirmadas como vigentes. Não há mais gravação por `AUTH_TERMS_VERSION`/`AUTH_PRIVACY_VERSION`. Se a versão
não for a vigente, o banco recusa (`23503`/`23514`) e a API responde `409 consent_outdated`. O teste de matriz de privilégios (`apps/api/test/runtime-role.test.ts:52`) exige
`legal_document_versions: []` (a API só lê; INSERT, UPDATE, DELETE e TRUNCATE são negados nas linhas 142-145). Cadastro, `/me`, `consents` e os fixtures já foram adaptados (commit `d75b9b9`, API); os testes de fixture precisam de versão publicada antes do cadastro.
