# @vuumbora/api-client

Portas (interfaces) que as telas consomem + adaptadores `mock` e `http` **distintos**.

- `@vuumbora/api-client`: `ClientConfig` (modo obrigatório, sem default), `ApiError`, `Result<T>`, `AuthPort`.
- `@vuumbora/api-client/passenger`: `PassengerRidePort`, `PlacesPort` — só `apps/passenger`.
- `@vuumbora/api-client/driver`: `DriverJourneyPort`, `DriverOfferPort` — só `apps/driver`.

Toda resposta traz `origin: 'mock' | 'real'` para a UI sinalizar dados de demonstração.
Ações críticas (solicitar, aceitar, cancelar) exigem `idempotencyKey`.
Adaptadores ainda não existem: mock entra na Fase 1, http na Etapa E. SDKs de mapa/pagamento/push
também entram atrás de portas aqui, nunca chamados direto da tela.
