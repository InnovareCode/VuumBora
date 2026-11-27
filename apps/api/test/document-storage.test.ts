/**
 * Porta de armazenamento de documentos (fatia D3 do `docs/plano-m3-m4.md`), sem banco.
 *
 * LOCAL (servidor HTTP de verdade, relógio injetado): URL de envio e de visualização valem até 300 s e são RECUSADAS
 * depois de vencer; o envio amarra tipo, tamanho e SHA-256 (outro conteúdo, outro tamanho ou cabeçalho faltando: recusado).
 *
 * S3 (sem provedor contratado): o que dá para provar sem rede — a URL pré-assinada tem `X-Amz-Expires` ≤ 300, assina os
 * cabeçalhos certos COMO cabeçalho (não na query), e `inspect` traduz o `HeadObject` (hash do checksum, 404 = ausente,
 * outra falha LANÇA) contra um endpoint S3 falso local. O vencimento NO PROVEDOR só se prova em homologação.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { DOCUMENT_URL_MAX_TTL_SECONDS, sha256HexToBase64 } from '../src/lib/document-storage.js';
import { loadDocumentStorageConfig } from '../src/lib/document-storage-config.js';
import { startLocalDocumentStorage, type LocalDocumentStorage } from '../src/lib/document-storage-local.js';
import { createS3DocumentStorage } from '../src/lib/document-storage-s3.js';

const FILE = Buffer.from('conteúdo de um documento de teste, não é uma CNH de verdade');
const FILE_SHA = createHash('sha256').update(FILE).digest('hex');
const KEY = 'driver-docs/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.jpg';

let clockMs = Date.parse('2026-11-27T12:00:00Z');
let local: LocalDocumentStorage;

before(async () => {
  local = await startLocalDocumentStorage({ now: () => clockMs });
});
after(async () => {
  await local.close();
});

async function uploadUrl(key = KEY, ttlSeconds = DOCUMENT_URL_MAX_TTL_SECONDS) {
  return local.presignUpload({ key, contentType: 'image/jpeg', sizeBytes: FILE.length, sha256Hex: FILE_SHA, ttlSeconds });
}

/** PUT como o app faria: os cabeçalhos devolvidos (menos Content-Length, que o runtime calcula do corpo). */
async function put(url: string, headers: Readonly<Record<string, string>>, body: Buffer = FILE): Promise<number> {
  const sent: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) if (name.toLowerCase() !== 'content-length') sent[name] = value;
  const response = await fetch(url, { method: 'PUT', headers: sent, body });
  await response.arrayBuffer();
  return response.status;
}

describe('adaptador local: validade das URLs (≤ 300 s, recusada depois de vencer)', () => {
  test('URL de envio vale até 300 s: no segundo 300 o PUT passa e o objeto aparece com tamanho e SHA-256', async () => {
    const key = KEY.replace('0002', '0102');
    const signed = await uploadUrl(key);
    assert.equal(signed.method, 'PUT');
    assert.equal(signed.expiresAt.getTime() - clockMs, 300_000);
    clockMs += 300_000; // exatamente no limite: ainda vale
    try {
      assert.equal(await put(signed.url, signed.headers), 200);
    } finally {
      clockMs -= 300_000;
    }
    assert.deepEqual(await local.inspect(key), { sizeBytes: FILE.length, sha256Hex: FILE_SHA });
  });

  test('URL de envio VENCIDA (300 s + 1 ms): 403 e nada gravado', async () => {
    const key = KEY.replace('0002', '0103');
    const signed = await uploadUrl(key);
    clockMs += 300_001;
    try {
      assert.equal(await put(signed.url, signed.headers), 403);
    } finally {
      clockMs -= 300_001;
    }
    assert.equal(await local.inspect(key), null);
  });

  test('validade acima de 300 s (ou zero, ou fracionária) é recusada na hora de assinar, nos dois adaptadores', async () => {
    for (const ttlSeconds of [301, 0, 1.5, 3600]) {
      await assert.rejects(uploadUrl(KEY, ttlSeconds), RangeError);
      await assert.rejects(local.presignView({ key: KEY, ttlSeconds }), RangeError);
    }
    const s3 = createS3DocumentStorage({ region: 'br-se1', bucket: 'vuumbora-docs', accessKeyId: 'AKIATESTE', secretAccessKey: 'segredo-de-teste', forcePathStyle: true, endpoint: 'https://s3.teste.invalid' });
    await assert.rejects(s3.presignUpload({ key: KEY, contentType: 'image/jpeg', sizeBytes: 10, sha256Hex: FILE_SHA, ttlSeconds: 301 }), RangeError);
    await assert.rejects(s3.presignView({ key: KEY, ttlSeconds: 301 }), RangeError);
    await s3.close();
  });

  test('URL de visualização: serve o arquivo com no-store dentro da validade e dá 403 depois', async () => {
    const key = KEY.replace('0002', '0104');
    const signed = await uploadUrl(key);
    assert.equal(await put(signed.url, signed.headers), 200);
    const view = await local.presignView({ key, ttlSeconds: 120 });
    assert.equal(view.expiresAt.getTime() - clockMs, 120_000);
    const ok = await fetch(view.url);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await ok.arrayBuffer()), FILE);
    clockMs += 120_001;
    try {
      const late = await fetch(view.url);
      await late.arrayBuffer();
      assert.equal(late.status, 403);
    } finally {
      clockMs -= 120_001;
    }
  });
});

