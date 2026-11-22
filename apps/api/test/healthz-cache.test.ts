/**
 * Revisão S1 rodada 3c, B-7: `/healthz` não tem limite de taxa e consultava o banco (5 conexões, divididas com login e cadastro)
 * a CADA chamada. Agora o resultado fica guardado por poucos segundos (`HEALTHZ_CACHE_SECONDS`, padrão 2).
 *
 * Duas camadas: a classe `HealthCheckCache` com relógio falso (o prazo vence sem dormir) e a rota real, contando as consultas
 * `SELECT 1` que chegam ao pool de verdade, com o prazo PADRÃO (2 s). A asserção é uma RELAÇÃO medida no próprio processo
 * (consultas <= tempo decorrido / prazo + 1), nunca um piso em milissegundos.
 */
import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, test } from 'node:test';
import Fastify from 'fastify';
import { HealthCheckCache } from '../src/lib/health-check-cache.js';
import { registerHealthRoute } from '../src/routes/health-route.js';
import { pool, prepareDatabase, shutdown, startApp, type TestApp } from './helpers/harness.js';

describe('HealthCheckCache (relógio falso)', () => {
  function rig(ttlMs: number) {
    let now = 5_000_000;
    let checks = 0;
    const cache = new HealthCheckCache(ttlMs, () => now);
    return {
      cache,
      advance: (ms: number) => { now += ms; },
      checks: () => checks,
      check: (healthy: boolean | Error, takes = 0) => async () => {
        checks += 1;
        now += takes;
        if (healthy instanceof Error) throw healthy;
        return healthy;
      },
    };
  }

  test('dentro do prazo o resultado vem da memória; vencido, consulta de novo', async () => {
    const t = rig(2_000);
    assert.equal(await t.cache.get(t.check(true)), true);
    assert.equal(await t.cache.get(t.check(false)), true, 'mesma resposta, sem consultar (mesmo que o banco já tenha caído)');
    t.advance(1_999);
    assert.equal(await t.cache.get(t.check(false)), true);
    assert.equal(t.checks(), 1, 'ainda dentro do prazo');
    t.advance(1);
    assert.equal(await t.cache.get(t.check(false)), false, 'venceu: consulta de novo e vê a queda');
    assert.equal(t.checks(), 2);
  });

  test('o prazo conta do FIM da consulta: o resultado vale pelo TTL inteiro DEPOIS de conhecido, por mais que a consulta tenha demorado', async () => {
    const t = rig(2_000);
    await t.cache.get(t.check(true, 1_500)); // a consulta levou 1,5 s
    t.advance(1_999);
    await t.cache.get(t.check(true));
    assert.equal(t.checks(), 1, 'com o prazo contado do início já teria vencido');
    t.advance(1);
    await t.cache.get(t.check(true));
    assert.equal(t.checks(), 2);
  });

  test('o banco FORA também fica guardado: com a conexão caindo no prazo de 5 s, sondas em série não empilham tentativas', async () => {
    const t = rig(2_000);
    assert.equal(await t.cache.get(t.check(false, 5_000)), false);
    for (let i = 0; i < 20; i += 1) assert.equal(await t.cache.get(t.check(true)), false);
    assert.equal(t.checks(), 1, '21 chamadas, uma consulta');
  });

  test('chamadas simultâneas de uma entrada vazia ou vencida compartilham UMA consulta', async () => {
    const t = rig(2_000);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slow = async () => { await gate; return t.check(true)(); };
    const pending = Array.from({ length: 30 }, () => t.cache.get(slow));
    release();
    assert.deepEqual([...new Set(await Promise.all(pending))], [true]);
    assert.equal(t.checks(), 1);
  });

  test('uma verificação que LANÇA conta como "fora" (nunca propaga, nunca trava) e vale pelo prazo', async () => {
    const t = rig(2_000);
    assert.equal(await t.cache.get(t.check(new Error('falha inesperada'))), false);
    assert.equal(await t.cache.get(t.check(true)), false);
    assert.equal(t.checks(), 1);
    t.advance(2_000);
    assert.equal(await t.cache.get(t.check(true)), true, 'a recuperação aparece depois do prazo');
  });

  test('TTL 0 desliga o cache (toda chamada consulta), mas as simultâneas ainda dividem a consulta em curso', async () => {
    const t = rig(0);
    await t.cache.get(t.check(true));
    await t.cache.get(t.check(true));
    assert.equal(t.checks(), 2);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slow = async () => { await gate; return t.check(true)(); };
    const burst = [t.cache.get(slow), t.cache.get(slow), t.cache.get(slow)];
    release();
    await Promise.all(burst);
    assert.equal(t.checks(), 3, 'as 3 simultâneas fizeram UMA consulta');
  });
});

