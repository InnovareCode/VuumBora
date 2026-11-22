/**
 * Máquina de estados de UI do passageiro (`draft`/`quoted` + `TripStatus`). Cobre as extensões
 * LOCAIS (que `trip-lifecycle.test.ts` não cobre) e confere que a tabela do servidor chega aqui
 * sem ser reescrita — a correção do S0 precisa valer nas duas pontas com uma tabela só.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cancelTrip } from '../src/trip-lifecycle';
import type { TripStatus } from '../src/index';
import {
  canTransitionRide,
  cancelRide,
  isRideCancellable,
  transitionRide,
} from '../src/passenger/rideStateMachine';

describe('fases locais (draft/quoted)', () => {
  test('draft -> quoted -> requested, e quoted pode voltar a draft', () => {
    assert.deepEqual(transitionRide('draft', 'quoted'), { ok: true, state: 'quoted' });
    assert.deepEqual(transitionRide('quoted', 'requested'), { ok: true, state: 'requested' });
    assert.deepEqual(transitionRide('quoted', 'draft'), { ok: true, state: 'draft' });
  });

  test('draft não pode saltar para fases do servidor alem de requested', () => {
    assert.equal(canTransitionRide('draft', 'searching_driver'), false);
    assert.equal(canTransitionRide('draft', 'cancelled'), false);
  });

  test('failed pode voltar para draft (extensão de UI; no servidor failed é terminal)', () => {
    assert.deepEqual(transitionRide('failed', 'draft'), { ok: true, state: 'draft' });
  });
});

describe('a tabela do servidor chega sem ser reescrita', () => {
  const SERVER_STATES: readonly TripStatus[] = [
    'requested',
    'searching_driver',
    'driver_assigned',
    'driver_en_route',
    'driver_arrived',
    'in_progress',
    'completed',
    'cancelled',
  ];

  test('cada transição de TripStatus aceita por cancelTrip também é aceita por transitionRide', () => {
    for (const from of SERVER_STATES) {
      for (const actor of ['passenger', 'driver', 'admin', 'system'] as const) {
        const serverResult = cancelTrip(from, actor);
        if (!serverResult.ok) continue;
        assert.equal(canTransitionRide(from, serverResult.state), true, `${from} -> ${serverResult.state} (${actor})`);
      }
    }
  });

  test('driver_assigned/driver_en_route aceitam searching_driver como destino (a correção)', () => {
    assert.equal(canTransitionRide('driver_assigned', 'searching_driver'), true);
    assert.equal(canTransitionRide('driver_en_route', 'searching_driver'), true);
  });
});

describe('isRideCancellable', () => {
  test('fases locais nunca são "canceláveis" no sentido de cancelled (não existe essa transição)', () => {
    assert.equal(isRideCancellable('draft'), false);
    assert.equal(isRideCancellable('quoted'), false);
  });

  test('driver_assigned e driver_en_route continuam canceláveis (cancelled ainda é alcançável)', () => {
    assert.equal(isRideCancellable('driver_assigned'), true);
    assert.equal(isRideCancellable('driver_en_route'), true);
  });
});

describe('cancelRide', () => {
  test('draft/quoted: cancelar é só voltar ao rascunho, para qualquer ator', () => {
    for (const actor of ['passenger', 'driver', 'admin', 'system'] as const) {
      assert.deepEqual(cancelRide('draft', actor), { ok: true, state: 'draft' }, actor);
      assert.deepEqual(cancelRide('quoted', actor), { ok: true, state: 'draft' }, actor);
    }
  });

  test('motorista cancela em driver_assigned: a corrida volta para searching_driver', () => {
    assert.deepEqual(cancelRide('driver_assigned', 'driver'), { ok: true, state: 'searching_driver' });
  });

  test('motorista cancela em driver_en_route: idem', () => {
    assert.deepEqual(cancelRide('driver_en_route', 'driver'), { ok: true, state: 'searching_driver' });
  });

  test('passageiro cancela em driver_assigned: mata a corrida', () => {
    assert.deepEqual(cancelRide('driver_assigned', 'passenger'), { ok: true, state: 'cancelled' });
  });

  test('corrida terminal é recusada, com from/to/reason', () => {
    const result = cancelRide('completed', 'system');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.from, 'completed');
      assert.equal(result.to, 'cancelled');
    }
  });
});
