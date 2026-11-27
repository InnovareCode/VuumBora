/**
 * Porta de armazenamento dos ARQUIVOS de documento do motorista (fatia D3 do `docs/plano-m3-m4.md`). O binário nunca
 * passa pela API nem entra no banco: o app envia direto ao armazenamento por uma URL ASSINADA (PUT) e o painel abre o
 * arquivo por outra URL assinada (GET). A API só assina, confere o objeto no `submit` e guarda os metadados.
 *
 * Dois adaptadores com o MESMO contrato:
 *  - `document-storage-s3.ts`: o padrão S3 (Magalu Cloud, AWS). Configurado por ambiente (`document-storage-config.ts`).
 *  - `document-storage-local.ts`: servidor HTTP local em memória, para teste e desenvolvimento. Recusa produção.
 *
 * Regras que valem para os dois (e que os testes provam no local):
 *  - toda URL vale no máximo `DOCUMENT_URL_MAX_TTL_SECONDS` (300 s); pedir mais é erro de programação (`RangeError`);
 *  - a URL de envio amarra tipo, tamanho e SHA-256 do arquivo: o cliente TEM de mandar os `headers` devolvidos, e o
 *    armazenamento recusa outro tamanho ou outro conteúdo;
 *  - a chave do objeto mora sob `driver-docs/` (prefixo da credencial) e nunca tem `..` nem `//`.
 */

/** Validade máxima de uma URL assinada de documento (envio e visualização), em segundos. */
export const DOCUMENT_URL_MAX_TTL_SECONDS = 300;
/** Prefixo de toda chave de documento (a credencial do armazenamento só alcança este prefixo). */
export const DOCUMENT_STORAGE_PREFIX = 'driver-docs/';
/** Tamanho máximo de um documento: 10 MiB (o mesmo CHECK `driver_documents_size_range` da 0024). */
export const DOCUMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;

export interface PresignUploadInput {
  readonly key: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  /** SHA-256 do arquivo, hexadecimal minúsculo. */
  readonly sha256Hex: string;
  readonly ttlSeconds: number;
}

export interface PresignedUpload {
  readonly url: string;
  readonly method: 'PUT';
  /** Cabeçalhos que o PUT TEM de levar, exatamente com estes valores (estão na assinatura). */
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: Date;
}

export interface PresignViewInput {
  readonly key: string;
  readonly ttlSeconds: number;
}

export interface PresignedView {
  readonly url: string;
  readonly expiresAt: Date;
}

/** O que o armazenamento sabe do objeto enviado. `sha256Hex` nulo = o armazenamento não informou o hash. */
export interface StoredObjectInfo {
  readonly sizeBytes: number;
  readonly sha256Hex: string | null;
}

export interface DocumentStorage {
  readonly kind: 's3' | 'local';
  presignUpload(input: PresignUploadInput): Promise<PresignedUpload>;
  presignView(input: PresignViewInput): Promise<PresignedView>;
  /** `null` = o objeto não existe. Falha de rede ou de credencial LANÇA (a rota responde 503, nunca "não existe"). */
  inspect(key: string): Promise<StoredObjectInfo | null>;
  close(): Promise<void>;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;
const KEY_PATTERN = /^driver-docs\/[A-Za-z0-9][A-Za-z0-9/_.-]*$/;

/** Mesma regra do CHECK `driver_documents_storage_key_format` (0024): prefixo fixo, sem `..` nem `//`, até 400 caracteres. */
export function isValidStorageKey(key: unknown): key is string {
  return typeof key === 'string' && key.length <= 400 && KEY_PATTERN.test(key) && !key.includes('..') && !key.includes('//');
}

export function assertStorageKey(key: string): void {
  if (!isValidStorageKey(key)) throw new RangeError('chave de documento fora do padrão driver-docs/...');
}

export function assertUrlTtl(ttlSeconds: number): void {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > DOCUMENT_URL_MAX_TTL_SECONDS) {
    throw new RangeError(`validade da URL deve ser inteira entre 1 e ${DOCUMENT_URL_MAX_TTL_SECONDS} s (recebido: ${ttlSeconds})`);
  }
}

export function assertUploadInput(input: PresignUploadInput): void {
  assertStorageKey(input.key);
  assertUrlTtl(input.ttlSeconds);
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > DOCUMENT_MAX_SIZE_BYTES) {
    throw new RangeError('tamanho de documento fora de 1..10 MiB');
  }
  if (!SHA256_HEX.test(input.sha256Hex)) throw new RangeError('sha256 deve ser hexadecimal minúsculo de 64 caracteres');
  if (!/^[a-z]+\/[a-z0-9.+-]+$/.test(input.contentType)) throw new RangeError('content-type inválido');
}

/** Hex (64) → base64 (44), o formato de `x-amz-checksum-sha256`. */
export function sha256HexToBase64(hex: string): string {
  return Buffer.from(hex, 'hex').toString('base64');
}

/** Base64 de 32 bytes → hex minúsculo; `null` se não for um SHA-256 em base64. */
export function sha256Base64ToHex(value: string | undefined | null): string | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) return null;
  const bytes = Buffer.from(value, 'base64');
  return bytes.length === 32 ? bytes.toString('hex') : null;
}

export function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX.test(value);
}
