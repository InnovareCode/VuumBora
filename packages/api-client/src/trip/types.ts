/**
 * Tipos de CORRIDA compartilhados por passageiro e motorista (plano-sistema.md §6.2–§6.4;
 * plano-sistema-arquitetura.md §5.2, §5.5). Mora na raiz do `api-client` — não em `../passenger`
 * nem `../driver` — pelo mesmo motivo de `@vuumbora/domain/trip-lifecycle`: as duas pontas
 * precisam da MESMA forma de evento, e nenhum perfil pode importar o subcaminho do outro
 * (`scripts/check-boundaries.mjs`).
 */
import type { CancelActor, GeoPoint, TripId, TripStatus } from '@vuumbora/domain';

export type { CancelActor };

export interface TripDriverSummary {
  readonly driverId: string;
  readonly firstName: string;
  readonly plate: string;
  readonly point?: GeoPoint;
}

/** Projeção da corrida para a UI — não é o `trip_events` inteiro, só o estado atual (REST é a verdade). */
export interface TripSnapshot {
  readonly tripId: TripId;
  readonly status: TripStatus;
  readonly driver?: TripDriverSummary;
}

/**
 * Mensagem do canal de tempo real (§5.5): sempre `type` + `seq` crescente por corrida + `sentAt`.
 * A UI descarta `seq` menor que o último visto e, ao detectar buraco ou reconectar, chama `status()`.
 */
export type TripEvent =
  | { readonly type: 'status'; readonly seq: number; readonly sentAt: string; readonly status: TripStatus; readonly driver?: TripDriverSummary }
  | { readonly type: 'location'; readonly seq: number; readonly sentAt: string; readonly point: GeoPoint };

/**
 * Assina eventos de uma corrida. Sem `Result`: é um stream, não uma chamada — "WS avisa, REST é a
 * verdade" (plano-apps-execucao.md §2.1): quem quer saber se a assinatura "deu certo" chama
 * `status()`. Corrida inexistente na assinatura é silenciosa (nenhum evento chega nunca).
 */
export interface TripRealtimePort {
  /** Devolve a função de cancelamento (unsubscribe). Chamar duas vezes é inofensivo. */
  subscribe(tripId: TripId, onEvent: (event: TripEvent) => void): () => void;
}
