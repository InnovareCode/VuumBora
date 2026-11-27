/**
 * `createMockPassengerGeo` (M4, fatia K0 do `docs/plano-m3-m4.md`): busca com pontos próprios
 * primeiro, pino com `inServiceArea`, área, categorias ligadas e cotação assinada de 5 min, com CADA
 * erro do §3 (`outside_service_area`, `route_too_short`, `route_unavailable`, `fare_not_configured`,
 * `quote_expired`).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { decodePolyline, isPointInServiceArea } from '@vuumbora/domain';
import { MOCK_SERVICE_AREA } from '../src/geo/mock-data';
import { createMockPassengerGeo, MOCK_GEO_PLACES } from '../src/passenger/geo-mock-adapter';
import type { QuotePoint } from '../src/passenger/geo-types';

const NOW = Date.parse('2026-11-27T12:00:00Z');
const MIDWAY: QuotePoint = { lat: -5.8113, lng: -35.2061, label: 'Midway Mall' };
const PONTA_NEGRA: QuotePoint = { lat: -5.8871, lng: -35.1712, label: 'Praia de Ponta Negra' };
/** No mar, a leste: dentro da caixa ampla de busca, fora da área. */
const MAR: QuotePoint = { lat: -5.8, lng: -35.05, label: 'Mar' };
/** Dentro da `bbox` da área e FORA do polígono (canto nordeste recortado). */
const CANTO_NE: QuotePoint = { lat: -5.65, lng: -35.14, label: 'Canto' };

function setup(options: Parameters<typeof createMockPassengerGeo>[0] = {}) {
  let clockMs = NOW;
  const mock = createMockPassengerGeo({ clock: () => clockMs, ...options });
  return { ...mock, advance: (ms: number) => (clockMs += ms) };
}

function expectError(result: { ok: boolean; error?: { kind: string; code?: string } }, kind: string, code: string): void {
  assert.equal(result.ok, false, `esperava ${code}`);
  assert.equal(result.error?.kind, kind);
  assert.equal(result.error?.code, code);
}

describe('dados do mock', () => {
  test('todo lugar de exemplo está dentro da área ilustrativa', () => {
    for (const place of MOCK_GEO_PLACES) {
      assert.ok(isPointInServiceArea({ latitude: place.lat, longitude: place.lng }, MOCK_SERVICE_AREA), place.label);
    }
  });
});

describe('GET /v1/geo/search', () => {
  test('pontos próprios primeiro, sem acento, no máximo 8', async () => {
    const { geoPort } = setup();
    const result = await geoPort.search({ q: 'natal', kind: 'place' });
    assert.ok(result.ok);
    const sources = result.data.results.map((item) => item.source);
    assert.ok(sources.length > 0 && sources.length <= 8);
    assert.equal(sources[0], 'curated');
    assert.deepEqual(sources, [...sources].sort((a, b) => Number(b === 'curated') - Number(a === 'curated')));
    const accent = await geoPort.search({ q: 'TERMINAL RODOVIARIO' });
    assert.ok(accent.ok);
    assert.equal(accent.data.results[0]?.id, 'cur-rodoviaria');
  });

  test('kind: address traz geocoding, place traz searchbox (pontos próprios nos dois)', async () => {
    const { geoPort } = setup();
    const address = await geoPort.search({ q: 'ponta negra', kind: 'address' });
    const place = await geoPort.search({ q: 'ponta negra', kind: 'place' });
    assert.ok(address.ok && place.ok);
    assert.ok(address.data.results.every((item) => item.source !== 'searchbox'));
    assert.ok(place.data.results.every((item) => item.source !== 'geocoding'));
    assert.ok(place.data.results.some((item) => item.id === 'sb-morro'));
  });

  test('kind any: as duas fontes numa chamada só (G3), pontos próprios primeiro', async () => {
    const { geoPort } = setup();
    const result = await geoPort.search({ q: 'ponta negra', kind: 'any' });
    assert.ok(result.ok);
    const sources = new Set(result.data.results.map((item) => item.source));
    assert.ok(sources.has('geocoding') && sources.has('searchbox'), [...sources].join(','));
  });

  test('near ordena os não-próprios por distância', async () => {
    const { geoPort } = setup();
    const result = await geoPort.search({ q: 'tirol', kind: 'address', near: { lat: -5.8053, lng: -35.2012 } });
    assert.ok(result.ok);
    const geocoding = result.data.results.filter((item) => item.source === 'geocoding');
    assert.equal(geocoding[0]?.id, 'geo-hermes');
  });

  test('menos de 2 caracteres: lista vazia sem erro; mais de 100: 400 invalid_body', async () => {
    const { geoPort } = setup();
    const short = await geoPort.search({ q: ' a ' });
    assert.ok(short.ok);
    assert.deepEqual(short.data.results, []);
    expectError(await geoPort.search({ q: 'x'.repeat(101) }), 'validation', 'invalid_body');
    expectError(await geoPort.search({ q: 'midway', kind: 'rua' as never }), 'validation', 'invalid_body');
  });

  test('429 rate_limited e 502 geo_unavailable (forçados)', async () => {
    const { geoPort, control } = setup();
    control.failNext('rate_limited');
    expectError(await geoPort.search({ q: 'midway' }), 'rate_limited', 'rate_limited');
    control.failNext('geo_unavailable');
    expectError(await geoPort.search({ q: 'midway' }), 'unavailable', 'geo_unavailable');
  });
});

