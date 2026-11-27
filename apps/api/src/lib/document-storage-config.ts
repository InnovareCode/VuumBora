/**
 * Configuração do armazenamento de documentos (fatia D3), lida do ambiente À PARTE de `env.ts`: configuração ausente ou
 * errada NÃO derruba o boot (o resto da API segue de pé). As rotas que precisam do armazenamento falham FECHADO (503
 * `unavailable`) e o boot registra o motivo — só NOMES de variável, nunca valor.
 *
 *   DOCUMENT_STORAGE_DRIVER                 s3 | local (vazio = sem armazenamento: envio de documento responde 503)
 *   DOCUMENT_STORAGE_S3_ENDPOINT            https://... (Magalu: https://br-se1.magaluobjects.com; vazio = AWS)
 *   DOCUMENT_STORAGE_S3_REGION              ex.: br-se1 (Magalu) ou sa-east-1 (AWS)
 *   DOCUMENT_STORAGE_S3_BUCKET              nome do bucket
 *   DOCUMENT_STORAGE_S3_ACCESS_KEY_ID       credencial restrita ao prefixo driver-docs/
 *   DOCUMENT_STORAGE_S3_SECRET_ACCESS_KEY
 *   DOCUMENT_STORAGE_S3_FORCE_PATH_STYLE    true | false (padrão false)
 *   DOCUMENT_STORAGE_LOCAL_HOST / _PORT / _PUBLIC_URL   só desenvolvimento (o local RECUSA NODE_ENV=production)
 *   DOCUMENT_URL_TTL_SECONDS                validade das URLs assinadas, 1..300 (padrão 300)
 */
import { DOCUMENT_URL_MAX_TTL_SECONDS, type DocumentStorage } from './document-storage.js';
import { startLocalDocumentStorage } from './document-storage-local.js';
import { createS3DocumentStorage, type S3DocumentStorageConfig } from './document-storage-s3.js';

export type DocumentStorageConfig =
  | { readonly kind: 's3'; readonly s3: S3DocumentStorageConfig; readonly urlTtlSeconds: number }
  | { readonly kind: 'local'; readonly host: string; readonly port: number; readonly publicBaseUrl?: string; readonly urlTtlSeconds: number };

export type DocumentStorageConfigResult =
  | { readonly ok: true; readonly config: DocumentStorageConfig }
  | { readonly ok: false; readonly reasons: readonly string[] };

type Source = Readonly<Record<string, string | undefined>>;

const trimmed = (source: Source, name: string): string => (source[name] ?? '').trim();

/** Validade das URLs (1..300 s; padrão 300). Valor fora do intervalo é erro de configuração, não "corrige sozinho". */
export function urlTtlFrom(source: Source): number | null {
  const raw = trimmed(source, 'DOCUMENT_URL_TTL_SECONDS');
  if (raw === '') return DOCUMENT_URL_MAX_TTL_SECONDS;
  const value = /^\d{1,4}$/.test(raw) ? Number(raw) : NaN;
  return Number.isInteger(value) && value >= 1 && value <= DOCUMENT_URL_MAX_TTL_SECONDS ? value : null;
}

