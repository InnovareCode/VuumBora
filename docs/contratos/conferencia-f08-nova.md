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
  - `start(tripId, { pickupCode? }, idempotencyKey)`; *(superado em 27/11/2026: com a D-12 decidida, o código é
    obrigatório. Ver "Atualização do contrato: código de embarque, D-12", no fim deste documento.)*
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
  volta à busca ("seu motorista cancelou, buscando outro"). *(`pickupCode` entrou em 27/11/2026, ver o fim deste
  documento.)*
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

---

## Reconferência (Nova, 22/11/2026): commit `c5f8fa0`, branch `fatia/f08-v2`

**Alvo:** `c5f8fa0`, que substitui o `292c230`. Conferi contra a minha própria lista (A1–A4, B1–B7, C1–C4) e contra
a decisão do dono de 22/11 em `docs/decisoes-do-dono.md`, seção "Complemento: o embarque na oferta é só o bairro".

**Método:**
- Extraí `packages/domain` e `packages/api-client` do commit, com `git archive`, para uma pasta temporária fora do
  repositório. A árvore de trabalho não foi tocada.
- Rodei os testes dessa cópia:
  - `packages/domain`: `tests 26 · pass 26 · fail 0`.
  - `packages/api-client`: `tests 279 · suites 43 · pass 279 · fail 0`.
  - Na primeira tentativa, 3 falhas eram do meu ambiente, não do commit: o domínio estava copiado dentro de
    `node_modules`, onde o Node não remove tipos de arquivo `.ts`, e faltava o arquivo de contrato da identidade. Com
    uma junção no lugar da cópia e o arquivo extraído, a suíte passou inteira.
- Rodei de novo a sonda, com os 5 cenários originais e 7 novos, contra os mocks deste commit.

### Veredito: AJUSTES (pequenos, um commit)

A maior parte da lista foi atendida, e bem. Os 5 cenários originais da sonda passam e viraram testes permanentes.
Sobram 3 regressões, que são efeitos colaterais das próprias correções, 4 defeitos novos nas peças acrescentadas e 1
ponto de texto. Nenhum é grande. O mais importante é o **R1**: o motorista atribuído não fica sabendo quando o
passageiro cancela.

### Item por item

| Item | Situação | Observação |
|---|---|---|
| A1 quem pode cancelar | **Atendido** | `CANCELLABLE_FROM` por ator; motorista recusado em `requested` e `searching_driver`; `isTripCancellable(status, actor)` |
| A2 volta à busca limpa o motorista | **Parcial: R2** | Limpa se alguém consulta `status()` durante a busca; se ninguém consulta, o passageiro vê o motorista antigo quando outro aceita |
| A3 só o atribuído vê a corrida | **Atendido, mas foi longe demais: R1** | Também esconde do motorista atribuído o cancelamento feito pelo passageiro |
| A4 chave repetida com corpo diferente | **Parcial: R6** | No cancelamento do passageiro, a impressão do corpo não inclui `tripId` |
| B1 cotação por categoria | **Atendido** | `quoteId` e `expiresAt` por categoria; `QuoteInput` obrigatório; categoria desligada fora da lista; `none` aceita o pedido |
| B2 pedido nasce em `requested` | **Atendido** | |
| B3 cancelamento com motivo e taxa | **Atendido** | |
| B4 projeção por perfil | **Atendido** | `PassengerTripSnapshot` × `DriverTripSnapshot`. Os eventos ficaram só com a base, sem dado de perfil; aceito, porque acrescentar campos ao evento do passageiro depois não quebra quem já consome |
| B5 `seq` e ressincronização | **Atendido, falta texto: R8** | `seq` só de estado, presente no snapshot, posição sem incrementar. A porta entrega o estado ao assinar, mas o contrato não diz que ela faz o mesmo ao **reconectar** e ao **ver buraco** |
| B6 `reason` tipado | **Atendido, falta texto: R8** | União fechada por operação nos construtores dos mocks. Falta escrever que o adaptador `http` transforma `reason` desconhecido em `unknown` |
| B7 portas sem token | **Atendido** | README, seção "Token" |
| C1 `arrived`/`start`/`complete` | **Atendido, com R3** | `start` confere o código antes de conferir quem chama e em que fase |
| C2 ofertas em tempo real | **Atendido, com R4** | Quem aceita recebe `offer.revoked: cancelled` da própria oferta |
| C3 disponibilidade | **Atendido, com R7** | Ficar offline falha com documento vencido ou conta não aprovada |
| C4 envio de posição | **Atendido** | |

