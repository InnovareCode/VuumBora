# Veredito final da Íris (QA) — S1, código commitado `ff7af13`

Data: 21/11/2026 (noite). Escopo: **o commit `ff7af131f371f10c1986e10bd52a81ba48696963`**, extraído com
`git archive HEAD` para uma pasta limpa (670 arquivos = os 670 rastreados, sem `.env`, sem `node_modules`, sem
`expo-env.d.ts`). Nada do que está no diretório de trabalho entrou nos testes.

## VEREDITO: APROVADO

Com **um achado de baixa severidade (F1, só Firefox)**, que não bloqueia o S1 e tem causa isolada e correção de uma linha.
Nenhum código de produção foi alterado por mim.

| # | Item | Estado |
|---|------|--------|
| 1 | Sem alteração em arquivo rastreado | **Não provado como pedido** (ver abaixo); o código testado é o do commit |
| 2 | Postgres 18 recriado do zero + migrações 0001–0020 | **Provado** |
| 3 | `apps/api`: `npm test` + `typecheck:test`; raiz: `npm run check` | **Provado** (com a ressalva de escopo e de `expo-env.d.ts`) |
| 4 | Tela "E-mail" no navegador (Chromium, WebKit, Firefox) | **Provado**, com F1 e limitações listadas |
| 5 | CI do GitHub | **Provado** (status e passos); contagem de testes no CI **não provada** |

## 1. Árvore de trabalho

- `HEAD` = `origin/main` = `ff7af13` (conferido também com `git ls-remote origin refs/heads/main`).
- **Há alteração em arquivo rastreado**, ao contrário do que o item pedia: no início da passada eram 2 arquivos de
  documentação (`PROGRESSO.md`, `docs/decisoes-do-dono.md`: decisão "React Native para Android e iOS"); ao terminar já
  eram 8 (`.github/workflows/ci.yml`, `apps/admin/nginx.conf`, `apps/site/nginx.conf`,
  `docs/producao-passo-a-passo-dono.md` e duas memórias de agentes entraram), por trabalho de outros agentes.
- Consequência: **o que provei é o commit, não a árvore de trabalho.** Em especial, `ci.yml` e os dois `nginx.conf`
  alterados e não commitados **não foram cobertos**.

## 2. Banco e migrações (provado)

- PostgreSQL 18.1 novo (`initdb` do zero, porta 5437; o 5434 não foi usado). Papéis e banco criados como no CI
  (`vuumbora` / `vuumbora_test`).
- `npm run migrate` pelo runner real da API (`dist/migrate.js`, compilado do commit): "20 migração(ões) nova(s), 20 no
  total", 0001 a 0020 aplicadas em ordem. `schema_migrations` tem exatamente os 20 ids e é **idêntico** à lista de
  arquivos de `apps/api/migrations`. Segunda execução: "0 nova(s), 20 no total" (idempotente).
- Um segundo banco (`vuumbora_e2e`) foi migrado como dono e a API subiu com o papel restrito `vuumbora_api`, com
  `MIGRATION_DATABASE_URL` só no boot (como desenhado). A API nasceu saudável (`/healthz` ok), sem aviso de segredo.

## 3. Testes e checagens (provado)

Ambiente: Node **v22.23.5** (o do CI), `npm ci` na cópia limpa (736 pacotes, lockfile em sincronia, exit 0).

| Comando | Resultado |
|---|---|
| `npm run build -w @vuumbora/api` | exit 0 |
| `npm test -w @vuumbora/api` (1ª execução, banco novo) | **255 testes, 60 suítes, 255 passam, 0 falham, 0 pulados, 0 cancelados** (98,1 s) |
| `npm test -w @vuumbora/api` (2ª execução, mesmo banco já usado) | **255/255** de novo (93,9 s) — sem dependência de banco limpo |
| `npm run typecheck:test -w @vuumbora/api` | exit 0 |
| `npm run check` (raiz), **com** o passo do CI que gera `expo-env.d.ts` | exit 0: `check-boundaries` ok, `check-docker-context` ok (25 COPY, 4 Dockerfiles, 25 regras), typecheck dos 8 workspaces ok |
| `npm run build` do `apps/admin` (`VITE_API_MODE=http`) | exit 0 (tsc + vite build) |

