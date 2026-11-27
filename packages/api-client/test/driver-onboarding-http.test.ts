/**
 * Adaptadores `http` do cadastro do motorista (fatia D4) com `fetch` FALSO: o que vai no fio (método, caminho, token,
 * corpo campo a campo) e o mapeamento de CADA erro do catálogo — que tem de ser IGUAL ao do mock (`catalogError`).
 * A prova contra a API real (Fastify + Postgres + armazenamento local, fetch de verdade) é a do relatório da D4 e a
 * suíte `apps/api/test/driver-onboarding-routes.test.ts`.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  createDocumentUploadHttpAdapter,
  createDriverJourneyHttpAdapter,
  createDriverOnboardingHttpAdapter,
} from '../src/driver/onboarding-http-adapter';
import { DRIVER_AVAILABILITY_ERRORS, DRIVER_ONBOARDING_ERRORS } from '../src/driver/onboarding-types';
import { catalogError, type ErrorCatalog } from '../src/server-error';

interface Seen { readonly url: string; readonly method: string; readonly headers: Record<string, string>; readonly body: unknown }

function fakeFetch(respond: (seen: Seen) => { status: number; body?: unknown }) {
  const calls: Seen[] = [];
  const impl = (async (input: string | URL, init?: RequestInit) => {
    const seen: Seen = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: { ...((init?.headers as Record<string, string>) ?? {}) },
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
    };
    calls.push(seen);
    const { status, body } = respond(seen);
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { impl, calls };
}

const session = { run: <T>(call: (token: string) => Promise<T>) => call('token-de-teste') } as never;
const options = (impl: typeof fetch) => ({ baseUrl: 'https://api.teste.vuumbora.dev/', appVersion: '1.2.3', session, fetch: impl });

describe('createDriverOnboardingHttpAdapter', () => {
  test('cada erro do catálogo vira EXATAMENTE o erro do mock (mesmo kind, code e campo)', async () => {
    for (const [code, entry] of Object.entries(DRIVER_ONBOARDING_ERRORS)) {
      const { impl } = fakeFetch(() => ({ status: entry.status, body: { ok: false, error: { code, message: entry.message } } }));
      const result = await createDriverOnboardingHttpAdapter(options(impl)).requestUploadUrl({ typeCode: 'cnh', contentType: 'image/jpeg', sizeBytes: 1, sha256: 'a'.repeat(64) });
      assert.equal(result.ok, false);
      assert.deepEqual(!result.ok && result.error, catalogError(DRIVER_ONBOARDING_ERRORS, code as keyof typeof DRIVER_ONBOARDING_ERRORS), code);
    }
  });

  test('fio: método, caminho, Bearer da sessão, X-App-Version e corpo campo a campo (sobra do formulário não vai)', async () => {
    const { impl, calls } = fakeFetch((seen) => ({
      status: 200,
      body: { ok: true, data: seen.url.endsWith('/onboarding') ? { status: 'pending_documents' } : { vehicleId: 'v1' } },
    }));
    const port = createDriverOnboardingHttpAdapter(options(impl));
    const extra = { confirmCpf: 'x' } as object;
    await port.saveOnboarding({
      cpf: '529.982.247-25', birthDate: '1990-01-10',
      address: { street: 'Rua A', number: '1', neighborhood: 'Tirol', city: 'Natal', state: 'RN', postalCode: '59020090', ...extra },
      cnh: { number: '12345678901', category: 'B', expiresOn: '2031-01-01', ear: true },
      ...extra,
    });
    await port.saveVehicle({ plate: 'ABC1D23', brand: 'Fiat', model: 'Argo', year: 2023, color: 'Prata', ...extra });
    assert.equal(calls[0]!.url, 'https://api.teste.vuumbora.dev/v1/driver/onboarding');
    assert.equal(calls[0]!.method, 'PUT');
    assert.equal(calls[0]!.headers['Authorization'], 'Bearer token-de-teste');
    assert.equal(calls[0]!.headers['X-App-Version'], '1.2.3');
    assert.deepEqual(Object.keys(calls[0]!.body as object).sort(), ['address', 'birthDate', 'cnh', 'cpf']);
    assert.ok(!('confirmCpf' in ((calls[0]!.body as { address: object }).address)));
    assert.deepEqual(calls[1]!.body, { plate: 'ABC1D23', brand: 'Fiat', model: 'Argo', year: 2023, color: 'Prata' });
  });

  test('sucesso com forma inesperada (portal cativo, proxy) vira unknown; resposta certa vem com origin real', async () => {
    const wrong = fakeFetch(() => ({ status: 200, body: { ok: true, data: { status: 'aprovadissimo' } } }));
    const bad = await createDriverOnboardingHttpAdapter(options(wrong.impl)).verification();
    assert.equal(!bad.ok && bad.error.kind, 'unknown');
    const right = fakeFetch(() => ({
      status: 200,
      body: { ok: true, data: { status: 'under_review', reviewDeadline: '2026-11-29T12:00:00.000Z', onboarding: { profileSubmitted: true, vehicleRegistered: true }, requirements: [{ typeCode: 'cnh', label: 'CNH', required: true, hasExpiry: true, document: { id: 'd1', status: 'submitted' } }] } },
    }));
    const good = await createDriverOnboardingHttpAdapter(options(right.impl)).verification();
    assert.ok(good.ok && good.origin === 'real' && good.data.requirements[0]!.document!.status === 'submitted');
  });

  test('sem conexão vira network; baseUrl http sem allowInsecureHttp é recusada na montagem', async () => {
    const offline = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
    const result = await createDriverOnboardingHttpAdapter(options(offline)).linkApplication();
    assert.deepEqual(!result.ok && result.error, { kind: 'network', retryable: true });
    assert.throws(() => createDriverOnboardingHttpAdapter({ ...options(offline), baseUrl: 'http://api.teste.vuumbora.dev' }), /https/);
  });
});

describe('createDriverJourneyHttpAdapter', () => {
  test('cada erro de PUT /v1/driver/availability vira o mesmo erro do mock; desligar não manda ponto', async () => {
    for (const [code, entry] of Object.entries(DRIVER_AVAILABILITY_ERRORS as ErrorCatalog)) {
      const { impl } = fakeFetch(() => ({ status: entry.status, body: { ok: false, error: { code, message: entry.message } } }));
      const result = await createDriverJourneyHttpAdapter(options(impl)).setAvailability({ online: true, point: { latitude: -5.8, longitude: -35.2 } });
      assert.deepEqual(!result.ok && result.error, catalogError(DRIVER_AVAILABILITY_ERRORS, code as keyof typeof DRIVER_AVAILABILITY_ERRORS), code);
    }
    const { impl, calls } = fakeFetch(() => ({ status: 200, body: { ok: true, data: { phase: 'offline' } } }));
    const off = await createDriverJourneyHttpAdapter(options(impl)).setAvailability({ online: false });
    assert.ok(off.ok && off.data.phase === 'offline');
    assert.deepEqual(calls[0]!.body, { online: false });
  });
});

describe('createDocumentUploadHttpAdapter', () => {
  const target = { documentId: 'd1', uploadUrl: 'https://armazenamento.teste/o/x', method: 'PUT' as const, headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '3', 'x-amz-checksum-sha256': 'abc=' } };

  test('PUT com os cabeçalhos assinados (menos Content-Length, que o runtime calcula) e progresso 1 no fim', async () => {
    const calls: Seen[] = [];
    const impl = (async (input: string | URL, init?: RequestInit) => {
      if (String(input).startsWith('data:')) return new Response(new Uint8Array([1, 2, 3]));
      calls.push({ url: String(input), method: init?.method ?? 'GET', headers: { ...((init?.headers as Record<string, string>) ?? {}) }, body: init?.body });
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    let progress = 0;
    const result = await createDocumentUploadHttpAdapter({ fetch: impl }).upload({ ...target, expiresAt: new Date(Date.now() + 60_000).toISOString() }, { uri: 'data:image/jpeg;base64,AQID' }, (f) => (progress = f));
    assert.ok(result.ok);
    assert.equal(progress, 1);
    assert.equal(calls[0]!.method, 'PUT');
    assert.deepEqual(calls[0]!.headers, { 'Content-Type': 'image/jpeg', 'x-amz-checksum-sha256': 'abc=' });
  });

  test('URL vencida (pelo relógio, ou 403 do armazenamento): forbidden com code upload_url_expired', async () => {
    const forbidden = (async (input: string | URL) =>
      String(input).startsWith('data:') ? new Response(new Uint8Array([1])) : new Response(null, { status: 403 })) as typeof fetch;
    const uploader = createDocumentUploadHttpAdapter({ fetch: forbidden });
    const expired = { kind: 'forbidden', code: 'upload_url_expired' };
    assert.deepEqual(await uploader.upload({ ...target, expiresAt: new Date(Date.now() - 1).toISOString() }, { uri: 'data:,x' }), { ok: false, error: expired });
    assert.deepEqual(await uploader.upload({ ...target, expiresAt: new Date(Date.now() + 60_000).toISOString() }, { uri: 'data:,x' }), { ok: false, error: expired });
  });
});
