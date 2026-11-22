# @vuumbora/api-client

Portas (interfaces) que as telas consomem + adaptadores `mock` e `http` **distintos**.

- `@vuumbora/api-client`: `ClientConfig` (modo obrigatório, sem default), `ApiError` (`kind` estável + `code`,
  `attemptsLeft`, `retryAfterSeconds` opcionais do servidor), `Result<T>`. O `AuthPort` antigo foi removido.
- `@vuumbora/api-client/identity`: **identidade dos apps** (passageiro e motorista), contrato em
  `docs/contrato-identidade-apps.md`. Ver abaixo.
- `@vuumbora/api-client/trip`: `TripBaseSnapshot`, `TripEvent`, `TripRealtimePort`, `CancelActor` — o que
  `./passenger` e `./driver` precisam concordar sobre uma corrida. Nenhum perfil importa o subcaminho do
  outro (`scripts/check-boundaries.mjs`); o que é comum mora aqui. O snapshot COMPLETO é de cada perfil
  (`PassengerTripSnapshot`, `DriverTripSnapshot`) — ver "Corrida", abaixo.
- `@vuumbora/api-client/passenger`: `PassengerRidePort` (cotação por categoria, pedido, status,
  cancelamento, tempo real), `PlacesPort` — só `apps/passenger`.
- `@vuumbora/api-client/driver`: `DriverJourneyPort` (disponibilidade), `DriverOfferPort`
  (oferta/aceite atômico/tempo real das ofertas), `DriverTripPort` (ações depois do aceite),
  `DriverLocationPort` (posição) — só `apps/driver`.
- `@vuumbora/api-client/waitlist`: `WaitlistPort` + `createWaitlistHttpAdapter` — só `apps/site`. Primeiro
  adaptador `http` real do monorepo (backend em `apps/api`); contrato completo em
  `docs/lista-de-espera.md`.

Toda resposta traz `origin: 'mock' | 'real'` para a UI sinalizar dados de demonstração.
Ações críticas (solicitar, aceitar, cancelar) exigem `idempotencyKey`; a inscrição na lista de
espera não precisa — o e-mail já é a chave natural de deduplicação, garantida no banco.
Adaptadores mock entram na Fase 1 (passageiro/motorista), http na Etapa E — a lista de espera já
tem o seu. SDKs de mapa/pagamento/push também entram atrás de portas aqui, nunca chamados direto
da tela.

## Identidade (`/identity`)

```ts
import { createIdentityClient } from '@vuumbora/api-client/identity';

const identity = createIdentityClient({
  mode: 'http',                    // 'mock' | 'http' — sem padrão
  baseUrl: process.env.EXPO_PUBLIC_API_URL,
  accountType: 'passenger',        // fixo por app: 'passenger' | 'driver'
  platform: Platform.OS,           // 'android' | 'ios' | 'web' (obrigatório fora do navegador)
  appVersion: '1.0.0',             // vai em X-App-Version; sem ela sai "unknown"
  allowInsecureHttp: __DEV__,      // SÓ desenvolvimento: baseUrl http: é recusado na montagem sem isto (B-8d)
  storage,                         // SessionStoragePort; padrão = memória (A3 passa o SecureStore)
  randomId,                        // só se não houver `crypto` global (ex.: expo-crypto)
});
```

- **Telas usam `IdentityClient`**: `legalCurrent`, `register`, `verifyEmail`, `resendVerification`, `forgotPassword`,
  `resetPassword`, `login` (grava a sessão e devolve **só a conta**; os tokens nunca saem), `logout`, `logoutAll`, `me`
  (a conta + `consent`), `acceptConsents`.
  `accountType` entra sozinho em todo corpo; campos que o contrato não pede (ex.: `confirmPassword`) não são enviados.
