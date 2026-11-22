/**
 * Transições de CORRIDA no nível do SERVIDOR (`TripStatus`) — plano-sistema-arquitetura.md §5.2.
 * Vive na raiz do domínio (não em `./passenger` nem `./driver`) porque as duas pontas precisam da
 * MESMA regra: é o motorista que aciona `cancelTrip(..., 'driver')`, é o passageiro que vê o
 * efeito. `@vuumbora/domain/driver` nunca pode importar o subcaminho do passageiro só para
 * cancelar uma corrida — por isso esta regra mora aqui, não em `rideStateMachine.ts`
 * (checado por `scripts/check-boundaries.mjs`).
 *
 * `@vuumbora/domain/passenger` usa esta mesma tabela por baixo (`rideStateMachine.ts`); as fases
 * de UI só do passageiro (`draft`/`quoted`) continuam só dela.
 *
 * Correção registrada no S0 (plano-sistema.md §6.1 e §5.2 do anexo de arquitetura), **revisada na
 * conferência da Nova (`docs/contratos/conferencia-f08-nova.md`, achado A1)**: cancelamento é regra
 * por ATOR, não só por estado.
 *
 * | Ator | Estados de origem | Destino |
 * |---|---|---|
 * | passageiro, admin, sistema | `requested`…`driver_arrived` | `cancelled` |
 * | motorista | `driver_assigned`, `driver_en_route` | `searching_driver` (o passageiro não perde o pedido) |
 * | motorista | `driver_arrived` | `cancelled` (depois do embarque não há volta à busca) |
 * | motorista | `requested`, `searching_driver` | **recusado** — o motorista não tem corrida nenhuma
 *   atribuída nessas fases para cancelar; sem esta guarda, QUALQUER motorista cancela o pedido de
 *   QUALQUER passageiro só sabendo o `tripId` |
 */
import type { TripStatus } from './index';

export type CancelActor = 'passenger' | 'driver' | 'admin' | 'system';

export type TripTransitionResult =
  | { readonly ok: true; readonly state: TripStatus }
  | { readonly ok: false; readonly from: TripStatus; readonly to: TripStatus; readonly reason: string };

/** Grafo de transições válidas no servidor. Terminal = array vazio (nenhuma saída). */
export const TRIP_TRANSITIONS: Readonly<Record<TripStatus, readonly TripStatus[]>> = {
  requested: ['searching_driver', 'cancelled'],
  searching_driver: ['driver_assigned', 'cancelled', 'failed'],
  driver_assigned: ['driver_en_route', 'cancelled', 'searching_driver'],
  driver_en_route: ['driver_arrived', 'cancelled', 'searching_driver'],
  driver_arrived: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
  failed: [],
};

/** Só consulta — não muda nada. */
export function canTransitionTrip(from: TripStatus, to: TripStatus): boolean {
  return TRIP_TRANSITIONS[from].includes(to);
}

/** Tenta a transição. Recusa (`ok: false`) em vez de lançar — quem chama decide o que fazer com a recusa. */
export function transitionTrip(from: TripStatus, to: TripStatus): TripTransitionResult {
  if (!canTransitionTrip(from, to)) {
    return { ok: false, from, to, reason: `Transição de corrida inválida: "${from}" → "${to}".` };
  }
  return { ok: true, state: to };
}

/**
 * De onde cada ator pode cancelar. O motorista só aparece a partir de `driver_assigned`: antes
 * disso (`requested`, `searching_driver`) a corrida ainda não tem motorista atribuído — "cancelar"
 * nessas fases, para o motorista, não é uma ação válida (achado A1 da conferência).
 */
const CANCELLABLE_FROM: Readonly<Record<CancelActor, readonly TripStatus[]>> = {
  passenger: ['requested', 'searching_driver', 'driver_assigned', 'driver_en_route', 'driver_arrived'],
  admin: ['requested', 'searching_driver', 'driver_assigned', 'driver_en_route', 'driver_arrived'],
  system: ['requested', 'searching_driver', 'driver_assigned', 'driver_en_route', 'driver_arrived'],
  driver: ['driver_assigned', 'driver_en_route', 'driver_arrived'],
};

/** Fases em que ESTE ator pode cancelar a corrida. */
export function isTripCancellable(from: TripStatus, actor: CancelActor): boolean {
  return CANCELLABLE_FROM[actor].includes(from);
}

/**
 * Cancela a corrida. Motorista em `driver_assigned`/`driver_en_route` volta para a busca
 * (`searching_driver`); motorista em `driver_arrived`, ou qualquer outro ator nos estados em que
 * pode cancelar, mata a corrida (`cancelled`). Motorista em `requested`/`searching_driver` é
 * RECUSADO — não há corrida atribuída a ele ali. Esta é a ÚNICA função que decide esse destino;
 * `PassengerRidePort.cancel` e `DriverTripPort.cancel` do `api-client` chamam por aqui, nunca
 * decidem o destino (ou a permissão) sozinhos.
 */
export function cancelTrip(from: TripStatus, actor: CancelActor): TripTransitionResult {
  if (!isTripCancellable(from, actor)) {
    return { ok: false, from, to: 'cancelled', reason: `"${actor}" não pode cancelar a corrida em "${from}".` };
  }
  const backToSearch = actor === 'driver' && from !== 'driver_arrived';
  return transitionTrip(from, backToSearch ? 'searching_driver' : 'cancelled');
}
