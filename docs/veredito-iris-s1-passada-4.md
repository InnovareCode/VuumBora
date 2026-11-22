# Veredito da Íris, S1, passada 4

**VEREDITO: REPROVADO.**

**Vale só para o commit `33b2401` (SHA completo `33b240105932051b3abaedfd869bcb2a5e3593e7`, "fix(api): fila justa por origem no pool de bcrypt, reserva da vaga antes de gravar contador, cache do GET legal, piso do custo e teste do pool sem piso de CPU (M-1, B-1 a B-5, F1, F2, F4)").**
Provado em cópia limpa (`git archive 33b2401`, `npm ci` com Node 22.23.5, o do CI), sem `.env`, em 22/11/2026 entre 03:26 e 05:30.
O `HEAD` andou durante a passada: no início era este SHA; no fim é `d7e21e1` ("feat(motorista): identidade ponta a ponta sobre o cliente mock…", CI verde). Esse commit **não foi validado por mim** e mexe em `packages/ui/src/InputCore.tsx` e `InlineAlert.tsx`, os arquivos do F3 e do F5 (ver "Pendências").

Ambiente: Postgres 18.1 próprio na porta 5470, SMTP falso (2570/2571), API real compilada (`dist/server.js`) nas portas 3470, 3471 e 3476 com o papel restrito `vuumbora_api` (só INSERT em `login_attempts`), export web do passageiro servido em 4470 e Metro em 4475. Windows 10, Xeon E5-2650 v4 (24 CPUs lógicas). Tudo derrubado ao fim (portas livres, junções removidas, sem processo meu).

## Por que reprovou

Os itens 1 e 3 das reprovações da passada 3 estão **liberados**, e todos os itens novos pedidos passaram. Reprovo por dois defeitos de **teste**, ambos em `apps/api/test/bcrypt-ceiling.test.ts`, que é o arquivo que o commit mais ampliou:

1. **O teste de tempo do `/healthz` é flaky: 3 falhas em ~107 execuções (~3%)**, nas três condições, inclusive sem afinidade e com a máquina quieta. Mensagem sempre a mesma: `/healthz demorou 223 | 233 | 228 ms durante a rajada (limite 200 ms)` (linha 124). O valor típico é 16 a 34 ms; o limite fixo de 200 ms fica a ~25 ms dos outliers. É a mesma classe da reprovação da passada 3 (limite absoluto de tempo), e o CI roda este teste uma vez por push (~3% de chance de vermelho).
2. **`bcrypt-ceiling.test.ts` passa em banco novo e falha na 2ª execução seguinte do mesmo arquivo no mesmo banco** (sem afinidade, sem carga): 1 de 20 verdes preso a 2 CPUs, 1 de 20 com carga 2x. É estado deixado pela execução anterior, não tempo. O teste depende do que rodou antes dele (viola "determinístico, independente de ordem").

O código de produção (M-1, B-1 a B-5, F4) está provado e não bloqueia. O que bloqueia é a suíte não ser confiável.

## Resumo por item

| Item | Resultado |
|---|---|
| 1. CI do SHA | **Verde**: run `44993615428`, 4 de 4 jobs. **Liberado** (amostra de 1 execução). |
| 2. Suíte completa de 380 | Banco novo (r1, r4) **380/380**; no mesmo banco r2 **379/380** (o `/healthz` de 223 ms) e r3 380/380; 3x presa a 2 CPUs **380/380 x3**. Arquivos de concorrência x20: 8 de 9 em 20/20 nas duas condições; `bcrypt-ceiling` reprova (defeitos 1 e 2). **Não liberado.** |
| 3. F3, F5, F6, F7, F8, F12 | **Liberados** nos 3 motores a 320, 360 e 373 px (F3 36/36 x3 motores; F5 a F12 35/35 x9). |
| M-1 | **Provado**: titular recusado 21 a 68% antes, **0%** depois (1 balde e girando /64 dentro de um /48). |
| B-1 e F4 | **Provado**: o 503 da rajada não grava linha em `login_attempts` (5 rotas, 3 origens). |
| B-2 | Funciona para rota **sem classificação**; **3 formas de quebrá-lo** com rota autenticada declarada `public` (achado baixo). |
| B-3 | **Provado**: cadastro e reaceite leem o banco, nunca o cache do GET; canário pega. |
| B-4 | **Provado** no pool (17/17 + 4 canários). Desligamento por SIGTERM em processo real: **não provado**. |
| B-5 | **Provado**: 36/36 na API real (custo x `NODE_ENV` x `REQUIRE_SECRETS`). |
| api-client | **216/216 x3**; mutação por amostragem: 15 de 17 mortos, 2 vivos equivalentes. |
| B3 no passageiro | **Provado** nos 3 motores (30/30 cada). |

