/**
 * Regras puras da cotação (N8, N9), do CPF (`422 invalid_cpf`) e da polilinha da rota.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isValidCpf, normalizeCpf } from '../src/cpf';
import { decodePolyline, encodePolyline } from '../src/polyline';
import { isFareVersionQuotable, isQuoteExpired, QUOTE_TTL_SECONDS, quoteExpiresAtMs } from '../src/quote';

describe('cotação: validade de 5 minutos (N9)', () => {
  test('vence 300 s depois de emitida, e o próprio instante já é vencido', () => {
    assert.equal(QUOTE_TTL_SECONDS, 300);
    const issued = Date.parse('2026-11-27T12:00:00Z');
    const expiresAt = new Date(quoteExpiresAtMs(issued)).toISOString();
    assert.equal(expiresAt, '2026-11-27T12:05:00.000Z');
    assert.equal(isQuoteExpired(expiresAt, issued + 299_999), false);
    assert.equal(isQuoteExpired(expiresAt, issued + 300_000), true);
  });

  test('data ilegível conta como vencida (falha fechada)', () => {
    assert.equal(isQuoteExpired('amanhã', 0), true);
  });
});

describe('tarifa de teste (N8)', () => {
  test('versão real cota sempre; de teste só com allowTestFares', () => {
    assert.equal(isFareVersionQuotable({ isTest: false }, { allowTestFares: false }), true);
    assert.equal(isFareVersionQuotable({ isTest: true }, { allowTestFares: true }), true);
    assert.equal(isFareVersionQuotable({ isTest: true }, { allowTestFares: false }), false);
  });
});

describe('CPF', () => {
  test('aceita CPF válido com e sem máscara', () => {
    assert.equal(isValidCpf('529.982.247-25'), true);
    assert.equal(isValidCpf('52998224725'), true);
    assert.equal(isValidCpf('111.444.777-35'), true);
    assert.equal(normalizeCpf('529.982.247-25'), '52998224725');
  });

  test('recusa dígito verificador errado, tamanho errado, repetidos e letras', () => {
    assert.equal(isValidCpf('529.982.247-24'), false, 'segundo dígito');
    assert.equal(isValidCpf('529.982.247-15'), false, 'primeiro dígito');
    assert.equal(isValidCpf('5299822472'), false);
    assert.equal(isValidCpf('111.111.111-11'), false);
    assert.equal(isValidCpf('529a982b247c25'), false);
    assert.equal(isValidCpf(52998224725), false, 'número não é texto');
    assert.equal(isValidCpf(undefined), false);
  });
});

describe('polilinha (precisão 5)', () => {
  test('vetor de referência do algoritmo', () => {
    const points = [
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ];
    assert.equal(encodePolyline(points), '_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), points);
  });

  test('ida e volta com pontos de Natal; vazia é lista vazia', () => {
    const points = [
      { latitude: -5.83412, longitude: -35.21123 },
      { latitude: -5.88701, longitude: -35.17099 },
    ];
    assert.deepEqual(decodePolyline(encodePolyline(points)), points);
    assert.deepEqual(decodePolyline(''), []);
  });

  test('texto truncado ou fora do alfabeto lança', () => {
    assert.throws(() => decodePolyline('_p~iF~ps|U_'), RangeError);
    assert.throws(() => decodePolyline(' '), RangeError);
    assert.throws(() => encodePolyline([{ latitude: Number.NaN, longitude: 0 }]), RangeError);
  });
});
