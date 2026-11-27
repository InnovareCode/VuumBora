/**
 * Validação do corpo de `POST /v1/quotes` (M4, fatia G4; `FareQuoteInput` do contrato K0) e do id de `GET /v1/quotes/:id`.
 * Sem I/O. `null` = 400 `invalid_body`. Os limites espelham os CHECK da 0026 (`fare_quotes_points_range`,
 * `fare_quotes_labels_len`): o banco é a última linha de defesa, não o caminho normal (a violação leva a linha ao log dele).
 */
import type { CreateQuotesInput, QuotePointInput } from '../services/quote-service.js';

const MAX_LABEL_LENGTH = 200;
const MAX_CATEGORY_SLUGS = 20;
const MAX_SLUG_LENGTH = 64;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePoint(value: unknown): QuotePointInput | null {
  if (!isRecord(value)) return null;
  const { lat, lng, label } = value;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  if (typeof label !== 'string' || CONTROL_CHARACTERS.test(label)) return null;
  const trimmed = label.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_LABEL_LENGTH) return null;
  return { lat, lng, label: trimmed };
}

export function parseQuoteBody(body: unknown): CreateQuotesInput | null {
  if (!isRecord(body)) return null;
  const origin = parsePoint(body['origin']);
  const destination = parsePoint(body['destination']);
  if (!origin || !destination) return null;
  const slugs = body['categorySlugs'];
  if (slugs === undefined) return { origin, destination };
  if (!Array.isArray(slugs) || slugs.length > MAX_CATEGORY_SLUGS) return null;
  if (!slugs.every((slug): slug is string => typeof slug === 'string' && slug.length <= MAX_SLUG_LENGTH)) return null;
  return { origin, destination, categorySlugs: slugs };
}

export function isQuoteId(value: string): boolean {
  return UUID_PATTERN.test(value);
}
