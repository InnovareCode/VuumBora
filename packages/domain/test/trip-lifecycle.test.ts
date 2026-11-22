/**
 * Tabela de transições do SERVIDOR (`TripStatus`) — a correção do S0 (plano-sistema.md §6.1) e o
 * achado A1 da conferência da Nova (`docs/contratos/conferencia-f08-nova.md`): cancelamento
 * depende do ATOR, não só do estado. Cobre TODA transição válida da tabela (não só a nova) e uma
 * amostra de recusas, para um mutante que afrouxe ou aperte o grafo morrer aqui.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  TRIP_TRANSITIONS,
  cancelTrip,
  canTransitionTrip,
  isTripCancellable,
  transitionTrip,
} from '../src/trip-lifecycle';
import type { CancelActor } from '../src/trip-lifecycle';
import type { TripStatus } from '../src/index';

const ALL_STATUSES: readonly TripStatus[] = [
  'requested',
  'searching_driver',
  'driver_assigned',
  'driver_en_route',
  'driver_arrived',
  'in_progress',
  'completed',
  'cancelled',
  'failed',
];

const ALL_ACTORS: readonly CancelActor[] = ['passenger', 'driver', 'admin', 'system'];

describe('transitionTrip / canTransitionTrip — toda a tabela', () => {
  test('cada transição listada em TRIP_TRANSITIONS é aceita', () => {
    for (const from of ALL_STATUSES) {
      for (const to of TRIP_TRANSITIONS[from]) {
        assert.equal(canTransitionTrip(from, to), true, `${from} -> ${to} deveria ser aceita`);
        const result = transitionTrip(from, to);
        assert.deepEqual(result, { ok: true, state: to });
      }
    }
  });

  test('qualquer par fora da tabela é recusado, com from/to/reason', () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (TRIP_TRANSITIONS[from].includes(to)) continue;
        assert.equal(canTransitionTrip(from, to), false, `${from} -> ${to} deveria ser recusada`);
        const result = transitionTrip(from, to);
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.from, from);
          assert.equal(result.to, to);
          assert.match(result.reason, /Transição de corrida inválida/);
        }
      }
    }
  });

  test('completed, cancelled e failed são terminais (nenhuma saída)', () => {
    assert.deepEqual(TRIP_TRANSITIONS.completed, []);
    assert.deepEqual(TRIP_TRANSITIONS.cancelled, []);
    assert.deepEqual(TRIP_TRANSITIONS.failed, []);
  });
});

describe('isTripCancellable — por ator (A1)', () => {
  test('passageiro, admin e sistema: de requested a driver_arrived, nunca depois', () => {
    const expected: readonly TripStatus[] = ['requested', 'searching_driver', 'driver_assigned', 'driver_en_route', 'driver_arrived'];
    for (const actor of ['passenger', 'admin', 'system'] as const) {
      for (const status of ALL_STATUSES) {
        assert.equal(isTripCancellable(status, actor), expected.includes(status), `${actor}/${status}`);
      }
    }
  });

  test('motorista: só a partir de driver_assigned — requested/searching_driver são recusados', () => {
    const expected: readonly TripStatus[] = ['driver_assigned', 'driver_en_route', 'driver_arrived'];
    for (const status of ALL_STATUSES) {
      assert.equal(isTripCancellable(status, 'driver'), expected.includes(status), status);
    }
    assert.equal(isTripCancellable('requested', 'driver'), false);
    assert.equal(isTripCancellable('searching_driver', 'driver'), false);
  });

  test('nenhum ator cancela fase terminal', () => {
    for (const status of ['completed', 'cancelled', 'failed'] as const) {
      for (const actor of ALL_ACTORS) assert.equal(isTripCancellable(status, actor), false, `${actor}/${status}`);
    }
  });
});

describe('cancelTrip — a correção do S0 + o achado A1', () => {
  test('motorista em driver_assigned volta para searching_driver (não mata a corrida)', () => {
    assert.deepEqual(cancelTrip('driver_assigned', 'driver'), { ok: true, state: 'searching_driver' });
  });

  test('motorista em driver_en_route também volta para searching_driver', () => {
    assert.deepEqual(cancelTrip('driver_en_route', 'driver'), { ok: true, state: 'searching_driver' });
  });

  test('passageiro, admin e sistema nos MESMOS estados matam a corrida (cancelled)', () => {
    for (const actor of ['passenger', 'admin', 'system'] as const) {
      assert.deepEqual(cancelTrip('driver_assigned', actor), { ok: true, state: 'cancelled' }, actor);
      assert.deepEqual(cancelTrip('driver_en_route', actor), { ok: true, state: 'cancelled' }, actor);
    }
  });

  test('motorista em driver_arrived mata a corrida — não volta mais para a busca dali', () => {
    assert.deepEqual(cancelTrip('driver_arrived', 'driver'), { ok: true, state: 'cancelled' });
  });

  test('A1: motorista é RECUSADO em requested e searching_driver — não há corrida atribuída a ele ali', () => {
    for (const from of ['requested', 'searching_driver'] as const) {
      const result = cancelTrip(from, 'driver');
      assert.equal(result.ok, false, from);
      if (!result.ok) assert.equal(result.from, from);
    }
  });

  test('passageiro, admin e sistema PODEM cancelar requested e searching_driver (mata a corrida)', () => {
    for (const from of ['requested', 'searching_driver'] as const) {
      for (const actor of ['passenger', 'admin', 'system'] as const) {
        assert.deepEqual(cancelTrip(from, actor), { ok: true, state: 'cancelled' }, `${from}/${actor}`);
      }
    }
  });

  test('fase terminal é recusada para qualquer ator', () => {
    for (const from of ['completed', 'cancelled', 'failed'] as const) {
      for (const actor of ALL_ACTORS) assert.equal(cancelTrip(from, actor).ok, false, `${actor}/${from}`);
    }
  });
});