- **Termos de Uso e Política de Privacidade — o aceite prova o que a pessoa VIU (M-2)**:
  - `legalCurrent()` (sem sessão; o perfil é o `accountType` do app) devolve os dois documentos vigentes:
    `{ audience, terms: { version, sha256, publishedAt, url }, privacy: { ... } }`.
  - `register({ ..., termsAccepted: true, privacyAccepted: true, termsVersion, privacyVersion })`: as versões são
    **entrada da tela** — `terms.version` e `privacy.version` do que ela renderizou. O pacote nunca as inventa nem as
    guarda; uma constante de build faria do aceite um rótulo. Sem elas, `400` (`validation`, campo `consent`).
  - **`409 consent_outdated`** (a versão exibida deixou de ser a vigente) vem como `kind: 'conflict'`,
    `reason: 'consent_outdated'` e **`error.current`** = a vigente no mesmo formato de `legalCurrent()`. A tela mostra
    ESSES textos e só então reenvia com as versões novas: o cliente **não reenvia sozinho**. Sem `error.current` válido
    (ou de outro perfil) o erro sai sem `current` e a tela chama `legalCurrent()`.
  - `me()` traz `consent: { upToDate, pending: [{ document: 'terms' | 'privacy', version, sha256, publishedAt, url }] }`
    (Termos antes da Política; `pending` = a versão VIGENTE do que falta aceitar), ou `consent: null` quando a API está
    sem os textos (a sessão vale; não há como mostrar reaceite agora). `consent` ausente é resposta fora do contrato
    (`unknown`), não "em dia".
  - `acceptConsents({ termsVersion?, privacyVersion? })` (reaceite; ao menos uma) usa a sessão (401 → renova e repete uma
    vez), é idempotente e devolve o `consent` novo. Versão que não é a vigente = o mesmo `409` com `error.current`.
  - O `mock` acompanha: catálogo em `mock.legal` (padrão `mock-1`), `409` com `current`, `consent` em `me`, reaceite.
    `sha256` (zeros) e `url` (`.invalid`) do mock são fictícios.
- **Estado de sessão**: `identity.session.getState()` / `subscribe()` / `restore()` →
  `unknown` (lendo o cofre) | `signed_in` | `signed_out` com `reason` `none | user | session_expired`. O objeto é estável
  enquanto nada muda (serve a `useSyncExternalStore`); rotação de token não notifica.
- **Chamadas autenticadas de qualquer porta de dados**: `identity.session.run((accessToken) => porta.chamada(accessToken))`.
  Em `401` renova e repete **uma** vez. Para o WebSocket: `identity.session.getValidAccessToken()`. Ao voltar ao primeiro
  plano: `identity.session.refreshIfExpiring()`.
- **Renovação serializada** (`docs/plano-apps-execucao.md` §4; a API revoga a família inteira se o mesmo refresh for usado
  duas vezes): um único `POST /refresh` por vez, quem recebe 401 espera e repete; um 401 tardio não renova de novo; o novo
  refresh é gravado antes de liberar quem esperava; login/logout no meio de uma chamada nunca faz o pedido de uma conta
  ser repetido com o token de outra.
  - Recusa **definitiva** do refresh = **um** logout local; todas as pendentes recebem `unauthorized` com o `code` que o
    servidor mandou e o estado vira `signed_out/session_expired`. Definitiva é só a recusa **assinada pela API**: `401
    invalid_refresh_token` (ou o mesmo `code` em 400/403) e `400 invalid_refresh_body` (refresh malformado guardado). **Status
    sozinho não basta** (M-4): um proxy, WAF ou CDN também responde 401/403/400/413/415, e isso não pode deslogar todo mundo.
    O `400 invalid_body` **genérico** da API (qualquer 4xx de transporte) **não** é definitivo (B5).
  - Falha **transitória** (sem rede, 5xx, 429 **e qualquer recusa sem `code` reconhecido**) **não desloga**: a sessão fica
    e o mesmo refresh descansa 5 s (até 60 s se o servidor mandar `retryAfterSeconds`) antes de nova tentativa — repetir
    logo depois de uma falha ambígua seria reuso. Quem pediu recebe `kind: 'unavailable'` (tente de novo), nunca
    `unauthorized`/`forbidden` de intermediário, e nunca um `code` inventado.
  - **Troca de sessão no meio da chamada** (B-8b): o resultado de uma chamada que começou numa sessão anterior (logout,
    login de outra conta) é descartado — `unauthorized` com `code: 'no_session'` — também quando deu CERTO. Dado da conta
    A nunca chega à tela da conta B.
  - **Revogação no servidor** (B-8a, B-8c): `login` com sessão aberta revoga a anterior (em segundo plano); `logout` sem
    rede/servidor fora **guarda** o refresh numa fila no cofre (`vuumbora.<tipo>.pending_revocations`) e `restore()` a
    repete na abertura. A fila sai quando o servidor confirma, o token vence ou a recusa não melhora (400); tem teto de 10.
    Ela guarda o refresh que ainda vale no servidor, no mesmo cofre da sessão.
  - Limite conhecido (plano §4.5): resposta de refresh perdida *depois* de o servidor rotacionar → próxima renovação
    é reuso → logout forçado. O cliente não resolve sozinho.
