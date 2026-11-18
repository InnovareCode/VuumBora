export type RideCategoryKey = 'economico' | 'comfort' | 'plus';

export interface MockRideCategory {
  readonly key: RideCategoryKey;
  readonly name: string;
  /** Faixa de tempo estimada — DEMONSTRAÇÃO (especificacoes/PASSAGEIRO.md: sem motor de roteirização real). */
  readonly etaLabel: string;
  /** Preço estimado, nunca final — DEMONSTRAÇÃO (sem motor de preço real). */
  readonly priceLabel: string;
}

/**
 * Categorias de viagem. Única fonte para Home (P03) e Confirmação (P06), para as duas
 * telas sempre mostrarem o mesmo nome/preço/ETA da categoria escolhida.
 */
export const MOCK_RIDE_CATEGORIES: readonly MockRideCategory[] = [
  { key: 'economico', name: 'Vuum Econômico', etaLabel: '4–6 min', priceLabel: 'R$ 23,90' },
  { key: 'comfort', name: 'Vuum Comfort', etaLabel: '3–5 min', priceLabel: 'R$ 29,90' },
  { key: 'plus', name: 'Vuum Plus', etaLabel: '3–5 min', priceLabel: 'R$ 37,90' },
];

export const DEFAULT_RIDE_CATEGORY_KEY: RideCategoryKey = 'economico';

export function findMockRideCategory(key: string | undefined): MockRideCategory | undefined {
  return MOCK_RIDE_CATEGORIES.find((category) => category.key === key);
}
