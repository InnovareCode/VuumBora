# Conferência do contrato da F08 (Nova, 22/11/2026)

**Alvo:** commit `292c230`, que hoje é também `origin/fatia/f08` e a `main` local. Arquivos conferidos:
`packages/domain/src/trip-lifecycle.ts`, `packages/domain/src/passenger/rideStateMachine.ts`,
`packages/domain/src/driver/index.ts` e `packages/api-client/src/{trip,passenger,driver}/`, mais os READMEs dos dois pacotes.

**Régua:**
- **Rotas:** `docs/plano-sistema-arquitetura.md` §6.2 (passageiro), §6.3 (motorista) e §6.4 (tempo real). A A5 e a
  F08 falam em "§6.2–§6.4" e querem dizer estas seções, porque `docs/plano-sistema.md` não tem tabela de rotas nessas
  seções.
- **Regras:** `docs/plano-sistema.md` §6.1 a §6.4, e no anexo §5.2 a §5.7 (estados, categorias, despacho, tempo real,
  preço e pagamento).
- **Aceite:** a linha F08 de `docs/plano-mestre.md` e a A5 de `docs/plano-apps-execucao.md`.

**Método:** li o código e rodei uma sonda contra os mocks do commit. A sonda ficou fora do repositório e não alterou
nenhum arquivo. O que está marcado **[provado]** eu vi acontecer na sonda; o resto vem da leitura do código.

---

## Veredito: AJUSTES

Muita coisa está certa e deve ficar como está:
- A regra de cancelamento mora numa função só (`cancelTrip`), e os dois perfis usam a mesma.
- A tabela do passageiro é derivada da tabela do servidor, não é uma cópia que pode divergir.
- Os mocks são avançados por `control`, sem relógio escondido.
- As ações críticas recebem `idempotencyKey`.
- Os eventos têm `seq` por corrida.
- A oferta mostra o destino ao motorista.

O que precisa mudar:
- **4 defeitos provados** no domínio e no mock (bloco A).
- **7 pontos de forma** que quebram o contrato no S3, no S4 ou no S5 se ficarem como estão (bloco B).
- **4 rotas da própria fatia** que faltam (bloco C).

A lista exata está no fim do documento.

---

## (1) Cada rota prevista tem entrada, saída e erros tipados?

**Não.** O `kind` do erro é tipado. O `reason` do `409` é `string` livre (`ApiErrorKind` em
`packages/api-client/src/index.ts`) e só aparece em comentário e no README.

| Rota (anexo §6) | Porta | Entrada | Saída | Erros |
|---|---|---|---|---|
| `POST /v1/quotes` | `PassengerRidePort.quote` | `RideDraft`: todos os campos são opcionais e traz `categoryId`/`paymentMethodId`, que não fazem parte da cotação | um `quoteId` para todas as categorias; faltam `distanceM`, `durationS` e `pickupEtaS` | `400` só em tempo de execução; não existe "fora da área de serviço" |
| `POST /v1/trips` | `.request` | `categoryId` sobra (ver B1) | `{ tripId }`; falta `status` | `quote_expired`, `category_unavailable`, `not_found`, `validation`; faltam `active_trip_exists`, `payment_pending` e chave reutilizada |
| `GET /v1/trips/:id` | `.status` e `DriverTripPort.status` | — | `TripSnapshot` sem `seq`, com a mesma forma para os dois perfis | `not_found` |
| `POST /v1/trips/:id/cancel` | `.cancel` | falta `reason` | `void`; o plano pede `{ status, cancellationFee? }` | `invalid_transition` |
| `PUT /v1/driver/availability` | `DriverJourneyPort.setOnline` | `boolean`, sem posição | `{ phase }` | não documentados (`driver_not_approved`, `not_eligible`). **A porta não foi tocada pelo commit e não tem mock** |
| `POST /v1/driver/locations` e WS `location.update` | — | **ausente** | | |
| WS `offer.created` e `offer.revoked` | — | **ausente**: a tela do motorista não tem de onde receber a oferta; hoje só o teste a recebe, por `control.offer` | | |
| `POST /v1/driver/offers/:id/accept` | `DriverOfferPort.accept` | ok | `{ tripId }` | `offer_taken`, `offer_expired`, `not_found`: ok |
| `POST /v1/driver/offers/:id/decline` | `.decline` | falta `reason` (o §5.4 manda guardar toda recusa com motivo desde o primeiro dia) | ok | ok |
| `POST /v1/driver/trips/:id/arrived`, `/start`, `/complete` | — | **ausentes** | | |
| `POST /v1/driver/trips/:id/cancel` | `DriverTripPort.cancel` | falta `reason` | `void`; o plano pede `Trip` | `invalid_transition` |
| WS `trip.updated` e `trip.driver_location` | `TripRealtimePort.subscribe` | — | `status` e `location`; a posição vem sem `heading`, e o `seq` é compartilhado entre os dois (ver B5) | — |

