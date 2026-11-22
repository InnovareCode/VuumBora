# Veredito da Íris, S1, passada 3

**VEREDITO: REPROVADO.**

**Vale só para o commit `1707546` (SHA completo `170754643c87863f4a8c22632cdbce0b69ca6f05`, "docs: rodada 3b da Orion, veredito da passada 2 da Iris e estado de 22/11 no PROGRESSO").**
Provado em cópia limpa (`git archive 1707546`, `npm ci` com Node 22.23.5, o do CI), sem `.env`, em 22/11/2026 entre 00:22 e 01:40.
O `HEAD` já andou: `d63137a` (três commits depois). Nada abaixo vale para ele.

Ambiente: Postgres 18.1 próprio na porta 5472, SMTP falso (2572/2573), API real compilada nas portas 3372 a 3374,
export web do passageiro servido em 4372, Metro em 4375. Tudo derrubado ao fim. Windows 10, Xeon E5-2650 v4 (24 CPUs lógicas),
mais WSL2 Ubuntu (Node 22 Linux) só para a prova do teste de tempo do pool.

## Por que reprovou

1. **CI vermelho no próprio SHA** (item 5). O job `api` falha no teste de tempo do pool de bcrypt. O "ajuste" do `148dc8d`
   (limite de 250 ms e threads por CPU) **não resolveu**: o mesmo teste falhou em 4 de 4 execuções depois dele. Localmente não reproduz.
2. **Testes de concorrência frágeis por construção** (achado novo, item 1). O teto de bcrypt (A-1) tem capacidade de 9 ou 10
   requisições; teste com 12 simultâneas passa a depender do timing. Reproduzido: 2 falhas em 20 execuções com 2 CPUs presas e
   2 consumidores de CPU; falha sempre com a pista pequena forçada. Já caiu uma vez no CI (`856e399`).
3. **B1: botão "Mostrar senha" some no Firefox e no WebKit** em telas estreitas (medido e visto em captura). Todo campo de senha do app.

Tudo o mais que foi pedido passou. O que passou está contado abaixo.

## Resumo por item

| Item | Resultado |
|---|---|
| 1. Migrações 0001 a 0021 + suíte completa | Migrações: 21 aplicadas do zero, segunda execução 0 novas. Suíte: **323/323** (81 suítes) em **6 de 6** execuções. Mas CI vermelho e teste de concorrência frágil (abaixo). |
| 2. M-3 de ponta a ponta | **108/108** na API real, mais **11/11** (API sem URL dos textos), mais canário. Tudo provado, com 1 ressalva do que não dá para provar por HTTP. |
| 3. A-1 sob carga | **Passou** (healthz e login do admin dentro dos limites, 6 execuções). Achado baixo: o 503 gasta tentativa na rajada simultânea. |
| 4. B1 no export web | Guardas 55/55; códigos naturais do mock 19/19; 208/210 estados forçados; teclado e 320 px: Chromium 158/161, Firefox 149/161, WebKit 149/161. Achados abaixo. |
| 5. CI do SHA | **Vermelho.** Por job: check verde, **api vermelho**, backup verde, ci-ok vermelho. |

## 1. Migrações e suíte completa da API

Migrações (script oficial `npm run migrate`, build compilado, banco novo): `0001` a `0021` aplicadas (21), segunda execução: "0 migrações novas, 21 no total".

Suíte (`npm test`, mesmo ambiente do job `api` do CI: `NODE_ENV=test`, `ALLOWED_ORIGINS`, `ADMIN_ALLOWED_ORIGINS`):

| Execução | Banco | CPUs | Duração | Resultado |
|---|---|---|---|---|
| r1 | novo | 24 | 174 s | 323 testes, 323 passaram |
| r2 | o mesmo da r1 | 24 | 165 s | 323/323 |
| r3 | o mesmo | 24 | 167 s | 323/323 |
| aff-1 | novo | **2** | 193 s | 323/323 |
| aff-2 | o mesmo | 2 | 193 s | 323/323 |
| aff-3 | o mesmo | 2 | 196 s | 323/323 |

"2 CPUs": `start /affinity 3` pendura o shell no Git Bash; usei o equivalente (PowerShell com `ProcessorAffinity = 3`, filhos herdam).
Conferido: o Node passou a ver `availableParallelism() = 2` e o pool a usar 1 thread.

