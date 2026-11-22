# Veredito da Íris — F07b (tela de usuários e papéis do painel)

**VEREDITO FINAL: APROVADO, sobre `bfba646` (F07b) + `ef181bf` (fix do 403).** Ver a seção "Reconferência", ao
final, para a prova da correção. O veredito original abaixo (REPROVADO, só sobre `bfba646`) continua valendo como
registro do achado e de tudo mais que foi provado na primeira passada — nada daquilo mudou.

---

## Veredito original (22/11/2026) — REPROVADO

**Vale para o commit `bfba646` ("feat(admin): tela de usuarios e papeis do painel, ativacao do primeiro acesso e
validadores falha-fechado (F07b)"), ponta da branch `fatia/f07b`**, testado numa cópia limpa (`git clone --local`
+ `git merge --no-ff origin/fatia/f07b`) sobre `main` no SHA `4ae190b` (que já tem o backend da F07, `7687c00`).
Merge sem nenhum conflito (29 arquivos, só `apps/admin/`). Rodado em 22/11/2026, tarde/noite (horário da máquina).

**Ambiente:** Postgres 18 próprio na porta **5481** (dentro de 5480–5489), API real (`node --import tsx
src/server.ts`) em `127.0.0.1:4610`, SPA do admin real (`vite`) em `localhost:4620` com `VITE_API_MODE=http` —
nunca mock. Banco migrado com credencial dona (`MIGRATION_DATABASE_URL`) e a API rodando com o papel restrito
`vuumbora_api` (login+senha concedidos manualmente, já que a migração 0012 cria o papel `NOLOGIN` de propósito).
Contas de admin de teste criadas no banco descartável com autorização do dono (22/11/2026). Tudo pela TELA DE
VERDADE no Chromium (Playwright), exceto onde o relatório diz explicitamente "fixture de SQL" ou "chamada crua".
Ambiente inteiro derrubado ao final (API, vite, Postgres da 5481 parado e `pgdata` apagado) — nada ficou pra trás.

---

## Por que reprova: `password_invalid` derruba a sessão inteira em vez de mostrar "Senha incorreta"

Em **qualquer** ação de reautenticação da tela de Usuários (Criar usuário, Desativar, Reativar, Trocar papel), se
a pessoa digitar a **própria senha errada por engano**, o painel a desloga na hora — perde a sessão inteira,
volta pro `/login` — em vez de mostrar "Senha incorreta" no campo e deixar tentar de novo, que é o comportamento
documentado e que os outros diálogos do mesmo papel (e-mail, 2FA) já têm.

**Causa raiz, confirmada por log de rede ao vivo:**
`apps/api/src/routes/admin-user-route.ts:80-81` manda **HTTP 401** para `password_invalid`:
```
case 'password_invalid':
  reply.code(401).send({ ok: false, error: { code: 'password_invalid', message: 'Senha incorreta.' } });
```
Mas o `apps/admin/src/api/client.ts` (o `mapStatusToError` que o F07b herdou e não mudou nesta parte) só reconhece
`password_invalid` em **403**:
```
if (status === 403 && err?.code === 'password_invalid') return { kind: 'password_invalid' };
...
if (status === 401) return { kind: 'unauthorized' };   // <- 401 cai aqui
```
Um 401 que não é `invalid_second_factor` nem `challenge_invalid` vira `unauthorized` genérico, e isso dispara
`clearCsrfToken()` + todos os `onUnauthorized` listeners — o mesmo gatilho de "sessão expirou", que desloga a UI
inteira. Confirmei a cadeia completa ao vivo (dono2, senha errada de propósito num "Desativar"):
```
[req] POST /v1/admin/users/<id>/deactivate
[res] 401 {"ok":false,"error":{"code":"password_invalid","message":"Senha incorreta."}}
[nav] http://localhost:4620/login
```
Screenshot do estado final: `shots/debug-423-step1.png` equivalente — tela de login, sessão perdida.