## 1. CI do SHA (liberado)

Run `44993615428`, push de `33b2401` na `main`, 06:25:01Z a 06:27:17Z (2 min 16 s), conclusão `success`:

| Job | Resultado | Duração |
|---|---|---|
| `check (fronteiras, contexto docker, typecheck)` | verde | 47 s |
| `api (build, migracoes e testes contra Postgres e Redis reais)` | verde (passo "Testes do apps/api": 74 s) | 2 min 7 s |
| `backup e restauracao` | verde | 36 s |
| `ci-ok` | verde | 4 s |

Leitura pela API pública do GitHub (sem login). Uma execução só: não posso reexecutar sem login, então "verde" aqui é 1 de 1, sem estatística. As execuções anteriores (`fd3c5ee`, `6f59918`) estavam vermelhas; o `HEAD` novo (`d7e21e1`) está verde.

## 2. Suíte completa e arquivos de concorrência

Migrações oficiais (`npm run migrate`, build compilado): 0001 a 0021 aplicadas do zero (21), segunda execução "0 novas".

| Execução | Banco | CPUs | Duração | Resultado |
|---|---|---|---|---|
| r1 | novo | 24 | 215 s | **380/380** |
| r2 | o mesmo da r1 | 24 | 203 s | **379/380**: `bcrypt-ceiling` "rajada de 30 verify-email", `/healthz demorou 223 ms` |
| r3 | o mesmo | 24 | 204 s | 380/380 |
| r4 | novo | 24 | 202 s | 380/380 |
| aff-1 | novo | **2** | 235 s | 380/380 |
| aff-2 | o mesmo | 2 | 236 s | 380/380 |
| aff-3 | o mesmo | 2 | 238 s | 380/380 |

"2 CPUs" por PowerShell com `ProcessorAffinity = 3` (filhos herdam; o Node viu `availableParallelism() = 2`).

### Arquivos de concorrência, 20 vezes cada, no mesmo banco

Presos a 2 CPUs, e presos a 2 CPUs com 2 consumidores de CPU (carga 2x):

| Arquivo | 2 CPUs | carga 2x |
|---|---|---|
| identity-email, identity, identity-hardening, admin-hardening | 20/20 | 20/20 |
| bcrypt-pool, bcrypt-code-check, reset-cap-concurrency, sql-concurrency | 20/20 | 20/20 |
| **bcrypt-ceiling** | **1/20** | **1/20** |

### Defeito 2: `bcrypt-ceiling` depende do estado (provado)