### Flakiness dos testes de tempo (pool e rajada)

Locais, sem falha em nenhuma das medições abaixo (o oposto do CI):

| Medição | Execuções | Resultado | Limite do teste |
|---|---|---|---|
| `bcrypt-pool` + `bcrypt-ceiling` repetidos, 2 CPUs | 15 de 15 verdes | `/healthz` pausa máxima 59 a 78 ms; login do admin 37 a 101 ms | 200 ms e 400 ms |
| idem, 4 CPUs | 10 de 10 verdes | `/healthz` 60 a 71 ms; admin 22 a 48 ms | idem |
| Réplica da medição do teste do pool (`monitorEventLoopDelay`), Windows, 2 CPUs | 25 | pausa máxima do laço: mediana 18,7 ms, máximo 37,6 ms | 250 ms |
| idem, 4 CPUs | 25 | mediana 16,4 ms, máximo 19 ms | 250 ms |
| idem com 2 consumidores de CPU em 2 CPUs (carga 2x) | 12 | máximo 77 ms | 250 ms |
| idem com 4 consumidores em 4 CPUs | 12 | máximo 64 ms | 250 ms |
| Réplica em **Linux** (WSL2, Node 22, `taskset`), 2 e 4 CPUs | 12 + 12 | pausa máxima 5,8 a 15,5 ms; nenhuma asserção falhou | 250 ms |

Margem do limite de 250 ms: 6x a 15x. Não é o laço de eventos que falha localmente.

**Achado novo: a asserção "o trabalho de bcrypt tem que ter acontecido de verdade" (`elapsed > 800`) depende da velocidade da CPU.**
Nesta máquina uma comparação de custo 12 leva 497 a 514 ms (2 threads, 6 comparações: 1,4 s). Emulando uma CPU cerca de 2x mais rápida
(custo 11, Linux, 4 CPUs, 2 threads): `elapsed` 708 a 808 ms e **a asserção falha 6 de 8 vezes**; com custo 10, 8 de 8. O limite de laço
nunca falhou. Isto é uma hipótese para o CI (runner moderno, 4 vCPUs, 2 threads, 3 rodadas de ~0,27 s = 0,8 s), **não provada**:
o CI só publica o nome do teste, não a mensagem da asserção. Ver item 5.

### Teste de concorrência frágil por construção (A-1 contra os testes)

- `identity-email.test.ts` "CONCORRÊNCIA: 12 chutes simultâneos errados não passam do limite de 5 tentativas" **falhou**, no meu ambiente,
  em 2 de 20 execuções com 2 CPUs presas e 2 consumidores de CPU: `Expected values to be strictly equal: 4 !== 7` na contagem de
  `code_expired` (linha 100). Resultado do lote: 4 `invalid_code` + 1 `429` + 4 `code_expired` + **3 `server_busy`**. É o mesmo teste que falhou
  uma vez no CI (run do `856e399`, anotação "not ok 6 - CONCORRÊNCIA: 12 chutes simultâneos errados...").
- Causa: a pista do bcrypt dos apps tem **capacidade = vagas + fila = 1+8 = 9** (até 3 CPUs) ou **2+8 = 10** (4 ou mais). Doze
  requisições simultâneas que passam por bcrypt excedem isso; o excedente recebe `503 server_busy` (comportamento correto do A-1), mas o teste
  confere contagens exatas. Com custo 4 (ambiente de teste) cada comparação leva ~1 ms, então só quebra quando a máquina é lenta e as
  requisições se agrupam: por isso passa em 6 de 6 execuções soltas e falha sob carga.
- Prova de que é a capacidade: com `AUTH_BCRYPT_CONCURRENCY=1 AUTH_BCRYPT_QUEUE_MAX=2` o arquivo falha **2 de 2** (testes "12 chutes",
  "o mesmo código certo em 6 requisições" e "5 redefinições simultâneas").
- Exposto pelo mesmo motivo (não reproduzi falha): `identity.test.ts:294` (12 logins simultâneos). 15 de 15 execuções sob a mesma carga passaram.
- **Corrigir (Vega, com a Íris):** fixar a fila do ambiente de teste acima do maior disparo (por exemplo `AUTH_BCRYPT_QUEUE_MAX=64` em
  `test/helpers/auth-env.ts`), mantendo pista pequena e explícita só nos testes do teto; ou tornar a asserção tolerante a `server_busy`.

