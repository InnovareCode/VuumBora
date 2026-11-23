/**
 * `calculateFare`/`resolvePlatformFeeTier`/`splitFare` — módulo do simulador de tarifa (decisão 7,
 * `docs/plano-mestre.md` §6.1 linha 7). Casos de borda cobertos de propósito: mínimo, dinâmica e
 * arredondamento em centavos (pedido explícito do briefing).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { calculateFare, resolvePlatformFeeTier, splitFare } from '../src/fare';
import type { FareRates, PlatformFeeTier } from '../src/fare';

const RATES: FareRates = {
  baseCents: 500,
  perKmCents: 180,
  perMinuteCents: 35,
  minimumFareCents: 800,
};

describe('calculateFare', () => {
  test('corrida normal: soma base + km + minuto, sem dinâmica nem mínimo entrando em jogo', () => {
    const result = calculateFare(RATES, { distanceKm: 5, durationMinutes: 12, dynamicMultiplier: 1 });
    assert.equal(result.baseCents, 500);
    assert.equal(result.distanceCents, 900); // 5 * 180
    assert.equal(result.durationCents, 420); // 12 * 35
    assert.equal(result.subtotalCents, 1820);
    assert.equal(result.dynamicCents, 1820); // multiplicador 1, não altera
    assert.equal(result.minimumApplied, false);
    assert.equal(result.totalCents, 1820);
  });

  test('borda do mínimo: trajeto curto cai para o preço mínimo, e o detalhe sinaliza isso', () => {
    const result = calculateFare(RATES, { distanceKm: 0.5, durationMinutes: 2, dynamicMultiplier: 1 });
    // subtotal = 500 + 90 + 70 = 660, abaixo do mínimo de 800
    assert.equal(result.subtotalCents, 660);
    assert.equal(result.dynamicCents, 660);
    assert.equal(result.minimumApplied, true);
    assert.equal(result.totalCents, 800);
  });

  test('borda da dinâmica: multiplicador de pico encarece o subtotal, arredondado', () => {
    const result = calculateFare(RATES, { distanceKm: 5, durationMinutes: 12, dynamicMultiplier: 1.5 });
    assert.equal(result.subtotalCents, 1820);
    assert.equal(result.dynamicCents, 2730); // 1820 * 1.5, exato
    assert.equal(result.minimumApplied, false);
    assert.equal(result.totalCents, 2730);
  });

  test('borda de arredondamento: distância e duração fracionárias arredondam por componente', () => {
    // distanceCents = 3.456 * 180 = 622,08 -> 622; durationCents = 12.3 * 35 = 430,5 -> 431 (JS arredonda .5 para cima)
    const result = calculateFare(RATES, { distanceKm: 3.456, durationMinutes: 12.3, dynamicMultiplier: 1 });
    assert.equal(result.distanceCents, 622);
    assert.equal(result.durationCents, 431);
    assert.equal(result.subtotalCents, 500 + 622 + 431);
  });

  test('dinâmica nunca pode ser menor que 1 — lança, não clampa em silêncio', () => {
    assert.throws(
      () => calculateFare(RATES, { distanceKm: 5, durationMinutes: 10, dynamicMultiplier: 0.8 }),
      RangeError,
    );
  });

  test('distância negativa lança — é sempre bug de quem chama, nunca corrida válida', () => {
    assert.throws(
      () => calculateFare(RATES, { distanceKm: -1, durationMinutes: 10, dynamicMultiplier: 1 }),
      RangeError,
    );
  });
});

const TIERS: readonly PlatformFeeTier[] = [
  { id: 'novo', label: 'Novo', feePercent: 25, minDaysActive: 0, minCompletedTrips: 0, minRating: 0 },
  { id: 'intermediario', label: 'Intermediário', feePercent: 22.5, minDaysActive: 30, minCompletedTrips: 100, minRating: 4.6 },
  { id: 'veterano', label: 'Veterano', feePercent: 20, minDaysActive: 90, minCompletedTrips: 500, minRating: 4.8 },
];

describe('resolvePlatformFeeTier', () => {
  test('motorista novo cai na faixa-base (maior taxa)', () => {
    const tier = resolvePlatformFeeTier(TIERS, { daysActive: 1, completedTrips: 2, rating: 4.9 });
    assert.equal(tier.id, 'novo');
  });

  test('motorista que bate todos os critérios da melhor faixa pega a menor taxa', () => {
    const tier = resolvePlatformFeeTier(TIERS, { daysActive: 120, completedTrips: 600, rating: 4.9 });
    assert.equal(tier.id, 'veterano');
  });

  test('borda: falta só a nota para a faixa intermediária — cai na faixa-base', () => {
    const tier = resolvePlatformFeeTier(TIERS, { daysActive: 40, completedTrips: 150, rating: 4.5 });
    assert.equal(tier.id, 'novo');
  });

  test('borda: exatamente no limite da faixa intermediária já qualifica (>=, não >)', () => {
    const tier = resolvePlatformFeeTier(TIERS, { daysActive: 30, completedTrips: 100, rating: 4.6 });
    assert.equal(tier.id, 'intermediario');
  });

  test('sem faixa-base (0/0/0), motorista abaixo de tudo não se encaixa — lança', () => {
    const semBase = TIERS.filter((t) => t.id !== 'novo');
    assert.throws(() => resolvePlatformFeeTier(semBase, { daysActive: 0, completedTrips: 0, rating: 0 }), RangeError);
  });
});

describe('splitFare', () => {
  test('percentual exato: plataforma e motorista somam o total, sem sobra', () => {
    const split = splitFare(1820, 25);
    assert.equal(split.platformCents, 455);
    assert.equal(split.driverPayoutCents, 1365);
    assert.equal(split.platformCents + split.driverPayoutCents, split.totalCents);
  });

  test('borda de arredondamento: percentual fracionário e total que não divide exato', () => {
    // 1001 * 22.5% = 225,225 -> arredonda para 225; motorista fica com o resto (776), nunca um segundo arredondamento
    const split = splitFare(1001, 22.5);
    assert.equal(split.platformCents, 225);
    assert.equal(split.driverPayoutCents, 776);
    assert.equal(split.platformCents + split.driverPayoutCents, 1001);
  });

  test('percentual fora de 0-100 lança', () => {
    assert.throws(() => splitFare(1000, 101), RangeError);
    assert.throws(() => splitFare(1000, -1), RangeError);
  });
});