describe('adaptador local: o envio amarra tipo, tamanho e conteúdo (como o S3)', () => {
  test('outro conteúdo do MESMO tamanho: 400 (BadDigest) e nada gravado', async () => {
    const key = KEY.replace('0002', '0201');
    const signed = await uploadUrl(key);
    const forged = Buffer.from(FILE);
    forged[0] = forged[0]! ^ 1;
    assert.equal(await put(signed.url, signed.headers, forged), 400);
    assert.equal(await local.inspect(key), null);
  });

  test('outro tamanho, outro content-type, checksum ausente ou URL adulterada: recusado e nada gravado', async () => {
    const key = KEY.replace('0002', '0202');
    const signed = await uploadUrl(key);
    assert.equal(await put(signed.url, signed.headers, Buffer.concat([FILE, Buffer.from('x')])), 403, 'tamanho diferente do assinado');
    assert.equal(await put(signed.url, { ...signed.headers, 'Content-Type': 'image/png' }), 403, 'content-type diferente');
    const { ['x-amz-checksum-sha256']: _checksum, ...withoutChecksum } = signed.headers;
    assert.equal(await put(signed.url, withoutChecksum), 403, 'sem o cabeçalho assinado');
    assert.equal(await put(signed.url.replace(/X-Local-Signature=[0-9a-f]/, 'X-Local-Signature=0'), signed.headers), 403, 'assinatura adulterada');
    assert.equal(await put(signed.url.replace('0202', '0203'), signed.headers), 403, 'URL de outra chave');
    assert.equal(await local.inspect(key), null);
  });

  test('chave fora de driver-docs/, com .. ou com //: recusada antes de assinar', async () => {
    for (const key of ['outros/x.jpg', 'driver-docs/../x.jpg', 'driver-docs//x.jpg', 'driver-docs/', `driver-docs/${'a'.repeat(400)}`]) {
      await assert.rejects(uploadUrl(key), RangeError, key);
    }
  });
});

