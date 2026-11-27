/**
 * `computeFare` — preço da cotação real (M4, fatia G2 do `docs/plano-m3-m4.md`, N9): conta sem arredondar,
 * arredonda UMA vez no total (meio para cima, no centavo) e só então aplica o mínimo da categoria.
 * Casos de borda pedidos: mínimo, meio centavo, km zero e multiplicador; e "mesma entrada, mesmo preço".
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { calculateFare, computeFare } from '../src/fare';
import type { FareRates } from '../src/fare';

/** Os números da tarifa de TESTE semeada pela 0026 (VuumBora). Não são proposta de preço. */
const TEST_RATES: FareRates = { baseCents: 400, perKmCents: 150, perMinuteCents: 25, minimumFareCents: 800 };

describe('computeFare', () => {
  test('corrida comum: base + km + minuto, sem mínimo', () => {
    // 400 + 150 × 8 + 25 × 20 = 400 + 1200 + 500 = 2100
    const result = computeFare(TEST_RATES, { distanceM: 8000, durationS: 1200 });
    assert.deepEqual(result, { totalCents: 2100, roundedCents: 2100, minimumApplied: false, dynamicMultiplier: 1 });
  });

  test('mínimo: trajeto curto cobra o mínimo da categoria e diz que o mínimo segurou', () => {
    // 400 + 150 × 0,5 + 25 × 2 = 525 < 800
    const result = computeFare(TEST_RATES, { distanceM: 500, durationS: 120 });
    assert.equal(result.roundedCents, 525);
    assert.equal(result.totalCents, 800);
    assert.equal(result.minimumApplied, true);
  });

  test('mínimo exatamente igual ao calculado NÃO conta como "mínimo aplicado"', () => {
    // 400 + 150 × 2 + 25 × 4 = 800
    const result = computeFare(TEST_RATES, { distanceM: 2000, durationS: 240 });
    assert.equal(result.totalCents, 800);
    assert.equal(result.minimumApplied, false);
  });

  test('meio centavo exato sobe (meio para cima)', () => {
    // 400 + 25 × 6/60 = 402,5 → 403
    const result = computeFare({ ...TEST_RATES, minimumFareCents: 0 }, { distanceM: 0, durationS: 6 });
    assert.equal(result.roundedCents, 403);
  });

  test('um centésimo abaixo do meio desce', () => {
    // 150 × 3/1000 = 0,45 → 400,45 → 400
    const result = computeFare({ ...TEST_RATES, minimumFareCents: 0 }, { distanceM: 3, durationS: 0 });
    assert.equal(result.roundedCents, 400);
  });

  test('arredonda UMA vez no total: frações de linhas diferentes se somam antes de arredondar', () => {
    // km: 150 × 1,336 = 200,4 · minuto: 25 × 61/60 = 25,41666… · total exato 625,81666… → 626.
    // Arredondando por linha (calculateFare, o simulador antigo) daria 400 + 200 + 25 = 625.
    const input = { distanceM: 1336, durationS: 61 };
    const rates = { ...TEST_RATES, minimumFareCents: 0 };
    assert.equal(computeFare(rates, input).totalCents, 626);
    assert.equal(calculateFare(rates, { distanceKm: 1.336, durationMinutes: 61 / 60, dynamicMultiplier: 1 }).totalCents, 625);
  });

  test('aritmética exata: o meio centavo da dinâmica não some no ponto flutuante', () => {
    // 50 × 1,15 = 57,5 → 58. Em ponto flutuante, 50 * 1.15 = 57.49999999999999 e Math.round daria 57.
    assert.equal(Math.round(50 * 1.15), 57, 'premissa do teste: o float erra aqui');
    const result = computeFare({ baseCents: 50, perKmCents: 0, perMinuteCents: 0, minimumFareCents: 0 }, { distanceM: 0, durationS: 0, dynamicMultiplier: 1.15 });
    assert.equal(result.totalCents, 58);
  });

  test('km zero: sem deslocamento cobra base + tempo, ou o mínimo', () => {
    assert.equal(computeFare(TEST_RATES, { distanceM: 0, durationS: 0 }).totalCents, 800);
    const noMinimum = { ...TEST_RATES, minimumFareCents: 0 };
    assert.equal(computeFare(noMinimum, { distanceM: 0, durationS: 0 }).totalCents, 400);
    assert.equal(computeFare(noMinimum, { distanceM: 0, durationS: 600 }).totalCents, 650);
  });

  test('multiplicador: entra no total ANTES do mínimo e é devolvido normalizado', () => {
    // (400 + 150 × 8 + 25 × 20) × 1,3 = 2100 × 1,3 = 2730
    const surged = computeFare(TEST_RATES, { distanceM: 8000, durationS: 1200, dynamicMultiplier: 1.3 });
    assert.equal(surged.totalCents, 2730);
    assert.equal(surged.dynamicMultiplier, 1.3);
    // 525 × 1,5 = 787,5 → 788 < 800: o mínimo continua valendo depois da dinâmica
    const shortSurged = computeFare(TEST_RATES, { distanceM: 500, durationS: 120, dynamicMultiplier: 1.5 });
    assert.equal(shortSurged.roundedCents, 788);
    assert.equal(shortSurged.totalCents, 800);
    assert.equal(shortSurged.minimumApplied, true);
  });

  test('multiplicador inválido lança: abaixo de 1, mais de duas casas, acima de 99,99, não finito', () => {
    for (const dynamicMultiplier of [0.99, 1.005, 100, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => computeFare(TEST_RATES, { distanceM: 1000, durationS: 60, dynamicMultiplier }), RangeError, String(dynamicMultiplier));
    }
    assert.equal(computeFare(TEST_RATES, { distanceM: 1000, durationS: 60, dynamicMultiplier: 99.99 }).dynamicMultiplier, 99.99);
  });

  test('distância e duração quebradas ou negativas lançam (quem chama arredonda à vista e grava o inteiro)', () => {
    assert.throws(() => computeFare(TEST_RATES, { distanceM: 5234.7, durationS: 60 }), RangeError);
    assert.throws(() => computeFare(TEST_RATES, { distanceM: 1000, durationS: 61.2 }), RangeError);
    assert.throws(() => computeFare(TEST_RATES, { distanceM: -1, durationS: 60 }), RangeError);
    assert.throws(() => computeFare({ ...TEST_RATES, perKmCents: 1.5 }, { distanceM: 1000, durationS: 60 }), RangeError);
    assert.throws(() => computeFare({ ...TEST_RATES, baseCents: -1 }, { distanceM: 1000, durationS: 60 }), RangeError);
  });

  test('mesma entrada, mesmo preço — e igual ao cálculo exato de referência, em 5.000 casos sorteados', () => {
    let seed = 20261127;
    const next = (max: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed % (max + 1);
    };
    for (let i = 0; i < 5000; i++) {
      const rates: FareRates = { baseCents: next(2000), perKmCents: next(500), perMinuteCents: next(100), minimumFareCents: next(3000) };
      const input = { distanceM: next(60_000), durationS: next(7200), dynamicMultiplier: (100 + next(200)) / 100 };
      const first = computeFare(rates, input);
      assert.deepEqual(computeFare({ ...rates }, { ...input }), first, 'mesma entrada, mesmo preço');

      // Referência independente: fração exata em milésimos de centavo × centésimos da dinâmica, meio para cima.
      const thousandths = rates.baseCents * 1_000_000 * 60 + rates.perKmCents * input.distanceM * 1000 * 60 + rates.perMinuteCents * input.durationS * 1_000_000;
      const exact = (BigInt(thousandths) * BigInt(Math.round(input.dynamicMultiplier * 100))) * 10n; // ×10 para ter o dígito da metade
      const unit = 1_000_000n * 60n * 100n * 10n; // um centavo na mesma escala
      const floor = exact / unit;
      const remainder = exact % unit;
      const reference = Number(remainder * 2n >= unit ? floor + 1n : floor);
      assert.equal(first.roundedCents, reference, `caso ${i}`);
      assert.equal(first.totalCents, Math.max(reference, rates.minimumFareCents));
    }
  });
});
