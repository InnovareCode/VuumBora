import type { AdminLoginInput, AdminUser, LoginOutcome, RecoveryCodes, TotpEnrollment } from './types';
import type { Result } from './result';
import { createHttpRequester } from './client';
import { clearCsrfToken, setCsrfToken } from './csrf';
import {
  parseEnrollmentConfirmResponse,
  parseEnrollmentStartResponse,
  parseLoginResponse,
  parseMeResponse,
  parseSecondFactorVerifyResponse,
} from './authResponses';

export interface AuthPort {
  login(input: AdminLoginInput): Promise<Result<LoginOutcome>>;
  /**
   * Passo 2 do login: código TOTP de 6 dígitos ou código de recuperação. Sucesso emite a sessão e diz quantos códigos de
   * recuperação ainda restam (`null` se o servidor não informar) — a tela avisa quando o acesso foi por um deles.
   */
  verifySecondFactor(input: { challengeToken: string; code: string }): Promise<Result<{ admin: AdminUser; recoveryCodesRemaining: number | null }>>;
  /** Enrolamento obrigatório (dono/financeiro) ANTES da sessão — `challengeToken` + `enrollmentToken` (código de ativação entregue fora de banda). Idempotente por 15 min. */
  startEnrollment(input: { challengeToken: string; enrollmentToken: string }): Promise<Result<TotpEnrollment>>;
  /** Confirma o primeiro código; já conclui o login e devolve os códigos de recuperação (única exibição). */
  confirmEnrollment(input: { challengeToken: string; enrollmentToken: string; code: string }): Promise<Result<{ admin: AdminUser } & RecoveryCodes>>;
  me(): Promise<Result<AdminUser>>;
  logout(): Promise<Result<void>>;
}

/**
 * Login/`/me` (contrato fechado com a Vega, 20/11/2026; segundo fator em 21/11): `AdminUser` + `csrfToken` no MESMO
 * objeto `data` — nunca em `Set-Cookie` (ver `src/api/csrf.ts`). O token só existe aqui dentro: quem consome a porta
 * (`AuthContext`) nunca precisa saber de CSRF.
 *
 * Toda resposta daqui entra como `unknown` e só vira tipo do app depois de passar por `authResponses.ts`. Falhou a
 * validação = `contract_mismatch` (FALHA FECHADA): nenhuma sessão, nenhum token de CSRF guardado. Quando painel e API
 * estão em versões diferentes o suporte precisa de rastro, então o MOTIVO vai ao console — só nomes de campo e tipos,
 * nunca valores (o corpo traz e-mail, nome e tokens).
 */
function contractMismatch(reason: string): { readonly ok: false; readonly error: { readonly kind: 'contract_mismatch' } } {
  clearCsrfToken();
  console.error(`[admin] Resposta da API incompatível com este painel (${reason}). Painel e API provavelmente estão em versões diferentes.`);
  return { ok: false, error: { kind: 'contract_mismatch' } };
}

export function createHttpAuthAdapter(baseUrl: string): AuthPort {
  const request = createHttpRequester(baseUrl);
  return {
    async login(input) {
      const result = await request<unknown>({ path: '/v1/admin/auth/login', method: 'POST', body: input });
      if (!result.ok) return result;
      const parsed = parseLoginResponse(result.data);
      if (!parsed.ok) return contractMismatch(parsed.reason);
      // Só `authenticated` emite sessão (e traz token de CSRF); os dois desafios vêm SEM cookie.
      if (parsed.value.outcome.status === 'authenticated') setCsrfToken(parsed.value.csrfToken);
      return { ...result, data: parsed.value.outcome };
    },
    async verifySecondFactor({ challengeToken, code }) {
      const result = await request<unknown>({
        path: '/v1/admin/auth/2fa/verify',
        method: 'POST',
        body: { challengeToken, code },
      });
      if (!result.ok) return result;
      const parsed = parseSecondFactorVerifyResponse(result.data);
      if (!parsed.ok) return contractMismatch(parsed.reason);
      setCsrfToken(parsed.value.csrfToken);
      return { ...result, data: { admin: parsed.value.admin, recoveryCodesRemaining: parsed.value.recoveryCodesRemaining } };
    },
    async startEnrollment({ challengeToken, enrollmentToken }) {
      const result = await request<unknown>({
        path: '/v1/admin/auth/2fa/enroll/start',
        method: 'POST',
        body: { challengeToken, enrollmentToken },
      });
      if (!result.ok) return result;
      const parsed = parseEnrollmentStartResponse(result.data);
      if (!parsed.ok) return contractMismatch(parsed.reason);
      return { ...result, data: parsed.value };
    },
    async confirmEnrollment({ challengeToken, enrollmentToken, code }) {
      const result = await request<unknown>({
        path: '/v1/admin/auth/2fa/enroll/confirm',
        method: 'POST',
        body: { challengeToken, enrollmentToken, code },
      });
      if (!result.ok) return result;
      const parsed = parseEnrollmentConfirmResponse(result.data);
      if (!parsed.ok) return contractMismatch(parsed.reason);
      setCsrfToken(parsed.value.csrfToken);
      return { ...result, data: { admin: parsed.value.admin, recoveryCodes: parsed.value.recoveryCodes } };
    },
    async me() {
      const result = await request<unknown>({ path: '/v1/admin/me' });
      if (!result.ok) return result;
      const parsed = parseMeResponse(result.data);
      if (!parsed.ok) return contractMismatch(parsed.reason);
      setCsrfToken(parsed.value.csrfToken);
      return { ...result, data: parsed.value.admin };
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
      return { ok: true, data: { status: 'authenticated', admin: session }, origin: 'mock' };
    },
    // O mock não simula o segundo fator: o fluxo real só é exercitável contra a
    // API (VITE_API_MODE=http). Chegar aqui em mock é bug de chamada.
    async verifySecondFactor() {
      await delay();
      return { ok: false, error: { kind: 'challenge_invalid' } };
    },
    async startEnrollment() {
      await delay();
      return { ok: false, error: { kind: 'challenge_invalid' } };
    },
    async confirmEnrollment() {
      await delay();
      return { ok: false, error: { kind: 'challenge_invalid' } };
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
