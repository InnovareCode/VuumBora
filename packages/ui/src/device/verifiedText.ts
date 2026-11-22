/**
 * Baixar um texto e SÓ entregá-lo se o SHA-256 dos bytes baixados for o que a API publicou (B-6 da revisão de segurança
 * da rodada 3b). PURO: `fetch`, o cálculo do SHA-256 e o relógio entram por injeção, então tudo é provado com
 * `node --import tsx` (`test/verifiedText.test.ts`) sem rede e sem módulo nativo.
 *
 * Por que existe: o aceite dos Termos e da Política grava "versão X, hash H" no servidor, mas nada garantia que o que o app
 * MOSTROU eram os bytes de H — se o arquivo hospedado fosse trocado depois da publicação, a pessoa aceitaria um texto e
 * leria outro. Agora o app baixa, calcula e compara; divergiu, o texto NÃO é exibido (nenhum caminho devolve o texto de
 * uma conferência que falhou: o tipo de retorno só carrega `text` quando `ok` é `true`).
 *
 * Regras:
 *  - o hash é dos BYTES (o servidor hasheia o arquivo, `sha256OfFile`), nunca de uma string redecodificada: BOM,
 *    quebra de linha e UTF-8 inválido mudariam o hash. Só depois de bater é que os bytes viram texto;
 *  - só `https` (`http` apenas com `allowHttp`, que o app liga só em `__DEV__`, onde a API local não tem TLS);
 *  - a ORIGEM permitida é a da `url` que veio na resposta da API (nenhum host fixo no app): uma resposta cuja URL FINAL
 *    (depois de redirecionamentos) saiu dessa origem é recusada, mesmo que o hash fosse bater;
 *  - sem cookie, sem credencial, sem cabeçalho de autorização: o texto é público;
 *  - tamanho máximo e prazo máximo (texto legal tem dezenas de KB; um servidor que manda MB ou fica calado não trava o app).
 */

export const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

/** Termos longos têm dezenas de KB; 1 MiB é folga de sobra e impede um corpo gigante de ocupar a memória do aparelho. */
export const DEFAULT_MAX_TEXT_BYTES = 1024 * 1024;
export const DEFAULT_TEXT_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------------------------------------------------
// URL: esquema e origem
// ---------------------------------------------------------------------------------------------------------------------

export type UrlRefusal = 'bad_url' | 'insecure_url';

/**
 * Lista branca ESTRITA, de propósito: `\` não entra (WHATWG o trata como `/` em `https://bom.com\.mau.com`, e o texto
 * "do host" que o app leria seria outro que o da rede), nem `@` (credencial embutida), nem espaço, nem IPv6/colchetes.
 */