## 2. M-3 de ponta a ponta contra a API real compilada

Cenário: banco novo, migração pelo dono, papel restrito `vuumbora_api` com login, `dist/server.js`, `REQUIRE_SECRETS=true`, SMTP falso,
`LEGAL_DOCUMENTS_BASE_URL` com `https`. Roteiro próprio: `scratchpad/iris3/e2e/m3.mjs` e `m3b.mjs` (efêmeros).

**Resultado: 108/108 + 11/11.** O que foi provado:

- **Sem nada publicado (fail-closed):** `GET /v1/legal/current` e cadastro respondem `503 consent_unavailable` (no-store); audience ausente, em
  caixa alta, vazio, "passenger,driver" ou repetido dá 400; nada é criado, nenhum e-mail sai.
- **`legal:publish` com a credencial dona:** `--dry-run` não toca no banco; com a credencial da API é recusado; entradas ruins recusadas
  (versão com espaço, hash do texto vazio, hash curto, documento e perfil inexistentes); republicar a mesma versão e texto = "nada mudou"; mesma
  versão com texto diferente = RECUSADO e o hash original permanece; só um dos dois documentos publicado = 503; perfil independente do outro;
  hash em maiúscula é normalizado para minúscula (informação, não defeito).
- **`GET /v1/legal/current`:** 200, só as chaves do contrato, `sha256` igual ao do arquivo exato, `url = <base>/<doc>/<perfil>/<versão>`,
  `Cache-Control: public, max-age=60`, sem cookie, sem sessão.
- **Cadastro com a versão exibida:** 201 sem token; login antes de verificar = `email_not_verified`; `/me` com `consent {upToDate:true, pending:[]}`
  e sem data de nascimento; no banco, 2 aceites com a versão exibida, perfil e hash vindos do catálogo (o cliente mandando `audience`, hash
  e data extras é ignorado), `accepted_at` do relógio do banco, `ip_hash` HMAC e não o IP.
- **400 `consent_required`** para 9 formas de versão ausente ou malformada; **409 `consent_outdated`** para 5 formas (nunca publicada, trocadas,
  do outro perfil, caixa diferente), sempre com `error.current` idêntico ao do GET, `no-store`, nada criado.
- **Aceite com versão de outro perfil:** motorista com a versão do passageiro = 409 com `current` do **motorista**; passageiro com a do motorista
  = 409; motorista aceitando a do passageiro = 409; nada gravado.
- **Reaceite:** material pede de novo só o documento mudado; editorial não incomoda quem aceitou a material; quem só aceitou a v1 fica pendente na
  **vigente** (não na material); `POST /consents` com a velha = 409, com a vigente = 200, repetida = 200 sem duplicar linha; tudo ou nada
  (Termos certo + Política errada não grava os Termos).
- **Rajada de `/consents` idêntico:** 30 em paralelo, todos 200, exatamente 1 linha. Rajada mista (velha x vigente): velhas 409, vigentes 200, 1 linha.
- **Publicação no meio do cadastro** (corrida determinística, o dono segura `LOCK TABLE account_consents IN SHARE MODE`, o INSERT do aceite
  espera depois da conferência da API, publica-se outra versão, solta-se): o cadastro em voo vira `409 consent_outdated` com a versão nova, e a
  transação desfaz conta, aceite, código e e-mail. O mesmo no `POST /consents`: 409 e nada gravado (nem a Política que estava certa).
  **Canário:** desligando o gatilho `account_consents_append_only` o cadastro em voo vira **201 com versão velha**; logo o meu F3 pega a regressão.
- **Publicações simultâneas do operador:** duas versões do mesmo par entram em fila (uma vigente, `published_at` estritamente crescente); a
  mesma versão e texto duas vezes = uma publica, a outra "nada mudou", 1 linha.
- **Banco:** `vuumbora_api` não insere nem altera o catálogo nem o aceite; nem o dono altera, apaga ou trunca versão publicada (o `TRUNCATE` é
  recusado pelo Postgres por causa da chave estrangeira, antes do gatilho); a view `legal_current_versions` tem 1 linha por par.
