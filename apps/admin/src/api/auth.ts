import type { AdminLoginInput, AdminUser } from './types';
import type { Result } from './result';
import { createHttpRequester } from './client';

export interface AuthPort {
  login(input: AdminLoginInput): Promise<Result<AdminUser>>;
  me(): Promise<Result<AdminUser>>;
  logout(): Promise<Result<void>>;
}

export function createHttpAuthAdapter(baseUrl: string): AuthPort {
  const request = createHttpRequester(baseUrl);
  return {
    login: (input) => request<AdminUser>({ path: '/v1/admin/auth/login', method: 'POST', body: input }),
    me: () => request<AdminUser>({ path: '/v1/admin/me' }),
    logout: () => request<void>({ path: '/v1/admin/auth/logout', method: 'POST' }),
  };
}

// Só do modo mock: imita o que o cookie httpOnly faz no modo real (sobreviver
// a um F5), sem guardar nada que pareça credencial real — é só o admin
// fictício. `sessionStorage` (não localStorage) some ao fechar a aba, igual
// expectativa de sessão.
const MOCK_SESSION_KEY = '__vuumbora_admin_mock_session__';

function readMockSession(): AdminUser | null {
  try {
    const raw = sessionStorage.getItem(MOCK_SESSION_KEY);
    return raw ? (JSON.parse(raw) as AdminUser) : null;
  } catch {
    return null;
  }
}

function writeMockSession(session: AdminUser | null): void {
  try {
    if (session) sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(MOCK_SESSION_KEY);
  } catch {
    // sessionStorage indisponível (ex. modo privado restrito): a sessão mock
    // só não sobrevive a um F5 — não é um erro para travar a tela por.
  }
}

/**
 * Mock explícito (nunca fallback silencioso — ver src/api/index.ts). Aceita
 * qualquer e-mail que pareça e-mail e qualquer senha com 4+ caracteres, só
 * para a tela ter o que mostrar enquanto `/v1/admin/*` não existe.
 */
export function createMockAuthAdapter(): AuthPort {
  let session: AdminUser | null = readMockSession();
  // 'dono' (não 'owner') — mesmo vocabulário de `AdminRole`, para o filtro de
  // menu por papel se comportar em modo mock como se comportaria com a API
  // real (ver `src/nav/types.ts`).
  const FAKE_USER: AdminUser = { id: 'mock-admin-1', name: 'Admin (demonstração)', email: 'admin@vuumbora.com.br', role: 'dono' };

  return {
    async login(input) {
      await delay();
      const looksLikeEmail = /\S+@\S+\.\S+/.test(input.email);
      if (!looksLikeEmail || input.password.length < 4) {
        return { ok: false, error: { kind: 'unknown', message: 'E-mail ou senha incorretos.' } };
      }
      session = { ...FAKE_USER, email: input.email };
      writeMockSession(session);
      return { ok: true, data: session, origin: 'mock' };
    },
    async me() {
      await delay();
      if (!session) return { ok: false, error: { kind: 'unauthorized' } };
      return { ok: true, data: session, origin: 'mock' };
    },
    async logout() {
      await delay();
      session = null;
      writeMockSession(null);
      return { ok: true, data: undefined, origin: 'mock' };
    },
  };
}

function delay(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
