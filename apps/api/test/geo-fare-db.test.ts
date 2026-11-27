/**
 * Geografia e preço (migração 0026, fatia G1 do plano M3/M4), no banco real.
 *
 * Cada regra tem teste NEGATIVO (o banco recusa). As regras de gatilho rodam com a credencial DONA (superusuário nos
 * testes): só o gatilho pode recusar ali, então o teste prova a camada 1 e não o privilégio. A camada 2 (REVOKE) é
 * provada com o papel da API (`pool`, ou `SET LOCAL ROLE vuumbora_api` dentro da transação).
 *
 * O banco persiste entre execuções: tudo que publica tarifa, liga categoria ou mexe em área roda numa transação desfeita
 * no fim (a versão de teste semeada continua sendo a vigente para os outros arquivos, como a G4 da Vega espera).
 */
import './helpers/auth-env.js';
import './helpers/runtime-role-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { after, before, describe, test } from 'node:test';
import { prepararBanco } from '../src/migrate.js';
import { pool, shutdown } from './helpers/harness.js';
import { insertAccount } from './helpers/legal-kit.js';
import { OWNER_DATABASE_URL } from './helpers/runtime-role-env.js';

const owner = new pg.Pool({ connectionString: OWNER_DATABASE_URL, max: 4 });
const SCRUB_HASH = `$2b$04$${'x'.repeat(53)}`;
const SIGNATURE = 'a'.repeat(64);
type Db = Pick<pg.Pool, 'query'>;

type Failure = { code?: string; constraint?: string };
/** A promessa tem de falhar com este SQLSTATE (e, se dito, esta restrição): nunca "falhou por qualquer motivo". */
async function rejectsWith(promise: Promise<unknown>, code: string, constraint?: string): Promise<void> {
  await assert.rejects(promise, (err: Failure) => {
    assert.equal(err.code, code, `SQLSTATE esperado ${code}, veio ${err.code}`);
    if (constraint !== undefined) assert.equal(err.constraint, constraint);
    return true;
  });
}

/** Recusa dentro de uma transação: o SAVEPOINT deixa a transação seguir depois do erro. */
async function rejectsInTx(c: pg.PoolClient, sql: string, params: unknown[], code: string, constraint?: string): Promise<void> {
  await c.query('SAVEPOINT recusa');
  await rejectsWith(c.query(sql, params), code, constraint);
  await c.query('ROLLBACK TO SAVEPOINT recusa');
}

/** Transação da credencial dona, SEMPRE desfeita: nada do que ela publica vaza para outro teste. */
async function inOwnerTx(fn: (c: pg.PoolClient) => Promise<void>): Promise<void> {
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    await fn(c);
  } finally {
    await c.query('ROLLBACK').catch(() => undefined);
    c.release();
  }
}

async function admin(db: Db, role: string, deactivated = false): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO admin_users (name, email, password_hash, role, deactivated_at) VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN now() END) RETURNING id`,
    [`Admin ${role}`, `${role}-${randomUUID().slice(0, 8)}@teste.vuumbora.dev`, SCRUB_HASH, role, deactivated],
  );
  return res.rows[0]!.id;
}

interface Rate {
  readonly slug: string;
  readonly base: number;
  readonly perKm: number;
  readonly perMinute: number;
  readonly minimum: number;
}
const RATES: readonly Rate[] = [
  { slug: 'vuumbora', base: 410, perKm: 160, perMinute: 26, minimum: 810 },
  { slug: 'conforto', base: 560, perKm: 220, perMinute: 36, minimum: 1110 },
];

async function draftVersion(db: Db, opts: { isTest?: boolean; createdBy?: string | null; rates?: readonly Rate[] } = {}): Promise<string> {
  const id = (
    await db.query<{ id: string }>(
      `INSERT INTO fare_rule_versions (city_code, is_test, created_by, note) VALUES ('natal', $1, $2, 'versão do teste G1') RETURNING id`,
      [opts.isTest ?? true, opts.createdBy ?? null],
    )
  ).rows[0]!.id;
  for (const r of opts.rates ?? RATES) {
    await db.query(
      `INSERT INTO fare_rule_rates (version_id, category_slug, base_cents, per_km_cents, per_minute_cents, minimum_fare_cents) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, r.slug, r.base, r.perKm, r.perMinute, r.minimum],
    );
  }
  return id;
}