- **`http:`** (B-8d): `baseUrl` tem de ser `https:`. `allowInsecureHttp: true` libera `http:` e é só de desenvolvimento
  (emulador, aparelho na rede local): o app o liga a `__DEV__`. Sem isso a montagem recusa, em qualquer host — senha e
  tokens não viajam em claro por causa de uma URL errada numa build de loja.
- **Erros**: ramifique em `error.kind`; escolha texto por `error.code` (`invalid_code`, `email_not_verified`,
  `too_many_attempts`, `underage`...). Validação (`400`) traz `fields` por campo: `email`, `password`, `phone`,
  `birthDate`, `consent`, `code`, ou `form` (sem campo específico). `409` → `conflict` com `reason = code`.
  `429` → `rate_limited` com `retryAfterSeconds` (corpo, ou cabeçalho `Retry-After` como reserva).
  `409 consent_outdated` traz `error.current` (ver "Termos de Uso e Política", acima).
  `403 email_not_verified` leva à tela do código (`resendVerification`); **não** é falha de senha.
- **`SessionStoragePort`** (`getItem/setItem/removeItem`, texto): chaves `vuumbora.<accountType>.session` e
  `vuumbora.<accountType>.installation_id`. Se o cofre rejeitar, a sessão em memória segue valendo e `onStorageError`
  recebe o erro (nunca o conteúdo). `installationId` é gerado uma vez, sobrevive a logout e vai no `device` do login.
- **Mock**: `mode: 'mock'` reproduz as regras e os códigos de erro do contrato (código de e-mail `123456`, espera
  progressiva do login, `attemptsLeft`, `reset_locked`, reuso de refresh, 15 min de access token). Opções em `mock`
  (`verificationCode`, `latencyMs`, `clock`). Não reproduz limites por IP/e-mail do servidor nem `503`.

## Corrida (`/trip`, `/passenger`, `/driver`)

Contratos de cotação, corrida, oferta, disponibilidade e tempo real (`docs/plano-sistema-arquitetura.md`
§6.2 [passageiro], §6.3 [motorista], §6.4 [tempo real]; `docs/plano-sistema.md` §5.2–§5.6). A pendência do
S0 (`docs/plano-apps-execucao.md`, fatia A5), **conferida e ajustada** por
`docs/contratos/conferencia-f08-nova.md` (veredito: AJUSTES — os achados A1–A4, B1–B7 e C1–C4 abaixo já
estão corrigidos no código).

**Token:** nenhuma porta de corrida recebe `accessToken` como parâmetro. O adaptador `http` (quando
existir) é construído com a sessão da identidade e chama `identity.session.run(...)` por dentro de cada
método — exatamente como qualquer outra porta autenticada (ver "Identidade", acima). O WebSocket usa
`identity.session.getValidAccessToken()` no primeiro quadro. O `mock` não autentica nada.

### Cotação — `PassengerRidePort.quote`

`quote({ origin, destination, kind? })` → `Quote { categories: CategoryQuote[] }`. **Cada categoria tem o
PRÓPRIO `quoteId`/`expiresAt`** (padrão 5 min, §5.6) — não existe mais um `quoteId` único para todas (era o
achado B1: o modelo de dados, `fare_quotes`, já é por categoria). Cada `CategoryQuote` também traz
`distanceM`, `durationS`, `pickupEtaS` e `availability: 'high' | 'low' | 'none'` (§5.3 — a UI avisa de
espera maior ANTES do pedido; **não bloqueia**: um pedido com `availability: 'none'` é aceito e só termina
em `failed` se nenhum motorista aparecer a tempo).

Categoria **desligada** (Entrega — §13.3; Motorista mulher — D-08 em aberto) **não aparece na lista**: isso
é diferente de "sem motorista agora". `kind: 'delivery'` (padrão `'ride'`) sempre devolve lista vazia hoje.
`409 conflict` (`reason: 'outside_service_area'`) se o endereço estiver fora da área (mock: opção
`isOutsideServiceArea`, S3 ainda não decidiu a geometria real).

### Pedido — `PassengerRidePort.request`

