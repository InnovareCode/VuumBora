# Veredito da Íris, S1, passada 5

**VEREDITO: APROVADO.**

**Vale só para o commit `6a3ff24` (SHA completo `6a3ff24773236ea18fec77e655e2850d4ab0986c`, "test(api): limites do /healthz por parada total do laco, e-mail unico entre execucoes e sondagem das rotas do gate (N1, N2, N3 da Iris)").**
Provado em cópia limpa (`git archive 6a3ff24`, `npm ci` com Node 22.23.5, o do CI), sem `.env`, em 22/11/2026 entre 07:41 e 09:15. O `HEAD` foi conferido no começo e no fim: **não andou** (`origin/main` = `6a3ff24` nas duas vezes). Esta passada cobre também, como pedido, o `d7e21e1` (B2 do motorista e anel de foco) e o `100a782` (A3), que a passada 4 não validou.

Ambiente: Postgres 18.1 próprio na porta 5470 (UTF-8), Windows 10, Xeon E5-2650 v4 (24 CPUs lógicas). Navegadores: Chromium, Firefox e WebKit do Playwright. Metro de desenvolvimento nas portas 4475 (passageiro) e 4476 (motorista); exports web de produção servidos em 4470 e 4471; servidores de texto próprios nas 46xx. **Não subi a API real nem o SMTP falso**: nenhum item desta rodada pediu. Tudo derrubado ao fim (portas livres, junções `node_modules` removidas com `rmdir`, nenhum processo meu vivo; matei só o diálogo do Firewall do Windows que meus `node` provocaram).

## Por que aprovei

Os dois defeitos de **teste** que reprovaram a passada 4 estão corrigidos e provados com folga, e todos os itens novos passaram:

1. **N1 (`/healthz` de 200 ms flaky):** `bcrypt-ceiling` **120 de 120 verdes** em 6 condições de 20 (sem afinidade, presa a 2 CPUs e carga 2x, cada uma no mesmo banco e com banco novo). Os outliers de 231 a 289 ms **continuam existindo** (6 de 120 execuções, 5%; com o limite antigo de 200 ms teriam sido vermelhas), mas o limite novo (máximo, mediana e parada total do laço) passa com folga de pelo menos 3,5x.
2. **N2 (não repete no mesmo banco):** 20 de 20 no mesmo banco em cada condição. Canário: com o `uniqueEmail` antigo (sem a marca da execução) a 2ª execução volta a cair, nos mesmos 2 testes (B-1 e F4).
3. **Suíte completa de 384:** verde nas 5 execuções (banco novo, 2ª vez no mesmo banco, 3 vezes presa a 2 CPUs). CI do SHA verde.
4. B2, anel de foco, F3, F5 a F12, guardas, reaceite, N4 e N6: verdes nos 3 motores nos dois apps, com canário em cada detector.
5. A3: 84/84, 8 de 8 mutantes do cofre mortos (inclusive "marcar antes de apagar"), nenhum token em armazenamento do navegador, B-6 por motor.

Os achados novos (Q1 a Q6, abaixo) são **lacunas de teste, de rede de proteção ou de acabamento**; nenhum é defeito de produção provado e nenhum bloqueia. Q1 é o mais importante e eu o deixaria na fila antes de qualquer mexida em `bcrypt-pool.ts` ou nos serviços de identidade.

## Resumo por item

| Item | Resultado |
|---|---|
| 1. CI do SHA | **Verde**: run `45013394294`, 4 de 4 jobs (`api` 2 min 02 s, `check`, `backup`, `ci-ok`). **Liberado** (amostra de 1 execução). |
| 2. Suíte de 384 | **384/384 em 5 de 5** (banco novo, mesmo banco, 3x presa a 2 CPUs). `bcrypt-ceiling` **120/120**. Mutantes do limite novo: ver seção 2. **Liberado**; o limite é um orçamento, não uma garantia (Q1, Q2). |
| 3. Rotas do gate (N3) | As **3 formas** da passada 4 estão fechadas (mortas). **Mais 7 formas escondidas passam** (Q3, baixa). |
| 4. B2, anel, F3, FX, guardas, reaceite | **Liberados**: F3 216/216, FX 629/630 de primeira (1 falha não reproduzida) e 35/35 na reexecução, anel 414/414 (+ canário), guardas e reaceite nos dois apps, "cadastr" só nos dois avisos intencionais. |
| 5. A3, B-6, N4, N6 | **Liberados**: 84/84, 8/8 mutantes mortos, 456/456 (12 execuções), B-6 por motor nos dois apps, N4 e N6 com canário. |
| `d7e21e1` e `100a782` | **Validados nesta passada** (antes: não validados). |

