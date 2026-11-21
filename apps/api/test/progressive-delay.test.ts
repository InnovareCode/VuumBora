/** Atraso progressivo (I-6): a tabela e a conta de custo de adivinhação documentadas em `lib/progressive-delay.ts`. Sem banco. */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DEFAULT_DELAY_SCHEDULE, delayAfterFailures, guessesWithin, justReachedMaxDelay } from '../src/lib/progressive-delay.js';

describe('atraso progressivo', () => {
  test('tabela: 1 s, 2 s, 4 s... dobrando até o teto de 900 s (15 min)', () => {
    const expected = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 900, 900, 900];
    assert.deepEqual(expected.map((_, failures) => delayAfterFailures(failures)), expected);
    assert.equal(delayAfterFailures(-3), 0);
    assert.equal(delayAfterFailures(10_000), 900, 'contagem absurda não estoura nem passa do teto');
  });

  test('base e teto configuráveis; teto nunca é ultrapassado', () => {
    assert.deepEqual([1, 2, 3, 4].map((n) => delayAfterFailures(n, { baseSeconds: 5, maxSeconds: 30 })), [5, 10, 20, 30]);
  });

  test('a falha que leva o par ao teto é identificada UMA vez só (gatilho do alerta "travou")', () => {
    const reached = Array.from({ length: 30 }, (_, i) => i + 1).filter((n) => justReachedMaxDelay(n));
    assert.deepEqual(reached, [11]);
  });

  test('custo de adivinhação de UM par (a conta que a documentação e o contrato citam): 11 em 17 min, 13 na 1ª hora, 105 em 24 h', () => {
    assert.equal(guessesWithin(0), 1, 'a 1ª tentativa é livre');
    assert.equal(guessesWithin(1022), 10);
    assert.equal(guessesWithin(1023), 11, '11 tentativas em 1023 s (17 min)');
    assert.equal(guessesWithin(3600), 13);
    assert.equal(guessesWithin(24 * 3600), 105);
    // Depois do teto, exatamente 4 por hora.
    assert.equal(guessesWithin(1023 + 3600 * 10) - guessesWithin(1023), 40);
  });

  test('o padrão é base 1 s e teto 900 s', () => {
    assert.deepEqual(DEFAULT_DELAY_SCHEDULE, { baseSeconds: 1, maxSeconds: 900 });
  });
});
