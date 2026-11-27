/**
 * Código de embarque (plano D-12; decisão do dono em 22/11/2026: PIN em todas as categorias) — o
 * formato que o `start` do motorista aceita e as fases em que o passageiro vê o código.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isPickupCodeFormat, isPickupCodeVisible, PICKUP_CODE_LENGTH, PICKUP_CODE_VISIBLE_STATUSES } from '../src/pickup-code';
import { TRIP_TRANSITIONS } from '../src/trip-lifecycle';
import type { TripStatus } from '../src/index';

describe('isPickupCodeFormat — 4 algarismos ASCII, como texto', () => {
  test('aceita exatamente 4 algarismos, inclusive com zero à esquerda', () => {
    assert.equal(PICKUP_CODE_LENGTH, 4);
    for (const code of ['0000', '0482', '1234', '9999']) assert.equal(isPickupCodeFormat(code), true, code);
  });

  test('recusa tamanho errado, letra, espaço, sinal, algarismo não ASCII e o que não é texto', () => {
    const invalid: unknown[] = [
      '',
      '123',
      '12345',
      'abcd',
      '12a4',
      ' 1234',
      '1234 ',
      '12 34',
      '-123',
      '+123',
      '1.23',
      '１２３４', // algarismos de largura cheia
      '١٢٣٤', // algarismos arábico-índicos
      '1234\n',
      1234,
      482,
      null,
      undefined,
      ['1234'],
      { code: '1234' },
    ];
    for (const value of invalid) assert.equal(isPickupCodeFormat(value), false, JSON.stringify(value));
  });
});

describe('isPickupCodeVisible — o passageiro só vê o código com motorista atribuído, a caminho ou no local', () => {
  test('visível só em driver_assigned, driver_en_route e driver_arrived', () => {
    const all = Object.keys(TRIP_TRANSITIONS) as TripStatus[];
    const visible = all.filter(isPickupCodeVisible).sort();
    assert.deepEqual(visible, ['driver_arrived', 'driver_assigned', 'driver_en_route']);
    assert.deepEqual([...PICKUP_CODE_VISIBLE_STATUSES].sort(), visible);
  });

  test('some em in_progress e em toda fase terminal (minimização)', () => {
    for (const status of ['requested', 'searching_driver', 'in_progress', 'completed', 'cancelled', 'failed'] as const) {
      assert.equal(isPickupCodeVisible(status), false, status);
    }
  });
});
