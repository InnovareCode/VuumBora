# Veredito da Íris, S1, passada 6

**VEREDITO: APROVADO, com ressalvas (nenhuma bloqueia; ver "Achados" e "Pendências").**

**Vale só para o commit `818d655` (SHA completo `818d6551ad55dd4c338a4bee6496c9c0a330b887`, "fix(ui,apps): anel de foco de teclado em todos os alvos do WebKit, leitura em fluxo do texto legal, senha sem autocorrecao e perfil de build so do ambiente real").**
Provado em cópia limpa (`git archive 818d655`, `npm ci` com Node 22.23.5, o do CI), sem `.env`, em 22/11/2026 entre 11:08 e 12:30 (horário da máquina). O `HEAD` andou durante a passada, até `b772963` no último conferido (7 commits: 6 de documentação e 1 de CI, `.github/workflows/ci.yml` passa a rodar também em branches `fatia/**`); `git diff 818d655..HEAD -- apps packages scripts package.json package-lock.json` está **vazio**, então nada do que foi provado aqui deixou de valer por causa disso. A árvore de trabalho tem arquivos de `apps/api` modificados e **não commitados** por outras frentes: **não foram validados** (eu só provei a cópia limpa do commit).

Ambiente: Postgres 18.1 próprio na porta 5470 (UTF-8), API real compilada (`dist/server.js`, papel restrito `vuumbora_api`, SMTP falso), Windows 10, Xeon E5-2650 v4 (24 CPUs lógicas). Navegadores: Chromium, Firefox e WebKit do Playwright. Exports web de produção em 4470 (passageiro) e 4471 (motorista), Metro de desenvolvimento em 4475 e 4476. Tudo derrubado ao fim (ver "Limpeza").

## Condições de cada medição (antes e depois do aviso de ruído)

O Atlas avisou às **12:12** que a máquina deixou de ficar quieta (cinco frentes em paralelo). Antes disso a carga era só a minha. Cada medição de tempo está marcada:

| Medição | Quando | Condição |
|---|---|---|
| Suíte da API r1 (banco novo) e r2 (mesmo banco), sem afinidade | 11:10 a 11:17 | máquina quieta (eu só escrevia roteiros) |
| Suíte presa a 2 CPUs, aff-1 e aff-2 | 11:18 a 11:26 | CPUs 0-1 presas; minhas medições leves nas CPUs 4-11 |
| Suíte presa a 2 CPUs, **aff-3** | 11:26 a 11:32 | **carga minha pesada em paralelo** (dois `expo export` simultâneos, cópias de pacote, mutantes): 1 falha, ver Q4 |
| Suíte presa a 2 CPUs, aff-4 e aff-5 | 11:34 a 11:42 | **máquina quieta de novo** (nada rodando além do teste) |
| `/healthz` com banco derrubado e religado | 11:42 | máquina quieta |
| Baterias de navegador, mutações, canários | 11:51 a 12:30 | carga minha em paralelo nas CPUs 4-23; **depois das 12:12 também a das cinco frentes do Atlas** |

Nenhum item de tempo ficou vermelho depois das 12:12.

## Resumo por item

| Item | Resultado |
|---|---|
| 1. CI do SHA | **Verde**: run `45030995992`, 4 de 4 jobs. Suíte da API **432/432** em banco novo, 2ª vez no mesmo banco e 3 vezes presa a 2 CPUs: 6 de 7 execuções verdes (a vermelha é a aff-3, sob carga minha; Q4). api-client **220/220 x3**, packages/ui **119/119 x3**. **Liberado**, com Q4. |
| 2. Limites por IP em duas classes | **Todos os números pedidos medidos com a API real** (31º refresh passa e 101º dá 429; /64 do mesmo /48 não dividem cota; login passa no 100º e dá 429 no 101º; o teto do /48 não conta o pedido que o /64 recusou, nas duas classes; cada 429 deixa log `rate_limited` com a rota e sem IP). **10 de 10 mutantes mortos**. **Liberado.** |
| 3. B5, B7, B8 | **Liberados**: 400 `invalid_refresh_body` / `invalid_body` nos casos pedidos e cliente real só encerra a sessão pelos dois códigos certos; cache negativo do GET legal volta a 200 em ~3 s e cadastro/reaceite nunca leem do cache; `/healthz` com cache de 2 s; `bcrypt_busy` com `reason`. Achados Q2 e Q3 (baixos). |
| 4. Foco, Q4, B1, B6, B3 | **Liberados no escopo pedido** (alvos do `useFocusRing`, 3 motores, 2 apps). Achado Q1 (média, **fora do escopo dos 32 alvos e já registrado pela Lyra**): `Pressable` que não usa o hook seguem sem anel no WebKit. |
| 5. Identidades ponta a ponta e guarda de rota | **Liberado**: guardas 46/46 e 28/28 x3 motores, reaceite, F3, F5-F12, A3 (nenhum token em armazenamento do navegador), M-3 contra a API real, e fluxo completo com o **cliente real** contra a **API real** (30/30). |

