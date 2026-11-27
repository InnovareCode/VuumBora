import type { FareQuote, RideCategory } from '@vuumbora/api-client/passenger';
import { formatPriceCents } from '../geo/geoFormat';
import { rideCategoryName } from '../data/rideCategoryDisplay';

/** Preço FECHADO da categoria (D-06), direto da cotação (nunca de um texto local). */
export function formatQuotePrice(quote: FareQuote): string {
  return formatPriceCents(quote.priceCents);
}

/**
 * Nome da categoria: o do servidor (`GET /v1/categories`) quando já chegou; senão o catálogo de exibição local (só
 * nome, sem número nenhum), que cai no próprio `slug` para uma categoria nova.
 */
export function categoryName(slug: string, info: readonly RideCategory[]): string {
  return info.find((category) => category.slug === slug)?.name ?? rideCategoryName(slug);
}

/** Legenda curta da categoria, do servidor. `undefined` se as categorias ainda não chegaram. */
export function categoryDescription(slug: string, info: readonly RideCategory[]): string | undefined {
  return info.find((category) => category.slug === slug)?.description;
}