A 1ª execução passa; da 2ª em diante falham, de forma estável, os testes novos "cadastro: a conta é criada mesmo que a pista encha…" (B-1) e "rajada de 30 cadastros…" (F4) (`8 !== 9` contas; `6 !== 0` linhas), e, conforme as iterações acumulam, também "admin: a espera progressiva do dono…" e "pista do ADMIN: um /48 do atacante…" (4 falhas).
Prova de que **não é CPU nem carga**: `idem.sh`, 3 execuções seguidas do arquivo num banco novo, **sem afinidade**: `exec 1 rc=0 (14/14)`, `exec 2 rc=1 (12/14)`, `exec 3 rc=1`.
Causa: `uniqueEmail()` (`test/helpers/identity-kit.ts`) é `${label}${contador}@teste.vuumbora.dev` com contador **por processo**; `prepareDatabase()` não zera `accounts`; o e-mail repetido recebe o mesmo 201 (anti-enumeração) sem criar conta nem gravar linhas de limite. A suíte inteira repete no mesmo banco porque um arquivo posterior zera `accounts`, e o CI usa banco novo: por isso ninguém viu.
Para medir tempo sem este ruído recriei o banco a cada execução (`loopfresh.ps1`).

### Defeito 1: o `/healthz < 200 ms` é flaky (provado)

`bcrypt-ceiling` x20, **banco novo a cada execução**, `/healthz` máximo medido pelo próprio teste:

| Condição | Resultado | `/healthz` máximo |
|---|---|---|
| 2 CPUs | **20/20** | 17 a 20 ms |
| 2 CPUs + 2 consumidores (carga 2x) | **19/20** (iter 13: **233 ms**) | 22 a 34 ms nas verdes |
| sem afinidade, máquina quieta | **19/20** (iter 19: **228 ms**) | 16 a 23 ms nas verdes |
| suíte inteira, sem afinidade (r2) | falhou: **223 ms** | |

Total: **3 falhas em ~107 execuções** do teste (4 suítes sem afinidade, 3 presas, 40 primeiras iterações dos loops no mesmo banco, 60 com banco novo). Os três valores (223, 228, 233) são quase iguais e ficam muito acima do típico (16 a 34 ms): parece uma parada única do laço de ~0,2 s, não ruído uniforme. **Causa não provada** (hipóteses: coleta de lixo, ou uma operação síncrona no meio da rajada); os logs estão guardados (`FAIL-r2-bcrypt-ceiling-healthz-223ms.log`, `lfresh-FAIL-ceilload-13.log`, `lfresh-FAIL-ceilfree-19.log`).
O que o teste quer garantir é "não ficam segundos como antes" (a falha original era mediana de 1,9 s, máximo de 6,2 s): um limite de 200 ms é apertado demais para isso.

## 3. F3, F5, F6, F7, F8 e F12 no passageiro (liberados)

Roteiros próprios (`f3.mjs`, `fx.mjs`), Chromium, Firefox e WebKit do Playwright, export de produção servido (F3, F8) e dev server com o gancho (F5, F6, F7, F12). O export de produção só saiu com o escape documentado `VUUMBORA_ALLOW_MOCK_IDENTITY_IN_PRODUCTION=1`: sem ele a build **aborta** por identidade simulada (a guarda M-3 da `0fe8883` funciona; F11 fechado).

| Item | O que medi | Resultado |
|---|---|---|
| F3 "Mostrar senha" | botão dentro da tela, dentro do campo, campo >= 100 px, sem rolagem horizontal, `elementFromPoint` no botão e clique real alterna `password`/`text`; login e cadastro em 320, 360, 365, 373, 374 e 390 px; código e redefinir em 320, 360 e 373 | **36/36** nos 3 motores |
| F5 foco depois do erro | login por Enter e por clique: foco **no aviso**, não no `<body>`; o Tab seguinte vai ao botão; 4 estados forçados (503, rede, limite, `server_busy`) | passou |
| F6 foco na chegada | tela do código e redefinir focam o campo do código; envio vazio no cadastro leva ao primeiro campo com erro (nome) | passou |
| F7 `invalid_email` | em esqueci-senha o campo fica `aria-invalid=true` com o texto junto dele, foco no campo, sem aviso duplicado, limpa ao corrigir | passou |
| F8 404 | rota inexistente, aninhada e `/_sitemap` no export de produção: sem "Unmatched Route", "Sitemap" nem "System Information"; texto em português com caminho de volta | passou |
| F12 | "Entrar na minha conta" depois de `email_taken` abre o login com o e-mail preenchido, senha vazia; forçado e natural (cadastra, sai, cadastra de novo) | passou |

