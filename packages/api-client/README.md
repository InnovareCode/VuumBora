# @vuumbora/api-client

Portas (interfaces) que as telas consomem + adaptadores `mock` e `http` **distintos**.

- `@vuumbora/api-client`: `ClientConfig` (modo obrigatório, sem default), `ApiError`, `Result<T>`, `AuthPort`.
- `@vuumbora/api-client/passenger`: `PassengerRidePort`, `PlacesPort` — só `apps/passenger`.
- `@vuumbora/api-client/driver`: `DriverJourneyPort`, `DriverOfferPort` — só `apps/driver`.
- `@vuumbora/api-client/waitlist`: `WaitlistPort` + `createWaitlistHttpAdapter` — só `apps/site`. Primeiro
  adaptador `http` real do monorepo (backend em `apps/api`); contrato completo em
  `docs/lista-de-espera.md`.

Toda resposta traz `origin: 'mock' | 'real'` para a UI sinalizar dados de demonstração.
Ações críticas (solicitar, aceitar, cancelar) exigem `idempotencyKey`; a inscrição na lista de
espera não precisa — o e-mail já é a chave natural de deduplicação, garantida no banco.
Adaptadores mock entram na Fase 1 (passageiro/motorista), http na Etapa E — a lista de espera já
tem o seu. SDKs de mapa/pagamento/push também entram atrás de portas aqui, nunca chamados direto
da tela.
