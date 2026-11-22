/**
 * Revisão S1 rodada 3b, B-3: `GET /v1/legal/current` é público e consultava o banco a CADA pedido (o pool tem 5 conexões, divididas
 * com login e cadastro). Agora há cache em memória por perfil, com o TTL de `LEGAL_CACHE_MAX_AGE_SECONDS`.
 *
 * Rodada 3c (B-7): `unavailable` (sem versão publicada) fica guardado por um prazo CURTO (cache negativo); erro de banco, nunca.
 *
 * Duas camadas: a classe `CurrentLegalCache` com relógio falso (o prazo vence sem dormir) e a rota real contando as leituras ao
 * catálogo. Este arquivo usa o prazo PADRÃO (60 s); `legal-consent-api.test.ts` desliga o cache de propósito (troca o catálogo
 * a cada teste e relê a vigente na hora).
 */
import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, test } from 'node:test';
import type { CurrentLegal } from '../src/domain/legal.js';
import { CurrentLegalCache, DEFAULT_NEGATIVE_TTL_MS } from '../src/lib/current-legal-cache.js';
import type { CurrentLegalResult } from '../src/services/legal-service.js';
import { pool, prepareDatabase, shutdown } from './helpers/harness.js';
import { makeClient, PASSWORD, REGISTER_EXTRAS, startIdentityApp, type Harness } from './helpers/identity-kit.js';
import { BASELINE_VERSION, publishAll, resetLegalCatalog, resetToBaseline } from './helpers/legal-kit.js';

const okResult = (audience: 'passenger' | 'driver', version = 'v1'): CurrentLegalResult => {
  const view = { version, sha256: 'a'.repeat(64), publishedAt: '2026-11-22T00:00:00.000Z', url: `https://textos/${audience}/${version}` };
  const current: CurrentLegal = { audience, terms: view, privacy: view };
  return { kind: 'ok', current };
};

