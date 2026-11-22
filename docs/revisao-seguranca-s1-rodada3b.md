# Revisão de segurança S1 — rodada 3b (Órion, 22/11/2026)

Escopo: código COMMITADO em `HEAD d75b9b9` (commits 16c147a e d75b9b9, mais o cliente `packages/api-client/src/identity`,
`apps/admin/src/api/authResponses.ts` e os `metro.config.js`). Rodadas anteriores: `docs/revisao-seguranca-s1.md`,
`...-rodada2.md`, `...-rodada3.md`.

Severidades: CRÍTICO = antes de qualquer deploy; ALTO = antes de abrir ao público; MÉDIO = em breve; BAIXO = melhoria.

> Nota do Atlas: a Órion não pôde gravar este arquivo (regra do ambiente dela) e devolveu o texto na mensagem; salvo aqui sem
> edição de conteúdo. As correções dos achados estão registradas no `PROGRESSO.md`.

Método e honestidade sobre a prova: leitura do código e da migração. Nenhum banco foi usado e eu NÃO executei a suíte de testes
(os 323/323 da Vega e o CI não foram reproduzidos por mim). Medi três coisas com sondas descartáveis fora do repositório,
usando o módulo REAL: (1) o `BcryptPool` com bcrypt de custo 12; (2) o `metro.config.js` com combinações de variáveis de
ambiente; (3) o contador por rota do `@fastify/rate-limit` 10.3.0, lido no código-fonte.

## Veredito

**0 críticos · 0 altos · 4 médios · 9 baixos.**

Reclassificação pedida:
- **A-1: PARCIAL.** CPU e laço de eventos resolvidos (o `/healthz` e a pista do admin ficam livres). A pista `app` continua
  sufocável por poucas dezenas de IPs e o titular não tem prioridade (M-1).
- **B-1: RESOLVIDO.**
- **M-3 (da rodada 3): PARCIAL.** Banco e API estão sólidos. O cliente real ainda não manda as versões exibidas, então o ponto a
  ponto não existe (M-2 abaixo). O gatilho de reaceite não está ligado a nenhuma rota (B-2 abaixo).

Liberação: a API pode seguir para produção FECHADA. Antes de divulgar o cadastro: M-2 (sem ele o cadastro real responde 400) e
M-3 (a build de loja pode sair com telas de desenvolvimento e identidade simulada). Para M-1, ou se corrige, ou o dono registra
o risco com o número abaixo.

---

## MÉDIO

### M-1. A pista de bcrypt dos apps (A-1 residual) ainda é sufocável por poucos IPs, e o titular perde quando o atacante mantém a fila cheia
- Onde: `apps/api/src/lib/bcrypt-pool.ts:110-112` (`saturated`), `:132-152` (`submit`: fila FIFO sem justiça por origem),
  `:214-216` (padrão de 1 ou 2 threads), `:222-224` (fila de 8). Limites por IP: `routes/auth-route.ts:56` mais o global de
  `app.ts:143-150`.
- O que está resolvido: o bcrypt saiu da thread principal. A sonda confirmou que um pool criado e NÃO fechado deixa o processo
  sair sozinho em 166 ms (ref/unref corretos).
- Medido: com 2 threads, duas comparações de custo 12 em paralelo levaram 636 ms (≈ 3,1 por segundo). Atacante a ≈ 6
  requisições por segundo durante 10 s: 46 atendidas e 13 recusadas. Um titular que tentou 1 vez a cada 500 ms teve 8
  atendidas e 12 recusadas (**60% de recusa**). A fila FIFO não distingue quem chegou.
- Custo do atacante (estimativa): quatro rotas gastam bcrypt (register, login, verify-email, reset-password). Cada rota tem
  contador próprio de 30 por 15 min por balde (confirmei em `node_modules/@fastify/rate-limit/index.js:146-147` e
  `store/LocalStore.js:46-48`: `child()` cria um store novo por rota). São ≈ 0,13 requisição por segundo por IPv4. Para manter
  2,3 a 4,6 por segundo bastam de ~17 a ~35 endereços IPv4, conforme a CPU de produção. Com IPv6 o balde é o /64
  (`lib/ip-bucket.ts:49-62`), então um único /48 gratuito dá 65 536 baldes e UMA máquina basta (só vale se o host da API tiver
  AAAA; não sei).
