import type { CategoryQuote } from '@vuumbora/api-client/passenger';
import { formatMoneyBRL } from './money';
import { formatEtaMinutes } from './time';

/** Preço estimado da categoria, direto da cotação real (nunca de um texto local). */
export function formatQuotePrice(category: CategoryQuote): string {
  return formatMoneyBRL(category.estimate.total);
}

/** Tempo estimado até o EMBARQUE, direto da cotação real (`pickupEtaS`, em segundos). */
export function formatQuotePickupEta(category: CategoryQuote): string {
  return formatEtaMinutes(Math.round(category.pickupEtaS / 60));
}