## 1. CI e suítes

Run `45030995992`, push de `818d655` na `main`, 14:06:25Z a 14:09:03Z (2 min 38 s), `success`. Job `api` 2 min 31 s (passo "Testes do apps/api" 105 s), `check` 52 s (inclui "Testes do api-client" e "Testes do packages/ui"), `backup` 33 s, `ci-ok`. Anotações: 3 avisos de depreciação do Node 20 das ações do GitHub, **nenhuma** anotação de teste. Uma execução só (o log do job exige login; a API anônima limita a 60 consultas por hora).

| Execução | Condição | Resultado | Duração |
|---|---|---|---|
| r1 | banco novo, sem afinidade, quieta | **432/432** | 223 s |
| r2 | mesmo banco da r1, sem afinidade, quieta | **432/432** | 218 s |
| aff-1, aff-2 | presa a 2 CPUs (`availableParallelism` = 2), banco novo e mesmo banco | **432/432 x2** | 249 e 250 s |
| aff-3 | presa a 2 CPUs, mesmo banco, **sob carga minha** | **431/432** (1 falha, ver Q4) | 362 s |
| aff-4, aff-5 | presa a 2 CPUs, mesmo banco, **quieta** | **432/432 x2** | 251 e 247 s |

`packages/api-client` 220/220 e `packages/ui` 119/119, três execuções de cada, nas CPUs 4-11.

## 2. Limites por IP (`apps/api/src/lib/ip-rate-limits.ts`), API real com os limites no PADRÃO

Roteiro `ip6.mjs`, cada experimento com endereços próprios (a API roda com `TRUST_PROXY=1`, o endereço vai em `X-Forwarded-For`). Níveis: **rodado de ponta a ponta com a coisa real** (processo separado, TCP, papel restrito).

| Pedido | Medido |
|---|---|
| 31º refresh do mesmo IPv4 não dá 429; 101º dá | 100 respostas 401 e a 101ª 429 `rate_limited`; `Retry-After` presente; mensagem fixa |
| logout e logout-all do mesmo IPv4 | 40 de cada sem 429 (rotas de sessão, só o global) |
| dois /64 do mesmo /48 não dividem cota de refresh | /64 A esgota no 101º; o /64 B passa os 100 seguintes e esgota no seu 101º |
| login do mesmo IPv4 | do 1º ao 100º 401; o **101º dá 429**; `Retry-After` > 60 s depois de 65 s (janela de 15 min, o global de 1 min já teria zerado); o mesmo IP ainda passa em `forgot-password` e `refresh` (contador por rota) |
| teto do /48 (credenciais, 1000 por rota) não conta o pedido que o /64 já recusou | /64 A: 100 passam e 30 recusados; os 9 /64 vizinhos passam **os 900** pedidos; o 1001º do bloco dá 429; outra rota do mesmo bloco ainda passa |
| o mesmo para a classe de sessão (teto de 3000 por minuto) | /64 A: 100 + 30 recusados; 29 /64 passam os 2900; o 3001º dá 429 |
| teto de sessão do /48 com 31 /64 de 100 pedidos | exatamente 3000 passam e 100 dão 429; outro /48 não é afetado |
| fronteira sob concorrência (50 simultâneos) | 150 refresh do mesmo IPv4: exatamente 100 passam e 50 dão 429; 1100 pedidos no mesmo /48: exatamente 1000 e 100 |
| corpo ilegível não gasta o teto do bloco | 1080 pedidos de JSON quebrado respondem 400; logo depois um pedido válido de outro /64 passa |
| log `rate_limited` | 147 respostas 429 do plugin e do teto = 147 linhas `{"event":"rate_limited","route":...}` (115 refresh, 1 login, 31 forgot-password); as linhas só têm `level,time,pid,hostname,reqId,event,route`: **nenhuma tem IP**. As outras linhas do mesmo pedido também não trazem o IP do cliente |
| formas de IP | IPv4 e IPv4 mapeado (`::ffff:`, maiúsculas, hexa, forma longa), IPv6 em maiúsculas/minúsculas/zeros à esquerda/`%zona`, e 101 endereços diferentes do mesmo /64 caem no **mesmo balde**; dois IPv4 vizinhos **não** dividem |
| cabeçalhos | `Forwarded`, `X-Real-IP`, `CF-Connecting-IP`, `True-Client-IP` e `X-Client-IP` não mudam o balde. Com `TRUST_PROXY=false` e atrás de um proxy que anexa o endereço do socket, o cliente não escolhe o próprio balde |