- Variar o identificador a cada tentativa derrota os limites por par: o do login e o novo `reserveCodeCheck`
  (`account-recovery-service.ts:80-89`). Isto já estava dito no comentário de `auth-config.ts:56-60`.
- Efeito: login, cadastro, verificação e redefinição respondem 503 `server_busy` para todos. Sessões abertas, renovação (usa
  sha256, não bcrypt), `/healthz` e o login do admin seguem. Também é possível sufocar a pista do admin (1 thread, fila de 4:
  `:229-230`): o dono não consegue entrar nem reautenticar enquanto durar.
- O 503 NÃO cria oráculo. A recusa por capacidade é a primeira linha de login, cadastro, verificação e redefinição
  (`identity-service.ts:166,262`; `account-recovery-service.ts:163,182`), antes de qualquer consulta de conta. O compare roda
  sempre, com hash real ou descartável (`:282`; `:168`), então a recusa cai no mesmo ponto exista a conta ou não. Para o titular
  em particular, os limites por par incluem o balde de IP do titular, então o atacante não consegue esgotá-los. A exceção é o
  mesmo IPv4 compartilhado (CGNAT), cenário de baixa probabilidade.
- Correção: (1) justiça por origem na fila: no máximo 1 ou 2 vagas de espera por balde de IP, e para essa chave agregar IPv6
  em /48; (2) o mesmo balde /48 nos limites por rota (era o ponto 4 do A-1 da rodada 3 e segue aberto); (3) se o dono aceitar o
  risco, registrar em `decisoes-do-dono.md` com o número (de ~17 a ~35 IPv4 ou 1 /48 mantêm a pista cheia).

### M-2. O cliente real não envia as versões exibidas: o cadastro real daria 400, e o cliente nem tem as portas de reaceite
- Onde: `packages/api-client/src/identity/http-adapter.ts:143-155` monta o corpo do cadastro com `termsAccepted` e
  `privacyAccepted`, sem `termsVersion` nem `privacyVersion`. A API exige as duas (`apps/api/src/domain/auth.ts:36-37`), então
  responde 400 `consent_required`. `client.ts:56-74` não tem `legalCurrent`, `acceptConsents`, nem `consent` em `me`
  (`http-adapter.ts:223-229` descarta o campo). `errors.ts:19-27` já mapeia `consent_required`, mas nada do 409
  `consent_outdated` com `error.current`.
- Cenário: o mock passa em todos os testes e a API real recusa todo cadastro. Pior: se alguém "consertar" mandando uma versão
  fixa do build (variável de ambiente ou constante), o aceite volta a ser rótulo e não "o que a pessoa viu", que era o ponto do
  M-3.
- Correção: a versão enviada tem de vir do corpo de `GET /v1/legal/current` que a tela RENDERIZOU. Tratar o 409
  `consent_outdated` recarregando `error.current`. Acrescentar as portas `legal/current` e `consents` e o `consent` de `me`.
  Teste do adaptador http contra o contrato (hoje só o mock é provado).

### M-3. O perfil de build abre as telas de desenvolvimento por omissão, e nada garante que identidade simulada fique fora da build de loja
- Onde: `apps/passenger/metro.config.js:28-35` e `apps/driver/metro.config.js` (idênticos, `diff` sem saída). Sem
  `VUUMBORA_BUILD_PROFILE`, o perfil é `development`, salvo `EAS_BUILD_PROFILE === 'production'`. O regex bloqueia só
  `catalogo.tsx` e `mapbox-check(.web).tsx` pelo nome (`:38-45`).
- Medido (carreguei o `metro.config.js` real, com controle positivo e controle de valor inválido):

  | Entrada | Telas de dev ficam FORA? |
  |---|---|
  | `VUUMBORA_BUILD_PROFILE=production` | sim (controle positivo) |
  | `EAS_BUILD_PROFILE=production` | sim |
  | sem variável, `NODE_ENV=production` | **não** |
  | `EAS_BUILD_PROFILE=release` (qualquer outro nome) | **não** |
  | variável vazia + `NODE_ENV=production` | **não** |
  | `VUUMBORA_BUILD_PROFILE=preview` | não |
  | `VUUMBORA_BUILD_PROFILE=prod` (digitado errado) | aborta (certo) |
