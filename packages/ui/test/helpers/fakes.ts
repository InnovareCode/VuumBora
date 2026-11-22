/**
 * Cofre e armazenamento comum FALSOS, com o comportamento do aparelho que importa para a A3:
 *
 *  - `FakeKeychain` imita o `expo-secure-store`: valida a chave como o módulo real (`/^[\w.-]+$/`, vazia recusa), valor tem
 *    de ser texto, apagar item que não existe NÃO falha (iOS tolera `errSecItemNotFound`), e REGISTRA a opção
 *    `keychainAccessible` de cada gravação. Falhas são injetáveis por operação e por chave.
 *  - `FakeUserDefaults` imita o `Settings` do RN (`NSUserDefaults`): `get` síncrono, `set` por objeto.
 *  - `FakeIos` junta os dois com a regra que motiva a fatia: DESINSTALAR apaga o `NSUserDefaults` e MANTÉM o Keychain.
 *
 * Nada aqui é a plataforma de verdade: prova a LÓGICA do app contra um modelo escrito a partir da documentação e do código
 * do `expo-secure-store`. O comportamento real do Keychain na reinstalação só se prova num iPhone.
 */
import type { SecureStoreLike, SettingsLike } from '../../src/device/nativeSessionStorage';

const VALID_KEY = /^[\w.-]+$/;

export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 6; // valor arbitrário: o fake só confere que o app o repassa

export type Operation = 'get' | 'set' | 'delete';

export class FakeKeychain implements SecureStoreLike {
  readonly items = new Map<string, string>();
  /** A opção `keychainAccessible` com que cada chave foi gravada pela última vez. */
  readonly accessibleOf = new Map<string, number | undefined>();
  readonly calls: Array<{ readonly operation: Operation; readonly key: string }> = [];
  /** Operações (ou `operation:chave`) que rejeitam enquanto estiverem aqui. */
  readonly failing = new Set<string>();
  /** Atraso artificial por operação, para provar a ordem quando as chamadas se sobrepõem. */
  delayMs = 0;

  private async pause(): Promise<void> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    else await Promise.resolve();
  }

  private check(operation: Operation, key: string): void {
    this.calls.push({ operation, key });
    if (typeof key !== 'string' || !VALID_KEY.test(key)) {
      throw new Error('Invalid key provided to SecureStore. Keys must not be empty and contain only alphanumeric characters, ".", "-", and "_".');
    }
    if (this.failing.has(operation) || this.failing.has(`${operation}:${key}`)) throw new Error(`falha injetada (${operation}:${key})`);
  }

  async getItemAsync(key: string): Promise<string | null> {
    await this.pause();
    this.check('get', key);
    return this.items.get(key) ?? null;
  }

  async setItemAsync(key: string, value: string, options?: { keychainAccessible?: number }): Promise<void> {
    await this.pause();
    this.check('set', key);
    if (typeof value !== 'string') throw new Error('Invalid value provided to SecureStore. Values must be strings.');
    this.items.set(key, value);
    this.accessibleOf.set(key, options?.keychainAccessible);
  }

  async deleteItemAsync(key: string): Promise<void> {
    await this.pause();
    this.check('delete', key);
    this.items.delete(key);
    this.accessibleOf.delete(key);
  }

  count(operation: Operation): number {
    return this.calls.filter((call) => call.operation === operation).length;
  }
}

export class FakeUserDefaults implements SettingsLike {
  readonly values = new Map<string, unknown>();
  failReads = false;
  failWrites = false;

  get(key: string): unknown {
    if (this.failReads) throw new Error('falha injetada (settings.get)');
    return this.values.get(key);
  }

  set(values: Record<string, unknown>): void {
    if (this.failWrites) throw new Error('falha injetada (settings.set)');
    for (const [key, value] of Object.entries(values)) this.values.set(key, value);
  }
}

/** Um iPhone: o Keychain é do APARELHO, o `NSUserDefaults` é da INSTALAÇÃO. */
export class FakeIos {
  readonly keychain = new FakeKeychain();
  userDefaults = new FakeUserDefaults();

  /** Apagar o app e instalar de novo: some o sandbox, fica o Keychain. */
  reinstall(): void {
    this.userDefaults = new FakeUserDefaults();
  }
}