Ficam fora do recorte da F08, cada um no seu marco (ver a resposta 3): avaliação, compartilhar, SOS, recibo, histórico,
favorito, meios de pagamento, lista de categorias, cadastro e documentos do motorista, verificação, ganhos e repasses.

## (2) O que falta ou sobra e vai quebrar o contrato no S4 ou no S5

Em ordem de custo, se ficar para depois:

1. **Cotação com um `quoteId` só (B1).** O modelo de dados (`fare_quotes` em `docs/plano-sistema-dados.md`) e o anexo
   §6.2 têm uma cotação por categoria, cada uma com a sua versão de tarifa. Se a interface for construída sobre
   `quote.quoteId + categoryId`, vai ser refeita no S3 (M4).
2. **Uma projeção para os dois perfis (B4).** O S4 acrescenta campos que só um lado pode ver. O exemplo mais claro é o
   código de embarque (D-12): se ele entrar no tipo comum, o motorista recebe o código que deveria pedir ao passageiro.
   Separar os tipos depois quebra as duas telas.
3. **`seq` compartilhado entre estado e posição, e ausente no REST (B5).** No S4, o `seq` de estado vem de `trip_events`
   (Postgres), e a posição passa pelo Redis, limitada a uma a cada 2 s e descartável. Um contador único obriga a numerar
   cada posição junto com o estado ou cria buracos falsos, que viram ressincronização sem fim. Sem `seq` no snapshot, o
   app não tem o ponto de partida depois de ressincronizar.
4. **Cancelamento que devolve `void` e não recebe motivo (B3).** A taxa da decisão 15 (M6) e a diferença entre
   "passageiro não apareceu" e "motorista desistiu" em `driver_arrived` dependem dos dois.
5. **Pedido que promete `searching_driver` na hora (B2).** Com Pix antes da corrida (§5.7, S5), a corrida fica em
   `requested` até o pagamento ser confirmado. A interface precisa tratar essa fase desde já.
6. **Quem ressincroniza não está escrito (B5).** Se não for decidido agora, a ressincronização vai ser feita tela por
   tela sobre um mock que nunca cai, e o critério do S4 ("derrubar a rede 30 s e voltar sem ação") vira retrabalho.
7. **Token de acesso (B7).** O README da identidade dá o exemplo `porta.chamada(accessToken)`. Seguindo esse exemplo no
   S4, a assinatura de todos os métodos de corrida muda.

**O que sobra:** só o `categoryId` no `RequestRideInput`, que deixa de ser necessário com o B1.

## (3) O recorte está certo?

**Motorista favorito (§6.3): sim, fica fora.** O lugar dele é o M5 (S4), onde é entregável com critério próprio:
janela exclusiva, fallback que custa no máximo uma janela e teste de contrato provando que o passageiro nunca recebe a
disponibilidade do favorito. O contrato do favorito é todo aditivo:
- uma porta nova (`GET`/`PUT`/`DELETE /v1/favorite-driver`);
- `preferFavorite?` no pedido;
- `isFavorite?` na oferta;
- `acceptsFavorite` nas preferências;
- `favorite?` na avaliação.

Se esses campos entrarem como opcionais, nada desta fatia quebra.

Uma restrição já vale hoje. Nenhum tipo do lado do passageiro (snapshot ou evento) pode carregar o estado do favorito
durante a busca, e isso inclui o tempo de resposta. Se o aviso "seu favorito não pôde atender" aparece na hora quando ele
está offline e 15 s depois quando ele recusa, essa diferença revela a disponibilidade que o §6.3 proíbe mostrar.
Proposta para o S4: o aviso sai no mesmo instante em todos os casos, ou não sai.

