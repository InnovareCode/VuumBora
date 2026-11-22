/**
 * `toApproximatePlace` — achado R5 da reconferência da Nova
 * (`docs/contratos/conferencia-f08-nova.md`): sem bairro cadastrado, o valor de reserva é um texto
 * NEUTRO, nunca `place.label` nem `place.address` (um `Place` sem bairro, cujo `label` É o próprio
 * endereço, não pode deixar esse endereço vazar na oferta).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { toApproximatePlace } from '../src/geo';
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