const HTTP_URL_PATTERN = /^(https?):\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]{1,5}))?(?:[/?#][^\s\\]*)?$/i;

export interface ParsedHttpUrl {
  readonly scheme: 'http' | 'https';
  /** `esquema://host[:porta]` em minúsculas, sem a porta padrão. É o que se compara entre a URL pedida e a final. */
  readonly origin: string;
}

export function parseHttpUrl(url: string): ParsedHttpUrl | null {
  const match = HTTP_URL_PATTERN.exec(url);
  if (match === null) return null;
  const scheme = (match[1] ?? '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return null;
  const host = (match[2] ?? '').toLowerCase();
  const portText = match[3];
  let port: number | null = null;
  if (portText !== undefined) {
    port = Number(portText);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    if ((scheme === 'https' && port === 443) || (scheme === 'http' && port === 80)) port = null;
  }
  return { scheme, origin: `${scheme}://${host}${port === null ? '' : `:${port}`}` };
}

/** Pode-se pedir este endereço? `https` sempre; `http` só com `allowHttp`. */
export function checkTextUrl(url: string, allowHttp: boolean): { readonly ok: true; readonly parsed: ParsedHttpUrl } | { readonly ok: false; readonly reason: UrlRefusal } {
  const parsed = parseHttpUrl(url);
  if (parsed === null) return { ok: false, reason: 'bad_url' };
  if (parsed.scheme === 'http' && !allowHttp) return { ok: false, reason: 'insecure_url' };
  return { ok: true, parsed };
}

// ---------------------------------------------------------------------------------------------------------------------
// Bytes → texto
// ---------------------------------------------------------------------------------------------------------------------

/**
 * UTF-8 ESTRITO: `null` para qualquer sequência inválida (continuação sem início, byte proibido, forma "longa demais",
 * substituto de UTF-16, acima de U+10FFFF, corte no fim). Escrito aqui em vez de `TextDecoder({ fatal: true })` porque o
 * suporte do Hermes a `fatal` não está garantido; `test/verifiedText.test.ts` o confronta com o `TextDecoder` do Node.
 * Remove a marca de ordem de bytes (BOM) do início: ela não faz parte do texto.
 */
export function decodeUtf8Strict(bytes: Uint8Array): string | null {
  const length = bytes.length;
  let index = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const pieces: string[] = [];
  let codePoints: number[] = [];

  while (index < length) {
    const first = bytes[index] as number;
    let size: number;
    let codePoint: number;
    if (first < 0x80) {
      size = 1;
      codePoint = first;
    } else if (first >= 0xc2 && first <= 0xdf) {
      size = 2;
      codePoint = first & 0x1f;
    } else if (first >= 0xe0 && first <= 0xef) {
      size = 3;
      codePoint = first & 0x0f;
    } else if (first >= 0xf0 && first <= 0xf4) {
      size = 4;
      codePoint = first & 0x07;
    } else {
      return null; // continuação solta, 0xC0/0xC1 (forma longa), 0xF5+ (acima do Unicode)
    }
    if (index + size > length) return null;
    for (let offset = 1; offset < size; offset += 1) {
      const next = bytes[index + offset] as number;
      if ((next & 0xc0) !== 0x80) return null;
      codePoint = (codePoint << 6) | (next & 0x3f);
    }
    if (size === 3 && (codePoint < 0x800 || (codePoint >= 0xd800 && codePoint <= 0xdfff))) return null;
    if (size === 4 && (codePoint < 0x10000 || codePoint > 0x10ffff)) return null;

    codePoints.push(codePoint);
    index += size;
    if (codePoints.length >= 4096) {
      pieces.push(String.fromCodePoint(...codePoints));
      codePoints = [];
    }
  }
  if (codePoints.length > 0) pieces.push(String.fromCodePoint(...codePoints));
  return pieces.join('');
}

/** Parágrafos separados por linha em branco (CRLF vira LF); linhas dentro do parágrafo ficam como vieram. */
export function textToParagraphs(text: string): readonly string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
}

// ---------------------------------------------------------------------------------------------------------------------
// SHA-256 em hexadecimal
// ---------------------------------------------------------------------------------------------------------------------

export function bytesToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

// ---------------------------------------------------------------------------------------------------------------------
// Baixar e conferir
// ---------------------------------------------------------------------------------------------------------------------

/** Só o que lemos da resposta (a `Response` do `expo/fetch`, a do navegador e a de um teste servem). */
export interface ResponseLike {
  readonly ok: boolean;
  readonly status: number;
  /** URL FINAL, depois de redirecionamentos (pode vir vazia em implementações que não a informam). */
  readonly url?: string;
  readonly headers?: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface FetchInit {
  readonly method: 'GET';
  readonly credentials: 'omit';
  readonly headers: Readonly<Record<string, string>>;
  readonly signal?: unknown;
}

export type FetchLike = (url: string, init: FetchInit) => Promise<ResponseLike>;

export interface AbortControllerLike {
  readonly signal: unknown;
  abort(): void;
}

export type VerifyFailureReason =
  | 'bad_url' // o endereço não é um http(s) absoluto limpo
  | 'insecure_url' // `http` fora do desenvolvimento
  | 'bad_expected_hash' // o `sha256` da API não é hexadecimal minúsculo de 64 caracteres
  | 'network' // sem rede, DNS, TLS, conexão cortada
  | 'timeout'
  | 'http_status' // o servidor respondeu, mas não 2xx
  | 'redirected' // a URL final saiu da origem da `url` publicada
  | 'too_large'
  | 'hash_unavailable' // este aparelho/ambiente não consegue calcular SHA-256 (ex.: web fora de HTTPS)
  | 'hash_mismatch' // os bytes baixados NÃO são os publicados
  | 'invalid_text'; // os bytes batem com o hash, mas não são UTF-8 válido (ou estão vazios)

export type VerifiedTextResult =
  | { readonly ok: true; readonly text: string; readonly sha256: string; readonly byteLength: number }
  | { readonly ok: false; readonly reason: VerifyFailureReason; readonly httpStatus?: number };

export interface VerifiedTextRequest {
  /** O `url` da PRÓPRIA resposta da API (`legalCurrent`, `error.current`, `me().consent.pending`). */
  readonly url: string;
  /** O `sha256` da mesma resposta: hexadecimal minúsculo de 64 caracteres. */
  readonly expectedSha256: string;
  /** `true` só em desenvolvimento (API local sem TLS). */
  readonly allowHttp: boolean;
  readonly fetch: FetchLike;
  /** SHA-256 dos BYTES em hexadecimal minúsculo. Rejeitar = `hash_unavailable`. */
  readonly sha256Hex: (bytes: Uint8Array) => Promise<string>;
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
  /** Padrão: o `AbortController` global (RN e navegador). Sem ele não há como cancelar, só esperar o prazo. */
  readonly createAbortController?: () => AbortControllerLike;
}

const fail = (reason: VerifyFailureReason, httpStatus?: number): VerifiedTextResult =>
  httpStatus === undefined ? { ok: false, reason } : { ok: false, reason, httpStatus };

function defaultAbortController(): AbortControllerLike | null {
  const Ctor = (globalThis as { AbortController?: new () => AbortControllerLike }).AbortController;
  return Ctor === undefined ? null : new Ctor();
}

export async function fetchVerifiedText(request: VerifiedTextRequest): Promise<VerifiedTextResult> {
  const { url, expectedSha256, allowHttp } = request;
  const maxBytes = request.maxBytes ?? DEFAULT_MAX_TEXT_BYTES;
  const timeoutMs = request.timeoutMs ?? DEFAULT_TEXT_TIMEOUT_MS;

  if (!SHA256_HEX_PATTERN.test(expectedSha256)) return fail('bad_expected_hash');
  const target = checkTextUrl(url, allowHttp);
  if (!target.ok) return fail(target.reason);

  const controller = request.createAbortController?.() ?? defaultAbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller?.abort();
  }, timeoutMs);

  try {
    let response: ResponseLike;
    let buffer: ArrayBuffer;
    try {
      response = await request.fetch(url, {
        method: 'GET',
        credentials: 'omit',
        headers: { Accept: 'text/plain, text/*;q=0.9, */*;q=0.1' },
        ...(controller !== null ? { signal: controller.signal } : {}),
      });
      if (!response.ok) return fail('http_status', response.status);

      // A origem da URL FINAL tem de ser a da `url` publicada. Vazio = a implementação não informa: o hash decide.
      if (response.url !== undefined && response.url !== '') {
        const final = parseHttpUrl(response.url);
        if (final === null || final.origin !== target.parsed.origin) return fail('redirected');
      }

      const declared = Number(response.headers?.get('content-length') ?? Number.NaN);
      if (Number.isFinite(declared) && declared > maxBytes) return fail('too_large');
      buffer = await response.arrayBuffer();
    } catch {
      return fail(timedOut ? 'timeout' : 'network');
    }

    if (buffer.byteLength > maxBytes) return fail('too_large');
    const bytes = new Uint8Array(buffer);

    let actual: string;
    try {
      actual = await request.sha256Hex(bytes);
    } catch {
      return fail('hash_unavailable');
    }
    if (actual !== expectedSha256) return fail('hash_mismatch');

    const text = decodeUtf8Strict(bytes);
    if (text === null || text.trim() === '') return fail('invalid_text');
    return { ok: true, text, sha256: actual, byteLength: bytes.byteLength };
  } finally {
    clearTimeout(timer);
  }
}