## 1. CI do SHA (liberado)

Run `45013394294`, push de `6a3ff24` na `main`, 10:38:04Z a 10:40:15Z (2 min 11 s), `success`:

| Job | Resultado | Duração |
|---|---|---|
| api (build, migrações e testes contra Postgres e Redis reais) | success | 2 min 02 s (o passo "Testes do apps/api" levou 73 s) |
| check (fronteiras, contexto docker, typecheck) | success | 55 s (inclui "Testes do api-client" e **"Testes do packages/ui"**, 2 s) |
| backup e restauração | success | 35 s |
| ci-ok | success | 2 s |

Uma execução só (a API anônima do GitHub limita a 60 consultas por hora e o log do job exige login). O passo da API levou 73 s no runner contra 212 s na minha máquina: **o runner é bem mais rápido** (ver Q2).

## 2. Suíte de 384 e o limite novo (liberado, com ressalvas de rede de proteção)

### 2a. Suíte completa

| Execução | Condição | Resultado | Duração |
|---|---|---|---|
| r1 | banco novo, sem afinidade | **384/384** | 212 s |
| r2 | **mesmo banco** da r1, sem afinidade | **384/384** | 200 s |
| aff-1, aff-2, aff-3 | presa a 2 CPUs (`availableParallelism` = 2), banco novo na 1ª e o mesmo nas outras | **384/384 x3** | 225, 222, 222 s |

(Primeira tentativa da r1 foi minha: o cluster do Postgres nasceu em WIN1252 e a migração 0002 falhou; recriei com `-E UTF8`. Não conta.)

### 2b. `bcrypt-ceiling` x20 em 6 condições: 120 de 120 verdes

Cada linha é uma sequência de 20 execuções do arquivo `bcrypt-ceiling.test.ts` (14 testes cada). "Mesmo banco" = um banco criado uma vez e reaproveitado; "novo" = `dropdb`/`createdb` a cada execução. As condições "2 CPUs" (CPUs 0-1) e "carga 2x" (CPUs 2-3 mais 2 consumidores de CPU presos a elas) rodaram ao mesmo tempo, com mutantes nas CPUs 4-11 e navegadores nas 12-23; as duas sem afinidade rodaram sozinhas, com a máquina quieta.

| Condição | Banco | Vermelhas | `/healthz` máx (ms): mediana / pior | Parada total do laço (ms): mediana / pior | Login do admin (ms): pior |
|---|---|---|---|---|---|
| sem afinidade | mesmo | **0/20** | 20 / 27 | 0 / 3 | 19 |
| sem afinidade | novo | **0/20** | 20 / 26 | 0 / 2 | 20 |
| 2 CPUs | mesmo | **0/20** | 15 / **241** | 0 / **238** | 305 |
| 2 CPUs | novo | **0/20** | 17 / 24 | 0 / 9 | 56 |
| carga 2x | mesmo | **0/20** | 34 / **272** | 10 / **277** | 354 |
| carga 2x | novo | **0/20** | 27 / **277** | 24 / **289** | 329 |

Limites do teste: mediana do `/healthz` < 50 ms (medido: 1 a 2), máximo < 1000 ms, parada total < 1000 ms, pelo menos 10 sondas (medido: 49 a 167), login do admin < 1000 ms e **terminando com a rajada ainda em curso**. As 6 execuções com outlier (2 em "2 CPUs, mesmo banco", 2 em "carga 2x, mesmo banco", 2 em "carga 2x, banco novo"; máximo de 231 a 277 ms e parada total de 206 a 289 ms) são o fenômeno do N1 (uma parada única do laço, causa **ainda não explicada**) e teriam reprovado o limite antigo de 200 ms; agora passam com folga de 3,5x no pior caso.