- Não existe `eas.json`, nem passo de build mobile em `.github/workflows/ci.yml`, nem script `export` nos `package.json` dos
  apps. Nada define o perfil. A própria memória da Lyra diz que `EAS_BUILD_PROFILE=production` "NÃO foi provado". O admin faz
  o contrário: `apps/admin/vite.config.ts:11-24` aborta o build de produção em modo mock.
- Não verifiquei se o bundle de release do React Native define `NODE_ENV=production` (provável, não provado). Se define, o caso
  "sem variável" é exatamente o de uma build de loja local.
- O que vai junto, no HEAD: `apps/passenger/src/session/SessionProvider.tsx` e `apps/driver/src/session/SessionProvider.tsx`
  são sessão de DEMONSTRAÇÃO ("não autentica ninguém": `signInWithMock` abre a sessão sem credencial). O blockList não os
  alcança. A guarda de rota é só do cliente, então não vaza dado (a API autoriza), mas a build de loja de HEAD não tem login
  real. Na árvore de trabalho (não commitada, não revisada) há `apps/passenger/src/identity/identityClient.ts` com
  `IDENTITY_MODE = 'mock'` fixo e código de e-mail sempre `123456`.
- Impacto das duas telas de dev: baixo (sem segredo nem ação privilegiada). O risco é a identidade simulada e o código de
  e-mail fixo irem para a loja.
- Correção: (1) padrão seguro: sem variável, derivar de `NODE_ENV` (production = production); perfil `development` com
  `NODE_ENV=production` aborta; sem perfil em build não interativa aborta, como o admin; (2) bloquear por convenção de pasta ou
  nome (ex.: `app/(dev)/`) em vez de lista fixa de 3 arquivos; (3) guarda como a do admin: build `production` com
  `IDENTITY_MODE === 'mock'` aborta; (4) `eas.json` com perfis explícitos e um teste de fumaça que procura uma string-canário
  no export; (5) decidir se `preview` esconde as telas de dev.

### M-4. O `SessionManager` apaga a sessão por STATUS HTTP, sem olhar o `code`: qualquer proxy ou WAF vira logout em massa
- Onde: `session-manager.ts:85-87` (`isDefinitiveRefreshRejection`: `unauthorized`, `validation` ou `forbidden`) e `:182-185`
  (`clearLocal('session_expired')`, que apaga os tokens do armazenamento e ainda FABRICA o código:
  `result.error.code ?? 'invalid_refresh_token'`). `errors.ts:45-56` converte 400, 401 e 403 em `kind` pelo status, com ou sem
  envelope. O comentário `session-manager.ts:12-14` promete "401 `invalid_refresh_token`, ou 400/403", mas o código não confere
  o `code`.
- Cenário: um middleware do Traefik, regra de WAF ou CDN passa a responder 401 ou 403 em `/v1/auth/refresh` (mudança de
  configuração, desafio anti-bot, IP marcado). Cada instalação que renova nesse intervalo apaga a própria sessão, mesmo com o
  refresh token ainda válido no servidor. Todos precisam fazer login de novo, e o login é limitado por IP (30 por 15 min por
  rota, inclusive atrás de CGNAT). Um erro de proxy vira queda do produto.
- Correção: só tratar como definitivo o 401 cujo envelope traz `invalid_refresh_token`. 400 e 403 com `code` do contrato idem.
  Sem `code` reconhecido (resposta de intermediário) é transitório e entra no descanso de 5 a 60 s. Não fabricar o `code`.
- O que está certo e conferi: voo único (`:192-204`), época contra troca de conta (`:173`, `:207`, `:223`, `:236`), gravar antes
  de liberar os que esperam (`:175-179`), fila única de escritas (`:127-131`), o descanso nunca vira NaN (`errors.ts:36-43` e
  `:70-72` só aceitam número finito e `Retry-After` só em 429), clamp de 5 a 60 s (`:81-82,187`).

