/**
 * Rotas de geografia do passageiro (M4, fatia G3): `GET /v1/geo/search`, `GET /v1/geo/reverse`, `GET /v1/service-area`,
 * `GET /v1/categories`. Banco REAL (papel restrito `vuumbora_api`) e Mapbox FICTÍCIO (`fixtures/mapbox/synthetic.ts`, via
 * `helpers/mapbox-replay.ts`): respostas inventadas no formato do Mapbox, nenhuma resposta real no repositório.
 *
 * O que cada bloco prova: portões (401, 400), a busca única com `kind=any` (UMA chamada da API, duas fontes do Mapbox, conta
 * UMA vez no limite por conta), cache curto, falha de uma fonte / das duas, sem token (503) sem derrubar área e categorias,
 * o pino (rótulo, `inServiceArea`), o catálogo da 0026 e o que NÃO pode ir para o log (texto buscado, coordenada).
 */
import './helpers/auth-env.js';
import './helpers/runtime-role-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { GeoConfig } from '../src/lib/geo-config.js';
import type { GeoProvider } from '../src/lib/mapbox.js';
import { GEO_ROUTE_ERRORS } from '../src/routes/geo-route.js';
import { prepararBanco } from '../src/migrate.js';
import { shutdown } from './helpers/harness.js';
import { FakeMailbox, makeClient, randomIp, uniqueEmail } from './helpers/identity-kit.js';
import { ensureBaseline } from './helpers/legal-kit.js';
import { replayFetch, replayProvider, testGeoConfig, type ReplayFetch } from './helpers/mapbox-replay.js';
import { OWNER_DATABASE_URL } from './helpers/runtime-role-env.js';
import { SYNTHETIC_PIN_LABEL } from './fixtures/mapbox/synthetic.js';

const owner = new pg.Pool({ connectionString: OWNER_DATABASE_URL, max: 2 });
const mailbox = new FakeMailbox();

interface GeoApp {
  readonly app: FastifyInstance;
  readonly replay: ReplayFetch;
  logs(): string;
}

const opened: FastifyInstance[] = [];

async function startGeoApp(options: { config?: Partial<GeoConfig>; provider?: (replay: ReplayFetch) => GeoProvider | null } = {}): Promise<GeoApp> {
  const replay = replayFetch();
  const config = testGeoConfig(options.config);
  const provider = options.provider ? options.provider(replay) : replayProvider(replay, config);
  let buffer = '';
  const app = await buildApp({
    logStream: new Writable({ write: (chunk, _encoding, callback) => { buffer += chunk.toString(); callback(); } }),
    mail: mailbox,
    geo: { config, provider },
  });
  await app.ready();
  opened.push(app);
  return { app, replay, logs: () => buffer };
}

async function sessionOn(app: FastifyInstance, accountType: 'passenger' | 'driver' = 'passenger'): Promise<string> {
  const session = await makeClient({ t: { app, logs: () => '' }, mailbox }).registerAndLogin(uniqueEmail(accountType === 'driver' ? 'motorista' : 'passageiro'), accountType);
  return session.accessToken as string;
}

interface Reply { status: number; body: any; raw: string; headers: Record<string, unknown> }