**Por que isto é uma reimplementação divergente, não um caso novo:** o restante do painel (e-mail, 2FA) usa
`sendFactorFailure`, em `apps/api/src/routes/admin-auth-http.ts:119-121`, que manda **403** pro mesmíssimo
`password_invalid`. O `admin-user-route.ts` tem a SUA PRÓPRIA função `sendStepUpFailure` — necessária porque
`account_locked` aqui precisa ser **423** (não 429, decisão documentada no próprio `client.ts`) — mas ao
reescrever o switch inteiro, `password_invalid` saiu com o código errado por engano. Todos os OUTROS casos desse
switch (`account_locked`→423, `invalid_code`→401, `two_factor_locked`→429, `two_factor_unavailable`→503,
`two_factor_not_enrolled`→409) batem certinho com o que `client.ts` espera — conferi um por um. Só este.

**O teste automatizado do backend não pega isto porque ele TESTA o valor errado como se fosse o certo:**
`apps/api/test/admin-user-management.test.ts:93-97`:
```js
test('senha do ator errada: 401 password_invalid; sem CSRF: 403', async () => {
  ...
  assert.equal(wrongPassword.status, 401, ...);
```
CI verde (4/4, `ci-ok`/`api`/`backup`/`check`, run `45056719623`) não detecta nada porque o teste do backend
confirma exatamente o 401 que está errado — ele nunca verifica o que o FRONTEND faz com esse status. É o mesmo
padrão de gap que a passada 9 já tinha registrado para esta rota (nunca teve teste próprio até a F07): unidade
verde não é o mesmo que integração correta — só um teste pela TELA DE VERDADE, como este, pega a divergência.

**Impacto:** 100% reprodutível, não é uma corrida nem um caso raro — qualquer erro de digitação na PRÓPRIA senha
durante uma ação rotineira de gestão de usuários desloga o dono do painel inteiro. Não é falha de segurança (não
vaza nada, não permite bypass), mas quebra o contrato de UX que o resto do painel já respeita e que o comentário
do próprio `ActorPasswordFields.tsx` promete ("senha errada apaga só a senha").

**Para corrigir (Vega):**
1. `apps/api/src/routes/admin-user-route.ts:81` — trocar `reply.code(401)` por `reply.code(403)` no case
   `password_invalid` de `sendStepUpFailure`.
2. `apps/api/test/admin-user-management.test.ts:96` — trocar o `assert.equal(wrongPassword.status, 401, ...)`
   para `403` (a asserção do CSRF ausente na mesma linha abaixo já está certa, é 403).
3. Recomendo (não bloqueia): considerar fazer `admin-user-route.ts` reutilizar `sendFactorFailure` de
   `admin-auth-http.ts` para os casos que NÃO divergem (todos, exceto `account_locked`), só sobrepondo o 423 —
   assim o próximo campo novo não repete esta reimplementação paralela.
4. Teste de regressão: um teste que bate em QUALQUER rota de step-up desta tela com senha errada e afirma
   `status === 403` (não 401) — é a forma de nunca mais deixar este valor divergir do `client.ts` sem barulho.

---

## O que foi provado pela tela de verdade (itens do pedido)

**1. 423 `account_locked` e 400 `activation_token_invalid`.**
- 400: reenviei o token de ativação do `suporte1` (já consumido) em `/activate` → "Link de ativação inválido,
  vencido ou já usado..." (`shots/12-activation-token-invalid.png`).
- 423: acumulei falhas de senha por chamada crua (fora do app, pra não cair no bug acima) e completei a prova
  na TELA — diálogo mostrou "Aguarde antes de tentar de novo... Tente de novo em 8 s", sessão intacta, botão
  desabilitado (`shots/13-account-locked-mutation.png`). Mesma mensagem/cor do login, como documentado.

**2. Os quatro conflitos.**
- `email_taken`: criar usuário com e-mail do `suporte1` → erro inline no campo, sem toast genérico
  (`shots/04-email-taken.png`).
- `last_owner`: com 2 donos ativos, desativei um, depois tentei desativar/rebaixar o ÚLTIMO dono ativo (a si
  mesmo) → recusado nos dois casos (`shots/09-last-owner-deactivate.png`, `10-last-owner-role-change.png`).
- `two_factor_not_enrolled`: só alcançável de verdade via fixture de SQL no meu banco descartável — um dono
  SEMPRE tem TOTP confirmado pra conseguir logar (login força `enrollment_required` quando o papel exige 2FA e
  não há confirmação), então não existe caminho 100% pela UI pra um dono autenticado ficar "sem 2FA". Com sessão
  já criada pela UI, zerei `admin_totp.confirmed_at` do ator (dono1) via SQL, tentei "Criar usuário" (papel Dono)
  → 409 com a mensagem certa, sessão continuou de pé (confirmado com F5), e restaurei o registro depois
  (`shots/15-two-factor-not-enrolled.png`). Documentado como fixture, não como fluxo 100% de tela.
