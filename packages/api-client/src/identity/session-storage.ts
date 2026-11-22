/**
 * Onde a sessão e o `installationId` ficam guardados entre aberturas do app.
 *
 * É uma porta de CHAVE/VALOR (texto), de propósito: quem implementa só liga isto ao armazenamento seguro da
 * plataforma (A3: `expo-secure-store` no nativo; memória no web) e a serialização, a validação e as chaves moram
 * aqui, num lugar só. Chaves usam só `[A-Za-z0-9._-]` (limite do SecureStore).
 *
 * Quem implementa: `getItem` devolve `null` se não existe; qualquer método pode rejeitar (cofre bloqueado, disco
 * cheio) — o api-client trata a rejeição sem derrubar a sessão em memória (ver `SessionManager`).
 */
import type { AccountType, SessionTokens } from './types';

export interface SessionStoragePort {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Só memória: a sessão some ao fechar o app. É o padrão (e o que o web usa) — falha visível, nunca falsa. */
export function createMemorySessionStorage(initial: Readonly<Record<string, string>> = {}): SessionStoragePort {
  const items = new Map<string, string>(Object.entries(initial));
  return {
    getItem: async (key) => items.get(key) ?? null,
    setItem: async (key, value) => {
      items.set(key, value);
    },
    removeItem: async (key) => {
      items.delete(key);
    },
  };
}

/** Um conjunto de chaves por tipo de conta (um app = um tipo; o prefixo evita colisão no web e em testes). */
export function storageKeys(accountType: AccountType): { readonly session: string; readonly installationId: string } {
  return {
    session: `vuumbora.${accountType}.session`,
    installationId: `vuumbora.${accountType}.installation_id`,
  };
}

const STORED_VERSION = 1;

export function serializeSession(tokens: SessionTokens): string {
  return JSON.stringify({
    v: STORED_VERSION,
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
    refreshToken: tokens.refreshToken,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
  });
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

/** `null` para qualquer coisa que não seja uma sessão válida desta versão (corrompida, de versão futura, vazia). */
export function parseStoredSession(raw: string | null): SessionTokens | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const { v, accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt } = record;
  if (v !== STORED_VERSION) return null;
  if (typeof accessToken !== 'string' || accessToken.length === 0) return null;
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) return null;
  if (!isIsoDate(accessTokenExpiresAt) || !isIsoDate(refreshTokenExpiresAt)) return null;
  return { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt };
}
