/**
 * Pista de threads do bcrypt (`lib/bcrypt-pool.ts`) — revisão S1 rodada 3, A-1. Sem banco: só o pool.
 * Prova quatro coisas: (1) hash que já existe continua válido (mesma biblioteca, mesmo formato, e a outra
 * implementação também); (2) o teto de concorrência e o limite da fila valem; (3) o laço de eventos não é ocupado;
 * (4) falha de thread e desligamento não deixam nada pendurado.
 */
import assert from 'node:assert/strict';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, test } from 'node:test';
import type { Worker } from 'node:worker_threads';
import bcryptjs from 'bcryptjs';
import { adminBcrypt, appBcrypt, BcryptBusyError, BcryptPool, BcryptWorkerError, closeBcryptPools } from '../src/lib/bcrypt-pool.js';

/** Vetor de teste clássico do OpenBSD (`$2a$`, custo 5): a senha é `U*U`. Hash de OUTRA origem, anterior a este código. */
const OPENBSD_VECTOR = { password: 'U*U', hash: '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW' };
/** Hash `$2b$` (custo 6) gerado pelo módulo NATIVO `bcrypt` 6.0.0 — outra implementação, não o bcryptjs. */
const NATIVE_BCRYPT = { password: 'Senha-de-teste-123', hash: '$2b$06$P1EQi8UsTP73PCi5wYIXB.X9aqIphCzjcOnAecsoHT9CRxLym5gAy' };

async function withPool<T>(pool: BcryptPool, body: (pool: BcryptPool) => Promise<T>): Promise<T> {
  try {
    return await body(pool);
  } finally {
    await pool.close();
  }
}

describe('hashes existentes continuam válidos (mesmo algoritmo, mesmo formato)', () => {
  test('hash de outra origem (vetor OpenBSD $2a$ e hash do bcrypt NATIVO $2b$) confere na thread', async () => {
    await withPool(new BcryptPool('compat', 1, 2), async (pool) => {
      assert.equal(await pool.compare(OPENBSD_VECTOR.password, OPENBSD_VECTOR.hash), true);
      assert.equal(await pool.compare('U*u', OPENBSD_VECTOR.hash), false);
      assert.equal(await pool.compare(NATIVE_BCRYPT.password, NATIVE_BCRYPT.hash), true);
      assert.equal(await pool.compare(`${NATIVE_BCRYPT.password}x`, NATIVE_BCRYPT.hash), false);
    });
  });

  test('o hash gerado na thread confere no bcryptjs da thread principal, e o inverso', async () => {
    await withPool(new BcryptPool('compat', 1, 2), async (pool) => {
      const fromPool = await pool.hash('Outra-senha-456', 5);
      assert.match(fromPool, /^\$2b\$05\$/);
      assert.equal(await bcryptjs.compare('Outra-senha-456', fromPool), true);
      assert.equal(await bcryptjs.compare('outra-senha-456', fromPool), false);

      const fromMain = await bcryptjs.hash('Senha-da-principal-1', 5);
      assert.equal(await pool.compare('Senha-da-principal-1', fromMain), true);
      assert.equal(await pool.compare('Senha-da-principal-2', fromMain), false);
    });
  });

  test('hash malformado dá `false` (igual à thread principal), nunca exceção nem trava', async () => {
    await withPool(new BcryptPool('compat', 1, 2), async (pool) => {
      assert.equal(await pool.compare('x', 'isto-nao-e-um-hash'), await bcryptjs.compare('x', 'isto-nao-e-um-hash'));
      assert.equal(await pool.compare('x', 'isto-nao-e-um-hash'), false);
      assert.equal(await pool.compare('x', ''), false);
    });
  });
});

