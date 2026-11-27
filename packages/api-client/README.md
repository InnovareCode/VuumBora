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
  (a conta + `consent`), `acceptConsents`, `deleteAccount`.
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
- **Exclusão de conta** (`deleteAccount({ password })`, item 3 das pendências jurídicas,
  `docs/contrato-identidade-apps.md`): reautentica por senha pela sessão atual (um 401 de token vencido ainda renova
  e repete uma vez, como qualquer chamada autenticada) e, se confirmada, encerra a sessão LOCAL — o servidor já
  revogou TODAS as sessões da conta, não só esta. **`403 wrong_password`** (não `401`) deixa a conta e a sessão
  intactas, numa chamada só, sem repetição automática; `401 unauthorized` é sem sessão válida. **P4 (decisão do
  Atlas em 22/11/2026, conferência PP-12 da Nova, `docs/contratos/conferencia-pp12-nova.md`):** `wrong_password` é
  `403`, não `401`, DE PROPÓSITO — `401` tem o MESMO `kind: 'unauthorized'` de "token de acesso inválido", e o
  `SessionManager` trataria a senha errada como sessão vencida, renovando o token e repetindo a chamada sozinho (a
  senha errada seria conferida duas vezes, e a repetição caía dentro da espera progressiva do servidor, virando
  `429 too_many_attempts` em vez de "senha incorreta"). Mesmo desenho de `403 email_not_verified` no login. Ainda
  não existe tela nos apps que chame isto (gap conhecido, `docs/veredito-iris-s1-passada-8.md`).
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
`docs/contratos/conferencia-f08-nova.md` (1ª rodada, veredito AJUSTES — os achados A1–A4, B1–B7 e C1–C4
abaixo já estão corrigidos no código) e **reconferida** na mesma seção do documento (2ª rodada, veredito
AJUSTES pequenos — os achados R1–R8 abaixo também já estão corrigidos: R1 o motorista atribuído recebe o
cancelamento feito pelo passageiro, R2 o resumo do motorista nunca "vaza" para o motorista seguinte, R3 a
ordem das checagens em `start`, R4 quem aceita não recebe a revogação da própria oferta, R5 embarque sem
bairro cai em texto neutro, R6 idempotência do cancelamento por `tripId`, R7 ficar offline sempre funciona,
R8 texto de ressincronização e de `reason` desconhecido).

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

Categoria **desligada** (Entrega — §13.3; Motorista mulher — D-08 em aberto; **Pet — D-09, nasce desligada
igual à Entrega**) **não aparece na lista**: isso é diferente de "sem motorista agora". `kind: 'delivery'`
(padrão `'ride'`) sempre devolve lista vazia hoje. `409 conflict` (`reason: 'outside_service_area'`) se o
endereço estiver fora da área (mock: opção `isOutsideServiceArea`, S3 ainda não decidiu a geometria real).
No mock, um teste que precise de Pet liga por `control.setCategoryEnabled('pet', true)`.

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
- `PassengerTripSnapshot.driver?: { driverId, firstName, plate, vehicleModel?, vehicleColor?, rating? }` — só
  enquanto a corrida TEM motorista atribuído; some depois de uma volta para a busca (achado A2 — nunca mostra o
  motorista antigo). **R2 (reconferência):** o mock resolve o resumo pelo `assignedDriverId` ATUAL da store (não por
  um valor guardado à parte do `tripId`) — é assim que o resumo de um motorista que já saiu nunca "é herdado" pelo
  motorista seguinte, mesmo que ninguém tenha lido o snapshot no meio da troca. **PP-12 (acréscimo, decisão do dono em
  22/11/2026):** `vehicleModel` e `vehicleColor` — sem eles o passageiro não reconhece o carro na rua, e isso é
  segurança, não estética (`plano-sistema-arquitetura.md:615`); `rating` é a nota média do motorista (1 a 5), ausente
  num motorista sem avaliação ainda. Os três são **opcionais no tipo** (o servidor real sempre os envia) só para não
  quebrar quem já constrói `TripDriverSummary` sem eles hoje (`apps/passenger/src/sim/rideSimulator.ts`) — a tela
  trata ausência como "dado indisponível", nunca como "motorista sem carro".