- `concurrent_update`: **não reproduzi ao vivo nesta passada.** Duas origens possíveis no código
  (`admin-user-service.ts`): (a) deadlock `40P01` na trava de donos — já tem teste automatizado dedicado
  (`admin-user-management.test.ts:369-421`, injeta o erro e confirma `{kind:'retry'}`) e bate com a prova de
  SQL direto já registrada na passada 9; não refiz essa prova hoje. (b) o papel do alvo mudar entre a leitura
  do gate e o lock de `reactivateAdminUser` — tentei isolar essa janela com DUAS ABAS reais (mesma sessão de
  dono2): aba A reativando um alvo `suporte`, aba B promovendo o MESMO alvo a `dono` ao mesmo tempo. Em
  **22 rodadas** (12 disparando simultâneo, 10 dando a A uma saída na frente), o resultado foi SEMPRE o mesmo,
  nunca o `concurrent_update`: a troca de papel (aba B) sempre comita antes mesmo da PRIMEIRA leitura de
  `current.role` da aba A, então o gate de A já vê o papel novo (`dono`) e rejeita por `invalid_second_factor`
  (nenhum código foi pedido pela tela, que decidiu com o papel antigo) — um desfecho diferente, também seguro
  (nada muda, nenhuma sessão vaza), mas não o banner de "tente de novo" pedido. Não tem teste automatizado para
  ESTE caminho específico (busquei por `retry`/`concurrent_update` no arquivo de teste: só a ocorrência do
  deadlock). Registro como pendência, não acho que bloqueia sozinho — mas é achado novo de método.

**3. Primeiro acesso via `/activate`.**
- `suporte1` (papel sem 2FA): ativou e caiu direto em "Conta ativada", sem nenhum passo de 2FA
  (`shots/05-suporte1-ativada.png`). Logou só com senha depois.
- `dono2` (papel com 2FA obrigatório): ativou → fase "Senha definida. Entrando..." (login automático, sem pedir
  e-mail/senha de novo) → pulou DIRETO pro QR (não pediu o código de ativação de novo — o `enrollmentToken` já
  veio da resposta de `/activate`, consumido pelo `EnrollmentStep` com `initialEnrollmentToken`) → QR real
  (`otpauthUri` de verdade, `data-testid="totp-secret"` com a chave de verdade) → confirmei com o código TOTP
  calculado a partir do MESMO segredo mostrado na tela → sessão aceita, caiu no painel
  (`shots/07-dono2-qr-pos-activate.png`, `08-dono2-dashboard.png`).

**4. Criar/promover/reativar com a regra de step-up certa.**
Matriz toda testada com dono2 real: desativar NUNCA pede código (nem pra alvo `dono` — confirmei que o campo
TOTP não aparece), reativar só pede código quando o alvo JÁ é `dono`, trocar papel só pede código quando o NOVO
papel é `dono`/`financeiro`. Promovi `operacao1` → `financeiro` com senha+TOTP de dono2; desativei/reativei o
mesmo usuário só com senha. Token de ativação apareceu, copiei o texto, fechei o painel — não existe endpoint
pra "ver de novo" (confirmado por leitura, não tentei forçar reexibição, não é técnica de ataque).

**5. Validadores falha-fechado.**
Rodei as 13 funções de parsing REAIS do repositório (`adminUserResponses`, `driverApplicationResponses`,
`emailSettingsResponses`, `twoFactorResponses`) contra 16 formatos de lixo cada (null, array no lugar de objeto,
campo com tipo errado, enum desconhecido, envelope inteiro por engano etc.) — **208 combinações, 208 rejeitadas
com `{ok:false}`, zero aceitas indevidamente, zero exceções.** Script: `validators-fail-closed.mjs` (import
direto dos módulos reais via `tsx`, não uma reimplementação). Complementei com UMA injeção ao vivo: interceptei
a resposta real de `GET /v1/admin/users` e removi o campo `items` — a tela mostrou "Este painel e a API estão em
versões diferentes" (erro seguro, sem lixo nem crash), não a lista vazia nem um `undefined.map()`
(`shots/16-contract-mismatch-live.png`). Nota de polimento (não bloqueia): o texto reaproveita a cópia do login
("Não foi possível entrar") para uma falha de CARREGAR lista — mensagem um pouco deslocada, mas não incorreta.

