import type { ApproximatePlace, Money, TripId } from '@vuumbora/domain';
import type { DriverTripHistoryEntry } from '@vuumbora/api-client/driver';

/**
 * Dados de EXEMPLO do histórico do motorista (M12) — tipados com o contrato real do
 * `api-client` (`DriverTripHistoryEntry`, acréscimo PP-12), mas sem nenhuma chamada de rede: os
 * apps ainda não fazem rede de verdade (nem este nem o `historyPort` do mock-adapter está
 * amarrado a uma tela ainda). Quando o Vega publicar `GET /v1/driver/trips`, troca-se só esta
 * função por uma chamada real — a tela (`historico.tsx`) já lê o tipo certo.
 *
 * Datas calculadas em RELAÇÃO a agora (nunca fixas): a tela agrupa por dia ("Hoje"/"Ontem"), e
 * uma data fixa envelheceria a cada captura futura.
 */
function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function place(neighborhood: string): ApproximatePlace {
  return { neighborhood, approximatePoint: { latitude: -5.79, longitude: -35.21 } };
}

function money(amountCents: number): Money {
  return { amountCents, currency: 'BRL' };
}

export const MOCK_DRIVER_TRIP_HISTORY: readonly DriverTripHistoryEntry[] = [
  {
    tripId: 'trip-h1' as TripId,
    status: 'completed',
    assignedAt: hoursAgo(2.35),
    endedAt: hoursAgo(2.1),
    pickup: place('Lagoa Nova'),
    destination: place('Tirol'),
    categoryId: 'vuumbora',
    distanceM: 4800,
    durationS: 1140,
    payout: money(1890),
  },
  {
    tripId: 'trip-h2' as TripId,
    status: 'completed',
    assignedAt: hoursAgo(2.95),
    endedAt: hoursAgo(2.6),
    pickup: place('Petrópolis'),
    destination: place('Tirol'),
    categoryId: 'vuumbora',
    distanceM: 3100,
    durationS: 780,
    payout: money(1250),
  },
  // Texto longo (ficha §5 "Texto longo"): bairros compridos + valor de 4 dígitos.
  {
    tripId: 'trip-h3' as TripId,
    status: 'completed',
    assignedAt: hoursAgo(5.4),
    endedAt: hoursAgo(5.1),
    pickup: place('Parque das Nações'),
    destination: place('Cidade da Esperança'),
    categoryId: 'conforto',
    distanceM: 9600,
    durationS: 1980,
    payout: money(123456),
  },
  {
    tripId: 'trip-h4' as TripId,
    status: 'completed',
    assignedAt: hoursAgo(27.4),
    endedAt: hoursAgo(27.0),
    pickup: place('Capim Macio'),
    destination: place('Alecrim'),
    categoryId: 'conforto',
    distanceM: 6200,
    durationS: 1380,
    payout: money(1990),
  },
  // Cancelada, sem motorista a favor (decisão 15 em aberto): `payout` ausente, nunca "R$ 0,00".
  {
    tripId: 'trip-h5' as TripId,
    status: 'cancelled',
    assignedAt: hoursAgo(28.2),
    endedAt: hoursAgo(28.1),
    pickup: place('Candelária'),
    destination: place('Ponta Negra'),
    categoryId: 'vuumbora',
    distanceM: 1800,
    durationS: 240,
  },
];

export interface TripHistoryGroup {
  readonly key: string;
  readonly label: string;
  readonly entries: readonly DriverTripHistoryEntry[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY_MS);
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  const label = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Mais recente primeiro, agrupado por dia-calendário de `endedAt` — a ordem de entrada já é essa (mock). */
export function groupTripsByDay(entries: readonly DriverTripHistoryEntry[]): readonly TripHistoryGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, DriverTripHistoryEntry[]>();
  for (const entry of entries) {
    const key = dayKey(entry.endedAt);
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      byKey.set(key, [entry]);
      order.push(key);
    }
  }
  return order.map((key) => {
    const bucket = byKey.get(key);
    // `order` só ganha uma chave quando `byKey.set` acontece — a entrada sempre existe.
    const entries2 = bucket ?? [];
    return { key, label: dayLabel(entries2[0]?.endedAt ?? new Date().toISOString()), entries: entries2 };
  });
}

export type TripHistoryPeriod = 'hoje' | 'semana' | 'mes' | 'todos';

/** Janela do filtro (SegmentedControl), sempre sobre `endedAt`. */
export function filterTripsByPeriod(entries: readonly DriverTripHistoryEntry[], period: TripHistoryPeriod): readonly DriverTripHistoryEntry[] {
  if (period === 'todos') return entries;
  const windowDays = period === 'hoje' ? 1 : period === 'semana' ? 7 : 30;
  const cutoff = startOfDay(new Date()) - (windowDays - 1) * DAY_MS;
  return entries.filter((entry) => new Date(entry.endedAt).getTime() >= cutoff);
}

export function formatTripTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatTripRoute(entry: DriverTripHistoryEntry): string {
  return `${entry.pickup.neighborhood} → ${entry.destination.neighborhood}`;
}

export function findMockTrip(tripId: string | undefined): DriverTripHistoryEntry | undefined {
  return MOCK_DRIVER_TRIP_HISTORY.find((entry) => entry.tripId === tripId);
}

/**
 * Nome de exibição por categoria — os mesmos `key`/nomes canônicos de `ride_categories`
 * (`docs/plano-sistema-dados.md`; replicados aqui, não importados do passageiro:
 * `check-boundaries.mjs` proíbe import cruzado entre os dois apps). Categoria desconhecida cai no
 * próprio id, nunca quebra a tela.
 */
const CATEGORY_LABEL: Readonly<Record<string, string>> = {
  vuumbora: 'VuumBora',
  conforto: 'Conforto',
  motorista_mulher: 'Motorista mulher',
  entrega: 'Entrega',
  pet: 'Pet',
};

export function tripCategoryLabel(categoryId: string): string {
  return CATEGORY_LABEL[categoryId] ?? categoryId;
}

export function formatTripDistanceKm(distanceM: number): string {
  return `${(distanceM / 1000).toFixed(1).replace('.', ',')} km`;
}

/** "10:12 → 10:31" — hora de embarque (`assignedAt`, aproximação razoável de início) e de fim. */
export function formatTripTimeRange(entry: DriverTripHistoryEntry): string {
  return `${formatTripTime(entry.assignedAt)} → ${formatTripTime(entry.endedAt)}`;
}

/** Código público "legível" (nunca o `tripId` cru na tela — ele é um UUID interno). */
export function tripPublicCode(tripId: string): string {
  return `VB-${tripId.slice(-4).toUpperCase()}`;
}

export function formatTripDateLabel(iso: string): string {
  const label = new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
  return label.replace('.', '');
}