**Ledger (segunda metade do §6.4): sim, fica fora.** É M6 (S5), travado pela D-03 (gateway), pelas decisões 6, 7 e 15
e pela validação do contador. O que não pode ficar fora são os pontos do contrato da corrida que o pagamento vai usar:
- `status` na resposta do pedido (B2);
- taxa na resposta do cancelamento (B3);
- `payment_pending` entre os erros (B6).

A interface da corrida vai consumir essas formas já em mock. A primeira metade do §6.4 (cotação assinada, com validade,
`409 quote_expired`) está dentro da fatia e está certa, tirando o B1.

## (4) "Motorista que cancela em `driver_assigned` ou `driver_en_route` volta para `searching_driver`" bate com o plano?

**Bate.** As fontes:
- anexo §5.2, linha "`driver_assigned`, `driver_en_route` → `searching_driver`, motorista cancela";
- `docs/plano-sistema.md` §6.1;
- decisão 15 no plano-mestre ("volta a corrida para a busca, sem culpa do passageiro").

O motorista que cancela em `driver_arrived` mata a corrida, e isso também bate: `driver_arrived` está na linha de
`cancelled` para todos os atores. É por isso que o motivo (B3) importa: nesse estado, "passageiro não apareceu" e
"motorista desistiu" vão levar a taxas diferentes no M6.

**Duas ressalvas:**
- Está certa a parte "para onde a corrida vai". A parte "quem pode cancelar" está errada: o motorista pode cancelar uma
  corrida que não é dele (A1).
- O efeito visível da volta para a busca está errado no mock (A2 e A3).

**Para o S4** (regra do servidor, não muda o contrato):
- não reofertar a corrida ao motorista que a devolveu;
- a volta reabre a janela de busca;
- teto de voltas por corrida (proposta: 3, depois `failed`). Sem teto, um motorista consegue prender uma corrida
  aceitando e cancelando sem parar.

---

## Lista de ajustes

### A. Defeitos provados (corrigir antes de integrar na `main`)

**A1. `packages/domain/src/trip-lifecycle.ts`: `cancelTrip` e `isTripCancellable` passam a decidir também por ator.**
- **Hoje:** `cancelTrip('searching_driver', 'driver')` e `cancelTrip('requested', 'driver')` dão `cancelled`
  **[provado]**. No mock, o motorista que já devolveu a corrida cancela de novo com outra chave e mata o pedido do
  passageiro **[provado]**. Dois testes tratam isso como comportamento certo:
  - `packages/domain/test/trip-lifecycle.test.ts:95` ("qualquer ator em requested ou searching_driver mata");
  - `packages/api-client/test/driver-ride-mock.test.ts:141`.
- **Muda:** a regra de cancelamento vira uma tabela de resultado por ator:

  | Ator | Estados de origem | Destino |
  |---|---|---|
  | passageiro, admin, sistema | `requested`, `searching_driver`, `driver_assigned`, `driver_en_route`, `driver_arrived` | `cancelled` |
  | motorista | `driver_assigned`, `driver_en_route` | `searching_driver` |
  | motorista | `driver_arrived` | `cancelled` |
  | motorista | `requested`, `searching_driver` | **recusa** |

  `isTripCancellable(status, actor)` passa a exigir o ator, e `isRideCancellable` chama com `'passenger'`. Há um segundo
  motivo para isso: se o S4 ou o S6 abrir uma saída de `in_progress` só para admin (corrida travada), a guarda sem ator
  passaria a mostrar o botão de cancelar ao passageiro no meio da viagem.
- **Teste:** motorista é recusado em `requested` e `searching_driver`, e os dois testes citados são invertidos.

**A2. `packages/api-client/src/trip/mock-store.ts` (`setStatus`) e `packages/api-client/src/driver/mock-adapter.ts`
(`accept`).**
- **Hoje:** `setStatus` só sobrescreve `driver` quando recebe um e nunca o limpa. Depois da volta para a busca, o
  passageiro continua vendo o nome e a placa do motorista que saiu. Quando outro motorista aceita, o evento
  `driver_assigned` sai com o motorista **antigo** **[provado]**.
