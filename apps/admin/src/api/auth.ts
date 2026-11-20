import type { AdminLoginInput, AdminUser } from './types';
import type { Result } from './result';
import { createHttpRequester } from './client';
import { clearCsrfToken, setCsrfToken } from './csrf';

export interface AuthPort {
  login(input: AdminLoginInput): Promise<Result<AdminUser>>;
  me(): Promise<Result<AdminUser>>;
  logout(): Promise<Result<void>>;
}

/**
 * Resposta real de login/`/me` (contrato fechado com a Vega, 20/11/2026):
 * mesmos campos de `AdminUser` + `csrfToken` no MESMO objeto `data` — nunca
 * em `Set-Cookie` (ver `src/api/csrf.ts` pelo porquê). Tipo só existe aqui
 * dentro: quem consome a porta (`AuthContext`) nunca precisa saber de CSRF.
 */
interface AdminSessionResponse extends AdminUser {
  /** `null` para sessão criada antes da migração 0009 — mutação falha com `csrf_invalid` até logar de novo (ver `src/api/result.ts`). */
  readonly csrfToken: string | null;
}

/** Guarda o token em memória e devolve só os campos de `AdminUser` para o resto do app. */
function captureCsrfToken(session: AdminSessionResponse): AdminUser {
  const { csrfToken, ...admin } = session;
  setCsrfToken(csrfToken);
  return admin;
}

export function createHttpAuthAdapter(baseUrl: string): AuthPort {
  const request = createHttpRequester(baseUrl);
  return {
    async login(input) {
      const result = await request<AdminSessionResponse>({ path: '/v1/admin/auth/login', method: 'POST', body: input });
      if (!result.ok) return result;
      return { ...result, data: captureCsrfToken(result.data) };
    },
    async me() {
      const result = await request<AdminSessionResponse>({ path: '/v1/admin/me' });
      if (!result.ok) return result;
      return { ...result, data: captureCsrfToken(result.data) };
    },
    async logout() {
      const result = await request<void>({ path: '/v1/admin/auth/logout', method: 'POST' });
      // Limpa sempre, mesmo se a chamada falhar — mesma política do
      // AuthContext, que já zera admin/origin local independente do
      // resultado (um token de sessão que a UI está abandonando não serve
      // para a próxima, falhou ou não a chamada ao servidor).
      clearCsrfToken();
      return result;
    },
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