const publish = (db: Db, id: string) => db.query(`UPDATE fare_rule_versions SET valid_from = now() WHERE id = $1`, [id]);

async function publishedVersion(db: Db, opts: { isTest?: boolean; createdBy?: string | null; rates?: readonly Rate[] } = {}): Promise<string> {
  const id = await draftVersion(db, opts);
  await publish(db, id);
  return id;
}

const currentVersion = async (db: Db) =>
  (await db.query<{ id: string }>(`SELECT current_fare_rule_version('natal') AS id`)).rows[0]!.id;

// Midway Mall -> Natal Shopping (dentro da área semeada).
const ORIGIN = { lat: -5.811, lng: -35.2065 };
const DESTINATION = { lat: -5.8429, lng: -35.2113 };

interface QuoteInput {
  accountId: string;
  versionId: string;
  category?: string;
  origin?: { lat: number; lng: number };
  destination?: { lat: number; lng: number };
  priceCents?: number;
  signature?: string;
  /** Expressão SQL da validade (o relógio do banco). */
  expiresAt?: string;
  createdAt?: string;
}

function insertQuote(db: Db, q: QuoteInput) {
  const o = q.origin ?? ORIGIN;
  const d = q.destination ?? DESTINATION;
  return db.query<{ id: string; created_at: Date; expires_at: Date }>(
    `INSERT INTO fare_quotes (account_id, fare_version_id, category_slug, origin_lat, origin_lng, origin_label,
                              destination_lat, destination_lng, destination_label, distance_m, duration_s, price_cents,
                              signature, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'Midway Mall', $6, $7, 'Natal Shopping', 4200, 600, $8, $9, ${q.createdAt ?? 'now()'}, ${q.expiresAt ?? "clock_timestamp() + interval '300 seconds'"})
     RETURNING id, created_at, expires_at`,
    [q.accountId, q.versionId, q.category ?? 'vuumbora', o.lat, o.lng, d.lat, d.lng, q.priceCents ?? 1500, q.signature ?? SIGNATURE],
  );
}