### 2c. Mutantes meus contra o limite de parada total

Mutantes em cópia (`repo-mut`), banco novo a cada execução, presos às CPUs 4-11 (`availableParallelism` = 8). Controle (sem mutação) verde nas 3 calibrações. "Custo" é o custo do bcrypt do teste: 12 é o do teste; 11 e 10 emulam uma máquina 2x e 4x mais rápida.

| Mutante | O que faz | Resultado | Quem matou |
|---|---|---|---|
| M1 | bcrypt síncrono na principal, dentro do pool (o teto vale) | **morto** (3 execuções, custos 12, 11, 10) | pré-condição "a pista está ocupada de verdade" (`0 !== 2`), **não** o limite novo |
| M2 | `bcryptjs` assíncrono na principal (fatias de ~100 ms) | **morto** (custos 12, 11, 10) | "só 9 sondas couberam" (piso de sondas, **já existia**) |
| M4 | `verify-email` chama `compareSync` direto, fora do pool | **morto** (suíte de 4 arquivos) | pré-condição `0 !== 2` |
| **M1b** | síncrono na principal **mantendo as vagas ocupadas** (o mutante que só o limite novo pega) | **morto**, custo 12: parada de **2743 e 2734 ms** (2 execuções); custo 11: **1306 ms**; custo 10: **651 ms, passa o teste 2**; custo 9: 211 ms, passa o teste 2 | limite novo (custos 12 e 11). A custo 10 e 9 só o teste 3 ("pista cheia", `201 !== 503`) o mata, **por outro motivo** |
| M3b | 1 de cada 2 operações na principal | morto | pré-condição `0 !== 2` e `401 !== 503` |
| **M3c** | **1 de cada 3** operações na principal, vagas ocupadas | **SOBREVIVE 14/14**: parada de **864 ms** (limite 1000) | ninguém |
| M3 | 1 de 3, sem vagas ocupadas | sobrevive 14/14, parada de 878 ms | ninguém |
| **M5** | `login` chama `compareSync` direto na principal | **SOBREVIVE a suíte inteira, 384/384** | ninguém |
| **M6** | `cadastro` chama `hashSync` direto na principal | **SOBREVIVE 384/384** | ninguém |
| M7 | `redefinir-senha` chama `hashSync` direto | morto (383/384) | teste "verify-email e reset-password reservam o PAR antes do bcrypt" (`0 !== 10`) |
| **M8** | login do admin chama `compareSync` direto | **SOBREVIVE 384/384** | ninguém |

Conclusões honestas: (1) o limite novo **funciona** contra o defeito original (M1b, 2,7x acima do orçamento nesta máquina); (2) ele **vale só para o caminho que a rajada exercita** (`verify-email`): tirar o bcrypt do pool em login, cadastro ou login do admin passa a suíte inteira (**Q1**), porque a rajada só usa `verify-email` e as contas de teste têm hash de custo 4; (3) o orçamento de 1000 ms equivale a ~2 comparações na principal nesta máquina (**Q2**).

Li os 5 pontos de chamada do bcrypt em `src/` (`identity-service.ts` 190, 260 e 300; `account-recovery-service.ts` 177 e 202; `admin-auth-service.ts` 147): **todos passam pelo pool hoje**. O único `bcryptjs` fora do worker é o hash descartável do admin, gerado uma vez no boot. Ou seja, o código está certo; falta a rede que o proteja.

## 3. Rotas do gate de consentimento (N3)

`consent-gate-coverage.test.ts` (15 testes) em cópia (`repo-n3`): acrescento ao app real uma rota autenticada por `requireAccount` por um caminho escondido e a declaro `public` na tabela do teste. Controle sem mutação: 15/15.

