import type { Money } from '@vuumbora/domain';
import { findMockRideCategory } from './mockRideCategories';

/**
 * Comprovante de corrida — 100% FABRICADO (sem motor de preço real, sem `PaymentPort`
 * implementado). Formato PROVISÓRIO, não é contrato de backend: existe só pra a P10 ter
 * algo plausível pra mostrar com `MockBadge`. A composição (tarifa por distância/tempo/
 * taxa de serviço) é ilustrativa, não reflete uma regra de precificação real.
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
const FALLBACK_BASE_CENTS = 2390;

/** "R$ 23,90" -> 2390 centavos. Serve só pro mock; preço real nunca nasce de parsing de string. */
function parseLabelToCents(priceLabel: string): number {
  const digits = priceLabel.replace(/[^0-9]/g, '');
  return Number(digits) || FALLBACK_BASE_CENTS;
}

function money(amountCents: number): Money {
  return { amountCents, currency: 'BRL' };
}

/** Monta o comprovente fabricado a partir da categoria escolhida (mesmo preço mostrado na P03/P06). */
export function buildMockReceipt(categoryKey: string | undefined): TripReceipt {
  const category = findMockRideCategory(categoryKey);
  const baseCents = category ? parseLabelToCents(category.priceLabel) : FALLBACK_BASE_CENTS;
  const distanceCents = Math.round(baseCents * 0.55);
  const timeCents = baseCents - distanceCents;
  const totalCents = baseCents + SERVICE_FEE_CENTS;

  return {
    total: money(totalCents),
    lines: [
      { label: 'Tarifa por distância', amount: money(distanceCents) },
      { label: 'Tarifa por tempo', amount: money(timeCents) },
      { label: 'Taxa de serviço', amount: money(SERVICE_FEE_CENTS) },
    ],
  };
}