- Os 20 arquivos `test/*.test.ts` são todos pegos pelo glob do script; nenhum fica de fora.
- **Falhas a citar: nenhuma nos testes.** Falha que existe e é conhecida: `npm run check` num checkout limpo **sem** o
  passo "Gerar expo-env.d.ts" falha em `apps/driver` e `apps/passenger`
  (`app/mapbox-check.web.tsx(4,8): error TS2882 ... 'mapbox-gl/dist/mapbox-gl.css'`), porque `expo-env.d.ts` está no
  `.gitignore`. O CI contorna (passo 5 do job `check`); quem clona e roda o `check` na mão tropeça. Não é regressão.
- **Escopo do `npm run check` da raiz:** rodei na cópia extraída do commit, antes do aviso do Atlas sobre
  Lyra/Vega mexerem em `apps/passenger`, `apps/driver` e `packages/api-client`. O resultado vale para o commit
  `ff7af13`, **não** para a árvore de trabalho de agora.

## 4. Tela "E-mail" do painel no navegador

Montagem: `apps/admin` com **build de produção** (`vite build`, servido por `vite preview`), API compilada
(`node dist/server.js`) com o papel restrito do banco, SMTP falso do próprio repositório
(`apps/api/test/helpers/fake-smtp.ts`) com login. Três donos (um por motor), 2FA ativado pela UI em cada motor.
Teclado real (`keyboard.press/type`), nunca `fill()`. Seis execuções: 3 motores x (desktop 1280x800, celular 390x844).

| Motor | Versão | Desktop | Celular |
|---|---|---|---|
| Chromium | 151.0.7922.34 | 73/73 | 75/75 |
| WebKit | 26.5 | 72/72 | 74/74 |
| Firefox | 153.0 | **72/73** (F1) | 75/75 |

**Total: 441 de 442 verificações.** Em cada execução há 4 "canários" (injetei um defeito de propósito e conferi que o
detector acusa: diálogo sem rolagem, campo de 14 px). Os 24 canários passaram; sem isso um teste que nunca falha
não provaria nada.

O que foi verificado, em todos os motores:

- **Foco.** Anel/indicador visível em todo elemento focado; o diálogo de reautenticação recebe o foco no campo de
  senha; Tab e Shift+Tab **não escapam** do diálogo; Escape fecha e devolve o foco ao botão que abriu (Salvar /
  Remover a senha salva); senha errada apaga a senha e foca nela, código errado apaga o código e foca nele (e a senha
  digitada é mantida); depois de salvar, o foco fica no botão Salvar (não cai no `body`); depois de remover a senha
  salva, o foco vai ao campo Senha.
- **16 px.** Todos os `input`/`select` da página (host, porta, usuário, senha, remetente, destinatário do teste) e do
  diálogo medem **16 px**, e o campo de código TOTP mede **18 px**. Também medidos: ativação (16 px) e, no login,
  o campo do 2º fator e o de recuperação (todos >= 16 px). O zoom do iOS em campo menor que 16 px foi inferido da
  fonte medida, não visto num iPhone.
- **Só teclado.** Do menu até a tela (desktop: Tab até o link "E-mail" + Enter; celular: "Abrir menu" + gaveta +
  link), preencher host/porta (o `select` aceita digitar "2525")/usuário/senha/remetente, Salvar, confirmar com senha
  + TOTP, enviar o e-mail de teste e remover a senha salva — tudo sem mouse. O e-mail de teste **chegou** no SMTP
  falso, com o login do usuário salvo. O POST de salvar respondeu 2xx.
- **Conteúdo alto sem corte.** Página e os dois diálogos (reautenticação com alerta aberto, e "Remover a senha salva")
  em 10 tamanhos: 1280x800, 768x1024, 390x844, 390x500, 320x568, 320x480, 844x390, 667x375 e texto a 200% em
  1280x800 e 390x844. Em todos: sem rolagem horizontal, diálogo dentro da tela, rolável por dentro quando excede,
  título e último elemento alcançáveis, todo botão alcançável por foco. Capturas conferidas a olho
  (`.../scratchpad/iris/final/e2e/shots/`).
- Erros no console: só os 401/403 **esperados** dos testes de senha/código errados.

### Achado F1 (baixa severidade, só Firefox, não bloqueia)

Tab de "Senha" para **"Remover a senha salva"** deixa o botão com 27 px de 44 abaixo da dobra no Firefox 153
(1280x800, quando há senha salva); o resto da página só rola no Tab seguinte. Reproduzido 2 vezes na UI real;
Chromium e WebKit rolam até o botão.

