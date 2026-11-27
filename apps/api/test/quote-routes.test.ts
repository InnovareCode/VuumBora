/**
 * Cotação do passageiro (M4, fatia G4): `POST /v1/quotes` e `GET /v1/quotes/:id`. Banco REAL com o papel restrito
 * `vuumbora_api` (prova que os grants da 0026 bastam) e a Directions FICTÍCIA (`fixtures/mapbox/synthetic.ts`: distância,
 * duração e polilinha inventadas no formato do Mapbox, via `helpers/mapbox-replay.ts`).
 *
 * Aceite da G4 (`docs/plano-m3-m4.md` §4): a mesma rota gera sempre a mesma cotação; versão nova não muda cotação emitida;
 * vencida dá 409 `quote_expired`. Mais N8 (tarifa de teste recusada sem `ALLOW_TEST_FARES`: 503 `fare_not_configured`), a
 * ordem dos erros do contrato K0, a assinatura (N9), o relógio do banco na validade e a corrida "publicaram tarifa no meio".
 *
 * O banco persiste entre execuções: toda versão de tarifa que este arquivo publica é APAGADA no fim (credencial dona, com os
 * gatilhos desligados só nessa limpeza), e o `before` confere que a vigente é a de teste semeada pela 0026.
 */
import './helpers/auth-env.js';
import './helpers/runtime-role-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { computeFare, type FareRates } from '../src/domain/geo-fare-rules.js';
import type { GeoConfig } from '../src/lib/geo-config.js';
import { parseDirections, type GeoProvider } from '../src/lib/mapbox.js';
import { quoteSignatureMatches, signQuote } from '../src/lib/quote-signature.js';
import { GEO_ROUTE_ERRORS } from '../src/routes/geo-route.js';
import { prepararBanco } from '../src/migrate.js';
import { shutdown } from './helpers/harness.js';
import { FakeMailbox, makeClient, randomIp, uniqueEmail } from './helpers/identity-kit.js';
import { ensureBaseline } from './helpers/legal-kit.js';
import { replayFetch, replayProvider, testGeoConfig, type ReplayFetch } from './helpers/mapbox-replay.js';
import { OWNER_DATABASE_URL } from './helpers/runtime-role-env.js';

const owner = new pg.Pool({ connectionString: OWNER_DATABASE_URL, max: 3 });
const mailbox = new FakeMailbox();
const SECRET = testGeoConfig().quoteSigningSecret!;
const VERSION_NOTE = 'Teste G4: versão temporária (apagada pelo próprio teste)';

/** Os pontos das rotas fictícias (`SYNTHETIC_ROUTES`). */
const MIDWAY = { lat: -5.811, lng: -35.2065, label: 'Midway Mall' };
const PRAIA_SHOPPING = { lat: -5.871, lng: -35.1825, label: 'Praia Shopping' };
const AEROPORTO = { lat: -5.7686, lng: -35.3721, label: 'Aeroporto' };
const PONTA_NEGRA = { lat: -5.88, lng: -35.169, label: 'Ponta Negra' };
const MIDWAY_NEIGHBOUR = { lat: -5.8112, lng: -35.2056, label: 'Do outro lado da rua' };
/** No mar a leste da Via Costeira: DENTRO da caixa da área, FORA do polígono (prova que a rota usa o polígono). */
const SEA = { lat: -5.85, lng: -35.13, label: 'Mar' };
/** Directions fictícia de MIDWAY → PRAIA_SHOPPING (`SYNTHETIC_ROUTES`): 9 km em 20 min, números redondos inventados. */
const ROUTE = { distanceM: 9000, durationS: 1200 };
const SEED_RATES = {
  vuumbora: { baseCents: 400, perKmCents: 150, perMinuteCents: 25, minimumFareCents: 800 },
  conforto: { baseCents: 550, perKmCents: 210, perMinuteCents: 35, minimumFareCents: 1100 },
} as const;

