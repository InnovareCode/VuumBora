/**
 * Assinatura da cotação (N9 do `docs/plano-m3-m4.md`): HMAC-SHA256 sobre id, categoria, preço, versão de tarifa e validade,
 * com `QUOTE_SIGNING_SECRET`, em base64url (43 caracteres; o CHECK `fare_quotes_signature_format` da 0026 aceita 32 a 128).
 *
 * A assinatura é GRAVADA junto da cotação: trocar o segredo durante a validade não invalida o que já foi emitido (quem
 * confere, no `POST /v1/trips` do M5, compara a assinatura que o app devolveu com a gravada — `quoteSignatureMatches`, em
 * tempo constante — e relê preço e validade do banco). Para o app ela é opaca: só devolve, nunca monta nem confere.
 *
 * O texto assinado tem versão (`vb-quote-v1`) e um campo por linha: nenhum valor pode "vazar" para o campo vizinho.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SignedQuoteFields {
  readonly quoteId: string;
  readonly categorySlug: string;
  readonly priceCents: number;
  readonly fareVersionId: string;
  /** ISO 8601 com milissegundos (o mesmo texto que vai ao app em `expiresAt`). */
  readonly expiresAt: string;
}

export function signQuote(secret: string, fields: SignedQuoteFields): string {
  const payload = ['vb-quote-v1', fields.quoteId, fields.categorySlug, String(fields.priceCents), fields.fareVersionId, fields.expiresAt].join('\n');
  return createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
}

/** A assinatura recebida é a desta cotação? Comparação em tempo constante. */
export function quoteSignatureMatches(expected: string, received: unknown): boolean {
  if (typeof received !== 'string') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
