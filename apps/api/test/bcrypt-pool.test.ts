/**
 * Pista de threads do bcrypt (`lib/bcrypt-pool.ts`) — revisão S1 rodada 3, A-1. Sem banco: só o pool.
 * Prova quatro coisas: (1) hash que já existe continua válido (mesma biblioteca, mesmo formato, e a outra
 * implementação também); (2) o teto de concorrência e o limite da fila valem; (3) o laço de eventos não é ocupado;
 * (4) falha de thread e desligamento não deixam nada pendurado.
 * Rodada 3b: (5) justiça por origem na fila (M-1); (6) reserva do lugar antes do banco (B-1); (7) vigia de prazo por operação e
 * prazo no close (B-4). Nada daqui depende do número de CPUs: as asserções de fila são síncronas (logo depois de enfileirar), o
 * prazo é de um worker de teste que trava, e o teste do laço MEDE o custo de uma comparação neste processo e deriva os limites dele.
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { availableParallelism } from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, test } from 'node:test';
import type { Worker } from 'node:worker_threads';
import bcryptjs from 'bcryptjs';
import {
  adminBcrypt, appBcrypt, BcryptBusyError, BcryptPool, BcryptWorkerError, closeBcryptPools, DEFAULT_CLOSE_GRACE_MS, DEFAULT_JOB_TIMEOUT_MS, DEFAULT_MAX_PER_ORIGIN,
  withBcryptReservation,
} from '../src/lib/bcrypt-pool.js';

/** Vetor de teste clássico do OpenBSD (`$2a$`, custo 5): a senha é `U*U`. Hash de OUTRA origem, anterior a este código. */
const OPENBSD_VECTOR = { password: 'U*U', hash: '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW' };
/** Worker de teste: o de produção, mas a senha `trava` entra num laço síncrono infinito (ver o próprio arquivo). */
const FLAKY_WORKER = new URL('./helpers/flaky-worker.ts', import.meta.url);

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
  test('6 comparações de custo 12 em paralelo: trabalho real (proporcional ao custo medido aqui) e o p99 do atraso do laço fica baixo (na principal travava por ~1 compare inteiro)', async () => {
    // Nada aqui é um número fixo de CPU: o custo de UMA comparação é MEDIDO neste processo e os limites saem dele. A versão anterior
    // exigia `elapsed > 800 ms`, que só vale em CPU lenta (num runner 2x mais rápido, 6 comparações em 2 threads levam ~0,7 s e o
    // teste falhava sem defeito nenhum; falhou em 5 execuções do CI).
    //
    // Mesmo dimensionamento da produção (defaultAppConcurrency em lib/bcrypt-pool.ts): no máximo 2 threads e SEMPRE uma CPU livre
    // para a thread principal. Com 2 threads fixas num runner de 2 vCPUs, são 3 threads disputando 2 núcleos e o laço atrasa por
    // falta de CPU, não por bcrypt na principal.
    const threads = Math.min(2, Math.max(1, availableParallelism() - 1));
    await withPool(new BcryptPool('laco', threads, 6), async (pool) => {
      const hash = await pool.hash('Senha-de-teste-123', 12);
      await pool.compare('Senha-de-teste-123', hash); // aquece as threads
      await Promise.all([pool.compare('x', hash), pool.compare('y', hash)]);

      // UMA comparação de custo 12 no pool, sozinha: o menor de 3 (o menor é o que menos sofre com ruído do runner).
      const singles: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const t0 = performance.now();
        await pool.compare('Senha-de-teste-123', hash);
        singles.push(performance.now() - t0);
      }
      const single = Math.min(...singles);
      assert.ok(single > 50, `custo 12 tem que ser trabalho de verdade (uma comparação levou ${single.toFixed(0)} ms): o custo configurado se perdeu?`);

      const delay = monitorEventLoopDelay({ resolution: 5 });
      delay.enable();
      const started = performance.now();
      const results = await Promise.all(Array.from({ length: 6 }, (_, i) => pool.compare(i === 0 ? 'Senha-de-teste-123' : `errada-${i}`, hash)));
      const elapsed = performance.now() - started;
      delay.disable();

      assert.deepEqual(results, [true, false, false, false, false, false]);
      // 6 operações em no máximo 2 threads são pelo menos 3 rodadas; exigir só 2 rodadas deixa folga para o paralelismo real.
      assert.ok(elapsed >= 2 * single, `6 comparações em ${threads} thread(s) levaram ${elapsed.toFixed(0)} ms, menos de 2 rodadas de ${single.toFixed(0)} ms: o trabalho não aconteceu de verdade`);
      // p99, não o máximo: um pico isolado do runner (GC, vizinho barulhento) não reprova; o defeito que o teste caça trava o laço por
      // uma comparação INTEIRA a cada operação (~`single` ms, várias vezes), então ocupa mais do que 1% das amostras. Medido: pausa máxima
      // de 6 a 78 ms com a pista certa (2 CPUs, com e sem carga), contra ~`single` ms com o bcrypt na principal. O limite acompanha o
      // custo medido (metade de uma comparação), sem passar de 200 ms nem cair abaixo de 60 ms (ruído de runner).
      const limitMs = Math.min(200, Math.max(60, single / 2));
      const p99Ms = delay.percentile(99) / 1e6;
      assert.ok(p99Ms < limitMs, `o p99 do atraso do laço foi ${p99Ms.toFixed(0)} ms (limite ${limitMs.toFixed(0)} ms, uma comparação = ${single.toFixed(0)} ms, máximo ${(delay.max / 1e6).toFixed(0)} ms, ${threads} thread(s))`);
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

describe('justiça por origem na fila (M-1)', () => {
  const outcome = (promise: Promise<unknown>) => promise.then(() => 'ok', (err: unknown) => (err instanceof BcryptBusyError ? 'busy' : 'erro'));

  test('um balde de origem segura no máximo 2 lugares de ESPERA: o excesso é recusado NA HORA e o titular de outro balde entra', async () => {
    await withPool(new BcryptPool('justica', 2, 8), async (pool) => {
      const attacker = Array.from({ length: 6 }, (_, i) => outcome(pool.hash(`atacante-${i}`, 10, 'balde-do-atacante')));
      // Logo depois de enfileirar (mesmo tick): 2 rodando (não contam), 2 esperando, 2 recusadas pelo limite do balde.
      assert.deepEqual({ active: pool.stats().active, waiting: pool.stats().waiting }, { active: 2, waiting: 2 });
      assert.equal(pool.stats().rejectedByOrigin, 2);
      assert.equal(pool.saturated, false, 'a pista tinha lugar: quem recusou foi o limite do balde, não a pista cheia');

      const titular = outcome(pool.hash('titular', 10, 'balde-do-titular'));
      assert.equal(pool.stats().waiting, 3, 'o titular de outro balde entra na fila');
      assert.deepEqual(await Promise.all(attacker), ['ok', 'ok', 'ok', 'ok', 'busy', 'busy']);
      assert.equal(await titular, 'ok', 'o titular NÃO é recusado');
      assert.equal(pool.stats().rejected, 2);

      // O lugar do balde é devolvido quando a operação começa a rodar: depois que tudo terminou, o atacante pode de novo.
      assert.equal(await outcome(pool.hash('atacante-depois', 6, 'balde-do-atacante')), 'ok');
    });
  });

  test('a fila segue FIFO: o titular que chega depois dos 2 lugares do atacante é atendido antes de qualquer pedido novo dele', async () => {
    await withPool(new BcryptPool('fifo-origem', 1, 8), async (pool) => {
      const order: string[] = [];
      const track = (label: string, origin: string) => pool.hash(`senha-${label}`, 7, origin).then(() => order.push(label), () => order.push(`recusada-${label}`));
      await Promise.all([track('a1', 'atacante'), track('a2', 'atacante'), track('a3', 'atacante'), track('a4', 'atacante'), track('titular', 'titular')]);
      // a1 roda; a2 e a3 esperam; a4 passa do limite do balde (2 esperando); o titular entra atrás de a2 e a3 e nunca é recusado.
      assert.deepEqual(order, ['recusada-a4', 'a1', 'a2', 'a3', 'titular']);
    });
  });

  test('sem balde (`null`, uso interno como o aquecimento do hash descartável) o limite por origem não se aplica; o da pista inteira, sim', async () => {
    await withPool(new BcryptPool('sem-balde', 1, 3), async (pool) => {
      const results = await Promise.all(Array.from({ length: 6 }, (_, i) => outcome(pool.hash(`interno-${i}`, 6))));
      assert.deepEqual(results, ['ok', 'ok', 'ok', 'ok', 'busy', 'busy'], '1 rodando + 3 esperando; as duas seguintes batem na pista cheia');
      assert.equal(pool.stats().rejectedByOrigin, 0);
    });
  });

  test('o limite por balde é configurável no construtor e as opções são validadas', async () => {
    await withPool(new BcryptPool('um-por-balde', 1, 8, { maxPerOrigin: 1 }), async (pool) => {
      const results = await Promise.all(Array.from({ length: 4 }, (_, i) => outcome(pool.hash(`um-${i}`, 6, 'mesmo-balde'))));
      assert.deepEqual(results, ['ok', 'ok', 'busy', 'busy'], '1 rodando + 1 esperando; o resto é recusado');
    });
    assert.equal(DEFAULT_MAX_PER_ORIGIN, 2);
    assert.throws(() => new BcryptPool('x', 1, 1, { maxPerOrigin: 0 }), RangeError);
    assert.throws(() => new BcryptPool('x', 1, 1, { maxPerOrigin: 1.5 }), RangeError);
    assert.throws(() => new BcryptPool('x', 1, 1, { jobTimeoutMs: 0 }), RangeError);
    assert.throws(() => new BcryptPool('x', 1, 1, { closeGraceMs: -1 }), RangeError);
  });

  test('config: AUTH_BCRYPT_MAX_PER_ORIGIN lê o ambiente; valor inválido ou absurdo volta ao padrão (2)', async () => {
    try {
      await closeBcryptPools();
      assert.equal(appBcrypt({ AUTH_BCRYPT_MAX_PER_ORIGIN: '4' }).maxPerOrigin, 4);
      for (const bad of ['varios', '0', '9999', undefined]) {
        await closeBcryptPools();
        assert.equal(appBcrypt(bad === undefined ? {} : { AUTH_BCRYPT_MAX_PER_ORIGIN: bad }).maxPerOrigin, DEFAULT_MAX_PER_ORIGIN, String(bad));
      }
    } finally {
      await closeBcryptPools();
    }
  });
});

describe('reserva do lugar ANTES de gravar no banco (B-1)', () => {
  test('reserve() toma o lugar: 2 reservas enchem a pista de 1 vaga e fila de 1; a terceira é recusada; release() devolve (e é idempotente)', async () => {
    await withPool(new BcryptPool('reserva', 1, 1), async (pool) => {
      const first = pool.reserve();
      const second = pool.reserve();
      assert.equal(pool.saturated, true);
      assert.equal(pool.stats().reserved, 2);
      assert.throws(() => pool.reserve(), BcryptBusyError);
      await assert.rejects(pool.hash('sem-lugar', 4), BcryptBusyError);

      first.release();
      first.release();
      assert.equal(pool.stats().reserved, 1, 'devolver duas vezes não devolve dois lugares');
      assert.equal(pool.saturated, false);
      second.release();
      assert.equal(pool.stats().reserved, 0);
    });
  });

  test('quem tem a reserva NUNCA é recusado depois, mesmo que a pista encha por outros no meio (a janela entre a checagem e o bcrypt)', async () => {
    await withPool(new BcryptPool('janela', 1, 2), async (pool) => {
      const mine = pool.reserve(); // 1 dos 3 lugares
      const others = [pool.hash('outro-1', 10), pool.hash('outro-2', 10)]; // os outros 2: um rodando, um esperando
      await assert.rejects(pool.hash('outro-3', 10), BcryptBusyError, 'a pista encheu enquanto eu "gravava no banco"');
      assert.equal(pool.saturated, true);

      const hash = await mine.hash('minha-senha', 6);
      assert.match(hash, /^\$2b\$06\$/, 'a reserva garantiu o lugar: entra na fila e é atendida');
      await Promise.all(others);
    });
  });

  test('a reserva é de uso único; liberar depois de usar não devolve o lugar duas vezes', async () => {
    await withPool(new BcryptPool('uso-unico', 1, 1), async (pool) => {
      const reservation = pool.reserve();
      const first = reservation.hash('senha-qualquer', 4);
      await assert.rejects(reservation.compare('x', 'y'), /bcrypt_reservation_already_used/);
      reservation.release();
      await first;
      assert.deepEqual({ reserved: pool.stats().reserved, active: pool.stats().active, waiting: pool.stats().waiting }, { reserved: 0, active: 0, waiting: 0 });
    });
  });

  test('withBcryptReservation devolve o lugar quando o corpo não usa o bcrypt (429 do par) e quando o corpo falha', async () => {
    await withPool(new BcryptPool('com-reserva', 1, 1), async (pool) => {
      assert.equal(await withBcryptReservation(pool.reserve(), async () => 'bloqueado-antes-do-bcrypt'), 'bloqueado-antes-do-bcrypt');
      assert.equal(pool.stats().reserved, 0, 'o caminho que não chegou ao bcrypt devolveu o lugar');
      await assert.rejects(withBcryptReservation(pool.reserve(), async () => { throw new Error('falha no banco'); }), /falha no banco/);
      assert.equal(pool.stats().reserved, 0, 'o caminho que falhou devolveu o lugar');
      assert.equal(pool.saturated, false);
    });
  });

  test('o lugar de uma reserva conta no limite do balde e volta com o release', async () => {
    await withPool(new BcryptPool('reserva-balde', 2, 8), async (pool) => {
      const a = pool.reserve('balde');
      const b = pool.reserve('balde');
      assert.throws(() => pool.reserve('balde'), BcryptBusyError);
      assert.equal(pool.stats().rejectedByOrigin, 1);
      pool.reserve('outro-balde').release();
      a.release();
      assert.doesNotThrow(() => pool.reserve('balde').release());
      b.release();
    });
  });

  test('pista fechada recusa reservas novas', async () => {
    const pool = new BcryptPool('fechada', 1, 1);
    await pool.close();
    assert.throws(() => pool.reserve(), BcryptBusyError);
  });
});

describe('vigia de prazo por operação e prazo no close (B-4)', () => {
  test('constantes: prazo da operação entre 10 e 30 s; o close espera menos do que um orquestrador concede ao SIGTERM', () => {
    assert.ok(DEFAULT_JOB_TIMEOUT_MS >= 10_000 && DEFAULT_JOB_TIMEOUT_MS <= 30_000, String(DEFAULT_JOB_TIMEOUT_MS));
    assert.ok(DEFAULT_CLOSE_GRACE_MS > 0 && DEFAULT_CLOSE_GRACE_MS <= 15_000, String(DEFAULT_CLOSE_GRACE_MS));
  });

  test('operação que passa do prazo: a thread TRAVADA em laço síncrono é morta, a chamada falha com Timeout e a pista segue servindo', async () => {
    const TIMEOUT_MS = 300;
    await withPool(new BcryptPool('vigia', 2, 2, { workerUrl: FLAKY_WORKER, jobTimeoutMs: 60_000 }), async (pool) => {
      // Esquenta as DUAS threads COM O PRAZO FOLGADO: a subida da thread sob o tsx conta no prazo e, num runner de 2 CPUs, passa de 300 ms
      // (a primeira versão deste teste caía aí). Só depois de aquecidas o prazo encurta.
      await Promise.all([pool.compare(NATIVE_BCRYPT.password, NATIVE_BCRYPT.hash), pool.compare(NATIVE_BCRYPT.password, NATIVE_BCRYPT.hash)]);
      assert.equal(pool.stats().workers, 2);
      pool.jobTimeoutMs = TIMEOUT_MS;

      const started = performance.now();
      const stuck = pool.compare('trava', NATIVE_BCRYPT.hash).then(() => null, (err: unknown) => err);
      const slots = (pool as unknown as { slots: Set<{ worker: Worker; job: unknown }> }).slots;
      const busy = [...slots].find((slot) => slot.job !== null);
      assert.ok(busy, 'a operação travada está rodando numa das threads');
      const exited = once(busy.worker, 'exit');

      const err = await stuck;
      const elapsed = performance.now() - started;
      assert.ok(err instanceof BcryptWorkerError, String(err));
      assert.equal(err.reason, 'Timeout');
      assert.equal(err.message, 'bcrypt_worker_failed', 'sem detalhe');
      assert.ok(elapsed >= TIMEOUT_MS - 20, `o vigia só age depois do prazo (agiu em ${elapsed.toFixed(0)} ms)`);
      assert.ok(elapsed < TIMEOUT_MS + 5000, `o vigia age no prazo, não muito depois (${elapsed.toFixed(0)} ms)`);

      // A thread travada foi MORTA de verdade (o laço síncrono só para com terminate()), não só esquecida.
      await Promise.race([exited, sleep(5000).then(() => { throw new Error('a thread travada não foi terminada'); })]);

      assert.deepEqual({ active: pool.stats().active, timedOut: pool.stats().timedOut, workers: pool.stats().workers }, { active: 0, timedOut: 1, workers: 1 });
      // A vaga voltou: a outra thread (já aquecida) atende a próxima operação normalmente.
      assert.equal(await pool.compare(NATIVE_BCRYPT.password, NATIVE_BCRYPT.hash), true);
    });
  });

  test('operação que termina no prazo não é tocada: o vigia é cancelado e NÃO mata a thread (nem a próxima operação dela) depois', async () => {
    // A thread sobe com o prazo folgado (a subida sob o tsx conta no prazo) e só depois o prazo encurta; a espera passa do prazo de
    // propósito: um vigia que sobrasse armado dispararia agora, mataria a thread saudável e contaria um estouro que não houve.
    const TIMEOUT_MS = 400;
    await withPool(new BcryptPool('no-prazo', 1, 1, { jobTimeoutMs: 60_000 }), async (pool) => {
      assert.equal(await pool.compare(NATIVE_BCRYPT.password, NATIVE_BCRYPT.hash), true); // aquece a thread
      pool.jobTimeoutMs = TIMEOUT_MS;
      assert.equal(await pool.compare(NATIVE_BCRYPT.password, NATIVE_BCRYPT.hash), true);
      await sleep(TIMEOUT_MS + 300);
      assert.deepEqual({ timedOut: pool.stats().timedOut, workers: pool.stats().workers, completed: pool.stats().completed }, { timedOut: 0, workers: 1, completed: 2 });
      assert.equal(await pool.compare(NATIVE_BCRYPT.password, NATIVE_BCRYPT.hash), true, 'a thread segue viva e atendendo');
    });
  });

  test('close(): espera a operação em curso só até o prazo; a que não terminou falha com PoolClosed e o close VOLTA', async () => {
    // Prazo da operação alto de propósito (8 s): o que encerra aqui é o prazo do close, não o vigia da operação.
    const pool = new BcryptPool('prazo-do-close', 1, 1, { workerUrl: FLAKY_WORKER, jobTimeoutMs: 8000 });
    const stuck = pool.compare('trava', NATIVE_BCRYPT.hash).then(() => null, (err: unknown) => err);
    const queued = pool.hash('na-fila', 4).then(() => null, (err: unknown) => err);
    const started = performance.now();
    await pool.close(250);
    const elapsed = performance.now() - started;
    assert.ok(elapsed >= 240, `esperou o prazo (${elapsed.toFixed(0)} ms)`);
    assert.ok(elapsed < 5000, `não ficou esperando a operação travada (${elapsed.toFixed(0)} ms)`);
    const stuckErr = await stuck;
    assert.ok(stuckErr instanceof BcryptWorkerError && stuckErr.reason === 'PoolClosed', String(stuckErr));
    assert.ok((await queued) instanceof BcryptBusyError, 'a fila foi recusada ao fechar');
    assert.equal(pool.stats().workers, 0);
    assert.equal(pool.stats().active, 0);
    assert.throws(() => pool.reserve(), BcryptBusyError);
  });
});