| Forma escondida | Resultado |
|---|---|
| `onRequest: requireAccount` (por nome) | **morto** |
| `preHandler` com função anônima | **morto** (a sondagem pelo efeito) |
| `addHook('preHandler', requireAccount)` do contexto | **morto** |
| `addHook('preValidation')` do contexto + `schema.body` | **morto** |
| `addHook('onRequest')` global com teste de prefixo de URL | **morto** |
| **`addHook('preHandler', requireAccount)` do contexto + `schema.body`** | **PASSA** (Q3) |
| **`preHandler` anônimo + `schema.querystring` obrigatório** | **PASSA** |
| **`preHandler` + `schema.params` com `format: uuid` (a sonda usa `x`)** | **PASSA** |
| **autenticação própria que responde 401 com outro `code`** | **PASSA** |
| **autenticação própria que responde 403** | **PASSA** |
| **portão de mentira: função chamada `requireCurrentConsent` que não faz nada, declarada `account-gated`** | **PASSA** (já documentado como limitação (c) do teste) |
| **portão escondido em rota `account-exempt`** | **PASSA** (limitação (b) documentada) |

Causa das formas com `schema`: a sonda chama a rota **sem corpo**, e a validação do Fastify (400 `invalid_body`) acontece **antes** do `preHandler` (que daria 401). Provei que a rota é autenticada de verdade: com corpo válido e sem sessão ela devolve `401 unauthorized`; com o corpo da sonda, `400`. Hoje nenhuma rota real usa `schema` do Fastify (a validação é por zod dentro do handler), então é risco futuro, não atual. Correção sugerida: sondar também com um corpo/consulta mínimo válido, ou tratar qualquer 401/403 sem sessão como "autenticada".

## 4. B2 do motorista e anel de foco (`d7e21e1`), nos dois apps (liberado)

Roteiros próprios, `f3g` e `fx2` (as versões genéricas dos meus `f3` e `fx` da passada 4), contra os exports de **produção** (mock, 4470/4471) e o dev server (gancho `__vuumboraIdentity`), 3 motores x 3 larguras (320, 360, 373 px; o F3 mede também 365, 374 e 390).

| Roteiro | Passageiro | Motorista |
|---|---|---|
| F3 ("Mostrar senha" dentro da tela, no campo e clicável; 4 telas) | **36/36 x3 motores** | **36/36 x3 motores** |
| F5, F6, F7, F8, F12 (foco depois do envio com erro, foco ao chegar no código, `invalid_email`, 404 em português sem `/_sitemap`, "Entrar na minha conta") | **35/35 em 8 de 9**; a 9ª (Firefox 373 px) teve 1 falha não reproduzida e **35/35 na reexecução** (abaixo) | **35/35 em 9 de 9** |
| Anel de foco, imagem **focado x desfocado** | **66/66 x3 motores** | **72/72 x3 motores** |
| Guardas de rota | **46/46 x3 motores** | **28/28 x3 motores** |
| Reaceite | **10/10 x3 motores** | **9/9 x3 motores** |