---

## BAIXO

### B-1. Atraso e contador consumidos sem uso quando a pista enche na janela entre a checagem e o bcrypt (corrida de `assertAppBcryptCapacity`)
- Onde: login `identity-service.ts:262` (checa) → `:268-274` (grava a falha do par: `identity-repository.ts:325-328`) → `:282`
  (`compare` pode recusar). Verificação `account-recovery-service.ts:163-168`. Redefinição `:182-185`. Cadastro
  `identity-service.ts:166-175` (já consumiu o teto global de e-mails). Admin `admin-auth-service.ts:132-137`.
- A janela é de pelo menos 1 ida e volta ao banco. O bcrypt não é ultrapassado nunca: a chamada recusa (`submit`, `:144-148`).
  O custo é no contador: a falha do par já foi gravada, então o titular que cai na janela leva 1 s, 2 s, 4 s de espera por uma
  comparação que não rodou, e passa a receber 429 em vez de 503. Pequeno e se autocura no login certo. É o mesmo desenho que a
  rodada 3 pediu (recusar antes de reservar), apenas incompleto.
- Correção: devolver (desfazer) a reserva quando o erro for `BcryptBusyError`, ou reservar a vaga de bcrypt antes e soltá-la
  depois.

### B-2. `requireCurrentConsent` não está ligado a nenhuma rota e nada força que uma rota nova o use (fail-open por omissão)
- Onde: `hooks/require-current-consent.ts:24-51`. Só `test/legal-consent-api.test.ts` o usa. O comentário `:5-12` manda aplicar
  "em rota que cria compromisso novo".
- Hoje não há rotas de corrida, então não há exposição. Vira MÉDIO na primeira rota de corrida ou de "ficar online".
- Correção: teste que enumera as rotas autenticadas e exige o gate OU uma exceção declarada (default-deny). A parte do gate que
  existe falha fechado (503 sem configuração, 401 sem conta): `:36-44`.

### B-3. `GET /v1/legal/current` consulta o banco a cada pedido e o pool tem 5 conexões
- Onde: `routes/legal-route.ts:27` (uma consulta por pedido), `db.ts:5-10` (`max: 5`, `connectionTimeoutMillis: 5000`).
  Cobertura de limite: só o global de 100 por minuto por balde (`app.ts:143-150`), por balde /64 no IPv6. O
  `Cache-Control: public, max-age=60` não protege a origem (não há CDN ou cache na frente).
- Cenário: o endpoint é público e barato, mas disputa as 5 conexões com login e cadastro. Uma inundação a partir de muitos
  baldes IPv6 produz `unavailable` (503) nas rotas de identidade.
- Correção: cache em memória do resultado por perfil, com o TTL de `LEGAL_CACHE_MAX_AGE_SECONDS`. A defasagem é tolerada pelo
  desenho, porque o 409 já traz a vigente.

### B-4. A pista não tem vigia de tempo por operação, e `close()` espera sem prazo
- Onde: `bcrypt-pool.ts:171-177` (nenhum timeout por job) e `:124-130` (`close` espera `active === 0` indefinidamente).
- Uma thread que trava (fora de `error` e `exit`) mantém a vaga ocupada para sempre. Com todas travadas a pista fica em 503 até
  reiniciar. Hoje o hash vem do banco e o custo vem da configuração (4 a 15), então não achei jeito de o atacante causar. É
  robustez.
- Correção: vigia de, por exemplo, 10 a 30 s por job (terminar a thread, o que dispara `lose` e repõe a vaga) e prazo no
  `close`.
- Conferido e correto: `lose` é idempotente (`:193` só age se ainda estava em `slots`), uma mensagem tardia de thread morta é
  ignorada (`:181`), `close` recusa a fila e termina as operações em curso, e o erro do worker volta só com o nome
  (`bcrypt-worker.ts:32`), sem a senha.

