/**
 * `slug` das cinco categorias do lançamento (docs/plano-sistema-dados.md, tabela
 * `ride_categories`) — mesmos identificadores que a API vai usar, para a troca do mock pelo
 * contrato real não renomear nada.
 */
export type RideCategoryKey = 'vuumbora' | 'conforto' | 'motorista_mulher' | 'entrega' | 'pet';

export interface MockRideCategory {
  readonly key: RideCategoryKey;
  readonly name: string;
  /**
   * `base_tier` = o próprio veículo (VuumBora, Conforto: mostram a ilustração do carro);
   * `modifier` = camada por cima do veículo (Motorista mulher, Entrega, Pet: mostram um símbolo,
   * porque não existe "carro Pet"). Espelha `ride_categories.kind` do plano de dados.
   */
  readonly kind: 'base_tier' | 'modifier';
  /** Faixa de tempo estimada — DEMONSTRAÇÃO (especificacoes/PASSAGEIRO.md: sem motor de roteirização real). */
  readonly etaLabel: string;
  /** Preço estimado, nunca final — DEMONSTRAÇÃO (sem motor de preço real). Valor inventado, não é tarifa. */
  readonly priceLabel: string;
}

/**
 * Categorias de viagem decididas pelo dono em 20/11/2026 (VuumBora, Conforto, Motorista mulher,
 * Entrega, Pet). Única fonte para Home (P03) e Confirmação (P06), para as duas telas sempre
 * mostrarem o mesmo nome/preço/ETA da categoria escolhida.
 *
 * Todos os preços e tempos abaixo são ESTIMATIVA DE DEMONSTRAÇÃO inventada para a tela ter o que
 * mostrar — nenhum deles vem de tarifa, motor de preço ou disponibilidade real, e as telas que os
 * mostram carregam `MockBadge`. Motorista mulher/Pet/Entrega têm espera maior de propósito
 * (menos motoristas elegíveis — docs/plano-sistema-arquitetura.md §5.3).
 *
 * Entrega ainda cai no mesmo fluxo de pedido de passageiro: o fluxo próprio (destinatário, código
 * de entrega) não existe, e a categoria só liga depois de parecer jurídico (risco R9).
 */
export const MOCK_RIDE_CATEGORIES: readonly MockRideCategory[] = [
  { key: 'vuumbora', name: 'VuumBora', kind: 'base_tier', etaLabel: '4–6 min', priceLabel: 'R$ 23,90' },
  { key: 'conforto', name: 'Conforto', kind: 'base_tier', etaLabel: '3–5 min', priceLabel: 'R$ 29,90' },
  { key: 'motorista_mulher', name: 'Motorista mulher', kind: 'modifier', etaLabel: '6–9 min', priceLabel: 'R$ 25,90' },
  { key: 'entrega', name: 'Entrega', kind: 'modifier', etaLabel: '8–12 min', priceLabel: 'R$ 14,90' },
  { key: 'pet', name: 'Pet', kind: 'modifier', etaLabel: '7–10 min', priceLabel: 'R$ 31,90' },
];

export const DEFAULT_RIDE_CATEGORY_KEY: RideCategoryKey = 'vuumbora';

export function findMockRideCategory(key: string | undefined): MockRideCategory | undefined {
  return MOCK_RIDE_CATEGORIES.find((category) => category.key === key);
}
