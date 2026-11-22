/**
 * `createMockDriverRidePort` — disponibilidade (C3), oferta/aceite atômico (C2), corrida depois
 * do aceite (C1) e posição (C4), nos erros do contrato (`offer_taken`, `offer_expired`,
 * `invalid_transition`, `idempotency_key_reused`, `driver_not_approved`, `not_eligible`,
 * `not_found`). Cobre os achados A1, A3 e A4 da conferência da Nova
 * (`docs/contratos/conferencia-f08-nova.md`) e a privacidade do embarque E do destino (decisão do
 * dono, 22/11/2026): a oferta nunca leva o endereço nem o ponto exato de nenhum dos dois.
 *
 * Cobre também os achados R1–R7 da RECONFERÊNCIA da Nova (mesmo documento, seção "Reconferência"):
 * R1 (motorista atribuído recebe o cancelamento do passageiro), R2 (resumo do motorista nunca
 * "vaza" para o motorista seguinte — em `passenger-ride-mock.test.ts`), R3 (ordem 404→409→400→429
 * em `start`), R4 (quem aceita não recebe `offer.revoked` da própria oferta), R5 (embarque sem
 * bairro cai em texto neutro, não no endereço), R6 (idempotência do cancelamento — em
 * `passenger-ride-mock.test.ts`) e R7 (ficar offline sempre funciona).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { TripId } from '@vuumbora/domain';
import { createMockDriverRidePort } from '../src/driver/mock-adapter';
import { createMockPassengerRidePort } from '../src/passenger/mock-adapter';
import { createTripStore } from '../src/trip/mock-store';
import type { Quote } from '../src/passenger/types';
import type { OfferEvent } from '../src/driver/types';

const PICKUP = { label: 'Casa', address: 'Rua A, 1', point: { latitude: -5.791234, longitude: -35.211234 }, neighborhood: 'Tirol' };
const DESTINATION = { label: 'Trabalho', address: 'Rua B, 2', point: { latitude: -5.800987, longitude: -35.200654 }, neighborhood: 'Lagoa Nova' };
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

describe('control.offer — embarque E destino só o bairro (decisão do dono, 22/11/2026)', () => {
  test('RideOffer leva bairro, distância e ETA do embarque E do destino — nunca o endereço nem o ponto exato de nenhum dos dois', () => {
    const mock = fresh();
    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    assert.equal(offer.pickup.neighborhood, 'Tirol');
    assert.notDeepEqual(offer.pickup.approximatePoint, PICKUP.point, 'o ponto do embarque é arredondado, não o exato');
    assert.ok(!('address' in offer.pickup), 'RideOffer.pickup não tem endereço — só ApproximatePlace');
    assert.ok(!('label' in offer.pickup));
    // Complemento de 22/11/2026: o destino também é só o bairro na oferta.
    assert.equal(offer.destination.neighborhood, 'Lagoa Nova');
    assert.notDeepEqual(offer.destination.approximatePoint, DESTINATION.point, 'o ponto do destino também é arredondado, não o exato');
    assert.ok(!('address' in offer.destination));
    assert.ok(!('label' in offer.destination));
    assert.equal(typeof offer.pickupDistanceM, 'number');
    assert.equal(typeof offer.pickupEtaS, 'number');
    const snapshot = mock.control.snapshot(offer.tripId);
    assert.equal(snapshot, undefined, 'antes do aceite, nem este motorista vê o DriverTripSnapshot (A3)');
  });

  test('pickupDistanceM arredonda a 100 m e pickupEtaS a 1 min (recomendação da Nova na reconferência)', () => {
    const mock = fresh();
    const offer = mock.control.offer({
      pickup: PICKUP,
      destination: DESTINATION,
      categoryId: 'vuumbora',
      estimatedPayout: PAYOUT,
      pickupDistanceM: 1234,
      pickupEtaS: 125,
    });
    assert.equal(offer.pickupDistanceM, 1200);
    assert.equal(offer.pickupEtaS, 120);
  });

  test('11) R5: embarque sem bairro cadastrado cai no texto NEUTRO — nunca no label nem no endereço', () => {
    const mock = fresh();
    const pickupSemBairro = { label: 'Rua das Flores, 123', address: 'Rua das Flores, 123', point: { latitude: -5.79, longitude: -35.21 } };
    const offer = mock.control.offer({ pickup: pickupSemBairro, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    assert.notEqual(offer.pickup.neighborhood, pickupSemBairro.label);
    assert.notEqual(offer.pickup.neighborhood, pickupSemBairro.address);
    assert.equal(offer.pickup.neighborhood, 'Bairro não informado');
  });
});

describe('accept', () => {
  test('aceite atômico: vai para driver_assigned e, automaticamente (sistema), para driver_en_route (C1)', async () => {
    const mock = fresh();
    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    const result = await mock.offerPort.accept(offer, 'k1');
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.data.tripId, offer.tripId);
    const status = await mock.tripPort.status(offer.tripId);
    assert.ok(status.ok);
    if (status.ok) {
      assert.equal(status.data.status, 'driver_en_route');
      assert.equal(status.data.pickup, PICKUP); // DriverTripSnapshot: endereço EXATO, só pro atribuído
      assert.equal(status.data.destination, DESTINATION);
    }
  });

  test('offerId desconhecido: not_found', async () => {
    const mock = fresh();
    const result = await mock.offerPort.accept(
      {
        offerId: 'nao-existe',
        tripId: 'x' as never,
        expiresAt: '2026-01-01T00:00:00Z' as never,
        estimatedPayout: PAYOUT,
        pickup: { neighborhood: 'Tirol', approximatePoint: { latitude: -5.79, longitude: -35.21 } },
        pickupDistanceM: 500,
        pickupEtaS: 120,
        destination: { neighborhood: 'Lagoa Nova', approximatePoint: { latitude: -5.8, longitude: -35.2 } },
        categoryId: 'vuumbora',
      },
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

  test('A4: idempotencyKey repetida com o MESMO corpo devolve o MESMO resultado', async () => {
    const mock = fresh();
    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    const first = await mock.offerPort.accept(offer, 'mesma-chave');
    const second = await mock.offerPort.accept(offer, 'mesma-chave');
    assert.ok(first.ok && second.ok);
    if (first.ok && second.ok) assert.deepEqual(first.data, second.data);
  });

  test('A4: idempotencyKey repetida para OUTRA oferta é 409 idempotency_key_reused', async () => {
    const mock = fresh();
    const offerA = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    const offerB = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'conforto', estimatedPayout: PAYOUT });
    const first = await mock.offerPort.accept(offerA, 'mesma-chave');
    assert.ok(first.ok);
    const second = await mock.offerPort.accept(offerB, 'mesma-chave');
    assert.equal(second.ok, false);
    if (!second.ok) assert.deepEqual(second.error, { kind: 'conflict', reason: 'idempotency_key_reused' });
  });
});

describe('decline', () => {
  test('é idempotente: oferta desconhecida também devolve sucesso, com motivo opcional', async () => {
    const mock = fresh();
    const result = await mock.offerPort.decline(
      {
        offerId: 'nao-existe',
        tripId: 'x' as never,
        expiresAt: '2026-01-01T00:00:00Z' as never,
        estimatedPayout: PAYOUT,
        pickup: { neighborhood: 'Tirol', approximatePoint: { latitude: -5.79, longitude: -35.21 } },
        pickupDistanceM: 500,
        pickupEtaS: 120,
        destination: { neighborhood: 'Lagoa Nova', approximatePoint: { latitude: -5.8, longitude: -35.2 } },
        categoryId: 'vuumbora',
      },
      { reason: 'too_far' },
    );
    assert.ok(result.ok);
  });
});

describe('subscribeOffers (C2)', () => {
  test('control.offer emite offer.created; takeOffer/expireOffer emitem offer.revoked', () => {
    const mock = fresh();
    const events: OfferEvent[] = [];
    mock.offerPort.subscribeOffers((event) => events.push(event));

    const offerA = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    mock.control.takeOffer(offerA.offerId);
    const offerB = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'conforto', estimatedPayout: PAYOUT });
    mock.control.expireOffer(offerB.offerId);

    assert.deepEqual(
      events.map((e) => e.type),
      ['offer.created', 'offer.revoked', 'offer.created', 'offer.revoked'],
    );
    assert.equal((events[1] as { reason: string }).reason, 'taken');
    assert.equal((events[3] as { reason: string }).reason, 'expired');
  });

  test('C2: o cancelamento do PASSAGEIRO revoga a oferta pendente (reason: "cancelled")', async () => {
    const store = createTripStore(() => 0);
    const passenger = createMockPassengerRidePort({ store, clock: () => 0 });
    const driver = createMockDriverRidePort({ store, clock: () => 0 });

    const quoteResult = await passenger.port.quote({ origin: PICKUP, destination: DESTINATION });
    assert.ok(quoteResult.ok);
    if (!quoteResult.ok) return;
    const category = (quoteResult.data as Quote).categories[0];
    assert.ok(category);
    const requested = await passenger.port.request({ quoteId: category!.quoteId, paymentMethodId: 'pm' }, 'req-1');
    assert.ok(requested.ok);
    if (!requested.ok) return;
    passenger.control.advance(requested.data.tripId, 'searching_driver');

    const events: OfferEvent[] = [];
    driver.offerPort.subscribeOffers((event) => events.push(event));
    driver.control.offer({ tripId: requested.data.tripId, pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });

    await passenger.port.cancel(requested.data.tripId, {}, 'cancel-1');

    assert.deepEqual(
      events.map((e) => e.type),
      ['offer.created', 'offer.revoked'],
    );
    assert.equal((events[1] as { reason: string }).reason, 'cancelled');
  });

  test('7) R4: quem aceita a própria oferta NÃO recebe o offer.revoked dela', async () => {
    const mock = fresh();
    const events: OfferEvent[] = [];
    mock.offerPort.subscribeOffers((event) => events.push(event));

    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    const result = await mock.offerPort.accept(offer, 'acc-7');
    assert.ok(result.ok);

    // A passagem automática driver_assigned -> driver_en_route (sistema, C1) não pode ser lida pelo
    // vigia da própria oferta como "a corrida saiu de driver_assigned" e revogar o que acabou de aceitar.
    assert.deepEqual(events.map((e) => e.type), ['offer.created']);
  });
});

describe('tripPort — A3: só o motorista ATRIBUÍDO vê a corrida', () => {
  test('status de corrida nunca aceita (nem oferecida) é not_found', async () => {
    const mock = fresh();
    const result = await mock.tripPort.status('nao-existe' as TripId);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, 'not_found');
  });

  test('motorista que RECUSOU a oferta nunca recebe o endereço exato: status 404 depois da recusa', async () => {
    const mock = fresh();
    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    await mock.offerPort.decline(offer);
    const status = await mock.tripPort.status(offer.tripId);
    assert.equal(status.ok, false);
    if (!status.ok) assert.equal(status.error.kind, 'not_found');
  });

  test('motorista que PERDEU a oferta (outro venceu) nunca recebe o endereço exato: status 404', async () => {
    const mock = fresh();
    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    mock.control.takeOffer(offer.offerId);
    const status = await mock.tripPort.status(offer.tripId);
    assert.equal(status.ok, false);
    if (!status.ok) assert.equal(status.error.kind, 'not_found');
  });
});

describe('C1 — ações do motorista depois do aceite', () => {
  async function accepted() {
    const mock = fresh();
    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    const result = await mock.offerPort.accept(offer, 'acc-1');
    assert.ok(result.ok);
    return { mock, tripId: offer.tripId };
  }

  test('arrived: driver_en_route -> driver_arrived', async () => {
    const { mock, tripId } = await accepted();
    const result = await mock.tripPort.arrived(tripId, 'k1');
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.data.status, 'driver_arrived');
  });

  test('start: driver_arrived -> in_progress; sem código configurado, qualquer valor passa (D-12 em aberto)', async () => {
    const { mock, tripId } = await accepted();
    await mock.tripPort.arrived(tripId, 'k1');
    const result = await mock.tripPort.start(tripId, {}, 'k2');
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.data.status, 'in_progress');
  });

  test('start: código de embarque configurado — errado é 400 validation, 6ª tentativa é 429', async () => {
    const { mock, tripId } = await accepted();
    await mock.tripPort.arrived(tripId, 'k1');
    mock.control.setPickupCode(tripId, '1234');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await mock.tripPort.start(tripId, { pickupCode: '0000' }, `wrong-${attempt}`);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.kind, attempt < 5 ? 'validation' : 'rate_limited');
    }
    const sixth = await mock.tripPort.start(tripId, { pickupCode: '0000' }, 'wrong-5');
    assert.equal(sixth.ok, false);
    if (!sixth.ok) assert.equal(sixth.error.kind, 'rate_limited');
  });

  test('start: código certo depois de configurado funciona', async () => {
    const { mock, tripId } = await accepted();
    await mock.tripPort.arrived(tripId, 'k1');
    mock.control.setPickupCode(tripId, '1234');
    const result = await mock.tripPort.start(tripId, { pickupCode: '1234' }, 'k2');
    assert.ok(result.ok);
  });

  test('complete: in_progress -> completed', async () => {
    const { mock, tripId } = await accepted();
    await mock.tripPort.arrived(tripId, 'k1');
    await mock.tripPort.start(tripId, {}, 'k2');
    const result = await mock.tripPort.complete(tripId, {}, 'k3');
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.data.status, 'completed');
  });

  test('ação em transição inválida: 409 conflict invalid_transition', async () => {
    const { mock, tripId } = await accepted();
    const result = await mock.tripPort.complete(tripId, {}, 'k1'); // ainda em driver_en_route
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.error, { kind: 'conflict', reason: 'invalid_transition' });
  });

  test('A4: idempotencyKey repetida com corpo diferente em "start" é 409 idempotency_key_reused', async () => {
    const { mock, tripId } = await accepted();
    await mock.tripPort.arrived(tripId, 'k1');
    const first = await mock.tripPort.start(tripId, {}, 'mesma-chave');
    assert.ok(first.ok);
    const second = await mock.tripPort.start(tripId, { pickupCode: 'outro' }, 'mesma-chave');
    assert.equal(second.ok, false);
    if (!second.ok) assert.deepEqual(second.error, { kind: 'conflict', reason: 'idempotency_key_reused' });
  });

  test('9) R3: código errado ANTES de chegar (ainda driver_en_route) é 409 invalid_transition, não 400', async () => {
    const { mock, tripId } = await accepted(); // driver_en_route — ainda não chegou
    mock.control.setPickupCode(tripId, '1234');
    const result = await mock.tripPort.start(tripId, { pickupCode: '0000' }, 'k1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.error, { kind: 'conflict', reason: 'invalid_transition' });
  });

  test('9c/9d) R3: motorista NÃO atribuído em "start" é sempre 404 — e não gasta as tentativas do atribuído', async () => {
    const store = createTripStore(() => 0);
    const passenger = createMockPassengerRidePort({ store, clock: () => 0 });
    const drvA = createMockDriverRidePort({ store, clock: () => 0, driverId: 'A' });
    const drvB = createMockDriverRidePort({ store, clock: () => 0, driverId: 'B' });

    const quote = await passenger.port.quote({ origin: PICKUP, destination: DESTINATION });
    assert.ok(quote.ok);
    if (!quote.ok) return;
    const category = (quote.data as Quote).categories[0];
    const requested = await passenger.port.request({ quoteId: category!.quoteId, paymentMethodId: 'pm' }, 'req-9');
    assert.ok(requested.ok);
    if (!requested.ok) return;
    const tripId = requested.data.tripId;
    passenger.control.advance(tripId, 'searching_driver');

    const offer = drvA.control.offer({ tripId, pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    await drvA.offerPort.accept(offer, 'acc-9');
    await drvA.tripPort.arrived(tripId, 'arr-9');
    drvA.control.setPickupCode(tripId, '1234');

    // B nunca foi atribuído a esta corrida — tenta repetidamente, mais vezes do que o limite de A.
    for (let i = 0; i < 10; i += 1) {
      const attempt = await drvB.tripPort.start(tripId, { pickupCode: '0000' }, `b-attempt-${i}`);
      assert.equal(attempt.ok, false);
      if (!attempt.ok) assert.equal(attempt.error.kind, 'not_found', `tentativa ${i} de B deveria ser 404, nunca contar como tentativa da corrida`);
    }

    // A, o atribuído, ainda usa o código certo normalmente — nenhuma tentativa de B foi contada contra ele.
    const result = await drvA.tripPort.start(tripId, { pickupCode: '1234' }, 'a-attempt-ok');
    assert.ok(result.ok, 'R3: tentativas de quem não é atribuído não gastam as tentativas do atribuído');
  });
});

describe('tripPort.cancel — a correção do S0 e o achado A1, pelo lado do motorista', () => {
  test('motorista cancela em driver_en_route: VOLTA para searching_driver, não mata', async () => {
    const mock = fresh();
    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    await mock.offerPort.accept(offer, 'k1');
    const result = await mock.tripPort.cancel(offer.tripId, { reason: 'other' }, 'cancel-1');
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.data.status, 'searching_driver');
  });

  test('motorista cancela em driver_arrived: mata a corrida', async () => {
    const mock = fresh();
    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    await mock.offerPort.accept(offer, 'k1');
    await mock.tripPort.arrived(offer.tripId, 'k2');
    const result = await mock.tripPort.cancel(offer.tripId, {}, 'cancel-1');
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.data.status, 'cancelled');
  });

  test('A1: motorista que NUNCA foi atribuído não cancela (não é dele) — not_found, não "mata o pedido"', async () => {
    const mock = fresh();
    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    // nunca aceitou — corrida ainda em searching_driver, não atribuída a ESTE motorista
    const result = await mock.tripPort.cancel(offer.tripId, {}, 'cancel-1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, 'not_found');
  });

  test('idempotencyKey repetida com o MESMO corpo não recusa por já estar em busca', async () => {
    const mock = fresh();
    const offer = mock.control.offer({ pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    await mock.offerPort.accept(offer, 'k1');
    const first = await mock.tripPort.cancel(offer.tripId, {}, 'mesma-chave');
    assert.ok(first.ok);
    // depois do 1º cancelamento este motorista não é mais o atribuído, mas a MESMA chave é servida do cache:
    const second = await mock.tripPort.cancel(offer.tripId, {}, 'mesma-chave');
    assert.ok(second.ok);
    assert.deepEqual(first, second);
  });
});

describe('journeyPort (C3)', () => {
  test('setAvailability(online) exige posição: sem point é 400 validation', async () => {
    const mock = fresh();
    const result = await mock.journeyPort.setAvailability({ online: true });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, 'validation');
  });

  test('conta não aprovada: 409 conflict driver_not_approved', async () => {
    const mock = createMockDriverRidePort({ verificationStatus: 'pending' });
    const result = await mock.journeyPort.setAvailability({ online: true, point: { latitude: -5.79, longitude: -35.2 } });
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.error, { kind: 'conflict', reason: 'driver_not_approved' });
  });

  test('documento vencido: 409 conflict not_eligible', async () => {
    const mock = createMockDriverRidePort({ documentExpired: true });
    const result = await mock.journeyPort.setAvailability({ online: true, point: { latitude: -5.79, longitude: -35.2 } });
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.error, { kind: 'conflict', reason: 'not_eligible' });
  });

  test('aprovado, com documento em dia e posição: liga e desliga', async () => {
    const mock = fresh();
    const on = await mock.journeyPort.setAvailability({ online: true, point: { latitude: -5.79, longitude: -35.2 } });
    assert.ok(on.ok);
    if (on.ok) assert.equal(on.data.phase, 'online');
    const off = await mock.journeyPort.setAvailability({ online: false });
    assert.ok(off.ok);
    if (off.ok) assert.equal(off.data.phase, 'offline');
  });

  test('verification() reflete o que control.setVerificationStatus configurou', async () => {
    const mock = fresh();
    mock.control.setVerificationStatus('rejected');
    const result = await mock.journeyPort.verification();
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.data.status, 'rejected');
  });

  test('10) R7: documento vencido ou conta não aprovada ainda consegue ficar OFFLINE', async () => {
    const expired = createMockDriverRidePort({ documentExpired: true });
    const off1 = await expired.journeyPort.setAvailability({ online: false });
    assert.ok(off1.ok);
    if (off1.ok) assert.equal(off1.data.phase, 'offline');

    const pending = createMockDriverRidePort({ verificationStatus: 'pending' });
    const off2 = await pending.journeyPort.setAvailability({ online: false });
    assert.ok(off2.ok);
    if (off2.ok) assert.equal(off2.data.phase, 'offline');
  });
});

describe('locationPort (C4)', () => {
  test('sendLocations: o mock só guarda as posições', async () => {
    const mock = fresh();
    const fixes = [
      { point: { latitude: -5.79, longitude: -35.2 }, at: '2026-11-22T12:00:00Z', mocked: false },
      { point: { latitude: -5.791, longitude: -35.201 }, heading: 90, speedMps: 8, at: '2026-11-22T12:00:05Z', mocked: false },
    ];
    const result = await mock.locationPort.sendLocations(fixes);
    assert.ok(result.ok);
    assert.deepEqual(mock.control.receivedLocations(), fixes);
  });
});

describe('cenários da sonda da Nova (permanentes) — store compartilhada, dois motoristas', () => {
  test('1) passageiro depois da volta à busca: sem motorista, status searching_driver', async () => {
    const store = createTripStore(() => 0);
    const passenger = createMockPassengerRidePort({ store, clock: () => 0 });
    const drvA = createMockDriverRidePort({ store, clock: () => 0, driverId: 'A' });

    const quote = await passenger.port.quote({ origin: PICKUP, destination: DESTINATION });
    assert.ok(quote.ok);
    if (!quote.ok) return;
    const category = (quote.data as Quote).categories[0];
    assert.ok(category);
    const requested = await passenger.port.request({ quoteId: category!.quoteId, paymentMethodId: 'pm' }, 'req-1');
    assert.ok(requested.ok);
    if (!requested.ok) return;
    const tripId = requested.data.tripId;
    passenger.control.advance(tripId, 'searching_driver');

    const offerA = drvA.control.offer({ tripId, pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    await drvA.offerPort.accept(offerA, 'acc-A');
    await drvA.tripPort.cancel(tripId, {}, 'cancel-A-1');

    const passengerView = await passenger.port.status(tripId);
    assert.ok(passengerView.ok);
    if (passengerView.ok) {
      assert.equal(passengerView.data.status, 'searching_driver');
      assert.equal(passengerView.data.driver, undefined);
    }
  });

  test('1b) R2: o MESMO cenário, sem consultar status() durante a busca — B aceita e o passageiro nunca vê o resumo de A', async () => {
    const store = createTripStore(() => 0);
    const passenger = createMockPassengerRidePort({ store, clock: () => 0 });
    const drvA = createMockDriverRidePort({ store, clock: () => 0, driverId: 'A' });
    const drvB = createMockDriverRidePort({ store, clock: () => 0, driverId: 'B' });

    const quote = await passenger.port.quote({ origin: PICKUP, destination: DESTINATION });
    assert.ok(quote.ok);
    if (!quote.ok) return;
    const category = (quote.data as Quote).categories[0];
    const requested = await passenger.port.request({ quoteId: category!.quoteId, paymentMethodId: 'pm' }, 'req-1b');
    assert.ok(requested.ok);
    if (!requested.ok) return;
    const tripId = requested.data.tripId;
    passenger.control.advance(tripId, 'searching_driver');

    const offerA = drvA.control.offer({ tripId, pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    await drvA.offerPort.accept(offerA, 'acc-A');
    passenger.control.setDriverSummary(tripId, { driverId: 'A', firstName: 'Ana', plate: 'AAA1A11' });

    await drvA.tripPort.cancel(tripId, {}, 'cancel-A-1'); // A sai; volta pra busca — SEM ninguém chamar status() aqui

    const offerB = drvB.control.offer({ tripId, pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    await drvB.offerPort.accept(offerB, 'acc-B'); // B assume, sem passenger.port.status() ter sido chamado no meio

    const passengerView = await passenger.port.status(tripId);
    assert.ok(passengerView.ok);
    if (passengerView.ok) {
      assert.equal(passengerView.data.status, 'driver_en_route');
      assert.notEqual(passengerView.data.driver?.driverId, 'A', 'R2: nunca o resumo do motorista ANTIGO, mesmo sem leitura no meio');
    }
  });

  test('2) motorista antigo assinado consultando a corrida que já não é dele: 404, e nenhum evento novo chega', async () => {
    const store = createTripStore(() => 0);
    const passenger = createMockPassengerRidePort({ store, clock: () => 0 });
    const drvA = createMockDriverRidePort({ store, clock: () => 0, driverId: 'A' });
    const drvB = createMockDriverRidePort({ store, clock: () => 0, driverId: 'B' });

    const quote = await passenger.port.quote({ origin: PICKUP, destination: DESTINATION });
    assert.ok(quote.ok);
    if (!quote.ok) return;
    const category = (quote.data as Quote).categories[0];
    const requested = await passenger.port.request({ quoteId: category!.quoteId, paymentMethodId: 'pm' }, 'req-1');
    assert.ok(requested.ok);
    if (!requested.ok) return;
    const tripId = requested.data.tripId;
    passenger.control.advance(tripId, 'searching_driver');

    const offerA = drvA.control.offer({ tripId, pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    await drvA.offerPort.accept(offerA, 'acc-A');

    const eventsSeenByA: unknown[] = [];
    drvA.tripPort.subscribe(tripId, (e) => eventsSeenByA.push(e));
    const eventsBeforeCancel = eventsSeenByA.length;

    await drvA.tripPort.cancel(tripId, {}, 'cancel-A-1'); // A sai; volta pra busca

    const offerB = drvB.control.offer({ tripId, pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    await drvB.offerPort.accept(offerB, 'acc-B'); // B assume

    assert.equal(eventsSeenByA.length, eventsBeforeCancel, 'A não recebe mais nada depois de cancelar (A3)');
    const aQueryingNow = await drvA.tripPort.status(tripId);
    assert.equal(aQueryingNow.ok, false);
    if (!aQueryingNow.ok) assert.equal(aQueryingNow.error.kind, 'not_found');

    const bView = await drvB.tripPort.status(tripId);
    assert.ok(bView.ok);
    if (bView.ok) assert.equal(bView.data.status, 'driver_en_route');
  });

  test('3) motorista que já saiu cancela de novo, com chave NOVA: not_found — não mata o pedido do passageiro (A1)', async () => {
    const store = createTripStore(() => 0);
    const passenger = createMockPassengerRidePort({ store, clock: () => 0 });
    const drv = createMockDriverRidePort({ store, clock: () => 0, driverId: 'A' });

    const quote = await passenger.port.quote({ origin: PICKUP, destination: DESTINATION });
    assert.ok(quote.ok);
    if (!quote.ok) return;
    const category = (quote.data as Quote).categories[0];
    const requested = await passenger.port.request({ quoteId: category!.quoteId, paymentMethodId: 'pm' }, 'req-1');
    assert.ok(requested.ok);
    if (!requested.ok) return;
    const tripId = requested.data.tripId;
    passenger.control.advance(tripId, 'searching_driver');

    const offer = drv.control.offer({ tripId, pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    await drv.offerPort.accept(offer, 'acc-1');
    const first = await drv.tripPort.cancel(tripId, {}, 'c-1'); // volta para a busca
    assert.ok(first.ok);
    if (first.ok) assert.equal(first.data.status, 'searching_driver');

    const again = await drv.tripPort.cancel(tripId, {}, 'c-2'); // MESMO motorista, chave NOVA — não é mais dele
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.error.kind, 'not_found');

    const passengerView = await passenger.port.status(tripId);
    assert.ok(passengerView.ok);
    if (passengerView.ok) assert.equal(passengerView.data.status, 'searching_driver'); // continua buscando, não foi cancelada
  });

  test('4) mesma chave de idempotência, corpo diferente (cotação/categoria): 409 idempotency_key_reused', async () => {
    const passenger = createMockPassengerRidePort({ clock: () => 0 });
    const quote = await passenger.port.quote({ origin: PICKUP, destination: DESTINATION });
    assert.ok(quote.ok);
    if (!quote.ok) return;
    const [vuumbora, conforto] = (quote.data as Quote).categories;
    assert.ok(vuumbora && conforto);

    const first = await passenger.port.request({ quoteId: vuumbora!.quoteId, paymentMethodId: 'pm' }, 'req-2');
    assert.ok(first.ok);
    const second = await passenger.port.request({ quoteId: conforto!.quoteId, paymentMethodId: 'pm' }, 'req-2');
    assert.equal(second.ok, false);
    if (!second.ok) assert.deepEqual(second.error, { kind: 'conflict', reason: 'idempotency_key_reused' });
  });

  test('5) seq: sequência vista pelo passageiro com localização no meio, e o snapshot REST traz o seq', async () => {
    const store = createTripStore(() => 0);
    const passenger = createMockPassengerRidePort({ store, clock: () => 0 });
    const drv = createMockDriverRidePort({ store, clock: () => 0 });

    const quote = await passenger.port.quote({ origin: PICKUP, destination: DESTINATION });
    assert.ok(quote.ok);
    if (!quote.ok) return;
    const category = (quote.data as Quote).categories[0];
    const requested = await passenger.port.request({ quoteId: category!.quoteId, paymentMethodId: 'pm' }, 'req-4');
    assert.ok(requested.ok);
    if (!requested.ok) return;
    const tripId = requested.data.tripId;
    passenger.control.advance(tripId, 'searching_driver');

    const seqs: string[] = [];
    passenger.port.subscribe(tripId, (e) => seqs.push(`${e.type}:${e.seq}`));
    const offer = drv.control.offer({ tripId, pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    await drv.offerPort.accept(offer, 'acc-4'); // driver_assigned + driver_en_route (automático)
    passenger.control.emitLocation(tripId, { latitude: -5.79, longitude: -35.2 });
    passenger.control.emitLocation(tripId, { latitude: -5.79, longitude: -35.2 });

    const statusEntries = seqs.filter((s) => s.startsWith('status:')).map((s) => Number(s.split(':')[1]));
    const locationEntries = seqs.filter((s) => s.startsWith('location:')).map((s) => Number(s.split(':')[1]));
    assert.equal(new Set(locationEntries).size, 1, 'as duas localizações compartilham o MESMO seq do estado em vigor');
    assert.equal(locationEntries[0], statusEntries[statusEntries.length - 1]);

    const snapshot = await passenger.port.status(tripId);
    assert.ok(snapshot.ok);
    if (snapshot.ok) assert.equal(snapshot.data.seq, statusEntries[statusEntries.length - 1]);
  });

  test('6) R1: passageiro cancela com o motorista a caminho — o motorista atribuído recebe o cancelamento', async () => {
    const store = createTripStore(() => 0);
    const passenger = createMockPassengerRidePort({ store, clock: () => 0 });
    const drv = createMockDriverRidePort({ store, clock: () => 0, driverId: 'A' });

    const quote = await passenger.port.quote({ origin: PICKUP, destination: DESTINATION });
    assert.ok(quote.ok);
    if (!quote.ok) return;
    const category = (quote.data as Quote).categories[0];
    const requested = await passenger.port.request({ quoteId: category!.quoteId, paymentMethodId: 'pm' }, 'req-6');
    assert.ok(requested.ok);
    if (!requested.ok) return;
    const tripId = requested.data.tripId;
    passenger.control.advance(tripId, 'searching_driver');

    const offer = drv.control.offer({ tripId, pickup: PICKUP, destination: DESTINATION, categoryId: 'vuumbora', estimatedPayout: PAYOUT });
    await drv.offerPort.accept(offer, 'acc-6'); // driver_assigned + driver_en_route (automático)

    const events: unknown[] = [];
    drv.tripPort.subscribe(tripId, (e) => events.push(e));
    const eventsBeforeCancel = events.length;

    await passenger.port.cancel(tripId, {}, 'cancel-6');

    assert.equal(events.length, eventsBeforeCancel + 1, 'R1: o motorista atribuído recebe o evento do cancelamento feito pelo passageiro');
    const lastEvent = events[events.length - 1] as { type: string; status?: string };
    assert.equal(lastEvent.type, 'status');
    assert.equal(lastEvent.status, 'cancelled');

    const driverView = await drv.tripPort.status(tripId);
    assert.ok(driverView.ok, 'R1: status() do motorista atribuído não vira 404 depois do cancelamento do passageiro');
    if (driverView.ok) assert.equal(driverView.data.status, 'cancelled');
  });
});
