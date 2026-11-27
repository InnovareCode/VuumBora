import { useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MOCK_SAVED_PLACES } from '../data/mockPlaces';
import { MOCK_ASSIGNED_DRIVER } from '../data/mockDriverAssignment';
import { buildMockReceipt } from '../data/mockTripReceipt';
import { useRideRequestStore } from '../store/useRideRequestStore';
import { stopRideSimulation } from '../sim/rideSimulator';
import { devSampleOrigin } from './devGeo';

/**
 * Fases que a captura de tela (`tools/qualidade-tela`) consegue pedir por `?devPhase=` — SÓ
 * `__DEV__`, nunca lido em produção (mesmo padrão de `useDevRideSeed`/`?devAprovado` da M05).
 *
 * Existe porque o simulador real (`rideSimulator.ts`) nunca produz `failed` nem a volta do
 * motorista para a busca (ficha P07 §14: "para a Íris fotografar esses estados, a Lyra precisa
 * de um parâmetro de teste só de desenvolvimento") — sem isto, as capturas de "nenhum
 * motorista", "cancelada por terceiros" e "o motorista cancelou" não existem.
 */
const DEV_RIDE_PHASES = [
  'searching_driver',
  'driver_assigned',
  'driver_en_route',
  'driver_arrived',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
  'driver_cancelled', // sintético: não é uma fase real, ver `applyDevPhase`
] as const;

export type DevRidePhaseParam = (typeof DEV_RIDE_PHASES)[number];

export function isDevRidePhaseParam(value: string): value is DevRidePhaseParam {
  return (DEV_RIDE_PHASES as readonly string[]).includes(value);
}

const MOCK_ASSIGNED_DRIVER_PICKUP_ETA: Record<'driver_assigned' | 'driver_en_route' | 'driver_arrived', number> = {
  driver_assigned: 6,
  driver_en_route: 3,
  driver_arrived: 0,
};

/** Aplica a fase pedida DEPOIS que a corrida real já existe (`requestRide` já rodou e o
 *  simulador já foi parado) — nunca decide por conta própria se a transição "valeria" no
 *  domínio: isto é um atalho de CAPTURA, não uma simulação de regra de negócio. */
const DEV_PICKUP_CODE = '4821';

function applyDevPhase(phase: DevRidePhaseParam): void {
  switch (phase) {
    case 'searching_driver':
      return; // já é o estado logo depois de `requestRide()` + `stopRideSimulation()`
    case 'driver_assigned':
    case 'driver_en_route':
    case 'driver_arrived':
      useRideRequestStore.setState({
        phase,
        assignedDriver: MOCK_ASSIGNED_DRIVER,
        // Atalho de captura: código fixo no formato do contrato (D-12, 4 algarismos).
        pickupCode: DEV_PICKUP_CODE,
        pickupEtaMinutes: MOCK_ASSIGNED_DRIVER_PICKUP_ETA[phase],
      });
      return;
    case 'in_progress':
      useRideRequestStore.setState({
        phase: 'in_progress',
        assignedDriver: MOCK_ASSIGNED_DRIVER,
        pickupCode: undefined,
        tripProgressPercent: 40,
        tripEtaMinutes: 7,
      });
      return;
    case 'completed': {
      // P10 (`concluida.tsx`) chama este MESMO hook — precisa do recibo que `onCompleted` da
      // store monta de verdade (`buildMockReceipt` a partir da cotação REALMENTE pedida).
      const requested = useRideRequestStore.getState().requestedQuote;
      useRideRequestStore.setState({
        phase: 'completed',
        assignedDriver: MOCK_ASSIGNED_DRIVER,
        receipt: requested ? buildMockReceipt(requested.priceCents) : undefined,
      });
      return;
    }
    case 'failed':
      useRideRequestStore.setState({ phase: 'failed', assignedDriver: undefined });
      return;
    case 'cancelled':
      useRideRequestStore.setState({ phase: 'cancelled' });
      return;
    case 'driver_cancelled':
      // A MESMA transição real de "motorista cancelou, devolvendo a busca" (`trip-lifecycle.ts`,
      // ator motorista em `driver_assigned`/`driver_en_route` → `searching_driver`) — aplicada em
      // dois passos pra `corrida.tsx` detectar a transição (o efeito que mostra o aviso compara a
      // fase ANTERIOR com a atual) e não achar que é uma busca nova.
      useRideRequestStore.setState({ phase: 'driver_assigned', assignedDriver: MOCK_ASSIGNED_DRIVER });
      Promise.resolve().then(() => {
        useRideRequestStore.setState({ phase: 'searching_driver', assignedDriver: undefined, pickupEtaMinutes: undefined });
      });
      return;
  }
}

/** Resolve quando o predicado for verdadeiro, ou desiste depois de `timeoutMs`. */
function waitForQuote(timeoutMs = 4000): Promise<void> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const { quoteStatus } = useRideRequestStore.getState();
      if (quoteStatus === 'ready' || quoteStatus === 'error' || Date.now() > deadline) {
        resolve();
        return;
      }
      setTimeout(check, 30);
    };
    check();
  });
}

/**
 * `?devPhase=driver_arrived` (etc.) força a corrida direto nessa fase, sem esperar os passos do
 * simulador (`STEP_DELAY_MS` de 2.6s cada) — usa o fluxo REAL (`setDestination` → cotação →
 * `requestRide`) pra ter um `requestedCategory`/preço de verdade na P07, e só então congela
 * (`stopRideSimulation`) e pula pra fase pedida.
 */
export function useDevRidePhaseOverride(): void {
  const { devPhase } = useLocalSearchParams<{ devPhase?: string }>();

  useEffect(() => {
    if (!__DEV__ || !devPhase || !isDevRidePhaseParam(devPhase)) return;
    // Capturado numa constante com o tipo já estreitado: dentro da função assíncrona abaixo
    // (declarada depois da guarda), o TypeScript não propaga o estreitamento de `devPhase`
    // feito no `if` — ele só vale no escopo síncrono imediato.
    const phaseToApply: DevRidePhaseParam = devPhase;
    let cancelled = false;

    async function run() {
      const state = useRideRequestStore.getState();
      if (!state.destination) {
        const seedDestination = MOCK_SAVED_PLACES[2];
        if (seedDestination) state.setRoute(state.origin ?? devSampleOrigin(), seedDestination);
      }
      await waitForQuote();
      if (cancelled) return;
      const afterQuote = useRideRequestStore.getState();
      if (afterQuote.quoteStatus !== 'ready' || afterQuote.fareQuotes.length === 0) return;
      afterQuote.requestRide();
      stopRideSimulation();
      if (cancelled) return;
      applyDevPhase(phaseToApply);
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devPhase]);
}