- `PassengerTripSnapshot.pickupCode?: string` — **código de embarque (plano D-12; decisão do dono em
  22/11/2026: PIN em todas as categorias)**. O passageiro diz o código ao motorista, e a corrida só começa com
  ele (`DriverTripPort.start`, abaixo). Formato: **exatamente 4 algarismos, como texto** (`"0482"`: zero à
  esquerda vale, por isso não é número; regra em `isPickupCodeFormat`, `@vuumbora/domain`). Aparece **só em
  `driver_assigned`, `driver_en_route` e `driver_arrived`** (`isPickupCodeVisible`, `@vuumbora/domain`); antes
  disso e a partir de `in_progress` a chave nem existe no objeto. **Um por corrida**, gerado no pedido e estável
  até o fim, mesmo se um motorista devolver a corrida e outro assumir (o código só é dito em `driver_arrived`,
  e dali a corrida não volta para a busca). **Nunca** aparece no histórico (`PassengerTripHistoryEntry` não tem
  o campo, minimização PP-14), nos eventos de tempo real (o evento avisa a fase; o código vem por `status()`,
  como `driver`) nem em nada do motorista.
- `DriverTripSnapshot`: `pickup`/`destination` **completos** (`Place`, endereço e ponto exatos — só porque
  o motorista já foi atribuído), `categoryId`, `estimatedPayout`, `passenger?: { firstName }`. **Sem código
  de embarque, em fase nenhuma (D-12):** o motorista PEDE o código ao passageiro; se o recebesse aqui,
  poderia começar a corrida sem o passageiro.

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
cancela a corrida enquanto a oferta ainda está pendente. **R4 (reconferência):** quem ACEITA a própria
oferta nunca recebe `offer.revoked` dela — a passagem automática `driver_assigned → driver_en_route` (C1) é
lida pelo vigia da oferta como "ela se resolveu", não como "a corrida saiu de `driver_assigned`"; o mock
desliga o vigia antes das duas transições do aceite, não depois.