describe('CurrentLegalCache (relógio falso)', () => {
  function rig(ttlMs: number, negativeTtlMs?: number) {
    let now = 1_000_000;
    let loads = 0;
    const cache = new CurrentLegalCache(ttlMs, () => now, negativeTtlMs);
    return {
      cache,
      advance: (ms: number) => { now += ms; },
      loads: () => loads,
      load: (result: CurrentLegalResult | Error, takes = 0) => async () => {
        loads += 1;
        now += takes;
        if (result instanceof Error) throw result;
        return result;
      },
    };
  }

  test('dentro do prazo o resultado vem da memória; vencido, consulta de novo', async () => {
    const t = rig(60_000);
    const first = await t.cache.get('passenger', t.load(okResult('passenger', 'v1')));
    assert.equal(await t.cache.get('passenger', t.load(okResult('passenger', 'v2'))), first, 'mesma resposta, sem consultar');
    assert.equal(t.loads(), 1);
    t.advance(59_999);
    await t.cache.get('passenger', t.load(okResult('passenger', 'v2')));
    assert.equal(t.loads(), 1, 'ainda dentro do prazo');
    t.advance(1);
    const renewed = await t.cache.get('passenger', t.load(okResult('passenger', 'v2')));
    assert.equal(t.loads(), 2, 'venceu: consulta de novo');
    assert.equal((renewed as { current: CurrentLegal }).current.terms.version, 'v2');
  });

  test('o prazo conta do INÍCIO da consulta (a defasagem máxima é o TTL, não o TTL mais a duração da consulta)', async () => {
    const t = rig(60_000);
    await t.cache.get('passenger', t.load(okResult('passenger'), 10_000)); // a consulta levou 10 s
    t.advance(50_000); // 60 s desde o início da consulta
    await t.cache.get('passenger', t.load(okResult('passenger')));
    assert.equal(t.loads(), 2);
  });

  test('os perfis são independentes (duas entradas no máximo)', async () => {
    const t = rig(60_000);
    const passenger = await t.cache.get('passenger', t.load(okResult('passenger')));
    const driver = await t.cache.get('driver', t.load(okResult('driver')));
    assert.notEqual(passenger, driver);
    assert.equal(t.loads(), 2);
    await t.cache.get('passenger', t.load(okResult('passenger')));
    await t.cache.get('driver', t.load(okResult('driver')));
    assert.equal(t.loads(), 2);
  });

  test('erro de banco NUNCA fica guardado: a próxima requisição tenta de novo', async () => {
    const t = rig(60_000);
    await assert.rejects(t.cache.get('driver', t.load(new Error('banco caiu'))), /banco caiu/);
    assert.equal((await t.cache.get('driver', t.load(okResult('driver')))).kind, 'ok', 'o erro não ficou guardado');
    assert.equal(t.loads(), 2);
  });

  test('B-7: "indisponível" (sem versão publicada) fica guardado por um prazo CURTO: dentro dele não consulta; vencido, consulta e vê a publicação', async () => {
    const t = rig(60_000);
    const unavailable: CurrentLegalResult = { kind: 'unavailable', reason: 'not_published' };
    for (let i = 0; i < 25; i += 1) assert.equal(await t.cache.get('passenger', t.load(unavailable)), unavailable);
    assert.equal(t.loads(), 1, '25 pedidos, UMA leitura do catálogo');
    t.advance(DEFAULT_NEGATIVE_TTL_MS - 1);
    await t.cache.get('passenger', t.load(okResult('passenger')));
    assert.equal(t.loads(), 1, 'ainda dentro do prazo curto');
    t.advance(1);
    assert.equal((await t.cache.get('passenger', t.load(okResult('passenger')))).kind, 'ok', 'venceu: o operador publicou e o pedido seguinte já vê');
    assert.equal(t.loads(), 2);
    assert.ok(DEFAULT_NEGATIVE_TTL_MS >= 1_000 && DEFAULT_NEGATIVE_TTL_MS <= 5_000, 'prazo negativo de 1 a 5 s');
  });

  test('o prazo do "indisponível" é só o curto: o "ok" segue valendo o TTL inteiro e o prazo negativo nunca passa do TTL', async () => {
    const t = rig(60_000, 3_000);
    await t.cache.get('passenger', t.load(okResult('passenger')));
    await t.cache.get('driver', t.load({ kind: 'unavailable', reason: 'not_published' }));
    t.advance(3_000);
    await t.cache.get('passenger', t.load(okResult('passenger')));
    assert.equal(t.loads(), 2, 'o ok do passageiro continua guardado aos 3 s');
    await t.cache.get('driver', t.load(okResult('driver')));
    assert.equal(t.loads(), 3, 'o indisponível do motorista venceu aos 3 s');

    const short = rig(2_000, 3_000); // TTL menor que o prazo negativo: vale o TTL
    await short.cache.get('driver', short.load({ kind: 'unavailable', reason: 'not_configured' }));
    short.advance(2_000);
    await short.cache.get('driver', short.load(okResult('driver')));
    assert.equal(short.loads(), 2, 'o negativo nunca vive mais que o TTL');
  });

  test('TTL 0 desliga o cache INTEIRO, o negativo também (o teste do aceite troca o catálogo a cada caso)', async () => {
    const t = rig(0);
    const unavailable: CurrentLegalResult = { kind: 'unavailable', reason: 'not_published' };
    await t.cache.get('passenger', t.load(unavailable));
    await t.cache.get('passenger', t.load(unavailable));
    assert.equal(t.loads(), 2);
  });

  test('pedidos simultâneos de uma entrada vazia ou vencida compartilham UMA consulta', async () => {
    const t = rig(60_000);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slow = async () => { await gate; return t.load(okResult('passenger'))(); };
    const pending = Array.from({ length: 20 }, () => t.cache.get('passenger', slow));
    release();
    const results = await Promise.all(pending);
    assert.equal(t.loads(), 1);
    assert.ok(results.every((result) => result === results[0]));
  });

  test('uma falha na consulta compartilhada chega a TODOS os que esperavam, e a seguinte tenta de novo', async () => {
    const t = rig(60_000);
    const failing = async () => { await Promise.resolve(); throw new Error('falha compartilhada'); };
    const settled = await Promise.allSettled([t.cache.get('passenger', failing), t.cache.get('passenger', failing), t.cache.get('passenger', failing)]);
    assert.deepEqual(settled.map((s) => s.status), ['rejected', 'rejected', 'rejected']);
    assert.equal((await t.cache.get('passenger', t.load(okResult('passenger')))).kind, 'ok');
  });

  test('TTL 0 desliga o cache: toda chamada consulta', async () => {
    const t = rig(0);
    await t.cache.get('passenger', t.load(okResult('passenger')));
    await t.cache.get('passenger', t.load(okResult('passenger')));
    assert.equal(t.loads(), 2);
  });
});

