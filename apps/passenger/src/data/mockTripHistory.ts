import type { Money } from '@vuumbora/domain';
import type { TripReceipt } from './mockTripReceipt';

export type TripHistoryStatus = 'completed' | 'cancelled';

/** Filtro da P11 — "Mês atual" é só `currentMonth`; "Anteriores" é só `previous`. */
export type TripHistoryPeriod = 'currentMonth' | 'previous';

export interface MockTripHistoryEntry {
  readonly id: string;
  readonly destinationLabel: string;
  /** Rótulo de data já formatado (ex.: "Hoje, 09:42") — DEMONSTRAÇÃO, sem relógio real. */
  readonly dateLabel: string;
  readonly period: TripHistoryPeriod;
  readonly status: TripHistoryStatus;
  readonly originAddress: string;
  readonly destinationAddress: string;
  readonly driverName: string;
  readonly vehicleLabel: string;
  readonly paymentMethodLabel: string;
  readonly distanceLabel: string;
  readonly durationLabel: string;
  /** Mesmo formato do comprovante da P10 (`buildMockReceipt`) — `total` bate com o valor da lista. */
  readonly receipt: TripReceipt;
}

function money(amountCents: number): Money {
  return { amountCents, currency: 'BRL' };
}

const ORIGIN = 'Ponta Negra, Natal - RN';

/**
 * Histórico 100% FABRICADO (VuumBora_Claude_Design_System/referencias/premium/passageiro/P11-historico.webp):
 * sem `TripHistoryPort` real (pendência para Vega/Cronos). Todas as 5 viagens caem em
 * `currentMonth` de propósito — "Anteriores" fica vazio e é o que exercita o estado
 * vazio da tela com uma conta nova, sem precisar inventar viagem fora da referência.
 */
export const MOCK_TRIP_HISTORY: readonly MockTripHistoryEntry[] = [
  {
    id: 'trip-1',
    destinationLabel: 'Shopping Central',
    dateLabel: 'Hoje, 09:42',
    period: 'currentMonth',
    status: 'completed',
    originAddress: ORIGIN,
    destinationAddress: 'Shopping Central, Av. Senador Salgado Filho, 2234 - Candelária, Natal - RN',
    driverName: 'Ricardo Souza',
    vehicleLabel: 'Chevrolet Onix • Prata • ABC-1D23',
    paymentMethodLabel: 'Cartão de crédito •••• 4521',
    distanceLabel: '4,2 km',
    durationLabel: '12 min',
    receipt: {
      total: money(1490),
      lines: [
        { label: 'Tarifa por distância', amount: money(820) },
        { label: 'Tarifa por tempo', amount: money(480) },
        { label: 'Taxa de serviço', amount: money(190) },
      ],
    },
  },
  {
    id: 'trip-2',
    destinationLabel: 'Aeroporto',
    dateLabel: 'Ontem, 18:20',
    period: 'currentMonth',
    status: 'completed',
    originAddress: ORIGIN,
    destinationAddress: 'Aeroporto Internacional Augusto Severo, São Gonçalo do Amarante - RN',
    driverName: 'Marcos Vieira',
    vehicleLabel: 'Hyundai HB20 • Branco • XYZ-2E45',
    paymentMethodLabel: 'Pix',
    distanceLabel: '28,6 km',
    durationLabel: '34 min',
    receipt: {
      total: money(4250),
      lines: [
        { label: 'Tarifa por distância', amount: money(2800) },
        { label: 'Tarifa por tempo', amount: money(1260) },
        { label: 'Taxa de serviço', amount: money(190) },
      ],
    },
  },
  {
    id: 'trip-3',
    destinationLabel: 'Shopping Norte',
    dateLabel: '12 Nov, 14:10',
    period: 'currentMonth',
    status: 'completed',
    originAddress: ORIGIN,
    destinationAddress: 'Shopping Norte, Natal - RN',
    driverName: 'Juliana Alves',
    vehicleLabel: 'Fiat Argo • Cinza • JKL-3F67',
    paymentMethodLabel: 'Dinheiro',
    distanceLabel: '5,1 km',
    durationLabel: '15 min',
    receipt: {
      total: money(1790),
      lines: [
        { label: 'Tarifa por distância', amount: money(1000) },
        { label: 'Tarifa por tempo', amount: money(600) },
        { label: 'Taxa de serviço', amount: money(190) },
      ],
    },
  },
  {
    id: 'trip-4',
    destinationLabel: 'Universidade',
    dateLabel: '10 Nov, 07:55',
    period: 'currentMonth',
    status: 'completed',
    originAddress: ORIGIN,
    destinationAddress: 'UFRN, Natal - RN',
    driverName: 'Carlos Eduardo',
    vehicleLabel: 'Renault Kwid • Vermelho • MNO-4G89',
    paymentMethodLabel: 'Cartão de débito •••• 7788',
    distanceLabel: '3,4 km',
    durationLabel: '10 min',
    receipt: {
      total: money(1190),
      lines: [
        { label: 'Tarifa por distância', amount: money(650) },
        { label: 'Tarifa por tempo', amount: money(350) },
        { label: 'Taxa de serviço', amount: money(190) },
      ],
    },
  },
  {
    id: 'trip-5',
    destinationLabel: 'Centro Comercial',
    dateLabel: '08 Nov, 19:36',
    period: 'currentMonth',
    status: 'completed',
    originAddress: ORIGIN,
    destinationAddress: 'Centro Comercial, Natal - RN',
    driverName: 'Patrícia Lima',
    vehicleLabel: 'Volkswagen Gol • Prata • PQR-5H01',
    paymentMethodLabel: 'Pix',
    distanceLabel: '4,8 km',
    durationLabel: '14 min',
    receipt: {
      total: money(1680),
      lines: [
        { label: 'Tarifa por distância', amount: money(900) },
        { label: 'Tarifa por tempo', amount: money(590) },
        { label: 'Taxa de serviço', amount: money(190) },
      ],
    },
  },
];

export function findMockTripHistoryEntry(id: string | undefined): MockTripHistoryEntry | undefined {
  return MOCK_TRIP_HISTORY.find((trip) => trip.id === id);
}
