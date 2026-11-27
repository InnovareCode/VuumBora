/**
 * Adaptador LOCAL da porta de documentos (fatia D3): um servidor HTTP em memória que se comporta como o S3 no que importa
 * ao contrato, para testes e desenvolvimento. NUNCA em produção (`document-storage-config.ts` recusa).
 *
 * Igual ao S3:
 *  - URL assinada (HMAC-SHA256 com chave aleatória do processo) com validade de até 300 s; depois de vencer, 403;
 *  - o PUT tem de trazer `content-type`, `content-length` e `x-amz-checksum-sha256` com os valores assinados (senão 403,
 *    como o `SignatureDoesNotMatch`); corpo de outro tamanho ou outro conteúdo é recusado (400, como o `BadDigest`);
 *  - a URL de visualização serve o arquivo com `Cache-Control: no-store`.
 *
 * O relógio é injetável (`now`): os testes provam o vencimento sem esperar 300 s.
 * Os objetos ficam só na memória (somem ao reiniciar) e o total tem teto (`maxTotalBytes`).
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  DOCUMENT_MAX_SIZE_BYTES,
  assertStorageKey,
  assertUploadInput,
  assertUrlTtl,
  isValidStorageKey,
  sha256Base64ToHex,
  sha256HexToBase64,
  type DocumentStorage,
  type PresignedUpload,
  type PresignedView,
  type PresignUploadInput,
  type PresignViewInput,
  type StoredObjectInfo,
} from './document-storage.js';

export interface LocalDocumentStorageOptions {
  /** Endereço em que o servidor escuta. Padrão `127.0.0.1`. */
  readonly host?: string;
  /** Porta. Padrão 0 (qualquer livre). */
  readonly port?: number;
  /** Base das URLs devolvidas, quando o app enxerga outro endereço (ex.: `http://10.0.2.2:3102` no emulador Android). */
  readonly publicBaseUrl?: string;
  /** Relógio (ms). Os testes avançam este relógio para provar o vencimento. */
  readonly now?: () => number;
  /** Teto da memória ocupada pelos arquivos. Padrão 256 MiB. */
  readonly maxTotalBytes?: number;
}

export interface LocalDocumentStorage extends DocumentStorage {
  readonly kind: 'local';
  /** Base das URLs (sem barra no fim). */
  readonly baseUrl: string;
  /** Só testes: quantos objetos estão guardados. */
  objectCount(): number;
}

interface StoredObject {
  readonly body: Buffer;
  readonly contentType: string;
  readonly sha256Hex: string;
}

const OBJECT_PATH = '/o/';

function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

function decodeKey(path: string): string | null {
  try {
    const key = path.split('/').map(decodeURIComponent).join('/');
    return isValidStorageKey(key) ? key : null;
  } catch {
    return null;
  }
}

function sameHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === 32 && right.length === 32 && timingSafeEqual(left, right);
}

