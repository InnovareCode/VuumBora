/**
 * Metade "navegador" do `useNetworkStatus` (dívida da onda 4/D6): no Chromium o NetInfo só escuta
 * `navigator.connection`, então o corte de rede que só dispara `offline` no `window` precisa chegar por aqui.
 * A prova no navegador de verdade (Chromium com `context.setOffline()` puro, sem `connection.change`) fica no
 * roteiro do handoff; aqui ficam as regras, sem React.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  combineOnline,
  getBrowserOnlineWindow,
  isNetInfoOnline,
  subscribeBrowserOnline,
  type BrowserOnlineWindow,
} from '../src/browserOnline';

type Listener = () => void;

function fakeWindow(initialOnLine: boolean) {
  const listeners: Record<'online' | 'offline', Listener[]> = { online: [], offline: [] };
  const navigator = { onLine: initialOnLine };
  const win: BrowserOnlineWindow & { navigator: { onLine: boolean } } = {
    navigator,
    addEventListener(type, listener) {
      listeners[type].push(listener);
    },
    removeEventListener(type, listener) {
      listeners[type] = listeners[type].filter((l) => l !== listener);
    },
  };
  return {
    win,
    listeners,
    goOffline() {
      navigator.onLine = false;
      for (const l of listeners.offline) l();
    },
    goOnline() {
      navigator.onLine = true;
      for (const l of listeners.online) l();
    },
  };
}

describe('subscribeBrowserOnline', () => {
  it('entrega o valor atual na hora de assinar', () => {
    const { win } = fakeWindow(false);
    const seen: boolean[] = [];
    subscribeBrowserOnline(win, (v) => seen.push(v));
    assert.deepEqual(seen, [false]);
  });

  it('reage a offline e depois a online (o caso que o NetInfo perde no Chromium)', () => {
    const fake = fakeWindow(true);
    const seen: boolean[] = [];
    subscribeBrowserOnline(fake.win, (v) => seen.push(v));
    fake.goOffline();
    fake.goOnline();
    assert.deepEqual(seen, [true, false, true]);
  });

  it('a função devolvida remove OS DOIS ouvintes', () => {
    const fake = fakeWindow(true);
    const seen: boolean[] = [];
    const unsubscribe = subscribeBrowserOnline(fake.win, (v) => seen.push(v));
    assert.equal(fake.listeners.online.length, 1);
    assert.equal(fake.listeners.offline.length, 1);
    unsubscribe();
    assert.equal(fake.listeners.online.length, 0);
    assert.equal(fake.listeners.offline.length, 0);
    fake.goOffline();
    assert.deepEqual(seen, [true]);
  });
});

describe('getBrowserOnlineWindow', () => {
  it('fora do navegador (sem window) devolve undefined', () => {
    assert.equal(getBrowserOnlineWindow({}), undefined);
    assert.equal(getBrowserOnlineWindow(undefined), undefined);
    assert.equal(getBrowserOnlineWindow(null), undefined);
  });

  it('window sem navigator.onLine booleano não conta (ex.: ambiente nativo com polyfill parcial)', () => {
    const noop = () => {};
    assert.equal(getBrowserOnlineWindow({ window: { addEventListener: noop, removeEventListener: noop } }), undefined);
    assert.equal(getBrowserOnlineWindow({ window: { navigator: {}, addEventListener: noop, removeEventListener: noop } }), undefined);
    assert.equal(getBrowserOnlineWindow({ window: { navigator: { onLine: true } } }), undefined);
  });

  it('window de navegador é devolvido como está', () => {
    const { win } = fakeWindow(true);
    assert.equal(getBrowserOnlineWindow({ window: win }), win);
  });
});

describe('isNetInfoOnline', () => {
  it('null (ainda não sabe) conta como online; qualquer false derruba', () => {
    assert.equal(isNetInfoOnline({ isConnected: null, isInternetReachable: null }), true);
    assert.equal(isNetInfoOnline({ isConnected: true, isInternetReachable: null }), true);
    assert.equal(isNetInfoOnline({ isConnected: true, isInternetReachable: true }), true);
    assert.equal(isNetInfoOnline({ isConnected: false, isInternetReachable: null }), false);
    assert.equal(isNetInfoOnline({ isConnected: true, isInternetReachable: false }), false);
  });
});

describe('combineOnline', () => {
  it('online só quando as duas fontes concordam', () => {
    assert.equal(combineOnline(true, true), true);
    assert.equal(combineOnline(true, false), false, 'navegador offline e NetInfo sem saber (o caso do Chromium)');
    assert.equal(combineOnline(false, true), false);
    assert.equal(combineOnline(false, false), false);
  });
});