- **`/me` com `consent` nulo:** segunda API **sem** `LEGAL_DOCUMENTS_BASE_URL` no mesmo banco: `/me` = 200 com `consent` exatamente `null`;
  `/legal/current` e cadastro e `/consents` = 503 `consent_unavailable`; **login, refresh, logout, logout-all e verify-email seguem funcionando**; o boot
  avisa alto (nível error, `LEGAL_DOCUMENTS_BASE_URL:missing`, só o nome).
- **Nunca bloqueados com aceite pendente:** login, refresh, `/me`, `/consents`, logout e logout-all responderam normalmente numa conta pendente.
- **Log:** nenhum e-mail, data de nascimento, senha ou token no log da API.

**Não provado:** o conjunto bloqueado (`requireCurrentConsent`) por HTTP: nenhuma rota o monta ainda; só a rota de sonda da suíte
(`legal-consent-api.test.ts`) o exercita. O caminho de conta legada (aceite anterior à 0021 virando pendência) não foi refeito por mim fora da suíte.

## 3. A-1 sob carga na API real

Processo separado, TCP de verdade, custo bcrypt 12 (padrão de produção), rajada de 30 `verify-email` de IPs distintos (metade contas reais
não verificadas, metade desconhecidas), com `/healthz` sondado a cada 10 ms e login do admin (`suporte`) durante. Script `a1.mjs`, 3 repetições
em cada configuração.

| Configuração | Rajada de 30 | `/healthz` durante (pausa máxima) | Login do admin durante | Sem carga (quente) |
|---|---|---|---|---|
| API em 20 CPUs (pista 2 + fila 8) | 10 atendidas (400), 20 recusadas (503) | 94,5 / 68,9 / 60,2 ms (limite 200) | 488 / 466 / 467 ms | 496 / 468 / 479 ms |
| API presa a **2 CPUs** (pista 1 + fila 8) | 9 atendidas, 21 recusadas | 118,7 / 92,1 / 63,1 ms | 786 / 742 / 693 ms | 478 / 477 / 468 ms |

Rajada de 60: 10 (ou 9) atendidas e 50 (ou 51) recusadas. Antes da correção o `/healthz` levava 1,9 s de mediana. Todo 503 é estruturado
(`server_busy`, `retryAfterSeconds: 3`, `Retry-After: 3`), imediato (< 400 ms); a rota volta a atender logo depois; login de conta
não verificada responde normal; 150 a 300 sondas de `/healthz` couberam na rajada, todas 200.

Dois achados:

- **Baixo: o 503 gasta tentativa na rajada simultânea.** Contando `login_attempts` antes e depois: 30 linhas para 30 requisições, sendo 10 (ou 9)
  atendidas e **20 (ou 21) recusadas**. A pré-checagem `assertAppBcryptCapacity` passa quando todas chegam juntas; a reserva da tentativa vem
  antes do bcrypt recusar. O comentário em `bcrypt-pool.ts` admite a janela, mas não o custo. Efeito prático pequeno (o limite é 10 por par em
  15 min). **O login não sofre:** 20 recusados repetiram do mesmo IP depois do `Retry-After` e todos entraram (200). Causa: `reserveAttempts`
  antes de `appBcrypt().compare` em `account-recovery-service.ts` (`verifyEmail`, `resetPassword`) e em `createRegistration`.
- **Informação: a "pista própria" do admin não isola CPU com 2 CPUs.** O login do admin durante a rajada leva 45% a 65% mais que sem carga
  (693 a 786 ms contra ~475 ms). Passa por pouco no meu critério (1,5x + 100 ms = ~817 ms). Continua abaixo de 1 s.

## 4. B1 (`apps/passenger`), export web em mock

Dois exports com `expo export --platform web`: perfil `production` (servido em 4372) e dev server `expo start --web` (4375, único lugar com o
gancho `__vuumboraIdentity`, que só existe com `__DEV__`). Roteiros próprios (`b1a` a `b1d`, efêmeros). Playwright em Chromium, Firefox e WebKit.

### Guardas de rota e perfil de produção (`b1a`): 55/55

- Sem sessão, URL direta para as 11 rotas de `(app)` cai em `/boas-vindas`, sem "Unmatched Route" e sem nada do produto na tela;
  `/(app)`, `/(app)/perfil` na URL também.
