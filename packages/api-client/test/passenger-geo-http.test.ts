/**
 * Adaptador `http` de geografia e cotação do passageiro (G3/G4) com `fetch` FALSO: o que vai no fio (caminho, querystring,
 * token, corpo campo a campo), a conferência da resposta de sucesso e o mapeamento de CADA erro do catálogo — que tem de
 * ser IGUAL ao do mock (`catalogError`). A prova contra a API real fica em `apps/api/test/geo-routes.test.ts` e
 * `quote-routes.test.ts` (rotas) e na conferência de ponta a ponta do relatório da G3/G4.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createPassengerGeoHttpAdapter } from '../src/passenger/geo-http-adapter';
import { GEO_QUOTE_ERRORS, type GeoQuoteErrorCode } from '../src/passenger/geo-types';
import { catalogError } from '../src/server-error';

interface Seen { readonly url: string; readonly method: string; readonly headers: Record<string, string>; readonly body: unknown }

function fakeFetch(respond: (seen: Seen) => { status: number; body?: unknown; headers?: Record<string, string> }) {
  const calls: Seen[] = [];
  const impl = (async (input: string | URL, init?: RequestInit) => {
    const seen: Seen = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: { ...((init?.headers as Record<string, string>) ?? {}) },
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
    };
    calls.push(seen);
    const { status, body, headers } = respond(seen);
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...(headers ?? {}) } });
  }) as typeof fetch;
  return { impl, calls };
}

const session = { run: <T>(call: (token: string) => Promise<T>) => call('token-de-teste') } as never;
const options = (impl: typeof fetch) => ({ baseUrl: 'https://api.teste.vuumbora.dev/', appVersion: '1.2.3', session, fetch: impl });
const ok = (data: unknown) => ({ status: 200, body: { ok: true, data } });

const QUOTE = {
  quoteId: '6f1d3c2a-0000-4000-8000-000000000001', categorySlug: 'vuumbora', priceCents: 2235, currency: 'BRL',
  fareVersionId: '6f1d3c2a-0000-4000-8000-0000000000aa', isTestFare: true, expiresAt: '2026-11-27T20:05:00.000Z', signature: 'a'.repeat(43),
};
const MIDWAY = { lat: -5.811, lng: -35.2065, label: 'Midway Mall' };
const PRAIA = { lat: -5.871, lng: -35.1825, label: 'Praia Shopping' };

describe('createPassengerGeoHttpAdapter', () => {
  test('cada erro do catálogo vira EXATAMENTE o erro do mock (mesmo kind e code), nas duas portas', async () => {
    for (const [code, entry] of Object.entries(GEO_QUOTE_ERRORS)) {
      const { impl } = fakeFetch(() => ({ status: entry.status, body: { ok: false, error: { code, message: entry.message } } }));
      const { geoPort, quotePort } = createPassengerGeoHttpAdapter(options(impl));
      const expected = catalogError(GEO_QUOTE_ERRORS, code as GeoQuoteErrorCode);
      const search = await geoPort.search({ q: 'midway', kind: 'any' });
      const created = await quotePort.createQuotes({ origin: MIDWAY, destination: PRAIA });
      assert.deepEqual(!search.ok && search.error, expected, code);
      assert.deepEqual(!created.ok && created.error, expected, code);
    }
  });

  test('fora do catálogo: 503 geo_unavailable (servidor sem token), 403 not_passenger_account e 503 unavailable caem no kind certo', async () => {
    const cases: [number, string, string][] = [[503, 'geo_unavailable', 'unavailable'], [403, 'not_passenger_account', 'forbidden'], [503, 'unavailable', 'unavailable']];
    for (const [status, code, kind] of cases) {
      const { impl } = fakeFetch(() => ({ status, body: { ok: false, error: { code, message: 'x' } } }));
      const result = await createPassengerGeoHttpAdapter(options(impl)).quotePort.createQuotes({ origin: MIDWAY, destination: PRAIA });
      assert.equal(!result.ok && result.error.kind, kind, code);
      assert.equal(!result.ok && result.error.code, code);
    }
  });

  test('429 leva o Retry-After', async () => {
    const { impl } = fakeFetch(() => ({ status: 429, body: { ok: false, error: { code: 'rate_limited', message: 'x' } }, headers: { 'retry-after': '17' } }));
    const result = await createPassengerGeoHttpAdapter(options(impl)).geoPort.search({ q: 'midway' });
    assert.deepEqual(!result.ok && result.error, { kind: 'rate_limited', code: 'rate_limited', retryAfterSeconds: 17 });
  });

  test('fio da busca e do pino: querystring codificada, kind=any numa chamada só, near "lat,lng", Bearer e X-App-Version', async () => {
    const { impl, calls } = fakeFetch((seen) =>
      seen.url.includes('/reverse') ? ok({ label: 'Rua X', lat: -5.8, lng: -35.2, inServiceArea: true }) : ok({ results: [] }),
    );
    const { geoPort } = createPassengerGeoHttpAdapter(options(impl));
    await geoPort.search({ q: 'Av. Sen. Salgado Filho, 2234 & cia', kind: 'any', near: { lat: -5.81, lng: -35.21 } });
    await geoPort.search({ q: 'midway' });
    await geoPort.reverse({ lat: -5.8, lng: -35.2 });
    assert.equal(calls.length, 3);
    const first = new URL(calls[0]!.url);
    assert.equal(first.origin + first.pathname, 'https://api.teste.vuumbora.dev/v1/geo/search');
    assert.equal(first.searchParams.get('q'), 'Av. Sen. Salgado Filho, 2234 & cia');
    assert.equal(first.searchParams.get('kind'), 'any');
    assert.equal(first.searchParams.get('near'), '-5.81,-35.21');
    assert.equal(calls[0]!.method, 'GET');
    assert.equal(calls[0]!.headers['Authorization'], 'Bearer token-de-teste');
    assert.equal(calls[0]!.headers['X-App-Version'], '1.2.3');
    assert.equal(new URL(calls[1]!.url).searchParams.has('kind'), false, 'sem kind, o servidor aplica o padrão do contrato');
    assert.equal(calls[2]!.url, 'https://api.teste.vuumbora.dev/v1/geo/reverse?lat=-5.8&lng=-35.2');
  });

  test('fio da cotação: corpo campo a campo (sobra não vai), categorySlugs só se pedido, id codificado no GET', async () => {
    const { impl, calls } = fakeFetch((seen) => (seen.method === 'POST' ? ok({ route: { distanceM: 8658, durationS: 1286, polyline: 'abc' }, quotes: [QUOTE] }) : ok(QUOTE)));
    const { quotePort } = createPassengerGeoHttpAdapter(options(impl));
    const extra = { apelido: 'casa', confirmado: true } as object;
    await quotePort.createQuotes({ origin: { ...MIDWAY, ...extra }, destination: PRAIA, ...extra });
    await quotePort.createQuotes({ origin: MIDWAY, destination: PRAIA, categorySlugs: ['conforto'] });
    await quotePort.getQuote('id/estranho?x');
    assert.equal(calls[0]!.url, 'https://api.teste.vuumbora.dev/v1/quotes');
    assert.equal(calls[0]!.headers['Content-Type'], 'application/json');
    assert.deepEqual(calls[0]!.body, { origin: MIDWAY, destination: PRAIA });
    assert.deepEqual(calls[1]!.body, { origin: MIDWAY, destination: PRAIA, categorySlugs: ['conforto'] });
    assert.equal(calls[2]!.url, 'https://api.teste.vuumbora.dev/v1/quotes/id%2Festranho%3Fx');
  });

  test('sucesso conferido: a forma certa vem com origin real; forma errada (portal cativo, proxy) vira unknown', async () => {
    const good = fakeFetch(() => ok({ route: { distanceM: 8658, durationS: 1286, polyline: 'abc' }, quotes: [QUOTE] }));
    const created = await createPassengerGeoHttpAdapter(options(good.impl)).quotePort.createQuotes({ origin: MIDWAY, destination: PRAIA });
    assert.ok(created.ok && created.origin === 'real');
    assert.deepEqual(created.ok && created.data.quotes[0], QUOTE);

    const malformed: unknown[] = [
      { route: { distanceM: 8658.5, durationS: 1286, polyline: 'abc' }, quotes: [] },
      { route: { distanceM: 8658, durationS: 1286, polyline: 'abc' }, quotes: [{ ...QUOTE, currency: 'USD' }] },
      { route: { distanceM: 8658, durationS: 1286, polyline: 'abc' }, quotes: [{ ...QUOTE, priceCents: 22.35 }] },
      { route: { distanceM: 8658, durationS: 1286, polyline: 'abc' }, quotes: [{ ...QUOTE, expiresAt: 'amanhã' }] },
      '<html>login do wi-fi</html>',
    ];
    for (const data of malformed) {
      const { impl } = fakeFetch(() => ok(data));
      const result = await createPassengerGeoHttpAdapter(options(impl)).quotePort.createQuotes({ origin: MIDWAY, destination: PRAIA });
      assert.equal(!result.ok && result.error.kind, 'unknown', JSON.stringify(data));
    }
    const badSearch = fakeFetch(() => ok({ results: [{ id: 'x', label: 'L', sublabel: '', lat: 91, lng: 0, source: 'curated' }] }));
    const search = await createPassengerGeoHttpAdapter(options(badSearch.impl)).geoPort.search({ q: 'midway' });
    assert.equal(!search.ok && search.error.kind, 'unknown');
    const badArea = fakeFetch(() => ok({ areaId: 'a', name: 'N', polygon: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] }, bbox: [0, 0, 1, 1] }));
    const area = await createPassengerGeoHttpAdapter(options(badArea.impl)).geoPort.serviceArea();
    assert.equal(!area.ok && area.error.kind, 'unknown', 'polígono com anel aberto/curto não entra no app');
  });

  test('área e categorias válidas passam inteiras', async () => {
    const polygon = { type: 'Polygon', coordinates: [[[-35.42, -5.7], [-35.12, -6.02], [-35.2, -5.66], [-35.42, -5.7]]] };
    const { impl } = fakeFetch((seen) => (seen.url.endsWith('/v1/service-area')
      ? ok({ areaId: 'a1', name: 'Grande Natal', polygon, bbox: [-35.42, -6.02, -35.12, -5.66] })
      : ok([{ slug: 'vuumbora', name: 'VuumBora', description: 'Carro para o dia a dia.', seats: 4 }])));
    const { geoPort } = createPassengerGeoHttpAdapter(options(impl));
    const area = await geoPort.serviceArea();
    assert.deepEqual(area.ok && area.data, { areaId: 'a1', name: 'Grande Natal', polygon, bbox: [-35.42, -6.02, -35.12, -5.66] });
    const categories = await geoPort.categories();
    assert.deepEqual(categories.ok && categories.data, [{ slug: 'vuumbora', name: 'VuumBora', description: 'Carro para o dia a dia.', seats: 4 }]);
  });

  test('sem conexão: network; baseUrl http sem allowInsecureHttp: recusa na montagem', async () => {
    const failing = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    const result = await createPassengerGeoHttpAdapter(options(failing)).geoPort.categories();
    assert.deepEqual(!result.ok && result.error, { kind: 'network', retryable: true });
    assert.throws(() => createPassengerGeoHttpAdapter({ ...options(failing), baseUrl: 'http://api.teste.vuumbora.dev' }), /https/);
  });
});
