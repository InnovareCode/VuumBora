/**
 * Escala do `Avatar` (dívida das fichas: P08/M08 pedem 56, P09/M07 pedem 40, M09 pede 48 — antes só havia 32, 44 e 64).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AVATAR_DIAMETERS, avatarDiameter, avatarInitialsFontSize } from '../src/avatarScale';

describe('avatarDiameter', () => {
  it('os diâmetros das fichas valem como estão', () => {
    for (const d of [40, 48, 56] as const) assert.equal(avatarDiameter(d), d);
  });

  it('a escala inteira é a das fichas, na grade de 4 pt e em ordem crescente', () => {
    assert.deepEqual([...AVATAR_DIAMETERS], [32, 40, 48, 56, 64, 88]);
    for (const d of AVATAR_DIAMETERS) {
      assert.equal(d % 4, 0, `${d} fora da grade de 4 pt`);
      assert.equal(avatarDiameter(d), d);
    }
  });

  it('os nomes antigos não mudam de tamanho (nenhuma tela muda sozinha)', () => {
    assert.equal(avatarDiameter('sm'), 32);
    assert.equal(avatarDiameter('md'), 44);
    assert.equal(avatarDiameter('lg'), 64);
  });
});

describe('avatarInitialsFontSize', () => {
  it('38% do diâmetro, igual aos tamanhos antigos', () => {
    assert.equal(avatarInitialsFontSize(32), 12);
    assert.equal(avatarInitialsFontSize(44), 17);
    assert.equal(avatarInitialsFontSize(64), 24);
    assert.equal(avatarInitialsFontSize(40), 15);
    assert.equal(avatarInitialsFontSize(48), 18);
    assert.equal(avatarInitialsFontSize(56), 21);
    assert.equal(avatarInitialsFontSize(88), 33);
  });
});