`fx.mjs`: 35/35 em cada uma das 9 combinações (3 motores x 320, 360, 373 px).
**Controle negativo do F3** (`f3-canary.mjs`): reintroduzo `min-width: auto` no `<input>` e a medição acusa o botão fora da tela em Firefox (320..373 em 320 e 360 px) e WebKit (313..365), e não acusa no Chromium: **os mesmos números da passada 3**. Logo, o 36/36 não é medição cega.
Regressão com meus roteiros da passada 3: teclado, foco e 320 px (`b1c`) **161/161 nos 3 motores** (antes 158/161, 149/161, 149/161); códigos naturais do mock (`b1d`) 19/19; guardas e perfil de produção (`b1a`) 52/55; estados forçados (`b1b`) 206/210. Das 7 falhas, **6 são expectativas velhas do meu roteiro**, não defeitos: o "Unmatched Route" que agora é a página 404 em português (2, A2c) e o `consent_outdated` que agora tem estado próprio "Os textos foram atualizados" em vez de "Algo deu errado" (4; o aviso continua `role=alert`, F10 resolvido). A sétima (A3h, erro de console) é real e é o N4 abaixo.

## 4. M-1: recusa do titular legítimo (provado)

API real compilada, presa a 4 CPUs (pista de 2 vagas e 8 de fila), custo 12, comparação com uma cópia limpa do `1707546` (mesmo banco, mesma máquina). 19 logins válidos do titular por execução (1 a cada 600 ms, 8 contas, cada um de um IP), 11 s de ataque (login de contas inexistentes), 3 repetições:

| Ataque | `1707546` titular recusado (503) | `33b2401` titular recusado |
|---|---|---|
| 1 balde IPv4 (5 req/s) | 32%, 21%, 21% | **0%, 0%, 0%** |
| 1 balde IPv6 girando o /64 dentro de **1 /48** (10 req/s) | 68%, 58%, 63% | **0%, 0%, 0%** |
| 2 /48 (controle: 2 baldes) | 68%, 68%, 68% | **0%, 0%, 0%** |
| muitos /48 diferentes (controle: o desenho não protege contra isto) | 68%, 68%, 53% | 63%, 68%, 53% |

Latência do titular atendido: mediana 1,1 s (antes 2,2 s). O último caso fica igual de propósito: com 10 baldes distintos por segundo a pista enche mesmo assim; é limite do desenho, não regressão.
Mutação (seção "Mutação por amostragem na API"): os 6 mutantes de M-1 morrem.

## 5. B-1 e F4: o 503 não grava tentativa (provado)

Rajada de 30 simultâneas, contando linhas de `login_attempts` (e `admin_login_failures`) antes e depois, por rota (`verify-email`, `login`, `reset-password`, `register`, `login do admin`) e por origem (30 IPs distintos, mesmo IP, mesmo /48).

- **`33b2401`: 29/30.** Em todas as combinações, linhas gravadas = atendidas x linhas por requisição (verify 10 atendidas = 10 linhas; login 10 = 10; cadastro 10 = 30, são 3 linhas por cadastro; admin 5 = 5; mesmo IP: 2 atendidas = 2 linhas, 28 recusadas sem linha). O único "FAIL" é **artefato do meu roteiro**: no admin com o mesmo IP uma das 2 atendidas é o 429 da espera progressiva, que não grava linha por desenho (esperava 2, deu 1).
- **`1707546`: 14/30** (as 16 falhas são o defeito): 30 linhas para 10 atendidas em verify, login e reset; 90 para 10 cadastros; 20 para 5 do admin.
- O 503 é imediato (< 400 ms), `server_busy`, `retryAfterSeconds: 3`, e a rota volta a atender depois. Com o papel restrito (sem DELETE) que é o caso que importa.

## 6. B-2: o teste das rotas contra o portão (tentei quebrá-lo)

