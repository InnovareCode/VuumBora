/**
 * Teto diário global por motor do Mapbox (`lib/geo-budget.ts`) — regra pura, sem banco: o dia é o de Natal (UTC−3), cada
 * motor tem o seu saldo, o aviso sai uma vez por motor por dia, e a porta embrulhada não chama nada sem saldo.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { GeoDailyBudget, natalDayOf, withDailyBudget, type GeoEngine } from '../src/lib/geo-budget.js';
import { GeoProviderError, type GeoProvider } from '../src/lib/mapbox.js';

const LIMITS: Record<GeoEngine, number> = { geocoding: 2, searchbox: 1, reverse: 0, directions: 3 };

describe('GeoDailyBudget', () => {
  test('o dia vira às 03:00 UTC (meia-noite em Natal), não à meia-noite UTC', () => {
    assert.equal(natalDayOf(Date.parse('2026-11-28T02:59:59Z')), natalDayOf(Date.parse('2026-11-27T03:00:00Z')));
    assert.equal(natalDayOf(Date.parse('2026-11-28T03:00:00Z')), natalDayOf(Date.parse('2026-11-27T03:00:00Z')) + 1);
  });

  test('saldo por motor; esgotado recusa; aviso UMA vez por motor por dia; o dia seguinte zera', () => {
    let clock = Date.parse('2026-11-27T15:00:00Z');
    const warnings: string[] = [];
    const budget = new GeoDailyBudget(LIMITS, (engine, limit) => warnings.push(`${engine}:${limit}`), () => clock);
    assert.deepEqual([budget.take('geocoding'), budget.take('geocoding'), budget.take('geocoding'), budget.take('geocoding')], [true, true, false, false]);
    assert.equal(budget.take('searchbox'), true, 'outro motor, outro saldo');
    assert.equal(budget.take('reverse'), false, 'teto 0 = motor desligado');
    assert.deepEqual(warnings, ['geocoding:2', 'reverse:0']);
    assert.deepEqual(budget.usage(), { geocoding: 2, searchbox: 1, reverse: 0, directions: 0 });

    clock = Date.parse('2026-11-28T02:59:00Z'); // ainda 27/11 em Natal
    assert.equal(budget.take('geocoding'), false);
    clock = Date.parse('2026-11-28T03:00:00Z'); // 28/11 em Natal
    assert.equal(budget.take('geocoding'), true);
    assert.equal(budget.take('geocoding'), true);
    assert.equal(budget.take('geocoding'), false);
    assert.deepEqual(warnings, ['geocoding:2', 'reverse:0', 'geocoding:2'], 'o aviso volta a sair no dia novo');
  });

  test('a porta embrulhada não chama o Mapbox sem saldo e lança budget_exhausted', async () => {
    const calls: string[] = [];
    const inner: GeoProvider = {
      forward: async (engine) => { calls.push(engine); return []; },
      reverse: async () => { calls.push('reverse'); return { label: null }; },
      directions: async () => { calls.push('directions'); return { distanceM: 1, durationS: 1, polyline: 'a' }; },
    };
    const provider = withDailyBudget(inner, new GeoDailyBudget(LIMITS, () => undefined));
    const request = { q: 'x', proximity: { lat: -5.79, lng: -35.21 }, bbox: [-35.42, -6.02, -35.12, -5.66] as const };
    await provider.forward('searchbox', request);
    for (const attempt of [() => provider.forward('searchbox', request), () => provider.reverse({ lat: -5.8, lng: -35.2 })]) {
      await assert.rejects(attempt(), (err: unknown) => err instanceof GeoProviderError && err.reason === 'budget_exhausted');
    }
    assert.deepEqual(calls, ['searchbox']);
  });
});