**Mutação** (troca no JS compilado da API, API real subida a cada vez, as seções do meu roteiro): **10 de 10 mortos** (teto em `onRequest`, teto por /64, teto compartilhado entre rotas, sessão de volta a 30 por rota, teto uma unidade abaixo, sem `Retry-After`, teto que nunca recusa, credenciais sem cota por rota, credenciais com chave /48, guarda IPv6 invertida). O M8 (sem cota por rota) **sobreviveu** às seções de refresh e do teto porque o limite global (100 por minuto) dá o mesmo resultado dentro de 1 minuto; morreu quando acrescentei a espera de 65 s e o contador por rota (`E3`).

Observação de dependência de topologia (não é defeito de código, já conhecida): com `TRUST_PROXY=1` e a API alcançável **sem** o proxy na frente, o endereço do cabeçalho é do cliente e todo limite por IP deixa de valer; valores do cabeçalho que não são IP válido (por exemplo com porta) viram balde próprio. Só o proxy real de produção resolve; **TRUST_PROXY segue sem prova em produção**. Contadores em memória: valem por réplica.

## 3. B5, B7 e B8

**B5** (API real, `b5refresh.mjs`): corpo `{}`, sem `refreshToken`, curto (< 20), longo (> 200), número, `null`, array e string JSON dão **400 `invalid_refresh_body`**; refresh bem formado e inexistente dá 401 `invalid_refresh_token`; `application/xml`, formulário, corpo de 11 KB, de 20 KB e de 200 KB, JSON ilegível, corpo vazio e `__proto__` dão **400 `invalid_body`**; `logout` com `{}` continua `invalid_body`; o corpo do erro não ecoa o que foi enviado. **Cliente real (`api-client` em modo http) contra a API real**: refresh guardado malformado → a API devolve `invalid_refresh_body` e o cliente **encerra** a sessão e limpa o armazenamento; refresh guardado de 20 KB → a API devolve `invalid_body` e o cliente **não encerra** e o armazenamento fica intacto; refresh bem formado e desconhecido → encerra (controle); sessão real com acesso inválido → renova pelo refresh real. Achado Q2.

**B7, cache do GET legal** (`b7legal.mjs`, API com `LEGAL_CACHE_MAX_AGE_SECONDS=6`, banco recriado e vazio): sem nada publicado o GET dá 503 `consent_unavailable` com `no-store`; ao publicar a primeira versão com `legal:publish` o GET volta a 200 **2,99 s** depois do 503 guardado (passageiro) e **3,06 s** (motorista), medidos com sonda de 60 ms a partir da resposta do 503 (o prazo de 3 s conta do início da consulta); o cadastro feito **logo depois de publicar, dentro dos 3 s, deu 201** enquanto o GET ainda dava 503 (controle de que o cache negativo existe e o cadastro não o lê). O cache positivo (TTL 6 s) segue mostrando a versão velha depois de publicar a nova e, nesse intervalo, **cadastro com a versão do cache dá 409 `consent_outdated` com a vigente, cadastro com a nova dá 201, reaceite idem**; 40 GET simultâneos com o cache vencido fazem 1 leitura no banco, e 10 cadastros fazem 10. 23/23. Perfil inválido dá 400 e não cria entrada.