`test/consent-gate-coverage.test.ts` enumera as rotas pelo `onRoute` e confere a tabela `ROUTE_POLICY`. **Pega**: rota autenticada nova sem classificação (morto), rota declarada `account-gated` sem `requireCurrentConsent` (morto), classificação sem rota, e o controle negativo com rotas sintéticas.
**Não pega** (mutação em `repo-mut`, com a rota declarada `public` na tabela, como faria quem tem pressa; 11/11 passam nos três):

| Forma de autenticar | Resultado |
|---|---|
| `onRequest: requireAccount` na rota | **passa** (o teste só lê `route.preHandler`) |
| `preHandler: async (req, rep) => requireAccount(req, rep)` | **passa** (a detecção é pelo **nome** da função; o embrulho é anônimo) |
| `addHook('preHandler', requireAccount)` num contexto encapsulado | **passa** (o `onRoute` não enxerga hook de contexto) |

Severidade baixa: o teste cumpre o que promete (rota **esquecida** cai); o buraco é rota **autenticada por outro mecanismo e declarada pública**. Correção: falhar quando a rota tiver `onRequest`/`preValidation`/`preHandler` que não seja nome conhecido, ou documentar a limitação no cabeçalho do teste.
Não provado: o conjunto bloqueado (`requireCurrentConsent`) por HTTP, porque nenhuma rota o monta ainda (só a sonda da suíte).

## 7. B-3: cadastro e reaceite nunca leem do cache do GET (provado)

API real, banco vazio, `LEGAL_CACHE_MAX_AGE_SECONDS=6`, texto novo publicado pelo operador no meio (`b3cache.mjs`), **20/20**:

- cache ativo (controle): depois de publicar T2, o `GET` dentro do prazo ainda mostra T1; passado o prazo, T2.
- **cadastro** com T1 (a do cache) = **409** com `error.current` = T2 (banco); com T2 (a que o cache ainda desconhece) = **201** e aceite gravado T2 + P1.
- **reaceite** com T1 = 409 e nada gravado; com T2 = 200, 1 linha nova; `/me` mostra o pendente na versão do banco.
- só resultado `ok` é guardado: o 503 de "nada publicado" não fica preso (200 logo depois de publicar), por perfil.
- consultas ao catálogo contadas no log do Postgres (papel `vuumbora_api` com `log_statement=all`; o `pg_stat_*` atrasa até 10 s e não serve): 40 GET simultâneos com o cache vencido = **1** consulta; mais 40 dentro do prazo = 0; 10 cadastros 409 = **10** consultas.
- `Cache-Control: public, max-age=60` com a variável padrão.
- **Canário**: o mesmo roteiro contra uma API compilada com o serviço lendo de memória (mutante): **8 falhas**, entre elas P2.4, P2.5, P2.8 e P2.9.
Regressão do M-3 (`m3.mjs`, `m3b.mjs`) na API do SHA: **106/108 + 11/11**; as 2 falhas (B13) esperam `max-age=60` e eu rodei com o cache desligado (`max-age=0`, coerente com a configuração), logo são do meu ambiente, não da API.

## 8. B-4: vigia por operação e `close` (provado no pool)

`b4.mts`, pool direto com uma thread que trava em laço síncrono, **17/17**:
operação travada falha com `BcryptWorkerError("Timeout")` perto do prazo (300 ms), `timedOut=1`, thread morta de verdade (**0 de CPU em 1 s**; viva seria ~1000 ms), a vaga volta e a seguinte roda; o prazo conta da hora em que a operação **começa** (3 comparações de ~0,5 s numa vaga com prazo de 1,2 s por operação acertam as três); `close()` com operação travada volta em ~400 ms (a graça), as que rodavam falham com `PoolClosed`, a fila é recusada com `BcryptBusyError`, a pista fechada recusa tudo, `close()` repetido não quebra; operação que cabe na graça **conclui** e o `close` espera.
**Canário** (4 mutantes do pool contra o meu roteiro): todos pegos (1.3 CPU viva, 1.1 sem repor a vaga, 3.1 sem graça = 59,8 s, fila não recusada = trava).
**Não provado**: o desligamento por `SIGTERM` com requisições em voo num processo real (o Windows não tem `SIGTERM`; não usei o WSL2). Observação: a graça do `close` é 10 s, igual ao prazo padrão de parada do Docker; só afeta o caso de thread travada.