- **Uma falha, não reproduzida:** `fx2` passageiro Firefox 373 px, F6 ("envio vazio leva o foco ao nome"): o foco estava no botão. Repeti a medida **50 vezes** isoladas (Firefox, 373 e 360 px): o foco chega em 6 a 62 ms, sempre. Reexecutei o `fx2` inteiro: **35/35**. Foi o meu espera fixa de 700 ms sob 6 grupos de navegador em paralelo. Não é defeito.
- **Anel de foco** (o bug do B2, campo inválido e focado idêntico ao inválido sem foco): para cada campo de login, cadastro/criar conta, esqueci a senha, redefinir e código, em 320, 360 e 373 px, recorto a imagem do campo (+8 px) **focado e desfocado**, no estado inicial e **depois de um envio vazio**, e comparo pixel a pixel (limiar 16/255). Exigi: diferença de pelo menos 120 px, **pelo menos 40 px fora da borda** quando o campo é inválido (onde o anel mora) e **nenhum deslocamento do layout**. Típico: 2252 px de diferença, 1754 fora da borda. Canário: removo todo `box-shadow` com CSS injetado e o detector reprova **exatamente os 13 campos inválidos** (11 passam: os válidos, cujo foco é a borda). Conferi por olho os pares em Chromium, Firefox e WebKit (par montado em `shots/ring-pairs-engines.png`): borda vermelha sem foco, borda vermelha **mais anel amarelo por fora** com foco.
- **Procura por "cadastr" no motorista** (42 telas e estados por motor: entrar, criar conta, código, esqueci, redefinir, termos, privacidade, 404 logado e deslogado, Home, reaceite e **22 erros forçados**; texto visível, `aria-label`, `aria-description`, `aria-roledescription`, `title`, `alt`, `placeholder`, `<title>`, `aria-labelledby` e a árvore de acessibilidade completa): **38 ocorrências únicas nos 3 motores, todas no texto visível e todas nos dois avisos intencionais** ("A conta não é o cadastro de motorista" / "O cadastro de motorista é outra etapa e só abre depois que as regras de taxa e repasse forem publicadas", em **Criar conta** e na **Home**). **Zero** em entrar, código, esqueci, redefinir, termos, privacidade, 404, reaceite e **zero em qualquer atributo ou `aria-label`**. Varredura do bundle de produção: 4 contextos, os mesmos dois avisos mais duas strings sem efeito hoje (Q5).
- **Guardas de rota** (produção): sem sessão, a URL direta da rota do produto cai na entrada, também com sintaxe de grupo (`/(app)`, `/(app)/perfil`); `/catalogo`, `/mapbox-check` e `/_sitemap` não existem; `__vuumboraIdentity` não existe (controle: existe no dev server); bundle sem `mapbox-gl`, `rnmapbox` e sem o gancho; com sessão, todas as rotas de autenticação mandam para a Home; sair fecha o produto e o Voltar do navegador (6x) nunca o mostra; recarregar derruba a sessão.
- **Reaceite** (dev, mock com versão trocada): a conta nova entra; com versão nova o login mostra o portão (não a Home) com as versões **novas**; "Aceitar e continuar" sem marcar nada e com só os Termos marcados **não libera**; as rotas do produto seguem fechadas; marcando os dois, libera; depois de aceitar, sair e entrar de novo **não pede de novo**; "Sair da conta" dentro do portão fecha o app. No passageiro o portão **entra no meio da sessão** quando a versão muda e a pessoa navega (visto: `/historico` e `/perfil` mostram o portão); as caixas voltam desmarcadas se a tela remonta.

## 5. A3, B-6, N4 e N6 (liberado)

### `100a782` e o cofre da sessão
- `npm test -w @vuumbora/ui`: **84/84** (7 arquivos, 21 suítes).
- **Quebrei de propósito `packages/ui/src/device/sessionVault.ts`** (cópia `repo-ui`), 8 mutantes, **8 mortos**: `U1` marcar **antes** de apagar (morto por "apaga as três chaves do app e só depois grava o marcador" e "apagar uma chave falha: rejeita, NÃO grava o marcador"); U2 marcar mesmo com falha ao apagar; U3 parar na primeira chave que falha; U4 marcador ilegível tratado como instalação nova; U5 leitura sem esperar a verificação (8 testes caem); U6 escrita sem esperar; U7 falha guardada para sempre; U8 apagar chave de outro perfil.
- **Web, dev e export de produção, passageiro e motorista, 3 motores (12 execuções, 38 verificações cada, 456/456):** depois de cadastrar, confirmar o código, navegar, sair, **entrar de novo pelo login** e recarregar: `localStorage` vazio, `sessionStorage` vazio, `document.cookie` vazio e nenhum cookie no contexto, **IndexedDB sem nenhum banco**, Cache Storage e service worker vazios, nada com cara de token (`mock-access`, `mock-refresh`, `eyJ…`, `installation`, `session`), `window.name` limpo. Recarregar derruba a sessão (só memória). **Canário:** gravo um item falso em `localStorage` (`mock-refresh-token-1`), `sessionStorage`, cookie (`refreshToken`) e IndexedDB antes do fluxo e o detector reprova **nas 4 superfícies e no detector de "cara de token"**.

### B-6 (conferência do SHA-256 do texto legal) por motor
Dev server; o gancho troca `identity.mode` para `http` e `legalCurrent` para uma resposta cuja `url` aponta para o **meu** servidor de textos (A, B e uma porta fechada). O componente e o app são os reais.