### B-5. Tamanho da pista e custo do bcrypt dependem de premissas de infraestrutura
- `bcrypt-pool.ts:214-216` usa `availableParallelism() - 1`. Num contêiner com cota de CPU (Easypanel), o número de núcleos do
  hospedeiro pode superar a cota, e duas threads de CPU cheia competem com o laço principal. `AUTH_BCRYPT_CONCURRENCY` e
  `AUTH_BCRYPT_QUEUE_MAX` só estão em `apps/api/.env.example:76-77`, fora dos guias do dono. Medir `/healthz` sob rajada na
  máquina de produção.
- À parte: `auth-config.ts:22` aceita `AUTH_BCRYPT_COST` a partir de 4. Em produção, um piso de 10 evita um engano de
  configuração que enfraqueceria todos os hashes novos.

### B-6. O aceite prova o rótulo e o hash do catálogo, não os bytes que o app exibiu
- A 0021 copia o hash do catálogo (`account_consents_guard`, `0021:206-240`) e o `legal:publish` calcula o hash do arquivo que o
  operador informa (`legal-publish.ts:100-105`). Mas nada no cliente (HEAD) baixa o texto e confere o SHA-256, nem devolve o
  hash que viu (busca por `sha256` em `packages/api-client`, `apps/passenger`, `apps/driver`: zero ocorrências). Se o arquivo
  hospedado for trocado depois da publicação, o aceite continua dizendo "hash X".
- Correção: o app calcula o SHA-256 do texto baixado, só mostra se bater com `sha256` do `current`, e envia o hash que conferiu
  (o servidor compara com o do catálogo). Fixar no app a origem permitida das URLs dos textos.

### B-7. `LEGAL_DOCUMENTS_BASE_URL` e a publicação da primeira versão não estão nos guias do dono
- Sem a variável o cadastro responde 503 `consent_unavailable` (fail-closed, correto). Mas `docs/deploy-easypanel.md`,
  `publicar-o-backend.md` e `producao-passo-a-passo-dono.md` não a citam nem o passo `npm run legal:publish`. Só
  `docs/contrato-identidade-apps.md` e `apps/api/.env.example`. No primeiro deploy o cadastro "não funciona" sem explicação.

### B-8. Cliente de identidade: pontas soltas de sessão
- (a) `client.ts:141-153` + `session-manager.ts:255-260`: `login` com sessão aberta descarta o refresh anterior sem revogá-lo no
  servidor, deixando uma sessão órfã até a expiração (o `adopt` só troca a época). (b) `session-manager.ts:217-218`: no
  caminho de sucesso o `run` não checa a época; uma resposta da conta A pode chegar à tela da conta B depois da troca. (c)
  `session-manager.ts:262-277`: logout sem rede apaga o local e deixa o servidor vivo, sem fila para repetir a revogação. (d)
  `http-adapter.ts:85` aceita `http:` para qualquer host; em build de loja, uma URL errada mandaria senha e tokens em claro (o
  padrão do Android e do iOS bloqueia, mas não deve depender disso).
- Correção: revogar ou recusar login sobre sessão aberta; descartar resultado de época antiga também no sucesso; guardar
  "revogação pendente" e repetir na abertura; recusar `http:` fora de desenvolvimento.
- Sugestão (não é falha): perda da resposta do `/refresh` leva a logout forçado, o limite que o próprio arquivo documenta
  (`:21-22`). O descanso de 5 a 60 s não o evita (repetir depois dele ainda é reuso). Uma janela curta de tolerância no
  servidor para o mesmo predecessor, ao custo de enfraquecer um pouco a detecção de reuso, é uma decisão de desenho para o dono
  e a Vega.

### B-9. Painel: `csrfToken` ausente numa sessão NOVA é aceito como `null`
- Onde: `apps/admin/src/api/authResponses.ts:67-72` (`parseCsrfToken`), usado por `parseSession` (`:79-85`) em login
  autenticado, `2fa/verify` e `enroll/confirm`. O `null` se justifica só em `/me` (sessão anterior à 0009), mas vale para todos.
- Efeito: o painel aparece logado e toda mutação falha com 403, em vez de `contract_mismatch`, que é a política do próprio
  arquivo ("ausência de campo não vale como login"). Falha fechada no servidor, estado confuso no cliente.
- Correção: exigir `csrfToken` string nas respostas de sessão nova e aceitar `null` só em `/me`.