## 9. B-5: custo do bcrypt abaixo de 10 em produção falha fechado (provado)

`b5.mjs` sobe a API real (`dist/server.js`) 36 vezes (18 combinações x `REQUIRE_SECRETS` falso e verdadeiro) e testa login, verify e cadastro:

- `NODE_ENV=production` com custo 4, 9, 3, 16, `abc`, `9.9`, vazio, `-1`, `" 4 "` e **`NODE_ENV` ausente com custo 4**: `/v1/auth/*` responde **503 `auth_unavailable`** e o boot loga só o nome (`AUTH_BCRYPT_COST:below_production_floor`, `too_small`, `too_big`, `missing_or_invalid`), nunca o valor nem hash.
- custo 10, 12 e ausente (padrão 12): a identidade funciona. `development` e `test` com custo 4: funcionam (dispensam o piso).
- `REQUIRE_SECRETS=true`: nos casos fechados a API **recusa subir** (exit 1) com a mesma mensagem. `0x0a` e `1e1` valem 10 e passam (o `Number()` do zod); informação.
- Mutação: os 4 mutantes de B-5 morrem.

## 10. api-client: 216 testes e mutação por amostragem

`npm test -w @vuumbora/api-client`: **216/216 em 3 de 3** (Node 22). Mutação em cópia (`mutate-ac.mjs`, 17 mutantes, controle verde):

- **Mortos (15)**: **SF10** (`clearLocal` sem `epoch += 1`), **SF4** (`run()` sem a guarda de época depois do refresh), 3 outros de época (guarda depois da 1ª chamada, resultado da repetição, `performRefresh`, `adopt`), **M-4** (qualquer 401 derruba a sessão; `invalid_refresh_token` só como 401; `invalid_body` deixa de ser definitivo; sem pausa depois de falha transitória), **B-8** (login não revoga a sessão anterior; revoga a recém-adotada; logout sem rede fora da fila; escritas sem fila única; `http:` aceito sem `allowInsecureHttp`).
- **Vivos (2), equivalentes por leitura do código, não por prova**: `accessTokenAfterRejection` sem a guarda de época (o `run()` já a verificou de forma síncrona logo antes) e `getValidAccessToken` devolvendo `renewed` sem rechecar a época (o `performRefresh` já devolve `NO_SESSION` se a época mudou). Os dois que sobreviveram na passada 2 (SF4 e SF10) agora morrem.

## 11. B3 no passageiro: cadastro com versões, 409 e reaceite (provado)

`b3p.mjs` no dev server (gancho `__vuumboraMockLegal` troca as versões do mock), **30/30 em Chromium, 30/30 em Firefox, 30/30 em WebKit**:

- o cadastro envia as versões **exibidas** (troquei para `mock-9`/`mock-7`, que nenhuma constante do app conhece, e foi isso que saiu); o botão só existe com os textos na tela.
- **409 no cadastro** (Termos novos no meio): o app **não reenvia sozinho** (1 chamada em 2,5 s), mostra "Os textos foram atualizados" (`role=alert`, foco no aviso), troca para "Versão mock-2", **desmarca as duas caixas**, mantém os dados digitados; enviar sem marcar não chama o servidor; marcando de novo envia `mock-2`; dois 409 seguidos = 2 chamadas e nenhum reenvio.
- **reaceite**: conta em dia entra direto; com Termos novos pendentes a tela de reaceite **ocupa o lugar do app** (`/historico`, `/perfil`, `/configuracoes`, `/` por URL direta não a contornam), só os Termos, caixa desmarcada, sem marcar não envia; 409 no meio troca para `mock-3`, desmarca e **não reenvia**; aceitando envia **só** `termsVersion`; com os dois documentos pendentes pede os dois; "Sair da conta" funciona.

