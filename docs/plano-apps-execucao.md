# Plano de execução dos aplicativos (passageiro e motorista)

Nova, 21/11/2026. Plano de execução, não de arquitetura: a base (Expo SDK 58, Expo Router, CNG, `packages/ui`,
`packages/tokens`, portas mock/http) e as fases S0–S9 estão em `docs/plano-sistema-arquitetura.md` §4.1 e §10 e
**não são reabertas aqui**. A decisão do dono de 21/11 (React Native, Android e iOS, `docs/decisoes-do-dono.md`,
"Plataforma dos aplicativos") confirma essa base.

Hipóteses de contexto (as mesmas do plano do sistema): MVP, uma cidade (Natal), ~1.000 corridas/dia como teto de
desenho, squad pequena, sem prazo fixado pelo dono. Por isso as fatias abaixo são pequenas e cronológicas, e nenhuma
introduz biblioteca que o §4.1 não preveja.

---

## 1. Estado real (verificado em 21/11/2026, não tirado do PROGRESSO.md)

### 1.1 O que rodei e o resultado

| Verificação | Resultado |
|---|---|
| `npm run typecheck` em passenger, driver, api-client, domain, ui, tokens | **verde** nos seis (tsc 6, ~14 s) |
| `node scripts/check-boundaries.mjs` | **ok** (sem HEX solto, sem import cruzado passageiro/motorista) |
| `expo export --platform web` do passageiro (saída fora do repositório) | **verde**: 17 rotas, `entry` 1,1 MB |
| `expo export --platform web` do motorista (idem) | **verde**: `index` 2,3 MB (o maior bundle; vale olhar na fatia A1) |

**Não rodei** (e por quê): nenhum aparelho, emulador ou simulador (pedido explícito, e iOS não roda em Windows);
nenhum EAS build (não há `eas.json` nem conta Expo configurada); não naveguei o export web num navegador nem tirei
captura; não rodei os testes da API (fora do escopo). Nada do lado nativo (Mapbox nativo, fonte, splash, ícone,
teclado, área segura) tem prova até hoje — o próprio `docs/mapbox.md` registra que só a versão web do mapa foi
provada.

### 1.2 Fatos do código que pesam no plano

- **Nenhuma tela faz rede.** Nenhum arquivo de `apps/passenger` ou `apps/driver` importa `@vuumbora/api-client`
  nem chama `fetch`. Login e cadastro usam `src/lib/simulateAuthRequest.ts` (um `setTimeout` de 700 ms). A jornada
  de corrida do passageiro roda num simulador local (`src/sim/rideSimulator.ts`) dentro do store Zustand
  (`src/store/useRideRequestStore.ts`), que já consulta `transitionRide` do domínio — é o ponto de troca para o REST.
- **Não há sessão nem guarda de rota.** O `_layout.tsx` dos dois apps é um `Stack` simples; os grupos `(auth)`/`(app)`
  com `Stack.Protected` estão só num comentário. O passageiro abre direto na Home (`app/index.tsx`), sem login.
- **O `api-client` não conhece a identidade que a API já tem.** `AuthPort` em `packages/api-client/src/index.ts` é
  `signIn({ login, password }) → { sessionId }` e diz que "o papel é decidido pelo backend" — o contrato real
  (`docs/contrato-identidade-apps.md`) exige `accountType`, devolve `accessToken`/`refreshToken` e tem nove rotas.
  `ApiError` não tem onde levar `code`, `attemptsLeft` nem `retryAfterSeconds` específicos da identidade.
  As portas de corrida/oferta (`passenger/index.ts`, `driver/index.ts`) ainda são a "proposta" mínima, não os
  contratos §6.2–§6.4: o entregável de tipos do S0 não foi feito.
- **Formulários divergem do contrato:** `src/schemas/authSchemas.ts` aceita **celular** como identificador de login
  (o contrato aceita e-mail ou ID público), senha **mínimo 6** (contrato: 8–72 bytes), cadastro sem **data de
  nascimento** e sem os dois **aceites**; não existe tela de código de verificação, nem de esqueci/redefinir senha.
  O cadastro mostra "Continuar com Google/Apple" desabilitados (decisão 8 segue aberta).
- **Dependências nativas ausentes:** não estão instalados `expo-secure-store`, `expo-location`,
  `expo-task-manager`, `expo-notifications`, `expo-web-browser` nem TanStack Query (previsto em §4.1/D-10).
  Não há test runner nos apps (a API usa `node --test` + `tsx`).