describe('teto de concorrência e fila limitada', () => {
  test('10 chamadas de uma vez em pista de 2 vagas e fila de 3: 5 atendidas, 5 recusadas NA HORA', async () => {
    await withPool(new BcryptPool('teto', 2, 3), async (pool) => {
      const results = Array.from({ length: 10 }, () => pool.hash('senha-qualquer-1', 10).then((value) => ({ ok: true as const, value }), (err: unknown) => ({ ok: false as const, err })));
      // Logo depois de enfileirar tudo (mesmo tick): a pista está cheia e as chamadas recusadas já voltaram.
      assert.equal(pool.saturated, true);
      assert.deepEqual({ active: pool.stats().active, waiting: pool.stats().waiting }, { active: 2, waiting: 3 });
      const settled = await Promise.all(results);
      const served = settled.filter((r) => r.ok);
      const refused = settled.filter((r) => !r.ok);
      assert.equal(served.length, 5);
      assert.equal(refused.length, 5);
      for (const r of refused) assert.ok(!r.ok && r.err instanceof BcryptBusyError, 'recusa tipada, para a rota virar 503');
      for (const r of served) assert.ok(r.ok && /^\$2b\$10\$/.test(r.value));
      const stats = pool.stats();
      assert.equal(stats.peakActive, 2, 'nunca mais que o teto');
      assert.equal(stats.peakWaiting, 3, 'nunca mais que a fila');
      assert.equal(stats.rejected, 5);
      assert.deepEqual({ active: stats.active, waiting: stats.waiting, completed: stats.completed }, { active: 0, waiting: 0, completed: 5 });
      assert.equal(pool.saturated, false, 'esvaziou: volta a aceitar');
    });
  });

  test('20 chamadas numa fila grande: todas atendidas, mas o pico de operações simultâneas é o teto (2), nunca 3', async () => {
    await withPool(new BcryptPool('teto', 2, 20), async (pool) => {
      const hashes = await Promise.all(Array.from({ length: 20 }, (_, i) => pool.hash(`senha-numero-${i}`, 6)));
      assert.equal(hashes.length, 20);
      const stats = pool.stats();
      assert.equal(stats.peakActive, 2);
      assert.equal(stats.workers, 2, 'no máximo `size` threads');
      assert.equal(stats.rejected, 0);
      assert.equal(stats.completed, 20);
    });
  });

  test('a fila é FIFO: a vaga que abre vai para quem esperou mais', async () => {
    await withPool(new BcryptPool('fifo', 1, 4), async (pool) => {
      const order: number[] = [];
      await Promise.all([0, 1, 2, 3, 4].map((i) => pool.hash(`senha-${i}`, 7).then(() => order.push(i))));
      assert.deepEqual(order, [0, 1, 2, 3, 4]);
    });
  });

  test('config: pista dos apps lê o ambiente; valor inválido volta ao padrão; a do admin é fixa (1 vaga, fila 4)', async () => {
    try {
      await closeBcryptPools();
      const custom = appBcrypt({ AUTH_BCRYPT_CONCURRENCY: '3', AUTH_BCRYPT_QUEUE_MAX: '5' });
      assert.deepEqual([custom.size, custom.maxQueue], [3, 5]);
      await closeBcryptPools();
      const invalid = appBcrypt({ AUTH_BCRYPT_CONCURRENCY: '0', AUTH_BCRYPT_QUEUE_MAX: 'muitos' });
      assert.ok(invalid.size >= 1 && invalid.size <= 2, `padrão fora do esperado: ${invalid.size}`);
      assert.equal(invalid.maxQueue, 8);
      await closeBcryptPools();
      const tooBig = appBcrypt({ AUTH_BCRYPT_CONCURRENCY: '500', AUTH_BCRYPT_QUEUE_MAX: '9999' });
      assert.ok(tooBig.size <= 2 && tooBig.maxQueue === 8, 'acima do máximo: padrão, não o valor absurdo');
      const admin = adminBcrypt();
      assert.deepEqual([admin.size, admin.maxQueue], [1, 4]);
      assert.notEqual(admin, appBcrypt(), 'pistas independentes: uma rajada pública não esgota a do admin');
    } finally {
      await closeBcryptPools();
    }
  });
});

