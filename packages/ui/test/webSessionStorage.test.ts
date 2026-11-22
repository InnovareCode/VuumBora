/**
 * Web: a sessão fica SÓ em memória. Nada de `localStorage`, `sessionStorage`, `indexedDB` ou cookie, e nenhum módulo
 * nativo no arquivo que o Metro escolhe para o web.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { createDeviceSessionStorage } from '../src/device/deviceSessionStorage';

const WEB_FILE = new URL('../src/device/deviceSessionStorage.ts', import.meta.url);

describe('arquivo do web (deviceSessionStorage.ts)', () => {
  const code = readFileSync(WEB_FILE, 'utf8')
    // Só o código importa: o comentário explica justamente o que é proibido.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('não cita nenhum armazenamento do navegador', () => {
    for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'AsyncStorage']) {
      assert.equal(code.includes(forbidden), false, forbidden);
    }
  });

  it('não importa módulo nativo nem biblioteca de armazenamento', () => {
    const imports = new Set([...code.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]));
    assert.deepEqual([...imports], ['./deviceSessionStorage.types']);
  });
});

describe('porta em memória', () => {
  const trap = () =>
    new Proxy(
      {},
      {
        get: (_target, property) => {
          throw new Error(`acesso proibido ao armazenamento do navegador (${String(property)})`);
        },
      },
    );
  const globals = globalThis as Record<string, unknown>;
  const saved: Record<string, PropertyDescriptor | undefined> = {};

  before(() => {
    for (const name of ['localStorage', 'sessionStorage', 'indexedDB']) {
      saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
      Object.defineProperty(globalThis, name, { value: trap(), configurable: true, writable: true });
    }
  });
  after(() => {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globals[name];
    }
  });

  it('guarda, lê, apaga — sem tocar em localStorage/sessionStorage/indexedDB (que aqui explodem a qualquer acesso)', async () => {
    const storage = createDeviceSessionStorage({ accountType: 'passenger' });
    await storage.ready();
    await storage.setItem('vuumbora.passenger.session', 'segredo');
    assert.equal(await storage.getItem('vuumbora.passenger.session'), 'segredo');
    await storage.removeItem('vuumbora.passenger.session');
    assert.equal(await storage.getItem('vuumbora.passenger.session'), null);
  });

  it('cada criação é um cofre novo e separado (a sessão não vaza entre instâncias)', async () => {
    const a = createDeviceSessionStorage({ accountType: 'passenger' });
    const b = createDeviceSessionStorage({ accountType: 'passenger' });
    await a.setItem('k', 'v');
    assert.equal(await b.getItem('k'), null);
  });
});