function reject(response: ServerResponse, status: number, code: string): void {
  response.writeHead(status, { 'Content-Type': 'application/xml', 'Cache-Control': 'no-store' });
  response.end(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code></Error>`);
}

export async function startLocalDocumentStorage(options: LocalDocumentStorageOptions = {}): Promise<LocalDocumentStorage> {
  const now = options.now ?? Date.now;
  const maxTotalBytes = options.maxTotalBytes ?? 256 * 1024 * 1024;
  const signingKey = randomBytes(32);
  const objects = new Map<string, StoredObject>();
  let totalBytes = 0;

  const sign = (payload: string) => createHmac('sha256', signingKey).update(payload).digest('hex');
  const uploadPayload = (key: string, expiresAtMs: number, contentType: string, sizeBytes: number, sha256Hex: string) =>
    ['put', key, expiresAtMs, contentType, sizeBytes, sha256Hex].join('\n');
  const viewPayload = (key: string, expiresAtMs: number) => ['get', key, expiresAtMs].join('\n');

  /** Assinatura certa e dentro da validade? 403 com o código do S3 se não. */
  function authorize(url: URL, payload: (expiresAtMs: number) => string, response: ServerResponse): boolean {
    const expires = url.searchParams.get('X-Local-Expires') ?? '';
    const signature = url.searchParams.get('X-Local-Signature') ?? '';
    const expiresAtMs = /^\d{1,15}$/.test(expires) ? Number(expires) : NaN;
    if (!Number.isFinite(expiresAtMs) || !/^[0-9a-f]{64}$/.test(signature) || !sameHex(signature, sign(payload(expiresAtMs)))) {
      reject(response, 403, 'SignatureDoesNotMatch');
      return false;
    }
    if (now() > expiresAtMs) {
      reject(response, 403, 'AccessDenied'); // "Request has expired", como o S3
      return false;
    }
    return true;
  }

  async function readBody(request: IncomingMessage, limit: number): Promise<Buffer | null> {
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of request) {
      const buffer = chunk as Buffer;
      received += buffer.length;
      if (received > limit) return null;
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  }

  async function handlePut(url: URL, key: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
    const contentType = request.headers['content-type'] ?? '';
    const lengthHeader = request.headers['content-length'] ?? '';
    const declaredSize = /^\d{1,9}$/.test(lengthHeader) ? Number(lengthHeader) : NaN;
    const checksumHeader = request.headers['x-amz-checksum-sha256'];
    const declaredSha = sha256Base64ToHex(typeof checksumHeader === 'string' ? checksumHeader : undefined);
    if (!Number.isFinite(declaredSize) || declaredSha === null) {
      reject(response, 403, 'SignatureDoesNotMatch'); // faltou um cabeçalho assinado
      return;
    }
    if (!authorize(url, (expiresAtMs) => uploadPayload(key, expiresAtMs, contentType, declaredSize, declaredSha), response)) return;
    const body = await readBody(request, Math.min(declaredSize, DOCUMENT_MAX_SIZE_BYTES));
    if (body === null || body.length !== declaredSize) {
      reject(response, 400, 'IncompleteBody');
      return;
    }
    const actualSha = createHash('sha256').update(body).digest('hex');
    if (!sameHex(actualSha, declaredSha)) {
      reject(response, 400, 'BadDigest');
      return;
    }
    const previous = objects.get(key);
    const nextTotal = totalBytes - (previous?.body.length ?? 0) + body.length;
    if (nextTotal > maxTotalBytes) {
      reject(response, 507, 'InsufficientStorage');
      return;
    }
    objects.set(key, { body, contentType, sha256Hex: actualSha });
    totalBytes = nextTotal;
    response.writeHead(200, { 'Cache-Control': 'no-store', ETag: `"${actualSha.slice(0, 32)}"` });
    response.end();
  }

  function handleGet(url: URL, key: string, response: ServerResponse): void {
    if (!authorize(url, (expiresAtMs) => viewPayload(key, expiresAtMs), response)) return;
    const stored = objects.get(key);
    if (!stored) {
      reject(response, 404, 'NoSuchKey');
      return;
    }
    response.writeHead(200, {
      'Content-Type': stored.contentType,
      'Content-Length': String(stored.body.length),
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store',
    });
    response.end(stored.body);
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://local');
    const key = url.pathname.startsWith(OBJECT_PATH) ? decodeKey(url.pathname.slice(OBJECT_PATH.length)) : null;
    if (key === null) {
      reject(response, 404, 'NoSuchKey');
      return;
    }
    if (request.method === 'PUT') {
      handlePut(url, key, request, response).catch(() => {
        if (!response.headersSent) reject(response, 500, 'InternalError');
        else response.destroy();
      });
      return;
    }
    if (request.method === 'GET') {
      handleGet(url, key, response);
      return;
    }
    reject(response, 405, 'MethodNotAllowed');
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  const baseUrl = (options.publicBaseUrl ?? `http://${address.family === 'IPv6' ? `[${address.address}]` : address.address}:${address.port}`).replace(/\/+$/, '');

  function signedUrl(key: string, expiresAtMs: number, signature: string): string {
    return `${baseUrl}${OBJECT_PATH}${encodeKey(key)}?X-Local-Expires=${expiresAtMs}&X-Local-Signature=${signature}`;
  }

  async function presignUpload(input: PresignUploadInput): Promise<PresignedUpload> {
    assertUploadInput(input);
    const expiresAtMs = now() + input.ttlSeconds * 1000;
    const signature = sign(uploadPayload(input.key, expiresAtMs, input.contentType, input.sizeBytes, input.sha256Hex));
    return {
      url: signedUrl(input.key, expiresAtMs, signature),
      method: 'PUT',
      headers: {
        'Content-Type': input.contentType,
        'Content-Length': String(input.sizeBytes),
        'x-amz-checksum-sha256': sha256HexToBase64(input.sha256Hex),
      },
      expiresAt: new Date(expiresAtMs),
    };
  }

  async function presignView(input: PresignViewInput): Promise<PresignedView> {
    assertStorageKey(input.key);
    assertUrlTtl(input.ttlSeconds);
    const expiresAtMs = now() + input.ttlSeconds * 1000;
    return { url: signedUrl(input.key, expiresAtMs, sign(viewPayload(input.key, expiresAtMs))), expiresAt: new Date(expiresAtMs) };
  }

  async function inspect(key: string): Promise<StoredObjectInfo | null> {
    assertStorageKey(key);
    const stored = objects.get(key);
    return stored ? { sizeBytes: stored.body.length, sha256Hex: stored.sha256Hex } : null;
  }

  async function close(): Promise<void> {
    objects.clear();
    totalBytes = 0;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  return { kind: 'local', baseUrl, presignUpload, presignView, inspect, close, objectCount: () => objects.size };
}
