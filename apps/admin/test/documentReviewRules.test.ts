/**
 * Regras puras da área de documentos: o que fica na tela depois de uma carga falhada do detalhe e a
 * validade do link no relógio do servidor (relógio do revisor adiantado/atrasado).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { failedDriverDetailState, INITIAL_DRIVER_DETAIL_STATE } from '../src/hooks/useAdminDriverDetail';
import { driverDetail } from './helpers/fakeApi';
import { localViewUrlExpiry } from '../src/api/documentReview';

describe('failedDriverDetailState (regra pura)', () => {
  const loaded = { ...INITIAL_DRIVER_DETAIL_STATE, data: driverDetail(), loading: false, refreshing: true };
  test('403 na recarga descarta o dado', () => {
    const next = failedDriverDetailState(loaded, 'refresh', { kind: 'forbidden' });
    assert.equal(next.data, null);
    assert.equal(next.errorKind, 'forbidden');
  });
  test('rede na recarga mantém o dado', () => {
    const next = failedDriverDetailState(loaded, 'refresh', { kind: 'network', retryable: true });
    assert.ok(next.data);
    assert.ok(next.refreshError);
  });
});

describe('localViewUrlExpiry: validade do link no relógio do SERVIDOR', () => {
  const SERVER_NOW = Date.parse('2026-11-27T12:00:00Z');
  const serverDate = new Date(SERVER_NOW).toUTCString();
  const at = (iso: string) => Date.parse(iso);
  const iso = (ms: number) => new Date(ms).toISOString();

  test('relógio local 6 min ADIANTADO, com Date: vale os 300 s do servidor (era o bug: vencia na chegada)', () => {
    const receivedAt = SERVER_NOW + 6 * 60_000;
    assert.equal(at(localViewUrlExpiry(iso(SERVER_NOW + 300_000), receivedAt, serverDate)) - receivedAt, 300_000);
  });

  test('relógio local 6 min ATRASADO, com Date: 300 s, não 11 min', () => {
    const receivedAt = SERVER_NOW - 6 * 60_000;
    assert.equal(at(localViewUrlExpiry(iso(SERVER_NOW + 300_000), receivedAt, serverDate)) - receivedAt, 300_000);
  });

  test('servidor diz 60 s: 60 s; servidor diz 1 h: teto de 300 s', () => {
    const receivedAt = SERVER_NOW + 90_000;
    assert.equal(at(localViewUrlExpiry(iso(SERVER_NOW + 60_000), receivedAt, serverDate)) - receivedAt, 60_000);
    assert.equal(at(localViewUrlExpiry(iso(SERVER_NOW + 3_600_000), receivedAt, serverDate)) - receivedAt, 300_000);
  });

  test('servidor diz que já venceu (com Date): vence na chegada', () => {
    const receivedAt = SERVER_NOW;
    assert.equal(at(localViewUrlExpiry(iso(SERVER_NOW - 1_000), receivedAt, serverDate)), receivedAt);
  });

  test('sem Date (CORS sem expor o cabeçalho), relógio adiantado: teto de 300 s em vez de vencer na hora', () => {
    const receivedAt = SERVER_NOW + 6 * 60_000;
    assert.equal(at(localViewUrlExpiry(iso(SERVER_NOW + 300_000), receivedAt, null)) - receivedAt, 300_000);
  });

  test('sem Date, relógios alinhados: o que o servidor disser, até 300 s', () => {
    assert.equal(at(localViewUrlExpiry(iso(SERVER_NOW + 60_000), SERVER_NOW, null)) - SERVER_NOW, 60_000);
    assert.equal(at(localViewUrlExpiry(iso(SERVER_NOW + 900_000), SERVER_NOW, null)) - SERVER_NOW, 300_000);
  });

  test('Date ilegível conta como ausente', () => {
    const receivedAt = SERVER_NOW + 6 * 60_000;
    assert.equal(at(localViewUrlExpiry(iso(SERVER_NOW + 300_000), receivedAt, 'não é data')) - receivedAt, 300_000);
  });
});