/** Ponto no polígono (raio par/ímpar), só para conferir a SEMENTE contra o polígono semeado. A regra da API é a do domínio. */
function insideRing(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[j]!;
    if (ay > lat !== by > lat && lng < ((bx - ax) * (lat - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

let passenger = '';
let seedVersion = '';

before(async () => {
  await prepararBanco({ databaseUrl: OWNER_DATABASE_URL, pool: owner, log: () => undefined });
  passenger = await insertAccount(owner, 'passenger', 'cotacao');
  seedVersion = await currentVersion(owner);
});
after(async () => {
  await shutdown();
  await owner.end();
});

describe('categorias de corrida (decisão 13, D-08/D-09)', () => {
  test('as 5 do lançamento existem; só VuumBora e Conforto ligadas; Entrega sem passageiro; a API lê', async () => {
    const rows = (
      await pool.query<{ slug: string; kind: string; seats: number; carries_passenger: boolean; is_enabled: boolean }>(
        `SELECT slug, kind, seats, carries_passenger, is_enabled FROM ride_categories ORDER BY sort_order`,
      )
    ).rows;
    assert.deepEqual(rows.map((r) => r.slug), ['vuumbora', 'conforto', 'motorista_mulher', 'pet', 'entrega']);
    assert.deepEqual(rows.filter((r) => r.is_enabled).map((r) => r.slug), ['vuumbora', 'conforto']);
    assert.deepEqual(rows.find((r) => r.slug === 'entrega'), { slug: 'entrega', kind: 'modifier', seats: 0, carries_passenger: false, is_enabled: false });
  });

  test('ligar categoria SEM valor na tarifa vigente é recusado; com a versão publicada antes, liga', async () => {
    await inOwnerTx(async (c) => {
      await rejectsInTx(c, `UPDATE ride_categories SET is_enabled = true WHERE slug = 'pet'`, [], '23514', 'ride_categories_enabled_has_fare');
      await publishedVersion(c, { rates: [...RATES, { slug: 'pet', base: 500, perKm: 170, perMinute: 28, minimum: 950 }] });
      await c.query(`UPDATE ride_categories SET is_enabled = true WHERE slug = 'pet'`);
      await rejectsInTx(c, `UPDATE ride_categories SET slug = 'pet2' WHERE slug = 'pet'`, [], '42501');
    });
  });

  test('a API não liga nem cria categoria (42501), e o catálogo não se trunca', async () => {
    await rejectsWith(pool.query(`UPDATE ride_categories SET is_enabled = true WHERE slug = 'motorista_mulher'`), '42501');
    await rejectsWith(pool.query(`INSERT INTO ride_categories (slug, name, description, seats, kind, carries_passenger, sort_order) VALUES ('moto', 'Moto', 'Moto.', 1, 'base_tier', true, 60)`), '42501');
    for (const table of ['ride_categories', 'service_areas', 'curated_places', 'fare_rule_versions', 'fare_rule_rates']) {
      await rejectsWith(owner.query(`TRUNCATE ${table} CASCADE`), '42501');
    }
  });
});

describe('área de serviço (N7, sem PostGIS)', () => {
  test('a semente é uma área ativa e provisória em Natal, com a caixa GERADA do contorno; a API lê', async () => {
    const rows = (
      await pool.query<{ polygon: { type: string; coordinates: [number, number][][] }; bbox: number[]; provisional: boolean }>(
        `SELECT polygon, ARRAY[bbox_west, bbox_south, bbox_east, bbox_north] AS bbox, provisional FROM service_areas WHERE city_code = 'natal' AND is_active`,
      )
    ).rows;
    assert.equal(rows.length, 1);
    const { polygon, bbox, provisional } = rows[0]!;
    assert.equal(polygon.type, 'Polygon');
    assert.equal(provisional, true);
    const ring = polygon.coordinates[0]!;
    const lngs = ring.map((p) => p[0]);
    const lats = ring.map((p) => p[1]);
    assert.deepEqual(bbox, [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)]);
    // Os lugares que definem a Grande Natal caem dentro; mar aberto e Mossoró, fora.
    assert.ok(insideRing(-35.3721, -5.7686, ring), 'aeroporto (São Gonçalo do Amarante)');
    assert.ok(insideRing(-35.263, -5.915, ring), 'Parnamirim');
    assert.ok(insideRing(-35.2094, -5.7945, ring), 'centro de Natal');
    assert.ok(!insideRing(-35.05, -5.8, ring), 'mar');
    assert.ok(!insideRing(-37.344, -5.188, ring), 'Mossoró');
  });

  test('polígono inválido é recusado (o CHECK espelha assertValidPolygon), a caixa não se escreve e só há uma área ativa por cidade', async () => {
    const insert = `INSERT INTO service_areas (city_code, name, polygon, source) VALUES ('natal', 'Teste', $1::jsonb, 'teste do G1')`;
    const ring = [[-35.3, -5.7], [-35.2, -5.7], [-35.2, -5.8], [-35.3, -5.7]];
    const invalid: unknown[] = [
      { type: 'Polygon', coordinates: [[[-35.3, -5.7], [-35.2, -5.7], [-35.2, -5.8], [-35.3, -5.75]]] }, // anel aberto
      { type: 'Polygon', coordinates: [[[-35.3, -5.7], [-35.2, -5.7], [-35.3, -5.7]]] }, // 3 posições
      { type: 'MultiPolygon', coordinates: [ring] },
      { type: 'Polygon', coordinates: [] },
      { type: 'Polygon', coordinates: [[[-35.3, '-5.7'], [-35.2, -5.7], [-35.2, -5.8], [-35.3, '-5.7']]] },
      { type: 'Polygon', coordinates: [[[-35.3, -95], [-35.2, -5.7], [-35.2, -5.8], [-35.3, -95]]] },
      { type: 'Polygon', coordinates: [[[-35.3, -5.7, 10], [-35.2, -5.7, 10], [-35.2, -5.8, 10], [-35.3, -5.7, 10]]] },
      { type: 'Polygon', coordinates: [ring], crs: 'x' },
      'Polygon',
    ];
    await inOwnerTx(async (c) => {
      for (const polygon of invalid) {
        await rejectsInTx(c, insert, [JSON.stringify(polygon)], '23514', 'service_areas_polygon_valid');
      }
      // Polígono degenerado (todos os pontos na mesma linha de latitude): caixa sem área.
      await rejectsInTx(c, insert, [JSON.stringify({ type: 'Polygon', coordinates: [[[-35.3, -5.7], [-35.2, -5.7], [-35.1, -5.7], [-35.3, -5.7]]] })], '23514', 'service_areas_bbox_not_degenerate');
      // A caixa é gerada: escrever nela é erro de coluna gerada.
      await rejectsInTx(c, `UPDATE service_areas SET bbox_west = -40 WHERE city_code = 'natal'`, [], '428C9');
      // Segunda área ativa na mesma cidade.
      await rejectsInTx(c, `INSERT INTO service_areas (city_code, name, polygon, source, is_active) VALUES ('natal', 'Outra', $1::jsonb, 'teste do G1', true)`, [JSON.stringify({ type: 'Polygon', coordinates: [ring] })], '23505');
    });
    await rejectsWith(pool.query(`UPDATE service_areas SET is_active = false`), '42501');
  });
});

describe('pontos próprios (N6)', () => {
  test('a semente tem ~20 lugares ativos e provisórios, todos dentro do polígono semeado, com termos normalizados', async () => {
    const area = (await pool.query<{ polygon: { coordinates: [number, number][][] } }>(`SELECT polygon FROM service_areas WHERE city_code = 'natal' AND is_active`)).rows[0]!;
    const places = (
      await pool.query<{ code: string; lat: number; lng: number; aliases: string[]; is_active: boolean; provisional: boolean }>(
        `SELECT code, lat, lng, aliases, is_active, provisional FROM curated_places WHERE city_code = 'natal'`,
      )
    ).rows;
    assert.ok(places.length >= 18 && places.length <= 25, `~20 lugares (veio ${places.length})`);
    for (const p of places) {
      assert.ok(p.is_active && p.provisional, `${p.code}: ativo e provisório`);
      assert.ok(insideRing(p.lng, p.lat, area.polygon.coordinates[0]!), `${p.code}: dentro do polígono`);
      assert.ok(p.aliases.length > 0 && p.aliases.every((a) => /^[a-z0-9]+( [a-z0-9]+)*$/.test(a)), `${p.code}: termos normalizados`);
    }
    for (const code of ['aeroporto-natal', 'rodoviaria-natal', 'midway-mall', 'arena-das-dunas', 'ufrn-campus-central']) {
      assert.ok(places.some((p) => p.code === code), code);
    }
  });

  test('latitude e longitude trocadas, ou termo com acento/maiúscula, são recusados; a API não escreve', async () => {
    const insert = `INSERT INTO curated_places (code, city_code, name, address, category, lat, lng, aliases) VALUES ($1, 'natal', 'Lugar de teste', 'Natal - RN', 'landmark', $2, $3, $4)`;
    await inOwnerTx(async (c) => {
      await rejectsInTx(c, insert, ['teste-trocado', -35.2065, -5.811, ['teste']], '23514', 'curated_places_inside_service_area');
      await rejectsInTx(c, insert, ['teste-mossoro', -5.188, -37.344, ['teste']], '23514', 'curated_places_inside_service_area');
      await rejectsInTx(c, insert, ['teste-acento', -5.811, -35.2065, ['rodoviária']], '23514', 'curated_places_aliases_valid');
      await rejectsInTx(c, insert, ['teste-maiuscula', -5.811, -35.2065, ['Midway']], '23514', 'curated_places_aliases_valid');
      await rejectsInTx(c, insert, ['teste-espaco', -5.811, -35.2065, ['midway  mall']], '23514', 'curated_places_aliases_valid');
      await c.query(insert, ['teste-ok', -5.811, -35.2065, ['lugar de teste']]);
      // Mover um ponto ativo para fora também é recusado.
      await rejectsInTx(c, `UPDATE curated_places SET lat = -6.5 WHERE code = 'teste-ok'`, [], '23514', 'curated_places_inside_service_area');
    });
    await rejectsWith(pool.query(`UPDATE curated_places SET lat = lat`), '42501');
  });
});

describe('tarifa versionada (N8)', () => {
  test('ACEITE G1: o gatilho recusa UPDATE em versão FECHADA, até para o dono (e na vigente, e o DELETE, e os valores)', async () => {
    await inOwnerTx(async (c) => {
      const closed = await currentVersion(c);
      const next = await publishedVersion(c);
      const periods = (await c.query<{ id: string; valid_from: Date; valid_to: Date | null }>(`SELECT id, valid_from, valid_to FROM fare_rule_version_periods WHERE id IN ($1, $2)`, [closed, next])).rows;
      const old = periods.find((p) => p.id === closed)!;
      const cur = periods.find((p) => p.id === next)!;
      assert.ok(old.valid_to, 'a anterior ficou fechada');
      assert.equal(old.valid_to!.getTime(), cur.valid_from.getTime(), 'valid_to da anterior = valid_from da nova');
      assert.equal(cur.valid_to, null, 'a nova é a vigente');

      // Versão FECHADA: nenhuma coluna muda, nem a "reabertura".
      await rejectsInTx(c, `UPDATE fare_rule_versions SET note = 'adulterada' WHERE id = $1`, [closed], '42501');
      await rejectsInTx(c, `UPDATE fare_rule_versions SET is_test = false WHERE id = $1`, [closed], '42501');
      await rejectsInTx(c, `UPDATE fare_rule_versions SET valid_from = NULL WHERE id = $1`, [closed], '42501');
      await rejectsInTx(c, `DELETE FROM fare_rule_versions WHERE id = $1`, [closed], '42501');
      await rejectsInTx(c, `UPDATE fare_rule_rates SET base_cents = 1 WHERE version_id = $1`, [closed], '42501');
      await rejectsInTx(c, `DELETE FROM fare_rule_rates WHERE version_id = $1`, [closed], '42501');
      await rejectsInTx(c, `INSERT INTO fare_rule_rates (version_id, category_slug, base_cents, per_km_cents, per_minute_cents, minimum_fare_cents) VALUES ($1, 'pet', 1, 1, 1, 1)`, [closed], '42501');
      // Vigente: também imutável (corrigir = publicar a seguinte).
      await rejectsInTx(c, `UPDATE fare_rule_versions SET note = 'adulterada' WHERE id = $1`, [next], '42501');
      await rejectsInTx(c, `UPDATE fare_rule_rates SET per_km_cents = per_km_cents + 1 WHERE version_id = $1`, [next], '42501');
    });
  });

  test('o fluxo da API (papel restrito): rascunho -> valores -> publica; o relógio é do banco e a vigente troca', async () => {
    await inOwnerTx(async (c) => {
      const dono = await admin(c, 'dono');
      await c.query('SET LOCAL ROLE vuumbora_api');
      const draft = (
        await c.query<{ id: string; valid_from: Date | null }>(
          `INSERT INTO fare_rule_versions (city_code, is_test, created_by, valid_from) VALUES ('natal', true, $1, now() - interval '10 days') RETURNING id, valid_from`,
          [dono],
        )
      ).rows[0]!;
      assert.equal(draft.valid_from, null, 'toda versão nasce rascunho, mesmo se a aplicação mandar a data');
      await rejectsInTx(c, `DELETE FROM fare_rule_versions WHERE id = $1`, [draft.id], '42501'); // privilégio: a API não apaga nem rascunho
      for (const r of RATES) {
        await c.query(
          `INSERT INTO fare_rule_rates (version_id, category_slug, base_cents, per_km_cents, per_minute_cents, minimum_fare_cents) VALUES ($1, $2, $3, $4, $5, $6)`,
          [draft.id, r.slug, r.base, r.perKm, r.perMinute, r.minimum],
        );
      }
      await rejectsInTx(c, `UPDATE fare_rule_rates SET base_cents = 1 WHERE version_id = $1`, [draft.id], '42501'); // privilégio: valor só entra
      await c.query(`UPDATE fare_rule_versions SET valid_from = '2000-01-01' WHERE id = $1`, [draft.id]);
      const published = (await c.query<{ valid_from: Date }>(`SELECT valid_from FROM fare_rule_versions WHERE id = $1`, [draft.id])).rows[0]!;
      assert.ok(Date.now() - published.valid_from.getTime() < 60_000, 'valid_from é o relógio do banco, não o valor enviado');
      assert.equal(await currentVersion(c), draft.id);
      const rates = (await c.query<{ category_slug: string; base_cents: number }>(`SELECT category_slug, base_cents FROM current_fare_rules WHERE city_code = 'natal' ORDER BY category_slug`)).rows;
      assert.deepEqual(rates, [{ category_slug: 'conforto', base_cents: 560 }, { category_slug: 'vuumbora', base_cents: 410 }]);
    });
  });

  test('autor: só dono ativo cria e publica; tarifa REAL sempre tem autor', async () => {
    await inOwnerTx(async (c) => {
      const support = await admin(c, 'suporte');
      const inactive = await admin(c, 'dono', true);
      const insert = `INSERT INTO fare_rule_versions (city_code, is_test, created_by) VALUES ('natal', $1, $2)`;
      await rejectsInTx(c, insert, [true, support], '42501', 'fare_rule_versions_author_role');
      await rejectsInTx(c, insert, [false, inactive], '42501', 'fare_rule_versions_author_role');
      await rejectsInTx(c, insert, [false, null], '23514', 'fare_rule_versions_real_has_author');
      // Autor desativado entre criar e publicar: a publicação confere de novo.
      const dono = await admin(c, 'dono');
      const draft = await draftVersion(c, { isTest: false, createdBy: dono });
      await c.query(`UPDATE admin_users SET deactivated_at = now() WHERE id = $1`, [dono]);
      await rejectsInTx(c, `UPDATE fare_rule_versions SET valid_from = now() WHERE id = $1`, [draft], '42501', 'fare_rule_versions_author_role');
    });
  });

  test('Idempotency-Key: a mesma chave do mesmo dono não cria segunda versão; a chave é gravada no INSERT e não muda', async () => {
    await inOwnerTx(async (c) => {
      const dono = await admin(c, 'dono');
      const other = await admin(c, 'dono');
      const insert = `INSERT INTO fare_rule_versions (city_code, is_test, created_by, idempotency_key) VALUES ('natal', true, $1, $2) RETURNING id`;
      const key = randomUUID();
      const first = (await c.query<{ id: string }>(insert, [dono, key])).rows[0]!.id;
      await rejectsInTx(c, insert, [dono, key], '23505', 'fare_rule_versions_idempotency_key');
      await c.query(insert, [other, key]); // a chave é por autor
      await rejectsInTx(c, `INSERT INTO fare_rule_versions (city_code, is_test, idempotency_key) VALUES ('natal', true, $1)`, [randomUUID()], '23514', 'fare_rule_versions_idempotency_key_len');
      await rejectsInTx(c, `UPDATE fare_rule_versions SET idempotency_key = 'outra' WHERE id = $1`, [first], '42501');
    });
  });

  test('publicação: sem valores, sem categoria ligada, teste depois de real e mudança de campo do rascunho são recusados', async () => {
    await inOwnerTx(async (c) => {
      const dono = await admin(c, 'dono');
      const empty = await draftVersion(c, { rates: [] });
      await rejectsInTx(c, `UPDATE fare_rule_versions SET valid_from = now() WHERE id = $1`, [empty], '23514', 'fare_rule_versions_has_rates');
      const partial = await draftVersion(c, { rates: [RATES[0]!] });
      await rejectsInTx(c, `UPDATE fare_rule_versions SET valid_from = now() WHERE id = $1`, [partial], '23514', 'fare_rule_versions_covers_enabled_categories');
      await rejectsInTx(c, `UPDATE fare_rule_versions SET city_code = 'outra' WHERE id = $1`, [partial], '42501');
      await rejectsInTx(c, `UPDATE fare_rule_versions SET created_by = $2 WHERE id = $1`, [partial, dono], '42501');
      // Rascunho se descarta (os valores vão em cascata).
      await c.query(`DELETE FROM fare_rule_versions WHERE id = $1`, [partial]);
      // Depois da primeira tarifa REAL, nenhuma de teste é publicada.
      await publishedVersion(c, { isTest: false, createdBy: dono });
      const test = await draftVersion(c, { isTest: true });
      await rejectsInTx(c, `UPDATE fare_rule_versions SET valid_from = now() WHERE id = $1`, [test], '23514', 'fare_rule_versions_no_test_after_real');
      // Valor fora da faixa (centavos x reais) e categoria inexistente.
      await rejectsInTx(c, `INSERT INTO fare_rule_rates (version_id, category_slug, base_cents, per_km_cents, per_minute_cents, minimum_fare_cents) VALUES ($1, 'pet', -1, 1, 1, 1)`, [test], '23514', 'fare_rule_rates_values_range');
      await rejectsInTx(c, `INSERT INTO fare_rule_rates (version_id, category_slug, base_cents, per_km_cents, per_minute_cents, minimum_fare_cents) VALUES ($1, 'pet', 0, 0, 0, 0)`, [test], '23514', 'fare_rule_rates_not_free');
      await rejectsInTx(c, `INSERT INTO fare_rule_rates (version_id, category_slug, base_cents, per_km_cents, per_minute_cents, minimum_fare_cents) VALUES ($1, 'moto', 1, 1, 1, 1)`, [test], '23503');
    });
  });
});

describe('cotação (N9, D-06)', () => {
  test('a API grava a cotação com o relógio do banco; ela é imutável ATÉ para o dono e a API não apaga', async () => {
    const before = Date.now();
    const quote = (await insertQuote(pool, { accountId: passenger, versionId: seedVersion, createdAt: "'2000-01-01'" })).rows[0]!;
    assert.ok(quote.created_at.getTime() >= before - 5_000, 'created_at é o do banco (o enviado foi descartado)');
    await rejectsWith(owner.query(`UPDATE fare_quotes SET price_cents = 1 WHERE id = $1`, [quote.id]), '42501');
    await rejectsWith(pool.query(`UPDATE fare_quotes SET price_cents = 1 WHERE id = $1`, [quote.id]), '42501');
    await rejectsWith(pool.query(`DELETE FROM fare_quotes WHERE id = $1`, [quote.id]), '42501');
    const row = (await pool.query(`SELECT price_cents, category_slug, fare_version_id FROM fare_quotes WHERE id = $1`, [quote.id])).rows[0];
    assert.deepEqual(row, { price_cents: 1500, category_slug: 'vuumbora', fare_version_id: seedVersion });
  });

  test('regras da cotação: passageiro, versão vigente, categoria ligada, preço mínimo, área, validade, assinatura', async () => {
    const driver = await insertAccount(owner, 'driver', 'cotacao-motorista');
    await rejectsWith(insertQuote(pool, { accountId: driver, versionId: seedVersion }), '23514', 'fare_quotes_passenger_account');
    await rejectsWith(insertQuote(pool, { accountId: passenger, versionId: seedVersion, priceCents: 799 }), '23514', 'fare_quotes_price_at_least_minimum');
    await rejectsWith(insertQuote(pool, { accountId: passenger, versionId: seedVersion, destination: { lat: -5.8, lng: -35.05 } }), '23514', 'fare_quotes_inside_service_area');
    await rejectsWith(insertQuote(pool, { accountId: passenger, versionId: seedVersion, origin: { lat: -35.2065, lng: -5.811 } }), '23514', 'fare_quotes_inside_service_area');
    await rejectsWith(insertQuote(pool, { accountId: passenger, versionId: seedVersion, expiresAt: "clock_timestamp() + interval '10 minutes'" }), '23514', 'fare_quotes_ttl');
    await rejectsWith(insertQuote(pool, { accountId: passenger, versionId: seedVersion, expiresAt: "clock_timestamp() - interval '1 second'" }), '23514', 'fare_quotes_ttl');
    await rejectsWith(insertQuote(pool, { accountId: passenger, versionId: seedVersion, signature: 'curta' }), '23514', 'fare_quotes_signature_format');
    // Pet está desligada (o gatilho recusa antes da FK).
    await rejectsWith(insertQuote(pool, { accountId: passenger, versionId: seedVersion, category: 'pet' }), '23514', 'fare_quotes_category_enabled');
    // Categoria sem valor na versão: a FK composta segura mesmo com o gatilho desligado.
    await inOwnerTx(async (c) => {
      await c.query('ALTER TABLE fare_quotes DISABLE TRIGGER fare_quotes_guard');
      await c.query('SAVEPOINT recusa');
      await rejectsWith(insertQuote(c, { accountId: passenger, versionId: seedVersion, category: 'pet' }), '23503', 'fare_quotes_rate_fkey');
      await c.query('ROLLBACK TO SAVEPOINT recusa');
    });

    await inOwnerTx(async (c) => {
      const withPet = await publishedVersion(c, { rates: [...RATES, { slug: 'pet', base: 500, perKm: 170, perMinute: 28, minimum: 950 }] });
      await c.query('SET LOCAL ROLE vuumbora_api');
      // A semente deixou de ser a vigente: cotar com ela é recusado (versão publicada no meio da cotação).
      await c.query('SAVEPOINT recusa');
      await rejectsWith(insertQuote(c, { accountId: passenger, versionId: seedVersion }), '23514', 'fare_quotes_version_current');
      await c.query('ROLLBACK TO SAVEPOINT recusa');
      // Pet tem valor mas está desligada.
      await c.query('SAVEPOINT recusa');
      await rejectsWith(insertQuote(c, { accountId: passenger, versionId: withPet, category: 'pet' }), '23514', 'fare_quotes_category_enabled');
      await c.query('ROLLBACK TO SAVEPOINT recusa');
      await insertQuote(c, { accountId: passenger, versionId: withPet, category: 'conforto', priceCents: 1110 });
    });
  });

  test('purga: cotação com mais de 30 dias sai em lote, a recente fica; só a API e o dono executam', async () => {
    await inOwnerTx(async (c) => {
      const recent = (await insertQuote(c, { accountId: passenger, versionId: seedVersion })).rows[0]!.id;
      const old = (await insertQuote(c, { accountId: passenger, versionId: seedVersion })).rows[0]!.id;
      // Envelhece uma linha sem passar pelos gatilhos (restauração/réplica), só para o teste.
      await c.query(`SET LOCAL session_replication_role = replica`);
      await c.query(`UPDATE fare_quotes SET created_at = now() - interval '31 days', expires_at = now() - interval '31 days' + interval '300 seconds' WHERE id = $1`, [old]);
      await c.query(`SET LOCAL session_replication_role = origin`);
      await c.query('SET LOCAL ROLE vuumbora_api');
      await rejectsInTx(c, `SELECT purge_fare_quotes(0)`, [], '22023');
      let purged = 0;
      for (;;) {
        const n = (await c.query<{ n: number }>(`SELECT purge_fare_quotes(1000) AS n`)).rows[0]!.n;
        if (n === 0) break;
        purged += n;
      }
      assert.ok(purged >= 1);
      const left = (await c.query<{ id: string }>(`SELECT id FROM fare_quotes WHERE id IN ($1, $2)`, [recent, old])).rows.map((r) => r.id);
      assert.deepEqual(left, [recent]);
    });
    const grants = await owner.query<{ api: boolean; pub: boolean }>(
      `SELECT has_function_privilege('vuumbora_api', 'purge_fare_quotes(integer)', 'EXECUTE') AS api,
              has_function_privilege('public', 'purge_fare_quotes(integer)', 'EXECUTE') AS pub`,
    );
    assert.deepEqual(grants.rows[0], { api: true, pub: false });
  });

  test('excluir a conta (delete_account, com o papel da API) apaga as cotações dela na hora', async () => {
    const account = await insertAccount(owner, 'passenger', 'cotacao-exclui');
    const other = (await insertQuote(pool, { accountId: passenger, versionId: seedVersion })).rows[0]!.id;
    await insertQuote(pool, { accountId: account, versionId: seedVersion });
    await insertQuote(pool, { accountId: account, versionId: seedVersion, category: 'conforto', priceCents: 1100 });
    assert.equal((await owner.query<{ n: number }>(`SELECT count(*)::int AS n FROM fare_quotes WHERE account_id = $1`, [account])).rows[0]!.n, 2);
    assert.equal((await pool.query<{ r: string }>('SELECT delete_account($1, $2) AS r', [account, SCRUB_HASH])).rows[0]!.r, 'ok');
    assert.equal((await owner.query<{ n: number }>(`SELECT count(*)::int AS n FROM fare_quotes WHERE account_id = $1`, [account])).rows[0]!.n, 0);
    assert.equal((await owner.query<{ n: number }>(`SELECT count(*)::int AS n FROM fare_quotes WHERE id = $1`, [other])).rows[0]!.n, 1, 'a de outra conta fica');
  });
});