- **Configuração de loja:** `app.config.ts` tem `com.vuumbora.passenger` / `com.vuumbora.driver` marcados
  "PENDENTE"; não há `eas.json`, `projectId`, nem textos de permissão (localização, notificação). O token do Mapbox
  está só no `.env` local da raiz, como `EXPO_PUBLIC_MAPBOX_TOKEN`.
- **Categorias desatualizadas:** `src/data/mockRideCategories.ts` usa Vuum Econômico/Comfort/Plus com preços de
  mockup; o dono decidiu em 20/11 VuumBora, Conforto, Motorista mulher, Entrega e Pet.
- **API de identidade existe mas não está publicada** (PROGRESSO.md §S1, confirmado pelas rotas em
  `apps/api/src/routes/auth-*.ts`: `/v1/auth/register|verify-email|resend-verification|login|refresh|logout|
  logout-all|forgot-password|reset-password` e `GET /v1/auth/me`). Nenhuma rota de corrida, cotação, motorista,
  exclusão de conta, push ou documentos legais existe.
- **Renovação de token sem tolerância:** `rotate_refresh_token()` (migração 0011, linhas 91–99) trata o segundo uso
  do mesmo refresh como `reuse_detected` e **revoga a família inteira**; `identity-service.ts:266-268` devolve o
  mesmo `401 invalid_refresh_token`. Consequência para o app na seção 4.

### 1.3 Telas contra a especificação

Legenda: **UI** = tela desenhada, dados de demonstração (com `MockBadge`); **parcial** = existe, mas falta parte do
escopo da linha da especificação; **—** = não existe. "Real" = fala com a API. **Nenhuma tela é real hoje.**

**Passageiro** (`apps/passenger/app`)

| Spec | Arquivo(s) | Estado | Dado | Observação |
|---|---|---|---|---|
| P01 Boas-vindas | `boas-vindas.tsx` | UI | — | Não é a rota inicial |
| P02 Login/cadastro | `login.tsx`, `cadastro.tsx` | parcial | simulado | Divergente do contrato (ver 1.2); sem código, sem recuperação, sem aceite |
| P03 Início/mapa | `index.tsx` | UI | mock | Mapa é imagem (`MapPreviewBackground`); sem localização |
| P04 Origem e destino | `destino.tsx` | parcial | mock | Busca em lista local; sem confirmação no mapa; sem origem editável |
| P05 Categoria | dentro de `index.tsx` (`RideCategoryCard`) | parcial | mock | Nomes e preços de mockup |
| P06 Confirmação | `confirmacao.tsx` | UI | mock | Meios de pagamento de mock |
| P07 Buscando | `buscando.tsx` | UI | simulador | Cancelar funciona no simulador |
| P08 Motorista atribuído | `a-caminho.tsx` | UI | simulador | Ligar/mensagem/segurança com `onPress` vazio |
| P09 Em andamento | `em-andamento.tsx` | UI | simulador | |
| P10 Concluída | `concluida.tsx` | UI | mock | Recibo de mock; avaliação só local |
| P11 Histórico | `historico.tsx`, `historico-detalhe.tsx` | UI | mock | |
| P12 Pagamento/carteira | — | — | — | Depende das decisões 3, 4 e S5 |
| P13 Perfil/config. | `perfil.tsx`, `configuracoes.tsx` | parcial | mock | Só "Configurações" e "Sair" têm ação; o resto das linhas não navega |
| P14 Ajuda/segurança | — | — | — | Linha "Ajuda e suporte" sem ação |
| (dev) | `catalogo.tsx`, `mapbox-check(.web).tsx` | — | — | Telas de desenvolvimento; não podem ir para a loja |

**Motorista** (`apps/driver/app`): existe **uma** tela de produto.

| Spec | Estado | Observação |
|---|---|---|
| M01 Login, M02 Cadastro, M03 Documentos, M04 Análise | — | |
| M05 Dashboard | UI (`index.tsx`) | `registrationApproved = true` e `online = true` fixos; mapa é imagem; resumo do dia de mock |
| M06 Nova corrida | UI dentro do M05 (`NewRideOfferCard`) | Contador local de 15 s, aceitar/recusar sem API (correto por enquanto: o servidor é quem expira) |
| M07–M14 | — | |
| (dev) | `mapbox-check(.web).tsx` | |

---

## 2. Princípios de execução (o que não muda de fatia para fatia)

