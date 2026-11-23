/**
 * `toApproximatePlace` — achado R5 da reconferência da Nova
 * (`docs/contratos/conferencia-f08-nova.md`): sem bairro cadastrado, o valor de reserva é um texto
 * NEUTRO, nunca `place.label` nem `place.address` (um `Place` sem bairro, cujo `label` É o próprio
 * endereço, não pode deixar esse endereço vazar na oferta).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { toApproximatePlace, toTripRange } from '../src/geo';
import type { Place } from '../src/index';

describe('toApproximatePlace', () => {
  test('bairro presente: usa o bairro, ponto arredondado a 2 casas', () => {
    const place: Place = {
      label: 'Casa',
      address: 'Rua das Flores, 123',
      point: { latitude: -5.791234, longitude: -35.211234 },
      neighborhood: 'Tirol',
    };
    const approx = toApproximatePlace(place);
    assert.equal(approx.neighborhood, 'Tirol');
    assert.deepEqual(approx.approximatePoint, { latitude: -5.79, longitude: -35.21 });
    assert.notDeepEqual(approx.approximatePoint, place.point);
  });

  test('R5: sem bairro, nunca cai no label nem no endereço — texto neutro', () => {
    const place: Place = {
      label: 'Rua das Flores, 123', // mock/fixture sem bairro: o label É o endereço
      address: 'Rua das Flores, 123',
      point: { latitude: -5.79, longitude: -35.21 },
    };
    const approx = toApproximatePlace(place);
    assert.notEqual(approx.neighborhood, place.label);
    assert.notEqual(approx.neighborhood, place.address);
    assert.equal(approx.neighborhood, 'Bairro não informado');
  });
});

describe('toTripRange (PP-12)', () => {
  test('nunca devolve o valor exato: cada faixa é um intervalo de 1 km / 5 min que o contém', () => {
    const range = toTripRange(5200, 900);
    assert.deepEqual(range.distanceM, { min: 5000, max: 6000 });
    assert.deepEqual(range.durationS, { min: 900, max: 1200 });
    assert.ok(range.distanceM.min <= 5200 && 5200 < range.distanceM.max);
    assert.ok(range.durationS.min <= 900 && 900 < range.durationS.max);
  });

  test('nunca fica negativo com valores pequenos', () => {
    const range = toTripRange(50, 10);
    assert.deepEqual(range.distanceM, { min: 0, max: 1000 });
    assert.deepEqual(range.durationS, { min: 0, max: 300 });
  });
});