### Decisão do dono: o embarque na oferta é só o bairro

O contrato respeita a decisão, com uma brecha (R5):
- `RideOffer.pickup` é `ApproximatePlace` (bairro e ponto arredondado a 2 casas, cerca de 1,1 km). O `offer.created`
  não leva endereço nem ponto exato (sonda, cenário 8).
- O endereço e o ponto exatos só existem no `DriverTripSnapshot`, e só para o motorista atribuído (cenário 8b). Quem
  recusou ou perdeu a oferta recebe `404` (testes da suíte A3).
- **Brecha (R5):** `toApproximatePlace` usa o `label` do lugar quando falta o bairro. Um `Place` sem bairro, cujo
  `label` é o endereço, leva o endereço exato na oferta (cenário 11). É exatamente o que a decisão proíbe.

Observações que não bloqueiam:
- **Distância e tempo até o embarque:** `pickupDistanceM` e `pickupEtaS` vão exatos. O motorista conhece a própria
  posição; com a distância exata, ele estreita bastante onde o passageiro está dentro do quadrado de 1,1 km.
  Recomendo que o servidor arredonde (100 m e 1 min), com a regra escrita no JSDoc de `RideOffer`.
- **Texto da decisão:** a frase "a oferta vai a vários motoristas ao mesmo tempo" contradiz o despacho sequencial do
  §5.4. O certo é "a vários motoristas, um de cada vez". Correção de redação em `docs/decisoes-do-dono.md`.
