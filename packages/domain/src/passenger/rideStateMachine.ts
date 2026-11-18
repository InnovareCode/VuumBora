/**
 * Máquina de estados da CORRIDA do passageiro — a fonte única de quais transições de
 * fase são válidas. Vive aqui (não no app) porque é regra de negócio: uma tela nunca
 * decide "posso ir do estado X pro Y" por conta própria, ela só tenta e o domínio aceita
 * ou recusa a transição.
 *
 * Hoje quem de fato DISPARA as transições é um SIMULADOR LOCAL
 * (`apps/passenger/src/sim/rideSimulator.ts`) — esse é o ponto isolado e óbvio onde o
 * backend entra depois (ex.: eventos de WebSocket/polling do `PassengerRidePort`),
 * sem precisar tocar nesta tabela: o simulador (ou, no futuro, o backend) só propõe
 * a próxima fase, e esta função aceita ou recusa.
 *
 * Fases (DESIGN_SYSTEM_MESTRE §8): rascunho → solicitada → buscando → motorista
 * atribuído → a caminho → no embarque → em andamento → finalizada | cancelada.
 * `quoted` é fase de UI prevista mas ainda sem tela própria (o fluxo atual pula direto
 * de `draft` para `requested` em `requestRide`).
 */
import type { TripStatus } from '../index';

/** Fases de UI do passageiro. `draft`/`quoted` são locais; o resto é `TripStatus` (servidor). */
export type PassengerTripPhase = 'draft' | 'quoted' | TripStatus;

export type RideState = PassengerTripPhase;

/** Grafo de transições válidas. Terminal = array vazio (nenhuma saída). */
const RIDE_TRANSITIONS: Readonly<Record<RideState, readonly RideState[]>> = {
  draft: ['quoted', 'requested'],
  quoted: ['requested', 'draft'],
  requested: ['searching_driver', 'cancelled'],
  searching_driver: ['driver_assigned', 'cancelled', 'failed'],
  driver_assigned: ['driver_en_route', 'cancelled'],
  driver_en_route: ['driver_arrived', 'cancelled'],
  driver_arrived: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
  failed: ['draft'],
};

export type RideTransitionResult =
  | { readonly ok: true; readonly state: RideState }
  | { readonly ok: false; readonly from: RideState; readonly to: RideState; readonly reason: string };

/** Só consulta — não muda nada. Útil pra UI desabilitar uma ação antes de tentar (ex.: botão cancelar). */
export function canTransitionRide(from: RideState, to: RideState): boolean {
  return RIDE_TRANSITIONS[from].includes(to);
}

/**
 * Tenta a transição. Recusa (`ok: false`) em vez de lançar — quem chama (store/simulador)
 * decide o que fazer com a recusa; o domínio NUNCA força um estado inválido só porque a
 * navegação "mandou". Isso é o ponto central desta máquina: a UI não evita uma transição
 * inválida por sorte/disciplina de código, ela é recusada aqui.
 */
export function transitionRide(from: RideState, to: RideState): RideTransitionResult {
  if (!canTransitionRide(from, to)) {
    return { ok: false, from, to, reason: `Transição de corrida inválida: "${from}" → "${to}".` };
  }
  return { ok: true, state: to };
}

/** Fases em que a corrida ainda pode ser cancelada pelo passageiro (antes de iniciar o trajeto). */
export function isRideCancellable(phase: RideState): boolean {
  return canTransitionRide(phase, 'cancelled');
}
