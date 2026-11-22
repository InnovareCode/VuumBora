# Veredito da Íris — S1, passada 2 (commit 79f41d8)

**VEREDITO: APROVADO** (com 1 ressalva não bloqueante: duas lacunas de teste no `api-client`, abaixo).

Data: 22/11/2026. Commit validado: `79f41d8` (`feat(apps): rotas protegidas, perfil de build e cinco categorias nos dois apps (A1)`).
Nenhum código foi alterado: tudo rodou numa **cópia limpa** (`git archive 79f41d8`, sem `.env`, `npm ci` do zero, Node 22.23.5 como o CI),
com Postgres 18 próprio (porta 5471), SMTP falso, APIs em 3271/3272, painel em 4371, servidor falso em 4373/4374 e exports em 8071-8074.
Tudo foi derrubado ao fim; as portas 5432/5434/5437/5438/5439/5466 não foram tocadas.

> **O HEAD andou durante a passada** (79f41d8 → 16c147a às 23:32 → d75b9b9 às 00:03). Este veredito vale **só** para o 79f41d8. O CI do
> **16c147a** (`fix(api): teto de concorrencia do bcrypt...`) está **vermelho** em "Testes do apps/api" (o log exige login no GitHub; só consegui
> o nome do passo). Já existe o commit 7de8b48 para publicar o nome dos testes que falham. **Não validei 16c147a nem d75b9b9.**

## Resumo por item

| # | Item | Resultado |
|---|------|-----------|
| 1 | Painel que falha fechado × API real e × servidor falso no formato antigo | **Provado** (Chromium + Firefox) |
| 2 | F1: Tab até "Remover a senha salva" no Firefox | **Provado**: corrigido |
| 3 | A1 nos dois apps (export web de produção, fallback SPA; android/ios) | **Provado** (web em Chromium + Firefox; android/ios só compilam) |
| 4 | A2 `api-client`: testes, mutação, fluxo contra a API real | **Provado**, com 2 lacunas de teste |
| 5 | CI do GitHub do 79f41d8 | **Provado**: verde, 4 de 4 jobs |

## 1. Painel que falha fechado (`apps/admin/src/api/authResponses.ts`)

Build de **produção** do painel (`VITE_API_MODE=http`), servido com `vite preview`, contra a API **compilada** (`dist/`) do commit, papel restrito `vuumbora_api`, migrações 0001 a 0020.

- **API real, pela interface** (`real.mjs`): `authenticated` (papel `suporte`), `enrollment_required` (dono: código de ativação → QR/chave → TOTP real → 10 códigos de recuperação → painel), `second_factor_required` (login + TOTP real). Em cada um: F5 restaura a sessão por `GET /me`. **Firefox 16/16; Chromium 16/16** (um "FAIL" de D2 no Chromium era expectativa errada do meu script: o papel `suporte` recebe 403 em candidaturas por desenho, `admin-driver-application-route.ts:55`; reavaliado sobre as respostas gravadas, sem nada inesperado).
- **Os validadores aceitam todas as respostas reais? Sim.** 17/17 corpos reais passados pelo código TypeScript real (`validators-real.mts`): login nos 3 estados, `/me` dos 5 papéis (`dono`, `operacao`, `revisor_documentos`, `financeiro`, `suporte`; `dono` entra pelos dois fluxos), `/me` de sessão legada com `csrfToken: null` (forcei `csrf_token = NULL` no banco), `2fa/verify` por código de recuperação (`recoveryCodesRemaining = 9`), `enroll/start` (idempotente: mesmo segredo na repetição) e `enroll/confirm` (10 códigos). Zero `[admin] Resposta da API incompatível` no console em todos os fluxos reais.
- **Controles negativos** (provam que o teste distingue): o MESMO corpo real de login sem `status` é recusado; campo extra desconhecido NÃO derruba (tolerância aditiva); o motivo da falha cita só nomes/tipos (e-mail trocado por número: a mensagem não contém o e-mail).
- **Servidor falso no formato ANTIGO** (`fake.mjs`, build apontada para 4373): login sem `status` (com `id/name/email/role/csrfToken` e cookie) → mensagem "Este painel e a API estão em versões diferentes…", **continua em `/login`, painel não abre**, foco vai ao aviso, console traz o campo `status` e **nenhum valor** (e-mail, nome, id, token), nada em `localStorage/sessionStorage`, e o 2º POST sai **sem `X-CSRF-Token`** (o token do corpo antigo não foi guardado). Variações fora do contrato também falham fechado: `status` desconhecido, sem `role`, `role` desconhecido, nome vazio, `data` lista/null, desafio sem token, `2fa/verify` sem `status`, `enroll/confirm` sem `recoveryCodes`, `GET /me` sem `role`/lista (tela "Painel e API em versões diferentes"). Controle positivo: o formato novo no mesmo servidor falso abre o painel. **22/22 em Chromium e 22/22 em Firefox.**
- Observação (por desenho, não é defeito): com o cookie do servidor antigo, `GET /me` no formato antigo é válido (o contrato de `/me` nunca teve `status`), então o painel monta ao abrir uma rota protegida. O 200 não-JSON no login cai antes dos validadores, no cliente HTTP ("status HTTP 200"), também sem sessão.
- Não coberto: as rotas **com sessão** (`/2fa/*`, candidaturas, e-mail) não passam por `authResponses.ts` (confiam no corpo); fora do escopo pedido.