## Mutação por amostragem na API

`mutate-api.mjs` em cópia (`repo-mut`, nunca o repositório), **banco novo a cada execução** (sem isso o N2 soma falhas de estado às do mutante: a 1ª rodada, com banco reaproveitado, inflava as contagens), controle verde (169/169). 30 mutantes: **26 mortos, 4 vivos**.

| Área | Mutantes | Resultado |
|---|---|---|
| M-1 | teto por origem 3 em vez de 2; sem contagem por origem; origem não liberada ao começar a rodar; `/48` vira `/64` no balde do bcrypt, na chave de rota e em `ip-bucket` | 6 de 6 mortos |
| B-1 | `finally` não devolve o lugar; `release` não devolve a origem nem baixa `pending`; `spend` não baixa `pending`; lugar reservado não conta na pista | 5 de 5 mortos |
| B-4 | vigia não repõe a vaga; vigia não mata a thread; vigia desligado; `close` sem graça; `close` não recusa a fila | 5 de 5 mortos (2 deixam o runner pendurado até o meu limite de 150 s: "vigia desligado" só morre por tempo, "não mata a thread" falha a asserção e depois pendura) |
| B-5 | piso 4; `NODE_ENV` ausente dispensa; `loadAuthConfig` sem o piso; boot não avisa | 4 de 4 mortos |
| B-3 | cache guarda o 503; nunca vence; sem consulta compartilhada; **serviço lê de memória (cadastro e reaceite no cache)** | 4 de 4 mortos |
| B-3 | TTL 0 não desliga o cache | **vivo, equivalente** (com TTL 0 a entrada nasce vencida: o comportamento é o mesmo) |
| B-2 | rota autenticada sem classificação; rota `account-gated` sem o hook | 2 de 2 mortos |
| B-2 | autenticada por `onRequest`; `preHandler` anônimo; `addHook` de contexto, as três declaradas `public` | **3 vivos** (achado N3) |

## Achados

Severidade segundo o que o dono perde. "Quem corrige" vai para o Atlas.

| Id | Sev. | Onde | O que | Causa | Quem |
|---|---|---|---|---|---|
| N1 | **Alta (bloqueia)** | `bcrypt-ceiling.test.ts:124` | `/healthz` > 200 ms em 3 de ~107 execuções (223, 228, 233 ms), nas 3 condições | Limite absoluto apertado; parada única de ~0,2 s do laço, causa não provada | Vega (teste), Íris repete |
| N2 | **Média (bloqueia)** | `bcrypt-ceiling.test.ts`, `test/helpers/identity-kit.ts` | Não repete no mesmo banco: 4 testes dependem de estado | `uniqueEmail` com contador por processo; o banco não zera `accounts` | Vega (teste) |
| N3 | Baixa | `consent-gate-coverage.test.ts` | Rota autenticada por `onRequest`, `preHandler` anônimo ou `addHook` de contexto e declarada `public` passa | Detecção só por nome em `route.preHandler` | Vega |
| N4 | Informação | `packages/ui/src/LoadingSkeleton.tsx` | Aviso de console `Animated: useNativeDriver is not supported` no export web (aparece quando o esqueleto dos textos legais é montado) | `useNativeDriver: true` sem exceção para web | Lyra |
| N5 | Informação | `bcrypt-pool.ts`, `.env.example` | Com IP compartilhado (CGNAT), 3 ou mais logins simultâneos do mesmo IPv4 recebem 503 (limite de 2 lugares de espera por origem; rajada de 30 do mesmo IP: 2 atendidas, 28 recusadas) | Desenho do M-1; documentado (`AUTH_BCRYPT_MAX_PER_ORIGIN`) | Atlas (decidir o padrão) |
| N6 | Informação | `(auth)/cadastro.tsx` | Depois de "Entrar na minha conta" o foco fica no `<body>` (o e-mail vem preenchido) | Troca de rota sem foco programático | Lyra |
| N7 | Informação | testes do pool (B-4) | Com o vigia desligado o runner **pendura** em vez de falhar (só o `timeout-minutes` do CI o encerra); com "não mata a thread" falha a asserção e depois pendura | A thread travada segura o processo do teste | Vega |

