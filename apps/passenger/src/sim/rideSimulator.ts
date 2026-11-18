/**
 * SIMULADOR LOCAL da progressão da corrida (P07 → P10). NÃO é uma chamada de rede — é
 * exatamente o ponto isolado e óbvio onde o backend entra depois: trocar os
 * `setTimeout`/`setInterval` abaixo por eventos reais do `PassengerRidePort` (ex.
 * WebSocket ou polling) é a única mudança necessária, porque cada passo já passa pela
 * mesma validação (`transitionRide`, `packages/domain`) que o backend vai respeitar.
 *
 * Cada passo só é aplicado se o domínio aceitar a transição — o simulador nunca força um
 * estado que `transitionRide` recusaria.
 */
import { transitionRide, type PassengerTripPhase } from '@vuumbora/domain/passenger';
import { useRideRequestStore } from '../store/useRideRequestStore';
import { MOCK_ASSIGNED_DRIVER } from '../data/mockDriverAssignment';
import { buildMockReceipt } from '../data/mockTripReceipt';

let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingInterval: ReturnType<typeof setInterval> | null = null;

/** Para qualquer passo agendado (cancelamento, nova corrida). Idempotente. */
export function stopRideSimulation(): void {
  if (pendingTimeout !== null) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }
  if (pendingInterval !== null) {
    clearInterval(pendingInterval);
    pendingInterval = null;
  }
}

/** Dispara a cadeia de transições a partir de 'searching_driver'. Chamado só por `requestRide` da store. */
export function startRideSimulation(): void {
  stopRideSimulation();
  scheduleStep('driver_assigned', 2600, () => {
    useRideRequestStore.getState().setAssignedDriverFromSimulator(MOCK_ASSIGNED_DRIVER, 6);
  });
}

function scheduleStep(next: PassengerTripPhase, delayMs: number, onApplied?: () => void): void {
  pendingTimeout = setTimeout(() => {
    const store = useRideRequestStore.getState();
    const result = transitionRide(store.phase, next);
    if (!result.ok) return; // domínio recusou — o simulador para aqui, não força nada
    store.advancePhaseFromSimulator(result.state);
    onApplied?.();
    continueAfter(result.state);
  }, delayMs);
}

function continueAfter(phase: PassengerTripPhase): void {
  switch (phase) {
    case 'driver_assigned':
      scheduleStep('driver_en_route', 2600, () => useRideRequestStore.getState().setPickupEtaFromSimulator(3));
      break;
    case 'driver_en_route':
      scheduleStep('driver_arrived', 2600, () => useRideRequestStore.getState().setPickupEtaFromSimulator(0));
      break;
    case 'driver_arrived':
      scheduleStep('in_progress', 2200, () => useRideRequestStore.getState().setTripProgressFromSimulator(0, TOTAL_TRIP_ETA_MINUTES));
      break;
    case 'in_progress':
      startTripProgressTicks();
      break;
    default:
      break; // completed/cancelled/draft/quoted/requested/searching_driver/failed: nada a agendar aqui
  }
}

const TOTAL_TRIP_ETA_MINUTES = 12;
const PROGRESS_STEP_PERCENT = 10;
const PROGRESS_TICK_MS = 500;

function startTripProgressTicks(): void {
  let percent = 0;
  pendingInterval = setInterval(() => {
    percent = Math.min(100, percent + PROGRESS_STEP_PERCENT);
    const etaMinutes = Math.max(0, Math.round(TOTAL_TRIP_ETA_MINUTES * (1 - percent / 100)));
    const store = useRideRequestStore.getState();
    store.setTripProgressFromSimulator(percent, etaMinutes);

    if (percent >= 100) {
      stopRideSimulation();
      const result = transitionRide(store.phase, 'completed');
      if (result.ok) {
        store.advancePhaseFromSimulator(result.state);
        store.setReceiptFromSimulator(buildMockReceipt(store.categoryId));
      }
    }
  }, PROGRESS_TICK_MS);
}