## 2. F1 (Firefox, `EmailSettingsForm.tsx`) — CORRIGIDO

O 79f41d8 já contém o `cf982a7` (sem `-mt-1` no botão). Medido no navegador (`f1.mjs`), Tab até "Remover a senha salva":

- Firefox, 1280×(600…920, de 40 em 40): botão **inteiro dentro da tela em todas as 9 alturas** (altura 44 px, 0 px abaixo da dobra; a 800 o Firefox rolou 408 px), 3 repetições a 1280×800, chegada por Shift+Tab (720 e 800), celular 390×844. **17/17**. Chromium, mesmas medidas: 17/17.
- **Canário:** reinjetando `margin-top: -0.25rem` (o antigo `-mt-1`) o Firefox volta a deixar **27 px abaixo da dobra** a 1280×800 (`top=783 bottom=827 scrollY=0`), idêntico ao achado F1 de ff7af13. Logo o detector enxerga o defeito e ele não existe mais. Chromium rola mesmo com a margem negativa (bug só do Firefox, como já registrado).

## 3. A1 nos dois apps (`apps/passenger`, `apps/driver`)

`VUUMBORA_BUILD_PROFILE=production expo export --platform web`, servido com fallback SPA (arquivo existe → serve; senão `index.html`; asset inexistente → 404). **68/68 em Chromium e 68/68 em Firefox** (`a1.mjs`):

