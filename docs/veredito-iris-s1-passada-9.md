# Veredito da Íris, S1, passada 9

**VEREDITO: APROVADO, com ressalvas (nenhuma bloqueia a fatia; ver "Achados" e "Pontos já sinalizados pelo Órion").**

**Atualização — o commit `e8d1a7c` (fix da revisão 3g, por cima de `f3a208c`, mesma branch `fatia/f07`) corrige os
quatro pontos abaixo. Veredito sobre `e8d1a7c`: APROVADO. Ver a seção "Delta e8d1a7c", ao final.**

**Vale só para o commit `f3a208c` (SHA completo `f3a208c0e1c576b8b353df213656023545cf927f`, "feat(api): usuarios
e papeis do painel admin e limite proprio em toda rota (F07, backend)"), ponta da branch `fatia/f07`.**
Provado em cópia limpa (`git archive f3a208c`), `npm ci` com Node 22.23.5 (baixado fresco, o do CI — os binários de
passadas anteriores no scratchpad tinham sido limpos entre sessões), sem `.env` do repositório real (só o `.env`
que eu mesma escrevi na cópia). Rodado em 22/11/2026 entre 14:30 e 18:15 (horário da máquina).

**Escopo:** só a API da gestão de usuários e papéis do painel (F07) — a tela ainda não existe, como avisado.
Dentro do mesmo escopo, a QA própria (nunca feita) da aprovação/recusa de candidatura de motorista (`da9db50`,
ancestral comum confirmado por `git merge-base --is-ancestor da9db50 f3a208c`), e o teste de inventário de limites
com mutante.

**Ambiente:** Postgres 18.1 próprio na porta **5481** (dentro da faixa reservada **5480–5489**; nenhuma outra
porta usada — a outra Íris estava na 5470–5479 ao mesmo tempo). API real, processo próprio, ouvindo em
`127.0.0.1:3481`, conectada ao banco com `options=-c role=vuumbora_api` (equivalente a `SET ROLE` em toda
conexão — mesma técnica do `runtime-role.test.ts`), migrada antes por uma credencial dona separada
(`MIGRATION_DATABASE_URL`), exatamente como o `server.ts` exige em produção. Todas as chamadas HTTP contra o
servidor real (`fetch`), não `app.inject`. Windows 10, Xeon E5-2650 v4 — a mesma máquina tinha outras frentes
rodando (a outra Íris, possivelmente outros agentes); toda medição de tempo abaixo é rotulada com essa condição.
Tudo derrubado ao fim (API morta, Postgres da 5481 parado com `pg_ctl stop -m fast`, confirmado por `netstat` sem
LISTENING nas portas 3481/5481). Nenhuma técnica de ataque usada — o repositório é público.

**Imprevisto de ambiente, registrado para a memória:** o disco `C:` da máquina chegou a ficar em ~100% de uso
(`df` reportando 0 bytes livres) no meio da passada, derrubando um `cp` do Node 22 a meio caminho. A causa aparente
foram cópias acumuladas de sessões antigas (`node_modules` completos do monorepo, várias vezes, em pastas de
passadas anteriores dentro do mesmo diretório de scratchpad). Enquanto eu investigava, pastas antigas (`iris`,
`iris2`, `iris3`, `iris5`, `iris6`, `iris7`) desapareceram sozinhas entre duas chamadas minhas — não fui eu (uma
tentativa de limpeza minha via `rmdir` foi bloqueada pelo classificador de ações destrutivas, antes de executar).
Não investiguei quem limpou; só registro que o espaço voltou (~9GB livres) e segui. **Lição para a próxima:** não
assumir que o scratchpad de passadas antigas continua intacto; checar espaço em disco (`df -h`) antes de montar o
ambiente, e preferir baixar o Node 22 fresco (`curl` em `nodejs.org`, ~35MB) a depender de cópia residual.

## Mensagem do Atlas recebida no meio da passada (achados do Órion, correção já em andamento pela Vega)

Quatro pontos foram levantados sobre `f3a208c` e a Vega já está corrigindo por cima dele. Segui o restante da
passada como pedido e, nestes quatro, **não reprovo por eles** — verifiquei o estado ATUAL (antes da correção) e
deixo registrado para a reconferência do delta:

1. **`POST /v1/admin/auth/activate` tem oráculo de tempo (e-mail existe x não existe).** Medido: 40 chamadas para
   cada caso, mesma máquina, mesmo momento. E-mail **existente** (token errado): mediana 2.48 ms, média 4.13 ms.
   E-mail **inexistente**: mediana 1.97 ms, média 2.27 ms. Diferença pequena em valor absoluto mas **consistente e
   repetível** (a cauda de 57 ms no caso "existe" é ruído da minha máquina, não o sinal) — bate com a leitura do
   código: e-mail inexistente retorna logo após `findAdminByEmail` devolver `null`; e-mail existente segue para
   `hashEnrollmentToken` + `consumeEnrollmentToken` antes de responder o mesmo 400. **Confirmado, a reconferir.**
2. **Trocar o papel não derruba as sessões do alvo.** Confirmado por teste direto: sessão do alvo ativa antes da
   troca, dono troca o papel de `suporte` para `operacao`, a MESMA sessão antiga (mesmo cookie) continua
   autenticando em `/me` depois — e, ponto mais fino, `/me` já devolve o papel NOVO na hora (o papel é lido ao
   vivo da sessão, não cacheado) — ou seja, não é "a sessão fica com o papel antigo", é "a sessão nunca é forçada
   a provar de novo que ainda é a pessoa certa para o papel novo". Isso importa mais ainda no próximo ponto.
   **Confirmado, a reconferir.**
3. **Criar/promover para `dono`/`financeiro`, e reativar um dono, hoje só pedem senha (sem TOTP).** Confirmado por
   leitura: `gatePassword` (`admin-user-service.ts`) chama só `reauthenticateAdmin(pool, actor, password, ip)` —
   não há nenhuma verificação de código TOTP em `createAdminUser`/`changeAdminUserRole`/`reactivateAdminUser`, para
   nenhum papel de destino. **Confirmado por leitura de código, a reconferir quando o step-up chegar.**
4. **Deadlock que hoje viraria 500 passaria a dar 409.** Fui atrás de reproduzir de propósito: montei o padrão
   clássico (duas transações que travam o alvo PRÓPRIO primeiro e depois travam o conjunto inteiro de donos ativos
   via `countOtherActiveOwners`, em ordem cruzada) — dois donos A e B desativando um ao outro ao mesmo tempo, com
   um terceiro dono de sobra para não confundir com `last_owner`. **Não consegui reproduzir um 500 em 40 rodadas**
   (resultado sempre `200/200` quando o terceiro dono garante que nenhum dos dois é "o último", ou `200/401` quando
   a sessão de um morre por efeito colateral do outro). Conferi `app.ts`: não há `setErrorHandler` nem qualquer
   tratamento de `40P01`/`deadlock_detected`/`serialization_failure` — então, SE o deadlock acontecer (janela de
   timing que não bati nesta máquina, com Node single-thread processando as duas requisições quase sempre fora de
   fase), ele realmente cairia no handler genérico e voltaria 500 sem tratamento especial. **Risco confirmado por
   leitura de código; não reproduzido ao vivo nesta passada — registrar e reconferir quando o commit de correção
   chegar, idealmente com um teste que force a janela de corrida (mais contenders, ou trava artificial no código
   para alongar a transação durante o teste).**

## Resumo por item do escopo

| Item | Resultado |
|---|---|
| 1. Papel em cada rota admin (403 onde não cabe) | **Liberado.** `/users` (só dono), `/driver-applications` (dono+operação), `/settings/email` (só dono) — as três famílias de rota com `requireAdminRole` hoje no código. |
| 2. Criar, ativar (com e sem 2FA obrigatório), token errado/reusado, desativar, reativar, trocar papel | **Liberado**, com os achados 2 e 3 acima registrados. |
| 3. Auditoria linha a linha | **Liberado.** |
| 4. Concorrência real do último dono ativo | **Liberado**, com o achado 4 acima registrado (não reproduzido, mas não descartado). |
| 5. API rodando como `vuumbora_api` | **Liberado.** |
| 6. Aprovar/recusar candidatura (QA própria, nunca feita) | **Liberado.** |
| 7. Inventário de limites — mutante | **Liberado.** |
| 8. CI da branch | **Verde.** |

## 1. Papel em cada rota admin

Hoje só três famílias de rota usam `requireAdminRole` (as outras, como `/2fa/*` e `/auth/login`, são
autoatendimento — qualquer papel autenticado gerencia o próprio fator, sem porta de papel, por desenho):

- **`/v1/admin/users*` (só `dono`):** os outros quatro papéis (`operacao`, `revisor_documentos`, `financeiro`,
  `suporte`) recebem `403 forbidden` em `GET /users` e `POST /users`; `dono` recebe `200`/`201`. Confirmado contra
  a API real (não só a suíte que o Vega já tinha).
- **`/v1/admin/driver-applications*` (`dono` + `operacao`):** `revisor_documentos`, `financeiro` e `suporte`
  recebem `403` em `GET /driver-applications` **e** em `POST .../approve` (bloqueia ANTES de checar CSRF — a
  ordem do `preHandler` importa: `requireAdminRole` vem antes de `requireCsrfToken`). `operacao` e `dono` recebem
  `200`.
- **`/v1/admin/settings/email*` (só `dono`):** `operacao`, `revisor_documentos`, `financeiro` e `suporte` recebem
  `403` em `GET /settings/email`; `dono` recebe `200`. (Nota de harness: o caminho certo é `/settings/email`, não
  `/email-settings` — tropecei nisso eu mesma na primeira rodada do meu próprio script; registrado na memória.)

## 2. Criar, ativar, token errado/reusado, desativar, reativar, trocar papel

Contra a API real (não `app.inject`): criar `suporte` (sem 2FA obrigatório) devolve `activationToken` de uso
único; ativar com o token certo define a senha, `requiresTwoFactorEnrollment: false`, e o login seguinte entra
direto, sem cookie de 2FA pendente. Criar `financeiro` (2FA obrigatório) devolve o mesmo fluxo, mas a ativação
também entrega `enrollmentToken` JUNTO (sem precisar de uma segunda entrega do dono), e o login seguinte responde
`status: 'enrollment_required'`, **sem** cookie de sessão. Token errado, token já usado (reuso do mesmo token após
consumido) e e-mail inexistente: os três dão a MESMA resposta (`400 activation_token_invalid`) — sem oráculo.

Desativar: sessão do alvo funciona antes, cai depois (mesmo cookie, `401`); chamar de novo é idempotente (não
duplica auditoria); reativar devolve `deactivatedAt: null`; trocar papel grava `before`/`after` corretos. Senha do
ator errada: `401 password_invalid`; sem `X-CSRF-Token`: `403` (bloqueia antes do gate de senha ser avaliado —
confirmei isso perguntando "a sessão do ator usada nesse teste descartável ficou intacta depois do 403?" e sim).

## 3. Auditoria conferida linha a linha

Para cada mutação, consultei `admin_audit_log` direto no banco (não confiando no corpo da resposta): 1 linha
`admin.user.created` (com `after` contendo nome/e-mail/papel, nunca a senha), 1 linha `admin.user.deactivated` com
`admin_id` = quem decidiu (não o alvo), **zero** linha nova na chamada idempotente seguinte, 1 linha
`admin.user.reactivated`, 1 linha `admin.user.role_changed` com `before: {role: 'suporte'}` / `after: {role:
'operacao'}` exatos. Para a candidatura de motorista: 1 linha por decisão, nunca duplicada por replay da mesma
`Idempotency-Key`, nunca duplicada pela corrida (ver seção 4).

## 4. Concorrência real do último dono ativo

Duas formas, as duas contra a API real:

- **Cruzada (A desativa B, B desativa A, cada um com a PRÓPRIA sessão):** nunca os dois `200` — numa rodada, um
  caiu com `409 last_owner`; o invariante (pelo menos 1 dono ativo sobra) se manteve. Relaxei minha asserção
  inicial (que exigia literalmente "um 200 e um 409") depois de descobrir que o OUTRO desfecho seguro também é
  válido: a sessão de quem perde a corrida pode cair por efeito colateral (o outro já revogou as sessões dela ao
  desativá-la) antes mesmo de chegar à regra de negócio — ainda assim nenhum dos dois `200` indevido acontece.
- **Mesmo ator, dois alvos (ataca direto a serialização entre transações de ALVOS DIFERENTES):** com exatamente 2
  donos ativos, o MESMO ator dispara ao mesmo tempo "desativar a mim mesmo" e "desativar o único outro dono ativo"
  — isso é o padrão que realmente testa se `countOtherActiveOwners` (que trava TODAS as linhas de dono ativo,
  não só o alvo) serializa corretamente entre as duas transações. **5 rodadas, reconstruindo o par de donos do
  zero em cada uma:** nunca os dois `200`; sempre sobra exatamente 1 dono ativo entre os dois. Além disso, tentei
  forçar o deadlock cruzado de propósito (ver achado 4 do Órion, acima) com 3 donos em 40 rodadas — não reproduzi
  um 500, mas o risco teórico continua, por falta de tratamento de `40P01` no `setErrorHandler`.

## 5. API rodando como `vuumbora_api`

Toda a passada — suíte automatizada E os meus scripts manuais contra o servidor real — rodou com a API conectada
via `options=-c role=vuumbora_api`. Migrações aplicadas antes, com credencial dona separada
(`MIGRATION_DATABASE_URL`), exatamente como o `server.ts` exige (ele BORRA essa variável do `process.env` depois
de migrar, com aviso — confirmei lendo o log de boot). A suíte `runtime-role.test.ts` já prova a matriz de
privilégios linha a linha (INSERT/UPDATE em `admin_users`, nunca DELETE; INSERT/UPDATE/DELETE em
`admin_enrollment_tokens`) — não refiz essa prova, ela já é própria e não mudou de forma neste commit além do que
a 0023 declara.

## 6. Aprovar/recusar candidatura — QA própria (nunca feita; `da9db50`)

Não existe, no repositório, NENHUM arquivo de teste automatizado dedicado à rota
`/v1/admin/driver-applications/:id/{approve,reject}` (procurei por "approve"/"reject" em `apps/api/test/*.test.ts`
— zero resultado; a cobertura mais próxima é indireta, de outros arquivos que só tocam a tabela por acidente). A
única validação anterior registrada era manual, por mim, em 20/11/2026, por `curl`, antes do CORS segregado estar
pronto por completo — nunca formalizada em veredito. Fiz agora, contra a API real do commit `f3a208c` (que inclui
`da9db50` como ancestral, confirmado):

Caminho feliz (aprovar), replay da MESMA `Idempotency-Key` (mesma resposta, sem segunda linha de auditoria),
decidir de novo com OUTRA chave numa candidatura já decidida (`409 invalid_transition`), candidatura inexistente
(`404`), motivo de recusa curto demais (`400 validation_failed`), sem `Idempotency-Key` (`400
idempotency_key_required`), e a concorrência real que mais importa: aprovar-vs-recusar simultâneos na MESMA
candidatura — um `200`, um `409 invalid_transition`, exatamente 1 linha de auditoria (não 2). Papel: `dono` e
`operacao` acessam; os outros três, `403` (ver seção 1).

## 7. Inventário de limites — mutante

Inseri uma rota sintética (`GET /v1/admin/mutante-sem-limite`) sem `config.rateLimit` dentro do contexto admin do
`app.ts`, na cópia limpa. `rate-limit-coverage.test.ts` reprovou imediatamente, apontando exatamente a rota nova:
`"GET /v1/admin/mutante-sem-limite: sem config.rateLimit próprio..."`. Revertido o mutante, o teste voltou a
4/4. O teste de inventário faz o que promete.

## 8. CI da branch

Run `45049720867`, head_sha `f3a208c0e1c576b8b353df213656023545cf927f` (exatamente o commit desta passada), 4 de 4
jobs `success` (`backup e restauracao`, `api`, `check`, `ci-ok`), 17:29:26Z–17:32:10Z. Conferido pela API pública
do GitHub sem login (o repositório é público).

## Suíte da API

454→472 testes — rodei a suíte completa (`npm test`, `apps/api`) **duas vezes** na cópia limpa, banco novo nas
duas: **472/472** nas duas execuções. Bate com o que a Vega reportou no commit ("Suite 472/472").

## Pendências (não bloqueiam, valem para depois)

- **Nenhum teste automatizado permanente cobre `/driver-applications/:id/{approve,reject}` no repositório.** Eu
  testei agora por script descartável (não fica no repo); recomendo à Vega criar um arquivo de teste dedicado
  (nos moldes de `admin-user-management.test.ts`) para esta rota não voltar a ficar sem cobertura própria.
- Os quatro achados do Órion (seção dedicada acima) — aguardando o commit de correção para reconferência do delta.
- Não testei o degrau de step-up (2FA) que a correção da Vega vai acrescentar — ainda não existe em `f3a208c`.

## Aprendizado (memória)

- `countOtherActiveOwners` trava TODAS as linhas de dono ativo (não só o alvo) — é isso que torna a desativação/
  troca de papel segura entre ALVOS DIFERENTES sob concorrência; vale testar atacando exatamente essa forma (mesmo
  ator, dois alvos) em vez de só a forma cruzada (dois atores, cada um no alvo do outro), que tem um resultado
  seguro só por efeito colateral de sessão.
- O caminho de `/settings/email` é `/settings/email`, não `/email-settings` — já corrigido no meu harness.
- `/auth/activate` e `/2fa/verify` para quem AINDA NÃO enrolou o 2FA pedem `status: 'enrollment_required'`, que
  tem fluxo PRÓPRIO (token de enrolamento, não o código de 6 dígitos) — tentar verificar com código comum devolve
  `401 challenge_invalid`. Isso não é bug; é meu script que precisa semear o TOTP (`admin_totp` com
  `confirmed_at`) para TODO admin de papel `dono`/`financeiro` antes de simular o login dele.

---

## Delta `e8d1a7c`

**VEREDITO SOBRE `e8d1a7c`: APROVADO.**

**Vale para o commit `e8d1a7c` (SHA completo `e8d1a7c00779e664dbecd1062758c8d6c6e6dd07`), "fix(api): correcoes da
revisao 3g na gestao de usuarios do painel e teste da decisao de candidatura (F07)", por cima de `f3a208c`, mesma
branch `fatia/f07`.** Conferi só o delta (`git diff f3a208c e8d1a7c`), numa cópia limpa nova (`git archive
e8d1a7c`, reaproveitando o `node_modules` da cópia de `f3a208c` — `package-lock.json` não mudou entre os dois
commits, confirmado por `git diff --stat`). Rodado em 22/11/2026 entre 18:10 e 19:05 (horário da máquina).

**Ambiente:** recriei o Postgres na minha faixa (**5481**, dentro de 5480–5489) — o aviso do Atlas sobre a pasta
de dados ter sido removida por falta de disco não bateu com o que encontrei (a pasta `pgdata` da passada anterior,
dentro do MEU diretório de cópia, continuava intacta e subiu normalmente); não investiguei a divergência, só
registro que segui com o que achei funcionando, e recriei os bancos de teste do zero mesmo assim, por disciplina
de cópia limpa. Disco: comecei com ~7,5GB livres (o aviso dizia ~7GB) e terminei a passada com a mesma margem,
sem problema. Tudo derrubado ao fim (API morta, Postgres parado com `pg_ctl stop -m fast`, confirmado por
`netstat` sem LISTENING em 3481/5481).

### 1. `POST /v1/admin/auth/activate` sem diferença de tempo

**Confirmado.** Medi de novo, 40 amostras de cada lado, mesma máquina, mesmas condições da medição anterior.
Antes (`f3a208c`): e-mail existente mediana 2,48 ms, inexistente 1,97 ms (≈25% de diferença). Agora (`e8d1a7c`):
e-mail existente mediana **2,68 ms**, inexistente **2,70 ms** — diferença de ~1%, dentro do ruído, e até invertida
(o caso "existe" saiu uma fração MAIS RÁPIDO que o "não existe" nesta amostra). Bate com a leitura do código: os
dois caminhos agora fazem o MESMO trabalho (1 SELECT + 1 hash + 1 UPDATE, contra um id real ou contra
`DUMMY_ENROLLMENT_ADMIN_ID` quando o e-mail não existe).

### 2. Trocar o papel derruba a sessão do alvo

**Confirmado por teste direto contra a API real.** Sessão do alvo ativa (`GET /me` → 200) antes da troca; dono
troca o papel de `suporte` para `operacao`; a MESMA sessão antiga (mesmo cookie) tenta `GET /me` depois e recebe
**401 `unauthorized` ("Sessão expirada. Faça login novamente.")** — antes (`f3a208c`) essa mesma chamada devolvia
200 com o papel novo, sem exigir login de novo. A suíte do Vega (`admin-user-management.test.ts`) também cobre o
caso oposto, que eu não tinha testado: trocar para o MESMO papel (idempotente) **não** derruba a sessão — faz
sentido, nada de fato mudou.

### 3. Criar/promover para `dono`/`financeiro`, e reativar um dono, exigem senha + TOTP do ATOR

**Confirmado, com as 4 formas (13 casos) contra a API real:**
- Criar `dono` ou `financeiro` sem `code`: **401 `invalid_second_factor`**, nada é criado (confirmei direto no
  banco: zero linha nova). Com `code` errado (`000000`): mesma recusa, mesma ausência de efeito. Com `code`
  certo: `201`.
- Promover alguém de papel normal para `dono` sem `code`: recusado, o papel NÃO muda (confirmei no banco). Com
  `code` certo: `200`. Promover para um papel NÃO sensível (`operacao`) continua só com senha, sem pedir nada de
  TOTP.
- Reativar um `dono` desativado sem `code`: recusado. Com `code` certo: `200`. Reativar um papel normal
  (`suporte`) continua só com senha.
- Rebaixar um `dono` para papel normal, e desativar qualquer um (inclusive um `dono`), continuam só com senha —
  o degrau novo é proporcional ao risco (nascer ou promover para um papel sensível, ou devolver acesso a um
  `dono`), não um step-up genérico em toda mutação.

**Armadilha do meu próprio harness, registrada para a próxima vez:** o anti-replay do TOTP (`admin_totp.last_used_step`,
coluna que confirmei existir ao ler a suíte do Vega) é **por admin**, não por propósito — se o MESMO admin faz
login (que já consome o passo atual do TOTP na verificação do 2FA) e, segundos depois, chama uma mutação que
também pede TOTP, o código do MESMO passo de 30s é rejeitado como reuso. Corrigi gerando o código do **passo
seguinte** (`totpStep(Date.now()) + 1`) para as chamadas de step-up que vêm logo depois de um login — a janela de
tolerância do servidor (±1 passo) aceita.

### 4. Deadlock vira `409 concurrent_update`

**Não consegui forçar isso de ponta a ponta via HTTP** — tentei 4 construções diferentes (3 donos cruzados, mesmo
ator com dois alvos, dois árbitros independentes com atores diferentes, ~160 rodadas no total) e nenhuma produziu
o deadlock pela via HTTP real: nesta máquina, as duas transações raramente ficam presas na janela exata (uma
quase sempre termina — `COMMIT` ou `ROLLBACK` — antes de a outra pedir o lock que falta). Isso é **o mesmo
resultado que eu já tinha relatado na passada anterior** (sem o fix), então a ausência de reprodução não é
evidência de que o fix funciona OU não funciona — só que o timing é raro demais pra forçar pelo HTTP nesta
máquina.

Para não ficar só em "não consegui", fiz duas provas mais diretas:

1. **Prova de que o padrão de lock REALMENTE deadlocka no Postgres:** script com duas conexões cruas (`pg.Client`),
   cada uma trava o PRÓPRIO alvo primeiro (`SELECT ... FOR UPDATE` por id, igual `lockAdminUserById`), depois as
   duas pedem o CONJUNTO INTEIRO de donos ativos ao mesmo tempo (igual `countOtherActiveOwners`) — ordem cruzada
   forçada manualmente, sem depender de timing de HTTP. **Resultado: uma das duas conexões recebeu
   `error.code === '40P01'` ("deadlock detected"), confirmado.** Isto prova que o risco é real neste schema, não
   teórico.
2. **Leitura do código:** `withLockedTarget` (em `admin-user-service.ts`) agora tem um `catch` que confere
   `err.code === '40P01'` e devolve `{ kind: 'retry' }`; a rota (`admin-user-route.ts`,
   `sendMutationOutcome`) mapeia `case 'retry'` para `409` com `{ code: 'concurrent_update' }`. A suíte do Vega
   tem um teste que injeta um erro `40P01` sintético na 3ª query da transação (via um `pool` decorado que só
   troca o comportamento da conexão usada pela mutação, nunca a lógica de negócio) e confirma que
   `deactivateAdminUser` devolve exatamente `{ kind: 'retry' }`, sem alterar nada no banco — roda dentro da suíte
   472→494 que confirmei duas vezes (ver abaixo).

**Conclusão honesta:** não vi o 500 virar 409 pela janela HTTP real (porque nunca vi o 500 acontecer de novo,
nesta máquina, nem antes nem depois do fix) — mas tenho prova de que (a) o cenário de deadlock é genuíno neste
padrão de lock, e (b) o código agora captura exatamente esse código de erro e o traduz para 409, com um teste de
unidade que força essa travessia artificialmente. Isso é mais forte do que "não reproduzi" sozinho, mas ainda é
diferente de "vi o 500 sumir e o 409 aparecer no lugar, pela mesma chamada HTTP".

### 5. Teste novo e suíte inteira

`admin-driver-application-decision.test.ts` (novo, 12 testes) — roda dentro da suíte completa, que agora tem
**494 testes** (era 472). Rodei a suíte completa (`npm test`, `apps/api`) **DUAS vezes**, bancos novos nas duas,
na cópia limpa: **494/494 nas duas**.

**Imprevisto que vale registrar:** entre a 1ª e a 2ª rodada, eu tinha editado o `.env` da minha cópia
(`GLOBAL_RATE_LIMIT_MAX=100000`, pra destravar um dos meus próprios scripts de depuração do item 4, que estava
caindo em `429` do limite GLOBAL padrão de 100/min). A 2ª rodada, rodada DEPOIS dessa edição, saiu com **6
falhas** — todas em testes que dependem do limite global PADRÃO (100/min) realmente apertar em 100 pedidos
(`ip-rate-limits.test.ts`, os casos "A1" e "F01-M1"). Não é regressão: é o `.env` da minha cópia (lido pelo
processo `npm test` no MOMENTO em que ele inicia) carregando o meu override por cima do valor que esses testes
específicos esperam. Revertida a variável, rodei uma 3ª vez: **494/494, zero falha**. A 1ª rodada (antes da
edição) já tinha saído limpa (494/494) — então tenho duas rodadas limpas (1ª e 3ª), e sei exatamente por que a do
meio não contava. **Lição:** quando o `.env` da cópia precisar de um valor alto só para um script manual, isolar
isso num arquivo de ambiente SEPARADO do `.env` que a suíte lê, ou rodar a suíte ANTES de qualquer edição —
nunca depois, mesmo que "seja só pra um teste manual".

### CI de `e8d1a7c`

Run `45054037479`, head_sha `e8d1a7c00779e664dbecd1062758c8d6c6e6dd07` (exatamente este commit), **4 de 4 jobs
`success`** (`api`, `check`, `backup e restauracao`, `ci-ok`), 18:15:30Z–18:18:31Z. Conferido pela API pública do
GitHub, sem login.

### Resumo do delta

| Ponto | Resultado |
|---|---|
| 1. Oráculo de tempo em `/auth/activate` | **Corrigido e confirmado** (medição antes/depois). |
| 2. Troca de papel derruba sessão do alvo | **Corrigido e confirmado** (teste direto). |
| 3. Senha + TOTP para dono/financeiro | **Corrigido e confirmado** (13 casos, API real). |
| 4. Deadlock → `409 concurrent_update` | **Código corrigido, confirmado por leitura + teste de unidade da Vega + prova de que o padrão de lock deadlocka de verdade no Postgres; não reproduzido de ponta a ponta via HTTP** (nem antes, nem depois — mesma limitação de timing das duas passadas). |
| 5. `admin-driver-application-decision.test.ts` + suíte inteira | **Verde.** 494/494 em duas rodadas limpas (a 2ª rodada "sujou" foi erro do meu próprio `.env`, não do código). |
| CI da branch | **Verde.** |