- **Pergunta ao dono:** o destino continua completo na oferta, com endereço e ponto exatos. O motivo da decisão ("vai
  a vários motoristas, inclusive aos que recusam") vale também para o destino, que na volta para casa é o endereço do
  passageiro. Para escolher a corrida, "destino visível" se resolve com bairro e ponto aproximado. Precisa ser decidido
  antes da tela M06, pelo mesmo motivo do embarque: trocar `destination: Place` por `ApproximatePlace` depois quebra
  essa tela.

### Sonda (rodada contra os mocks de `c5f8fa0`)

| # | Cenário | Resultado |
|---|---|---|
| 1 | Passageiro durante a busca, depois que o motorista desistiu | ok: sem motorista |
| 1b | O mesmo, sem consultar `status()` na busca; B aceita | **falha**: `driver_en_route` com o motorista **A** (R2) |
| 2 | Motorista que saiu, ainda assinado | ok: nenhum evento depois do cancelamento; `status` 404 |
| 3 | Motorista que saiu cancela de novo com chave nova | ok: 404, a corrida segue com B; o domínio recusa motorista em `searching_driver` e `requested` |
| 4 | Pedido com a mesma chave e outra cotação | ok: `409 idempotency_key_reused` |
| 4b | Cancelamento do passageiro com a mesma chave em **outra** corrida | **falha**: devolve `{ status: 'cancelled' }`, e a segunda corrida continua em `requested` (R6) |
| 5 | Sequência de `seq` | ok: `status:1 status:2 location:2 location:2 status:3`; o snapshot traz `seq: 3` |
| 6 | Passageiro cancela com o motorista a caminho | **falha**: o motorista atribuído não recebe `cancelled`, e o `status()` dele dá 404 (R1) |
| 7 | Motorista aceita a oferta, assinado nas ofertas | **falha**: recebe `offer.created` e logo depois `offer.revoked: cancelled` da oferta que acabou de aceitar (R4) |
| 8 / 8b | Conteúdo da oferta e do snapshot do atribuído | ok: a oferta leva só bairro e ponto arredondado; o snapshot leva o endereço completo |
| 9 / 9c / 9d | `start` com código errado antes de chegar, e por motorista não atribuído | **falha**: dá `400` em vez de `409`/`404`; as tentativas de quem não é atribuído contam, e o código certo acaba em `429` (R3) |
| 10 | Ficar offline com documento vencido ou conta não aprovada | **falha**: `409` (R7) |
| 11 | `toApproximatePlace` sem bairro | **falha**: `neighborhood: "Rua das Flores, 123"` (R5) |

O cenário 1 da suíte permanente chama `status()` durante a busca, e foi por isso que não pegou o 1b.

### O que ainda falta

**R1 (alto). O motorista atribuído não fica sabendo que o passageiro cancelou.**
- **Arquivos:** `packages/api-client/src/trip/mock-store.ts` (`setStatus` apaga `assignedDriverId` ao ir para
  `cancelled`), `packages/api-client/src/driver/mock-adapter.ts` (filtro do `subscribe` e `assignedTripInfo`) e a
  seção "Visibilidade do motorista" do README.
- **Muda:** o motorista perde a atribuição **só** quando a corrida volta para `searching_driver` ou `requested` (ele
  desistiu, ou o sistema reatribuiu). Em `cancelled` e `completed`, o motorista que estava atribuído continua vendo a
  corrida: recebe o evento terminal, e `status()` devolve o snapshot terminal.
- **Teste:** passageiro, admin e sistema cancelam em `driver_en_route`; o motorista recebe `status: cancelled` e
  `status()` devolve `cancelled`.
- **A causa é em parte minha:** no A3 eu escrevi "a assinatura deixa de entregar eventos depois do cancelamento", sem
  separar o cancelamento do próprio motorista do cancelamento do passageiro. A Vega seguiu a letra.

**R2 (médio). O passageiro vê o motorista antigo.**
- **Arquivo:** `packages/api-client/src/passenger/mock-adapter.ts`. O resumo do motorista é guardado por corrida e só
  é limpo quando alguém lê o snapshot.
- **Muda:** o resumo mostrado precisa ser sempre o do motorista atribuído naquele momento (por exemplo, guardar por
  `driverId` e resolver pelo `assignedDriverId` da store). `setDriverSummary` de um motorista que não é o atribuído é
  ignorado. O mecanismo fica com a Vega.
- **Teste:** cenário 1b.

**R3 (médio). `start` confere o código antes de conferir quem chama.**
- **Arquivos:** `packages/api-client/src/driver/mock-adapter.ts` (`start`) e o JSDoc de `DriverTripPort.start`.
- **Muda:** a ordem passa a ser:
  1. `404` se o motorista não é o atribuído;
  2. `409 invalid_transition` se a corrida não está em `driver_arrived`;
  3. `400` se o código está errado;
  4. `429` depois de várias tentativas.

  As tentativas contam por corrida **e** motorista, e só as do atribuído.
- **Por quê:** o `tripId` vai em toda `RideOffer`. Com a ordem atual, no servidor, qualquer motorista que recebeu a
  oferta confirma que a corrida existe e gasta as tentativas do motorista atribuído (cenários 9c e 9d).

**R4 (médio). Quem aceita recebe a revogação da própria oferta.**
- **Arquivo:** `packages/api-client/src/driver/mock-adapter.ts` (`accept`). A oferta é marcada como resolvida só
  depois da passagem automática para `driver_en_route`, e o vigia da oferta lê essa passagem como cancelamento.
- **Muda:** a oferta é marcada como resolvida, e o vigia desligado, antes das duas transições.
- **Teste:** durante o `accept`, `subscribeOffers` recebe só `offer.created`.

**R5 (médio). O embarque aproximado pode vazar o endereço.**
- **Arquivo:** `packages/domain/src/geo.ts` (`toApproximatePlace`).
- **Muda:** sem bairro, o valor de reserva é um texto neutro (por exemplo, "Bairro não informado"), nunca `label` nem
  `address`. Ou então a função passa a exigir o bairro.
- **Teste:** um `Place` sem bairro, com `label` igual ao endereço, não pode deixar o `label` aparecer na oferta.
- **Por quê:** o servidor do S4 vai reutilizar essa função, e um geocodificador que não devolve bairro leva o
  endereço exato a todo motorista ofertado.

**R6 (baixo). Chave repetida em outra corrida.**
- **Arquivo:** `packages/api-client/src/passenger/mock-adapter.ts` (`cancel`).
- **Muda:** a impressão do corpo passa a ser `fingerprint({ tripId, ...input })`, como já é do lado do motorista.
- **Teste:** cenário 4b dá `409 idempotency_key_reused`.

**R7 (baixo). Ficar offline sempre funciona.**
- **Arquivos:** `packages/api-client/src/driver/mock-adapter.ts` (`setAvailability`) e o README (C3).
- **Muda:** as checagens de aprovação e documento valem só para `online: true`.
- **Por quê:** um motorista cujo documento vence no meio do turno precisa conseguir desligar.

**R8 (texto).**
- **Arquivos:** JSDoc de `TripRealtimePort` em `packages/api-client/src/trip/types.ts` e o README, seções "Tempo
  real" e "`reason` tipado".
- **Escrever:**
  - a porta também entrega o estado ao reconectar e ao detectar buraco;
  - a porta só entrega eventos de estado com `seq` estritamente crescente, e é ela que descarta duplicados;
  - o adaptador `http` transforma `reason` fora da união em `kind: 'unknown'`.

**Não bloqueia (registro):**
- **Pet:** a fixture deixa Pet ligado, mas a D-09 no plano-mestre diz "as duas nascem desligadas".
- **Comentário de `DeclineReason`:** atribui os valores à decisão 15, que trata de cancelamento, não de recusa.
- **Distância e tempo na oferta:** arredondamento recomendado (ver acima).
- **Destino exato na oferta:** pergunta ao dono (ver acima).

---

## Reconferência 2 (Nova, 22/11/2026): commit `985bc67`, ponta da branch `fatia/f08-v2`

**Alvo:** `985bc67`, que entra por cima do `c5f8fa0`. Conferi contra R1 a R8 e contra as duas decisões do dono de
22/11 em `docs/decisoes-do-dono.md`: "o embarque na oferta é só o bairro" e "o destino na oferta também é só o bairro".

**Método:**
- Extraí `packages/domain` e `packages/api-client` do commit, com `git archive`, para uma pasta temporária fora do
  repositório. A árvore de trabalho não foi tocada.
- Rodei os testes dessa cópia:
  - `packages/domain`: `tests 28 · suites 8 · pass 28 · fail 0`.
  - `packages/api-client`: `tests 288 · suites 43 · pass 288 · fail 0`.
- Rodei a sonda de novo, ampliada para 27 verificações, contra os mocks deste commit.
- Não rodei `typecheck` nem a CI.

### Veredito: APROVADO

R1 a R8 estão corrigidos e provados na sonda. As duas decisões do dono estão respeitadas no contrato e no mock.
Nenhum dos cenários que falharam na reconferência anterior falha agora.

### R1 a R8

| Item | Situação | Prova (sonda) |
|---|---|---|
| R1 o motorista atribuído fica sabendo do cancelamento | **Corrigido** | Quando o passageiro, o admin ou o sistema cancela, o motorista atribuído recebe `status: cancelled` e o `status()` dele devolve `cancelled`. O A3 continua valendo: o motorista que já tinha devolvido a corrida recebe 404 quando ela é cancelada depois, e o que saiu antes não vê o cancelamento do motorista seguinte |
| R2 o resumo é sempre do motorista atribuído | **Corrigido** | Depois que B aceita, sem nenhuma consulta durante a busca, o passageiro vê a corrida sem motorista, e não A. Um `setDriverSummary` de A, que não é o atribuído, é ignorado; o de B aparece |
| R3 ordem das checagens em `start` | **Corrigido** | Antes de chegar, `409 invalid_transition`; motorista não atribuído, 404; as tentativas de quem não é atribuído não contam, e B usa o código certo e passa para `in_progress`; o atribuído erra 5 vezes e a 6ª dá `429` |
| R4 quem aceita não recebe a revogação | **Corrigido** | Quem aceita recebe só `offer.created` |
| R5 sem bairro, texto neutro | **Corrigido** | `neighborhood: "Bairro não informado"`; teste novo em `packages/domain/test/geo.test.ts` |
| R6 chave repetida em outra corrida | **Corrigido** | `409 idempotency_key_reused`, e a segunda corrida continua em `requested` |
| R7 ficar offline sempre funciona | **Corrigido** | Offline funciona com documento vencido e com conta não aprovada; ficar online com documento vencido continua dando `409 not_eligible` |
| R8 textos | **Corrigido** | O JSDoc de `TripRealtimePort` cobre reconexão, buraco e `seq` estritamente crescente; `trip/result.ts` e o README dizem que `reason` desconhecido vira `unknown` |

Os cenários que já passavam continuam passando:
- motorista que saiu: 404;
- o domínio recusa motorista em `searching_driver` e `requested`;
- chave repetida com corpo diferente: 409;
- a sequência de `seq` sai `status:1 status:2 location:2 status:3`, e o snapshot traz `seq: 3`.

### As duas decisões do dono

- **Embarque e destino só pelo bairro:** `RideOffer.pickup` e `RideOffer.destination` são `ApproximatePlace`, com
  bairro e ponto arredondado a 2 casas. Na sonda, procurei no `offer.created` recebido por quem **recusou** o endereço
  do embarque, o do destino, os números de porta, as coordenadas exatas e os rótulos ("Casa", "Trabalho"). **Nenhum
  aparece.**
- **Endereço exato só para o atribuído:** o `DriverTripSnapshot` do motorista atribuído traz os dois endereços
  completos. Quem recusou recebe 404.
- **Distância e tempo arredondados:** com 1234 m e 257 s na entrada, a oferta mostra 1200 m e 240 s. Isso está no
  mock e no JSDoc de `RideOffer`.

### Observações que não bloqueiam

1. **Embarque muito perto aparece como zero.** O arredondamento simples mostra "0 m, 0 min" quando o embarque está
   muito perto (com 40 m e 20 s na entrada, a oferta traz 0 e 0). A tela M06 deve mostrar "menos de 100 m" e "menos
   de 1 min", ou o servidor do S4 usa um passo como mínimo.
2. **O bloqueio do mock não expira.** No mock, o `429` do código de embarque não se desfaz depois dos
   `retryAfterSeconds: 30`. A tela não deve testar o desbloqueio contra o mock.
3. **No mock só do passageiro, `advance` precisa do `driverId`.** `control.advance(tripId, 'driver_assigned')` tem
   de receber o `driverId`; sem ele, `setDriverSummary` é ignorado e a tela fica sem motorista, sem aviso. Está escrito
   no README e no exemplo dele.
4. **Fora da zona da F08, para a fatia de interface (F08b e M06):** o cartão de oferta que existe hoje em
   `apps/driver/src/components/home/NewRideOfferCard.tsx` recebe `passengerName` e `pickupAddress`. As duas decisões
   do dono proíbem isso antes do aceite. O cartão passa a receber os bairros do embarque e do destino, sem o nome do
   passageiro.

---

## Atualização do contrato: código de embarque, D-12 (Vega, 27/11/2026)

**Por quê:** o dono decidiu em 22/11/2026 "PIN em todas as categorias; o passageiro informa o código para a corrida
começar" (`docs/decisoes-do-dono.md`, tabela "Corrida", linha D-12). Até aqui, o item C1 acima previa
`start(tripId, { pickupCode? }, ...)` com o código opcional, e o item D deixava `pickupCode` no snapshot do passageiro
como dívida. As duas coisas mudam. Este bloco é o contrato em vigor; o texto da Nova acima fica como registro.

**Arquivos:** `packages/domain/src/pickup-code.ts` (regra), `packages/api-client/src/passenger/types.ts`,
`packages/api-client/src/driver/types.ts`, os dois `mock-adapter.ts`, `packages/api-client/src/trip/mock-store.ts`,
`packages/api-client/src/trip/pickup-code.ts` (gerador do mock) e o README do `api-client`, que traz a descrição completa.

### Formato

Exatamente **4 algarismos ASCII, como texto** (`"0482"`: zero à esquerda vale, por isso não é número). Sem espaço,
traço ou normalização; o app envia só os algarismos. Regra única em `isPickupCodeFormat` (`@vuumbora/domain`, raiz:
as duas pontas e o servidor usam a mesma). 4 algarismos é o que as fichas P08 e M08 desenharam. Com 5 tentativas por
corrida e motorista antes do `429`, acertar no chute tem chance de 5 em 10.000.

### Lado do passageiro: `PassengerTripSnapshot.pickupCode?: string`

| Fase | `pickupCode` |
|---|---|
| `requested`, `searching_driver` | ausente (a chave nem existe) |
| `driver_assigned`, `driver_en_route`, `driver_arrived` | presente |
| `in_progress`, `completed`, `cancelled`, `failed` | ausente |

- A regra das fases mora em `isPickupCodeVisible` (`@vuumbora/domain`).
- **Um código por corrida**, gerado no pedido e estável até o fim. Se o motorista devolve a corrida para a busca e
  outro assume, o código continua o mesmo. Isso é seguro porque o código só é dito em `driver_arrived`, e dali a
  corrida não volta para a busca: quem saiu antes nunca o ouviu. Além disso, a guarda A3 impede quem saiu de chamar o
  `start`.
- **Minimização (PP-14):** nunca no histórico (`PassengerTripHistoryEntry` não tem o campo) e nunca nos eventos de
  tempo real. O evento avisa a fase, e o código vem por `status()`, como `driver`.

### Lado do motorista: nunca vê o código

`DriverTripSnapshot`, `RideOffer`, `offer.created`, os eventos da corrida e o histórico do motorista não carregam o
código em fase nenhuma. O motorista PEDE o código ao passageiro. É isso que prova que o passageiro entrou no carro
certo, e é o risco que o item (2) desta conferência apontou.

### `start(tripId, { pickupCode }, idempotencyKey)`: código obrigatório

A entrada é `DriverStartTripInput = { pickupCode: string }`. A assinatura continua a mesma; só o campo deixou de ser
opcional.

| # | Situação | Resposta | Conta tentativa? |
|---|---|---|---|
| 1 | falta o código (`{}`, `null`, `""`) | `400 validation`, `fields.pickupCode` | não |
| 1 | formato inválido | `400 validation`, `fields.pickupCode` | não |
| 2 | motorista não é o atribuído, ou a corrida não existe | `404 not_found` | não |
| 3 | corrida fora de `driver_arrived` | `409 invalid_transition` | não |
| 4 | 5 erros anteriores nesta corrida, por este motorista | `429 rate_limited` | — |
| 5 | código errado | `400 validation`, `fields.pickupCode` ("Código de embarque incorreto.") | sim |

- O passo 1 valida o corpo e vem antes de tudo, como o servidor faz antes de ir ao banco. Ele responde igual, exista a
  corrida ou não, e **não ocupa a chave de idempotência**.
- A ordem do R3 continua: a atribuição vem antes de qualquer coisa que toque as tentativas.
- O app distingue "faltou ou formato" de "errado" pelo texto de `fields.pickupCode`. Os textos estão no README.

### Pontos para o S4 (servidor real)

- Gerar o código com `crypto.randomInt(0, 10000)` e formatar com 4 algarismos (zero à esquerda), um por corrida, na
  criação.
- Guardar o código fora de qualquer projeção do motorista.
- O `429` precisa expirar: no mock ele não expira, e isso já está na observação 2 da Reconferência 2.
- Comparar em tempo constante não é necessário: com 4 algarismos e o limite de 5 tentativas, o limite é a proteção.
- Apagar o código (ou deixar de devolvê-lo) a partir de `in_progress`. O histórico nunca o lê.
