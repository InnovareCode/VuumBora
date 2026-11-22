/**
 * `createMockPassengerRidePort` — cotação por categoria (B1), pedido (B2), status, cancelamento
 * (B3) e tempo real (B5), nos erros do contrato (`quote_expired`, `category_unavailable`,
 * `invalid_transition`, `idempotency_key_reused`, `outside_service_area`, `not_found`). Cobre os
 * achados A2 e A4 da conferência da Nova (`docs/contratos/conferencia-f08-nova.md`); A1/A3 vivem
 * no lado do motorista (`driver-ride-mock.test.ts`).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { TripId } from '@vuumbora/domain';
import { createMockPassengerRidePort } from '../src/passenger/mock-adapter';
import type { Quote } from '../src/passenger/types';
import type { TripEvent } from '../src/trip/types';

const ORIGIN = { label: 'Casa', address: 'Rua A, 1', point: { latitude: -5.79, longitude: -35.21 } };
const DESTINATION = { label: 'Trabalho', address: 'Rua B, 2', point: { latitude: -5.8, longitude: -35.2 } };

function fresh(now = 0) {
  let clockMs = now;
  return {
    advanceClock: (deltaMs: number) => {
      clockMs += deltaMs;
    },
    ...createMockPassengerRidePort({ clock: () => clockMs }),
  };
}

function firstCategory(quote: Quote) {
  const category = quote.categories[0];
  assert.ok(category, 'cotação de apoio deveria ter ao menos uma categoria');
  return category;
}

async function quotedAndRequested(mock: ReturnType<typeof fresh>) {
  const quoteResult = await mock.port.quote({ origin: ORIGIN, destination: DESTINATION });
  assert.ok(quoteResult.ok, 'cotação de apoio deveria passar');
  const category = firstCategory(quoteResult.data);
  const requestResult = await mock.port.request({ quoteId: category.quoteId, paymentMethodId: 'pm_1' }, 'key-setup');
  assert.ok(requestResult.ok, 'pedido de apoio deveria passar');
  return { quoteId: category.quoteId, tripId: requestResult.data.tripId };
}

describe('quote (B1)', () => {
  test('devolve só as categorias LIGADAS de "ride": vuumbora, conforto, pet — sem Entrega nem Motorista mulher', async () => {
    const mock = fresh();
    const result = await mock.port.quote({ origin: ORIGIN, destination: DESTINATION });
    assert.ok(result.ok);
    if (!result.ok) return;
    const ids = result.data.categories.map((c) => c.categoryId).sort();
    assert.deepEqual(ids, ['conforto', 'pet', 'vuumbora']);
    assert.equal(result.origin, 'mock');
  });

  test('cada categoria tem seu PRÓPRIO quoteId/expiresAt, mais distância, duração e ETA', async () => {
    const mock = fresh();
    const result = await mock.port.quote({ origin: ORIGIN, destination: DESTINATION });
    assert.ok(result.ok);
    if (!result.ok) return;
    const quoteIds = result.data.categories.map((c) => c.quoteId);
    assert.equal(new Set(quoteIds).size, quoteIds.length, 'quoteIds distintos por categoria');
    for (const category of result.data.categories) {
      assert.ok(category.expiresAt);
      assert.equal(typeof category.distanceM, 'number');
      assert.equal(typeof category.durationS, 'number');
      assert.equal(typeof category.pickupEtaS, 'number');
    }
  });

  test('kind: "delivery" devolve lista vazia — Entrega está desligada (§13.3)', async () => {
    const mock = fresh();
    const result = await mock.port.quote({ origin: ORIGIN, destination: DESTINATION, kind: 'delivery' });
    assert.ok(result.ok);
    if (result.ok) assert.deepEqual(result.data.categories, []);
  });

  test('fora da área de serviço: 409 conflict outside_service_area', async () => {
    const mock = createMockPassengerRidePort({ isOutsideServiceArea: () => true });
    const result = await mock.port.quote({ origin: ORIGIN, destination: DESTINATION });
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.error, { kind: 'conflict', reason: 'outside_service_area' });
  });
});

describe('request (B2)', () => {
  test('cria a corrida em "requested" — não avança sozinha (Pix antes da corrida, S5)', async () => {
    const mock = fresh();
    const quoteResult = await mock.port.quote({ origin: ORIGIN, destination: DESTINATION });
    assert.ok(quoteResult.ok);
    if (!quoteResult.ok) return;
    const category = firstCategory(quoteResult.data);
    const result = await mock.port.request({ quoteId: category.quoteId, paymentMethodId: 'pm_1' }, 'k1');
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.data.status, 'requested');
    const status = await mock.port.status(result.ok ? result.data.tripId : ('' as TripId));
    assert.ok(status.ok);
    if (status.ok) assert.equal(status.data.status, 'requested');
  });

  test('quoteId desconhecido: not_found', async () => {
    const mock = fresh();
    const result = await mock.port.request({ quoteId: 'nao-existe', paymentMethodId: 'pm_1' }, 'k1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, 'not_found');
  });

  test('cotação vencida: 409 conflict quote_expired', async () => {
    const mock = fresh();
    const quoteResult = await mock.port.quote({ origin: ORIGIN, destination: DESTINATION });
    assert.ok(quoteResult.ok);
    if (!quoteResult.ok) return;
    const category = firstCategory(quoteResult.data);
    mock.advanceClock(6 * 60 * 1000); // > 5 min (padrão)
    const result = await mock.port.request({ quoteId: category.quoteId, paymentMethodId: 'pm_1' }, 'k1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.error, { kind: 'conflict', reason: 'quote_expired' });
  });

  test('B1: categoria desligada ENTRE a cotação e o pedido: 409 conflict category_unavailable', async () => {
    const mock = fresh();
    const quoteResult = await mock.port.quote({ origin: ORIGIN, destination: DESTINATION });
    assert.ok(quoteResult.ok);
    if (!quoteResult.ok) return;
    const category = quoteResult.data.categories.find((c) => c.categoryId === 'vuumbora');
    assert.ok(category);
    mock.control.setCategoryEnabled('vuumbora', false); // desligou por baixo, depois da cotação
    const result = await mock.port.request({ quoteId: category!.quoteId, paymentMethodId: 'pm_1' }, 'k1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.error, { kind: 'conflict', reason: 'category_unavailable' });
  });

  test('B1: availability "low"/"none" NÃO bloqueia o pedido — só "sem motorista estimado agora"', async () => {
    const mock = fresh();
    const quoteResult = await mock.port.quote({ origin: ORIGIN, destination: DESTINATION });
    assert.ok(quoteResult.ok);
    if (!quoteResult.ok) return;
    const pet = quoteResult.data.categories.find((c) => c.categoryId === 'pet');
    assert.ok(pet);
    assert.equal(pet!.availability, 'low');
    const result = await mock.port.request({ quoteId: pet!.quoteId, paymentMethodId: 'pm_1' }, 'k1');
    assert.ok(result.ok, 'low availability ainda é um pedido aceito');
  });

  test('A4: idempotencyKey repetida com o MESMO corpo devolve a MESMA corrida', async () => {
    const mock = fresh();
    const quoteResult = await mock.port.quote({ origin: ORIGIN, destination: DESTINATION });
    assert.ok(quoteResult.ok);
    if (!quoteResult.ok) return;
    const category = firstCategory(quoteResult.data);
    const input = { quoteId: category.quoteId, paymentMethodId: 'pm_1' };
    const first = await mock.port.request(input, 'repetida');
    const second = await mock.port.request(input, 'repetida');
    assert.ok(first.ok && second.ok);
    if (first.ok && second.ok) assert.deepEqual(first.data, second.data);
  });

  test('A4: idempotencyKey repetida com corpo DIFERENTE é 409 idempotency_key_reused', async () => {
    const mock = fresh();
    const quoteResult = await mock.port.quote({ origin: ORIGIN, destination: DESTINATION });
    assert.ok(quoteResult.ok);
    if (!quoteResult.ok) return;
    const [first, second] = quoteResult.data.categories;
    assert.ok(first && second && first.quoteId !== second.quoteId);
    const firstCall = await mock.port.request({ quoteId: first.quoteId, paymentMethodId: 'pm_1' }, 'mesma-chave');
    assert.ok(firstCall.ok);
    const secondCall = await mock.port.request({ quoteId: second!.quoteId, paymentMethodId: 'pm_1' }, 'mesma-chave');
    assert.equal(secondCall.ok, false);
    if (!secondCall.ok) assert.deepEqual(secondCall.error, { kind: 'conflict', reason: 'idempotency_key_reused' });
  });
});

describe('status', () => {
  test('tripId desconhecido: not_found', async () => {
    const mock = fresh();
    const result = await mock.port.status('nao-existe' as TripId);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, 'not_found');
  });
});

describe('cancel (B3)', () => {
  test('passageiro cancela em requested: mata a corrida, devolve { status }', async () => {
    const mock = fresh();
    const { tripId } = await quotedAndRequested(mock);
    const result = await mock.port.cancel(tripId, { reason: 'change_of_plans' }, 'cancel-1');
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.data.status, 'cancelled');
  });

  test('tripId desconhecido: not_found', async () => {
    const mock = fresh();
    const result = await mock.port.cancel('nao-existe' as TripId, {}, 'k1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, 'not_found');
  });

  test('corrida já terminal: 409 conflict invalid_transition', async () => {
    const mock = fresh();
    const { tripId } = await quotedAndRequested(mock);
    mock.control.advance(tripId, 'searching_driver');
    mock.control.advance(tripId, 'driver_assigned');
    mock.control.advance(tripId, 'driver_en_route');
    mock.control.advance(tripId, 'driver_arrived');
    mock.control.advance(tripId, 'in_progress');
    mock.control.advance(tripId, 'completed');
    const result = await mock.port.cancel(tripId, {}, 'k1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.error, { kind: 'conflict', reason: 'invalid_transition' });
  });

  test('A4: idempotencyKey repetida com o MESMO corpo não recusa por já estar cancelada', async () => {
    const mock = fresh();
    const { tripId } = await quotedAndRequested(mock);
    const first = await mock.port.cancel(tripId, { reason: 'other' }, 'mesma-chave');
    const second = await mock.port.cancel(tripId, { reason: 'other' }, 'mesma-chave');
    assert.ok(first.ok);
    assert.ok(second.ok, 'sem cache de idempotência, a segunda chamada bateria em invalid_transition');
  });

  test('A4: idempotencyKey repetida com motivo DIFERENTE é 409 idempotency_key_reused', async () => {
    const mock = fresh();
    const { tripId } = await quotedAndRequested(mock);
    const first = await mock.port.cancel(tripId, { reason: 'other' }, 'mesma-chave');
    assert.ok(first.ok);
    const second = await mock.port.cancel(tripId, { reason: 'driver_too_far' }, 'mesma-chave');
    assert.equal(second.ok, false);
    if (!second.ok) assert.deepEqual(second.error, { kind: 'conflict', reason: 'idempotency_key_reused' });
  });
});

describe('control + subscribe — a progressão que substitui o setTimeout do simulador', () => {
  test('B5: ao assinar, chega IMEDIATAMENTE um evento com o estado atual e o seq do snapshot', async () => {
    const mock = fresh();
    const { tripId } = await quotedAndRequested(mock);
    mock.control.advance(tripId, 'searching_driver');
    const events: TripEvent[] = [];
    mock.port.subscribe(tripId, (event) => events.push(event));
    assert.equal(events.length, 1);
    assert.equal(events[0]?.type, 'status');
    assert.equal((events[0] as { status: string }).status, 'searching_driver');
    const snapshot = await mock.port.status(tripId);
    assert.ok(snapshot.ok);
    if (snapshot.ok) assert.equal(events[0]?.seq, snapshot.data.seq);
  });

  test('toda a cadeia feliz chega por eventos, com seq de status sempre crescente', async () => {
    const mock = fresh();
    const { tripId } = await quotedAndRequested(mock);
    const events: TripEvent[] = [];
    mock.port.subscribe(tripId, (event) => events.push(event));

    assert.ok(mock.control.advance(tripId, 'searching_driver').ok);
    assert.ok(mock.control.advance(tripId, 'driver_assigned').ok);
    mock.control.setDriverSummary(tripId, { driverId: 'd1', firstName: 'Ana', plate: 'ABC1D23' });
    assert.ok(mock.control.advance(tripId, 'driver_en_route').ok);
    mock.control.emitLocation(tripId, { latitude: -5.79, longitude: -35.205 });
    assert.ok(mock.control.advance(tripId, 'driver_arrived').ok);
    assert.ok(mock.control.advance(tripId, 'in_progress').ok);
    assert.ok(mock.control.advance(tripId, 'completed').ok);

    const statusSeqs = events.filter((e) => e.type === 'status').map((e) => e.seq);
    assert.deepEqual(statusSeqs, [...statusSeqs].sort((a, b) => a - b));
    assert.equal(new Set(statusSeqs).size, statusSeqs.length, 'seq de status nunca repete');

    const status = await mock.port.status(tripId);
    assert.ok(status.ok);
    if (status.ok) assert.equal(status.data.driver?.firstName, 'Ana');
  });

  test('B5: o evento de location carrega o seq do ESTADO EM VIGOR — não cria seq novo', async () => {
    const mock = fresh();
    const { tripId } = await quotedAndRequested(mock);
    const events: TripEvent[] = [];
    mock.port.subscribe(tripId, (event) => events.push(event));
    mock.control.advance(tripId, 'searching_driver');
    mock.control.advance(tripId, 'driver_assigned');
    const seqAtAssigned = (await mock.port.status(tripId)).ok ? (await mock.port.status(tripId) as { ok: true; data: { seq: number } }).data.seq : -1;
    mock.control.emitLocation(tripId, { latitude: -5.79, longitude: -35.2 });
    mock.control.emitLocation(tripId, { latitude: -5.79, longitude: -35.2 });
    const locationSeqs = events.filter((e) => e.type === 'location').map((e) => e.seq);
    assert.deepEqual(locationSeqs, [seqAtAssigned, seqAtAssigned]);
  });

  test('transição que o domínio recusaria não é forçada (searching_driver -> completed direto)', async () => {
    const mock = fresh();
    const { tripId } = await quotedAndRequested(mock);
    mock.control.advance(tripId, 'searching_driver');
    const result = mock.control.advance(tripId, 'completed');
    assert.equal(result.ok, false);
    const status = await mock.port.status(tripId);
    assert.ok(status.ok);
    if (status.ok) assert.equal(status.data.status, 'searching_driver');
  });

  test('unsubscribe para de receber eventos', async () => {
    const mock = fresh();
    const { tripId } = await quotedAndRequested(mock);
    const events: TripEvent[] = [];
    const unsubscribe = mock.port.subscribe(tripId, (event) => events.push(event));
    const before = events.length;
    unsubscribe();
    mock.control.advance(tripId, 'searching_driver');
    assert.equal(events.length, before);
  });

  test('A2: motorista cancela em driver_assigned (volta p/ busca) — o resumo do motorista some do snapshot', async () => {
    const mock = fresh();
    const { tripId } = await quotedAndRequested(mock);
    mock.control.advance(tripId, 'searching_driver');
    mock.control.advance(tripId, 'driver_assigned');
    mock.control.setDriverSummary(tripId, { driverId: 'A', firstName: 'Ana', plate: 'AAA1A11' });
    assert.equal((await mock.port.status(tripId)).ok && (await mock.port.status(tripId) as { ok: true; data: { driver?: unknown } }).data.driver !== undefined, true);

    const result = mock.control.cancel(tripId, 'driver');
    assert.deepEqual(result, { ok: true, state: 'searching_driver' });

    const status = await mock.port.status(tripId);
    assert.ok(status.ok);
    if (status.ok) {
      assert.equal(status.data.status, 'searching_driver');
      assert.equal(status.data.driver, undefined, 'A2: a volta para a busca limpa o motorista — nunca mostra o antigo');
    }
  });

  test('passageiro cancela em driver_assigned: mata a corrida (não volta para a busca)', async () => {
    const mock = fresh();
    const { tripId } = await quotedAndRequested(mock);
    mock.control.advance(tripId, 'searching_driver');
    mock.control.advance(tripId, 'driver_assigned');
    const result = mock.control.cancel(tripId, 'passenger');
    assert.deepEqual(result, { ok: true, state: 'cancelled' });
  });
});
