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
export function storageKeys(accountType: AccountType): {
  readonly session: string;
  readonly installationId: string;
  readonly pendingRevocations: string;
} {
  return {
    session: `vuumbora.${accountType}.session`,
    installationId: `vuumbora.${accountType}.installation_id`,
    pendingRevocations: `vuumbora.${accountType}.pending_revocations`,
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

/**
 * Refresh de uma sessão que saiu do aparelho (logout, ou troca de conta por cima de uma sessão aberta) mas que o
 * servidor AINDA não confirmou ter revogado (sem rede, servidor fora). Fica no mesmo cofre da sessão, é repetido na
 * abertura do app e some assim que o servidor confirma ou o token vence. `expiresAt` = `refreshTokenExpiresAt`.
 */
export interface PendingRevocation {
  readonly refreshToken: string;
  readonly expiresAt: string;
}

/** Teto da fila: mais antigo sai primeiro. Nenhum uso real chega perto; é só para o cofre não crescer sem limite. */
export const MAX_PENDING_REVOCATIONS = 10;

export function serializePendingRevocations(items: readonly PendingRevocation[]): string {
  return JSON.stringify({
    v: STORED_VERSION,
    items: items.map((item) => ({ refreshToken: item.refreshToken, expiresAt: item.expiresAt })),
  });
}

/** Lixo, versão estranha ou item malformado = vazio/descartado (nunca derruba a abertura do app). */
export function parsePendingRevocations(raw: string | null): PendingRevocation[] {
  if (raw === null) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof value !== 'object' || value === null) return [];
  const { v, items } = value as Record<string, unknown>;
  if (v !== STORED_VERSION || !Array.isArray(items)) return [];
  const parsed: PendingRevocation[] = [];
  for (const item of items.slice(0, MAX_PENDING_REVOCATIONS)) {
    if (typeof item !== 'object' || item === null) continue;
    const { refreshToken, expiresAt } = item as Record<string, unknown>;
    if (typeof refreshToken !== 'string' || refreshToken.length === 0 || !isIsoDate(expiresAt)) continue;
    if (parsed.some((other) => other.refreshToken === refreshToken)) continue;
    parsed.push({ refreshToken, expiresAt });
  }
  return parsed;
}