`request({ quoteId, paymentMethodId }, idempotencyKey)` → `{ tripId, status }`. A categoria **vem da
cotação** (não é mais um campo separado). **A corrida nasce em `requested` e não avança sozinha** (achado
B2: com Pix antes da corrida, S5, ela fica ali até o pagamento confirmar — a interface precisa tratar essa
fase desde já). `404 not_found` (`quoteId` desconhecido), `409 conflict`: `quote_expired` (cotação vencida),
`category_unavailable` (categoria foi desligada ENTRE a cotação e o pedido — não no momento da cotação, que
já filtra) ou `idempotency_key_reused` (achado A4, ver "Idempotência", abaixo).

### Status — `.status` (cada perfil tem o SEU snapshot)

`PassengerRidePort.status`/`DriverTripPort.status` devolvem `{ tripId, status, seq, ...o resto }` —
`tripId`/`status`/`seq` são a base comum (`TripBaseSnapshot`, `@vuumbora/api-client/trip`); o resto é
**diferente por perfil** (achado B4, para o S4 não misturar dado que só um lado pode ver — ex.: o código de
embarque, D-12):
- `PassengerTripSnapshot.driver?: { driverId, firstName, plate }` — só enquanto a corrida TEM motorista
  atribuído; some depois de uma volta para a busca ou cancelamento (achado A2 — nunca mostra o motorista
  antigo).
- `DriverTripSnapshot`: `pickup`/`destination` **completos** (`Place`, endereço e ponto exatos — só porque
  o motorista já foi atribuído), `categoryId`, `estimatedPayout`, `passenger?: { firstName }`.

`404 not_found` se a corrida não existe **ou** (do lado do motorista) não é a ele atribuída — achado A3,
ver "Visibilidade do motorista", abaixo.

### Cancelamento — `.cancel` (passageiro) / `DriverTripPort.cancel` (motorista)

`cancel(tripId, { reason? }, idempotencyKey)` → `{ status, cancellationFee? }` (achado B3 — não é mais
`void`; `cancellationFee` fica para a decisão 15/M6, o mock nunca cobra). `reason` é uma união pequena e
provisória (`CancelReason`/`DriverCancelReason`, com `'other'`) até a decisão 15 fixar os valores finais.
**Não é idempotente no sentido de "sempre sucesso"**: cancelar uma corrida terminal, ou (do lado do
motorista) uma corrida que não é dele, dá `409 conflict` (`reason: 'invalid_transition'`) — o que a
`idempotencyKey` garante é que a MESMA chave repetida (retry de rede) devolve a MESMA resposta.

**A correção do S0 + o achado A1 (quem pode cancelar de onde):**

| Ator | De onde pode cancelar | Para onde |
|---|---|---|
| passageiro, admin, sistema | `requested` … `driver_arrived` | `cancelled` |
| motorista | `driver_assigned`, `driver_en_route` | `searching_driver` (o passageiro não perde o pedido) |
| motorista | `driver_arrived` | `cancelled` (depois do embarque não há volta à busca) |
| motorista | `requested`, `searching_driver` | **recusado** — a corrida ainda não é dele ali |

Essa tabela é UMA função só — `cancelTrip(from, actor)` em `@vuumbora/domain` (raiz, não em
`./passenger` nem `./driver` — nenhum perfil importa o subcaminho do outro só para cancelar). Nenhuma
porta decide o destino, nem a permissão, por conta própria.

### Oferta — `DriverOfferPort` (despacho, §6.2)

`accept(offer, idempotencyKey)` → `{ tripId }`, atômico: `404 not_found` (oferta desconhecida), `409
conflict`: `offer_expired`, `offer_taken` (outro motorista venceu, OU a corrida por baixo já não está em
`searching_driver`) ou `idempotency_key_reused`. **A passagem `driver_assigned` → `driver_en_route` é
automática no aceite** (sistema) — o app do motorista não chama nada para ela.

`decline(offer, { reason? })` é idempotente e nunca falha (oferta desconhecida/já resolvida também dá
sucesso); `reason` é `DeclineReason` (provisória, com `'other'`).

`subscribeOffers(onEvent)` (achado C2) → `offer.created` (chegou uma oferta) e `offer.revoked`
(`reason: 'expired' | 'taken' | 'cancelled'`) quando ela morre por fora — inclusive quando o PASSAGEIRO
cancela a corrida enquanto a oferta ainda está pendente.