1. **O app nunca decide estado crítico.** Sessão, aceite, oferta, transição de corrida: a resposta do servidor manda
   (MOTORISTA.md, "regras de interação"; §6.4 "WS avisa, REST é a verdade").
2. **Mock explícito até o http existir.** Cada fatia troca uma porta de `mock` para `http`; telas ainda em mock
   continuam com `MockBadge`. Nenhum número de mockup vira regra.
3. **Web export é ferramenta de revisão, não alvo.** Toda fatia deve continuar exportando para web (a Íris e o dono
   revisam por ali), por isso qualquer módulo nativo entra atrás de uma porta com implementação web
   (ex.: `SecureStore` não existe no web → sessão só em memória no web).
4. **Uma fatia = um PR verificável.** Aceite = `npm run check` verde + export web dos dois apps + o critério da
   fatia, provado por quem não escreveu o código (skill `quem-valida-o-que`).
5. **Texto de motorista: "conta" não é "cadastro".** Criar a conta no app do motorista não abre o cadastro de
   motorista (que só abre com as regras de taxa e repasse publicadas, gate do S2). A copy das telas M01/M02 precisa
   respeitar a separação candidatura / cadastro já firmada no site.

---

## 3. Fatias, em ordem cronológica

Cada fatia: **quem**, **depende de** (backend e outras fatias), **aceite**, e **📱** quando só se prova em aparelho
real. "Dono" = exige ação ou decisão do dono.

### Estado de entrega (atualizado em 22/11/2026)

A seção 1 é de 21/11 e não reflete estes commits. Esta tabela é o estado atual de cada entrega, com o que **não** foi provado.
"Provado" aqui quer dizer o que o commit ou o veredito registra; nada disto foi reexecutado nesta atualização.

| Item | Commit | Provado (segundo o registro) | NÃO provado / pendente |
|---|---|---|---|
| **A1** Higiene do protótipo | `79f41d8` | Grupos `(auth)`/`(app)` com `Stack.Protected`; `catalogo` e `mapbox-check` saem do bundle de produção (`0fe8883`, na pasta `(dev)`). Lyra provou no Chromium (export web) e em bundles Android/iOS, sem aparelho. | Íris não validou de forma independente. Nada em aparelho. Sessão ainda é mock em memória (A3). |
| **A2** Porta de identidade no `api-client` | `0ce3dd4` | 114 testes do pacote (Atlas reexecutou: 114/114). Vega: 43/43 contra a API real, com Postgres próprio. | Íris não validou. Armazenamento seguro (A3) não feito. Motorista ainda sem cliente de identidade (B2). |
| **B1** Identidade no passageiro | `bb6c024`, correções em `6f59918` | Lyra: cerca de 280 verificações no navegador (320 a 430 px) e mutação. `6f59918` corrige F3 a F8 e F12 da Íris. | Veredito da Íris na passada 3: **REPROVADO** (F3, "Mostrar senha" sumia em Firefox/WebKit; corrigido em `6f59918`). **Sem nova passada da Íris depois de `6f59918`.** F10: `server_busy` (503) cai em "Serviço indisponível" (`apps/passenger/src/identity/authErrors.ts` não tem caso próprio). F9 (registrado na passada 3, não reverificado): Termos e Política só abrem deslogado. Nada em aparelho, leitor de tela ou Safari do iPhone. |
| **B3** Aceite com versão exibida, parte do app | `0cc39aa` (API: `d75b9b9`) | Vega: 216 testes; 29/29 contra a API real. Lyra: 136 verificações no navegador (320 px). Atlas reexecutou `npm run check` (exit 0). | Íris e Órion não validaram. F10 da passada 3 registrou `consent_outdated` caindo em "Algo deu errado"; o código atual tem caso para ele (`authErrors.ts:218`), não reconfirmado na tela. B-6 (SHA-256 do texto no app) ficou para A3. Nada em aparelho. |
| **M-3** Build de loja sem telas de dev e sem identidade simulada (Órion, rodada 3b) | `0fe8883` | Perfil derivado de `NODE_ENV`; aborta sem perfil, em contradição ou com `mock` em `production`; escape `VUUMBORA_ALLOW_MOCK_IDENTITY_IN_PRODUCTION=1`. Lyra: 59/59 nos dois apps, mutação, exports web e Android. Atlas conferiu a config com e sem escape. | Do próprio commit: `eas build` real, Gradle/Xcode, iOS e aparelho **não provados**. Órion não revalidou depois do commit (a confirmar). Escape temporário ainda existe. |
| **B-9** Painel: `csrfToken` obrigatório em sessão nova (Órion, rodada 3b) | `0fe8883` | Código: `apps/admin/src/api/authResponses.ts:73-74` exige texto; `null` só é aceito em `/me` (`:82-84`). Rodada 3b marca como resolvido (`docs/revisao-seguranca-s1-rodada3b.md:243`). | Painel contra a API viva não provado (commit). Órion não revalidou (a confirmar). |

