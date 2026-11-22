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
 *
 * As fases que já são `TripStatus` (tudo menos `draft`/`quoted`) usam a MESMA tabela que o
 * servidor usa (`../trip-lifecycle.ts`) — não uma cópia. Isso é o que garante que a correção
 * "cancelamento do motorista volta para a busca" (plano-sistema.md §6.1) valha aqui e no
 * `api-client` ao mesmo tempo, sem duas tabelas podendo divergir.
 */
import { TRIP_TRANSITIONS, cancelTrip, isTripCancellable } from '../trip-lifecycle';
import type { CancelActor } from '../trip-lifecycle';
import type { TripStatus } from '../index';

export type { CancelActor };

/** Fases de UI do passageiro. `draft`/`quoted` são locais; o resto é `TripStatus` (servidor). */
export type PassengerTripPhase = 'draft' | 'quoted' | TripStatus;

export type RideState = PassengerTripPhase;

/**
 * Grafo de transições válidas. Terminal = array vazio (nenhuma saída).
 * `draft`/`quoted` são extensões LOCAIS (o servidor não as conhece); o resto vem direto de
 * `TRIP_TRANSITIONS`, com uma única extensão de UI: de `failed` dá para voltar a `draft` para
 * tentar outra corrida (no servidor, `failed` é terminal — é um pedido NOVO, não uma transição).
 */
const RIDE_TRANSITIONS: Readonly<Record<RideState, readonly RideState[]>> = {
  draft: ['quoted', 'requested'],
  quoted: ['requested', 'draft'],
  ...TRIP_TRANSITIONS,
  failed: [...TRIP_TRANSITIONS.failed, 'draft'],
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

/**
 * Fases em que a corrida ainda pode ser cancelada PELO PASSAGEIRO. Delega a `isTripCancellable`
 * do domínio raiz com `actor: 'passenger'` — o passageiro sempre pode tentar cancelar (até o
 * embarque); é a mesma guarda por ator que `cancelRide`/`cancelTrip` usam de verdade, não uma
 * cópia que pudesse divergir (achado A1 da conferência: a permissão depende de quem cancela).
 */
export function isRideCancellable(phase: RideState): boolean {
  if (phase === 'draft' || phase === 'quoted') return false; // não existem no servidor, nada a "cancelar"
  return isTripCancellable(phase, 'passenger');
}

/**
 * Cancela a fase ATUAL, decidindo o destino E A PERMISSÃO por quem cancela (delega a `cancelTrip`
 * do domínio raiz): motorista em `driver_assigned`/`driver_en_route` volta para `searching_driver`;
 * motorista em `driver_arrived` mata a corrida; motorista em `requested`/`searching_driver` é
 * RECUSADO (a corrida ainda não é dele). Qualquer outro ator mata a corrida, nos estados em que
 * pode cancelar. Fases locais (`draft`/`quoted`) não existem no servidor — cancelá-las é só voltar
 * ao rascunho, sempre aceito, não importa o ator.
 */
export function cancelRide(phase: RideState, actor: CancelActor): RideTransitionResult {
  if (phase === 'draft') return { ok: true, state: 'draft' }; // já é rascunho — nada a desfazer
  if (phase === 'quoted') return transitionRide(phase, 'draft');
  const result = cancelTrip(phase, actor);
  return result.ok ? { ok: true, state: result.state } : { ok: false, from: phase, to: result.to, reason: result.reason };
}