**O embarque na oferta é só o bairro — decisão do dono em 22/11/2026**
(`docs/decisoes-do-dono.md`, "Complemento: o embarque na oferta é só o bairro"): `RideOffer.pickup` é
`ApproximatePlace` (`@vuumbora/domain`: `{ neighborhood, approximatePoint }`, SEMPRE arredondado, nunca o
ponto exato), mais `pickupDistanceM`/`pickupEtaS`. **Nunca** o endereço nem o ponto exato — a oferta vai a
vários motoristas, inclusive aos que recusam. `destination` continua um `Place` completo: "destino visível"
(§5.4) é sobre o destino, não sobre onde o passageiro está agora. O endereço e o ponto exatos do embarque só
existem em `DriverTripSnapshot`, depois do aceite, para o motorista atribuído.

### Visibilidade do motorista — achado A3

`DriverTripPort` (status, eventos, `arrived`/`start`/`complete`/`cancel`) só responde para o motorista
**ATRIBUÍDO** à corrida. Quem recusou a oferta, ou perdeu para outro motorista, recebe `404 not_found` —
nunca `403` (não confirma que a corrida existe para quem não é dela) — em QUALQUER chamada, inclusive
`status`. `subscribe` para de entregar eventos no instante em que a atribuição muda (ex.: o próprio
motorista cancelou).

### Ações depois do aceite — `DriverTripPort` (achado C1)

`arrived` (`driver_en_route` → `driver_arrived`), `start({ pickupCode? })` (`driver_arrived` →
`in_progress`; `pickupCode` é opcional — D-12 em aberto; errado é `400 validation`, a 6ª tentativa errada é
`429 rate_limited`), `complete({ deliveryCode? })` (`in_progress` → `completed`; `deliveryCode` só importa
para `kind: 'delivery'`, hoje desligado). Todas recebem `idempotencyKey` e devolvem
`Result<DriverTripSnapshot>`; `409 conflict` (`invalid_transition` ou `idempotency_key_reused`).

### Disponibilidade — `DriverJourneyPort.setAvailability` (achado C3)

`setAvailability({ online, point? })` → `{ phase }`. `point` é obrigatório para ficar online (o despacho
filtra por posição < 30 s, §5.4): sem ele, `400 validation`. `409 conflict`: `driver_not_approved` (conta
não aprovada) ou `not_eligible` (documento vencido).

### Posição — `DriverLocationPort.sendLocations` (achado C4)

`sendLocations(fixes: LocationFix[])` → `void`. `LocationFix.mocked` é o sinal de GPS falso (§5.10),
gravado desde o primeiro dia. O mock só guarda o que recebeu (`control.receivedLocations()`).

### Tempo real da corrida — `TripRealtimePort.subscribe`

`(tripId, onEvent) => unsubscribe`. Evento sempre com `type`, `seq` e `sentAt`. **`seq` conta só mudança de
ESTADO** (achado B5): o evento `location` carrega o `seq` do estado EM VIGOR (não cria um `seq` novo — a
posição não é um novo estado) mais `at` (instante da leitura do GPS, pode chegar atrasado) e `heading?`.
`seq` também vem no `status()` REST, não só no evento, para dar um ponto de partida depois de ressincronizar.

**Ressincronização mora na PORTA, não em cada tela** (achado B5): ao assinar, `subscribe` entrega
IMEDIATAMENTE um evento `status` com o estado atual — quem assina nunca fica sem saber o ponto de partida,
mesmo que a corrida já tenha avançado antes da assinatura. Sem `Result`: é um stream — "WS avisa, REST é a
verdade"; corrida inexistente, ou não mais visível a quem assina (A3), não entrega nada.

### Idempotência — achado A4

`request`, `cancel` (dos dois lados), `accept`, `arrived`, `start` e `complete` recebem `idempotencyKey`. A
MESMA chave com o MESMO corpo devolve a MESMA resposta (nenhum efeito duplicado). A MESMA chave com um corpo
DIFERENTE — ex.: pedir Conforto com outra cotação usando a chave de um pedido de VuumBora já feito — é
`409 conflict` (`reason: 'idempotency_key_reused'`), nunca um sucesso silencioso com o resultado antigo.

### `reason` tipado por operação — achado B6