async function get(app: FastifyInstance, url: string, token?: string): Promise<Reply> {
  const response = await app.inject({ method: 'GET', url, headers: { 'x-forwarded-for': randomIp(), ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null, raw: response.body, headers: response.headers };
}

const search = (params: Record<string, string>) => `/v1/geo/search?${new URLSearchParams(params).toString()}`;

function assertRefused(reply: Reply, code: keyof typeof GEO_ROUTE_ERRORS | 'unauthorized', status?: number): void {
  const expected = status ?? (code === 'unauthorized' ? 401 : GEO_ROUTE_ERRORS[code].status);
  assert.equal(reply.status, expected, reply.raw);
  assert.equal(reply.body?.ok, false);
  assert.equal(reply.body?.error?.code, code, reply.raw);
}

let main: GeoApp;
let passenger = '';

before(async () => {
  await prepararBanco({ databaseUrl: OWNER_DATABASE_URL, pool: owner, log: () => undefined });
  await ensureBaseline(owner);
  main = await startGeoApp();
  passenger = await sessionOn(main.app);
});

after(async () => {
  for (const app of opened) await app.close();
  await owner.end();
  await shutdown();
});

describe('portões', () => {
  test('sem sessão: 401 nas quatro rotas', async () => {
    for (const url of [search({ q: 'midway' }), '/v1/geo/reverse?lat=-5.8&lng=-35.2', '/v1/service-area', '/v1/categories']) {
      assertRefused(await get(main.app, url), 'unauthorized');
    }
  });

  test('400 invalid_body: kind desconhecido, q acima de 100, q repetido, near e lat/lng malformados ou fora do intervalo', async () => {
    const cases = [
      search({ q: 'midway', kind: 'tudo' }),
      search({ q: 'x'.repeat(101) }),
      '/v1/geo/search?q=a&q=b',
      '/v1/geo/search',
      search({ q: 'midway', near: '-5.8' }),
      search({ q: 'midway', near: '-91,-35' }),
      search({ q: 'midway', near: 'abc,def' }),
      '/v1/geo/reverse?lat=-5.8',
      '/v1/geo/reverse?lat=-5.8&lng=-181',
      '/v1/geo/reverse?lat=1e2&lng=0',
    ];
    for (const url of cases) assertRefused(await get(main.app, url, passenger), 'invalid_body');
  });

  test('conta de motorista também busca (o app do motorista mostra mapa)', async () => {
    const driver = await sessionOn(main.app, 'driver');
    const reply = await get(main.app, search({ q: 'midway mall natal', kind: 'any' }), driver);
    assert.equal(reply.status, 200, reply.raw);
  });
});

describe('busca', () => {
  test('menos de 2 caracteres úteis: lista vazia, sem chamar o Mapbox', async () => {
    const before = main.replay.calls.length;
    for (const q of ['', ' ', 'a', ' . ']) {
      const reply = await get(main.app, search({ q }), passenger);
      assert.equal(reply.status, 200, reply.raw);
      assert.deepEqual(reply.body.data, { results: [] });
    }
    assert.equal(main.replay.calls.length, before);
  });

  test('kind=any: UMA chamada da API consulta as DUAS fontes do Mapbox; ponto próprio primeiro', async () => {
    const before = main.replay.calls.length;
    const reply = await get(main.app, search({ q: 'Midway Mall, Av. Rio Branco, 536, Petrópolis, Natal, RN', kind: 'any' }), passenger);
    assert.equal(reply.status, 200, reply.raw);
    const calls = main.replay.calls.slice(before);
    assert.equal(calls.filter((url) => url.includes('/search/geocode/v6/forward')).length, 1);
    assert.equal(calls.filter((url) => url.includes('/search/searchbox/v1/forward')).length, 1);
    const results = reply.body.data.results as { id: string; source: string; label: string; sublabel: string; lat: number; lng: number }[];
    assert.ok(results.length > 1 && results.length <= 8);
    assert.deepEqual(results[0], {
      id: 'midway-mall', label: 'Midway Mall', sublabel: 'Av. Bernardo Vieira, 3775, Tirol, Natal - RN', lat: -5.811, lng: -35.2065, source: 'curated',
    });
    assert.ok(results.some((result) => result.source !== 'curated'), 'o Mapbox também entra na lista');
    // Id curto e nosso: o mapbox_id da v6 carrega a consulta inteira em base64.
    for (const result of results) assert.ok(result.id.length <= 60, result.id);
  });

  test('kind=address só consulta a Geocoding v6; kind=place só a Search Box', async () => {
    const q = 'Rua Potengi, 300, Tirol, Natal, RN';
    let before = main.replay.calls.length;
    const address = await get(main.app, search({ q, kind: 'address' }), passenger);
    assert.equal(address.status, 200);
    assert.ok(main.replay.calls.slice(before).every((url) => url.includes('/geocode/v6/forward')));
    assert.ok((address.body.data.results as { source: string }[]).every((result) => result.source !== 'searchbox'));
    assert.equal(address.body.data.results[0].label, 'Rua Potengi 300');

    before = main.replay.calls.length;
    const place = await get(main.app, search({ q: 'Hospital do Coracao Natal', kind: 'place' }), passenger);
    assert.equal(place.status, 200);
    assert.ok(main.replay.calls.slice(before).every((url) => url.includes('/searchbox/v1/forward')));
    assert.ok((place.body.data.results as { source: string }[]).every((result) => result.source !== 'geocoding'));
  });

  test('sem kind vale address (contrato K0)', async () => {
    const before = main.replay.calls.length;
    const reply = await get(main.app, search({ q: 'R. Potengi 300 Tirol Natal RN' }), passenger);
    assert.equal(reply.status, 200);
    assert.deepEqual(main.replay.calls.slice(before).map((url) => url.includes('/geocode/v6/forward')), [true]);
  });

  test('cache curto: a mesma busca de novo não chama o Mapbox', async () => {
    const q = 'Av. Hermes da Fonseca, 721, Tirol, Natal, RN';
    await get(main.app, search({ q, kind: 'any' }), passenger);
    const before = main.replay.calls.length;
    const again = await get(main.app, search({ q, kind: 'any' }), passenger);
    assert.equal(again.status, 200);
    assert.equal(main.replay.calls.length, before);
  });

  test('autocompletar: "midw" já traz o Midway Mall (ponto próprio) sem depender do Mapbox', async () => {
    const t = await startGeoApp({ provider: () => ({
      forward: async () => [],
      reverse: async () => ({ label: null }),
      directions: async () => { throw new Error('não usado'); },
    }) });
    const token = await sessionOn(t.app);
    const reply = await get(t.app, search({ q: 'midw', kind: 'any' }), token);
    assert.equal(reply.status, 200, reply.raw);
    assert.equal(reply.body.data.results[0]?.id, 'midway-mall');
  });

  test('"Teatro Riachuelo" NÃO vira o Teatro Alberto Maranhão (apelido de uma palavra só não basta)', async () => {
    const t = await startGeoApp({ provider: () => ({ forward: async () => [], reverse: async () => ({ label: null }), directions: async () => { throw new Error('não usado'); } }) });
    const token = await sessionOn(t.app);
    const reply = await get(t.app, search({ q: 'Teatro Riachuelo', kind: 'any' }), token);
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body.data.results, []);
  });

  test('uma fonte falha: devolve a outra; as duas falham sem ponto próprio: 502 geo_unavailable', async () => {
    const t = await startGeoApp();
    const token = await sessionOn(t.app);
    t.replay.failNext('/searchbox/v1/forward', { status: 503 });
    t.replay.failNext('/searchbox/v1/forward', { status: 503 }); // a repetição única também falha
    const partial = await get(t.app, search({ q: 'Rua Mossoró, 480, Petrópolis, Natal, RN', kind: 'any' }), token);
    assert.equal(partial.status, 200, partial.raw);
    assert.ok(partial.body.data.results.length > 0);
    assert.match(t.logs(), /"event":"geo_provider_failed","engine":"searchbox","reason":"http_status","status":503/);

    t.replay.failNext('/geocode/v6/forward', 'network');
    t.replay.failNext('/geocode/v6/forward', 'network');
    t.replay.failNext('/searchbox/v1/forward', { status: 500 });
    t.replay.failNext('/searchbox/v1/forward', { status: 500 });
    const down = await get(t.app, search({ q: 'Rua Jundiaí, 150, Petrópolis, Natal, RN', kind: 'any' }), token);
    assertRefused(down, 'geo_unavailable', 502);
  });

  test('as duas fontes falham mas um ponto próprio casou: devolve só ele (200)', async () => {
    const t = await startGeoApp();
    const token = await sessionOn(t.app);
    for (let i = 0; i < 2; i++) {
      t.replay.failNext('/geocode/v6/forward', { status: 502 });
      t.replay.failNext('/searchbox/v1/forward', { status: 502 });
    }
    const reply = await get(t.app, search({ q: 'midway mall natal', kind: 'any' }), token);
    assert.equal(reply.status, 200, reply.raw);
    assert.deepEqual((reply.body.data.results as { source: string }[]).map((result) => result.source), ['curated']);
  });

  test('falha passageira (uma vez): a repetição única resolve', async () => {
    const t = await startGeoApp();
    const token = await sessionOn(t.app);
    t.replay.failNext('/geocode/v6/forward', 'network');
    const reply = await get(t.app, search({ q: 'Rua Chile, 50, Cidade Alta, Natal, RN', kind: 'address' }), token);
    assert.equal(reply.status, 200, reply.raw);
    assert.equal(reply.body.data.results[0].label, 'Rua Chile 50');
    assert.doesNotMatch(t.logs(), /geo_provider_failed/);
  });

  test('429 por CONTA (com Retry-After); kind=any conta UMA vez; outra conta segue livre', async () => {
    const t = await startGeoApp({ config: { searchPerMinute: 2 } });
    const token = await sessionOn(t.app);
    const other = await sessionOn(t.app);
    const q = { q: 'Via Costeira Natal', kind: 'any' };
    assert.equal((await get(t.app, search(q), token)).status, 200);
    assert.equal((await get(t.app, search(q), token)).status, 200);
    const limited = await get(t.app, search(q), token);
    assertRefused(limited, 'rate_limited');
    assert.ok(Number(limited.headers['retry-after']) >= 1 && Number(limited.headers['retry-after']) <= 60);
    assert.equal((await get(t.app, search(q), other)).status, 200);
  });

  test('sem MAPBOX_SERVER_TOKEN: busca e pino 503 geo_unavailable; área e categorias seguem (o boot não cai)', async () => {
    const t = await startGeoApp({ config: { mapboxToken: null }, provider: () => null });
    const token = await sessionOn(t.app);
    assertRefused(await get(t.app, search({ q: 'midway mall' }), token), 'geo_unavailable', 503);
    assertRefused(await get(t.app, '/v1/geo/reverse?lat=-5.8&lng=-35.2', token), 'geo_unavailable', 503);
    assert.equal((await get(t.app, '/v1/service-area', token)).status, 200);
    assert.equal((await get(t.app, '/v1/categories', token)).status, 200);
  });

  test('a posição (near) vai ao Mapbox arredondada a ~1 km; nada do que foi buscado vai para o log; resposta no-store', async () => {
    const sent: { q: string; proximity: { lat: number; lng: number } }[] = [];
    const t = await startGeoApp({ provider: () => ({
      forward: async (_engine, request) => {
        sent.push({ q: request.q, proximity: request.proximity });
        return [{ id: 'gc:teste', label: 'Rua Potengi 300', sublabel: 'Petrópolis, Natal - RN', lat: -5.783, lng: -35.202, source: 'geocoding' as const }];
      },
      reverse: async () => ({ label: null }),
      directions: async () => { throw new Error('não usado'); },
    }) });
    const token = await sessionOn(t.app);
    const reply = await get(t.app, search({ q: '  Rua   Potengi, 300, Tirol, Natal, RN ', kind: 'any', near: '-5.81234,-35.20987' }), token);
    assert.equal(reply.status, 200, reply.raw);
    assert.equal(reply.headers['cache-control'], 'no-store');
    assert.deepEqual(sent, [
      { q: 'Rua Potengi, 300, Tirol, Natal, RN', proximity: { lat: -5.81, lng: -35.21 } },
      { q: 'Rua Potengi, 300, Tirol, Natal, RN', proximity: { lat: -5.81, lng: -35.21 } },
    ]);
    const logs = t.logs();
    assert.match(logs, /"event":"geo_search"/);
    for (const secret of ['Potengi', 'potengi', '5.81234', '35.20987', '5.81', 'q=']) assert.ok(!logs.includes(secret), `vazou ${secret}`);
  });
});

describe('pino (reverso)', () => {
  test('rótulo com a rua e o bairro; devolve a coordenada do pino, não a do Mapbox; dentro da área', async () => {
    const reply = await get(main.app, '/v1/geo/reverse?lat=-5.7982&lng=-35.2034', passenger);
    assert.equal(reply.status, 200, reply.raw);
    assert.deepEqual(reply.body.data, { label: SYNTHETIC_PIN_LABEL, lat: -5.7982, lng: -35.2034, inServiceArea: true });
  });

  test('ponto sem nome (mar, a leste da Via Costeira): rótulo genérico; fora do polígono (está na caixa, não no contorno)', async () => {
    const reply = await get(main.app, '/v1/geo/reverse?lat=-5.85&lng=-35.13', passenger);
    assert.equal(reply.status, 200, reply.raw);
    assert.deepEqual(reply.body.data, { label: 'Local marcado no mapa', lat: -5.85, lng: -35.13, inServiceArea: false });
  });

  test('o nome vem do ponto arredondado a 4 casas (cache e privacidade); a coordenada devolvida é a exata', async () => {
    const reply = await get(main.app, '/v1/geo/reverse?lat=-5.79824&lng=-35.20336', passenger);
    assert.equal(reply.status, 200, reply.raw);
    assert.deepEqual(reply.body.data, { label: SYNTHETIC_PIN_LABEL, lat: -5.79824, lng: -35.20336, inServiceArea: true });
  });

  test('fora da área NÃO é erro: inServiceArea false', async () => {
    const t = await startGeoApp({ provider: () => ({ forward: async () => [], reverse: async () => ({ label: 'Ceará-Mirim' }), directions: async () => { throw new Error('não usado'); } }) });
    const token = await sessionOn(t.app);
    const reply = await get(t.app, '/v1/geo/reverse?lat=-5.63&lng=-35.42', token);
    assert.equal(reply.status, 200, reply.raw);
    assert.deepEqual(reply.body.data, { label: 'Ceará-Mirim', lat: -5.63, lng: -35.42, inServiceArea: false });
  });

  test('Mapbox fora: 502 geo_unavailable', async () => {
    const t = await startGeoApp();
    const token = await sessionOn(t.app);
    t.replay.failNext('/geocode/v6/reverse', { status: 500 });
    t.replay.failNext('/geocode/v6/reverse', { status: 500 });
    assertRefused(await get(t.app, '/v1/geo/reverse?lat=-5.811&lng=-35.2065', token), 'geo_unavailable', 502);
  });
});

describe('área e categorias (semente da 0026)', () => {
  test('GET /v1/service-area: a área ativa de Natal, polígono [lng, lat] e bbox gerada', async () => {
    const reply = await get(main.app, '/v1/service-area', passenger);
    assert.equal(reply.status, 200, reply.raw);
    assert.equal(reply.headers['cache-control'], 'private, max-age=60');
    const area = reply.body.data;
    assert.equal(area.name, 'Grande Natal');
    assert.match(area.areaId, /^[0-9a-f-]{36}$/);
    assert.equal(area.polygon.type, 'Polygon');
    assert.deepEqual(area.polygon.coordinates[0][0], [-35.42, -5.7]);
    assert.deepEqual(area.bbox, [-35.42, -6.02, -35.12, -5.66]);
  });

  test('GET /v1/categories: só as LIGADAS, na ordem da tela, na forma do contrato', async () => {
    const reply = await get(main.app, '/v1/categories', passenger);
    assert.equal(reply.status, 200, reply.raw);
    assert.deepEqual(reply.body.data, [
      { slug: 'vuumbora', name: 'VuumBora', description: 'Carro para o dia a dia.', seats: 4 },
      { slug: 'conforto', name: 'Conforto', description: 'Carro mais espaçoso.', seats: 4 },
    ]);
  });
});
