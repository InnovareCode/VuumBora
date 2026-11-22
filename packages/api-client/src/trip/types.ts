/**
 * Tipos de CORRIDA compartilhados por passageiro e motorista (plano-sistema-arquitetura.md §6.2
 * [passageiro], §6.3 [motorista], §6.4 [tempo real]; `docs/plano-sistema.md` §5.2–§5.6). Mora na
 * raiz do `api-client` — não em `../passenger` nem `../driver` — pelo mesmo motivo de
 * `@vuumbora/domain/trip-lifecycle`: as duas pontas precisam da MESMA forma de evento, e nenhum
 * perfil pode importar o subcaminho do outro (`scripts/check-boundaries.mjs`).
 *
 * **B4 (conferência da Nova):** o snapshot da corrida NÃO é um tipo único — cada perfil vê campos
 * diferentes (o motorista vê o passageiro, não o contrário; o passageiro vê o motorista, não o
 * contrário). Aqui só a BASE comum (`TripBaseSnapshot`); `PassengerTripSnapshot` mora em
 * `../passenger/types.ts`, `DriverTripSnapshot` em `../driver/types.ts`.
 */
import type { CancelActor, GeoPoint, TripId, TripStatus } from '@vuumbora/domain';

export type { CancelActor };

/** O que os dois perfis sempre têm, não importa quem pergunta. */
export interface TripBaseSnapshot {
  readonly tripId: TripId;
  readonly status: TripStatus;
  /** Conta só mudança de ESTADO (B5) — vem também aqui, não só no evento, pra dar ponto de partida depois de ressincronizar. */
  readonly seq: number;
}

/**
 * Evento do canal de tempo real (§5.5/B5). `seq` de `status` é o que mudou (incrementa); `seq` de
 * `location` é o do ESTADO EM VIGOR — a posição não é um novo estado, não cria `seq` novo. `at` é o
 * instante da leitura do GPS (pode chegar atrasado); `sentAt` é quando o servidor mandou. Toda
 * mensagem tem `seq` (§6.4), mas só o de `status` cresce.
 */
export type TripEvent =
  | { readonly type: 'status'; readonly seq: number; readonly sentAt: string; readonly status: TripStatus }
  | {
      readonly type: 'location';
      readonly seq: number;
      readonly sentAt: string;
      readonly point: GeoPoint;
      readonly heading?: number;
      /** ISO 8601 — instante da leitura do GPS (pode chegar atrasado por rede). */
      readonly at: string;
    };

/**
 * Assina eventos de uma corrida. **Ressincronização mora na PORTA (B5), não em cada tela:** ao
 * assinar, entrega IMEDIATAMENTE um evento `status` com o estado atual e o `seq` do snapshot —
 * quem assina nunca fica sem saber o ponto de partida, mesmo que a corrida já tenha avançado antes
 * da assinatura. Sem `Result`: é um stream — "WS avisa, REST é a verdade". Corrida inexistente, ou
 * não mais visível a quem assina (A3 — ver `DriverTripPort`), não entrega nada.
 */
export interface TripRealtimePort {
  /** Devolve a função de cancelamento (unsubscribe). Chamar duas vezes é inofensivo. */
  subscribe(tripId: TripId, onEvent: (event: TripEvent) => void): () => void;
}