Observação: **M-3** aqui é o da rodada 3b (build de loja). O M-3 da rodada 3 (aceite com versão exibida) é o item **B3**, e
por isso aparecem as duas linhas separadas. CI: o veredito da passada 3 registrou CI vermelho no SHA anterior (F1 e F2,
bloqueantes). O estado do CI no HEAD atual **não foi verificado** (a confirmar).

### Bloco A — Fundação do app (pode andar já; nenhuma depende do dono)

**A1. Higiene do protótipo** — Lyra
- Grupos `(auth)` e `(app)` com `Stack.Protected` nos dois apps; sem sessão, o passageiro abre em P01 e o
  motorista em M01 (por enquanto com sessão de mock).
- Telas de desenvolvimento (`catalogo`, `mapbox-check`) fora do build de produção (atrás de variável de ambiente
  de build, não de `__DEV__` de runtime apenas).
- Categorias: os cinco nomes decididos em 20/11, preços marcados como estimativa de demonstração.
- Botões de login social ocultos enquanto a decisão 8 estiver aberta (desabilitado na tela de loja é rejeição fácil
  e promete o que não existe).
- Investigar o `index` de 2,3 MB do motorista no export web (provável `mapbox-gl` entrando fora da rota de checagem).
- **Depende de:** nada. **Aceite:** sem sessão, nenhuma rota de `(app)` abre (testar por URL direta no web);
  `catalogo` e `mapbox-check` ausentes do export com a variável de produção; `check` e exports verdes.

**A2. Porta de identidade e sessão no `api-client`** — Vega
- Substitui o `AuthPort` antigo pelo contrato de `docs/contrato-identidade-apps.md` (nove rotas + `GET /v1/auth/me`),
  com `accountType` fixo por app (fábrica `createIdentityClient({ mode, baseUrl, accountType })`), adaptador `mock`
  com os mesmos códigos de erro, adaptador `http`.
- `ApiError` ganha `code` do servidor e os extras (`attemptsLeft`, `retryAfterSeconds`), sem quebrar o `kind`.
- `SessionManager` com **renovação serializada** (ver seção 4) e uma `SessionStoragePort` (implementação nativa e web
  entram na A3; aqui só a interface e uma em memória).
- Cabeçalho `X-App-Version` em toda chamada desde já (o servidor ainda ignora; §6 prevê `426`).
- `device.installationId` gerado uma vez e persistido (via a porta de armazenamento).
- **Depende de:** nada (API de identidade já existe no repositório). **Aceite:** testes com `node --test` + `tsx`
  (mesmo runner da API) provando: 20 chamadas concorrentes recebendo `401` geram **exatamente 1** `POST /refresh`;
  falha do refresh gera **1** logout local e todas as chamadas pendentes recebem `unauthorized`; adaptador `http`
  contra a API local (`npm run api`) passa o fluxo cadastro → verificação → login → refresh → logout.

**A3. Armazenamento seguro e cliente de dados** — Lyra (com revisão da Vega)
- Instalar `expo-secure-store` (refresh token e `installationId`) e TanStack Query (estado remoto, D-10).
- `SessionStoragePort` nativa = SecureStore; web = memória (sessão some ao recarregar a página; aceitável para preview).
- **Depende de:** A2. **Aceite:** export web segue verde; no web, nenhum token em `localStorage`.
  **📱** persistência real: fechar o app à força e reabrir mantém a sessão (Android e iPhone); no iPhone, o Keychain
  **sobrevive à desinstalação** — decidir e provar o comportamento na reinstalação (recomendação: na primeira
  execução após instalar, apagar o que estiver no Keychain, usando um marcador em armazenamento comum).

**A4. EAS e primeiro build em aparelho Android** — Vulcano (dono cria a conta Expo)
- `eas.json` com perfis `development`, `preview`, `production` por app; `EXPO_PUBLIC_API_URL` e
  `EXPO_PUBLIC_MAPBOX_TOKEN` como variáveis do EAS (fora do git); dois canais do EAS Update (§4.1).
