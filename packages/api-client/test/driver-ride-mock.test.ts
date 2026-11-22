/**
 * `createMockDriverRidePort` — oferta (aceite atômico) e corrida depois do aceite. Cobre os
 * erros do contrato (`offer_taken`, `offer_expired`, `invalid_transition`, `not_found`),
 * idempotência de `accept`/`cancel`, e a correção do S0 pelo lado do motorista: cancelar depois
 * do aceite volta a corrida para a busca, não mata.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createTripStore } from '../src/trip/mock-store';
import { createMockDriverRidePort } from '../src/driver/mock-adapter';
import { createMockPassengerRidePort } from '../src/passenger/mock-adapter';
import type { Quote } from '../src/passenger/types';

const PICKUP = { label: 'Casa', address: 'Rua A, 1', point: { latitude: -5.79, longitude: -35.21 } };
const DESTINATION = { label: 'Trabalho', address: 'Rua B, 2', point: { latitude: -5.8, longitude: -35.2 } };
const PAYOUT = { amountCents: 1500, currency: 'BRL' as const };

function fresh(now = 0) {
  let clockMs = now;
  return {
    advanceClock: (deltaMs: number) => {
      clockMs += deltaMs;
    },
    ...createMockDriverRidePort({ clock: () => clockMs }),
  };
}

describe('control.offer', () => {
  test('cria a oferta com destino visível (§6.2/§5.4) e corrida própria', () => {
    const mock = fresh();
    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    assert.equal(offer.pickup, PICKUP);
    assert.equal(offer.destination, DESTINATION);
    assert.equal(offer.categoryId, 'vuumbora');
    const snapshot = mock.control.snapshot(offer.tripId);
    assert.equal(snapshot?.status, 'searching_driver');
  });
});

describe('accept', () => {
  test('aceite atômico: a corrida vai para driver_assigned', async () => {
    const mock = fresh();
    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    const result = await mock.offerPort.accept(offer, 'k1');
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.data.tripId, offer.tripId);
    const status = await mock.tripPort.status(offer.tripId);
    assert.ok(status.ok);
    if (status.ok) assert.equal(status.data.status, 'driver_assigned');
  });

  test('offerId desconhecido: not_found', async () => {
    const mock = fresh();
    const result = await mock.offerPort.accept(
      { offerId: 'nao-existe', tripId: 'x' as never, expiresAt: '2026-01-01T00:00:00Z' as never, estimatedPayout: PAYOUT, pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora' },
      'k1',
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, 'not_found');
  });

  test('oferta expirada: 409 conflict offer_expired', async () => {
    const mock = fresh();
    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    mock.control.expireOffer(offer.offerId);
    const result = await mock.offerPort.accept(offer, 'k1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.error, { kind: 'conflict', reason: 'offer_expired' });
  });

  test('oferta já tomada por outro motorista: 409 conflict offer_taken', async () => {
    const mock = fresh();
    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    mock.control.takeOffer(offer.offerId);
    const result = await mock.offerPort.accept(offer, 'k1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.error, { kind: 'conflict', reason: 'offer_taken' });
  });

  test('corrida não está mais em searching_driver (cancelada por baixo): offer_taken, não crasha', async () => {
    const mock = fresh();
    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    const cancelled = await mock.tripPort.cancel(offer.tripId, 'cancel-1');
    assert.ok(cancelled.ok);
    const result = await mock.offerPort.accept(offer, 'k1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.error, { kind: 'conflict', reason: 'offer_taken' });
  });

  test('idempotencyKey repetida devolve o MESMO resultado, mesmo depois de a oferta mudar', async () => {
    const mock = fresh();
    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    const first = await mock.offerPort.accept(offer, 'mesma-chave');
    mock.control.expireOffer(offer.offerId); // não deveria importar: a resposta já foi fixada
    const second = await mock.offerPort.accept(offer, 'mesma-chave');
    assert.ok(first.ok && second.ok);
    if (first.ok && second.ok) assert.deepEqual(first.data, second.data);
  });
});

describe('decline', () => {
  test('é idempotente: oferta desconhecida também devolve sucesso', async () => {
    const mock = fresh();
    const result = await mock.offerPort.decline({
      offerId: 'nao-existe',
      tripId: 'x' as never,
      expiresAt: '2026-01-01T00:00:00Z' as never,
      estimatedPayout: PAYOUT,
      pickup: PICKUP,
      destination: DESTINATION,
      categoryId: 'vuumbora',
    });
    assert.ok(result.ok);
  });
});

describe('tripPort.status', () => {
  test('tripId desconhecido: not_found', async () => {
    const mock = fresh();
    const result = await mock.tripPort.status('nao-existe' as never);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, 'not_found');
  });
});

describe('tripPort.cancel — a correção do S0, pelo lado do motorista', () => {
  test('motorista cancela em driver_assigned: VOLTA para searching_driver, não mata', async () => {
    const mock = fresh();
    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    await mock.offerPort.accept(offer, 'k1');
    const result = await mock.tripPort.cancel(offer.tripId, 'cancel-1');
    assert.ok(result.ok);
    const status = await mock.tripPort.status(offer.tripId);
    assert.ok(status.ok);
    if (status.ok) assert.equal(status.data.status, 'searching_driver');
  });

  test('corrida terminal: 409 conflict invalid_transition', async () => {
    const mock = fresh();
    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    await mock.tripPort.cancel(offer.tripId, 'cancel-1'); // searching_driver -> cancelled (sem motorista atribuído ainda)
    const result = await mock.tripPort.cancel(offer.tripId, 'cancel-2');
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.error, { kind: 'conflict', reason: 'invalid_transition' });
  });

  test('idempotencyKey repetida: a SEGUNDA chamada não recusa', async () => {
    const mock = fresh();
    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    await mock.offerPort.accept(offer, 'k1');
    const first = await mock.tripPort.cancel(offer.tripId, 'mesma-chave');
    const second = await mock.tripPort.cancel(offer.tripId, 'mesma-chave');
    assert.ok(first.ok);
    assert.ok(second.ok);
  });
});

describe('store compartilhada — os dois lados vendo a MESMA corrida', () => {
  test('passageiro pede, motorista aceita, motorista cancela: o passageiro vê voltar para a busca', async () => {
    const store = createTripStore(() => 0);
    const passenger = createMockPassengerRidePort({ store, clock: () => 0 });
    const driver = createMockDriverRidePort({ store, clock: () => 0 });

    const quoteResult = await passenger.port.quote({ origin: PICKUP, destination: DESTINATION });
    assert.ok(quoteResult.ok);
    if (!quoteResult.ok) return;
    const quote = quoteResult.data as Quote;
    const requestResult = await passenger.port.request(
      { quoteId: quote.quoteId, categoryId: 'vuumbora', paymentMethodId: 'pm_1' },
      'req-1',
    );
    assert.ok(requestResult.ok);
    if (!requestResult.ok) return;
    const { tripId } = requestResult.data;

    const events: string[] = [];
    passenger.port.subscribe(tripId, (event) => {
      if (event.type === 'status') events.push(event.status);
    });

    const offer = driver.control.offer({ tripId, pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    const accepted = await driver.offerPort.accept(offer, 'accept-1');
    assert.ok(accepted.ok);

    const cancelled = await driver.tripPort.cancel(tripId, 'cancel-1');
    assert.ok(cancelled.ok);

    const passengerView = await passenger.port.status(tripId);
    assert.ok(passengerView.ok);
    if (passengerView.ok) assert.equal(passengerView.data.status, 'searching_driver');
    assert.deepEqual(events, ['driver_assigned', 'searching_driver']);
  });
});
