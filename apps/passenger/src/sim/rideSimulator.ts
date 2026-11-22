/**
 * Orquestra a progressão da corrida (P07 → P10) chamando `control` do mock da porta de corrida
 * (`@vuumbora/api-client/passenger`, ver `../ride/passengerRideClient.ts`) — F08b substituiu o
 * simulador local antigo (que chamava `transitionRide` direto) por ESTE adaptador: quem valida
 * cada passo agora é o mesmo domínio que o backend vai usar (`transitionTrip`, por dentro do
 * mock), não uma cópia local.
 *
 * Este módulo NUNCA importa a store (`useRideRequestStore`) — é o que fechou o ciclo de import que
 * o Metro avisava (store ↔ simulador). Em vez disso, `startRideSimulation` recebe os setters que
 * precisa como `callbacks`: a store chama `startRideSimulation(input, callbacks)` passando os
 * próprios `set`/`get` por dentro das funções — zero import de volta para cá.
 *
 * `2600 ms` por etapa, progresso de corrida a cada `500 ms`: a MESMA cadência do simulador antigo,
 * só que agora `setTimeout`/`setInterval` chamam `control.advance`/`control.setDriverSummary` em
 * vez de `transitionRide` (README do pacote, "Trocar o simulador por este mock").
 *
 * A entrada em `searching_driver` continua sendo decidida e aplicada DIRETO pela store, de forma
 * síncrona (`requestRide`, antes de chamar `startRideSimulation`) — não dá para esperar a volta
 * de `port.request` (assíncrono) porque a tela de busca (`buscando.tsx`) navega para lá no mesmo
 * tapa de botão e redireciona pra Home se a fase ainda não for `searching_driver` no primeiro
 * render. Este módulo só cria a corrida "de verdade" no mock em paralelo (microtask) e, ao
 * terminar, avança o MESMO mock para `searching_driver` antes de assinar — para o mock nunca
 * aparentar atraso em relação à tela, que já mostra a busca.
 *
 * F08b (ajuste do Atlas): a COTAÇÃO é toda da store (`refreshQuote`, chamada a partir de
 * `setDestination`) — este módulo não chama mais `port.quote()` nem decide categoria nenhuma.
 * `startRideSimulation` recebe o `quoteId` já escolhido (da cotação que a Home mostrou e a pessoa
 * selecionou) e só pede com ele: sem cotação válida pra aquela categoria, `port.request` recusa
 * (`quote_expired`/`category_unavailable`/`not_found`) e `onRequestFailed` avisa a store — nunca um
 * fallback silencioso para outra categoria.
 */
import type { TripId, TripStatus } from '@vuumbora/domain';
import { uuid } from 'expo';
import { passengerRide } from '../ride/passengerRideClient';
import { MOCK_ASSIGNED_DRIVER, type AssignedDriverInfo } from '../data/mockDriverAssignment';

export interface RideSimulationInput {
  /** `quoteId` da categoria JÁ escolhida (cotação viva, buscada pela store) — nunca decidido aqui. */
  readonly quoteId: string;
  readonly paymentMethodId: string;
}

/** Os pontos exatos que o simulador antigo escrevia direto na store — agora por callback. */
export interface RideSimulationCallbacks {
  readonly onStatus: (status: TripStatus) => void;
  /** `port.request` recusou (cotação vencida, categoria desligada entre a cotação e o pedido, etc.). */
  readonly onRequestFailed: () => void;
  readonly onDriverAssigned: (driver: AssignedDriverInfo, pickupEtaMinutes: number) => void;
  readonly onPickupEta: (minutes: number) => void;
  readonly onTripProgress: (percent: number, etaMinutes: number) => void;
  /** Corrida chegou a `completed` — quem chama monta o recibo (a store já sabe a tarifa pedida). */
  readonly onCompleted: () => void;
}

const TOTAL_TRIP_ETA_MINUTES = 12;
const PROGRESS_STEP_PERCENT = 10;
const PROGRESS_TICK_MS = 500;
const STEP_DELAY_MS = 2600;

/** Incrementada a cada start/stop — invalida qualquer bootstrap assíncrono (`port.request`) ainda em voo. */
let generation = 0;
let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingInterval: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;
let activeTripId: TripId | null = null;

function firstNameOf(fullName: string): string {
  return fullName.split(' ')[0] ?? fullName;
}

/** Para qualquer passo agendado e a assinatura do canal de tempo real. Idempotente. */
export function stopRideSimulation(): void {
  generation += 1;
  if (pendingTimeout !== null) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }
  if (pendingInterval !== null) {
    clearInterval(pendingInterval);
    pendingInterval = null;
  }
  if (unsubscribe !== null) {
    unsubscribe();
    unsubscribe = null;
  }
  activeTripId = null;
}

/**
 * Cancela a corrida ATUAL no mock pela porta real do passageiro (`port.cancel`, não `control` —
 * quem cancela aqui é o passageiro, não um ator simulado) e para a simulação. Sem corrida ativa
 * (bootstrap ainda não resolveu, ou já tinha terminado), só para a simulação. A store chama isto
 * em `cancelSearch` e decide por conta própria voltar para `draft` — o resultado do cancelamento
 * no mock não muda essa decisão (mesmo comportamento do simulador antigo, que já ignorava o
 * resultado de `transitionRide('cancelled')`).
 */