- Primeiro development build Android (APK instalado direto, **não precisa da conta Google Play**).
- **Depende de:** conta Expo (organização) do dono. **Aceite 📱:** em um Android real, os dois apps abrem com
  fonte da marca, splash e ícone adaptativo corretos, e `mapbox-check` renderiza o mapa nativo (primeira prova
  nativa do Mapbox).

**A5. Tipos dos contratos §6.2–§6.4 e mocks** — Vega (a pendência do S0)
- Portas de cotação, corrida, oferta, disponibilidade, verificação e tempo real no `api-client` com os tipos da
  §6 e adaptadores `mock` que reproduzem estados e erros (`offer_taken`, `offer_expired`, `quote_expired`, etc.).
- **Depende de:** nada. **Aceite:** cada rota da §6.2–§6.4 tem entrada, saída e erros tipados; o simulador do
  passageiro passa a ser o adaptador `mock` dessas portas (mesma progressão de hoje, agora atrás da porta).
  Desbloqueia o Bloco D na UI antes do S4.

### Bloco B — Identidade de ponta a ponta (o primeiro uso real dos apps)

**B1. Identidade no passageiro** — Lyra
- P01; P02 login (e-mail **ou ID público**, sem celular); cadastro (nome, e-mail, senha 8–72 bytes, celular
  opcional, data de nascimento, dois aceites com acesso aos textos); tela de **código + senha** com reenvio
  (contador de 60 s; `emailSent:false` oferece reenviar); esqueci/redefinir senha; sair (`/logout`).
- Estado de tela para cada código do contrato: `invalid_body`/campos, `invalid_birth_date`, `underage`,
  `consent_required`, `consent_unavailable` ("cadastro ainda não está aberto"), `email_taken`,
  `invalid_credentials`, `email_not_verified` (leva à tela do código), `too_many_attempts` (contagem de
  `retryAfterSeconds`, **nunca** "conta bloqueada"), `invalid_code` + `attemptsLeft`, `code_locked`,
  `code_expired`, `reset_locked` ("tente mais tarde ou fale com o suporte"), rede indisponível.
- A data de nascimento não é guardada depois do envio (contrato).
- **Depende de:** A1, A2, A3. **Aceite:** checklist de estados acima exercitado no adaptador `mock` (web) pela
  Íris; leitor de tela anuncia os erros de campo.

**B2. Identidade no motorista** — Lyra
- M01 e a parte "conta" do M02, com o mesmo fluxo e `accountType: "driver"`. Peças visuais comuns (campo de código,
  data, aceite, contagem regressiva) vão para `packages/ui`; as telas ficam em cada app (D-04).
- **Depende de:** B1. **Aceite:** idem B1; copy revisada contra a regra candidatura/cadastro (seção 2, item 5).

**B3. Aceite com versão exibida (M-3 da rodada 3 do Órion)** — Vega, depois Lyra
> Entregue (API `d75b9b9`, app `0cc39aa`; ver a tabela "Estado de entrega"). O texto abaixo é o desenho original, mantido como histórico.
- Hoje o servidor grava a versão da variável de ambiente, não a que a pessoa viu. Contrato proposto (a Vega finaliza
  e o Órion confere):
  - `GET /v1/legal/current?audience=passenger|driver` → `{ terms: { version, sha256, publishedAt, url },
    privacy: { ... } }`, lido de uma tabela de versões publicadas (`documento`, `audience`, `versão`,
    `sha-256 do texto`, `publicada em`); `url` aponta para texto imutável por versão.
  - `POST /v1/auth/register` passa a exigir `termsVersion` e `privacyVersion` **exibidas**; se divergirem da
    vigente: `409 consent_outdated` com as versões atuais; o app recarrega o texto e pede o aceite de novo.
  - Reaceite de conta antiga quando a versão mudar: fica desenhado aqui e implementado antes do S7
    (sinal em `GET /v1/auth/me` e uma rota de aceite autenticada).
- Lyra: o cadastro (B1/B2) busca as versões antes de mostrar os aceites, abre o texto daquela versão e envia as duas
  versões; trata `409 consent_outdated`.
- **Depende de:** B1/B2 para a parte da Lyra. **Gate do dono:** os textos (com advogado) e a decisão de haver
  Termos diferentes para passageiro e motorista. A estrutura pode ser feita **antes** dos textos (como o Órion
  observou, sem migração de dados). **Aceite:** Órion marca M-3 como resolvido; teste prova que app antigo
  (versão velha) recebe `409` e não grava aceite.