---

## Respostas diretas

**a) Pool de bcrypt (A-1).** Ciclo de vida correto: threads nascem sob demanda, ficam `unref` quando ociosas e `ref` só durante
a operação (provado: processo com thread criada e sem `close` saiu em 166 ms). Morte de thread: a operação falha com
`BcryptWorkerError` sem mensagem, a vaga é reposta, e o duplo `error`/`exit` não duplica a contagem (`:193`). Corrida entre
`assertAppBcryptCapacity` e o uso: o teto de concorrência nunca é violado, mas a reserva do limite pode ser consumida sem
comparação (B-1). `reserveCodeCheck` (10 por 15 min por par, escopo `code_request` com prefixo `code_check:` dentro do HMAC, então
não colide com a contagem dos pedidos): correto, e o bloqueio não grava nada. O 503 `server_busy` não cria oráculo, mas a pista
continua barata de sufocar (M-1).

**b) B-1 (SMTP).** `admin-email-settings-service.ts:150-170` grava `userConfigured` e `userChanged`, nunca o valor, e a lista
`changedFields` só leva o nome do campo. O teste `test/email-settings.test.ts:268-281` afirma que não existe chave `user` na
trilha. Resolvido. Linhas gravadas ANTES do commit 16c147a continuam na trilha imutável com o usuário em claro: ver pendências.

**c) M-3 e legal.** Banco: o gatilho grava `audience`, `text_sha256` e `accepted_at` e descarta o que a aplicação mandar; recusa
versão não publicada (23503) e já substituída (23514); a FK composta amarra o hash ao catálogo; o catálogo é imutável (UPDATE,
DELETE e TRUNCATE); `legal_pending_for_account` trata corretamente versão editorial (`requires_reacceptance = false`). A API só
lê o catálogo (camada 2 condicionada à existência do papel `vuumbora_api`: a 0021 só avisa se o papel faltar). O
`/v1/auth/consents` usa a conta do token (sem IDOR). O 409 `consent_outdated` não vaza nada: `current` é dado público (o mesmo
do GET), `pending` são nomes de documentos da própria conta, e no cadastro a checagem vem antes de qualquer consulta de conta
(não distingue e-mail livre de e-mail em uso). `LEGAL_DOCUMENTS_BASE_URL` falha fechado: https obrigatório com
`NODE_ENV=production` (o Dockerfile define), sem credencial, query nem fragmento; a API nunca baixa a URL, então não há SSRF. O
script de publicação recusa a mesma versão com hash diferente (`PublishConflictError`) em vez do `DO NOTHING` silencioso. GET
público sem limitador próprio: ver B-3. Gatilho do reaceite: ver B-2 e M-2.

**d) Cliente.** Ver M-4 e B-8. Corpo montado campo a campo, `credentials: 'omit'`, resposta de sucesso conferida (forma e
`accountType`), tempo limite de 15 s, e nada é logado no `api-client` (zero `console`/logger; `onStorageError` recebe só o erro).

**e) Painel.** `authResponses.ts` falha fechado (`status` e `role` obrigatórios e de vocabulário fechado), nunca devolve valor
parcial, e o `reason` carrega só nomes de campo e tipos. A única exceção são `status` e `role`, e só se casarem
`^[a-z][a-z_]{0,31}$`. `contractMismatch` limpa o CSRF e loga só o motivo (`auth.ts:36-42`). Resolvido, com B-9.

**f) Metro.** Sim, pode deixar tela de desenvolvimento em produção. Ver M-3 e a tabela.

---

## Estado dos itens da rodada 3 que esta rodada tocou
- A-1 (bcrypt): PARCIAL (M-1). B-1 (usuário SMTP): RESOLVIDO. M-3 (versão do aceite): PARCIAL (M-2, B-2, B-6).
- B-2 da rodada 3 (`ip_hash` do aceite nunca zerado) segue ABERTO: `lib/identity-retention.ts` não tem o passo, e o reaceite
  agora grava mais linhas com `ip_hash` (`legal-repository.ts:71-82`).