## O que precisa mudar para aprovar

1. **Vega (teste), N1:** trocar o limite absoluto de 200 ms do `/healthz` por uma relação ou por um teto que proteja o que importa (não ficar segundos; a falha original era 1,9 s de mediana e 6,2 s de máximo): por exemplo, máximo < 1000 ms e mediana < 50 ms, como o teste do pool já faz com relações.
2. **Vega (teste), N2:** `uniqueEmail` único entre execuções (acrescentar `Date.now().toString(36)` e aleatório) ou zerar `accounts` e as tabelas de contador no `before` do arquivo; conferir os 4 testes citados.
3. **Íris, depois:** `bcrypt-ceiling` x20 no mesmo banco (2 CPUs e carga 2x) e x20 com banco novo em 3 condições (hoje 20/20, 19/20 e 19/20), e a suíte 3x presa a 2 CPUs.
4. **Vega (opcional), N3:** fechar as 3 formas de passar pelo teste de B-2, ou registrar a limitação. **Lyra (opcional), N4 e N6.**

## Não provado (e por quê)

- **CI**: só 1 execução verde do SHA; sem login não reexecuto. Nada em runner Linux fora o CI (a réplica local foi em Windows; passada 3 tem a de WSL2).
- **B-4 com `SIGTERM` em processo real**: Windows não tem `SIGTERM` e não usei o WSL2. O que provei é o pool e o `onClose` por teste.
- **`requireCurrentConsent` por HTTP**: nenhuma rota o usa ainda.
- **Causa do outlier de 0,2 s do `/healthz`** (N1).
- **`d7e21e1` (HEAD atual)**: não validado. Mexeu em `InputCore.tsx` (anel de foco em campo inválido) e `InlineAlert.tsx`, os pontos do F3 e do F5: precisa repetir `f3.mjs` e `fx.mjs` antes de dar o passageiro como pronto.
- **Aparelho real** (Android, iOS), leitor de tela (NVDA, VoiceOver, TalkBack), Safari do iPhone (o WebKit do Playwright não é o do iOS).
- **Conta legada** (anterior à 0021) fora da suíte; **SMTP real com TLS**; imagem Docker; produção com `TRUST_PROXY` real.

## Pendências (valem depois)

- Rodar as repetições de tempo num runner Linux de CI de verdade (ou várias execuções do CI) para tirar o N1 do campo da hipótese.
- Teste de integração do `SIGTERM` com bcrypt em voo, quando houver Linux disponível.
- Primeira rota de compromisso: ligar `requireCurrentConsent` e provar por HTTP (409 com pendência, 503 sem textos).

## Reprodução (efêmero)

Scripts em `scratchpad/iris4/` (não versionados): `suite.sh`, `aff-suite.ps1`, `loopfiles.ps1`, `loopfresh.ps1`, `idem.sh`, `pin.ps1`, `m1-all.sh`, `m3-all.sh`, `b3-all.sh`, `final-unpinned.sh`, `mutate-api.mjs`, `mutate-ac.mjs`, `b4-canary.mjs`, `b3-canary.sh`, `e2e/{m1,m3,m3b,b1burst,b3cache,b4,b5,f3,f3-canary,fx,b3p,b1a,b1b,b1c,b1d}.mjs`. Resultados em `scratchpad/iris4/res/` e logs das falhas em `scratchpad/iris4/lf*-FAIL-*.log` e `FAIL-r2-*.log`.