**B4. API acessível por HTTPS para aparelho** — Vulcano + dono
- Publicar o S1 (migrações 0010–0020 e código, juntos) no ambiente fechado com HTTPS. Aparelho real contra API em
  `http://` da rede local esbarra no bloqueio de tráfego em claro do Android 9+ e no ATS do iOS; abrir exceção
  só no perfil `development` é possível, mas não prova o que vai para a loja.
- **Depende de:** passos do dono no Easypanel (PROGRESSO.md), SMTP real com SPF/DKIM. **Aceite:** `curl` da
  rota de saúde e um cadastro de teste com e-mail real recebido.

**B5. Prova de identidade em aparelhos reais** — Íris
- **Depende de:** B1, B2, B4, A4 (Android) e A6 (iPhone). **Aceite 📱 (Android e iPhone):** cadastro com e-mail real
  → código → login → app morto e reaberto continua logado → após 15 min em segundo plano, voltar ao app faz **uma**
  renovação (conferir no `access_log`: um `token_refresh`, zero `token_reuse_detected`) → modo avião no meio da
  renovação e volta → sair → "esqueci a senha" com e-mail real. Teclado não cobre campo nem botão; área segura
  correta com entalhe; colar o código do e-mail funciona.

**A6. Primeiro build em iPhone** — Vulcano (dono: conta Apple)
- Development build iOS via EAS (sem Mac local) com o aparelho registrado (UDID). Mesmos critérios da A4.
- **Depende de:** conta Apple Developer paga. **Aceite 📱:** idem A4 em iPhone real.
  Sem a conta Apple **não há nenhuma prova de iOS possível** neste ambiente (Windows não roda simulador).

### Bloco C — Telas que não dependem da corrida

**C1. Perfil e ajuda** — Lyra (Vega para a exclusão)
- P13/M13 com `GET /v1/auth/me` (nome, ID público) real; o resto segue mock com selo. P14/M14: canal de suporte
  decidido (WhatsApp com atendimento humano em Natal) via `Linking`, com tratamento de "WhatsApp não instalado".
- Entrada de **exclusão de conta** no app: as duas lojas exigem o caminho dentro do app (e a Google Play também
  na web). Rota `POST /v1/me/deletion` (§6.1) — Vega — e página web.
- **Depende de:** B1/B2; número/canal oficial do suporte (dono); regra de retenção da exclusão (S7, mas a rota
  precisa existir antes da primeira submissão). **Aceite:** exclusão pedida no app aparece na fila LGPD;
  **📱** abrir o WhatsApp a partir do app nos dois sistemas.

