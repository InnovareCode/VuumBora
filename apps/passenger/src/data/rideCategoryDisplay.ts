/**
 * Nome de exibição por categoria de corrida — SÓ apresentação (nome, `kind` pra escolher ilustração
 * de veículo ou símbolo). A DISPONIBILIDADE e o preço/tempo vêm sempre da cotação real
 * (`CategoryQuote`, `@vuumbora/api-client/passenger`), nunca de uma lista fixa aqui — decisão do
 * Atlas na F08b: "é a cotação que manda", sem lista própria na tela. Antes deste arquivo existir
 * como catálogo de nomes, ele era `MOCK_RIDE_CATEGORIES`: a lista INTEIRA de categorias que a Home
 * mostrava, sempre, sem checar disponibilidade — foi exatamente essa lista fixa que permitia
 * escolher Entrega/Pet/Motorista mulher mesmo desligadas no mock da porta de corrida (D-08/D-09).
 *
 * Os cinco `key` abaixo são os mesmos identificadores que a API usa (docs/plano-sistema-dados.md,
 * tabela `ride_categories`). Uma categoria que a cotação devolver e que não estiver catalogada aqui
 * cai no FALLBACK de `rideCategoryName`/`rideCategoryKind` (nome = o próprio id, símbolo genérico)
 * — não é erro, é só uma categoria nova que esta tela ainda não conhece.
 */
export type RideCategoryKey = 'vuumbora' | 'conforto' | 'motorista_mulher' | 'entrega' | 'pet';

export interface RideCategoryDisplay {
  readonly name: string;
  /**
   * `base_tier` = o próprio veículo (VuumBora, Conforto: mostram a ilustração do carro);
   * `modifier` = camada por cima do veículo (Motorista mulher, Entrega, Pet: mostram um símbolo,
   * porque não existe "carro Pet"). Espelha `ride_categories.kind` do plano de dados.
   */
  readonly kind: 'base_tier' | 'modifier';
}

const RIDE_CATEGORY_DISPLAY: Readonly<Record<RideCategoryKey, RideCategoryDisplay>> = {
  vuumbora: { name: 'VuumBora', kind: 'base_tier' },
  conforto: { name: 'Conforto', kind: 'base_tier' },
  motorista_mulher: { name: 'Motorista mulher', kind: 'modifier' },
  entrega: { name: 'Entrega', kind: 'modifier' },
  pet: { name: 'Pet', kind: 'modifier' },
};

function knownDisplay(categoryId: string | undefined): RideCategoryDisplay | undefined {
  if (!categoryId) return undefined;
  return Object.prototype.hasOwnProperty.call(RIDE_CATEGORY_DISPLAY, categoryId)
    ? RIDE_CATEGORY_DISPLAY[categoryId as RideCategoryKey]
    : undefined;
}

/** Nome pra exibir; cai no próprio id (sem quebrar a tela) se a cotação devolver uma categoria nova demais pra este catálogo. */
export function rideCategoryName(categoryId: string | undefined): string {
  if (!categoryId) return 'Categoria';
  return knownDisplay(categoryId)?.name ?? categoryId;
}

/** `kind` pra escolher ilustração; cai em `'modifier'` (símbolo, nunca ilustração de veículo) pra uma categoria desconhecida. */
export function rideCategoryKind(categoryId: string | undefined): 'base_tier' | 'modifier' {
  return knownDisplay(categoryId)?.kind ?? 'modifier';
}