- M-1 (botnet), M-2 (griefing de cadastro), M-4 (HSTS), M-5 (teto de e-mails) e B-3 a B-7 da rodada 3: não reavaliados, sem
  mudança de código nesta rodada.

## O que NÃO foi revisado
- Execução real: nada rodado em banco (gatilhos, FK composta, view, corrida de publicação) e nenhum teste executado por mim.
  Suíte de 323/323, mutantes e a "prova em PG18" são afirmações da Vega e do Cronos.
- Árvore de trabalho NÃO commitada na época: telas de cadastro, login, código, redefinição, termos e privacidade do passageiro,
  `LegalDocumentScreen`, `SessionProvider` e `identityClient.ts` modificados, `packages/ui`, o cofre seguro (A3). Só olhei de
  relance o modo do `identityClient.ts` (M-3).
- `mock-adapter.ts` (405 linhas), `types.ts`, `index.ts` do `api-client`; `apps/admin/src/api/client.ts` (o
  `createHttpRequester`), o módulo de CSRF e os demais adaptadores do painel.
- Produção: versão do Postgres, dono das tabelas, se `vuumbora_api` existe e tem só SELECT no catálogo (camada 2 da 0021), cota
  de CPU real do contêiner, AAAA do host da API, cabeçalhos e limites do Traefik, restrições do token do Mapbox (público por
  desenho), conteúdo do `.env` real (não li de propósito).
- Build mobile real: não rodei `expo export`, EAS nem Gradle; só a lógica do `metro.config.js` (a prova de que o `NODE_ENV` de
  release é `production` falta).
- Ordem de fechamento dos hooks `onClose` do Fastify (se alguma requisição em voo recebe 503 durante o desligamento).
- Dependências: `npm audit` não rodado (bcryptjs 3.0.3, fastify 5, @fastify/rate-limit 10.3.0 não conferidos contra avisos).
- `ci.yml` além de procurar passo de build mobile; backup e restauração; hospedagem real dos textos legais.
- Observação fora de escopo, sem verificar: limite por IP de 30 por 15 min por rota em redes móveis com CGNAT pode barrar
  usuários legítimos no lançamento.

---

RESULTADO: 0 críticos, 0 altos, 4 médios, 9 baixos. A-1 PARCIAL, B-1 RESOLVIDO, M-3 PARCIAL. Veredito: API liberada para
produção FECHADA. Cadastro público bloqueado por M-2 (cliente real) e M-3 (build de loja); M-1 exige correção ou aceite
registrado pelo dono.

PARA O PRÓXIMO:
1. Lyra: M-2 (http-adapter manda as versões que a tela renderizou, portas `legal/current` e `consents`, `me.consent`, tratar 409
   `consent_outdated`); M-4 (definitivo só com `code` conhecido, não fabricar o código); M-3 (Metro: perfil derivado de
   `NODE_ENV`, abortar sem perfil, bloquear por convenção, guarda contra `mock` em `production`); B-6, B-8, B-9.
2. Vega: M-1 (fila justa por balde, /48 para IPv6), B-1 (desfazer a reserva em `BcryptBusyError`), B-2 (teste de rotas × gate),
   B-3 (cache em memória), B-4 (vigia e prazo no `close`), B-5 (piso do custo em produção).
3. Vulcano/Atlas: B-7 e B-5 nos guias (`LEGAL_DOCUMENTS_BASE_URL`, `legal:publish` antes do primeiro cadastro,
   `AUTH_BCRYPT_CONCURRENCY` e cota de CPU); `eas.json` com perfis explícitos e passo de fumaça com string-canário.
4. Dono: decidir aceitar ou corrigir M-1 e registrar o número em `decisoes-do-dono.md`.

PENDÊNCIAS: (a) conferir no banco real se existem linhas antigas de `email_settings.updated` com `user` em claro
(`admin_audit_log` é imutável; só a credencial dona limpa), e se `vuumbora_api` tem só SELECT no catálogo legal; (b) medir a
capacidade da pista na CPU de produção e saber se a API tem AAAA; (c) confirmar que o bundle de release do React Native define
`NODE_ENV=production`; (d) revisar a árvore de trabalho (A3 e telas de auth) quando commitada; (e) `npm audit`.
