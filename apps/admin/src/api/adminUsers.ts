import type {
  ActivateAdminUserInput,
  ActivateAdminUserResult,
  AdminRole,
  AdminUserCreateInput,
  AdminUserCreateResult,
  AdminUserListParams,
  AdminUserListResult,
  AdminUserRecord,
  AdminUserStepUp,
} from './types';
import type { Result } from './result';
import { createHttpRequester } from './client';
import {
  parseActivateAdminUserResponse,
  parseAdminUserCreateResponse,
  parseAdminUserListResponse,
  parseAdminUserMutationResponse,
} from './adminUserResponses';

/** Gestão de usuários do painel (F07) — contrato docs/contrato-admin-usuarios.md. Só o papel `dono` chama isto (o
 * menu já esconde a rota para os outros papéis; quem protege de verdade é o 403 do servidor). */
export interface AdminUserPort {
  list(params: AdminUserListParams): Promise<Result<AdminUserListResult>>;
  /** `password`/`code` são a reautenticação de QUEM CHAMA — o usuário novo nasce sem senha (ver `activationToken`). */
  create(input: AdminUserCreateInput): Promise<Result<AdminUserCreateResult>>;
  deactivate(id: string, password: string): Promise<Result<AdminUserRecord>>;
  /** `code` só é exigido pelo servidor quando o ALVO já é `dono` (reativar `financeiro`/outros é só senha). */
  reactivate(id: string, stepUp: AdminUserStepUp): Promise<Result<AdminUserRecord>>;
  /** `code` só é exigido pelo servidor quando o NOVO papel é `dono`/`financeiro` (promoção). */
  changeRole(id: string, role: AdminRole, stepUp: AdminUserStepUp): Promise<Result<AdminUserRecord>>;
  /** SEM sessão — primeiro acesso de quem acabou de ser criado (`/auth/activate`). */
  activate(input: ActivateAdminUserInput): Promise<Result<ActivateAdminUserResult>>;
}

function contractMismatch(reason: string): { readonly ok: false; readonly error: { readonly kind: 'contract_mismatch' } } {
  console.error(`[admin] Resposta de gestão de usuários incompatível com este painel (${reason}).`);
  return { ok: false, error: { kind: 'contract_mismatch' } };
}

export function createHttpAdminUserAdapter(baseUrl: string): AdminUserPort {
  const request = createHttpRequester(baseUrl);
  return {
    async list(params) {
      const query = new URLSearchParams();
      if (params.role) query.set('role', params.role);
      if (params.includeDeactivated) query.set('includeDeactivated', 'true');
      if (params.cursor) query.set('cursor', params.cursor);
      if (params.limit) query.set('limit', String(params.limit));
      const qs = query.toString();
      const result = await request<unknown>({ path: `/v1/admin/users${qs ? `?${qs}` : ''}` });
      if (!result.ok) return result;
      const parsed = parseAdminUserListResponse(result.data);
      if (!parsed.ok) return contractMismatch(parsed.reason);
      return { ...result, data: parsed.value };
    },
    async create(input) {
      const result = await request<unknown>({
        path: '/v1/admin/users',
        method: 'POST',
        body: { name: input.name, email: input.email, role: input.role, password: input.password, ...(input.code ? { code: input.code } : {}) },
      });
      if (!result.ok) return result;
      const parsed = parseAdminUserCreateResponse(result.data);
      if (!parsed.ok) return contractMismatch(parsed.reason);
      return { ...result, data: parsed.value };
    },
    async deactivate(id, password) {
      const result = await request<unknown>({ path: `/v1/admin/users/${encodeURIComponent(id)}/deactivate`, method: 'POST', body: { password } });
      if (!result.ok) return result;
      const parsed = parseAdminUserMutationResponse(result.data);
      if (!parsed.ok) return contractMismatch(parsed.reason);
      return { ...result, data: parsed.value };
    },
    async reactivate(id, stepUp) {
      const result = await request<unknown>({
        path: `/v1/admin/users/${encodeURIComponent(id)}/reactivate`,
        method: 'POST',
        body: { password: stepUp.password, ...(stepUp.code ? { code: stepUp.code } : {}) },
      });
      if (!result.ok) return result;
      const parsed = parseAdminUserMutationResponse(result.data);
      if (!parsed.ok) return contractMismatch(parsed.reason);
      return { ...result, data: parsed.value };
    },
    async changeRole(id, role, stepUp) {
      const result = await request<unknown>({
        path: `/v1/admin/users/${encodeURIComponent(id)}/role`,
        method: 'POST',
        body: { role, password: stepUp.password, ...(stepUp.code ? { code: stepUp.code } : {}) },
      });
      if (!result.ok) return result;
      const parsed = parseAdminUserMutationResponse(result.data);
      if (!parsed.ok) return contractMismatch(parsed.reason);
      return { ...result, data: parsed.value };
    },
    async activate(input) {
      const result = await request<unknown>({ path: '/v1/admin/auth/activate', method: 'POST', body: input });
      if (!result.ok) return result;
      const parsed = parseActivateAdminUserResponse(result.data);
      if (!parsed.ok) return contractMismatch(parsed.reason);
      return { ...result, data: parsed.value };
    },
  };
}

// ---- Mock explícito — mesmo espírito de driverApplications.ts: dado fictício fixo, nunca um fallback silencioso
// quando a API real falha (ver src/api/index.ts). Só serve para a tela ter o que mostrar em VITE_API_MODE=mock. ----

function delay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface MockPending {
  readonly token: string;
  readonly email: string;
}