describe('o laço de eventos não é ocupado pelo bcrypt', () => {
  test('6 comparações de custo 12 em paralelo: o atraso máximo do laço fica abaixo de 100 ms (na principal passava de 1 s)', async () => {
    await withPool(new BcryptPool('laco', 2, 6), async (pool) => {
      const hash = await pool.hash('Senha-de-teste-123', 12);
      await pool.compare('Senha-de-teste-123', hash); // aquece as duas threads
      await Promise.all([pool.compare('x', hash), pool.compare('y', hash)]);

      const delay = monitorEventLoopDelay({ resolution: 5 });
      delay.enable();
      const started = performance.now();
      const results = await Promise.all(Array.from({ length: 6 }, (_, i) => pool.compare(i === 0 ? 'Senha-de-teste-123' : `errada-${i}`, hash)));
      const elapsed = performance.now() - started;
      delay.disable();

      assert.deepEqual(results, [true, false, false, false, false, false]);
      assert.ok(elapsed > 800, `o trabalho de bcrypt tem que ter acontecido de verdade (levou ${elapsed.toFixed(0)} ms)`);
      const maxMs = delay.max / 1e6;
      assert.ok(maxMs < 100, `o laço de eventos parou por ${maxMs.toFixed(0)} ms enquanto o bcrypt rodava`);
    });
  });
});

describe('falha de thread e desligamento', () => {
  test('erro dentro da thread (argumento inválido) vira BcryptWorkerError SEM mensagem, e a pista segue servindo', async () => {
    await withPool(new BcryptPool('falha', 1, 2), async (pool) => {
      await assert.rejects(pool.compare('x', 123 as unknown as string), (err: unknown) => {
        assert.ok(err instanceof BcryptWorkerError);
        assert.equal(err.message, 'bcrypt_worker_failed', 'nenhum detalhe (poderia carregar dado de senha)');
        return true;
      });
      assert.equal(await pool.compare(NATIVE_BCRYPT.password, NATIVE_BCRYPT.hash), true);
      assert.equal(pool.stats().active, 0);
    });
  });

  test('thread que morre NO MEIO da operação: a chamada falha, a vaga é reposta e a próxima funciona', async () => {
    await withPool(new BcryptPool('morte', 1, 2), async (pool) => {
      const doomed = pool.hash('senha-que-nao-termina', 12);
      const queued = pool.hash('senha-na-fila', 6);
      await sleep(40);
      const slots = (pool as unknown as { slots: Set<{ worker: Worker }> }).slots;
      assert.equal(slots.size, 1);
      await [...slots][0]!.worker.terminate();
      await assert.rejects(doomed, BcryptWorkerError);
      // Quem estava na fila ganha a thread nova.
      assert.match(await queued, /^\$2b\$06\$/);
      assert.equal(pool.stats().workers, 1);
      assert.equal(pool.stats().active, 0);
    });
  });

  test('close(): a fila é recusada, a operação em curso TERMINA, e a pista fechada recusa tudo', async () => {
    const pool = new BcryptPool('fecha', 1, 3);
    const running = pool.hash('senha-em-curso', 9);
    const waiting = pool.hash('senha-na-fila', 9);
    const closing = pool.close();
    await assert.rejects(waiting, BcryptBusyError);
    assert.match(await running, /^\$2b\$09\$/, 'o que já estava rodando não é cortado');
    await closing;
    await assert.rejects(pool.hash('depois-de-fechar', 4), BcryptBusyError);
    assert.equal(pool.saturated, true);
    assert.equal(pool.stats().workers, 0, 'threads encerradas');
  });

  test('valida os parâmetros do construtor', () => {
    assert.throws(() => new BcryptPool('x', 0, 1), RangeError);
    assert.throws(() => new BcryptPool('x', 1, -1), RangeError);
    assert.throws(() => new BcryptPool('x', 1.5, 1), RangeError);
  });
});
