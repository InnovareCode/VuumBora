/**
 * Regra PURA de qual categoria fica escolhida quando chega uma cotação nova (P05/P06). Sem React, sem store, sem rede:
 * é o que `test/quoteSelection.test.mjs` prova com `node --test`.
 *
 * Achado da Íris na G6 (9f6f94c): se a categoria escolhida sumia da cotação nova (desligada entre a cotação e o pedido),
 * o app caía na 1ª da lista SEM AVISAR — na P06, "VuumBora R$ 25,76" virava "Conforto R$ 35,96" e o segundo toque pedia
 * Conforto. O preço cobrado mudava sem a pessoa escolher.
 *
 * Regra:
 * - a escolha anterior ainda está na cotação → continua;
 * - havia escolha (ou ela já tinha sumido antes) e ela NÃO está na cotação → nenhuma categoria + aviso
 *   ("Essa categoria não está mais disponível. Escolha outra."). NUNCA escolhe outra sozinha;
 * - nunca houve escolha (primeira cotação de uma corrida) → a 1ª da cotação, pré-selecionada e À VISTA na P05 antes de
 *   qualquer "Continuar" (ficha P05 §5, "uma pré-selecionada"); cotação vazia → nenhuma, sem aviso.
 */
export interface CategorySelectionState {
  /** `slug` escolhido antes da cotação nova chegar. */
  readonly categoryId: string | undefined;
  /** A escolha anterior já tinha sumido de uma cotação (o aviso está na tela e a pessoa ainda não escolheu outra). */
  readonly categoryUnavailable: boolean;
}

export function selectCategoryAfterQuote(
  previous: CategorySelectionState,
  quotes: readonly { readonly categorySlug: string }[],
): CategorySelectionState {
  if (previous.categoryId !== undefined) {
    return quotes.some((quote) => quote.categorySlug === previous.categoryId)
      ? { categoryId: previous.categoryId, categoryUnavailable: false }
      : { categoryId: undefined, categoryUnavailable: true };
  }
  if (previous.categoryUnavailable) return { categoryId: undefined, categoryUnavailable: true };
  return { categoryId: quotes[0]?.categorySlug, categoryUnavailable: false };
}