- **Muda:**
  - a transição para `searching_driver` (ou `requested`) remove `driver` do registro e do evento;
  - o mock do motorista recebe uma identidade ao ser criado (`driver: TripDriverSummary`, com valor padrão), e o
    `accept` grava esse resumo;
  - o JSDoc de `TripSnapshot` passa a dizer: "`driver` ausente em `requested`/`searching_driver`".
- **Teste:** com a store compartilhada, A aceita, A cancela e B aceita. O passageiro nunca vê A depois do cancelamento.

**A3. `packages/api-client/src/driver/types.ts` (contrato) e `driver/mock-adapter.ts`: a corrida só é visível ao
motorista atribuído.**
- **Hoje:** o motorista que cancelou continua assinado e recebe o nome, a placa e a posição do motorista seguinte, e
  `status` de uma corrida que já não é dele responde `200` com os dados do novo **[provado]**. Como `RideOffer` traz o
  `tripId` antes do aceite, qualquer motorista que recebeu a oferta consegue consultar a corrida.
- **Muda:** o contrato passa a dizer que `status`, `subscribe`, `cancel` e as ações do C1 só valem para corrida
  atribuída a este motorista. Fora disso, a resposta é `404 not_found` (não `403`, para não confirmar que a corrida
  existe), e a assinatura deixa de entregar eventos depois do cancelamento. O mock guarda as corridas aceitas pela
  própria instância.
- **Teste:** depois que A cancela, `status` dá `404` e A não recebe mais nenhum evento.

**A4. `packages/api-client/src/trip/idempotency.ts` e os dois mocks: chave repetida com corpo diferente.**
- **Hoje:** a mesma chave com corpo diferente devolve a resposta antiga em silêncio. Na sonda, um pedido de Conforto com
  outra cotação recebeu o `tripId` da corrida anterior **[provado]**. As regras transversais do anexo §6 dizem que
  mesma chave com corpo diferente é `409`.
- **Muda:** o cache guarda a impressão do corpo junto com o resultado. Se o corpo divergir, a resposta é `409 conflict`
  com `reason: 'idempotency_key_reused'`. No servidor, a chave vale por operação e por conta.
- **Teste:** cobre `request`, `cancel` e `accept`.

### B. Forma do contrato (quebra no S3, S4 ou S5 se ficar)

**B1. `packages/api-client/src/passenger/types.ts`: cotação.**
- A entrada passa a ser `quote(input: QuoteInput)`, com
  `QuoteInput { origin: Place; destination: Place; kind?: 'ride' | 'delivery' }`. `origin` e `destination` são
  obrigatórios no tipo; `kind` tem padrão `ride`, já que Entrega está desligada. `RideDraft` sai da assinatura.
- `quoteId` e `expiresAt` passam para cada `CategoryQuote`, como no anexo §6.2 e em `fare_quotes`.
  `RequestRideInput` fica `{ quoteId, paymentMethodId }`: a categoria vem da cotação. Na mesma passada, cada item ganha
  `distanceM`, `durationS` e `pickupEtaS`, que a tela de cotação mostra.
- **Separar "categoria desligada" de "sem motorista agora":**
  - Categoria desligada (Entrega, e Motorista mulher até a D-08) não volta na cotação. O
    `409 category_unavailable` fica só para o caso de a categoria ter sido desligada entre a cotação e o pedido.
  - `availability: 'none'` quer dizer "nenhum motorista estimado agora". O pedido é aceito e, se nenhum motorista
    elegível aparecer no tempo máximo, a corrida termina em `failed`.
  - Trocar de categoria é um pedido novo, com cotação nova. Esse é o consentimento do §5.3, e não existe rota de "mudar
    categoria".
  - O mock acerta a fixture de Entrega.

**B2. `passenger/types.ts`: pedido.**
- `request` devolve `{ tripId, status }`.
- O README para de prometer "já em `searching_driver`": com Pix antes da corrida, ela fica em `requested` até o
  pagamento ser confirmado, e a interface precisa ter essa fase.
- `payment?` (QR do Pix) entra no S5 como campo opcional, o que não quebra nada.

**B3. `passenger/types.ts` e `driver/types.ts`: cancelamento.**
- Passageiro: `cancel(tripId, input: { reason?: CancelReason }, idempotencyKey)` devolve
  `Result<{ status: TripStatus; cancellationFee?: Money }>`.