- **Causa isolada em página mínima, sem código do app:** o `-mt-1` (margem superior negativa) no botão
  (`apps/admin/src/components/email/EmailSettingsForm.tsx`, ~linha 352). Numa página mínima, o mesmo botão sem a margem
  negativa faz o Firefox rolar; só a variante com `margin-top:-4px` reproduz.
- **Correção sugerida (Lyra):** tirar o `-mt-1` (ajustar o espaçamento no contêiner) ou usar `relative -top-1`; e, se
  quiser blindar, `scroll-my-4` nos controles focáveis. Impacto: o botão é de uso raro e o foco continua operável; o
  rótulo, porém, fica fora da tela naquele instante.

### Comportamentos de motor que NÃO são defeito do app (medidos em página mínima, sem código do app)

- WebKit e Firefox deixam um campo já meio visível parcialmente abaixo da dobra ao receber foco (16 px no WebKit,
  ~19 px no Firefox); o Chromium rola até a borda. Por isso, nesses dois motores o critério de "alcançável" é metade do
  campo visível e centro na tela; no Chromium é o campo inteiro.
- WebKit **não põe `<a href>` na ordem do Tab** (padrão do Safari). A navegação até o link "E-mail" foi, no WebKit,
  foco programático no link + Enter. **"Chegar ao link só com Tab" não está provado no WebKit/Safari.**
- WebKit ignora `box-shadow` em `<select>`: a porta mostra só a borda âmbar no foco (1 px), e não o anel de 2 px dos
  `input`. Visível, mas mais fraco; fica como observação para a Lyra.

## 5. CI do GitHub (provado: status; não provado: contagem de testes)

`https://api.github.com/repos/InnovareCode/VuumBora/actions/runs?per_page=1` -> run `44969415119`, workflow **CI**,
evento push em `main`, `head_sha` = `ff7af13...` (o HEAD), `completed / success`, 22/11/2026 01:01–01:02 UTC.
Pelo `jobs_url`, os **4 jobs passaram, todos os passos com `success`**:

- `check (fronteiras, contexto docker, typecheck)` — inclusive "Gerar expo-env.d.ts" e `npm run check`;
- `api (build, migracoes e testes ...)` — build, migrações, `/healthz`, e "Testes do apps/api" (33 s);
- `backup e restauracao (ensaio com contagem de linhas)`;
- `ci-ok`.

Nada falhou, em passo nenhum. Limites: é o **único** run do repositório (`total_count: 1`, sem histórico); o log dos
passos exige autenticação (HTTP 403 sem token), então **não consegui ver quantos testes o CI rodou** (só que o passo
passou e durou 33 s, compatível com rodar a suíte, não com o aborto "sem script test"). O CI sobe um Redis que o código
não usa (`grep` por redis em `apps/api/src`, `test` e `scripts` não acha nada); inofensivo, só custo.

## Não provado, e por quê

- Contagem de testes dentro do CI (log fechado sem token).
- `ci.yml` e os `nginx.conf` do admin e do site **como estão agora** no diretório de trabalho (alterados, não
  commitados). Os cabeçalhos/CSP do nginx **nunca rodaram**: o admin foi servido pelo `vite preview`.
- `npm run check` e typecheck de passenger/driver/api-client na árvore de trabalho atual (em edição por outros agentes).
- SMTP real (só o falso), `NODE_ENV=production` com cookie `Secure`/HTTPS (a API rodou em `development`, mesma
  configuração das passadas anteriores), Safari/iOS físico, Android físico, leitores de tela (VoiceOver/NVDA/TalkBack),
  macOS/Linux (tudo no Windows 10).
- Tab até links no WebKit (limitação do motor, ver acima).

## Armadilhas do teste, para quem repetir

- O teste de e-mail do painel é limitado a **5 por hora por administrador** e tentativa que falha conta; a 6ª no mesmo
  dono devolve 429 (aconteceu comigo, em um dos motores; usei outro dono). Use um dono por motor.
- Passo do TOTP é uso único: o código do enrolamento não vale para a reautenticação logo depois (replay); espere a
  virada de 30 s ou use o passo seguinte.
- A API só sobe com o papel restrito se `MIGRATION_DATABASE_URL` (dono) estiver no ambiente **do boot**; sem ela:
  "permission denied for schema public". É o desenho, não defeito.