- **Sem sessão nenhuma rota de `(app)` abre:** passageiro, as 12 rotas (`/`, `/destino`, `/confirmacao`, `/buscando`, `/a-caminho`, `/em-andamento`, `/concluida`, `/historico`, `/historico-detalhe` com e sem `?id=1`, `/perfil`, `/configuracoes`) terminam em `/boas-vindas`; motorista, `/` termina em `/entrar`. Sem "Unmatched Route" e sem erro de JS. As rotas públicas abrem.
- **Com sessão de demonstração:** login abre a Home; navegar internamente para `/login`, `/cadastro`, `/boas-vindas` (e `/entrar` no motorista) cai na Home; **F5 derruba a sessão** (volta à entrada); nada em `localStorage`/`sessionStorage`/cookie.
- **`catalogo` e `mapbox-check` ausentes:** em produção, `/catalogo` e `/mapbox-check` dão "Unmatched Route"; nenhuma ocorrência de `mapbox-gl`, `mapbox-check`, `catalogo` nos `.js` do export nem arquivo com esse nome; também **0 ocorrências** (nem `rnmapbox`) nos bundles Hermes de **android e ios** dos dois apps. **Controle** (export `development`): as duas telas existem (web e android). Chunk comum do motorista: 1066 KB (dev) → **109 KB** (prod), confirmando a afirmação do commit.
- **Cinco categorias a 320 px sem truncar:** na Home (passageiro), 320/360/390/412 px: as cinco, na ordem VuumBora, Conforto, Motorista mulher, Entrega, Pet; nenhum texto com `scrollWidth > clientWidth`; cards e textos dentro da tela; sem rolagem horizontal; altura de cada card ≥ 44 px; preço e tempo completos. **Canário** a 320 px: estreitando "Motorista mulher" a 60 px o detector acusa. (O motorista não tem categorias: só o passageiro.)
- **Sem login social:** `/boas-vindas`, `/login`, `/cadastro` (e `/entrar`) sem "Google", "Apple" nem "Continuar com"; sem testID `social-signin-*`. Canário: com o texto injetado o detector acusa.
- **Export android e ios compilam:** `expo export` exit 0 nos dois apps e nas duas plataformas (≈ 31–35 s cada).
- Independente do que o CI faz: `npm run check` na cópia limpa (com `expo-env.d.ts` gerado como no CI) **exit 0**; suíte da API **255/255** (Node 22, PG 18, 111 s).
- Não provado: **execução** do app em aparelho/emulador (iOS e Android só compilam; o comportamento de `Stack.Protected` em deep link nativo não foi exercitado, só no web); WebKit/Safari não rodei (não pedido).
- Observação não investigada: o chunk comum do passageiro em produção web ainda tem 2,9 MB (3,9 MB em dev) sem nenhum mapbox. Web é só preview no plano, não bloqueia.

## 4. A2 (`packages/api-client`)

- `npm test`: **114/114** (18 suítes, 4 s).
- **Mutação por amostragem** (`mut-a2.mjs`, na cópia, 14 mutações): **12 mortas, 2 SOBREVIVERAM.**
  Mortas: voo único (SF1), gravar antes de liberar (SF2), época na renovação (SF3), 401 tardio reaproveita token (SF5), `X-App-Version` (SF6), descanso após falha transitória (SF7), rede ≠ logout (SF8), `signOut` espera o voo (SF9), época no `adopt` (SF11), fila única de gravação (SF12), tipo de conta fixo (SF13), validade restante (SF14).
  **Sobreviveram (lacunas de teste; o código está certo):**
  - **SF10** — `clearLocal` sem `epoch += 1`. Cenário: `logout-all`/`endLocal` enquanto um refresh está em voo; sem a época, a renovação tardia **ressuscita a sessão no armazenamento** (a próxima abertura do app volta logada). Mostrado por `G1`: no original `gravado=null`; com SF10, `gravado=SESSAO RESSUSCITADA`.
  - **SF4** — `run()` sem `if (epoch !== used.epoch) return failWith(NO_SESSION)`. Cenário: a chamada da conta A recebe 401, o refresh dá certo, e um login da conta B chega **enquanto o refresh é gravado**; sem a guarda a chamada de A é repetida e entrega "dados da conta A" à sessão de B (o comentário do código diz que isso nunca acontece). Mostrado por `G2`: original 1 tentativa e `no_session`; com SF4, 2 tentativas e dado entregue.
  Os dois testes que matam os dois mutantes estão prontos em `scratchpad/iris2/e2e/gap-tests.mts` (passam no código original, falham com cada mutante); falta **incorporá-los** a `packages/api-client/test/session-manager.test.ts` (Vega/Lyra; eu não alterei o repositório).