- Motorista: `cancel(tripId, input: { reason?: DriverCancelReason }, idempotencyKey)` devolve `Result<{ status }>`.
- `CancelReason` e `DriverCancelReason` começam como uniões pequenas com `'other'`. Os valores finais saem no M6
  (decisão 15).

**B4. `trip/types.ts`, `passenger/types.ts` e `driver/types.ts`: projeção por perfil.**
- `trip/types.ts` fica só com a base: `tripId`, `status` e `seq`.
- `PassengerTripSnapshot` (com `driver?`) vai para `passenger/types.ts`.
- `DriverTripSnapshot` (com `pickup`, `destination`, `categoryId`, `estimatedPayout` e, quando houver,
  `passenger: { firstName }`) vai para `driver/types.ts`.
- Cada porta devolve o próprio tipo, e os eventos seguem a mesma separação. A `TripStore` do mock pode continuar única.

**B5. `trip/types.ts`, `trip/mock-store.ts` e README: `seq` e ressincronização.**
- **Hoje:** na sonda, a sequência saiu `status 2 → location 3 → location 4 → status 5`, e o snapshot veio sem `seq`
  **[provado]**.
- **Muda:**
  - `seq` conta só mudança de estado e vem no snapshot.
  - O evento de posição carrega o `seq` do estado em vigor (sem incrementar), mais `at` (instante da leitura do GPS) e
    `heading?`.
  - Regra do cliente: estado com `seq` menor ou igual ao último é descartado; `seq` maior que o último + 1 é buraco, e o
    app chama o REST; posição com `at` mais antigo que a última é descartada.
- **Decidir e escrever quem ressincroniza.** Recomendo que seja a porta: ao assinar, ao reconectar e ao ver um buraco,
  ela consulta o REST e entrega um evento de estado com o `seq` do snapshot. Assim o critério do S4 vira propriedade do
  adaptador, testada uma vez, e não de cada tela. O mock passa a entregar o estado atual no momento da assinatura.
- **Divergência com o plano:** isto refina a letra do §5.5 e do §6.4 ("toda mensagem tem `seq`"). Toda mensagem
  continua tendo `seq`, mas a posição não o incrementa.

**B6. `packages/api-client/src/index.ts` (ou `trip/result.ts`) e as portas: `reason` tipado por operação.**
- Cada operação exporta uma união com os seus `reason`. Os mocks só aceitam valores da união, então um erro de
  digitação quebra a compilação. O adaptador `http` transforma `reason` desconhecido em `unknown`. O mecanismo fica a
  critério da Vega (por exemplo, `Result<T, E = ApiError>`, que não quebra a identidade).
- Valores por operação:

  | Operação | `reason` |
  |---|---|
  | cotação | `outside_service_area` (nova: endereço fora da área de Natal; liga com F10/S3) |
  | pedido | `quote_expired`, `category_unavailable`, `active_trip_exists`, `payment_pending`, `idempotency_key_reused` |
  | cancelar | `invalid_transition`, `idempotency_key_reused` |
  | aceitar | `offer_taken`, `offer_expired`, `idempotency_key_reused` |
  | disponibilidade | `driver_not_approved`, `not_eligible` |
  | ações do motorista | `invalid_transition`, `idempotency_key_reused` |

**B7. `packages/api-client/README.md`: token.**
- Escrever que as portas de corrida não recebem `accessToken`. O adaptador `http` é construído com a sessão da
  identidade e chama `session.run(...)` por dentro. O WebSocket usa `getValidAccessToken()` no primeiro quadro.

### C. Rotas da fatia que faltam (aceite: "toda rota com entrada, saída e erros tipados")

**C1. `driver/types.ts`: ações do motorista na corrida.**
- Métodos novos, todos devolvendo `Result<DriverTripSnapshot>`:
  - `DriverTripPort.arrived(tripId, idempotencyKey)`;
  - `start(tripId, { pickupCode? }, idempotencyKey)`;
  - `complete(tripId, { deliveryCode? }, idempotencyKey)`.
- Erros: `409 invalid_transition`, `400 validation` (`pickupCode`) e `429` depois de várias tentativas erradas.
- O mock usa a mesma validação do domínio.
- Escrever que a passagem `driver_assigned → driver_en_route` é do sistema: o app do motorista não chama nada para ela.