**B7, `/healthz`** (banco do meu cluster derrubado e religado): 13 500 chamadas em 6 s fizeram **3 consultas** `SELECT 1` ao banco, 2 s entre elas (contado pelos horários do log do Postgres; o contador do meu roteiro estava com a regex em inglês e o log do Postgres é em português, então a contagem automática deu 0 e o item H2 ficou vermelho por defeito do **roteiro**, não do produto). Com o banco fora o `/healthz` virou 503 **1,93 s** depois de a porta fechar; 30 chamadas simultâneas respondem 503 em menos de 1,5 s; com o banco de volta o `/healthz` voltou a 200 em 103 ms e o **GET legal em 11 ms** (o erro de banco não fica guardado); com o banco de pé e sondas a cada 100 ms por 5 s, nenhum 503 espúrio.

**B8** (API real com pista de 1 vaga + 1 de fila + 1 por origem): 6 simultâneos do mesmo IP = 1 atendido e 5 recusados, 5 linhas `bcrypt_busy` com `reason=origin`; 10 de IPs diferentes = 2 atendidos e 8 recusados, 8 linhas com `reason=capacity`; o corpo do 503 não traz o motivo; as linhas têm só `level,time,pid,hostname,reqId,event,lane,reason` (sem IP, sem HMAC de 64 hex, sem e-mail). **Não provado em processo real:** `reason=closing` (desligamento gracioso); fica só nos testes unitários.

## 4. Foco, Q4, B1, B6 e B3

**Foco (`ring6.mjs`).** Para cada tela dos dois apps no export de produção (mock) anda de Tab em Tab, e em cada alvo compara o recorte focado com o desfocado: por lado (topo, base, esquerda, direita) a fração de posições com pixel mudado em contraste >= 3:1 contra o pixel que estava ali (>= 60% nos quatro lados); controle de mouse (pressionar sem soltar, soltando fora) não pode desenhar o anel. Campos de texto ficam para o roteiro de campos (`ring.mjs`, 66/66 e 72/72 nos 3 motores).

| App / motor | Alvos medidos | Anel por Tab | Mouse sem anel |
|---|---|---|---|
| passageiro, Chromium | 74 | 71 | 74/74 |
| passageiro, Firefox | 74 | 71 | 74/74 |
| passageiro, WebKit | 76 | **52** | 76/76 |
| motorista, Chromium | 42 | 40 | 42/42 |
| motorista, Firefox | 40 | 38 | 40/40 |
| motorista, WebKit | 42 | **33** | 42/42 |

Todos os alvos das telas de autenticação (botões, Voltar das duas famílias de cabeçalho, "Mostrar senha", caixas de aceite, links, ações), a barra de abas, as linhas de lista do perfil e das configurações e o botão de sair têm anel nos **quatro lados nos três motores** (WebKit incluído). **Canário:** com `:focus-visible` desligado e os contornos removidos, **todos** os 13 alvos de login e cadastro reprovam no Chromium e no WebKit, e o mouse segue limpo: o detector enxerga a falta de anel. Ver Q1 para o que falta.

**Q4, links por Enter (`q4.mjs`).** Cada `role=link` visível de cada tela (login, cadastro, esqueci a senha, termos, privacidade, código, redefinir, aviso de e-mail já cadastrado, boas-vindas) em página nova: **Enter ativa**, Espaço não ativa, Alt+Enter não ativa, segurar Enter empilha no máximo 1 entrada de histórico, e o clique do mouse ativa (controle). **55/55 (passageiro) e 45/45 (motorista) nos 3 motores.** Canário: com o `keydown` do Enter engolido, o Enter reprova.

**B1, `fetchVerifiedText` em fluxo** (`b1real.mjs`, `fetch` real do Node contra servidor meu): corpo **sem fim** e sem `Content-Length` → `too_large` em 32 ms, o servidor enviou 2,8 MB e a conexão foi cancelada; corpo finito de 50 MB → `too_large` com 2,8 MB enviados; `Content-Length` de 50 MB → `too_large` sem ler (< 8 MB); servidor que aceita e nunca responde → `timeout` em ~400 ms e conexão abortada; corpo que pinga sem fim → `timeout`; **`fetch` que ignora o aborto e nunca resolve → `timeout` em ~300 ms (não pendura)**; leitor que trava e ignora o cancel → `timeout` com o cancel chamado; sem corpo em fluxo (como o `fetch` do React Native) cai no `arrayBuffer()` (2 MB = `too_large` depois de ler); redirecionamento de origem, hash divergente, UTF-8 inválido com hash batendo, `http` fora de desenvolvimento e 404 recusados; nenhum temporizador sobra. **18/18.** **Mutação** (9 mutantes + controle, rodando os 51 testes unitários do pacote e o meu roteiro): **9 de 9 mortos** (sem fluxo, sem `Promise.race`, sem cancelar no teto, sem a checagem do `Content-Length`, sem a parada por `stopped`, temporizador não limpo, prazo que não rejeita, teto 100x, aceita outra origem). Dois só morrem nos unitários (`Content-Length` e `stopped`); o do fluxo morre por travamento do teste unitário (20 s) e pelo meu roteiro. **Não provado:** no aparelho real o `fetch` do RN não tem corpo em fluxo, então lá o teto vale pelo `Content-Length` e pela conferência depois (o próprio código diz isso); nada rodado em aparelho.