describe('GET /v1/legal/current com cache (rota real, banco real)', () => {
  let h: Harness;
  let call: ReturnType<typeof makeClient>['call'];
  before(prepareDatabase);
  after(shutdown);
  afterEach(async () => {
    await h.t.app.close();
    await resetToBaseline(pool);
  });

  async function startApp(env: Record<string, string> = {}): Promise<void> {
    const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
    Object.assign(process.env, env);
    try {
      h = await startIdentityApp();
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    call = makeClient(h).call;
  }

  /** Conta as leituras ao catálogo de versões vigentes que passam pelo pool real; `fail` faz as N primeiras falharem. */
  function watchLegalReads(options: { failFirst?: number } = {}) {
    const poolInternals = pool as unknown as { query: (...args: unknown[]) => Promise<unknown> };
    const original = poolInternals.query.bind(pool);
    let reads = 0;
    let toFail = options.failFirst ?? 0;
    poolInternals.query = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && /SELECT[\s\S]*legal_current_versions/i.test(args[0])) {
        reads += 1;
        if (toFail > 0) {
          toFail -= 1;
          return Promise.reject(new Error('banco indisponível (simulado)'));
        }
      }
      return original(...args);
    };
    return { reads: () => reads, stop: () => { delete (pool as unknown as Record<string, unknown>)['query']; } };
  }

  const current = (audience: string) => call('GET', `/v1/legal/current?audience=${audience}`);

  test('com o prazo padrão (60 s): o segundo pedido do mesmo perfil não consulta o banco; o cabeçalho segue `public, max-age=60`', async () => {
    await startApp();
    const watch = watchLegalReads();
    try {
      const first = await current('passenger');
      const second = await current('passenger');
      assert.equal(first.status, 200, JSON.stringify(first.body));
      assert.deepEqual(second.body, first.body);
      assert.equal(first.headers['cache-control'], 'public, max-age=60');
      assert.equal(second.headers['cache-control'], 'public, max-age=60');
      assert.equal(watch.reads(), 1, 'duas requisições, UMA leitura ao banco');
    } finally {
      watch.stop();
    }
  });

  test('cada perfil tem a sua entrada; 20 pedidos simultâneos de um perfil frio fazem UMA leitura', async () => {
    await startApp();
    const watch = watchLegalReads();
    try {
      const burst = await Promise.all(Array.from({ length: 20 }, () => current('driver')));
      assert.ok(burst.every((reply) => reply.status === 200 && reply.body.data.audience === 'driver'));
      assert.equal(watch.reads(), 1, '20 pedidos simultâneos, uma leitura');
      assert.equal((await current('passenger')).body.data.audience, 'passenger');
      assert.equal(watch.reads(), 2, 'o outro perfil é outra entrada');
      await current('driver');
      await current('passenger');
      assert.equal(watch.reads(), 2);
    } finally {
      watch.stop();
    }
  });

  test('audience inválido: 400 sem tocar no banco e nada guardado', async () => {
    await startApp();
    const watch = watchLegalReads();
    try {
      for (const audience of ['admin', 'Passenger', '']) assert.equal((await current(audience)).status, 400, audience);
      assert.equal(watch.reads(), 0);
    } finally {
      watch.stop();
    }
  });

  test('erro de banco NÃO fica guardado: o primeiro 200 depois da falha vem na hora', async () => {
    await startApp();
    const watch = watchLegalReads({ failFirst: 1 });
    try {
      const failed = await current('passenger');
      assert.equal(failed.status, 503, JSON.stringify(failed.body));
      assert.equal(failed.body.error.code, 'unavailable');
      assert.equal((await current('passenger')).status, 200, 'a falha do banco não ficou guardada');
      assert.equal(watch.reads(), 2);
    } finally {
      watch.stop();
    }
  });

  test('B-7: sem versão publicada, uma enxurrada NÃO relê o catálogo a cada pedido (cache negativo curto); o cabeçalho segue no-store', async () => {
    await startApp();
    await resetLegalCatalog(pool);
    const watch = watchLegalReads();
    try {
      const started = performance.now();
      const replies = [];
      for (let i = 0; i < 30; i += 1) replies.push(await current('driver'));
      replies.push(...(await Promise.all(Array.from({ length: 30 }, () => current('driver')))));
      const elapsedMs = performance.now() - started;
      for (const reply of replies) {
        assert.equal(reply.status, 503);
        assert.equal(reply.body.error.code, 'consent_unavailable');
        assert.equal(reply.headers['cache-control'], 'no-store', 'o indisponível nunca vai para o cache do cliente');
      }
      // Relação medida neste processo (nada de piso absoluto): no máximo uma leitura por prazo negativo decorrido, mais a primeira.
      const allowed = Math.floor(elapsedMs / DEFAULT_NEGATIVE_TTL_MS) + 1;
      assert.ok(watch.reads() >= 1 && watch.reads() <= allowed, `60 pedidos em ${elapsedMs.toFixed(0)} ms fizeram ${watch.reads()} leituras; o prazo curto permite ${allowed}`);
    } finally {
      watch.stop();
    }
  });

  test('a defasagem é limitada ao prazo e SÓ o GET usa o cache: o cadastro lê o banco na hora e aceita a versão nova', async () => {
    await startApp();
    const first = await current('passenger');
    assert.equal(first.body.data.terms.version, BASELINE_VERSION);

    await publishAll(pool, 'v2'); // o operador publicou (outro processo: não consegue invalidar esta memória)
    const stale = await current('passenger');
    assert.equal(stale.body.data.terms.version, BASELINE_VERSION, 'dentro do prazo, o GET ainda devolve a anterior (defasagem tolerada pelo desenho)');

    const watch = watchLegalReads();
    try {
      const registered = await call('POST', '/v1/auth/register', {
        body: { accountType: 'passenger', fullName: 'Pessoa', email: `cache-${Math.random().toString(36).slice(2, 10)}@teste.vuumbora.dev`, password: PASSWORD, ...REGISTER_EXTRAS, termsVersion: 'v2', privacyVersion: 'v2' },
      });
      assert.equal(registered.status, 201, `o cadastro confere a vigente no banco, não no cache: ${JSON.stringify(registered.body)}`);
      assert.ok(watch.reads() >= 1, 'o cadastro leu o catálogo na hora');
    } finally {
      watch.stop();
    }
    const outdated = await call('POST', '/v1/auth/register', {
      body: { accountType: 'passenger', fullName: 'Pessoa', email: `cache-${Math.random().toString(36).slice(2, 10)}@teste.vuumbora.dev`, password: PASSWORD, ...REGISTER_EXTRAS },
    });
    assert.equal(outdated.status, 409, 'quem exibiu a versão velha recebe o 409 com a vigente: o cache velho se corrige sozinho');
    assert.equal(outdated.body.error.current.terms.version, 'v2');
  });

  test('LEGAL_CACHE_MAX_AGE_SECONDS=0 desliga o cache (toda requisição lê o banco)', async () => {
    await startApp({ LEGAL_CACHE_MAX_AGE_SECONDS: '0' });
    const watch = watchLegalReads();
    try {
      await current('passenger');
      const second = await current('passenger');
      assert.equal(watch.reads(), 2);
      assert.equal(second.headers['cache-control'], 'public, max-age=0');
    } finally {
      watch.stop();
    }
  });
});
