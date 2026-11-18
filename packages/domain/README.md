# @vuumbora/domain

Tipos e funções puras do negócio. Sem React, sem I/O.

| Import | Conteúdo | Quem pode usar |
|---|---|---|
| `@vuumbora/domain` | núcleo comum: `Id`, `Money` (centavos BRL), `Place`, `TripStatus`, `DataOrigin` | todos |
| `@vuumbora/domain/passenger` | fases e regras do passageiro | só `apps/passenger` |
| `@vuumbora/domain/driver` | fases e regras do motorista | só `apps/driver` |

Status de corrida é decidido pelo backend; aqui ficam só projeções e guardas de UI.
Os contratos são **propostas** até a Etapa E (backend). Fronteira checada por `npm run check:boundaries`.