- Com sessão, as 8 rotas de `(auth)` mandam para a Home; sair de verdade leva a `/boas-vindas`; depois de sair, `/perfil`, `/` e `/historico` voltam
  para as boas-vindas e 6 voltas do navegador nunca mostram o produto; recarregar logado volta ao início (sessão em memória, limite conhecido da A3).
- Perfil de produção: o export **não** tem os chunks `catalogo` nem `mapbox-check`, nem `mapbox-gl`, `@rnmapbox` ou `__vuumboraIdentity`; as
  rotas `/catalogo` e `/mapbox-check` caem em "Unmatched Route". Controles: no dev server `/catalogo` **abre** e o gancho **existe**.
- Fora do que se pediu, vale registrar: o build de **produção** continua com identidade **simulada** (selo "acesso simulado", código 123456) e dado
  de exemplo ("Olá, Juliana" depois de cadastrar "Maria da Silva", etiquetado "nome de exemplo"). Já conhecido (M-3 da Orion 3b); o `HEAD`
  (`0fe8883`, "guarda contra identidade simulada") mexe nisso, **não está neste SHA**.

### Estados de identidade, um por código de erro

- **Códigos naturais do mock, sem gancho (`b1d`): 19/19.** Conta inexistente e senha errada de conta real dão a **mesma frase** (sem oráculo);
  senha certa logo depois de um erro responde espera (como o servidor, 429 mesmo com credencial certa) e depois da contagem entra; `email_taken`
  com as duas ações; menor de idade (2015) não avança; só a Política marcada pede os Termos; conta não confirmada leva ao código; tentativas do código
  4, 3, 2, 1 (singular), esgotado e travado, e nem o código certo entra depois; redefinição sem oráculo, código errado com contagem, senha antiga
  deixa de entrar.
- **Códigos forçados pelo gancho (`b1b`): 208/210**, 48 cenários: login (invalid_credentials, too_many_attempts com e sem corpo, network,
  unavailable, server_busy, unknown, invalid_body, consent_outdated, email_not_verified), cadastro (15 estados), código (10, mais 4 do reenvio),
  esqueci (5) e redefinir (9). Em todos: o texto do estado certo, o aviso anunciado (`role=alert`, ou `status` para o informativo), a
  **mensagem do servidor nunca aparece**, nenhuma frase fala em "bloqueada", ação certa oferecida, contagem regressiva com botão
  desabilitado e volta sozinha, digitar outro e-mail libera, toque duplo mais Enter = **1 chamada**. 2 reprovações = achados F6 e F7 abaixo.
- Limites da idade com relógio instalado antes de carregar (mock, fluxo completo): 29/02/2008 em 28/02/2026 menor, em 01/03/2026 aceita;
  22/11/2008 em 22/11/2026 (18 hoje) aceita, 23/11/2008 menor; datas impossíveis, anteriores a 1900 e futuras recusadas. Passou nos 3 motores.

### Foco, teclado e 320 px (`b1c`)

Chromium 158/161, Firefox 149/161, WebKit 149/161. O que passou: ordem do Tab (Voltar, e-mail, senha, "Mostrar senha", esqueci, entrar, cadastre-se),
anel de foco em todas as paradas nos 3 motores, Shift+Tab, Enter no e-mail vai para a senha, "Mostrar senha" por Space e Enter, Enter na senha envia,
máscaras de data e celular (digitação, Backspace, letras ignoradas), caixa de aceite por Space, código só dígitos e no máximo 6, sem rolagem
horizontal e sem alvo menor que 24 px de 320 a 430 px nas 6 telas públicas, telas com todos os erros a 320 px, campos com fonte de 16 px ou mais.

## Achados

Severidade segundo o que o dono perde. Nenhum é crítico. "Quem corrige" vai para o Atlas.