**B1 no navegador** (`b6.mjs`, o componente `VerifiedTextView` real com servidores de texto meus): **63/63 em cada app nos 3 motores.**

**B6, autocorrect e spellcheck na senha** (`b6pw.mjs`, export de produção): nas **8 telas** (login, cadastro, código e redefinição, em cada app) o `<input>` de senha tem `autocorrect="off"` e `spellcheck="false"` **oculto, visível (depois de "Mostrar senha") e de novo oculto**, e todo input de senha visível da tela também. Controle: o campo de nome do cadastro **não** tem `autocorrect="off"` (a regra é só da senha, e o detector vê atributo ausente). **21/21 nos 6 apps x motores.**

**B3, `expo export` de produção** (`b3.mjs`, 13 linhas por app, ambiente mínimo, uma exportação por vez, repetido): escape **só** em `.env.local`, `.env`, `.env` da raiz, `.env.production.local` ou `.env.production` → **a build ABORTA** (exit 1) e o aviso lista só os **nomes** ("veio de um arquivo .env e foi IGNORADA"); o valor do arquivo nunca aparece na saída. Escape no **ambiente real** → exporta (exit 0) e o bundle **não** tem as telas de desenvolvimento (controle: o perfil `preview` as mantém e o detector as encontra). Arquivo tentando rebaixar o perfil para `development` ou `preview` é ignorado. Sem perfil no ambiente (derivado de `NODE_ENV`) com escape só em arquivo → aborta. Escape vazio ou `true` no ambiente → aborta. **13/13 nos dois apps, duas vezes.**

## 5. Identidades ponta a ponta e guarda de rota

Export de produção (mock) e dev server (gancho), 3 motores, nos dois apps:

| Roteiro | Passageiro | Motorista |
|---|---|---|
| guardas de rota (sem sessão, com sessão, depois de sair, Voltar, recarregar, telas de dev, reaceite) | 46/46 x3 | 28/28 x3 |
| reaceite (o portão segura, aceitar libera, sair funciona, não pede de novo) | 10/10 x3 | 9/9 x3 |
| F3, "Mostrar senha" visível e clicável em 320 a 390 px | 36/36 x3 | 36/36 x3 |
| F5, F6, F7, F8 e F12 (foco depois de envio com erro, erros por código) | 35/35 x3 | 35/35 x3 |
| A3 web (nenhum token em localStorage, sessionStorage, cookie, IndexedDB, Cache Storage) | 38/38 x3 | 38/38 x3 |

**API real, M-3 ponta a ponta** (`m3.mjs` + `m3b.mjs`, banco recriado, cache do GET desligado para o roteiro ver cada publicação na hora): **106/108**, mais 11/11 na API sem a URL base dos textos. As 2 falhas (B13) são do meu ambiente: esperam `max-age=60` e eu subi a API com TTL 0; com o TTL padrão o cabeçalho é `public, max-age=60` (conferido com a API subida de novo).

**Cliente real + API real + SMTP falso** (`clientflow.mjs`, os dois perfis): textos vigentes → cadastro com as versões exibidas → código recebido por e-mail → verificar → login errado e certo → `me` em dia → operador publica versão nova → `me` mostra o aceite pendente sem derrubar a sessão → cadastro com a versão velha dá `conflict`/`consent_outdated` com a vigente → reaceite com a versão velha dá `conflict` → reaceite com a vigente deixa em dia e é idempotente → logout confirmado pelo servidor → o refresh de antes do logout dá 401 → a mesma conta não entra pelo app do outro perfil. **30/30.** Os apps ainda usam identidade simulada (B4): esta é a prova da camada que eles vão usar, não dos apps conectados.

