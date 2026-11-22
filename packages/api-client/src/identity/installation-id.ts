/**
 * `installationId`: identifica a INSTALAÇÃO do app (vai em `device` no login). Gerado UMA vez e guardado na
 * `SessionStoragePort`; sobrevive a logout (é da instalação, não da conta) e a reaberturas do app.
 * O servidor aceita de 8 a 128 caracteres. Não é segredo e não autentica nada.
 */
import type { SessionStoragePort } from './session-storage';

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

export function isValidInstallationId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= MIN_LENGTH && value.length <= MAX_LENGTH && /^[\w.:-]+$/.test(value);
}

/**
 * Fonte de aleatoriedade padrão: o `crypto` global (navegador, Node, e o runtime do Expo quando o expõe).
 * SEM Math.random de reserva: se não houver `crypto`, o app injeta `randomId` (ex.: `expo-crypto`) — falhar alto
 * na montagem do cliente é melhor do que gerar id previsível em silêncio.
 */
export function defaultRandomId(): (() => string) | null {
  // Forma mínima do `crypto` global, declarada aqui: o pacote não usa o tipo `Crypto` do DOM (ver `resolvePlatform`).
  const cryptoApi = (
    globalThis as {
      crypto?: { randomUUID?: () => string; getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T };
    }
  ).crypto;
  const randomUUID = cryptoApi?.randomUUID?.bind(cryptoApi);
  if (randomUUID) return () => randomUUID();
  const getRandomValues = cryptoApi?.getRandomValues?.bind(cryptoApi);
  if (getRandomValues) {
    return () => {
      const bytes = getRandomValues(new Uint8Array(16));
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    };
  }
  return null;
}

export interface InstallationIdOptions {
  readonly storage: SessionStoragePort;
  readonly key: string;
  readonly randomId: () => string;
  readonly onStorageError: (error: unknown) => void;
}

/**
 * Devolve uma função que entrega SEMPRE o mesmo id durante o processo, mesmo com vários logins simultâneos
 * (a promessa é compartilhada: nunca nascem dois ids). Falha do armazenamento não impede o login: usa-se o id gerado
 * em memória e a falha é reportada.
 */
export function createInstallationIdProvider(options: InstallationIdOptions): () => Promise<string> {
  const { storage, key, randomId, onStorageError } = options;
  let cached: Promise<string> | null = null;

  async function load(): Promise<string> {
    try {
      const stored = await storage.getItem(key);
      if (isValidInstallationId(stored)) return stored;
    } catch (error) {
      onStorageError(error);
    }
    const generated = randomId();
    if (!isValidInstallationId(generated)) {
      throw new Error('randomId devolveu um installationId inválido (8 a 128 caracteres de [A-Za-z0-9_.:-]).');
    }
    try {
      await storage.setItem(key, generated);
    } catch (error) {
      onStorageError(error);
    }
    return generated;
  }

  return () => {
    cached ??= load().catch((error: unknown) => {
      cached = null; // não guarda a falha: a próxima chamada tenta de novo
      throw error;
    });
    return cached;
  };
}