| Id | Sev. | Onde | O que | Causa | Quem |
|---|---|---|---|---|---|
| F1 | **Alta (bloqueia)** | CI, `bcrypt-pool.test.ts` | CI vermelho em 4 de 4 execuções depois do ajuste | Não provada. Hipóteses: (a) `elapsed > 800` depende da CPU (provado sensível: 6 de 8 falhas emulando CPU 2x mais rápida); (b) laço de eventos em runner Linux (não reproduzi em Linux local). O CI não imprime a mensagem da asserção. | Vulcano (CI), Vega/Íris (teste) |
| F2 | **Alta (bloqueia)** | `identity-email.test.ts:93`, `identity.test.ts:294` | Concorrência com 12 simultâneas falha sob carga (reproduzido 2/20; sempre com pista pequena; caiu 1x no CI) | Capacidade da pista (9 ou 10) menor que o disparo; teste confere contagem exata | Vega, Íris |
| F3 | **Média** | `packages/ui/src/InputCore.tsx` | "Mostrar senha" some no Firefox (<= 373 px) e WebKit (<= 365 px). Firefox 320: botão em x=320..373 fora da tela; WebKit 320: x=313..365 | `<input>` em linha flex sem `minWidth: 0`: ganha a largura intrínseca (253 px no Firefox, 246 no WebKit; no Chromium encolhe para 176) e empurra o acessório para fora do campo, que corta. Atinge toda `PasswordInput` (login, cadastro, código, redefinir) | Lyra |
| F4 | Baixa | `account-recovery-service.ts`, `identity-service.ts` | 503 `server_busy` gasta tentativa do par na rajada simultânea (20 de 20 recusadas gravaram) | Reserva antes do bcrypt; a pré-checagem não cobre chegada simultânea | Vega |
| F5 | Baixa | telas de conta | Depois de todo envio com erro o foco vai para o `<body>` (48 de 48 cenários forçados no Chromium; teclado real, Enter na senha, nos 3 motores) | Campos e botão ficam desabilitados durante o envio e o foco não volta. No Chromium o Tab seguinte continua perto do ponto anterior; leitor de tela recebe o `role=alert` | Lyra |
| F6 | Baixa | `codigo.tsx`, `cadastro.tsx` | Ao chegar no código o foco não vai ao campo do código; envio vazio deixa o foco no botão (não vai ao primeiro campo com erro) | Sem foco programático na entrada da tela nem no resumo de erros | Lyra |
| F7 | Baixa | `esqueci-senha.tsx` | `invalid_email` do servidor aparece no aviso geral e o campo não fica `aria-invalid` (no cadastro fica) | A tela só usa `AuthErrorAlert` e não faz `setError` no campo | Lyra |
| F8 | Baixa | export de produção | "Unmatched Route" em inglês com link "Sitemap"; `/_sitemap` abre em produção ("System Information", Expo SDK 58.0.0, origem) | Padrões do Expo Router; sem `+not-found` nem rota própria | Lyra |
| F9 | Baixa (futuro) | `(auth)/termos`, `privacidade` | Termos e Política só abrem deslogado (guarda do grupo `(auth)`); o reaceite do M-3 precisará lê-los logado | Desenho da guarda | Lyra (B3) |
| F10 | Informação | `authErrors.ts` | `server_busy` (503 do A-1) cai em "Serviço indisponível"; `consent_outdated` (409 do M-3) cai em "Algo deu errado" | Sem estado próprio (já previsto: M-2, B3) | Lyra (B3) |
| F11 | Informação | `identityClient.ts` | Perfil de produção ainda usa identidade simulada e dado de exemplo | Conhecido (M-3 da Orion 3b); tratado no `HEAD` | Lyra |
| F12 | Informação | `cadastro.tsx` | "Entrar na minha conta" (após `email_taken`) abre o login com o campo e-mail vazio | `router.push('/login')` sem `loginHint` | Lyra |

## 5. CI do SHA

Sem login: a API anônima do GitHub deu 403 (limite por IP, reinicia às 00:55). Usei as páginas públicas `github.com/InnovareCode/VuumBora/actions` e
`.../actions/runs/<id>`, que trazem a conclusão de cada run e o painel "Annotations".

**Run `44980195998`, push de `1707546`, 03:20 UTC, duração 1 min 57 s: FALHOU.**

| Job | Resultado | Duração |
|---|---|---|
| `check (fronteiras, contexto docker, typecheck)` | verde | 51 s |
| `api (build, migracoes e testes contra Postgres e Redis reais)` | **vermelho** | 1 min 49 s |
| `backup e restauracao (ensaio com contagem de linhas)` | verde | 38 s |
| `ci-ok` | vermelho (consequência) | 2 s |