let MOCK_USERS: readonly AdminUserRecord[] = [
  // Mesmo id do `FAKE_USER` em auth.ts — o "admin logado" em modo mock é o próprio dono #1.
  { id: 'mock-admin-1', name: 'Admin (demonstração)', email: 'admin@vuumbora.com.br', role: 'dono', createdAt: '2026-01-10T09:00:00-03:00', deactivatedAt: null },
  { id: 'mock-admin-2', name: 'Camila Nogueira', email: 'camila.nogueira@vuumbora.com.br', role: 'operacao', createdAt: '2026-03-02T10:30:00-03:00', deactivatedAt: null },
  { id: 'mock-admin-3', name: 'Rafael Teixeira', email: 'rafael.teixeira@vuumbora.com.br', role: 'revisor_documentos', createdAt: '2026-05-18T14:15:00-03:00', deactivatedAt: null },
  { id: 'mock-admin-4', name: 'Beatriz Lemos', email: 'beatriz.lemos@vuumbora.com.br', role: 'financeiro', createdAt: '2026-07-22T11:00:00-03:00', deactivatedAt: null },
  { id: 'mock-admin-5', name: 'Diego Farias', email: 'diego.farias@vuumbora.com.br', role: 'suporte', createdAt: '2026-08-05T16:45:00-03:00', deactivatedAt: '2026-10-01T09:00:00-03:00' },
];

let MOCK_PENDING: readonly MockPending[] = [];
let mockSequence = MOCK_USERS.length;

function mockToken(): string {
  const raw = Math.random().toString(36).slice(2).toUpperCase().padEnd(20, 'X');
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`;
}

export function createMockAdminUserAdapter(): AdminUserPort {
  return {
    async list(params) {
      await delay();
      let items = MOCK_USERS;
      if (!params.includeDeactivated) items = items.filter((u) => u.deactivatedAt === null);
      if (params.role) items = items.filter((u) => u.role === params.role);
      items = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { ok: true, data: { items, nextCursor: null }, origin: 'mock' };
    },
    async create(input) {
      await delay();
      if (MOCK_USERS.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
        return { ok: false, error: { kind: 'conflict', reason: 'email_taken' } };
      }
      mockSequence += 1;
      const now = new Date().toISOString();
      const user: AdminUserRecord = { id: `mock-admin-${mockSequence}`, name: input.name, email: input.email, role: input.role, createdAt: now, deactivatedAt: null };
      MOCK_USERS = [...MOCK_USERS, user];
      const token = mockToken();
      MOCK_PENDING = [...MOCK_PENDING, { token, email: input.email }];
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      return { ok: true, data: { ...user, activationToken: token, activationTokenExpiresAt: expiresAt }, origin: 'mock' };
    },
    async deactivate(id) {
      await delay();
      const found = MOCK_USERS.find((u) => u.id === id);
      if (!found) return { ok: false, error: { kind: 'not_found' } };
      if (found.role === 'dono' && MOCK_USERS.filter((u) => u.role === 'dono' && u.deactivatedAt === null && u.id !== id).length === 0) {
        return { ok: false, error: { kind: 'conflict', reason: 'last_owner' } };
      }
      const updated = { ...found, deactivatedAt: found.deactivatedAt ?? new Date().toISOString() };
      MOCK_USERS = MOCK_USERS.map((u) => (u.id === id ? updated : u));
      return { ok: true, data: updated, origin: 'mock' };
    },
    async reactivate(id) {
      await delay();
      const found = MOCK_USERS.find((u) => u.id === id);
      if (!found) return { ok: false, error: { kind: 'not_found' } };
      const updated = { ...found, deactivatedAt: null };
      MOCK_USERS = MOCK_USERS.map((u) => (u.id === id ? updated : u));
      return { ok: true, data: updated, origin: 'mock' };
    },
    async changeRole(id, role) {
      await delay();
      const found = MOCK_USERS.find((u) => u.id === id);
      if (!found) return { ok: false, error: { kind: 'not_found' } };
      if (found.role === role) return { ok: true, data: found, origin: 'mock' };
      if (found.role === 'dono' && found.deactivatedAt === null && MOCK_USERS.filter((u) => u.role === 'dono' && u.deactivatedAt === null && u.id !== id).length === 0) {
        return { ok: false, error: { kind: 'conflict', reason: 'last_owner' } };
      }
      const updated = { ...found, role };
      MOCK_USERS = MOCK_USERS.map((u) => (u.id === id ? updated : u));
      return { ok: true, data: updated, origin: 'mock' };
    },
    async activate(input) {
      await delay();
      const pending = MOCK_PENDING.find((p) => p.token === input.token && p.email.toLowerCase() === input.email.toLowerCase());
      if (!pending) return { ok: false, error: { kind: 'activation_token_invalid' } };
      MOCK_PENDING = MOCK_PENDING.filter((p) => p !== pending);
      const user = MOCK_USERS.find((u) => u.email.toLowerCase() === input.email.toLowerCase());
      const role = user?.role ?? 'suporte';
      const requiresTwoFactorEnrollment = role === 'dono' || role === 'financeiro';
      if (!requiresTwoFactorEnrollment) return { ok: true, data: { role, requiresTwoFactorEnrollment: false }, origin: 'mock' };
      return {
        ok: true,
        data: {
          role,
          requiresTwoFactorEnrollment: true,
          enrollmentToken: mockToken(),
          enrollmentTokenExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        },
        origin: 'mock',
      };
    },
  };
}
