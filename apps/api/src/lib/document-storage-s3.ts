/**
 * Adaptador S3 da porta de documentos (fatia D3). Fala o padrão S3, então serve à Magalu Cloud (recomendação do plano,
 * §2) e à AWS só trocando a configuração (`document-storage-config.ts`).
 *
 * URL de ENVIO (`PutObject` pré-assinado): a assinatura cobre `content-type`, `content-length`, `x-amz-checksum-sha256`
 * e `x-amz-meta-sha256`, todos como CABEÇALHO (não na query): quem não mandar exatamente esses valores recebe 403
 * `SignatureDoesNotMatch`; o tamanho errado não passa; e o provedor que valida `x-amz-checksum-sha256` (a AWS valida)
 * recusa corpo com outro conteúdo (400 `BadDigest`). `x-amz-meta-sha256` é a cópia do hash que o `HeadObject` devolve
 * mesmo em provedor sem checksum adicional.
 *
 * URL de VISUALIZAÇÃO (`GetObject` pré-assinado): `Cache-Control: no-store` e `inline` na resposta (a fatia D7 proíbe
 * documento em cache).
 *
 * `inspect` (`HeadObject` com `ChecksumMode`): 404 vira `null`; qualquer outra falha LANÇA (a rota responde 503).
 *
 * O cálculo automático de checksum do SDK fica em `WHEN_REQUIRED`: no modo padrão (desde a 3.729) a URL pré-assinada
 * ganharia o CRC32 de um corpo VAZIO e todo envio falharia, e provedores compatíveis com S3 nem sempre aceitam os
 * checksums novos.
 *
 * Nunca loga nada: URL assinada é credencial temporária.
 */
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  assertStorageKey,
  assertUploadInput,
  assertUrlTtl,
  isSha256Hex,
  sha256Base64ToHex,
  sha256HexToBase64,
  type DocumentStorage,
  type PresignedUpload,
  type PresignedView,
  type PresignUploadInput,
  type PresignViewInput,
  type StoredObjectInfo,
} from './document-storage.js';

export interface S3DocumentStorageConfig {
  /** Ex.: `https://br-se1.magaluobjects.com`. Ausente = endpoint padrão da AWS para a região. */
  readonly endpoint?: string | undefined;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** `bucket` no caminho (`https://host/bucket/chave`) em vez do subdomínio. Vários provedores compatíveis exigem. */
  readonly forcePathStyle: boolean;
  /** Tempo máximo de uma chamada ao armazenamento (só `inspect` faz rede). Padrão 5 s. */
  readonly requestTimeoutMs?: number | undefined;
}

export interface S3DocumentStorageOptions {
  /** Relógio (ms). Só os testes trocam: a assinatura e o `expiresAt` partem dele. */
  readonly now?: () => number;
}

/** Cabeçalhos assinados que precisam ir como CABEÇALHO no PUT (o presigner levaria `x-amz-*` para a query). */
const UNHOISTABLE_UPLOAD_HEADERS = new Set(['x-amz-checksum-sha256', 'x-amz-meta-sha256']);
const SIGNED_UPLOAD_HEADERS = new Set(['content-type', 'content-length', 'x-amz-checksum-sha256', 'x-amz-meta-sha256']);

function httpStatusOf(err: unknown): number | undefined {
  const metadata = (err as { $metadata?: { httpStatusCode?: unknown } } | null)?.$metadata;
  return typeof metadata?.httpStatusCode === 'number' ? metadata.httpStatusCode : undefined;
}

export function createS3DocumentStorage(config: S3DocumentStorageConfig, options: S3DocumentStorageOptions = {}): DocumentStorage {
  const now = options.now ?? Date.now;
  const requestTimeout = config.requestTimeoutMs ?? 5_000;
  const client = new S3Client({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    // Uma repetição só: o `submit` do motorista espera por isto.
    maxAttempts: 2,
    requestHandler: { requestTimeout, connectionTimeout: Math.min(requestTimeout, 3_000) },
  });

  async function presignUpload(input: PresignUploadInput): Promise<PresignedUpload> {
    assertUploadInput(input);
    const checksum = sha256HexToBase64(input.sha256Hex);
    const signedAt = now();
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
      ChecksumSHA256: checksum,
      Metadata: { sha256: input.sha256Hex },
    });
    const url = await getSignedUrl(client, command, {
      expiresIn: input.ttlSeconds,
      signingDate: new Date(signedAt),
      signableHeaders: SIGNED_UPLOAD_HEADERS,
      unhoistableHeaders: UNHOISTABLE_UPLOAD_HEADERS,
    });
    return {
      url,
      method: 'PUT',
      headers: {
        'Content-Type': input.contentType,
        'Content-Length': String(input.sizeBytes),
        'x-amz-checksum-sha256': checksum,
        'x-amz-meta-sha256': input.sha256Hex,
      },
      expiresAt: new Date(signedAt + input.ttlSeconds * 1000),
    };
  }

  async function presignView(input: PresignViewInput): Promise<PresignedView> {
    assertStorageKey(input.key);
    assertUrlTtl(input.ttlSeconds);
    const signedAt = now();
    const command = new GetObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      ResponseCacheControl: 'no-store',
      ResponseContentDisposition: 'inline',
    });
    const url = await getSignedUrl(client, command, { expiresIn: input.ttlSeconds, signingDate: new Date(signedAt) });
    return { url, expiresAt: new Date(signedAt + input.ttlSeconds * 1000) };
  }

  async function inspect(key: string): Promise<StoredObjectInfo | null> {
    assertStorageKey(key);
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key, ChecksumMode: 'ENABLED' }));
      const fromChecksum = sha256Base64ToHex(head.ChecksumSHA256);
      const fromMetadata = head.Metadata?.['sha256'];
      return {
        sizeBytes: typeof head.ContentLength === 'number' ? head.ContentLength : -1,
        sha256Hex: fromChecksum ?? (isSha256Hex(fromMetadata) ? fromMetadata : null),
      };
    } catch (err) {
      if (httpStatusOf(err) === 404 || (err as { name?: unknown } | null)?.name === 'NotFound') return null;
      throw err;
    }
  }

  return {
    kind: 's3',
    presignUpload,
    presignView,
    inspect,
    close: async () => client.destroy(),
  };
}
