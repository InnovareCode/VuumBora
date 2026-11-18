import type { Money } from '@vuumbora/domain';

/** Formatação de exibição — não é lógica de negócio (o preço/tarifa real fica no backend). */
export function formatMoneyBRL(money: Money): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(money.amountCents / 100);
}