**6. Só o dono vê "Usuários".**
Confirmado nos dois sentidos: dono1 e dono2 veem o item no menu; `suporte1` (não-dono) não vê o item, e
navegação direta a `/users` cai em "Você não tem acesso a esta área" (`shots/06-suporte1-no-access.png`,
NoAccessPage), sem nunca expor a lista. O 403 real do servidor não foi forçado à parte (seria técnica de ataque
num repositório público) — a proteção de verdade está documentada no código (`requireAdminRole('dono')`) e o
gate do frontend é só usabilidade, como o próprio comentário do código diz.

---

## Pendências (não bloqueiam, registradas para a próxima passada)

- `concurrent_update` (caminho b, acima): não reproduzido ao vivo; sem teste automatizado dedicado. Vale uma
  rodada com mais tentativas ou um ajuste de timing (ex.: atraso proposital no commit da troca de papel só em
  teste) se a equipe quiser fechar essa lacuna.
- Mensagem de `contract_mismatch` na lista de usuários reaproveita a cópia do login ("Não foi possível entrar")
  — troca de texto cosmética, não funcional.

## Aprendizado para a memória

- `password_invalid` em `admin-user-route.ts` manda 401 (devia ser 403, como todo o resto do painel) — achado só
  porque o teste bateu a TELA DE VERDADE contra o status HTTP, não só o `code` do corpo. Suite verde + leitura de
  código não bastam quando o contrato depende do PAR status+code, não só do code.
- `two_factor_not_enrolled` (ator) é estruturalmente inalcançável por um fluxo 100% de UI: dono SEMPRE enrola
  2FA pra conseguir logar. Única forma honesta de testar é fixture de SQL num banco descartável, com sessão já
  criada pela UI antes da fixture — documentar isso evita a próxima passada "perder" tempo tentando achar um
  caminho de UI que não existe.
- A corrida de `reactivate` (papel do alvo mudando entre a leitura do gate e o lock) não produz
  `concurrent_update` na prática — a troca de papel concorrente tende a vencer ANTES da primeira leitura da
  reativação, resultando em `invalid_second_factor` em vez de `retry`. 22/22 rodadas, duas estratégias de
  disparo. Vale registrar pra não reinventar a mesma tentativa do zero.

---

## Reconferência (22/11/2026, mesma noite) — APROVADO sobre `bfba646` + `ef181bf`

**Pedido do Atlas:** conferir o CI da branch `fatia/f07-senha403-v2` (ponta `ef181bf`, sobre `main` em `670b120`)
e reconfirmar, numa cópia limpa de `main` (`394a0d6`) + `fatia/f07-senha403-v2` + `fatia/f07b`, que as quatro
rotas de step-up da tela de Usuários (criar, desativar, reativar, trocar papel) mostram "Senha incorreta" com
sessão intacta ao errar a senha, e 423 tratado na tela ao insistir até a espera.

**CI da branch do fix:** conferido via API pública do GitHub (sem login, run `45075443445`) — **verde, 4/4**:
`ci-ok`, `check (fronteiras, contexto docker, typecheck)`, `api (build, migrações e testes contra Postgres e
Redis reais)`, `backup e restauração (ensaio com contagem de linhas)`, todos `completed`/`success`.

**Cópia limpa montada:** `git clone --local` + `git checkout main` (`394a0d6`) + `git merge --no-ff
origin/fatia/f07-senha403-v2` (`ef181bf`) + `git merge --no-ff origin/fatia/f07b` (`bfba646`) — as duas fusões
sem NENHUM conflito (a primeira toca `admin-user-route.ts`, o teste e `docs/contrato-admin-usuarios.md`; a
segunda só `apps/admin/`). Conferi o código da correção: `admin-user-route.ts:80-81` agora manda `reply.code(403)`
pro case `password_invalid`, com um comentário citando esta QA. O teste
(`admin-user-management.test.ts:93-108`) agora afirma `403` (não mais `401`) e bate as QUATRO rotas de step-up
(criar, desativar, reativar, trocar papel), cada uma com **um dono novo**, exatamente para não cair na espera
progressiva entre uma rota e a próxima — a mesma armadilha que eu teria se reaproveitasse o mesmo ator.