describe('GET /healthz (rota)', () => {
  test('sem banco: a verificação injetada decide o status (200 ok, 503 unavailable) e o resultado é o guardado', async () => {
    let healthy = true;
    let calls = 0;
    const app = Fastify();
    registerHealthRoute(app, { ttlMs: 60_000, check: async () => { calls += 1; return healthy; } });
    try {
      const ok = await app.inject({ method: 'GET', url: '/healthz' });
      assert.deepEqual([ok.statusCode, JSON.parse(ok.body)], [200, { status: 'ok' }]);
      healthy = false;
      const stillOk = await app.inject({ method: 'GET', url: '/healthz' });
      assert.equal(stillOk.statusCode, 200, 'dentro do prazo a queda ainda não aparece (o custo da defasagem)');
      assert.equal(calls, 1);
    } finally {
      await app.close();
    }

    const down = Fastify();
    registerHealthRoute(down, { ttlMs: 60_000, check: async () => false });
    try {
      const reply = await down.inject({ method: 'GET', url: '/healthz' });
      assert.deepEqual([reply.statusCode, JSON.parse(reply.body)], [503, { status: 'unavailable' }]);
    } finally {
      await down.close();
    }
  });
});

describe('GET /healthz com o app e o banco reais', () => {
  let t: TestApp;
  before(prepareDatabase);
  after(shutdown);
  afterEach(async () => {
    delete (pool as unknown as Record<string, unknown>)['query'];
    await t?.app.close();
  });

  /** Conta as `SELECT 1` que chegam ao pool real (é a consulta do health). */
  function watchHealthQueries(): () => number {
    const internals = pool as unknown as { query: (...args: unknown[]) => Promise<unknown> };
    const original = internals.query.bind(pool);
    let count = 0;
    internals.query = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && /^\s*SELECT 1\s*$/i.test(args[0])) count += 1;
      return original(...args);
    };
    return () => count;
  }

  test('uma enxurrada de /healthz faz o MÁXIMO que o prazo permite de consultas ao banco (não uma por chamada)', async () => {
    t = await startApp();
    const queries = watchHealthQueries();
    const started = performance.now();
    const replies = [];
    for (let i = 0; i < 60; i += 1) replies.push(await t.app.inject({ method: 'GET', url: '/healthz' }));
    const burst = await Promise.all(Array.from({ length: 60 }, () => t.app.inject({ method: 'GET', url: '/healthz' })));
    const elapsedMs = performance.now() - started;

    assert.ok([...replies, ...burst].every((reply) => reply.statusCode === 200 && JSON.parse(reply.body).status === 'ok'));
    const allowed = Math.floor(elapsedMs / 2_000) + 1;
    assert.ok(queries() >= 1, 'o banco foi consultado');
    assert.ok(queries() <= allowed, `120 chamadas em ${elapsedMs.toFixed(0)} ms fizeram ${queries()} consultas; o prazo de 2 s permite ${allowed}`);
  });

  test('o banco que cai DEPOIS da primeira consulta não aparece antes do prazo; a rota nunca fica sem resposta', async () => {
    t = await startApp();
    assert.equal((await t.app.inject({ method: 'GET', url: '/healthz' })).statusCode, 200);
    const internals = pool as unknown as { query: (...args: unknown[]) => Promise<unknown> };
    internals.query = () => Promise.reject(new Error('banco caiu (simulado)'));
    const during = await t.app.inject({ method: 'GET', url: '/healthz' });
    assert.equal(during.statusCode, 200, 'a defasagem é o TTL: documentada, de poucos segundos');
  });
});