const opened: FastifyInstance[] = [];
const createdVersions: string[] = [];
let seededVersionId = '';

interface QuoteApp {
  readonly app: FastifyInstance;
  readonly replay: ReplayFetch;
  logs(): string;
}

async function startQuoteApp(options: { config?: Partial<GeoConfig>; provider?: (replay: ReplayFetch, inner: GeoProvider) => GeoProvider | null } = {}): Promise<QuoteApp> {
  const replay = replayFetch();
  const config = testGeoConfig(options.config);
  const inner = replayProvider(replay, config);
  const provider = options.provider ? options.provider(replay, inner) : inner;
  let buffer = '';
  const app = await buildApp({ logStream: new Writable({ write: (chunk, _encoding, callback) => { buffer += chunk.toString(); callback(); } }), mail: mailbox, geo: { config, provider } });
  await app.ready();
  opened.push(app);
  return { app, replay, logs: () => buffer };
}

async function sessionOn(app: FastifyInstance, accountType: 'passenger' | 'driver' = 'passenger'): Promise<{ token: string; accountId: string }> {
  const session = await makeClient({ t: { app, logs: () => '' }, mailbox }).registerAndLogin(uniqueEmail(accountType === 'driver' ? 'motorista' : 'passageiro'), accountType);
  return { token: session.accessToken as string, accountId: session.account.id as string };
}

interface Reply { status: number; body: any; raw: string; headers: Record<string, unknown> }