Anotações (6 erros, 3 avisos): `Process completed with exit code 1`; `testes do apps/api falharam (exit 1); os nomes estao nas anotacoes acima`;
**`not ok 11 - o laço de eventos não é ocupado pelo bcrypt`**; **`not ok 1 - 6 comparações de custo 12 em paralelo: o atraso máximo do laço fica abaixo de 250 ms (na principal passava de 1 s)`**;
mais as duas de `ci-ok`. Os 3 avisos são "Node.js 20 is deprecated" dos três jobs (`actions/checkout@v4` e `actions/setup-node@v4`).
O mecanismo de nomear o teste que falha **funciona**; falta a mensagem da asserção.

Histórico próximo (todas vermelhas desde o A-1): `44976574180` (A-1), `44978946551` (também erro de `check`: `simulateAuthRequest`), `44979263693`
(limite de 100 ms), `44980195998` (este SHA, 250 ms), `44981490141` (`856e399`: o teste do pool **e mais dois**, "verificar e-mail" e "CONCORRÊNCIA: 12 chutes..."),
`44981962696` (`0fe8883`) e `44982942248` (`d63137a`, o `HEAD`): o mesmo teste do pool em todas as cinco que têm o nome nas anotações
(`44979263693` em diante; as anteriores não nomeavam o teste, e a `44976574180` eu não abri). O commit `d63137a` tenta publicar o bloco da falha,
mas a anotação "detalhe da falha" mostra o **fim** da saída TAP (um teste que passou), não o bloco `error:` do teste que falhou.

**Conclusão:** falha determinística no CI, ausente em 100% das minhas medições locais. O ajuste do `148dc8d` (limite de 100 para 250 ms e threads
por CPU) não mudou o resultado: isso enfraquece a hipótese do laço de eventos como causa. A causa continua **não provada**.

## O que precisa mudar para aprovar

1. **Vulcano:** fazer o passo "Testes do apps/api" imprimir o bloco `error:` do teste que falhou (a mensagem da asserção), não o fim do TAP.
   Com ela decide-se entre as hipóteses de F1. Sem isso qualquer novo ajuste do limite é chute.
2. **Vega (com a Íris):** F1, tornando o teste do pool independente da velocidade da CPU (limite do `elapsed` proporcional ao custo medido, ou
   remover o limite inferior e provar "trabalho real" de outro modo) e do ruído do runner (p99 em vez de máximo). F2: fila do ambiente de teste
   acima do maior disparo.
3. **Lyra:** F3 (`minWidth: 0` no `InputCore`), com prova no Firefox e no WebKit a 320 e 360 px. F5 a F9 e F12 podem entrar na mesma leva.
4. **Vega:** F4 se o dono quiser a invariante "503 não gasta tentativa" também na rajada (hoje só vale com a pista já cheia).
5. Depois, a Íris repete: CI verde no SHA novo, suíte 3x com 2 CPUs presas e 20 repetições do arquivo de concorrência sob carga.

## Pendências (valem depois)

- Causa do CI vermelho (F1): depende da mensagem da asserção.
- B1 em aparelho de verdade (Android e iOS), leitor de tela (NVDA, VoiceOver, TalkBack), Safari do iPhone (o WebKit do Playwright não é o do iOS).
- O conjunto bloqueado por aceite pendente (`requireCurrentConsent`) por HTTP, quando existir rota de compromisso.
- Caminho de conta legada (anterior à 0021) fora da suíte.
- SMTP real com TLS, produção (papel restrito, proxy, `TRUST_PROXY`), imagem Docker.
- Rodar as repetições de tempo num runner Linux de CI de verdade (a réplica foi em WSL2, mesma CPU).

## Reprodução (efêmero)

Scripts em `scratchpad/iris3/` (não versionados): `suite.sh`, `aff-suite.ps1`, `aff-loop.ps1`, `aff-loop2.ps1`, `e2e/{m3,m3b,a1,login-burst,canary-f}.mjs`,
`e2e/{b1a,b1b,b1c,b1d}.mjs`, `e2e/probe-pool.mts`, `wsl-probe/probe.mjs`. Resultados em JSON em `scratchpad/iris3/res/`.
