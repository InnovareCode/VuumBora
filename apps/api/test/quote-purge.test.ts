/**
 * Rotina de operador `quotes:purge` (`scripts/purge-fare-quotes.mjs`): repete `purge_fare_quotes` (0026) até zerar. Roda o
 * script DE VERDADE, como processo filho, com a `DATABASE_URL` do papel restrito `vuumbora_api` (prova que o cron do
 * contêiner não precisa da credencial dona).
 *
 * Prova: apaga as cotações com mais de 30 dias (inclusive em várias voltas, com lote 1), deixa as novas, imprime só
 * contagens (nenhum rótulo, coordenada ou assinatura) e desiste sem erro quando outra execução segura a trava.
 */
import './helpers/auth-env.js';
import './helpers/runtime-role-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { Writable } from 'node:stream';
import { promisify } from 'node:util';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prepararBanco } from '../src/migrate.js';
import { shutdown } from './helpers/harness.js';
import { FakeMailbox, makeClient, randomIp, uniqueEmail } from './helpers/identity-kit.js';
import { ensureBaseline } from './helpers/legal-kit.js';
import { replayFetch, replayProvider, testGeoConfig } from './helpers/mapbox-replay.js';
import { OWNER_DATABASE_URL } from './helpers/runtime-role-env.js';

const run = promisify(execFile);
const SCRIPT = path.resolve(import.meta.dirname, '../scripts/purge-fare-quotes.mjs');
const owner = new pg.Pool({ connectionString: OWNER_DATABASE_URL, max: 2 });
const mailbox = new FakeMailbox();
let app: FastifyInstance;
let token = '';

const MIDWAY = { lat: -5.811, lng: -35.2065, label: 'Casa da Fulana' };
const PRAIA = { lat: -5.871, lng: -35.1825, label: 'Trabalho do Beltrano' };

async function issueQuotes(): Promise<{ quoteId: string; signature: string }[]> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/quotes',
    headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': randomIp() },
    payload: { origin: MIDWAY, destination: PRAIA },
  });
  assert.equal(response.statusCode, 200, response.body);
  return JSON.parse(response.body).data.quotes;
}

/** Cotação é imutável (gatilho): envelhecer exige a credencial dona com os gatilhos desligados nesta transação. */
async function age(ids: string[], days: number): Promise<void> {
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL session_replication_role = replica');
    await c.query(
      `UPDATE fare_quotes SET created_at = created_at - make_interval(days => $2), expires_at = expires_at - make_interval(days => $2) WHERE id = ANY($1::uuid[])`,
      [ids, days],
    );
    await c.query('COMMIT');
  } finally {
    c.release();
  }
}

async function existing(ids: string[]): Promise<string[]> {
  const result = await owner.query<{ id: string }>(`SELECT id FROM fare_quotes WHERE id = ANY($1::uuid[]) ORDER BY id`, [ids]);
  return result.rows.map((row) => row.id);
}

/** O script com a `DATABASE_URL` do papel restrito (a deste processo, depois de `runtime-role-env`). */
function purge(...args: string[]) {
  return run(process.execPath, [SCRIPT, ...args], { env: { ...process.env, DATABASE_URL: process.env['DATABASE_URL'] }, timeout: 60_000 });
}

before(async () => {
  await prepararBanco({ databaseUrl: OWNER_DATABASE_URL, pool: owner, log: () => undefined });
  await ensureBaseline(owner);
  app = await buildApp({ logStream: new Writable({ write: (_c, _e, callback) => callback() }), mail: mailbox, geo: { config: testGeoConfig(), provider: replayProvider(replayFetch()) } });
  await app.ready();
  token = (await makeClient({ t: { app, logs: () => '' }, mailbox }).registerAndLogin(uniqueEmail('passageiro'), 'passenger')).accessToken;
});

after(async () => {
  await app.close();
  await owner.end();
  await shutdown();
});

describe('quotes:purge', () => {
  test('apaga as de mais de 30 dias em várias voltas (lote 1), deixa as novas, e só imprime contagens', async () => {
    const old = await issueQuotes();
    const borderline = await issueQuotes();
    const fresh = await issueQuotes();
    await age(old.map((q) => q.quoteId), 31);
    await age(borderline.map((q) => q.quoteId), 29);

    const { stdout, stderr } = await purge('--batch=1');
    assert.equal(stderr, '');
    const report = JSON.parse(stdout.trim()) as { event: string; deleted: number; rounds: number; batch: number };
    assert.equal(report.event, 'quotes_purged');
    assert.equal(report.batch, 1);
    assert.ok(report.deleted >= 2, stdout);
    assert.equal(report.rounds, report.deleted + 1, 'uma volta por linha com lote 1, mais a que volta 0');

    const all = [...old, ...borderline, ...fresh].map((q) => q.quoteId);
    assert.deepEqual(await existing(all), [...borderline, ...fresh].map((q) => q.quoteId).sort());
    for (const secret of ['Fulana', 'Beltrano', '5.811', '35.2065', old[0]!.signature, old[0]!.quoteId]) assert.ok(!stdout.includes(secret), `vazou ${secret}`);

    const again = JSON.parse((await purge()).stdout.trim()) as { deleted: number };
    assert.equal(again.deleted, 0, 'rodar de novo não faz mal');
  });

  test('outra execução segurando a trava: desiste sem erro (código 0)', async () => {
    const holder = await owner.connect();
    try {
      await holder.query(`SELECT pg_advisory_lock(hashtextextended('vuumbora:purge_fare_quotes', 0))`);
      const { stdout } = await purge();
      assert.deepEqual(JSON.parse(stdout.trim()), { event: 'quotes_purge_skipped', reason: 'already_running' });
    } finally {
      await holder.query(`SELECT pg_advisory_unlock(hashtextextended('vuumbora:purge_fare_quotes', 0))`);
      holder.release();
    }
  });

  test('lote inválido e DATABASE_URL ausente: sai com código 1 e mensagem, sem tocar no banco', async () => {
    await assert.rejects(purge('--batch=0'), (err: { code?: number; stderr?: string }) => err.code === 1 && /--batch/.test(err.stderr ?? ''));
    await assert.rejects(
      run(process.execPath, [SCRIPT], { env: { PATH: process.env['PATH'] ?? '' }, cwd: path.dirname(SCRIPT), timeout: 60_000 }),
      (err: { code?: number; stderr?: string }) => err.code === 1 && /DATABASE_URL/.test(err.stderr ?? ''),
    );
  });
});