- **Fluxo contra a API real, migrações 0001–0020, 30/30** (`a2-flow.mts`, cliente `http` do pacote, SMTP falso):
  cadastro (`emailSent: true`) → login antes de verificar recusado (`email_not_verified`, sem sessão) → verificação com código errado (`attemptsLeft: 4`) e com o certo → login (devolve só a conta, sessão `signed_in`) → `/me` → **refresh real** (banco: família ativa com 2 tokens, 1 usado) → **6 renovações simultâneas = 1 único `POST /refresh`**, família intacta → chamada com token adulterado: 401 real, 1 renovação, repetição ok → `X-App-Version: 1.4.0` em **todas** as 10 chamadas, sem `Authorization` em register/verify/login/refresh → logout (`serverRevoked: true`, família `logout`, `me()` sem sessão, logout repetido idempotente).
  **401 por expiração REAL:** segunda API com `AUTH_ACCESS_TTL_MINUTES=1`, espera de 65 s, **5 `me()` simultâneos** → todos ok, **exatamente 1 `/refresh`**, família ativa com 1 rotação. Também: esqueci/redefinir (sessão antiga cai: `session_expired`), `logout-all`, e o mesmo e-mail com conta de passageiro e de motorista.
  **Controle negativo:** dois `/refresh` simultâneos com o MESMO token direto na API real → 200 e 401, família `reuse_detected`, e o token "vencedor" também morre. É exatamente o dano que o voo único evita.

## 5. CI do GitHub no 79f41d8

Run 44976149099 (push, 22/11 02:27 UTC, tentativa 1): **success**. `check` ✓ (inclui `npm run check`, testes do api-client e `nginx -t`), `api` ✓ (build, migrações, `/healthz`, 255 testes), `backup e restauração` ✓, `ci-ok` ✓. Nenhum passo pulado.
Informativo (outro SHA): 16c147a **failure** em "Testes do apps/api"; d75b9b9 em andamento ao fechar.

## Pendências (não bloqueiam este veredito)

1. Incorporar `G1`/`G2` (`gap-tests.mts`) aos testes do `api-client` e rodar a mutação de novo (SF4 e SF10 têm de morrer). **Dona: Vega/Lyra.**
2. Investigar o CI vermelho do 16c147a e passar a mesma bateria no HEAD novo (bcrypt pool, termos/política). Não validado aqui.
3. Execução real em aparelho/emulador e WebKit/Safari: não provados.
4. Painel × API **antiga de verdade** (uma build pré-2FA): usei um servidor falso no formato antigo, não um binário antigo.
5. Rotas com sessão do painel não passam pelos validadores de `authResponses.ts`.
6. Limites de taxa: para rodar muitas execuções subi as APIs com `ADMIN_LOGIN_RATE_LIMIT_MAX=200` e `AUTH_IP_RATE_LIMIT_MAX=1000`; os padrões de produção e a espera progressiva **não** foram exercitados nesta passada.
7. Hipótese **não provada**: a API 2 não enviou e-mail enquanto a configuração SMTP do painel (senha cifrada com a chave da API 1) estava no banco; o log só diz `EmailDeliveryError`. Pode ser chave `ADMIN_TOTP_ENCRYPTION_KEY` diferente. Se for, trocar a chave quebra o e-mail da identidade sem aviso claro. Vale checar.

## Armadilhas do meu harness (para não reprovar à toa)

- O servidor falso derrubava a sessão logo depois do login (devolve 401 nas rotas de dados) e F5 em `/login` não testa o `GET /me`: o teste de `/me` quebrado tem de ir direto a uma rota protegida.
- `challengeExpiresAt` do servidor falso em 2030 estourava o `setTimeout` (> 2³¹ ms) e devolvia ao login na hora; usar sempre agora + 10 min.
- O limite global de 100 req/min por IP fez um `reload` em laço devolver 429 (tela de sessão indisponível): esperar a janela.
- Assunto do e-mail vai codificado (RFC 2047) e o corpo em quoted-printable: casar o código no corpo (`: 291984`), não o acento.
- Regex com `\(` dentro de `node -` via heredoc perde a barra: usar `Edit`.