**C2. Etapa 2 do motorista (M03, M04)** — Lyra + Vega (S2)
- Upload de documentos por URL assinada, estado da análise (`GET /v1/driver/verification`), correção pedida.
- **Depende de:** S2 no backend; decisão 9 (quem analisa, prazo, critério); documentos exigidos confirmados na STTU;
  **gate público**: o cadastro só abre depois de taxa e repasse publicados. Não construir a lista de documentos
  antes da confirmação (seria desenho, não produto). **Aceite:** critério do S2 ("de candidatura a `approved` sem
  passo fora do app e do admin"). **📱** câmera e seletor de arquivo nos dois sistemas; upload em 4G fraco.

### Bloco D — Mapa e corrida (S3 e S4)

**D1. Mapa e localização do passageiro** — Lyra
- Mapbox nativo na Home e na confirmação de origem; permissão de localização **em primeiro plano**; negada →
  entrada manual de endereço (PASSAGEIRO.md). Busca de endereço atrás da `PlacesPort` já existente.
- **Depende de:** A4/A6 (development build); decidir onde roda a busca de endereço (direto do app com o token
  público ou pela API) — o plano não fixa; decidir junto do teste de 100 endereços do S3. Dono: **restringir o
  token Mapbox** por identificador de app. **Aceite 📱:** pedido de permissão com texto em português nos dois
  sistemas; negar e seguir pelo endereço manual; mapa não cobre os endereços.

**D2. Cotação e categorias reais (P05, P06)** — Lyra + Vega (S3)
- `GET /v1/categories`, `POST /v1/quotes`; "preço estimado" sempre rotulado; `409 quote_expired` recota.
- **Depende de:** S3 (decisões 7 e 13). **Aceite:** critérios do S3; nenhuma cifra de mockup no código.

**D3. Corrida do passageiro (P07–P11)** — Lyra + Vega (S4)
- Troca o adaptador `mock` (A5) pelo `http`: `POST /v1/trips` com `Idempotency-Key`, WebSocket com `seq` e
  ressincronização por `GET /v1/trips/:id`, cancelamento, avaliação, recibo, histórico paginado, compartilhar e SOS.
- **Depende de:** S4. **Aceite:** critérios do S4 (derrubar a rede 30 s e voltar ao estado certo sem ação).
  **📱** troca Wi-Fi ↔ 4G no meio da corrida; app em segundo plano e de volta.

**D4. Jornada do motorista (M05–M10, M12)** — Lyra + Vega (S2 + S4)
- Online/offline só com `approved` vindo do servidor; ofertas por WebSocket com expiração do servidor; aceite
  atômico (`409 offer_taken`/`offer_expired`); chegada/início/fim validados no servidor; navegação abrindo
  Waze/Google Maps por link (decisão 10).
- **Localização em segundo plano**: `expo-location` + `expo-task-manager`, serviço em primeiro plano no Android,
  consentimento específico antes do pedido do sistema.
- **Depende de:** S4; C2 (aprovação real). **Aceite 📱 (Android e iPhone, obrigatório pela decisão de 21/11):**
  teste de campo do S4 (10 corridas, sem buraco de posição > 30 s); tela bloqueada e app em segundo plano;
  pelo menos um Android de fabricante com economia de bateria agressiva; critério de troca para biblioteca comercial
  do §4.1 medido.

**D5. Push** — Vega + Lyra (S4)
- `expo-notifications`, `POST /v1/me/devices/push-token`, `PushPort` no servidor.
- **Depende de:** S4; no iOS, chave APNs (conta Apple). **Aceite 📱:** push com app fechado nos dois sistemas.
  Simulador/web não provam push.

**D6. Ganhos e pagamento (M11, P12)** — S5; decisões 3, 4, 6, 7, 15. Fora do horizonte deste plano além da ordem.

### Bloco E — Lojas (S7/S8)

**E1. Prontidão de loja** — Vulcano + Alexandria + Apolo; dono
- Builds `production`; textos de permissão; declaração de localização em segundo plano (Google Play pede vídeo da
  funcionalidade); formulário de segurança de dados (Google) e rótulos de privacidade (Apple); classificação etária;
  capturas de tela; exclusão de conta (C1); Termos e Política publicados (B3).
- **Depende de:** contas das duas lojas (decisão 17); S7. **Aceite:** critério do S7 ("builds aceitos no teste
  interno das duas lojas").

### Sequência e paralelismo

```
Já:     A1 (Lyra) ─┬─ B1 ─ B2 ─┐          A5 (Vega) ─► UI do Bloco D em mock
        A2 (Vega) ─┴─ A3 ──────┤
        A4 (Vulcano, conta Expo)┤
                                ├─ B3 (Vega estrutura já; texto = dono)
Dono:   B4 (publicar S1) ───────┼─ B5 (📱 Android; iPhone após A6)
        A6 (conta Apple) ───────┘
Depois: C1 ─► C2 (S2) ─► D1 ─► D2 (S3) ─► D3/D4/D5 (S4) ─► D6 (S5) ─► E1 (S7)
```

Lyra e Vega podem trabalhar em paralelo **desde já**: A1 ‖ A2 ‖ A5, porque o contrato de identidade e a §6 já estão
escritos. A3 e B1 esperam A2.

---

## 4. Renovação de token serializada (regra de implementação da A2)

A API revoga a família inteira se o mesmo refresh for usado duas vezes (1.2). No celular isso acontece fácil:
três telas pedem dados ao voltar do segundo plano, as três recebem `401` e as três tentariam renovar — a segunda
derruba a sessão. Regras:

1. **Um único voo**: uma promessa de renovação compartilhada; quem recebe `401` espera ela e repete a chamada
   **uma** vez. O WebSocket (S4) usa o mesmo gerenciador antes de autenticar o primeiro quadro.
2. Renovar **antes** de vencer quando o app volta ao primeiro plano e o `accessTokenExpiresAt` está a menos de
   60 s (evita a rajada de 401).
3. O novo refresh é gravado no armazenamento seguro **antes** de liberar as chamadas em espera.
4. `401 invalid_refresh_token` = logout local, sem nova tentativa.
5. **Risco aberto (Vega + Órion):** se a resposta do refresh se perder (rede móvel caindo depois de o servidor
   rodar), o app fica com o refresh velho e a próxima tentativa é tratada como reuso → logout forçado. Não há como
   o cliente resolver isso sozinho. Opções: aceitar (logout raro) ou uma janela curta de tolerância no servidor
   que devolve o mesmo sucessor para o mesmo token e dispositivo. É troca de segurança; decidir com dado da B5
   (contar `token_reuse_detected` sem ataque nos testes de campo).

---

## 5. O que exige o dono

| Item | Bloqueia | Observação |
|---|---|---|
| Conta Expo (organização) | A4, A6 | Gratuita; deve ser do dono, não de um integrante |
| **Conta Apple Developer** (~US$ 99/ano) | A6, B5 no iPhone, D5 no iOS, E1 | Sem ela não há nenhum teste em iPhone. Como empresa, exige número D-U-N-S (gratuito, leva dias) |
| **Conta Google Play** (~US$ 25, única) | E1 (teste interno e loja) | Não bloqueia o Android de desenvolvimento (A4). Conta de pessoa física nova exige teste fechado com testadores por semanas antes da produção; conta de empresa não (confirmar a regra vigente na inscrição). Empresa também mostra quem publica — o motorista desconfia de app sem origem |
| Identificadores definitivos (`com.vuumbora.passenger` / `.driver`) | A4/A6 (trocar depois custa reinstalação e app novo na loja) | Confirmar antes do primeiro build |
| **Restringir o token Mapbox** por identificador de app | D1 em produção | Pendência de 18/11 |
| **Textos de Termos e Política** (com advogado), e se há versões por perfil | B3 entrar em vigor, E1 | Sem eles o cadastro fica em `503 consent_unavailable` por desenho |
| Publicar o S1 e SMTP real (SPF/DKIM) | B4, B5 | Passos de `docs/producao-passo-a-passo-dono.md` |
| Canal de suporte oficial no app | C1 | WhatsApp com pessoa de Natal, já decidido para o site |
| Login social (decisão 8) | nada por ora | Se entrar Google, a Apple entra junto |
| Decisões 9, STTU, taxa/repasse publicados | C2 | Gate público do cadastro de motorista |
| Decisões 3, 4, 6, 7, 13, 15 | D2, D6 | Já mapeadas no plano do sistema |
| Aparelhos de teste: 2 Android comuns + 1 iPhone | B5, D4 | Critério do S4 |

---

## 6. O que só se prova em aparelho real

Nada disto se prova no export web nem no typecheck: renderização nativa do Mapbox; fonte, splash e ícone
adaptativo; teclado, área segura e botão "voltar" do Android; persistência no Keychain/Keystore (e o Keychain
sobrevivendo à desinstalação no iPhone); renovação ao voltar do segundo plano; colar código do e-mail; permissões
de localização (primeiro e segundo plano) e textos delas; localização com tela bloqueada e economia de bateria de
fabricante; push com app fechado; câmera/arquivos para documentos; `Linking` para WhatsApp, telefone e Waze/Google
Maps; troca Wi-Fi ↔ 4G; tráfego HTTPS (ATS/cleartext). Cada uma está marcada com 📱 na fatia em que entra.
**iPhone depende da conta Apple; hoje, zero prova de iOS é possível.**

---

## 7. Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| Logout forçado por refresh perdido (seção 4, item 5) | Usuário deslogado sem motivo em rede ruim | Medir na B5; decidir tolerância com o Órion |
| iOS sem conta Apple até tarde | Bugs de iPhone descobertos só no S4/S8 | Pedir a conta já; A6 logo depois de A4 |
| Web export mascarar problema nativo | Íris aprova no navegador o que quebra no aparelho | Fatias com 📱 só fecham com prova em aparelho |
| Texto do app chamar a conta do motorista de "cadastro" | Contradiz o compromisso público de 18/11 | Revisão de copy na B2 (Alexandria/Apolo) |
| Termos sem versão exibida (M-3) | Prova de consentimento fraca (LGPD art. 8º §2º) | B3 antes de os textos entrarem em vigor |
| Localização em segundo plano cortada pelo sistema | Buracos na trilha da corrida | Critério de troca do §4.1, medido no D4 |
| Telas de dev indo para a loja | Rejeição/exposição de ferramenta interna | A1 |