describe('adaptador S3 (sem provedor): URL pré-assinada e HeadObject', () => {
  const config = { region: 'br-se1', bucket: 'vuumbora-docs', accessKeyId: 'AKIATESTE', secretAccessKey: 'segredo-de-teste', forcePathStyle: true } as const;

  test('envio: X-Amz-Expires ≤ 300, tipo/tamanho/checksum ASSINADOS como cabeçalho; nenhum segredo na URL', async () => {
    const signedAt = Date.parse('2026-11-27T12:00:00Z');
    const s3 = createS3DocumentStorage({ ...config, endpoint: 'https://br-se1.magaluobjects.com' }, { now: () => signedAt });
    const signed = await s3.presignUpload({ key: KEY, contentType: 'image/jpeg', sizeBytes: FILE.length, sha256Hex: FILE_SHA, ttlSeconds: 300 });
    const url = new URL(signed.url);
    assert.equal(url.origin, 'https://br-se1.magaluobjects.com');
    assert.equal(url.pathname, `/vuumbora-docs/${KEY}`);
    assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
    assert.equal(url.searchParams.get('X-Amz-Date'), '20261127T120000Z');
    const signedHeaders = (url.searchParams.get('X-Amz-SignedHeaders') ?? '').split(';');
    for (const header of ['content-length', 'content-type', 'host', 'x-amz-checksum-sha256', 'x-amz-meta-sha256']) {
      assert.ok(signedHeaders.includes(header), `${header} fora da assinatura: ${signedHeaders.join(';')}`);
    }
    // O hash vai no CABEÇALHO (o cliente é obrigado a mandá-lo); na query ele não obrigaria nada.
    assert.equal(url.searchParams.get('x-amz-checksum-sha256'), null);
    assert.equal(url.searchParams.get('x-amz-checksum-crc32'), null, 'checksum automático de corpo vazio (SDK >= 3.729) quebraria o envio');
    assert.ok(!signed.url.includes('segredo-de-teste'));
    assert.deepEqual(signed.headers, {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(FILE.length),
      'x-amz-checksum-sha256': sha256HexToBase64(FILE_SHA),
      'x-amz-meta-sha256': FILE_SHA,
    });
    assert.equal(signed.expiresAt.getTime(), signedAt + 300_000);
    await s3.close();
  });

  test('visualização: X-Amz-Expires ≤ 300 e resposta sem cache (no-store)', async () => {
    const s3 = createS3DocumentStorage({ ...config, endpoint: 'https://br-se1.magaluobjects.com' });
    const view = await s3.presignView({ key: KEY, ttlSeconds: 300 });
    const url = new URL(view.url);
    assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
    assert.equal(url.searchParams.get('response-cache-control'), 'no-store');
    await s3.close();
  });

  describe('inspect contra um endpoint S3 falso', () => {
    let server: Server;
    let endpoint = '';
    const seen: { method: string; url: string; checksumMode: string | undefined }[] = [];

    before(async () => {
      server = createServer((request, response) => {
        seen.push({ method: request.method ?? '', url: request.url ?? '', checksumMode: request.headers['x-amz-checksum-mode'] as string | undefined });
        if (request.url?.includes('ausente')) {
          response.writeHead(404).end();
        } else if (request.url?.includes('quebrado')) {
          response.writeHead(500).end();
        } else if (request.url?.includes('so-metadado')) {
          response.writeHead(200, { 'content-length': String(FILE.length), 'x-amz-meta-sha256': FILE_SHA }).end();
        } else {
          response.writeHead(200, { 'content-length': String(FILE.length), 'x-amz-checksum-sha256': sha256HexToBase64(FILE_SHA), 'x-amz-meta-sha256': 'f'.repeat(64) }).end();
        }
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    after(async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    test('HEAD com ChecksumMode: o checksum do provedor VENCE o metadado; sem checksum, vale o metadado; 404 = null; 500 lança', async () => {
      const s3 = createS3DocumentStorage({ ...config, endpoint, requestTimeoutMs: 2_000 });
      assert.deepEqual(await s3.inspect('driver-docs/u/ok.jpg'), { sizeBytes: FILE.length, sha256Hex: FILE_SHA });
      assert.deepEqual(await s3.inspect('driver-docs/u/so-metadado.jpg'), { sizeBytes: FILE.length, sha256Hex: FILE_SHA });
      assert.equal(await s3.inspect('driver-docs/u/ausente.jpg'), null);
      await assert.rejects(s3.inspect('driver-docs/u/quebrado.jpg'));
      await s3.close();
      const first = seen[0]!;
      assert.equal(first.method, 'HEAD');
      assert.equal(first.url, '/vuumbora-docs/driver-docs/u/ok.jpg');
      assert.equal(first.checksumMode, 'ENABLED');
    });
  });
});

describe('configuração por ambiente (falha fechada, nunca derruba o boot)', () => {
  const S3_ENV = {
    DOCUMENT_STORAGE_DRIVER: 's3',
    DOCUMENT_STORAGE_S3_ENDPOINT: 'https://br-se1.magaluobjects.com',
    DOCUMENT_STORAGE_S3_REGION: 'br-se1',
    DOCUMENT_STORAGE_S3_BUCKET: 'vuumbora-docs',
    DOCUMENT_STORAGE_S3_ACCESS_KEY_ID: 'AKIA-VALOR-QUE-NAO-PODE-VAZAR',
    DOCUMENT_STORAGE_S3_SECRET_ACCESS_KEY: 'SEGREDO-QUE-NAO-PODE-VAZAR',
  };

  test('local: só com NODE_ENV de desenvolvimento ou teste', () => {
    for (const nodeEnv of ['development', 'test']) assert.ok(loadDocumentStorageConfig({ DOCUMENT_STORAGE_DRIVER: 'local', NODE_ENV: nodeEnv }).ok, nodeEnv);
  });

  test('S3 completo: ok, validade padrão 300 s', () => {
    const loaded = loadDocumentStorageConfig(S3_ENV);
    assert.ok(loaded.ok);
    assert.equal(loaded.config.kind, 's3');
    assert.equal(loaded.config.urlTtlSeconds, 300);
  });

  test('sem driver, driver desconhecido, S3 incompleto, TTL acima de 300 e local em produção: indisponível, motivo SEM valor', () => {
    const cases: Record<string, string | undefined>[] = [
      {},
      { DOCUMENT_STORAGE_DRIVER: 'ftp' },
      { ...S3_ENV, DOCUMENT_STORAGE_S3_SECRET_ACCESS_KEY: '' },
      { ...S3_ENV, DOCUMENT_STORAGE_S3_ENDPOINT: 'http://sem-tls.invalid' },
      { ...S3_ENV, DOCUMENT_URL_TTL_SECONDS: '301' },
      { DOCUMENT_STORAGE_DRIVER: 'local', NODE_ENV: 'production' },
      // S-3: NODE_ENV ausente vale produção (como em env.ts), e qualquer valor que não seja desenvolvimento ou teste também.
      { DOCUMENT_STORAGE_DRIVER: 'local' },
      { DOCUMENT_STORAGE_DRIVER: 'local', NODE_ENV: 'staging' },
    ];
    for (const source of cases) {
      const loaded = loadDocumentStorageConfig(source);
      assert.equal(loaded.ok, false, JSON.stringify(Object.keys(source)));
      if (!loaded.ok) {
        const text = loaded.reasons.join(' ');
        assert.ok(!text.includes('VAZAR') && !text.includes('sem-tls'), text);
      }
    }
  });
});
