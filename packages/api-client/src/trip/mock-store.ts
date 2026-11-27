/**
 * Estado de CORRIDA em memória, compartilhado pelos mocks de passageiro e motorista. Por padrão
 * cada `createMock*Port` cria o seu (self-contained); quem quiser os dois lados coerentes (um
 * "motorista" de verdade vendo a mesma corrida que o "passageiro") passa a MESMA instância para os
 * dois lados — ver README, "os dois lados com a mesma corrida".
 *
 * Só guarda a BASE comum (status, `seq`, quem está atribuído, o código de embarque) + quem está
 * inscrito no canal de tempo real; dado específico de perfil (resumo do motorista para o passageiro, endereço completo
 * do embarque para o motorista) mora em cada `mock-adapter.ts` — isso é o B4 da conferência da
 * Nova. A validação de CADA transição é sempre do domínio (`cancelTrip`/`transitionTrip`), nunca
 * decidida aqui.
 */
import type { GeoPoint, TripId, TripStatus } from '@vuumbora/domain';
import type { TripBaseSnapshot, TripEvent } from './types';

interface TripRecord {
  status: TripStatus;
  seq: number;
  assignedDriverId?: string;
  /** Código de embarque (D-12). Fora de `TripStoreRecord`/`snapshot()` de propósito: ver `pickupCode()`. */
  pickupCode?: string;
  readonly subscribers: Set<(event: TripEvent) => void>;
}

/**
 * Fases em que a corrida TEM (ou teve) motorista atribuído. Fora destas, `assignedDriverId` é
 * limpo (A2/A3) — é assim que a VOLTA para `searching_driver`/`requested` esquece o motorista
 * antigo. `cancelled` entra aqui (achado R1 da reconferência da Nova,
 * `docs/contratos/conferencia-f08-nova.md`): quando é o passageiro, o admin ou o sistema quem
 * cancela (não o motorista voltando a busca), a corrida MORRE com o motorista ainda atribuído —
 * ele precisa continuar vendo o desfecho (`status()` não pode virar 404, e o `subscribe` dele tem
 * que entregar o evento terminal). Sem isso, `setStatus` para `cancelled` limpava
 * `assignedDriverId` e o motorista atribuído ficava sabendo do cancelamento do mesmo jeito que um
 * estranho: 404.
 */
export const DRIVER_ASSIGNED_STATUSES: ReadonlySet<TripStatus> = new Set([
  'driver_assigned',
  'driver_en_route',
  'driver_arrived',
  'in_progress',
  'completed',
  'cancelled',
]);

export interface TripStoreRecord {
  readonly status: TripStatus;
  readonly seq: number;
  readonly assignedDriverId?: string;
}

export interface TripStore {
  create(tripId: TripId, status: TripStatus): void;
  get(tripId: TripId): TripStoreRecord | undefined;
  /**
   * Aplica uma mudança de status JÁ VALIDADA pelo domínio e notifica quem está inscrito.
   * `assignedDriverId`: passe o id do motorista ao atribuir (ex.: `accept` bem-sucedido). Sem essa
   * passagem, o registro limpa `assignedDriverId` se o novo status não tem motorista (A2 — a volta
   * para a busca, ou a corrida cancelada/falha, limpa quem estava atribuído); se o novo status TEM
   * motorista e nenhum id foi passado, o atribuído anterior é mantido (ex.: `driver_en_route` depois
   * de `driver_assigned`, sem reatribuir).
   */
  setStatus(tripId: TripId, status: TripStatus, assignedDriverId?: string): void;
  /**
   * Código de embarque da corrida (D-12): é estado da CORRIDA no servidor, não dado de um perfil,
   * por isso mora aqui e não num `Map` de cada mock. Com a store compartilhada, o código que o
   * passageiro vê é exatamente o que o `start` do motorista confere (fonte única, mesma lição do
   * R2: dado derivado nunca vive numa cópia à parte). Quem gera é o mock que cria a corrida
   * (`request` do passageiro; `offer` do motorista quando a corrida ainda não tem código).
   *
   * Fica FORA de `get()`/`snapshot()` de propósito: nenhum snapshot montado a partir do registro
   * carrega o código sem alguém pedir por ele com este nome. Só o snapshot do passageiro pede, e
   * só nas fases de `isPickupCodeVisible`.
   */
  setPickupCode(tripId: TripId, code: string): void;
  pickupCode(tripId: TripId): string | undefined;
  /** Emite um ping de localização para quem está inscrito (não muda o status, não cria `seq` novo). */
  emitLocation(tripId: TripId, point: GeoPoint, extra?: { readonly heading?: number; readonly at?: string }): void;
  /**
   * Assina eventos da corrida. Entrega IMEDIATAMENTE um evento `status` com o estado atual (B5) —
   * quem assina sempre tem um ponto de partida, mesmo que a corrida já tenha avançado antes.
   */
  subscribe(tripId: TripId, onEvent: (event: TripEvent) => void): () => void;
  snapshot(tripId: TripId): TripBaseSnapshot | undefined;
}

export function createTripStore(clock: () => number = Date.now): TripStore {
  const trips = new Map<TripId, TripRecord>();

  function statusEvent(record: TripRecord): TripEvent {
    return { type: 'status', seq: record.seq, sentAt: new Date(clock()).toISOString(), status: record.status };
  }

  function notify(record: TripRecord, event: TripEvent): void {
    for (const handler of record.subscribers) handler(event);
  }

  return {
    create(tripId, status) {
      trips.set(tripId, { status, seq: 0, subscribers: new Set() });
    },
    get(tripId) {
      const record = trips.get(tripId);
      if (!record) return undefined;
      return record.assignedDriverId
        ? { status: record.status, seq: record.seq, assignedDriverId: record.assignedDriverId }
        : { status: record.status, seq: record.seq };
    },
    setStatus(tripId, status, assignedDriverId) {
      const record = trips.get(tripId);
      if (!record) return;
      record.status = status;
      record.seq += 1;
      if (assignedDriverId !== undefined) {
        record.assignedDriverId = assignedDriverId;
      } else if (!DRIVER_ASSIGNED_STATUSES.has(status)) {
        delete record.assignedDriverId;
      }
      notify(record, statusEvent(record));
    },
    setPickupCode(tripId, code) {
      const record = trips.get(tripId);
      if (record) record.pickupCode = code;
    },
    pickupCode(tripId) {
      return trips.get(tripId)?.pickupCode;
    },
    emitLocation(tripId, point, extra) {
      const record = trips.get(tripId);
      if (!record) return;
      const event: TripEvent = {
        type: 'location',
        seq: record.seq,
        sentAt: new Date(clock()).toISOString(),
        point,
        at: extra?.at ?? new Date(clock()).toISOString(),
        ...(extra?.heading !== undefined ? { heading: extra.heading } : {}),
      };
      notify(record, event);
    },
    subscribe(tripId, onEvent) {
      const record = trips.get(tripId);
      if (!record) return () => {};
      record.subscribers.add(onEvent);
      onEvent(statusEvent(record)); // B5: ressincronização mora na porta — entrega o ponto de partida já na assinatura
      return () => record.subscribers.delete(onEvent);
    },
    snapshot(tripId) {
      const record = trips.get(tripId);
      return record ? { tripId, status: record.status, seq: record.seq } : undefined;
    },
  };
}