## Achados (nenhum bloqueia)

- **Q1 (média, só web/WebKit, fora do escopo dos 32 alvos, já registrado pela Lyra como aberto):** os `Pressable` que **não** usam `useKeyboardFocusRing` não têm anel de foco no WebKit: 24 ocorrências no passageiro (sino, controles do mapa, cartões de destino, chips de categoria, filtros e cartões do histórico, avatar e ajustes do perfil) e 9 no motorista (Home). No Chromium e no Firefox o contorno nativo aparece, mas **cortado** pelo contêiner nos botões de zoom do mapa (e no chip "Todas" do histórico do passageiro). Não é regressão (o commit declara os 32 alvos).
- **Q2 (baixa):** o 400 de código definitivo `invalid_refresh_body` também sai quando o corpo chega como `text/plain` e quando o POST vem sem corpo e sem tipo de conteúdo; o cliente real sempre manda `application/json`, mas um intermediário que alterasse o tipo ou tirasse o corpo seria lido como "a sessão acabou".
- **Q3 (baixa, dependência de topologia):** ver "Observação" na seção 2; vale lembrar na hora de provar o `TRUST_PROXY`.
- **Q4 (baixa, teste):** 1 falha de 432 na aff-3, em `bcrypt-ceiling.test.ts` (rajada de 30 cadastros: o cadastro de **calibração**, um pedido isolado, recebeu 503 `unavailable`), com a máquina sob carga minha em paralelo; os dois testes de rajada dessa execução levaram 16 s e 21 s (nas outras execuções, menos de 8 s). Causa **não provada** (candidatos: prazo de conexão do banco de 5 s com a máquina e o disco disputados). Nas outras 6 execuções (duas presas a 2 CPUs com a máquina quieta, duas presas com carga leve minha e duas sem afinidade) passou. **Não provado por ruído; o Atlas deve repetir a suíte presa a 2 CPUs com a máquina quieta e, se voltar a falhar, a calibração do teste deve tolerar 1 nova tentativa.**
- **Q5 (informativo, minha cobertura):** meu roteiro do B1 não mata sozinho o mutante da checagem do `Content-Length` nem o do `stopped`; os testes unitários do repositório os matam.

## Pendências (cenários que valem depois)

`reason=closing` em processo real; foco, Enter e `fetch` em aparelho nativo (só provei web); contadores em memória valem por réplica (para mais de uma réplica é preciso um repositório compartilhado); os limites **gravados no banco** (30 cadastros por hora e 20 pedidos de código por hora por endereço) são os que mandam em cadastro e reenvio e continuam mais apertados que os 100 por rota (decisão registrada em `docs/decisoes-do-dono.md`); a medição de bcrypt sob carga real de produção e o `TRUST_PROXY` real.

## O que ainda separa o S1 de produção fechada e de abrir ao público

Nada de **QA** separa o S1 de **produção fechada**. O que resta é de outra natureza: aplicar as migrações 0010 a 0021 em coordenação com API e painel, publicar os textos legais (versões do dono, com o `legal:publish`), provar a produção real (Docker, `TRUST_PROXY`, papel restrito, SMTP com TLS) e **a revisão da Órion sobre o delta `67ea9bd` a `818d655`** (o código novo de `ip-rate-limits.ts`, o fluxo de `fetchVerifiedText` e o perfil de build), que não encontrei. Para **abrir ao público** valem, além disso, os itens abertos do relatório privado da Órion (`docs/privado/`), a identidade real nos apps (B4) com revisão própria e prova em aparelho.

> **Nota do Atlas (22/11/2026):** a revisão do Órion sobre esse delta foi feita no mesmo dia (rodada 3d, fatia F01). Ela fica em `docs/privado/` enquanto houver achado aberto e o repositório for público. Resultado: 0 crítico, 0 alto; o alto da 3c foi dado como resolvido.

## Limpeza

Derrubados ao fim: Postgres 5470, API (3470, 3471, 3474, 3478), proxy, SMTP falso, servidores estáticos, Metro e servidores de texto; junções `node_modules` das cópias de mutação removidas com `rmdir`; `dist/` da cópia restaurado ao original (conferido byte a byte). Nada foi gravado no repositório além deste relatório e da memória da Íris.