describe('GET /v1/geo/reverse e área', () => {
  test('pino perto de um lugar conhecido usa o nome; fora da área NÃO é erro', async () => {
    const { geoPort } = setup();
    const near = await geoPort.reverse({ lat: -5.8114, lng: -35.2062 });
    assert.ok(near.ok);
    assert.deepEqual(near.data, { label: 'Midway Mall', lat: -5.8114, lng: -35.2062, inServiceArea: true });
    const outside = await geoPort.reverse({ lat: CANTO_NE.lat, lng: CANTO_NE.lng });
    assert.ok(outside.ok);
    assert.equal(outside.data.inServiceArea, false);
    assert.equal(outside.data.label, 'Local marcado no mapa');
    expectError(await geoPort.reverse({ lat: 91, lng: 0 }), 'validation', 'invalid_body');
  });

  test('serviceArea devolve polígono GeoJSON e bbox', async () => {
    const { geoPort } = setup();
    const result = await geoPort.serviceArea();
    assert.ok(result.ok);
    assert.equal(result.data.polygon.type, 'Polygon');
    assert.equal(result.data.bbox.length, 4);
  });

  test('categories: só as ligadas (Motorista mulher, Entrega e Pet desligadas)', async () => {
    const { geoPort, control } = setup();
    const result = await geoPort.categories();
    assert.ok(result.ok);
    assert.deepEqual(result.data.map((category) => category.slug), ['vuumbora', 'conforto']);
    assert.ok(!('enabled' in (result.data[0] ?? {})));
    control.setCategoryEnabled('pet', true);
    const withPet = await geoPort.categories();
    assert.ok(withPet.ok);
    assert.ok(withPet.data.some((category) => category.slug === 'pet'));
  });
});