**Suite oficial rodada por mim, de verdade, nesta cópia (não só confiei no CI):** Postgres 18 próprio (porta
**5482**, dentro de 5480–5489). Na primeira tentativa usei `DATABASE_URL` como o papel restrito `vuumbora_api`
(prática certa pra RODAR a API) e a suite toda falhou com `permissão negada ao definir parâmetro
"session_replication_role"` (42501) — **armadilha minha, não bug do produto**: a suite oficial espera
`DATABASE_URL` com privilégio de dono (ela mesma migra e faz `TRUNCATE`/`SET LOCAL session_replication_role`
nos hooks de reset via `legal-kit.ts`), diferente de rodar o SERVIDOR manualmente (aí sim o certo é o papel
restrito). Corrigido para `DATABASE_URL=MIGRATION_DATABASE_URL=postgres://postgres@.../..._test`, a suite
completa rodou limpa: **494 testes, 494 passaram, 0 falharam, 0 cancelados** (`admin-user-management.test.ts`
sozinho: 24/24, incluindo a asserção `403` nova). Script: `npm test` dentro de `apps/api`, log completo salvo
durante a sessão (não anexado aqui, mas a contagem acima é a linha de resumo inteira do `node:test`, sem corte).

**Prova pela tela de verdade, contra a API e o Postgres reais (banco separado do da suite, `vuumbora_f07b2_manual`,
pra não misturar dado da suíte com o manual):** logado como um dono novo (`dono1`, ativação por `create-admin` +
enrolamento por QR real, mesma mecânica da primeira passada), abri CADA um dos quatro diálogos contra alvos
reais (um usuário novo pra "criar", um ativo pra "desativar", um já desativado pra "reativar", um de papel
`operação` pra "trocar papel", todos papéis NORMAIS — sem TOTP envolvido, pra isolar só o comportamento de
senha). Em TODOS os quatro:
1. Senha errada → **"Senha incorreta. Digite a senha atual da sua conta."** inline, vermelho, diálogo continua
   aberto, **sessão intacta** (confirmado pela URL continuar em `/users` e pelo próprio diálogo seguir
   funcional — nenhum redirecionamento pro `/login`).
2. Continuando a errar (a espera progressiva soma; entre 1 e 4 tentativas extras dependendo do tempo real
   gasto em cada rodada) → **423 "Aguarde antes de tentar de novo... A conta não está bloqueada. Tente de novo
   em N s"**, mesma mensagem/cor de sempre, **sessão intacta** de novo.

Screenshots da reconferência (8 no total, 2 por rota): `1-criar-1-senha-incorreta.png`, `1-criar-2-account-
locked.png`, `2-desativar-{1,2}-*.png`, `3-reativar-{1,2}-*.png`, `4-trocar-papel-{1,2}-*.png` (ficaram no
scratchpad da sessão, não commitados — o achado já está descrito aqui e no diff da correção).

**O que isto NÃO prova (sendo explícita sobre o limite):** não refiz hoje as outras verificações do veredito
original (423/400/conflitos/`/activate`/matriz de step-up/validadores/nav) — elas não tinham motivo pra quebrar
(a correção é uma troca de status HTTP isolada num `case`, sem tocar em mais nada), e o merge de `fatia/f07b`
continuou idêntico ao de antes (mesmo SHA `bfba646`, mesmo diff). Não refiz a tentativa de `concurrent_update`
nem a fixture de `two_factor_not_enrolled` — seguem como pendência/achado de método, documentados acima, sem
relação com esta correção.

**Ambiente derrubado ao final:** API e vite mortos, os dois bancos (`..._test` da suite e `..._manual` do
browser) apagados, Postgres da 5482 parado e `pgdata` removido, clone do scratchpad apagado — portas 4611/4621/
5482 confirmadas livres depois.

**VEREDITO FINAL: APROVADO.** O achado que reprovou a primeira passada está corrigido, provado tanto pela suíte
oficial (rodada por mim, 494/494) quanto pela tela de verdade nas quatro rotas, sem nenhuma regressão visível.
As pendências registradas acima (`concurrent_update` sem reprodução ao vivo, cosmético do `contract_mismatch`)
continuam de pé, mas não bloqueiam — são as mesmas da primeira passada, não guardam relação com este fix.
