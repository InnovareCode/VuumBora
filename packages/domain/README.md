# @vuumbora/domain

Tipos e funções puras do negócio. Sem React, sem I/O.

| Import | Conteúdo | Quem pode usar |
|---|---|---|
| `@vuumbora/domain` | núcleo comum: `Id`, `Money` (centavos BRL), `Place`, `TripStatus`, `DataOrigin`, a tabela de transições de `TripStatus` (`cancelTrip`, `transitionTrip`, `isTripCancellable`) e localização aproximada (`ApproximatePlace`, `toApproximatePlace`) | todos, inclusive `apps/driver` |
| `@vuumbora/domain/passenger` | fases de UI do passageiro (`draft`/`quoted` + `TripStatus`) sobre a MESMA tabela da raiz, mais `cancelRide` | só `apps/passenger` |
| `@vuumbora/domain/driver` | fases e regras do motorista, `RideOffer` | só `apps/driver` |

Status de corrida é decidido pelo backend; aqui ficam só projeções e guardas de UI.
Os contratos são **propostas** até a Etapa E (backend). Fronteira checada por `npm run check:boundaries`.

**Cancelamento depende de QUEM cancela e de ONDE** (`cancelTrip`/`cancelRide`, plano-sistema.md §6.1;
revisado na conferência da Nova sobre a F08 — `docs/contratos/conferencia-f08-nova.md`, achado A1):
`isTripCancellable(status, actor)` e `cancelTrip(status, actor)` SEMPRE recebem o ator.

| Ator | De onde pode cancelar | Para onde |
|---|---|---|
| passageiro, admin, sistema | `requested` … `driver_arrived` | `cancelled` |
| motorista | `driver_assigned`, `driver_en_route` | `searching_driver` (o passageiro não perde o pedido) |
| motorista | `driver_arrived` | `cancelled` |
| motorista | `requested`, `searching_driver` | **recusado** — a corrida ainda não é dele ali |

Sem a última linha, qualquer motorista cancelaria o pedido de qualquer passageiro só sabendo o `tripId`,
antes mesmo de ser atribuído. A tabela mora em `trip-lifecycle.ts`, na raiz (não em `./passenger`), porque
`apps/driver` precisa dela sem nunca importar o subcaminho do passageiro.

**Localização aproximada** (`geo.ts`, `toApproximatePlace`) — decisão do dono em 22/11/2026
(`docs/decisoes-do-dono.md`, "Complemento: o embarque na oferta é só o bairro" e "Complemento: o destino na
oferta também é só o bairro"): `RideOffer.pickup` **e** `RideOffer.destination` (`./driver`) são
`ApproximatePlace` (bairro + ponto SEMPRE arredondado a 2 casas), nunca o endereço nem o ponto exato — a
oferta vai a vários motoristas, um de cada vez, inclusive aos que recusam. "Destino visível" (§5.4) continua
valendo: o motorista sabe PARA ONDE vai, só não o endereço exato antes de aceitar. O endereço e o ponto
exatos dos dois só existem no `DriverTripSnapshot` do `api-client`, depois do aceite, para o motorista
atribuído.

**R5 (reconferência da Nova): sem bairro cadastrado, `toApproximatePlace` cai num texto NEUTRO**
(`"Bairro não informado"`) — nunca em `place.label` nem `place.address`. Cair no `label` vazava o endereço
exato quando ele era, por acaso, o próprio endereço (mock sem bairro, ou geocodificador real que não
devolve bairro).
