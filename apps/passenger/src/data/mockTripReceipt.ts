import type { Money } from '@vuumbora/domain';

/**
 * Comprovante da corrida SIMULADA (sem `PaymentPort`, sem cobrança real). Formato PROVISÓRIO, não é contrato de backend:
 * existe só para a P10 ter o que mostrar, com `MockBadge`.
 *
 * Fatia G6: o total é o preço da cotação REALMENTE pedida (`RideRequestState.requestedQuote.priceCents`). O preço é
 * fechado na cotação (D-06), então o valor final é o mesmo que a pessoa confirmou na P06. A taxa de serviço fixa e as
 * linhas "por distância/por tempo" que existiam aqui eram cifras inventadas pelo app (aceite D2 do `plano-m3-m4.md`) e
 * saíram; a P10 já mostrava só total e forma de pagamento.
 */
export interface TripReceiptLine {
  readonly label: string;
  readonly amount: Money;
}

export interface TripReceipt {
  readonly total: Money;
  /**
   * Só o histórico de exemplo (`mockTripHistory.ts`, P11, fora da fatia G6) ainda preenche linhas de composição. A
   * corrida pedida no app nunca tem: o valor é o preço fechado da cotação, sem composição inventada.
   */
  readonly lines?: readonly TripReceiptLine[];
}

/** Comprovante a partir do preço fechado da cotação pedida, em centavos. */
export function buildMockReceipt(priceCents: number): TripReceipt {
  return { total: { amountCents: priceCents, currency: 'BRL' } };
}