export function loadDocumentStorageConfig(source: Source = process.env): DocumentStorageConfigResult {
  const driver = trimmed(source, 'DOCUMENT_STORAGE_DRIVER');
  const urlTtlSeconds = urlTtlFrom(source);
  const reasons: string[] = [];
  if (urlTtlSeconds === null) reasons.push(`DOCUMENT_URL_TTL_SECONDS: inteiro entre 1 e ${DOCUMENT_URL_MAX_TTL_SECONDS}`);

  if (driver === '') return { ok: false, reasons: ['DOCUMENT_STORAGE_DRIVER: ausente (s3 ou local)', ...reasons] };

  if (driver === 'local') {
    if (trimmed(source, 'NODE_ENV') === 'production') reasons.push('DOCUMENT_STORAGE_DRIVER: local é só para desenvolvimento e teste');
    const portRaw = trimmed(source, 'DOCUMENT_STORAGE_LOCAL_PORT');
    const port = portRaw === '' ? 0 : /^\d{1,5}$/.test(portRaw) && Number(portRaw) <= 65535 ? Number(portRaw) : NaN;
    if (Number.isNaN(port)) reasons.push('DOCUMENT_STORAGE_LOCAL_PORT: porta inválida');
    const publicBaseUrl = trimmed(source, 'DOCUMENT_STORAGE_LOCAL_PUBLIC_URL');
    if (publicBaseUrl !== '' && !/^https?:\/\/[^\s/?#]+$/.test(publicBaseUrl)) reasons.push('DOCUMENT_STORAGE_LOCAL_PUBLIC_URL: http(s)://host[:porta]');
    if (reasons.length > 0 || urlTtlSeconds === null) return { ok: false, reasons };
    return {
      ok: true,
      config: {
        kind: 'local',
        host: trimmed(source, 'DOCUMENT_STORAGE_LOCAL_HOST') || '127.0.0.1',
        port,
        ...(publicBaseUrl ? { publicBaseUrl } : {}),
        urlTtlSeconds,
      },
    };
  }

  if (driver !== 's3') return { ok: false, reasons: ['DOCUMENT_STORAGE_DRIVER: use s3 ou local', ...reasons] };

  const endpoint = trimmed(source, 'DOCUMENT_STORAGE_S3_ENDPOINT');
  if (endpoint !== '' && !/^https:\/\/[^\s/?#]+\/?$/.test(endpoint)) reasons.push('DOCUMENT_STORAGE_S3_ENDPOINT: https://host (sem caminho)');
  const region = trimmed(source, 'DOCUMENT_STORAGE_S3_REGION');
  if (!/^[a-z0-9-]{2,40}$/.test(region)) reasons.push('DOCUMENT_STORAGE_S3_REGION: obrigatória');
  const bucket = trimmed(source, 'DOCUMENT_STORAGE_S3_BUCKET');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) reasons.push('DOCUMENT_STORAGE_S3_BUCKET: nome de bucket inválido');
  const accessKeyId = trimmed(source, 'DOCUMENT_STORAGE_S3_ACCESS_KEY_ID');
  if (accessKeyId === '') reasons.push('DOCUMENT_STORAGE_S3_ACCESS_KEY_ID: obrigatória');
  const secretAccessKey = trimmed(source, 'DOCUMENT_STORAGE_S3_SECRET_ACCESS_KEY');
  if (secretAccessKey === '') reasons.push('DOCUMENT_STORAGE_S3_SECRET_ACCESS_KEY: obrigatória');
  const pathStyle = trimmed(source, 'DOCUMENT_STORAGE_S3_FORCE_PATH_STYLE');
  if (pathStyle !== '' && pathStyle !== 'true' && pathStyle !== 'false') reasons.push('DOCUMENT_STORAGE_S3_FORCE_PATH_STYLE: true ou false');
  if (reasons.length > 0 || urlTtlSeconds === null) return { ok: false, reasons };

  return {
    ok: true,
    config: {
      kind: 's3',
      s3: { endpoint: endpoint ? endpoint.replace(/\/$/, '') : undefined, region, bucket, accessKeyId, secretAccessKey, forcePathStyle: pathStyle === 'true' },
      urlTtlSeconds,
    },
  };
}

/** O armazenamento já montado e a validade das URLs que as rotas pedem. */
export interface DocumentStorageSetup {
  readonly storage: DocumentStorage;
  readonly urlTtlSeconds: number;
}

/**
 * Monta o armazenamento a partir do ambiente. `null` = indisponível (a rota responde 503); o motivo vai para `onProblem`
 * (só nomes de variável). Nunca lança: um local que não consegue escutar também vira `null`.
 */
export async function documentStorageFromEnv(onProblem: (reasons: readonly string[]) => void, source: Source = process.env): Promise<DocumentStorageSetup | null> {
  const loaded = loadDocumentStorageConfig(source);
  if (!loaded.ok) {
    onProblem(loaded.reasons);
    return null;
  }
  const { config } = loaded;
  if (config.kind === 's3') return { storage: createS3DocumentStorage(config.s3), urlTtlSeconds: config.urlTtlSeconds };
  try {
    const storage = await startLocalDocumentStorage({
      host: config.host,
      port: config.port,
      ...(config.publicBaseUrl ? { publicBaseUrl: config.publicBaseUrl } : {}),
    });
    return { storage, urlTtlSeconds: config.urlTtlSeconds };
  } catch {
    onProblem(['DOCUMENT_STORAGE_LOCAL_PORT: não foi possível escutar']);
    return null;
  }
}
