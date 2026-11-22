import type { Money } from '@vuumbora/domain';

/**
 * Comprovante de corrida — 100% FABRICADO (sem motor de preço real, sem `PaymentPort`
 * implementado). Formato PROVISÓRIO, não é contrato de backend: existe só pra a P10 ter
 * algo plausível pra mostrar com `MockBadge`. A composição (tarifa por distância/tempo/
 * taxa de serviço) é ilustrativa, não reflete uma regra de precificação real.
 *
 * F08b: `baseFare` é a tarifa da cotação REALMENTE usada no pedido (`RideRequestState.requestedCategory`,
 * `CategoryQuote.estimate.total`) — não mais reconstruída a partir de um texto local
 * (`mockRideCategories.ts` não existe mais; virou `rideCategoryDisplay.ts`, só nome/ícone). Isso garante
 * que o recibo sempre mostra o preço da categoria que de fato foi pedida, mesmo que a pessoa troque de
 * categoria selecionada DEPOIS de pedir (não muda o que já foi pedido).
 */
export interface TripReceiptLine {
  readonly label: string;
  readonly amount: Money;
}

export interface TripReceipt {
  readonly total: Money;
  readonly lines: readonly TripReceiptLine[];
}

const SERVICE_FEE_CENTS = 190;

function money(amountCents: number): Money {
  return { amountCents, currency: 'BRL' };
}

/** Monta o comprovente fabricado a partir da tarifa de fato cotada/pedida. */
export function buildMockReceipt(baseFare: Money): TripReceipt {
  const distanceCents = Math.round(baseFare.amountCents * 0.55);
  const timeCents = baseFare.amountCents - distanceCents;
  const totalCents = baseFare.amountCents + SERVICE_FEE_CENTS;

  return {
    total: money(totalCents),
    lines: [
      { label: 'Tarifa por distância', amount: money(distanceCents) },
      { label: 'Tarifa por tempo', amount: money(timeCents) },
      { label: 'Taxa de serviço', amount: money(SERVICE_FEE_CENTS) },
    ],
  };
}
