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
 * Correção registrada no S0 (plano-sistema.md §6.1 e §5.2 do anexo de arquitetura): cancelamento
 * do MOTORISTA depois do aceite (`driver_assigned`, `driver_en_route`) volta a corrida para
 * `searching_driver` — o passageiro não perde o pedido porque o motorista desistiu. Cancelamento
 * do passageiro, admin ou sistema nos MESMOS estados segue matando a corrida (`cancelled`).
 * `driver_arrived` sempre mata, mesmo se for o motorista: nesse ponto o passageiro já está no
 * local do embarque e o contrato não prevê voltar à busca dali.
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

/** Fases em que a corrida ainda pode ser cancelada (por qualquer ator). */
export function isTripCancellable(status: TripStatus): boolean {
  return canTransitionTrip(status, 'cancelled');
}

/**
 * Cancela a corrida. Motorista em `driver_assigned`/`driver_en_route` volta para a busca
 * (`searching_driver`); qualquer outro ator — ou o motorista em outra fase — mata a corrida
 * (`cancelled`). Esta é a ÚNICA função que decide esse destino; `PassengerRidePort.cancel` e
 * `DriverTripPort.cancel` do `api-client` chamam por aqui, nunca decidem o destino sozinhos.
 */
export function cancelTrip(from: TripStatus, actor: CancelActor): TripTransitionResult {
  const backToSearch = actor === 'driver' && (from === 'driver_assigned' || from === 'driver_en_route');
  return transitionTrip(from, backToSearch ? 'searching_driver' : 'cancelled');
}
