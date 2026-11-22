/**
 * Estado de CORRIDA em memória, compartilhado pelos mocks de passageiro e motorista. Por padrão
 * cada `createMock*Port` cria o seu (self-contained, como hoje); quem quiser os dois lados
 * coerentes (um "motorista" de verdade vendo a mesma corrida que o "passageiro") passa a MESMA
 * instância para os dois lados — ver README, "trocar o simulador por este mock".
 *
 * Só guarda o que a UI precisa projetar (`TripSnapshot`) + quem está inscrito no canal de tempo
 * real; a validação de CADA transição é sempre do domínio (`cancelTrip`/`transitionTrip`), nunca
 * decidida aqui.
 */
import type { GeoPoint, TripId, TripStatus } from '@vuumbora/domain';
import type { TripDriverSummary, TripEvent, TripSnapshot } from './types';

interface TripRecord {
  status: TripStatus;
  driver?: TripDriverSummary;
  seq: number;
  readonly subscribers: Set<(event: TripEvent) => void>;
}

export interface TripStore {
  create(tripId: TripId, status: TripStatus): void;
  get(tripId: TripId): { readonly status: TripStatus; readonly driver?: TripDriverSummary } | undefined;
  /** Aplica uma mudança de status JÁ VALIDADA pelo domínio e notifica quem está inscrito. */
  setStatus(tripId: TripId, status: TripStatus, driver?: TripDriverSummary): void;
  /** Emite um ping de localização para quem está inscrito (não muda o status). */
  emitLocation(tripId: TripId, point: GeoPoint): void;
  subscribe(tripId: TripId, onEvent: (event: TripEvent) => void): () => void;
  snapshot(tripId: TripId): TripSnapshot | undefined;
}

export function createTripStore(clock: () => number = Date.now): TripStore {
  const trips = new Map<TripId, TripRecord>();

  function emit(record: TripRecord, build: (seq: number, sentAt: string) => TripEvent): void {
    record.seq += 1;
    const event = build(record.seq, new Date(clock()).toISOString());
    for (const handler of record.subscribers) handler(event);
  }

  return {
    create(tripId, status) {
      trips.set(tripId, { status, seq: 0, subscribers: new Set() });
    },
    get(tripId) {
      const record = trips.get(tripId);
      if (!record) return undefined;
      return record.driver ? { status: record.status, driver: record.driver } : { status: record.status };
    },
    setStatus(tripId, status, driver) {
      const record = trips.get(tripId);
      if (!record) return;
      record.status = status;
      if (driver) record.driver = driver;
      const currentDriver = record.driver;
      emit(record, (seq, sentAt) =>
        currentDriver ? { type: 'status', seq, sentAt, status, driver: currentDriver } : { type: 'status', seq, sentAt, status },
      );
    },
    emitLocation(tripId, point) {
      const record = trips.get(tripId);
      if (!record) return;
      emit(record, (seq, sentAt) => ({ type: 'location', seq, sentAt, point }));
    },
    subscribe(tripId, onEvent) {
      const record = trips.get(tripId);
      if (!record) return () => {};
      record.subscribers.add(onEvent);
      return () => record.subscribers.delete(onEvent);
    },
    snapshot(tripId) {
      const record = trips.get(tripId);
      if (!record) return undefined;
      return record.driver ? { tripId, status: record.status, driver: record.driver } : { tripId, status: record.status };
    },
  };
}
