/**
 * Adaptador http da fila de documentos (D7) contra um `fetch` falso: rota, método, cabeçalhos
 * (`Idempotency-Key`, `X-CSRF-Token` só em mutação), corpo, tradução de erro (o servidor do M3 manda só
 * `{ code, message }`) e a FALHA FECHADA — sem nunca escrever a URL assinada no console.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { createHttpDocumentReviewAdapter } from '../src/api/documentReview';
import { clearCsrfToken, setCsrfToken } from '../src/api/csrf';

const BASE = 'https://api.exemplo.invalid';
const SIGNED_URL = 'https://bucket.exemplo.invalid/driver-docs/demo-ana/demo-ana-cnh?X-Amz-Signature=segredo123';

interface Call {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly credentials: RequestCredentials | undefined;
}

let calls: Call[] = [];
let reply: (call: Call) => { readonly status: number; readonly body: unknown; readonly headers?: Readonly<Record<string, string>> } = () => ({
  status: 200,
  body: { ok: true, data: {} },
});
let logged: string[] = [];
const realFetch = globalThis.fetch;
const realError = console.error;
const realLog = console.log;
const realWarn = console.warn;

beforeEach(() => {
  calls = [];
  logged = [];
  setCsrfToken('csrf-de-teste');
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: { ...((init?.headers as Record<string, string> | undefined) ?? {}) },
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      credentials: init?.credentials,
    };
    calls.push(call);
    const { status, body, headers } = reply(call);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  }) as typeof fetch;
  const capture = (...args: unknown[]) => logged.push(args.map(String).join(' '));
  console.error = capture;
  console.log = capture;
  console.warn = capture;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
  console.log = realLog;
  console.warn = realWarn;
  clearCsrfToken();
});

const ok = (data: unknown) => () => ({ status: 200, body: { ok: true, data } });
const err = (status: number, code: string, message = 'msg do servidor') => () => ({ status, body: { ok: false, error: { code, message } } });

describe('rotas, métodos e cabeçalhos', () => {
  test('fila: GET com filtros na query, sem CSRF', async () => {
    reply = ok({ items: [] });
    const port = createHttpDocumentReviewAdapter(BASE);
    const result = await port.queue({ status: 'approved', cursor: 'c1', limit: 10 });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, 'GET');
    assert.equal(calls[0]?.url, `${BASE}/v1/admin/document-reviews?status=approved&cursor=c1&limit=10`);
    assert.equal(calls[0]?.credentials, 'include');
    assert.equal(calls[0]?.headers['X-CSRF-Token'], undefined);
  });

  test('view-url: POST com CSRF, id codificado na rota', async () => {
    reply = ok({ url: SIGNED_URL, expiresAt: new Date(Date.now() + 300_000).toISOString() });
    const port = createHttpDocumentReviewAdapter(BASE);
    const result = await port.viewUrl('doc/1');
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.url, SIGNED_URL);
    assert.equal(calls[0]?.method, 'POST');
    assert.equal(calls[0]?.url, `${BASE}/v1/admin/documents/doc%2F1/view-url`);
    assert.equal(calls[0]?.headers['X-CSRF-Token'], 'csrf-de-teste');
  });

  test('aprovar: corpo com expiresOn, Idempotency-Key e CSRF', async () => {
    reply = ok({ documentId: 'd1', status: 'approved', reviewedAt: '2026-11-27T12:00:00Z', expiresOn: '2030-01-01', driverStatus: 'approved' });
    const port = createHttpDocumentReviewAdapter(BASE);
    const result = await port.approve('d1', { expiresOn: '2030-01-01' }, 'chave-1');
    assert.equal(result.ok, true);
    assert.equal(calls[0]?.url, `${BASE}/v1/admin/documents/d1/approve`);
    assert.deepEqual(calls[0]?.body, { expiresOn: '2030-01-01' });
    assert.equal(calls[0]?.headers['Idempotency-Key'], 'chave-1');
    assert.equal(calls[0]?.headers['X-CSRF-Token'], 'csrf-de-teste');
  });

  test('aprovar sem validade manda corpo vazio', async () => {
    reply = ok({ documentId: 'd1', status: 'approved', reviewedAt: '2026-11-27T12:00:00Z', driverStatus: 'under_review' });
    await createHttpDocumentReviewAdapter(BASE).approve('d1', {}, 'chave-2');
    assert.deepEqual(calls[0]?.body, {});
  });

  test('recusar: só reasonCode e internalNote no corpo', async () => {
    reply = ok({ documentId: 'd1', status: 'rejected', reviewedAt: '2026-11-27T12:00:00Z', rejection: { code: 'illegible', text: 't' }, driverStatus: 'changes_requested' });
    await createHttpDocumentReviewAdapter(BASE).reject('d1', { reasonCode: 'illegible', internalNote: 'nota' }, 'chave-3');
    assert.equal(calls[0]?.url, `${BASE}/v1/admin/documents/d1/reject`);
    assert.deepEqual(calls[0]?.body, { reasonCode: 'illegible', internalNote: 'nota' });
    assert.equal(calls[0]?.headers['Idempotency-Key'], 'chave-3');
  });

  test('motivos, detalhe e suspensão', async () => {
    const port = createHttpDocumentReviewAdapter(BASE);
    reply = ok([{ code: 'illegible', text: 't' }]);
    assert.equal((await port.rejectionReasons()).ok, true);
    assert.equal(calls.at(-1)?.url, `${BASE}/v1/admin/document-rejection-reasons`);
    reply = ok({ driverId: 'x', status: 'suspended', suspendedAt: '2026-11-27T12:00:00Z' });
    assert.equal((await port.suspend('x', { reason: 'motivo longo o bastante' }, 'chave-4')).ok, true);
    assert.equal(calls.at(-1)?.url, `${BASE}/v1/admin/drivers/x/suspend`);
    assert.deepEqual(calls.at(-1)?.body, { reason: 'motivo longo o bastante' });
    assert.equal(calls.at(-1)?.headers['Idempotency-Key'], 'chave-4');
  });
});

describe('erros do servidor do M3 ({ code, message }, sem fields)', () => {
  const cases: ReadonlyArray<readonly [string, number, string, unknown]> = [
    ['403 forbidden (papel)', 403, 'forbidden', { kind: 'forbidden' }],
    ['403 csrf', 403, 'csrf_token_invalid', { kind: 'csrf_invalid' }],
    ['404', 404, 'not_found', { kind: 'not_found' }],
    ['409 já analisado', 409, 'invalid_transition', { kind: 'conflict', reason: 'invalid_transition' }],
    ['409 chave reusada', 409, 'idempotency_key_reused', { kind: 'conflict', reason: 'idempotency_key_reused' }],
    ['422 validade → campo expiresOn', 422, 'invalid_expires_on', { kind: 'validation', fields: { expiresOn: 'msg do servidor' } }],
    ['422 motivo → campo reasonCode', 422, 'unknown_reason', { kind: 'validation', fields: { reasonCode: 'msg do servidor' } }],
    ['400 motivo da suspensão → campo reason', 400, 'validation_failed', { kind: 'validation', fields: { reason: 'msg do servidor' } }],
    ['400 invalid_body (sem campo)', 400, 'invalid_body', { kind: 'unknown', message: 'msg do servidor' }],
    ['503', 503, 'unavailable', { kind: 'unavailable', retryable: true }],
  ];
  for (const [name, status, code, expected] of cases) {
    test(name, async () => {
      reply = err(status, code);
      const result = await createHttpDocumentReviewAdapter(BASE).approve('d1', {}, 'k');
      assert.deepEqual(result, { ok: false, error: expected });
    });
  }

  test('rede caída → network', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('failed to fetch');
    }) as typeof fetch;
    assert.deepEqual(await createHttpDocumentReviewAdapter(BASE).queue(), { ok: false, error: { kind: 'network', retryable: true } });
  });
});

describe('falha fechada, e a URL assinada nunca no console', () => {
  const badLinks: ReadonlyArray<readonly [string, unknown]> = [
    ['javascript:', { url: 'javascript:alert(1)', expiresAt: '2026-11-27T12:05:00Z' }],
    ['data:', { url: 'data:text/html,<script>alert(1)</script>', expiresAt: '2026-11-27T12:05:00Z' }],
    ['http fora de localhost', { url: 'http://bucket.exemplo.invalid/doc?X-Amz-Signature=segredo123', expiresAt: '2026-11-27T12:05:00Z' }],
    ['sem expiresAt', { url: SIGNED_URL }],
    ['expiresAt inválido', { url: SIGNED_URL, expiresAt: 'amanhã' }],
    ['url vazia', { url: '', expiresAt: '2026-11-27T12:05:00Z' }],
  ];
  for (const [name, body] of badLinks) {
    test(`view-url ${name} → contract_mismatch, sem valor no log`, async () => {
      reply = ok(body);
      const result = await createHttpDocumentReviewAdapter(BASE).viewUrl('d1');
      assert.deepEqual(result, { ok: false, error: { kind: 'contract_mismatch' } });
      assert.equal(logged.length, 1, 'um aviso no console');
      for (const line of logged) {
        assert.equal(line.includes('segredo123'), false);
        assert.equal(line.includes('bucket.exemplo.invalid'), false);
        assert.equal(line.includes('alert'), false);
      }
    });
  }

  test('http em localhost é aceito (adaptador local da D3, em desenvolvimento)', async () => {
    reply = ok({ url: 'http://localhost:9000/driver-docs/a?sig=1', expiresAt: '2026-11-27T12:05:00Z' });
    assert.equal((await createHttpDocumentReviewAdapter(BASE).viewUrl('d1')).ok, true);
  });

  test('caminho feliz do view-url não escreve NADA no console', async () => {
    reply = ok({ url: SIGNED_URL, expiresAt: '2026-11-27T12:05:00Z' });
    await createHttpDocumentReviewAdapter(BASE).viewUrl('d1');
    assert.deepEqual(logged, []);
  });

  test('documento do detalhe que traga URL embutida é recusado', async () => {
    reply = ok({
      driverId: 'x',
      fullName: 'Nome',
      email: 'a@b.invalid',
      applicationId: 'app',
      status: 'under_review',
      documents: [
        { documentId: 'd1', typeCode: 'cnh', typeLabel: 'CNH', status: 'submitted', contentType: 'image/jpeg', sizeBytes: 1, submittedAt: '2026-11-27T12:00:00Z', url: SIGNED_URL },
      ],
    });
    const result = await createHttpDocumentReviewAdapter(BASE).driver('x');
    assert.deepEqual(result, { ok: false, error: { kind: 'contract_mismatch' } });
    assert.equal(logged.some((line) => line.includes('segredo123')), false);
  });

  test('estado desconhecido, recusa sem motivo e catálogo vazio → contract_mismatch', async () => {
    const port = createHttpDocumentReviewAdapter(BASE);
    reply = ok({ items: [{ documentId: 'd', driverId: 'x', driverName: 'N', typeCode: 'cnh', typeLabel: 'CNH', status: 'pending', submittedAt: 'a', reviewDeadline: 'b', overdue: false }] });
    assert.deepEqual(await port.queue(), { ok: false, error: { kind: 'contract_mismatch' } });
    reply = ok({ documentId: 'd', status: 'rejected', reviewedAt: 'a', driverStatus: 'changes_requested' });
    assert.deepEqual(await port.reject('d', { reasonCode: 'illegible' }, 'k'), { ok: false, error: { kind: 'contract_mismatch' } });
    reply = ok([]);
    assert.deepEqual(await port.rejectionReasons(), { ok: false, error: { kind: 'contract_mismatch' } });
  });

  test('fila aceita nextCursor null como "não há mais"', async () => {
    reply = ok({ items: [], nextCursor: null });
    assert.deepEqual(await createHttpDocumentReviewAdapter(BASE).queue(), { ok: true, data: { items: [] }, origin: 'real' });
  });
});

describe('view-url: validade pelo relógio do servidor (cabeçalho Date)', () => {
  test('servidor 6 min ATRÁS do relógio local: o link vale 300 s a partir de agora, não "já venceu"', async () => {
    const serverNow = Date.now() - 6 * 60_000;
    reply = () => ({
      status: 200,
      body: { ok: true, data: { url: SIGNED_URL, expiresAt: new Date(serverNow + 300_000).toISOString() } },
      headers: { Date: new Date(serverNow).toUTCString() },
    });
    const before = Date.now();
    const result = await createHttpDocumentReviewAdapter(BASE).viewUrl('d1');
    assert.equal(result.ok, true);
    if (result.ok) {
      const ttl = Date.parse(result.data.expiresAt) - before;
      // O cabeçalho Date tem resolução de 1 s: até 1 s a mais, nunca o "vencido" de antes.
      assert.ok(ttl > 298_000 && ttl <= 301_500, `ttl=${ttl}`);
    }
  });

  test('sem cabeçalho Date e relógio local adiantado: teto de 300 s', async () => {
    reply = ok({ url: SIGNED_URL, expiresAt: new Date(Date.now() - 60_000).toISOString() });
    const before = Date.now();
    const result = await createHttpDocumentReviewAdapter(BASE).viewUrl('d1');
    assert.equal(result.ok, true);
    if (result.ok) {
      const ttl = Date.parse(result.data.expiresAt) - before;
      assert.ok(ttl > 299_000 && ttl <= 300_500, `ttl=${ttl}`);
    }
  });
});
