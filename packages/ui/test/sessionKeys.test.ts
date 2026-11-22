/**
 * As chaves que o ui apaga na primeira execução TÊM de ser exatamente as que o api-client grava. Duas listas, um teste que
 * lê a verdadeira (`storageKeys`, não exportado pelo `index` do pacote, daí o caminho relativo — só em teste).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { storageKeys } from '../../api-client/src/identity/session-storage';
import { deviceSessionKeys, installMarkerKey } from '../src/device/sessionKeys';

describe('paridade com o storageKeys do api-client', () => {
  for (const accountType of ['passenger', 'driver'] as const) {
    it(`${accountType}: as mesmas chaves, nem a mais nem a menos`, () => {
      const real = Object.values(storageKeys(accountType)).sort();
      assert.deepEqual([...deviceSessionKeys(accountType)].sort(), real);
    });
  }

  it('o marcador não é uma das chaves do cofre (apagar o cofre não pode apagar o marcador por engano)', () => {
    const real = Object.values(storageKeys('passenger'));
    assert.equal(real.includes(installMarkerKey('passenger')), false);
    assert.notEqual(installMarkerKey('passenger'), installMarkerKey('driver'));
  });

  it('todas só usam os caracteres que o SecureStore aceita', () => {
    for (const key of [...deviceSessionKeys('passenger'), ...deviceSessionKeys('driver'), installMarkerKey('passenger')]) {
      assert.match(key, /^[\w.-]+$/);
    }
  });
});
