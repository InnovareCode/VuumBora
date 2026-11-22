/** Peças dos testes do `SessionManager`: armazenamento espião, "recurso protegido" e API de refresh controláveis. */
import type { ApiError, Result } from '../../src/index';
import { createSessionController, type SessionController } from '../../src/identity/session-manager';
import { createMemorySessionStorage, parseStoredSession, serializeSession, type SessionStoragePort, storageKeys } from '../../src/identity/session-storage';
import type { SessionTokens } from '../../src/identity/types';

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const SESSION_KEY = storageKeys('passenger').session;

export function tokens(n: number, options: { accessExpiresInMs?: number; now?: number } = {}): SessionTokens {
  const now = options.now ?? Date.now();
  return {
    accessToken: `a${n}`,
    accessTokenExpiresAt: new Date(now + (options.accessExpiresInMs ?? 15 * 60_000)).toISOString(),
    refreshToken: `r${n}`,
    refreshTokenExpiresAt: new Date(now + 30 * 86_400_000).toISOString(),
  };
}

export const ok = <T>(data: T): Result<T> => ({ ok: true, data, origin: 'real' });
export const err = (error: ApiError): { ok: false; error: ApiError } => ({ ok: false, error });
export const UNAUTHORIZED: ApiError = { kind: 'unauthorized', code: 'unauthorized' };
export const REFRESH_REJECTED: ApiError = { kind: 'unauthorized', code: 'invalid_refresh_token' };

export interface SpyStorage extends SessionStoragePort {
  /** Operações na ordem em que COMEÇARAM, como `"set:chave"`. */
  readonly ops: string[];
  setDelayMs: number;
  failSet: boolean;
  failGet: boolean;
  /** Lê direto do cofre, sem registrar em `ops` e sem falhar. */
  raw(key: string): Promise<string | null>;
}

export function spyStorage(initial: Record<string, string> = {}, events?: string[]): SpyStorage {
  const inner = createMemorySessionStorage(initial);
  const spy: SpyStorage = {
    ops: [],
    setDelayMs: 0,
    failSet: false,
    failGet: false,
    async getItem(key) {
      spy.ops.push(`get:${key}`);
      if (spy.failGet) throw new Error('cofre bloqueado');
      return inner.getItem(key);
    },
    async setItem(key, value) {
      spy.ops.push(`set:${key}`);
      events?.push(`persist:start:${key}`);
      if (spy.setDelayMs > 0) await sleep(spy.setDelayMs);
      if (spy.failSet) throw new Error('disco cheio');
      await inner.setItem(key, value);
      events?.push(`persist:end:${key}`);
    },
    async removeItem(key) {
      spy.ops.push(`remove:${key}`);
      await inner.removeItem(key);
    },
    raw: (key) => inner.getItem(key),
  };
  return spy;
}

export interface Kit {
  readonly manager: SessionController;
  readonly storage: SpyStorage;
  readonly refreshCalls: string[];
  readonly logoutCalls: string[];
  readonly storageErrors: unknown[];
  readonly states: string[];
  /** Muda o comportamento do `POST /refresh` no meio do teste. */
  setRefresh(handler: (refreshToken: string) => Promise<Result<SessionTokens>>): void;
  /** O que está gravado na chave da sessão agora. */
  stored(): Promise<SessionTokens | null>;
}

export function createKit(options: {
  initial?: SessionTokens | null;
  refresh?: (refreshToken: string) => Promise<Result<SessionTokens>>;
  clock?: () => number;
  events?: string[];
} = {}): Kit {
  const initial = options.initial === undefined ? tokens(1) : options.initial;
  const storage = spyStorage(initial ? { [SESSION_KEY]: serializeSession(initial) } : {}, options.events);
  const refreshCalls: string[] = [];
  const logoutCalls: string[] = [];
  const storageErrors: unknown[] = [];
  const states: string[] = [];
  let refreshHandler = options.refresh ?? (async () => err({ kind: 'unknown', message: 'sem refresh configurado' }));

  const manager = createSessionController({
    accountType: 'passenger',
    api: {
      refresh: async (refreshToken) => {
        refreshCalls.push(refreshToken);
        options.events?.push(`refresh:start:${refreshToken}`);
        const result = await refreshHandler(refreshToken);
        options.events?.push(`refresh:end:${refreshToken}`);
        return result;
      },
      logout: async (refreshToken) => {
        logoutCalls.push(refreshToken);
        return ok(undefined);
      },
    },
    storage,
    origin: 'real',
    ...(options.clock ? { clock: options.clock } : {}),
    onStorageError: (error) => storageErrors.push(error),
  });
  manager.subscribe((state) => states.push(state.status === 'signed_out' ? `signed_out:${state.reason}` : state.status));

  return {
    manager,
    storage,
    refreshCalls,
    logoutCalls,
    storageErrors,
    states,
    setRefresh(handler) {
      refreshHandler = handler;
    },
    async stored() {
      return parseStoredSession(await storage.raw(SESSION_KEY));
    },
  };
}

/** "Recurso protegido": aceita só o access token que `accept()` devolve; cada chamada demora `delay(i)` ms. */
export function protectedResource(accept: () => string, delay: (index: number) => number = () => 0, events?: string[]) {
  let calls = 0;
  const used: string[] = [];
  return {
    used,
    get calls() {
      return calls;
    },
    async call(accessToken: string): Promise<Result<string>> {
      const index = calls;
      calls += 1;
      used.push(accessToken);
      events?.push(`call:start:${accessToken}`);
      await sleep(delay(index));
      events?.push(`call:end:${accessToken}`);
      return accessToken === accept() ? ok('dado') : err(UNAUTHORIZED);
    },
  };
}