**O embarque E o destino na oferta são só o bairro — decisão do dono em 22/11/2026**
(`docs/decisoes-do-dono.md`, "Complemento: o embarque na oferta é só o bairro" e "Complemento: o destino na
oferta também é só o bairro"): `RideOffer.pickup` **e** `RideOffer.destination` são `ApproximatePlace`
(`@vuumbora/domain`: `{ neighborhood, approximatePoint }`, SEMPRE arredondado a 2 casas, nunca o ponto
exato), mais `pickupDistanceM` (arredondado a 100 m) e `pickupEtaS` (arredondado a 1 min) — exatos
estreitariam demais o quadrado aproximado do embarque. **Nunca** o endereço nem o ponto exato de nenhum dos
dois — a oferta vai a vários motoristas, um de cada vez, inclusive aos que recusam. "Destino visível"
(§5.4) continua valendo: o motorista sabe PARA ONDE vai (o bairro), só não o endereço exato antes de
aceitar. O endereço e o ponto exatos dos dois só existem em `DriverTripSnapshot`, depois do aceite, para o
motorista atribuído.

**R5 (reconferência):** sem bairro cadastrado, `toApproximatePlace` cai num texto NEUTRO
(`"Bairro não informado"`), nunca em `place.label` nem `place.address` — cair no `label` vazava o endereço
exato quando ele era, por acaso, o próprio endereço (mock sem bairro, ou um geocodificador real que não
devolve bairro).

**Distância e duração da viagem na oferta, em FAIXA — acréscimo PP-12 (decisão do dono em 22/11/2026,
`docs/fichas-de-tela/README.md`):** `RideOffer.tripDistanceM`/`tripDurationS` (`@vuumbora/domain/driver`) são
`NumericRange` (`{ min, max }`, `@vuumbora/domain`) em passos de 1 km / 5 min, calculados por `toTripRange`
(`@vuumbora/domain/geo`) — nunca o valor exato, pelo mesmo motivo de `pickup`/`destination` só levarem o bairro: o
par exato estreitaria de volta o quadrado aproximado. No mock, `control.offer({ tripDistanceM?, tripDurationS? })`
aceita os valores EXATOS (padrão 5200 m / 900 s) e devolve a faixa já calculada em `RideOffer`.

### Visibilidade do motorista — achado A3, revisado por R1

`DriverTripPort` (status, eventos, `arrived`/`start`/`complete`/`cancel`) só responde para o motorista
**ATRIBUÍDO** à corrida. Quem recusou a oferta, ou perdeu para outro motorista, recebe `404 not_found` —
nunca `403` (não confirma que a corrida existe para quem não é dela) — em QUALQUER chamada, inclusive
`status`. `subscribe` para de entregar eventos quando a atribuição muda porque o PRÓPRIO motorista
desistiu (volta para `searching_driver`) ou foi reatribuída a outro.

**R1 (reconferência):** isso NÃO vale para o desfecho de uma corrida que ele continua atribuído. Se é o
passageiro, o admin ou o sistema quem cancela (não o motorista voltando à busca), ou a corrida é concluída,
o motorista atribuído continua vendo o resultado: recebe o evento terminal por `subscribe` e `status()`
devolve o snapshot terminal, nunca `404`. A 1ª rodada corrigiu demais aqui — "a assinatura deixa de
entregar eventos depois do cancelamento" não distinguia QUEM cancelou.

### Ações depois do aceite — `DriverTripPort` (achado C1)

`arrived` (`driver_en_route` → `driver_arrived`), `start({ pickupCode })` (`driver_arrived` →
`in_progress`, só com o código de embarque certo — ver abaixo), `complete({ deliveryCode? })` (`in_progress`
→ `completed`; `deliveryCode` só importa para `kind: 'delivery'`, hoje desligado). Todas recebem
`idempotencyKey` e devolvem `Result<DriverTripSnapshot>`; `409 conflict` (`invalid_transition` ou
`idempotency_key_reused`).

**`start` EXIGE o código de embarque (D-12, decisão do dono em 22/11/2026).** Entrada:
`DriverStartTripInput = { pickupCode: string }`, obrigatório — o mesmo valor que o passageiro vê em
`PassengerTripSnapshot.pickupCode` (4 algarismos, como texto). Ordem das checagens:

| # | Situação | Resposta | Conta tentativa? |
|---|---|---|---|
| 1 | `pickupCode` falta (`{}`, `null`, `""`) | `400 validation`, `fields.pickupCode: "Informe o código de embarque."` | não |
| 1 | `pickupCode` fora do formato (3 ou 5 algarismos, letra, espaço, número em vez de texto) | `400 validation`, `fields.pickupCode: "O código de embarque tem 4 números."` | não |
| 2 | motorista não é o atribuído (ou corrida não existe) | `404 not_found` | não |
| 3 | corrida não está em `driver_arrived` | `409 conflict`, `invalid_transition` | não |
| 4 | já houve 5 erros nesta corrida, por este motorista | `429 rate_limited` (até com o código certo) | — |
| 5 | código errado | `400 validation`, `fields.pickupCode: "Código de embarque incorreto."` | sim |

O passo 1 é validação do CORPO (como o servidor faz antes de tocar no banco): responde igual exista a
corrida ou não (não serve para descobrir corrida) e **não entra no cache de idempotência** — a requisição
nem começou, então a mesma chave com o corpo corrigido segue valendo. O app distingue "faltou/formato" de
"errado" pelo texto de `fields.pickupCode`; o `CodeInput` da M08 já não deixa enviar menos de 4 algarismos,
então na prática só o passo 5 chega à tela.

**R3 (reconferência) — a atribuição vem antes de tudo que toca as tentativas.** O `tripId` vai em TODA
`RideOffer`: sem essa ordem, qualquer motorista que recebeu a oferta (mesmo sem aceitar) confirmava que a
corrida existe e gastava as tentativas do motorista ATRIBUÍDO. As tentativas contam por corrida E
motorista, e só as do atribuído chegam a ser contadas.

**No mock:** o código mora na `TripStore` (é estado da corrida, fonte única). O `request` do passageiro gera
um por corrida; o `control.offer` do motorista só gera quando a corrida ainda não tem (mock só do motorista,
sem passageiro). Para o teste ou o simulador do app "fazer o papel do passageiro", há dois caminhos:
`createMock*RidePort({ nextPickupCode: () => '4821' })` (o gerador) ou `control.setPickupCode(tripId,
'4821')` do motorista (troca o código da corrida, zera as tentativas deste motorista; com a store
compartilhada, o passageiro passa a ver o novo código). Código fora do formato em qualquer dos dois lança
`TypeError` — é erro de configuração, falha alto. `control.advance(tripId, 'in_progress')` do passageiro
**não** confere código: `control` é o simulador, quem confere é o `start` do motorista. O gerador do mock
usa `crypto.getRandomValues` quando existe e `Math.random` quando não (Hermes) — o código de verdade nasce no
servidor (S4), com gerador criptográfico.

### Disponibilidade — `DriverJourneyPort.setAvailability` (achado C3, revisado por R7)

`setAvailability({ online, point? })` → `{ phase }`. `point` é obrigatório para ficar online (o despacho
filtra por posição < 30 s, §5.4): sem ele, `400 validation`. `409 conflict`: `driver_not_approved` (conta
não aprovada) ou `not_eligible` (documento vencido). **R7 (reconferência):** essas duas checagens valem só
para `online: true` — ficar OFFLINE sempre funciona, mesmo com documento vencido ou conta não aprovada
(senão o motorista trava online sem conseguir saída no meio do turno).

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
mesmo que a corrida já tenha avançado antes da assinatura. **R8 (reconferência, texto):** a porta faz o
MESMO ao RECONECTAR depois de uma queda e ao ver um BURACO (`seq` maior que o último + 1) — consulta o
estado atual e entrega um `status` com ele antes de voltar a repassar o canal; a tela nunca pede isso
sozinha. A porta só repassa eventos de estado com `seq` ESTRITAMENTE crescente e descarta ela mesma
qualquer duplicado. Sem `Result`: é um stream — "WS avisa, REST é a verdade"; corrida inexistente, ou não
mais visível a quem assina (A3), não entrega nada.

### Histórico — `PassengerRidePort.history` / `DriverTripHistoryPort.history` (acréscimo PP-12, item 3)

Porta de histórico do motorista (que **não existia** no contrato) e período (`from`/`to`) no histórico do
passageiro — decisão do dono em 22/11/2026 (`docs/fichas-de-tela/README.md`). As duas devolvem
`TripHistoryPage<T>` (`@vuumbora/api-client/trip`: `{ items, nextCursor? }`) por cursor — **nunca** a lista
inteira de uma vez: `limit` tem padrão 20 e teto 50 (o mock aplica o teto, não lança). `cursor` é o
`tripId` do último item da página anterior. `from`/`to` (ISO 8601 com offset, ambos opcionais) filtram por
data — `from` depois de `to`, ou qualquer um que não seja uma data válida, é `400 validation`.

- `PassengerRidePort.history({ cursor?, limit?, from?, to? })` → `PassengerTripHistoryEntry[]`: viagens
  TERMINAIS do passageiro (`completed`, `cancelled`, `failed`), com `origin`/`destination` COMPLETOS (é a
  viagem dele), `distanceM`/`durationS` exatos e `driver?` (mesmo `TripDriverSummary` enriquecido do
  snapshot, PP-12) quando a corrida teve motorista atribuído. Filtra por `requestedAt`. **P2 (conferência
  da Nova sobre a PP-12, `docs/contratos/conferencia-pp12-nova.md`): `fare?` só em `completed`** (é o valor
  final COBRADO, não a estimativa — `cancelled`/`failed` nunca cobraram nada). `cancellationFee?` existe
  para `cancelled` mas fica sempre ausente até a decisão 15 (M6) decidir o que cobrar.
- `DriverTripHistoryPort.history({ cursor?, limit?, from?, to? })` → `DriverTripHistoryEntry[]`: viagens
  TERMINAIS deste motorista (`completed`, `cancelled`) **que terminaram com ELE atribuído** (achado P1,
  mesma conferência — ver abaixo). **PP-14 (decisão do dono, com revisão do Órion pendente quando a rota
  existir): `pickup`/`destination` são `ApproximatePlace` — só bairro, nunca endereço nem ponto exato,
  mesmo tempo depois da corrida** (minimização LGPD: o endereço exato serviu durante a corrida; guardado
  por meses, é o endereço de casa de outra pessoa). `distanceM`/`durationS` exatos continuam — não revelam
  localização nenhuma depois do fato. `payout?` só em `completed` (achado P2: o que conta como ganho numa
  corrida cancelada é a decisão 15; o valor por corrida, a decisão 7/D-23). **P3: sem o nome do
  passageiro** — a ficha M12 pede bairro, horário, distância, categoria e valor; nome guardado por meses
  sem uso para o motorista é dado pessoal de outra pessoa. Filtra por `endedAt`. Exposta em
  `MockDriverRide.historyPort` (ao lado de `offerPort`/`tripPort`/`journeyPort`/`locationPort`).

No mock, uma corrida só entra no histórico quando chega a um estado TERMINAL de verdade — o motorista
voltando para a busca (`driver_en_route` → `searching_driver`, cancelamento DELE mesmo antes de
`driver_arrived`) não é terminal e não aparece; o passageiro cancelando com o motorista atribuído (R1) é
terminal e aparece nos dois históricos. **P1:** além de terminal, o motorista precisa ser o ATRIBUÍDO no
estado FINAL — um motorista que devolveu a corrida (A aceita, cancela, volta para a busca; B aceita e
conclui) nunca ganha a entrada de quem a concluiu depois dele, mesmo "escutando" o `tripId` por baixo até
lá (mesma regra de visibilidade do R1 da F08).

### Idempotência — achado A4, revisado por R6

`request`, `cancel` (dos dois lados), `accept`, `arrived`, `start` e `complete` recebem `idempotencyKey`. A
MESMA chave com o MESMO corpo devolve a MESMA resposta (nenhum efeito duplicado). A MESMA chave com um corpo
DIFERENTE — ex.: pedir Conforto com outra cotação usando a chave de um pedido de VuumBora já feito — é
`409 conflict` (`reason: 'idempotency_key_reused'`), nunca um sucesso silencioso com o resultado antigo.
**R6 (reconferência):** no cancelamento do passageiro, a impressão do corpo inclui o `tripId` (como já era
do lado do motorista) — sem isso, a MESMA chave usada no cancelamento de OUTRA corrida com o mesmo `input`
(ex.: `{}` sem `reason`) batia no cache e devolvia o resultado da corrida ERRADA, deixando a corrida certa
intocada em silêncio.

### `reason` tipado por operação — achado B6, texto pendente R8

`ApiErrorKind` (`packages/api-client/src/index.ts`) continua com `reason: string` — não foi tocado, porque
`identity` e `waitlist` já dependem dele com valores arbitrários do servidor. A segurança de tipo mora em
`trip/result.ts`: cada operação tem seu próprio construtor (`quoteConflict`, `requestConflict`,
`cancelConflict`, `acceptConflict`, `availabilityConflict`, `driverActionConflict`), cada um com uma união
FECHADA de `reason` — um valor fora da união não compila. É assim que os mocks garantem que só emitem os
`reason` documentados aqui. O adaptador `http` (quando existir) transforma qualquer `reason` que o servidor
mande FORA destas uniões em `kind: 'unknown'` — nunca repassa um valor não documentado para a tela como se
fosse um dos reconhecidos.

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
// R2: passe o driverId ao ir para 'driver_assigned' — é por ele que setDriverSummary resolve a quem
// atribuir o resumo depois (sem isso, a corrida fica sem motorista atribuído na store e nenhum
// resumo aparece, mesmo chamando setDriverSummary).
setTimeout(() => control.advance(tripId, 'driver_assigned', driverId), 2600);
setTimeout(() => control.setDriverSummary(tripId, { driverId, firstName, plate }), 2600);
setTimeout(() => control.advance(tripId, 'driver_en_route'), 2600 + 2600);
// D-12: daqui até driver_arrived, port.status(tripId) traz pickupCode (4 algarismos) — a tela P08 o mostra.
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