async function call(app: FastifyInstance, method: 'GET' | 'POST', url: string, token?: string, body?: unknown): Promise<Reply> {
  const response = await app.inject({
    method,
    url,
    headers: { 'x-forwarded-for': randomIp(), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { payload: body as object } : {}),
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null, raw: response.body, headers: response.headers };
}

const quote = (app: FastifyInstance, token: string, body: unknown) => call(app, 'POST', '/v1/quotes', token, body);

function assertRefused(reply: Reply, code: keyof typeof GEO_ROUTE_ERRORS | 'unauthorized', status?: number): void {
  const expected = status ?? (code === 'unauthorized' ? 401 : GEO_ROUTE_ERRORS[code].status);
  assert.equal(reply.status, expected, reply.raw);
  assert.equal(reply.body?.ok, false);
  assert.equal(reply.body?.error?.code, code, reply.raw);
}

async function quoteCount(accountId: string): Promise<number> {
  const result = await owner.query<{ n: string }>(`SELECT count(*) AS n FROM fare_quotes WHERE account_id = $1`, [accountId]);
  return Number(result.rows[0]!.n);
}

/** Publica uma versão de TESTE nova (vira a vigente). Sempre apagada no `after`. */
async function publishTestVersion(rates: Readonly<Record<'vuumbora' | 'conforto', FareRates>>): Promise<string> {
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    const created = await c.query<{ id: string }>(`INSERT INTO fare_rule_versions (city_code, is_test, note) VALUES ('natal', TRUE, $1) RETURNING id`, [VERSION_NOTE]);
    const id = created.rows[0]!.id;
    createdVersions.push(id);
    for (const [slug, r] of Object.entries(rates)) {
      await c.query(
        `INSERT INTO fare_rule_rates (version_id, category_slug, base_cents, per_km_cents, per_minute_cents, minimum_fare_cents) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, slug, r.baseCents, r.perKmCents, r.perMinuteCents, r.minimumFareCents],
      );
    }
    await c.query(`UPDATE fare_rule_versions SET valid_from = now() WHERE id = $1`, [id]);
    await c.query('COMMIT');
    return id;
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

/** Limpeza: versão publicada é imutável para todo mundo; só aqui, com os gatilhos desligados nesta transação. */
async function dropTemporaryVersions(): Promise<void> {
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL session_replication_role = replica`);
    const ids = (await c.query<{ id: string }>(`SELECT id FROM fare_rule_versions WHERE note = $1`, [VERSION_NOTE])).rows.map((row) => row.id);
    for (const id of ids) {
      await c.query(`DELETE FROM fare_quotes WHERE fare_version_id = $1`, [id]);
      await c.query(`DELETE FROM fare_rule_rates WHERE version_id = $1`, [id]);
      await c.query(`DELETE FROM fare_rule_versions WHERE id = $1`, [id]);
    }
    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

async function currentVersionId(): Promise<string> {
  return (await owner.query<{ id: string }>(`SELECT current_fare_rule_version('natal') AS id`)).rows[0]!.id;
}

let main: QuoteApp;
let passenger: { token: string; accountId: string };

before(async () => {
  await prepararBanco({ databaseUrl: OWNER_DATABASE_URL, pool: owner, log: () => undefined });
  await ensureBaseline(owner);
  await dropTemporaryVersions(); // sobra de uma execução interrompida
  seededVersionId = await currentVersionId();
  const seeded = await owner.query<{ is_test: boolean; note: string }>(`SELECT is_test, note FROM fare_rule_versions WHERE id = $1`, [seededVersionId]);
  assert.equal(seeded.rows[0]?.is_test, true, 'a vigente precisa ser a tarifa de TESTE semeada pela 0026');
  main = await startQuoteApp();
  passenger = await sessionOn(main.app);
});

after(async () => {
  for (const app of opened) await app.close();
  await dropTemporaryVersions();
  assert.equal(await currentVersionId(), seededVersionId, 'a limpeza devolveu a vigente semeada');
  await owner.end();
  await shutdown();
});

describe('portões e validação', () => {
  test('401 sem sessão; 403 not_passenger_account para motorista (cotar e ler)', async () => {
    assertRefused(await call(main.app, 'POST', '/v1/quotes', undefined, { origin: MIDWAY, destination: PRAIA_SHOPPING }), 'unauthorized');
    assertRefused(await call(main.app, 'GET', `/v1/quotes/${randomUUID()}`), 'unauthorized');
    const driver = await sessionOn(main.app, 'driver');
    assertRefused(await quote(main.app, driver.token, { origin: MIDWAY, destination: PRAIA_SHOPPING }), 'not_passenger_account');
    assertRefused(await call(main.app, 'GET', `/v1/quotes/${randomUUID()}`, driver.token), 'not_passenger_account');
  });

  test('400 invalid_body (e nenhuma chamada à Directions)', async () => {
    const before = main.replay.calls.length;
    const cases: unknown[] = [
      {},
      { origin: MIDWAY },
      { origin: { ...MIDWAY, label: '' }, destination: PRAIA_SHOPPING },
      { origin: { ...MIDWAY, label: '   ' }, destination: PRAIA_SHOPPING },
      { origin: { ...MIDWAY, label: 'x'.repeat(201) }, destination: PRAIA_SHOPPING },
      { origin: { ...MIDWAY, label: 'linha\nquebrada' }, destination: PRAIA_SHOPPING },
      { origin: { ...MIDWAY, lat: -91 }, destination: PRAIA_SHOPPING },
      { origin: { ...MIDWAY, lat: '-5.8' }, destination: PRAIA_SHOPPING },
      { origin: MIDWAY, destination: PRAIA_SHOPPING, categorySlugs: 'vuumbora' },
      { origin: MIDWAY, destination: PRAIA_SHOPPING, categorySlugs: [1] },
      { origin: MIDWAY, destination: PRAIA_SHOPPING, categorySlugs: Array.from({ length: 21 }, () => 'vuumbora') },
      // Rótulo com controle C1, marca/isolamento de direção do texto ou caractere de largura zero.
      ...[0x85, 0x9f, 0x200e, 0x202e, 0x2066, 0x061c, 0x200b, 0x2060, 0xfeff].map((code) => ({
        origin: { ...MIDWAY, label: `Casa${String.fromCharCode(code)}1` },
        destination: PRAIA_SHOPPING,
      })),
    ];
    for (const body of cases) assertRefused(await quote(main.app, passenger.token, body), 'invalid_body');
    assert.equal(main.replay.calls.length, before);
  });
});

describe('cotação', () => {
  test('rota da Directions: preço por computeFare sobre metros e segundos inteiros, assinado, 5 min no relógio do banco', async () => {
    const reply = await quote(main.app, passenger.token, { origin: { ...MIDWAY, label: '  Midway Mall  ' }, destination: PRAIA_SHOPPING });
    assert.equal(reply.status, 200, reply.raw);
    assert.equal(reply.headers['cache-control'], 'no-store');
    const { route, quotes } = reply.body.data;
    assert.equal(route.distanceM, ROUTE.distanceM);
    assert.equal(route.durationS, ROUTE.durationS);
    assert.equal(typeof route.polyline, 'string');
    assert.ok(route.polyline.length > 100);

    assert.deepEqual(quotes.map((q: { categorySlug: string }) => q.categorySlug), ['vuumbora', 'conforto']);
    // 400 + 150 × 9 + 25 × 20 = 2250 · 550 + 210 × 9 + 35 × 20 = 3140
    assert.deepEqual(quotes.map((q: { priceCents: number }) => q.priceCents), [2250, 3140]);
    assert.equal(computeFare(SEED_RATES.vuumbora, ROUTE).totalCents, 2250);
    for (const issued of quotes) {
      assert.match(issued.quoteId, /^[0-9a-f-]{36}$/);
      assert.equal(issued.currency, 'BRL');
      assert.equal(issued.fareVersionId, seededVersionId);
      assert.equal(issued.isTestFare, true);
      assert.match(issued.signature, /^[A-Za-z0-9_-]{43}$/);
      assert.equal(issued.signature, signQuote(SECRET, issued));
      assert.ok(quoteSignatureMatches(issued.signature, issued.signature));
      assert.ok(!quoteSignatureMatches(issued.signature, signQuote(SECRET, { ...issued, priceCents: issued.priceCents - 1 })), 'o preço está na assinatura');
    }

    const rows = await owner.query(
      `SELECT account_id, origin_label, destination_label, distance_m, duration_s, dynamic_multiplier::text AS dyn, price_cents, signature,
              expires_at, EXTRACT(EPOCH FROM (expires_at - created_at)) AS ttl
         FROM fare_quotes WHERE id = ANY($1::uuid[]) ORDER BY price_cents`,
      [quotes.map((q: { quoteId: string }) => q.quoteId)],
    );
    assert.equal(rows.rows.length, 2);
    for (const [index, row] of rows.rows.entries()) {
      assert.equal(row.account_id, passenger.accountId);
      assert.equal(row.origin_label, 'Midway Mall', 'o texto confirmado é gravado aparado');
      assert.equal(row.destination_label, 'Praia Shopping');
      assert.equal(row.distance_m, ROUTE.distanceM);
      assert.equal(row.duration_s, ROUTE.durationS);
      assert.equal(row.dyn, '1.00');
      assert.equal(row.price_cents, quotes[index].priceCents);
      assert.equal(row.signature, quotes[index].signature);
      assert.equal(new Date(row.expires_at).toISOString(), quotes[index].expiresAt);
      // created_at é posto pelo gatilho DEPOIS de lermos o relógio: a validade fica a um fio abaixo de 300 s.
      assert.ok(Number(row.ttl) > 299 && Number(row.ttl) <= 300, `ttl ${row.ttl}`);
    }
  });

  test('mesma rota, mesmo preço (cotações novas, ids novos)', async () => {
    const first = await quote(main.app, passenger.token, { origin: MIDWAY, destination: PRAIA_SHOPPING });
    const second = await quote(main.app, passenger.token, { origin: MIDWAY, destination: PRAIA_SHOPPING });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const prices = (reply: Reply) => reply.body.data.quotes.map((q: { categorySlug: string; priceCents: number }) => `${q.categorySlug}:${q.priceCents}`);
    assert.deepEqual(prices(first), prices(second));
    assert.deepEqual(first.body.data.route, second.body.data.route);
    assert.notEqual(first.body.data.quotes[0].quoteId, second.body.data.quotes[0].quoteId);
  });

  test('rota longa (aeroporto → Ponta Negra) também fecha com computeFare', async () => {
    const reply = await quote(main.app, passenger.token, { origin: AEROPORTO, destination: PONTA_NEGRA });
    assert.equal(reply.status, 200, reply.raw);
    const { route, quotes } = reply.body.data;
    assert.deepEqual([route.distanceM, route.durationS], [35000, 3600]);
    assert.deepEqual(quotes.map((q: { priceCents: number }) => q.priceCents), [
      computeFare(SEED_RATES.vuumbora, { distanceM: 35000, durationS: 3600 }).totalCents,
      computeFare(SEED_RATES.conforto, { distanceM: 35000, durationS: 3600 }).totalCents,
    ]);
  });

  test('categorySlugs: só as pedidas; desconhecida ou desligada é ignorada; nenhuma sobrando = quotes [] com a rota', async () => {
    const only = await quote(main.app, passenger.token, { origin: MIDWAY, destination: PRAIA_SHOPPING, categorySlugs: ['conforto', 'conforto'] });
    assert.deepEqual(only.body.data.quotes.map((q: { categorySlug: string }) => q.categorySlug), ['conforto']);
    const before = await quoteCount(passenger.accountId);
    const none = await quote(main.app, passenger.token, { origin: MIDWAY, destination: PRAIA_SHOPPING, categorySlugs: ['pet', 'inexistente'] });
    assert.equal(none.status, 200, none.raw);
    assert.deepEqual(none.body.data.quotes, []);
    assert.equal(none.body.data.route.distanceM, ROUTE.distanceM);
    assert.equal(await quoteCount(passenger.accountId), before, 'nada gravado');
  });

  test('N8: tarifa de TESTE sem ALLOW_TEST_FARES (produção) → 503 fare_not_configured, antes de chamar a Directions', async () => {
    const t = await startQuoteApp({ config: { allowTestFares: false } });
    const p = await sessionOn(t.app);
    assertRefused(await quote(t.app, p.token, { origin: MIDWAY, destination: PRAIA_SHOPPING }), 'fare_not_configured');
    // Ordem do contrato: a tarifa vem antes da área (fora da área também dá 503 aqui).
    assertRefused(await quote(t.app, p.token, { origin: SEA, destination: PRAIA_SHOPPING }), 'fare_not_configured');
    assert.equal(t.replay.calls.length, 0);
    assert.equal(await quoteCount(p.accountId), 0);
  });

  test('sem MAPBOX_SERVER_TOKEN → 503 geo_unavailable; sem QUOTE_SIGNING_SECRET → 503 unavailable; a leitura segue', async () => {
    const issued = (await quote(main.app, passenger.token, { origin: MIDWAY, destination: PRAIA_SHOPPING })).body.data.quotes[0];
    const noToken = await startQuoteApp({ config: { mapboxToken: null }, provider: () => null });
    const p = await sessionOn(noToken.app);
    assertRefused(await quote(noToken.app, p.token, { origin: MIDWAY, destination: PRAIA_SHOPPING }), 'geo_unavailable', 503);
    assert.equal((await call(noToken.app, 'GET', `/v1/quotes/${issued.quoteId}`, passenger.token)).status, 200);

    const noSecret = await startQuoteApp({ config: { quoteSigningSecret: null } });
    const q = await sessionOn(noSecret.app);
    assertRefused(await quote(noSecret.app, q.token, { origin: MIDWAY, destination: PRAIA_SHOPPING }), 'unavailable');
    assert.match(noSecret.logs(), /"event":"quote_signing_secret_missing"/);
    assert.equal(noSecret.replay.calls.length, 0);
  });

  test('422 outside_service_area pelo POLÍGONO (o mar está na caixa), origem ou destino, sem chamar a Directions', async () => {
    const before = main.replay.calls.length;
    assertRefused(await quote(main.app, passenger.token, { origin: SEA, destination: PRAIA_SHOPPING }), 'outside_service_area');
    assertRefused(await quote(main.app, passenger.token, { origin: MIDWAY, destination: { lat: -5.5, lng: -35.3, label: 'Ceará-Mirim' } }), 'outside_service_area');
    assert.equal(main.replay.calls.length, before);
  });

  test('422 route_too_short (rota de 100 m)', async () => {
    const before = await quoteCount(passenger.accountId);
    assertRefused(await quote(main.app, passenger.token, { origin: MIDWAY, destination: MIDWAY_NEIGHBOUR }), 'route_too_short');
    assert.equal(await quoteCount(passenger.accountId), before);
  });

  test('Directions: falha passageira repete uma vez e cota; falha persistente → 502 route_unavailable', async () => {
    const t = await startQuoteApp();
    const p = await sessionOn(t.app);
    t.replay.failNext('/directions/', 'network');
    assert.equal((await quote(t.app, p.token, { origin: MIDWAY, destination: PRAIA_SHOPPING })).status, 200);
    t.replay.failNext('/directions/', { status: 503 });
    t.replay.failNext('/directions/', { status: 503 });
    assertRefused(await quote(t.app, p.token, { origin: MIDWAY, destination: PRAIA_SHOPPING }), 'route_unavailable');
    t.replay.failNext('/directions/', { status: 401 }); // token recusado: não repete
    assertRefused(await quote(t.app, p.token, { origin: MIDWAY, destination: PRAIA_SHOPPING }), 'route_unavailable');
    assert.match(t.logs(), /"event":"geo_provider_failed","engine":"directions","reason":"http_status","status":401/);
  });

  test('Directions sem rota (NoRoute) → 502 route_unavailable', async () => {
    const t = await startQuoteApp({ provider: (_replay, inner) => ({ ...inner, directions: async () => parseDirections({ code: 'NoRoute', routes: [] }) }) });
    const p = await sessionOn(t.app);
    assertRefused(await quote(t.app, p.token, { origin: MIDWAY, destination: PRAIA_SHOPPING }), 'route_unavailable');
  });

  test('rótulo gravado em NFC: a forma decomposta vira a composta (e o tamanho conta a composta)', async () => {
    const decomposed = 'Jose\u0301 da Silva'; // "José" com o acento solto
    const long = 'e\u0301'.repeat(200); // 400 unidades decompostas, 200 caracteres compostos
    const reply = await quote(main.app, passenger.token, { origin: { ...MIDWAY, label: decomposed }, destination: { ...PRAIA_SHOPPING, label: long } });
    assert.equal(reply.status, 200, reply.raw);
    const row = await owner.query<{ origin_label: string; destination_label: string }>(`SELECT origin_label, destination_label FROM fare_quotes WHERE id = $1`, [reply.body.data.quotes[0].quoteId]);
    assert.equal(row.rows[0]?.origin_label, 'José da Silva');
    assert.equal(row.rows[0]?.destination_label, 'é'.repeat(200));
  });

  test('Directions devolve distância e duração quebradas: arredonda à vista e grava o inteiro', async () => {
    const t = await startQuoteApp({ provider: (_replay, inner) => ({ ...inner, directions: async () => ({ distanceM: 5000.5, durationS: 600.4, polyline: 'abc' }) }) });
    const p = await sessionOn(t.app);
    const reply = await quote(t.app, p.token, { origin: MIDWAY, destination: PRAIA_SHOPPING });
    assert.equal(reply.status, 200, reply.raw);
    assert.deepEqual([reply.body.data.route.distanceM, reply.body.data.route.durationS], [5001, 600]);
    assert.equal(reply.body.data.quotes[0].priceCents, computeFare(SEED_RATES.vuumbora, { distanceM: 5001, durationS: 600 }).totalCents);
    const row = await owner.query<{ distance_m: number; duration_s: number }>(`SELECT distance_m, duration_s FROM fare_quotes WHERE id = $1`, [reply.body.data.quotes[0].quoteId]);
    assert.deepEqual([row.rows[0]?.distance_m, row.rows[0]?.duration_s], [5001, 600]);
  });

  test('teto diário da Directions esgotado: 503 geo_unavailable, sem chamar a Directions', async () => {
    const t = await startQuoteApp({ config: { dailyBudget: { geocoding: 1000, searchbox: 1000, reverse: 1000, directions: 1 } } });
    const p = await sessionOn(t.app);
    assert.equal((await quote(t.app, p.token, { origin: MIDWAY, destination: PRAIA_SHOPPING })).status, 200);
    const calls = t.replay.calls.length;
    assertRefused(await quote(t.app, p.token, { origin: MIDWAY, destination: PRAIA_SHOPPING }), 'geo_unavailable', 503);
    assert.equal(t.replay.calls.length, calls);
    assert.match(t.logs(), /"event":"geo_budget_exhausted","engine":"directions","dailyLimit":1/);
  });

  test('cota DIÁRIA de cotações por conta: 429 com Retry-After de horas', async () => {
    const t = await startQuoteApp({ config: { quotesPerDay: 1 } });
    const p = await sessionOn(t.app);
    assert.equal((await quote(t.app, p.token, { origin: MIDWAY, destination: PRAIA_SHOPPING })).status, 200);
    const limited = await quote(t.app, p.token, { origin: MIDWAY, destination: PRAIA_SHOPPING });
    assertRefused(limited, 'rate_limited');
    assert.ok(Number(limited.headers['retry-after']) > 3600);
  });

  test('429 por conta, com Retry-After', async () => {
    const t = await startQuoteApp({ config: { quotesPerMinute: 1 } });
    const p = await sessionOn(t.app);
    assert.equal((await quote(t.app, p.token, { origin: MIDWAY, destination: PRAIA_SHOPPING })).status, 200);
    const limited = await quote(t.app, p.token, { origin: MIDWAY, destination: PRAIA_SHOPPING });
    assertRefused(limited, 'rate_limited');
    assert.ok(Number(limited.headers['retry-after']) >= 1);
  });

  test('nenhum rótulo nem coordenada vai para o log', async () => {
    const t = await startQuoteApp();
    const p = await sessionOn(t.app);
    const reply = await quote(t.app, p.token, { origin: { ...MIDWAY, label: 'Casa da Fulana' }, destination: { ...PRAIA_SHOPPING, label: 'Trabalho do Beltrano' } });
    assert.equal(reply.status, 200, reply.raw);
    const logs = t.logs();
    assert.match(logs, /"event":"quotes_issued"/);
    for (const secret of ['Fulana', 'Beltrano', '5.811', '35.2065', '5.871', reply.body.data.quotes[0].signature]) assert.ok(!logs.includes(secret), `vazou ${secret}`);
  });
});

describe('leitura da cotação', () => {
  test('GET devolve a mesma cotação; de outra conta, inexistente ou id inválido → 404', async () => {
    const issued = (await quote(main.app, passenger.token, { origin: MIDWAY, destination: PRAIA_SHOPPING })).body.data.quotes[1];
    const read = await call(main.app, 'GET', `/v1/quotes/${issued.quoteId}`, passenger.token);
    assert.equal(read.status, 200, read.raw);
    assert.equal(read.headers['cache-control'], 'no-store');
    assert.deepEqual(read.body.data, issued);
    assert.deepEqual((await call(main.app, 'GET', `/v1/quotes/${issued.quoteId.toUpperCase()}`, passenger.token)).body.data, issued);
    const other = await sessionOn(main.app);
    assertRefused(await call(main.app, 'GET', `/v1/quotes/${issued.quoteId}`, other.token), 'not_found');
    assertRefused(await call(main.app, 'GET', `/v1/quotes/${randomUUID()}`, passenger.token), 'not_found');
    assertRefused(await call(main.app, 'GET', '/v1/quotes/nao-e-uuid', passenger.token), 'not_found');
  });

  test('vencida (relógio do banco) → 409 quote_expired', async () => {
    const issued = (await quote(main.app, passenger.token, { origin: MIDWAY, destination: PRAIA_SHOPPING })).body.data.quotes[0];
    // Cotação é imutável (gatilho): envelhecer exige a credencial dona com os gatilhos desligados nesta transação.
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SET LOCAL session_replication_role = replica`);
      await c.query(`UPDATE fare_quotes SET created_at = created_at - interval '301 seconds', expires_at = expires_at - interval '301 seconds' WHERE id = $1`, [issued.quoteId]);
      await c.query('COMMIT');
    } finally {
      c.release();
    }
    assertRefused(await call(main.app, 'GET', `/v1/quotes/${issued.quoteId}`, passenger.token), 'quote_expired');
  });
});

describe('versão nova de tarifa', () => {
  test('não muda cotação emitida; a próxima cotação já usa a versão nova', async () => {
    const issued = (await quote(main.app, passenger.token, { origin: MIDWAY, destination: PRAIA_SHOPPING })).body.data.quotes[0];
    const newRates = { vuumbora: { baseCents: 500, perKmCents: 200, perMinuteCents: 30, minimumFareCents: 900 }, conforto: { baseCents: 650, perKmCents: 260, perMinuteCents: 40, minimumFareCents: 1200 } };
    const newVersion = await publishTestVersion(newRates);

    const read = await call(main.app, 'GET', `/v1/quotes/${issued.quoteId}`, passenger.token);
    assert.equal(read.status, 200, read.raw);
    assert.deepEqual(read.body.data, issued, 'preço, versão e assinatura de antes');

    const fresh = (await quote(main.app, passenger.token, { origin: MIDWAY, destination: PRAIA_SHOPPING })).body.data.quotes[0];
    assert.equal(fresh.fareVersionId, newVersion);
    assert.equal(fresh.priceCents, computeFare(newRates.vuumbora, ROUTE).totalCents);
    assert.notEqual(fresh.priceCents, issued.priceCents);
    await dropTemporaryVersions();
  });

  test('publicada NO MEIO da cotação (depois da leitura, antes da gravação): refaz uma vez com a versão nova', async () => {
    const newRates = { vuumbora: { baseCents: 450, perKmCents: 170, perMinuteCents: 27, minimumFareCents: 850 }, conforto: { baseCents: 600, perKmCents: 230, perMinuteCents: 37, minimumFareCents: 1150 } };
    let published: string | undefined;
    const t = await startQuoteApp({
      provider: (_replay, inner) => ({
        ...inner,
        // A Directions roda DEPOIS de a tarifa ser lida: publicar aqui é a corrida, sem relógio nem espera.
        directions: async (origin, destination) => {
          published ??= await publishTestVersion(newRates);
          return inner.directions(origin, destination);
        },
      }),
    });
    const p = await sessionOn(t.app);
    const reply = await quote(t.app, p.token, { origin: MIDWAY, destination: PRAIA_SHOPPING });
    assert.equal(reply.status, 200, reply.raw);
    assert.ok(published);
    assert.deepEqual(reply.body.data.quotes.map((q: { fareVersionId: string }) => q.fareVersionId), [published, published]);
    assert.equal(reply.body.data.quotes[0].priceCents, computeFare(newRates.vuumbora, ROUTE).totalCents);
    assert.match(t.logs(), /"event":"quote_fare_changed_retry","constraint":"fare_quotes_version_current"/);
    assert.equal(await quoteCount(p.accountId), 2, 'só as da segunda tentativa (a primeira foi desfeita inteira)');
    await dropTemporaryVersions();
  });
});
