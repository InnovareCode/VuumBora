/**
 * Instância ÚNICA do adaptador de corrida do passageiro (`@vuumbora/api-client/passenger`) — a
 * porta real (`quote`/`request`/`status`/`cancel`/`subscribe`) e o `control` que avança o tempo da
 * corrida (README do pacote, "O mock não despacha motorista sozinho").
 *
 * De propósito, este arquivo NÃO importa a store nem o simulador (`src/sim/rideSimulator.ts`) — é
 * só a porta. Antes (F08b), `rideSimulator.ts` e `store/useRideRequestStore.ts` se importavam um
 * ao outro (ciclo que o Metro avisava); agora só a store importa o simulador, e só o simulador
 * importa este arquivo. Nenhuma tela usa `passengerRide` direto — tudo passa pela store.
 *
 * Quando existir um adaptador `http` real para `/passenger` (o README já reserva o espaço), troca
 * só esta linha, no mesmo espírito de `src/identity/identityClient.ts` — nenhuma tela ou store
 * conhece o mock por fora deste módulo.
 */
import { createMockPassengerRidePort, type MockPassengerRide } from '@vuumbora/api-client/passenger';

export const passengerRide: MockPassengerRide = createMockPassengerRidePort();
