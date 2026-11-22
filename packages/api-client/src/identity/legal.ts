/**
 * Validação do que a API devolve sobre os documentos legais (Termos de Uso e Política de Privacidade): o corpo de
 * `GET /v1/legal/current`, o `error.current` do `409 consent_outdated` e o `consent` de `GET /me` / `POST /consents`.
 *
 * Tudo aqui é CONFERÊNCIA de forma, nunca fonte de valor: nenhuma versão, hash ou URL nasce neste pacote. A versão que
 * o app envia no aceite vem do que a tela renderizou (ver `RegisterInput.termsVersion`).
 * Forma inesperada = `null` (o chamador devolve `unknown`, em vez de entregar lixo à tela).
 */
import type {
  AccountType,
  ConsentStatus,
  CurrentLegal,
  LegalDocumentName,
  LegalDocumentView,
  PendingConsentDocument,
} from './types';

/** Mesmo formato que a API aceita (`LEGAL_VERSION_FORMAT`): sem `trim`, espaço sobrando é versão malformada. */
export const LEGAL_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
/** http(s) absoluto, sem credencial embutida (`user@`) e sem espaço. Esquemas como `javascript:` e `data:` não passam. */
const DOCUMENT_URL_PATTERN = /^https?:\/\/[^\s/@]+(?:\/\S*)?$/;
const MAX_URL_LENGTH = 2048;
const DOCUMENTS: readonly LegalDocumentName[] = ['terms', 'privacy'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseView(value: unknown): LegalDocumentView | null {
  if (!isRecord(value)) return null;
  const { version, sha256, publishedAt, url } = value;
  if (typeof version !== 'string' || !LEGAL_VERSION_PATTERN.test(version)) return null;
  if (typeof sha256 !== 'string' || !SHA256_PATTERN.test(sha256)) return null;
  if (typeof publishedAt !== 'string' || Number.isNaN(Date.parse(publishedAt))) return null;
  if (typeof url !== 'string' || url.length > MAX_URL_LENGTH || !DOCUMENT_URL_PATTERN.test(url)) return null;
  return { version, sha256, publishedAt, url };
}

/**
 * `expectedAudience`: o perfil do app. Um corpo de OUTRO perfil é erro do servidor (ou servidor errado): nunca é
 * mostrado como se fosse os Termos deste app.
 */
export function parseCurrentLegal(value: unknown, expectedAudience?: AccountType): CurrentLegal | null {
  if (!isRecord(value)) return null;
  const { audience } = value;
  if (audience !== 'passenger' && audience !== 'driver') return null;
  if (expectedAudience !== undefined && audience !== expectedAudience) return null;
  const terms = parseView(value['terms']);
  const privacy = parseView(value['privacy']);
  return terms && privacy ? { audience, terms, privacy } : null;
}

function parsePending(value: unknown): PendingConsentDocument | null {
  if (!isRecord(value)) return null;
  const { document } = value;
  if (document !== 'terms' && document !== 'privacy') return null;
  const view = parseView(value);
  return view ? { document, ...view } : null;
}

/** `upToDate` tem de concordar com `pending` (vazio = em dia): a tela decide por um dos dois, então não podem divergir. */
export function parseConsentStatus(value: unknown): ConsentStatus | null {
  if (!isRecord(value)) return null;
  const { upToDate, pending: rawPending } = value;
  if (typeof upToDate !== 'boolean' || !Array.isArray(rawPending) || rawPending.length > DOCUMENTS.length) return null;
  const pending: PendingConsentDocument[] = [];
  for (const raw of rawPending) {
    const item = parsePending(raw);
    if (!item || pending.some((other) => other.document === item.document)) return null;
    pending.push(item);
  }
  if (upToDate !== (pending.length === 0)) return null;
  return { upToDate, pending };
}