**C2. `driver/types.ts`: ofertas em tempo real.**
- `DriverOfferPort.subscribeOffers(onEvent)` devolve a função de cancelar a assinatura. Eventos:
  - `offer.created`, com a `RideOffer`;
  - `offer.revoked`, com `{ offerId, reason: 'expired' | 'taken' | 'cancelled' }`.
- `decline(offer, input?: { reason?: DeclineReason })`.
- No mock, `control.offer`, `takeOffer`, `expireOffer` e o cancelamento do passageiro emitem esses eventos.

**C3. `driver/types.ts`: disponibilidade.**
- `setAvailability({ online: boolean; point?: GeoPoint })` devolve `{ phase }`. O ponto é obrigatório ao ficar online,
  porque o despacho filtra motoristas com posição de menos de 30 s.
- Erros: `409 driver_not_approved` e `409 not_eligible` (documento vencido).
- O mock tem `control` para três casos: aprovado, não aprovado e documento vencido.

**C4. `driver/types.ts`: envio de posição.**
- `sendLocations(fixes: readonly LocationFix[])`, com
  `LocationFix { point, heading?, speedMps?, at, mocked }`.
- `mocked` é o sinal de GPS falso do §5.10, gravado desde o primeiro dia.
- O mock só guarda as posições.

### D. Dívida registrada (aditiva: não quebra, entra quando a tela precisar)

- `GET /v1/categories`: nome e descrição vindos do servidor, não do mockup. Entra antes da tela de escolha de categoria.
- Snapshot do passageiro: veículo (modelo e cor), `etaS`, estimativa, `pickupCode` (D-12), motivo de `failed` e causa da
  volta à busca ("seu motorista cancelou, buscando outro").
- Avaliação, recibo, histórico, compartilhar e SOS: fatia própria, antes das telas P10, P11 e P14.
- Favorito: S4 (resposta 3). Pagamento, ledger, ganhos e repasses: S5.
- Coerência de tipos: `Quote.expiresAt` e `TripEvent.sentAt` como `IsoDateTime`; `driverId` como `DriverId`.

---

## Correções no plano (minhas)

- **Linha F08 de `docs/plano-mestre.md`.** O aceite "telas atuais da corrida continuam iguais sobre a porta" e a parte
  "o simulador do passageiro vira o adaptador `mock`" estão fora da zona que eu mesma dei à fatia
  (`packages/api-client/**` e `packages/domain/**`). O commit não toca em `apps/passenger`, e está certo em não tocar.
  Esses dois itens passam a ser o primeiro item da fatia "UI da corrida em mock", da Lyra. A F08 fecha com o contrato.
- **Anexo §5.5 e §6.4:** escrever a semântica de `seq` do B5.
- **Anexo §5.2: lacuna.** `in_progress` só sai para `completed`. Se o celular do motorista morre no meio da viagem, a
  corrida fica travada, e o passageiro passa a receber `active_trip_exists` para sempre. Proposta para o S4/S6:
  `in_progress → cancelled` só por admin ou sistema (ou `completed` por admin, com tarifa manual). A guarda por ator do A1
  já prepara isso.
- **Lista de `reason` do anexo §6 e de `docs/plano-sistema.md` §5:** incluir `category_unavailable`,
  `outside_service_area` e `idempotency_key_reused`.

## Pendência para o dono e a Órion

**Endereço de embarque na oferta.** `RideOffer.pickup` é um `Place` completo, com endereço e ponto exato. Todo motorista
que recebe a oferta vê o endereço exato do passageiro, inclusive os que recusam. O destino visível foi decisão do dono
em 18/11, mas o nível de detalhe nunca foi decidido.

Recomendação: na oferta, mostrar bairro e ponto aproximado; o endereço completo só depois do aceite. Precisa ser decidido
antes da tela M06 (oferta), porque trocar a forma de `RideOffer` depois quebra essa tela.

## Ordem sugerida

1. A1–A4 e B1–B7 num commit; C1–C4 em outro, na mesma branch `fatia/f08`.
2. A Íris confere os testes novos e refaz os cinco cenários da sonda antes da integração:
   - passageiro depois da volta à busca;
   - motorista antigo assinado e consultando a corrida;
   - motorista que saiu cancelando de novo;
   - chave repetida com corpo diferente;
   - sequência de `seq` com posição no meio e `seq` no snapshot.