`ApiErrorKind` (`packages/api-client/src/index.ts`) continua com `reason: string` — não foi tocado, porque
`identity` e `waitlist` já dependem dele com valores arbitrários do servidor. A segurança de tipo mora em
`trip/result.ts`: cada operação tem seu próprio construtor (`quoteConflict`, `requestConflict`,
`cancelConflict`, `acceptConflict`, `availabilityConflict`, `driverActionConflict`), cada um com uma união
FECHADA de `reason` — um valor fora da união não compila. É assim que os mocks garantem que só emitem os
`reason` documentados aqui.

### O mock não despacha motorista sozinho — isso é `control`

Ao contrário da identidade (que se comporta como um servidor sozinho), o mock de corrida não decide
"quando" a coisa acontece: `createMockPassengerRidePort()` e `createMockDriverRidePort()` devolvem, cada
um, `{ port/offerPort+tripPort, control }`. As telas usam só a porta; `control` é quem avança o tempo —
com a MESMA validação do domínio (`transitionTrip`/`cancelTrip`): uma transição que o domínio recusaria
também é recusada em `control`, nunca forçada.

```ts
const { port, control } = createMockPassengerRidePort();
const unsubscribe = port.subscribe(tripId, onEvent);

// Troque o setTimeout do rideSimulator.ts de hoje por chamadas a control, na mesma cadência:
setTimeout(() => control.advance(tripId, 'searching_driver'), 0);
setTimeout(() => control.advance(tripId, 'driver_assigned'), 2600);
setTimeout(() => control.setDriverSummary(tripId, { driverId, firstName, plate }), 2600);
setTimeout(() => control.advance(tripId, 'driver_en_route'), 2600 + 2600);
// control.cancel(tripId, 'driver') simula o motorista desistindo — volta para searching_driver (A2 limpa o resumo).
```

**Trocar o simulador por este mock (para a Lyra, mais tarde):** `apps/passenger/src/sim/rideSimulator.ts`
de hoje chama `transitionRide` direto e grava o resultado na store Zustand. O equivalente aqui é: 1) pedir a
corrida por `port.request(...)`; 2) assinar `port.subscribe(tripId, onEvent)` e projetar cada `TripEvent` na
store (no lugar de `advancePhaseFromSimulator`); 3) mover os `setTimeout`/`setInterval` do simulador para
chamar `control.advance`/`control.setDriverSummary`/`control.emitLocation` em vez de `transitionRide` — a
cadência (2600ms por etapa, progresso de corrida a cada 500ms) pode ser copiada como está. Nenhuma tela
trata `control` como real: ele só existe no adaptador `mock`, o `http` não o exporta.

**Os dois lados com a MESMA corrida:** passe a mesma `TripStore` (`createTripStore()` de `./trip`) para
`createMockPassengerRidePort({ store })` e `createMockDriverRidePort({ store })` — útil para um demo com
os dois apps ao vivo, ou para testar os achados A1–A3 (ver `test/driver-ride-mock.test.ts`, suíte "cenários
da sonda da Nova"). `createMockDriverRidePort({ driverId })` identifica a instância — cada chamada é UM
motorista; sem isso, um id é gerado.

### Testes

```bash
npm test -w @vuumbora/api-client      # node --test + tsx, como a API (sem banco)
npm run typecheck -w @vuumbora/api-client   # src (com DOM) + src SEM DOM + test
npm test -w @vuumbora/domain                # máquina de estados (TripStatus e PassengerTripPhase)
```

O pacote **não depende dos tipos de DOM** (`window`, `document`, `Crypto`): lê o ambiente por `globalThis`. Os apps
compilam com `lib: ["ES2022"]` de propósito e não precisam de nenhum `.d.ts` de apoio; a segunda passada do
`typecheck` (`tsconfig.nodom.json`) garante que isto não volte.

Cobrem também: refresh recusado por intermediário (M-4), troca de sessão no meio da chamada e revogação pendente (B-8),
Termos/Política com versão exibida e `409 consent_outdated` (M-2). Testes de corrida **não dormem**: esperam uma condição
(`waitFor`) e seguram a gravação do cofre por portão (`holdWrites`) — teste baseado em `sleep` deixou um mutante vivo
sob carga.

Cobrem: renovação em voo único (20 chamadas concorrentes com 401 = 1 `POST /refresh`), falha do refresh (1 logout local),
adaptador `http` contra um servidor HTTP falso em processo (cabeçalhos, corpo, mapeamento de erro, timeout, fluxo
completo) e o mock contra o contrato. A prova contra a API real (Postgres + Fastify) não é automática aqui: roda-se à
mão (ver o handoff da A2).
