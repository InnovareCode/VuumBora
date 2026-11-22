/**
 * `createMockPassengerRidePort` — cotação, pedido, status, cancelamento e tempo real. Cobre os
 * erros do contrato (`quote_expired`, `category_unavailable`, `invalid_transition`, `not_found`),
 * idempotência de `request`/`cancel`, e `control` como o ponto que substitui o `setTimeout` do
 * simulador antigo.
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

async function quotedAndRequested(mock: ReturnType<typeof fresh>, categoryId = 'vuumbora') {
  const quoteResult = await mock.port.quote({ origin: ORIGIN, destination: DESTINATION });
  assert.ok(quoteResult.ok, 'cotação de apoio deveria passar');
  const quote = quoteResult.data as Quote;
  const requestResult = await mock.port.request({ quoteId: quote.quoteId, categoryId, paymentMethodId: 'pm_1' }, 'key-setup');
  assert.ok(requestResult.ok, 'pedido de apoio deveria passar');
  return { quote, tripId: requestResult.data.tripId };
}

describe('quote', () => {
  test('exige origem e destino', async () => {
    const mock = fresh();
    const result = await mock.port.quote({});
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, 'validation');
  });

  test('devolve as cinco categorias, com Entrega sempre "none" (desligada, §13.3)', async () => {
    const mock = fresh();
    const result = await mock.port.quote({ origin: ORIGIN, destination: DESTINATION });
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.data.categories.length, 5);
    const entrega = result.data.categories.find((c) => c.categoryId === 'entrega');
    assert.equal(entrega?.availability, 'none');
    assert.equal(result.origin, 'mock');
  });
});

describe('request', () => {
  test('cria a corrida já em searching_driver (requested -> searching_driver é imediato, §5.2)', async () => {
    const mock = fresh();
    const { tripId } = await quotedAndRequested(mock);
    const statusResult = await mock.port.status(tripId);
    assert.ok(statusResult.ok);
    if (statusResult.ok) assert.equal(statusResult.data.status, 'searching_driver');
  });

  test('quoteId desconhecido: not_found', async () => {
    const mock = fresh();
    const result = await mock.port.request({ quoteId: 'nao-existe', categoryId: 'vuumbora', paymentMethodId: 'pm_1' }, 'k1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, 'not_found');
  });

  test('cotação vencida: 409 conflict quote_expired', async () => {
    const mock = fresh();
    const quoteResult = await mock.port.quote({ origin: ORIGIN, destination: DESTINATION });
    assert.ok(quoteResult.ok);
    if (!quoteResult.ok) return;
    mock.advanceClock(6 * 60 * 1000); // > 5 min (padrão)
    const result = await mock.port.request(
      { quoteId: quoteResult.data.quoteId, categoryId: 'vuumbora', paymentMethodId: 'pm_1' },
      'k1',
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.error, { kind: 'conflict', reason: 'quote_expired' });
  });

  test('categoria fora da cotação: validation', async () => {
    const mock = fresh();
    const quoteResult = await mock.port.quote({ origin: ORIGIN, destination: DESTINATION });
    assert.ok(quoteResult.ok);
    if (!quoteResult.ok) return;
    const result = await mock.port.request(
      { quoteId: quoteResult.data.quoteId, categoryId: 'nao-existe', paymentMethodId: 'pm_1' },
      'k1',
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, 'validation');
  });

  test('categoria desligada (Entrega): 409 conflict category_unavailable', async () => {
    const mock = fresh();
    const quoteResult = await mock.port.quote({ origin: ORIGIN, destination: DESTINATION });
    assert.ok(quoteResult.ok);
    if (!quoteResult.ok) return;
    const result = await mock.port.request(
      { quoteId: quoteResult.data.quoteId, categoryId: 'entrega', paymentMethodId: 'pm_1' },
      'k1',
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.error, { kind: 'conflict', reason: 'category_unavailable' });
  });

  test('idempotencyKey repetida devolve a MESMA corrida, não cria uma segunda', async () => {
    const mock = fresh();
    const quoteResult = await mock.port.quote({ origin: ORIGIN, destination: DESTINATION });
    assert.ok(quoteResult.ok);
    if (!quoteResult.ok) return;
    const input = { quoteId: quoteResult.data.quoteId, categoryId: 'vuumbora', paymentMethodId: 'pm_1' };
    const first = await mock.port.request(input, 'repetida');
    const second = await mock.port.request(input, 'repetida');
    assert.ok(first.ok && second.ok);
    if (first.ok && second.ok) assert.equal(first.data.tripId, second.data.tripId);
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

describe('cancel', () => {
  test('passageiro cancela em searching_driver: mata a corrida', async () => {
    const mock = fresh();
    const { tripId } = await quotedAndRequested(mock);
    const result = await mock.port.cancel(tripId, 'cancel-1');
    assert.ok(result.ok);
    const status = await mock.port.status(tripId);
    assert.ok(status.ok);
    if (status.ok) assert.equal(status.data.status, 'cancelled');
  });

  test('tripId desconhecido: not_found', async () => {
    const mock = fresh();
    const result = await mock.port.cancel('nao-existe' as TripId, 'k1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, 'not_found');
  });

  test('corrida já terminal: 409 conflict invalid_transition', async () => {
    const mock = fresh();
    const { tripId } = await quotedAndRequested(mock);
    mock.control.advance(tripId, 'driver_assigned');
    mock.control.advance(tripId, 'driver_en_route');
    mock.control.advance(tripId, 'driver_arrived');
    mock.control.advance(tripId, 'in_progress');
    mock.control.advance(tripId, 'completed');
    const result = await mock.port.cancel(tripId, 'k1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.error, { kind: 'conflict', reason: 'invalid_transition' });
  });

  test('idempotencyKey repetida: a SEGUNDA chamada não recusa por já estar cancelada', async () => {
    const mock = fresh();
    const { tripId } = await quotedAndRequested(mock);
    const first = await mock.port.cancel(tripId, 'mesma-chave');
    const second = await mock.port.cancel(tripId, 'mesma-chave');
    assert.ok(first.ok);
    assert.ok(second.ok, 'sem cache de idempotência, a segunda chamada bateria em invalid_transition');
  });
});

describe('control + subscribe — a progressão que substitui o setTimeout do simulador', () => {
  test('toda a cadeia feliz chega por eventos, com seq crescente', async () => {
    const mock = fresh();
    const { tripId } = await quotedAndRequested(mock);
    const events: TripEvent[] = [];
    mock.port.subscribe(tripId, (event) => events.push(event));

    const driver = { driverId: 'd1', firstName: 'Ana', plate: 'ABC1D23' };
    assert.ok(mock.control.advance(tripId, 'driver_assigned', driver).ok);
    assert.ok(mock.control.advance(tripId, 'driver_en_route').ok);
    mock.control.emitLocation(tripId, { latitude: -5.79, longitude: -35.205 });
    assert.ok(mock.control.advance(tripId, 'driver_arrived').ok);
    assert.ok(mock.control.advance(tripId, 'in_progress').ok);
    assert.ok(mock.control.advance(tripId, 'completed').ok);

    assert.equal(events.length, 6);
    // seq é por CORRIDA, não por assinante: o 1º já saiu no "requested -> searching_driver" do próprio request().
    const seqs = events.map((e) => e.seq);
    assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), 'seq sempre crescente');
    assert.deepEqual(new Set(seqs).size, seqs.length, 'seq nunca repete');
    assert.equal(events[0]?.type, 'status');
    assert.deepEqual((events[0] as { driver?: unknown }).driver, driver);
    assert.equal(events[2]?.type, 'location');
    assert.equal(events[5]?.type, 'status');
  });

  test('transição que o domínio recusaria não é forçada (searching_driver -> completed direto)', async () => {
    const mock = fresh();
    const { tripId } = await quotedAndRequested(mock);
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
    mock.control.advance(tripId, 'driver_assigned');
    unsubscribe();
    mock.control.advance(tripId, 'driver_en_route');
    assert.equal(events.length, 1);
  });

  test('motorista cancela em driver_assigned: a correção do S0 — volta para searching_driver', async () => {
    const mock = fresh();
    const { tripId } = await quotedAndRequested(mock);
    mock.control.advance(tripId, 'driver_assigned');
    const result = mock.control.cancel(tripId, 'driver');
    assert.deepEqual(result, { ok: true, state: 'searching_driver' });
    const status = await mock.port.status(tripId);
    assert.ok(status.ok);
    if (status.ok) assert.equal(status.data.status, 'searching_driver');
  });

  test('passageiro cancela em driver_assigned: mata a corrida (não volta para a busca)', async () => {
    const mock = fresh();
    const { tripId } = await quotedAndRequested(mock);
    mock.control.advance(tripId, 'driver_assigned');
    const result = mock.control.cancel(tripId, 'passenger');
    assert.deepEqual(result, { ok: true, state: 'cancelled' });
  });
});
