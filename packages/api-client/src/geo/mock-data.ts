/**
 * Dados de EXEMPLO do M4 (fatia K0 do `docs/plano-m3-m4.md`), compartilhados pelo mock do passageiro
 * (`createMockPassengerGeo`, `./passenger`) e pelo mock de tarifa do painel (`createMockFareAdmin`,
 * `./admin`). Caminho neutro: nenhum perfil importa o do outro.
 *
 * - **Área:** polígono ILUSTRATIVO da Grande Natal (inclui o aeroporto em São Gonçalo do Amarante e
 *   Nova Parnamirim, decisão do dono item 16). O polígono real é semente da migração G1.
 * - **Categorias:** as 5 do lançamento; Motorista mulher, Entrega e Pet nascem DESLIGADAS (D-08, D-09).
 * - **Tarifa:** UMA versão de TESTE (`isTest: true`). Os números não são recomendação de preço
 *   (decisão 7 em aberto); com `allowTestFares: false` o mock responde `503 fare_not_configured` (N8).
 */
import type { ServiceArea } from '@vuumbora/domain';

export const MOCK_SERVICE_AREA: ServiceArea = {
  areaId: 'natal-mock',
  name: 'Grande Natal (área ilustrativa)',
  polygon: {
    type: 'Polygon',
    coordinates: [
      [
        [-35.45, -5.62],
        [-35.2, -5.62],
        [-35.13, -5.75],
        [-35.14, -5.9],
        [-35.17, -6.02],
        [-35.3, -6.05],
        [-35.45, -5.95],
        [-35.5, -5.75],
        [-35.45, -5.62],
      ],
    ],
  },
  bbox: [-35.5, -6.05, -35.13, -5.62],
};

/** Uma categoria como o mock guarda (o contrato só devolve as ligadas, sem `enabled`). */
export interface MockRideCategory {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly seats: number;
  readonly enabled: boolean;
}

export const MOCK_RIDE_CATEGORIES: readonly MockRideCategory[] = [
  { slug: 'vuumbora', name: 'VuumBora', description: 'Carro para o dia a dia.', seats: 4, enabled: true },
  { slug: 'conforto', name: 'Conforto', description: 'Carro mais espaçoso.', seats: 4, enabled: true },
  { slug: 'motorista_mulher', name: 'Motorista mulher', description: 'Corrida com motorista mulher.', seats: 4, enabled: false },
  { slug: 'entrega', name: 'Entrega', description: 'Envio de objetos.', seats: 0, enabled: false },
  { slug: 'pet', name: 'Pet', description: 'Corrida com seu animal.', seats: 4, enabled: false },
];

/** Versão de tarifa de TESTE (centavos). Mesma forma de `CategoryFareRates` (`./admin`). */
export const MOCK_TEST_FARE_VERSION = {
  fareVersionId: 'fare-test-1',
  isTest: true,
  validFrom: '2026-11-27T00:00:00.000Z',
  note: 'Tarifa de teste do mock (decisão 7 em aberto).',
  categories: [
    { categorySlug: 'vuumbora', baseCents: 400, perKmCents: 150, perMinuteCents: 25, minimumFareCents: 800 },
    { categorySlug: 'conforto', baseCents: 550, perKmCents: 210, perMinuteCents: 35, minimumFareCents: 1100 },
    { categorySlug: 'motorista_mulher', baseCents: 400, perKmCents: 150, perMinuteCents: 25, minimumFareCents: 800 },
    { categorySlug: 'pet', baseCents: 500, perKmCents: 170, perMinuteCents: 28, minimumFareCents: 950 },
  ],
} as const;