export function cancelActiveRide(): void {
  const tripId = activeTripId;
  stopRideSimulation();
  if (tripId === null) return;
  passengerRide.port.cancel(tripId, {}, uuid.v4()).catch(() => {
    // O mock nunca rejeita (só devolve `Result`); o catch é só pra uma chamada "dispare e esqueça"
    // nunca estourar uma rejeição não tratada.
  });
}

/** Dispara a cadeia de transições a partir de `searching_driver`. Chamado só por `requestRide` da store. */
export function startRideSimulation(input: RideSimulationInput, callbacks: RideSimulationCallbacks): void {
  stopRideSimulation();
  const myGeneration = generation;
  bootstrap(input, callbacks, myGeneration).catch(() => {
    // `port.request` do mock não rejeita (devolve `Result`) — o catch é só rede de segurança: se
    // rejeitasse, a corrida simplesmente não progride (nada quebra na tela).
  });
}

async function bootstrap(input: RideSimulationInput, callbacks: RideSimulationCallbacks, myGeneration: number): Promise<void> {
  const requested = await passengerRide.port.request({ quoteId: input.quoteId, paymentMethodId: input.paymentMethodId }, uuid.v4());
  if (myGeneration !== generation) return; // cancelado/substituído enquanto o pedido ia e voltava
  if (!requested.ok) {
    console.warn('[ride] pedido ao mock falhou — a corrida não vai avançar.', requested.error);
    callbacks.onRequestFailed();
    return;
  }

  const tripId = requested.data.tripId;
  activeTripId = tripId;
  // Alcança a fase que a store JÁ mostra (`searching_driver`, aplicada de forma síncrona em
  // `requestRide` antes deste bootstrap terminar) — assina DEPOIS, pra não entregar um evento
  // `status: 'requested'` que faria a fase local andar pra trás por um instante.
  passengerRide.control.advance(tripId, 'searching_driver');
  unsubscribe = passengerRide.port.subscribe(tripId, (event) => {
    if (event.type === 'status') callbacks.onStatus(event.status);
  });

  scheduleStep(tripId, myGeneration, callbacks, 'driver_assigned', STEP_DELAY_MS, MOCK_ASSIGNED_DRIVER.driverId, () => {
    callbacks.onDriverAssigned(MOCK_ASSIGNED_DRIVER, 6);
    passengerRide.control.setDriverSummary(tripId, {
      driverId: MOCK_ASSIGNED_DRIVER.driverId,
      firstName: firstNameOf(MOCK_ASSIGNED_DRIVER.name),
      plate: MOCK_ASSIGNED_DRIVER.plate,
    });
  });
}

function scheduleStep(
  tripId: TripId,
  myGeneration: number,
  callbacks: RideSimulationCallbacks,
  next: TripStatus,
  delayMs: number,
  assignedDriverId: string | undefined,
  onApplied?: () => void,
): void {
  pendingTimeout = setTimeout(() => {
    if (myGeneration !== generation) return;
    const result = passengerRide.control.advance(tripId, next, assignedDriverId);
    if (!result.ok) return; // o domínio recusou (mesma validação de antes) — não força nada
    onApplied?.();
    continueAfter(tripId, myGeneration, callbacks, next);
  }, delayMs);
}

function continueAfter(tripId: TripId, myGeneration: number, callbacks: RideSimulationCallbacks, phase: TripStatus): void {
  switch (phase) {
    case 'driver_assigned':
      scheduleStep(tripId, myGeneration, callbacks, 'driver_en_route', STEP_DELAY_MS, undefined, () => callbacks.onPickupEta(3));
      break;
    case 'driver_en_route':
      scheduleStep(tripId, myGeneration, callbacks, 'driver_arrived', STEP_DELAY_MS, undefined, () => callbacks.onPickupEta(0));
      break;
    case 'driver_arrived':
      scheduleStep(tripId, myGeneration, callbacks, 'in_progress', 2200, undefined, () => callbacks.onTripProgress(0, TOTAL_TRIP_ETA_MINUTES));
      break;
    case 'in_progress':
      startTripProgressTicks(tripId, myGeneration, callbacks);
      break;
    default:
      break; // completed/cancelled/failed/requested/searching_driver: nada a agendar aqui
  }
}

function startTripProgressTicks(tripId: TripId, myGeneration: number, callbacks: RideSimulationCallbacks): void {
  let percent = 0;
  pendingInterval = setInterval(() => {
    if (myGeneration !== generation) return;
    percent = Math.min(100, percent + PROGRESS_STEP_PERCENT);
    const etaMinutes = Math.max(0, Math.round(TOTAL_TRIP_ETA_MINUTES * (1 - percent / 100)));
    callbacks.onTripProgress(percent, etaMinutes);

    if (percent >= 100) {
      if (pendingInterval !== null) {
        clearInterval(pendingInterval);
        pendingInterval = null;
      }
      // Avança (e avisa quem está inscrito) ANTES de encerrar a assinatura — senão o evento
      // `status: 'completed'` nunca chega à store.
      const result = passengerRide.control.advance(tripId, 'completed');
      if (result.ok) callbacks.onCompleted();
      if (unsubscribe !== null) {
        unsubscribe();
        unsubscribe = null;
      }
      activeTripId = null;
    }
  }, PROGRESS_TICK_MS);
}