describe('POST /v1/quotes', () => {
  test('uma cotação por categoria ligada: assinada, de teste, 5 min, rota decodificável', async () => {
    const { quotePort } = setup();
    const result = await quotePort.createQuotes({ origin: MIDWAY, destination: PONTA_NEGRA });
    assert.ok(result.ok);
    const { route, quotes } = result.data;
    assert.ok(route.distanceM > 0 && route.durationS > 0);
    const decoded = decodePolyline(route.polyline);
    assert.equal(decoded.length, 2);
    assert.ok(Math.abs((decoded[0]?.latitude ?? 0) - MIDWAY.lat) < 1e-5);
    assert.ok(Math.abs((decoded[1]?.longitude ?? 0) - PONTA_NEGRA.lng) < 1e-5);
    assert.deepEqual(quotes.map((quote) => quote.categorySlug), ['vuumbora', 'conforto']);
    for (const quote of quotes) {
      assert.equal(quote.currency, 'BRL');
      assert.equal(quote.isTestFare, true);
      assert.equal(quote.fareVersionId, 'fare-test-1');
      assert.equal(quote.expiresAt, new Date(NOW + 300_000).toISOString());
      assert.match(quote.signature, /^mock-[0-9a-f]{8}$/);
      assert.ok(Number.isInteger(quote.priceCents) && quote.priceCents > 0);
    }
    assert.notEqual(quotes[0]?.quoteId, quotes[1]?.quoteId);
    assert.ok((quotes[1]?.priceCents ?? 0) > (quotes[0]?.priceCents ?? 0), 'Conforto custa mais');
  });

  test('categorySlugs filtra; desconhecida ou desligada é ignorada, sem erro', async () => {
    const { quotePort } = setup();
    const result = await quotePort.createQuotes({ origin: MIDWAY, destination: PONTA_NEGRA, categorySlugs: ['conforto', 'pet', 'moto'] });
    assert.ok(result.ok);
    assert.deepEqual(result.data.quotes.map((quote) => quote.categorySlug), ['conforto']);
    const none = await quotePort.createQuotes({ origin: MIDWAY, destination: PONTA_NEGRA, categorySlugs: ['moto'] });
    assert.ok(none.ok);
    assert.deepEqual(none.data.quotes, []);
  });

  test('503 fare_not_configured: produção (allowTestFares falso) só com tarifa de teste (N8)', async () => {
    const { quotePort, control } = setup({ allowTestFares: false });
    expectError(await quotePort.createQuotes({ origin: MIDWAY, destination: PONTA_NEGRA }), 'unavailable', 'fare_not_configured');
    control.setAllowTestFares(true);
    assert.ok((await quotePort.createQuotes({ origin: MIDWAY, destination: PONTA_NEGRA })).ok);
  });

  test('tarifa REAL cota mesmo com allowTestFares falso, e isTestFare sai false', async () => {
    const { quotePort } = setup({
      allowTestFares: false,
      fareVersion: { fareVersionId: 'fare-real-1', isTest: false, categories: [{ categorySlug: 'vuumbora', baseCents: 500, perKmCents: 100, perMinuteCents: 10, minimumFareCents: 700 }] },
    });
    const result = await quotePort.createQuotes({ origin: MIDWAY, destination: PONTA_NEGRA });
    assert.ok(result.ok);
    assert.deepEqual(result.data.quotes.map((quote) => [quote.categorySlug, quote.isTestFare]), [['vuumbora', false]]);
  });

  test('422 outside_service_area: origem ou destino fora, inclusive na caixa e fora do polígono', async () => {
    const { quotePort } = setup();
    expectError(await quotePort.createQuotes({ origin: MAR, destination: PONTA_NEGRA }), 'validation', 'outside_service_area');
    expectError(await quotePort.createQuotes({ origin: MIDWAY, destination: MAR }), 'validation', 'outside_service_area');
    expectError(await quotePort.createQuotes({ origin: MIDWAY, destination: CANTO_NE }), 'validation', 'outside_service_area');
  });

  test('fare_not_configured vem ANTES de outside_service_area (ordem do contrato)', async () => {
    const { quotePort } = setup({ allowTestFares: false });
    expectError(await quotePort.createQuotes({ origin: MAR, destination: PONTA_NEGRA }), 'unavailable', 'fare_not_configured');
  });

  test('422 route_too_short abaixo do mínimo', async () => {
    const { quotePort } = setup();
    const nearby: QuotePoint = { lat: MIDWAY.lat + 0.0005, lng: MIDWAY.lng, label: 'Logo ali' };
    expectError(await quotePort.createQuotes({ origin: MIDWAY, destination: nearby }), 'validation', 'route_too_short');
  });

  test('502 route_unavailable (forçado: Directions fora)', async () => {
    const { quotePort, control } = setup();
    control.failNext('route_unavailable');
    expectError(await quotePort.createQuotes({ origin: MIDWAY, destination: PONTA_NEGRA }), 'unavailable', 'route_unavailable');
  });

  test('400 invalid_body: coordenada fora do intervalo, rótulo vazio, categorySlugs não-texto', async () => {
    const { quotePort } = setup();
    const bad = [
      { origin: { ...MIDWAY, lat: 120 }, destination: PONTA_NEGRA },
      { origin: { ...MIDWAY, label: '  ' }, destination: PONTA_NEGRA },
      { origin: MIDWAY, destination: PONTA_NEGRA, categorySlugs: [1] },
      // Os mesmos limites do servidor (apps/api/src/domain/quote-input.ts): mesmo corpo, mesmo 400.
      { origin: { ...MIDWAY, label: 'linha' + String.fromCharCode(10) + 'quebrada' }, destination: PONTA_NEGRA },
      { origin: { ...MIDWAY, label: 'x'.repeat(201) }, destination: PONTA_NEGRA },
      { origin: MIDWAY, destination: PONTA_NEGRA, categorySlugs: Array.from({ length: 21 }, () => 'vuumbora') },
      { origin: MIDWAY, destination: PONTA_NEGRA, categorySlugs: ['x'.repeat(65)] },
      // Controle C1, marca de direção do texto, isolamento de direção e largura zero.
      ...[0x85, 0x200f, 0x2066, 0x200b, 0xfeff].map((code) => ({ origin: { ...MIDWAY, label: `Casa${String.fromCharCode(code)}1` }, destination: PONTA_NEGRA })),
    ];
    for (const input of bad) expectError(await quotePort.createQuotes(input as never), 'validation', 'invalid_body');
    // NFC: 200 caracteres compostos passam mesmo que a forma decomposta tenha 400.
    assert.ok((await quotePort.createQuotes({ origin: { ...MIDWAY, label: 'e\u0301'.repeat(200) }, destination: PONTA_NEGRA })).ok);
    // Rótulo com espaço em volta: vale o texto aparado (até 200), como no servidor.
    assert.ok((await quotePort.createQuotes({ origin: { ...MIDWAY, label: `  ${'x'.repeat(200)}  ` }, destination: PONTA_NEGRA })).ok);
  });
});

