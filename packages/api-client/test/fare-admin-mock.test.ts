/**
 * `createMockFareAdmin` (M4, fatia K0 do `docs/plano-m3-m4.md`; telas do G5): só o `dono`, versão
 * nunca editada (a nova fecha a anterior), simulador com taxa de 20% e de 25%.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { computeFare, splitFare } from '@vuumbora/domain';
import { createMockFareAdmin } from '../src/admin/fare-admin-mock-adapter';
import type { FareTableDraft } from '../src/admin/types';

const NOW = Date.parse('2026-11-27T12:00:00Z');
const DRAFT: FareTableDraft = {
  isTest: true,
  note: 'proposta',
  categories: [{ categorySlug: 'vuumbora', baseCents: 450, perKmCents: 160, perMinuteCents: 30, minimumFareCents: 900 }],
};

function expectError(result: { ok: boolean; error?: { kind: string; code?: string } }, kind: string, code: string): void {
  assert.equal(result.ok, false, `esperava ${code}`);
  assert.equal(result.error?.kind, kind);
  assert.equal(result.error?.code, code);
}

describe('papel', () => {
  for (const role of ['revisor_documentos', 'operacao', 'financeiro', 'suporte'] as const) {
    test(`${role}: 403 forbidden em todas as rotas de tarifa`, async () => {
      const { port } = createMockFareAdmin({ role });
      const calls = [port.fareTables(), port.createFareTable(DRAFT, 'k'), port.simulate({ versionDraft: DRAFT, routes: [{ distanceM: 1, durationS: 1 }] }), port.serviceAreas()];
      for (const result of await Promise.all(calls)) expectError(result, 'forbidden', 'forbidden');
    });
  }
});

describe('versões', () => {
  test('criar fecha a vigente e nunca edita as anteriores; lista mais recente primeiro', async () => {
    const { port } = createMockFareAdmin({ role: 'dono', clock: () => NOW });
    const before = await port.fareTables();
    assert.ok(before.ok);
    const original = before.data.items[0];
    assert.ok(original);
    assert.equal(original.validTo, undefined);

    const created = await port.createFareTable(DRAFT, 'k1');
    assert.ok(created.ok);
    assert.equal(created.data.validFrom, new Date(NOW).toISOString());
    const after = await port.fareTables();
    assert.ok(after.ok);
    assert.deepEqual(after.data.items.map((version) => version.fareVersionId), [created.data.fareVersionId, original.fareVersionId]);
    assert.equal(after.data.items[1]?.validTo, new Date(NOW).toISOString());
    assert.deepEqual(after.data.items[1]?.categories, original.categories, 'tarifas da versão antiga intactas');
  });

  test('idempotência: mesma chave e corpo = mesma versão; corpo diferente = 409', async () => {
    const { port } = createMockFareAdmin({ role: 'dono' });
    const first = await port.createFareTable(DRAFT, 'k1');
    const again = await port.createFareTable(DRAFT, 'k1');
    assert.ok(first.ok && again.ok);
    assert.equal(again.data.fareVersionId, first.data.fareVersionId);
    expectError(await port.createFareTable({ ...DRAFT, isTest: false }, 'k1'), 'conflict', 'idempotency_key_reused');
  });

  test('400 invalid_body: categoria repetida, valor negativo ou fracionado, sem categorias', async () => {
    const { port } = createMockFareAdmin({ role: 'dono' });
    const rates = DRAFT.categories[0];
    assert.ok(rates);
    const bad: FareTableDraft[] = [
      { ...DRAFT, categories: [rates, rates] },
      { ...DRAFT, categories: [{ ...rates, perKmCents: -1 }] },
      { ...DRAFT, categories: [{ ...rates, baseCents: 1.5 }] },
      { ...DRAFT, categories: [] },
    ];
    for (const draft of bad) expectError(await port.createFareTable(draft, `k-${JSON.stringify(draft)}`), 'validation', 'invalid_body');
  });

  test('cursor e 400 invalid_cursor', async () => {
    const { port } = createMockFareAdmin({ role: 'dono' });
    await port.createFareTable(DRAFT, 'k1');
    const first = await port.fareTables({ limit: 1 });
    assert.ok(first.ok);
    assert.ok(first.data.nextCursor);
    const second = await port.fareTables({ limit: 1, cursor: first.data.nextCursor ?? '' });
    assert.ok(second.ok);
    assert.equal(second.data.nextCursor, undefined);
    expectError(await port.fareTables({ cursor: 'inventado' }), 'validation', 'invalid_cursor');
  });
});

describe('simulador', () => {
  test('preço pelo computeFare e ganho do motorista com 20% e 25% (o resto do split)', async () => {
    const { port } = createMockFareAdmin({ role: 'dono' });
    const result = await port.simulate({ versionDraft: DRAFT, routes: [{ distanceM: 8000, durationS: 1200 }, { distanceM: 500, durationS: 120 }] });
    assert.ok(result.ok);
    assert.equal(result.data.rows.length, 2);
    const total = computeFare(DRAFT.categories[0] ?? { baseCents: 0, perKmCents: 0, perMinuteCents: 0, minimumFareCents: 0 }, {
      distanceM: 8000,
      durationS: 1200,
    }).totalCents;
    assert.deepEqual(result.data.rows[0], {
      routeIndex: 0,
      categorySlug: 'vuumbora',
      passengerPriceCents: total,
      driverEarningsCents: { fee20: splitFare(total, 20).driverPayoutCents, fee25: splitFare(total, 25).driverPayoutCents },
    });
    assert.equal(result.data.rows[1]?.passengerPriceCents, 900, 'trajeto curto cai no mínimo');
  });

  test('400 invalid_body: sem rotas, mais de 50, distância negativa', async () => {
    const { port } = createMockFareAdmin({ role: 'dono' });
    const route = { distanceM: 1000, durationS: 60 };
    expectError(await port.simulate({ versionDraft: DRAFT, routes: [] }), 'validation', 'invalid_body');
    expectError(await port.simulate({ versionDraft: DRAFT, routes: Array.from({ length: 51 }, () => route) }), 'validation', 'invalid_body');
    expectError(await port.simulate({ versionDraft: DRAFT, routes: [{ distanceM: -1, durationS: 60 }] }), 'validation', 'invalid_body');
  });

  test('serviceAreas devolve a área', async () => {
    const { port } = createMockFareAdmin({ role: 'dono' });
    const result = await port.serviceAreas();
    assert.ok(result.ok);
    assert.equal(result.data[0]?.areaId, 'natal-mock');
  });
});
