# Veredito da Íris, S1, passada 8

**VEREDITO: APROVADO, com ressalvas (nenhuma bloqueia a fatia; ver "Achados").**

**Vale para o commit `35233d8` (SHA completo `35233d89edfb7e8d7820428e1353d014e21b6487`, "fix(apps): build de
release nao sai com __DEV__ ligado (medio da rodada 3f do Orion)"), ponta da branch `fatia/f02` — a Íris começou
esta passada no `99dfa53` (pai direto, "feat(apps): identidade real em preview e production...", F02/B4), mas o
Atlas avisou a meio do trabalho que a branch ganhou esse commit de correção por cima. Nenhum passo de teste tinha
sido executado ainda sobre `99dfa53` quando o aviso chegou (só ambiente); por isso, em vez de só reconferir o
delta como pedido, refiz o escopo inteiro contra `35233d8` — o delta (`git diff 99dfa53 35233d8`) toca só os dois
`metro.config.js` e o `ci.yml`, 33 linhas, então isso cobre os dois pedidos sem ambiguidade.**

Provado em duas cópias limpas (`git archive`, `npm ci` com Node 22.23.5, o do CI, sem `.env`): `f02b-repo`
(`git archive 35233d8`, os apps/packages sob teste) e `main-repo` (`git archive db821a3`, a `main`, só para rodar a
**API real com a F11 já integrada** — `POST /v1/auth/delete-account` — como pedido, já que `fatia/f02` não tem a
F11; confirmado que `99dfa53`/`35233d8` não tocam `apps/api` nem `packages/` nenhum, então usar a API da `main`
não mistura nada do que está sob teste). `origin/main` e `origin/fatia/f02` não andaram durante a passada (a
`main` só ganhou o próprio veredito da passada 7, um commit de docs). 22/11/2026, entre 17:10 e 18:30 (horário
UTC/máquina). A máquina tinha **outra passada de QA rodando em paralelo** (a passada 9, outro SHA/fatia, registrada
na memória da Íris) e o disco chegou a ficar **sem espaço livre** a meio do trabalho (ver "Condições" e
"Harness").

Ambiente: Postgres 18.1 próprio na porta **5470**; API real (`dist/server.js`, `main-repo`, papel restrito
`vuumbora_api`) na **5471**; SMTP falso do próprio repositório (`apps/api/test/helpers/fake-smtp.ts`) na **5472**;
servidor de textos legais (Termos/Política) na **5473**; Metro (`expo start --web`) do passageiro em modo `http`
na **5474**, do motorista em modo `http` na **5475**, do passageiro em modo `mock` na **5476** (bateria de
regressão). Nenhuma porta fora de 5470–5479 foi usada; a faixa 5490–5499 (Vega) não foi tocada. Tudo derrubado ao
fim (ver "Limpeza").

## Resumo por item do escopo

| Item | Resultado |
|---|---|
| 1. Apps de verdade em `http`: cadastro, código, login, reaceite, sair, sessão, exclusão | **Liberado**, com uma ressalva de meio de caminho (achado do ambiente, não do código) — ver seções 1–3. |
| 2. Dev sem variável = mock sem API; `VUUMBORA_IDENTITY=http` fala com API local | **Liberado.** |
| 3. Export de produção sem o marcador do mock; controles negativos abortam sem gerar nada | **Liberado**, incluindo o controle NOVO (`--dev` em release). |
| 4. Baterias da passada 6 que dependiam da simulação continuam verdes no export de desenvolvimento | **Liberado** (reconferência leve, não a prova exaustiva original). |
| 5. CI da branch | **Verde.** Run `45049601093`, 4/4 jobs, 17:28:04Z–17:30:43Z (2 min 39 s). |
| Delta do Atlas: 3º controle negativo + caminho da ferramenta de qualidade | **Liberado**, nos dois apps. |

## 0. Achado de ambiente que mudou o plano (não é bug do F02/B4)

`npx expo export --platform web --dev --output-dir <dir>` servido por um servidor estático simples (o mesmo
desenho do `tools/qualidade-tela/lib/server.mjs`) **quebra em QUALQUER rota, até a raiz** (`/`), com
`Uncaught Error: Requiring unknown module "847"` — o LogBox do Expo mostra a tela vermelha de erro e o app nunca
monta. **Reproduzi byte a byte o mesmo erro no commit `2523d67` (um antes de F02, SEM a troca de módulo nova)**,
trocando só o `app/`/`src/`/`metro.config.js` do passageiro pela versão daquele commit dentro da mesma cópia —
prova de que **não é regressão desta fatia**: é uma peculiaridade do `--dev` export + servidor estático nesta
máquina/versão do Expo, que ninguém tinha testado de ponta a ponta com navegador de verdade ainda (a ferramenta
`tools/qualidade-tela` nasceu no commit imediatamente anterior a F02, `2523d67`, e eu não achei nenhuma passada
anterior rodando-a com Playwright). **Pivotei para `npx expo start --web` (Metro vivo, de verdade)** para dirigir
o navegador — esse caminho carrega e navega normalmente (print em `shot-cadastro.png`) e é o que permitiu toda a
prova das seções 1–4 abaixo. Registrado como achado Q9 (ver "Achados"); não bloqueia porque o próprio `expo
export --dev` (sem servir/navegar) **continua saindo com exit 0** nos dois apps, que é tudo que o CI e a
ferramenta de qualidade pedem dele.

## 1. Passageiro, fluxo completo pela UI exportada (Metro `--web`, modo `http`, API e Postgres reais)

Roteiro único (`e2e-passenger.mjs`), 12/12 passos:

cadastro (nome, e-mail, data, senha, os dois aceites) → `POST /v1/auth/register` 201 → tela de código **sem** a
dica "demonstração: código 123456" (prova de que é `http`, não mock) → código de verificação **recebido de
verdade pelo SMTP falso** (decodificado de quoted-printable/UTF-8 do e-mail real da API) → verificado + login
automático (o app chama o login sozinho com a mesma senha, como o código documenta) → chega na Home logada → **A3:
sem token em `localStorage`/`sessionStorage`** → navega ao Perfil por clique (client-side, sessão preservada) →
Sair → login de novo com a mesma conta → **sem reaceite pendente** (só a versão 1 dos Termos publicada) → publica
Termos versão 2 (`legal:publish`, credencial dona, simulando o jurídico) → login de novo → **o portão de reaceite
aparece** → aceita o checkbox dos Termos → entra no app. Tudo pela UI de verdade, nenhuma chamada sintética.

## 2. Motorista, fluxo simétrico e mais enxuto

Roteiro próprio (`e2e-driver.mjs`), 7/7 passos: criar conta → código (sem dica de mock) → recebido pelo SMTP falso
→ verificado + login automático → Home logada → Sair → login de novo com a mesma conta. Confirma que a guarda de
build e o par `mode.http`/`mode.mock` funcionam igual nos dois apps (o código é quase idêntico, mas é uma segunda
implementação — não é o mesmo arquivo).

## 3. Exclusão de conta pelo cliente

**Não existe hoje nem método `deleteAccount` no `packages/api-client` nem tela nos apps** (grep vazio nos dois) —
"pelo cliente" nesta passada significa: o **token real**, capturado por escuta de rede de uma chamada autenticada
feita pelo app de verdade durante o 2º login do roteiro da seção 1 (não um token sintético de teste), usado para
chamar `POST /v1/auth/delete-account` diretamente. Resultado: senha errada → 401 `wrong_password`; senha certa →
200 `{accountDeleted:true}`; o MESMO token em `GET /v1/auth/me` depois → 401 `unauthorized`; login com as
credenciais antigas → 401 `invalid_credentials`; recadastro com o mesmo e-mail → 201 (e-mail livre). Isso prova a
integração (o token que o app de verdade emite é aceito pela rota de exclusão e revogado corretamente) mesmo sem
UI própria — já testado de ponta a ponta no servidor, isolado, na passada 7; aqui a novidade é o token vir do
fluxo real do app. **Pendência:** quando a tela de exclusão for construída nos apps, vale uma prova pela UI.

## 4. "Sessão sobrevive a recarregar"

No **web**, a sessão é **só memória**, por desenho (A3, documentado em `deviceSessionStorage.ts`): qualquer
recarregamento de página (F5 ou nova navegação) perde a sessão, em `mock` e em `http` igualmente — não é isso que
a garantia promete, e reproduzir um F5 no navegador não distingue os dois modos (confirmei: os dois perdem). A
garantia real ("fechar a força e reabrir mantém a sessão") é do **cofre nativo** (iOS/Android, `SecureStore`), que
esta máquina não tem como testar sem aparelho/emulador (mesma pendência de todas as passadas anteriores). Reproduzi
a garantia no nível do `packages/api-client`, com um cofre persistente meu (um `Map`, simulando o `SecureStore`) e
**duas instâncias** de `IdentityClient` sobre o MESMO cofre — a 2ª instância representa "fechar a força e
reabrir":

- **`http` (API real):** a 2ª instância faz `session.restore()` (otimista, só lê o token local) e a **1ª chamada
  autenticada (`me()`) FUNCIONA** sem novo login — sessão restaurada de verdade contra o servidor real.
- **`mock`:** a 2ª instância TAMBÉM mostra `signed_in` otimista logo após o `restore()` (o `restore()` não bate no
  servidor), mas a **1ª chamada autenticada falha** (`invalid_refresh_token`) e o estado cai para
  `signed_out`/`session_expired` — exatamente o que o comentário do código documenta ("a sessão restaurada do
  cofre é rejeitada na primeira chamada autenticada").

A distinção entre os dois modos só aparece na primeira chamada de rede, não no `restore()` em si — detalhe que não
estava óbvio antes de medir.

## 5. Modo mock em desenvolvimento, sem variável

Export de desenvolvimento sem `VUUMBORA_IDENTITY`: a dica "demonstração: código 123456" aparece, o cadastro e o
login funcionam com o código fixo, e **nenhuma requisição de rede tocou a porta 5471** (API real) durante todo o
fluxo — confirmado ouvindo TODAS as requisições da página, não só checando o resultado.

## 6. Export de produção: canário ausente + 3 controles (reconferência local, não só confiar no CI)

Reproduzi os 4 cenários do passo novo do `ci.yml` localmente, nos dois apps, numa cópia limpa:

| Cenário | passageiro | motorista |
|---|---|---|
| Positivo (`production`, https) | exit 0, 83/72 arquivos, **canário ausente** | idem |
| Negativo 1 (http em vez de https) | exit 1, **0 arquivos**, erro menciona "https" | idem |
| Negativo 2 (resolver mutado para `mode.mock`) | exit 1, **0 arquivos**, erro menciona "simulada" | idem |
| Negativo 3 **NOVO** (`production` + `--dev`) | exit 1, **0 arquivos**, erro menciona `__DEV__` | idem |

Mutação do negativo 2 feita só na cópia (`sed` na linha exata), restaurada e conferida por `diff` byte a byte
contra `git show 35233d8:...` depois — idêntico nos dois apps.

## 7. Caminho da ferramenta de qualidade de tela

`VUUMBORA_BUILD_PROFILE=development` + `expo export --platform web --dev` (o comando exato de
`tools/qualidade-tela/cli.mjs`): **continua saindo com exit 0** nos dois apps (92 arquivos no passageiro, 80 no
motorista). A ferramenta em si (capturar telas, comparar) não foi executada — só a exportação, que é o que o
Atlas pediu para reconferir.

## 8. Regressão leve da bateria da passada 6 (Chromium só, mock)

Não é a prova exaustiva original (3 motores, 2 apps, dezenas de casos) — é uma reconferência de que **nada
regrediu** com a troca de módulo do F02. 5/5: guarda de rota (`/perfil` sem sessão não mostra o perfil), Enter
ativa um link `role=link` (`cadastro-go-to-login-link`), fluxo de cadastro mock completo chega na Home, e A3
(sem token em `localStorage`/`sessionStorage`/cookie) depois do login mock.

## 9. CI

Run `45049601093`, push de `35233d8` em `fatia/f02`, 17:28:04Z–17:30:43Z (2 min 39 s), **4 de 4 jobs verdes**
(`api`, `check`, `backup`, `ci-ok`) — o job `check` é onde o passo novo (3 controles) roda. Também conferido o run
anterior, `45048066516` (`99dfa53`, antes do commit de correção), também 4/4 verde, 2 min 43 s.

## Achados

- **Q9 (média, achado de ambiente, não bloqueia; ver seção 0):** `expo export --dev` servido estaticamente e
  navegado direto quebra com "Requiring unknown module 847" nesta máquina — reproduzido também ANTES de F02
  (`2523d67`), então não é regressão desta fatia. Mas significa que **ninguém provou ainda que
  `tools/qualidade-tela` (capturar/comparar) funciona de ponta a ponta com um navegador de verdade** — a
  ferramenta só teve o `exportar` testado até agora (pela própria fatia que a criou, no CI, que não navega).
  Sugestão para o Vulcano/Lyra: rodar `node cli.mjs capturar` de verdade antes de confiar nas capturas, e, se o
  mesmo erro aparecer, investigar se é versão do Expo/Metro ou alguma peculiaridade desta máquina (Node 22.23.5).
- **Q10 (baixa, lacuna de cliente, já esperada):** `packages/api-client` não tem `deleteAccount` e os apps não têm
  tela de exclusão — a prova desta passada foi pelo token real + chamada HTTP direta. Não é bug: a função ainda
  não foi pedida para o lado do cliente (só a API, na F11).

## Pendências (cenários que valem depois, não bloqueiam)

Aparelho real (iOS/Android) para a garantia de persistência nativa (`SecureStore`) — ainda sem prova, mesma
pendência de todas as passadas anteriores; EAS build real (`preview`/`production`) contra uma API `https` de
verdade; tela de exclusão de conta na UI dos apps; a captura de tela de ponta a ponta de `tools/qualidade-tela`
(ver Q9).

## Condições e harness (armadilhas desta passada, registradas na memória)

- A máquina tinha **outra passada de QA (passada 9) rodando em paralelo**, em outra fatia/SHA — não interferiu nas
  portas (faixas diferentes) nem nos resultados, mas o disco **ficou sem espaço livre** (0 bytes) a meio do
  trabalho, provavelmente por acúmulo de cópias de passadas anteriores no `scratchpad` compartilhado. Limpei
  diretórios antigos meus (`iris2` a `iris7`, já reportados e sem uso) e recuperei ~9 GB; sem isso, `npm ci` e
  `git archive` davam `ENOSPC` sem mensagem óbvia da causa.
- `expo export`/`expo start` sem `VUUMBORA_BUILD_PROFILE=development` explícito e sem `--dev` força
  `NODE_ENV=production`, que conflita com `development` e aborta — sempre passar `--dev` OU deixar o perfil
  resolver sozinho via `NODE_ENV`.
- CORS: testar em `127.0.0.1` quando o `ALLOWED_ORIGINS` da API lista `localhost` (ou vice-versa) são origens
  DIFERENTES para o navegador — bloqueia silenciosamente com um erro de preflight que não aparece no `response`,
  só no `console` e no `requestfailed`.
- Decodificar quoted-printable "na mão" sem remontar os bytes como UTF-8 de verdade (`Buffer.from(bytes,
  'utf8')`) quebra caracteres acentuados ("é" vira dois pontos de código soltos); e separar cabeçalho/corpo do
  e-mail por `indexOf('\n\n')` falha quando a mensagem usa `\r\n\r\n` (CRLF) — os dois bugs juntos fizeram um
  roteiro pegar 6 dígitos do TIMESTAMP do próprio endereço de e-mail de teste em vez do código de verificação.
- Navegar com `page.goto()` para uma rota diferente é RECARREGAMENTO completo nesta SPA (perde a sessão web, que é
  só memória): navegação que precisa preservar sessão tem de ser por clique (client-side, Expo Router), nunca por
  `page.goto()`.
- Telas antigas ficam montadas por baixo da pilha do Expo Router: um seletor por `testID` pode casar com a
  instância escondida primeiro (mesma lição da passada 5); abrir uma página nova do Playwright em vez de
  reaproveitar a mesma evita o problema sem precisar filtrar por visibilidade.

## Limpeza

Postgres da porta 5470, API, SMTP falso, servidor de textos legais e os três Metro `--web` derrubados ao fim;
`metro.config.js` restaurado e conferido por `diff` nos dois apps depois da mutação da seção 6; as três cópias
(`f02-repo`, `main-repo`, `f02b-repo`) e os exports descartados; nenhuma porta fora de 5470–5479 usada; nenhum
arquivo do repositório real alterado.