describe('GET /v1/quotes/:id', () => {
  test('devolve a cotação enquanto vale; 409 quote_expired no instante da validade', async () => {
    const { quotePort, advance } = setup();
    const created = await quotePort.createQuotes({ origin: MIDWAY, destination: PONTA_NEGRA });
    assert.ok(created.ok);
    const quote = created.data.quotes[0];
    assert.ok(quote);
    advance(299_999);
    const valid = await quotePort.getQuote(quote.quoteId);
    assert.ok(valid.ok);
    assert.deepEqual(valid.data, quote, 'preço fechado: a mesma cotação');
    advance(1);
    expectError(await quotePort.getQuote(quote.quoteId), 'conflict', 'quote_expired');
  });

  test('control.expireQuote vence já; 404 para inexistente', async () => {
    const { quotePort, control } = setup();
    const created = await quotePort.createQuotes({ origin: MIDWAY, destination: PONTA_NEGRA });
    assert.ok(created.ok);
    const id = created.data.quotes[0]?.quoteId ?? '';
    control.expireQuote(id);
    expectError(await quotePort.getQuote(id), 'conflict', 'quote_expired');
    expectError(await quotePort.getQuote('nao-existe'), 'not_found', 'not_found');
    assert.throws(() => control.expireQuote('nao-existe'), TypeError);
  });

  test('network forçado', async () => {
    const { quotePort, control } = setup();
    control.failNext('network');
    assert.deepEqual(await quotePort.getQuote('x'), { ok: false, error: { kind: 'network', retryable: true } });
  });
});
