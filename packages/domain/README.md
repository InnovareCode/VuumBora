# @vuumbora/domain

Tipos e funções puras do negócio. Sem React, sem I/O.

| Import | Conteúdo | Quem pode usar |
|---|---|---|
| `@vuumbora/domain` | núcleo comum: `Id`, `Money` (centavos BRL), `Place`, `TripStatus`, `DataOrigin`, e a tabela de transições de `TripStatus` (`cancelTrip`, `transitionTrip`, `isTripCancellable`) | todos, inclusive `apps/driver` |
| `@vuumbora/domain/passenger` | fases de UI do passageiro (`draft`/`quoted` + `TripStatus`) sobre a MESMA tabela da raiz, mais `cancelRide` | só `apps/passenger` |
| `@vuumbora/domain/driver` | fases e regras do motorista, `RideOffer` | só `apps/driver` |

Status de corrida é decidido pelo backend; aqui ficam só projeções e guardas de UI.
Os contratos são **propostas** até a Etapa E (backend). Fronteira checada por `npm run check:boundaries`.

**Cancelamento depende de quem cancela** (`cancelTrip`/`cancelRide`, plano-sistema.md §6.1): motorista em
`driver_assigned`/`driver_en_route` volta a corrida para `searching_driver`; qualquer outro ator (ou o
motorista em `driver_arrived`) mata a corrida (`cancelled`). A tabela mora em `trip-lifecycle.ts`, na raiz
(não em `./passenger`), porque `apps/driver` precisa dela sem nunca importar o subcaminho do passageiro.