| Cenário | Esperado | Resultado (passageiro e motorista, 3 motores) |
|---|---|---|
| texto íntegro, com BOM, com CRLF, acentos e 3 parágrafos | texto + "Texto conferido com a versão publicada" | **passa** |
| redirecionamento na **mesma** origem | permitido, texto aparece | **passa** |
| **adulterado** (conteúdo trocado; e adulterado em **1 caractere**) | falha "Não foi possível confirmar o texto", **nenhum trecho** na página, "Tentar de novo" | **passa** |
| **hash divergente** (a API publicou outro hash), hash em maiúsculas, hash curto | falha; sem retry nos dois últimos | **passa** |
| **redirecionamento cross-origin** (outra porta; outro host `localhost`) com o texto íntegro e o hash certo | "O texto veio de um endereço não aceito", sem retry, **nenhum trecho** | **passa** |
| **servidor fora** (porta fechada) | "Não foi possível baixar o texto" + retry; **depois de subir o servidor, "Tentar de novo" mostra o texto íntegro** | **passa** |
| HTTP 404, 500; corpo vazio; UTF-8 inválido com o hash certo; 2 MiB | falha sem texto | **passa** |
| URL com `\` (ataque de host), com `user:pw@`, esquema `ftp` | "O endereço do texto não é válido" | **passa** |
| servidor lento (17 s) | "O texto demorou demais" em ~15 s | **passa** |
| o link "Ler os Termos" | abre a **rota do app**, sem janela nova nem `<a href>` para a URL do texto | **passa** |
| origem **não segura** (dev aberto pelo IP da rede local, `crypto.subtle` indefinido) | "Não foi possível confirmar o texto aqui" (falha fechada) | **passa** (1 execução, Chromium) |

Totais: motorista **63/63 nos 3 motores**; passageiro **63/63 em Chromium e Firefox**; WebKit do passageiro **61/63** na execução completa e **62/62** na reexecução em modo rápido (sem o cenário lento). Os 2 do WebKit foram **meu seletor** (`[data-testid$="-terms-link"]` pegou primeiro o link escondido da tela de boas-vindas que fica montada por baixo); corrigi para o testID exato e o cenário passa.

### N4 (`useNativeDriver` só fora do web) e N6 (foco ao entrar pela conta existente)
- **N4:** no dev server o esqueleto dos textos legais fica montado (verificado) e **zero** avisos de `useNativeDriver`, no passageiro e no motorista, 3 motores; no export de produção, abrindo o cadastro/criar conta (esqueleto) e, no passageiro, `/buscando` (pulso), **zero** avisos nos 3 motores nos dois apps (o motorista não tem tela de pulso: 1 verificação). **Canário:** exportei a produção com `useNativeDriver: true` de volta na `LoadingSkeleton` e o detector reprova com o aviso `Animated: useNativeDriver is not supported…` (2 de 2 falham); controle verde. (Fonte restaurada e conferida byte a byte contra o SHA.)
- **N6:** forçado no dev (e-mail repetido) e **natural no export de produção** (cadastra, confirma, sai, tenta o mesmo e-mail, "Entrar na minha conta"): o login abre com o e-mail preenchido e o **foco no primeiro campo**, nos dois apps e nos 3 motores (dev: 6 execuções, 12/12; produção natural: 6 execuções, 18/18). **Canário:** removo o `useFocusWhenScreenFocused` e o foco volta para o `<body>` nos dois apps (2 de 2 falham). Fonte restaurada e conferida.

## Achados

| # | Severidade | Onde | O que | Causa | Quem |
|---|---|---|---|---|---|
| Q1 | **Média** (não bloqueia; lacuna de teste) | `bcrypt-ceiling.test.ts` e o resto da suíte | Tirar o bcrypt do pool em **login (M5), cadastro (M6) ou login do admin (M8)** passa os 384 testes | A rajada só usa `verify-email`; as contas de teste têm hash de custo 4 (a comparação na principal custa 1 ms e ninguém vê) | Vega (teste) |
| Q2 | Baixa | `bcrypt-ceiling.test.ts` | O limite de 1000 ms é um **orçamento de ~2 comparações** nesta máquina: M3c (1 de 3 na principal) soma 864 ms e passa 14/14. O M1b soma 2743 ms aqui, 1306 ms a 2x e 651 ms a 4x (aí só o teste 3 o pega). O runner do CI é ~2,9x mais rápido que esta máquina no total (73 s x 212 s) | Limite absoluto em ms calibrado numa máquina lenta. Com o bcrypt 4x mais rápido a rajada limpa tem só 15 sondas (piso de 10) | Vega (teste) |
| Q3 | Baixa | `consent-gate-coverage.test.ts` | 7 formas de esconder passam (seção 3): auth com `schema` obrigatório (400 antes de 401), auth própria com outro 401/403, portão de mentira, portão escondido em rota `exempt` | A sonda chama sem corpo; só reconhece 401 `unauthorized` | Vega (teste) |
| Q4 | Baixa (só web, preview) | `packages/ui/src/LinkButton.tsx` | **Nenhum link de texto ativa por Enter nem por Espaço no web**: "Esqueci minha senha", "Entrar na minha conta", "Criar conta", "Ler os Termos" nos dois apps (medido em Chromium e Firefox; não medi no WebKit). Pressionar não faz nada | O `Pressable` com `accessibilityRole="link"` vira `<div role="link">`; o RN Web 0.21.4 trata `role=link` como "elemento nativo" e **não** chama `onPress` no `keyup`, esperando o clique do navegador, que um `<div>` não gera. Não é regressão deste commit | Lyra (renderizar `<a href>` com `href`, ou tratar `onKeyDown`) |
| Q5 | Informação | `apps/driver` (`OnlineToggle`, Home) | (a) o bundle de produção do motorista contém a string "**Cadastro em análise.** Você poderá ficar online após a aprovação." (ramo `approved=false`, **inalcançável hoje**: `registrationApproved = true` fixo); quando a M04 acordar o ramo, ela contradiz "o cadastro só abre depois…". (b) a Home da conta nova mostra "ONLINE: Você está online e recebendo corridas" ao lado do aviso de que o cadastro não abriu; está marcada como demonstração (selos), então não é erro, mas é o tipo de contradição de página inteira | Protótipo (M05) | Lyra, na M04 |
| Q6 | Informação | `/healthz` sob rajada | Outliers de 231 a 289 ms (6 de 120) **continuam sem causa provada**; só deixaram de reprovar | Disputa de CPU (hipótese) | Vega, se quiser a causa |

## O que precisa mudar (nada bloqueia a aprovação)

1. **Vega (teste), Q1 — antes de mexer no pool:** um teste estático ("`bcryptjs` só é importado por `bcrypt-worker.ts` e pelo hash descartável do boot do admin") **e** uma rajada com um login real de custo 12 (e um login do admin com hash de custo 12) medindo parada do laço. É a rede que falta para o A-1.
2. **Vega (teste), Q2 e Q3:** trocar o orçamento em ms por uma razão (parada do laço dividida pelo tempo de UMA comparação medida no próprio processo, como o teste do pool já faz) e sondar o gate também com corpo válido.
3. **Lyra, Q4:** os links de texto precisam ser ativáveis por teclado no web (`<a href>`), ao menos em `LinkButton` com `role="link"`.

## Não provado (e por quê)

- **CI**: só 1 execução verde do SHA; sem login não reexecuto. Nada de teste de tempo em runner Linux fora o CI.
- **Mutante M1b no runner do CI**: a margem de 2,7x é desta máquina; no runner (mais rápido) ela é menor (Q2). Não provei.
- **A3 em aparelho**: Keychain real na reinstalação, `expo-secure-store` e `expo-crypto` nativos, `fetch` nativo (o B-6 que provei é o do navegador; o nativo usa outro `fetch` e outro `digest`). Android e iOS: nada em aparelho.
- **Leitor de tela** (NVDA, VoiceOver, TalkBack) e **Safari de iPhone real** (o WebKit do Playwright não é o do iOS).
- **`requireCurrentConsent` por HTTP**: nenhuma rota o usa ainda (limitação registrada no teste).
- **B-4 com `SIGTERM` real** (Windows não tem), imagem Docker, produção real (`TRUST_PROXY`, papel restrito, SMTP com TLS e SPF/DKIM).
- **A causa dos outliers de 0,2 s** (Q6).
- **A API real** nesta rodada (nenhum item pediu; as passadas 3 e 4 a exercitaram).

## O que ainda impede publicar o S1 em produção fechada

Nada que a QA reprove: a API está liberada pelo Órion (rodada 3b: 0 críticos, 0 altos) e os testes agora são confiáveis. O que ainda separa o repositório de produção fechada:

1. **Os apps ainda não falam com a API.** `IDENTITY_MODE` é o literal `'mock'` nos dois apps (a guarda do Metro aborta o export de produção sem `VUUMBORA_ALLOW_MOCK_IDENTITY_IN_PRODUCTION=1`). Falta a **B4** (modo `http` com `EXPO_PUBLIC_API_URL`, TLS) e, para loja, EAS e as contas Apple e Google (decisão do dono). Sem isso o S1 em produção serve só o painel e o formulário do site.
2. **Decisões e conteúdo do dono:** os **textos** dos Termos e da Política (arquivos publicados, `LEGAL_DOCUMENTS_BASE_URL`, primeira versão no catálogo, hash). Sem isso o cadastro responde 503. Mais: unicidade do e-mail por tipo de conta (hipótese em uso) e a regra de 29/02.
3. **Publicação coordenada:** migrações 0010 a 0021 e o código novo só vão **juntos**, e API e painel juntos (hoje a produção é a API antiga com um painel incompatível; o guia pede reverter o painel para `producao-admin-estavel` ou publicar os dois). Ordem e variáveis em `docs/publicar-o-backend.md`.
4. **Produção real sem prova:** imagem Docker nunca construída aqui (o `nginx -t` e a guarda de contexto já estão no CI); papel de banco restrito, `TRUST_PROXY` e proxy; SMTP real com TLS e SPF/DKIM/DMARC; restauração de backup no ambiente real.
5. **Segurança:** **não encontrei rodada do Órion sobre o que mudou depois da 3b** (cofre da sessão e B-6, `8d9d3c1`; fila justa e reservas do pool; B2). Recomendo uma rodada curta sobre esse delta antes de abrir ao público.
6. **Rede de proteção do A-1 (Q1) e N3 (Q3):** não impedem publicar, mas eu fecharia o Q1 antes de qualquer mexida em `bcrypt-pool.ts`.
7. **Do A3, para os apps:** o hash que o app conferiu **ainda não é enviado ao servidor** no aceite (registrado no commit); o aceite prova "versão X, hash H" mas não "o app viu H". Aparelho real nunca testado.

## Pendências (valem depois)

- Rodar as repetições de tempo e o mutante M1b em runner Linux (várias execuções do CI).
- Teste de integração do `SIGTERM` com bcrypt em voo, quando houver Linux.
- Primeira rota de compromisso: ligar `requireCurrentConsent` e provar por HTTP (409 com pendência, 503 sem textos).
- B-6 no nativo (aparelho): `expo/fetch` e `expo-crypto`.

## Reprodução (efêmero)

Scripts em `scratchpad/iris5/` (não versionados): `suite.sh`, `aff-suite.ps1`, `loop.ps1` (`-Mode same|fresh`, `-Hogs`), `stats.mjs`, `mut.mjs` + `mutrun.ps1` + `mutbatch.sh` (mutantes da API), `n3mut.mjs` + `n3run.sh` (N3), `uimut.mjs` + `uimutrun.ps1` (cofre), `webgroup.ps1` (grupos de navegador presos a 2 CPUs), `collect.mjs`, `e2e/{cfg,flows,f3g,fx2,ring,guards,reaceite,cadastr,a3web,b6,n4,n6,n6prod,f6loop,kbd}.mjs`. Resultados em `scratchpad/iris5/res/` (`group-*.summary` e um `.txt` por execução) e logs dos mutantes em `scratchpad/iris5/mut-*.log`. Capturas em `scratchpad/iris5/shots/`.
