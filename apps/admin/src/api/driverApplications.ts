import type {
  DriverApplication,
  DriverApplicationDecision,
  DriverApplicationListParams,
  DriverApplicationListResult,
  DriverApplicationSummary,
} from './types';
import type { Result } from './result';
import { createHttpRequester } from './client';

export interface DriverApplicationPort {
  list(params: DriverApplicationListParams): Promise<Result<DriverApplicationListResult>>;
  get(id: string): Promise<Result<DriverApplication>>;
  summary(): Promise<Result<DriverApplicationSummary>>;
  /** `409 { kind: 'conflict' }` se a candidatura já tinha sido decidida; `403 forbidden` se o papel não permite. */
  approve(id: string, idempotencyKey: string): Promise<Result<DriverApplicationDecision>>;
  /** `reason` é obrigatório e não é validado aqui — a tela já bloqueia o envio vazio antes de chamar isto. */
  reject(id: string, reason: string, idempotencyKey: string): Promise<Result<DriverApplicationDecision>>;
}

export function createHttpDriverApplicationAdapter(baseUrl: string): DriverApplicationPort {
  const request = createHttpRequester(baseUrl);
  return {
    list(params) {
      const query = new URLSearchParams();
      if (params.status) query.set('status', params.status);
      if (params.q) query.set('q', params.q);
      if (params.cursor) query.set('cursor', params.cursor);
      if (params.limit) query.set('limit', String(params.limit));
      const qs = query.toString();
      return request<DriverApplicationListResult>({ path: `/v1/admin/driver-applications${qs ? `?${qs}` : ''}` });
    },
    get(id) {
      return request<DriverApplication>({ path: `/v1/admin/driver-applications/${encodeURIComponent(id)}` });
    },
    summary() {
      return request<DriverApplicationSummary>({ path: '/v1/admin/driver-applications/summary' });
    },
    approve(id, idempotencyKey) {
      return request<DriverApplicationDecision>({
        path: `/v1/admin/driver-applications/${encodeURIComponent(id)}/approve`,
        method: 'POST',
        idempotencyKey,
      });
    },
    reject(id, reason, idempotencyKey) {
      return request<DriverApplicationDecision>({
        path: `/v1/admin/driver-applications/${encodeURIComponent(id)}/reject`,
        method: 'POST',
        body: { reason },
        idempotencyKey,
      });
    },
  };
}

// ---- Mock explícito — ver src/api/index.ts para quando ele é escolhido. ----

/** `let`, não `const`: `approve`/`reject` do mock substituem o item decidido. */
let MOCK_APPLICATIONS: readonly DriverApplication[] = [
  mk('1', 'Francisco das Chagas Silva', 'francisco.chagas@example.com', '+5584999110022', 'Natal', 'RN', true, true, 'pending', '2026-11-18T13:42:00-03:00'),
  mk('2', 'Maria Eduarda Costa', 'maria.eduarda@example.com', '+5584998223344', 'Parnamirim', 'RN', false, true, 'pending', '2026-11-18T09:05:00-03:00'),
  mk('3', 'João Victor Araújo', 'joao.araujo@example.com', '+5584997334455', 'Natal', 'RN', true, false, 'approved', '2026-11-15T16:20:00-03:00', {
    decidedAt: '2026-11-15T18:00:00-03:00',
    decidedByName: 'Admin (demonstração)',
  }),
  mk('4', 'Ana Paula Souza', 'ana.souza@example.com', '+5584996445566', 'São Gonçalo do Amarante', 'RN', false, false, 'rejected', '2026-11-14T11:10:00-03:00', {
    decidedAt: '2026-11-14T15:30:00-03:00',
    decidedByName: 'Admin (demonstração)',
    decisionReason: 'Telefone informado não atende e o e-mail não respondeu ao contato.',
  }),
  mk('5', 'Carlos Henrique Lima', 'carlos.lima@example.com', '+5584995556677', 'Natal', 'RN', null, true, 'pending', '2026-11-19T08:15:00-03:00'),
  mk('6', 'Fernanda Albuquerque', 'fernanda.albuquerque@example.com', '+5584994667788', 'Natal', 'RN', true, true, 'approved', '2026-11-10T14:30:00-03:00', {
    decidedAt: '2026-11-10T16:45:00-03:00',
    decidedByName: 'Admin (demonstração)',
  }),
  mk('7', 'Pedro Henrique Dantas', 'pedro.dantas@example.com', '+5584993778899', 'Macaíba', 'RN', false, null, 'pending', '2026-11-19T19:50:00-03:00'),
  mk('8', 'Luciana Freire', 'luciana.freire@example.com', '+5584992889900', 'Ceará-Mirim', 'RN', true, true, 'rejected', '2026-11-12T10:00:00-03:00', {
    decidedAt: '2026-11-13T10:00:00-03:00',
    decidedByName: 'Admin (demonstração)',
    decisionReason: 'Candidatura duplicada — já existe cadastro aprovado com o mesmo CPF.',
  }),
];

function mk(
  id: string,
  name: string,
  email: string,
  phone: string,
  city: string,
  state: string,
  alreadyDrivesForApp: boolean | null,
  hasOwnVehicle: boolean | null,
  status: DriverApplication['status'],
  createdAt: string,
  decided?: { readonly decidedAt: string; readonly decidedByName: string; readonly decisionReason?: string },
): DriverApplication {
  return {
    id,
    name,
    email,
    phone,
    city,
    state,
    alreadyDrivesForApp,
    hasOwnVehicle,
    status,
    source: 'site',
    createdAt,
    decidedAt: decided?.decidedAt ?? null,
    decidedBy: decided ? { id: 'mock-admin-1', name: decided.decidedByName } : null,
    decisionReason: decided?.decisionReason ?? null,
  };
}

/** Mesmo id/nome do `FAKE_USER` em `src/api/auth.ts` — o "admin logado" do mock. */
const MOCK_DECIDER = { id: 'mock-admin-1', name: 'Admin (demonstração)' };

function mockDecide(id: string, outcome: 'approved' | 'rejected', reason: string | null): Promise<Result<DriverApplicationDecision>> {
  return delay().then(() => {
    const found = MOCK_APPLICATIONS.find((a) => a.id === id);
    if (!found) return { ok: false, error: { kind: 'not_found' } };
    // Mesma regra do backend real: candidatura já decidida não decide de novo.
    if (found.status !== 'pending') return { ok: false, error: { kind: 'conflict', reason: 'invalid_transition' } };

    const decidedAt = new Date().toISOString();
    MOCK_APPLICATIONS = MOCK_APPLICATIONS.map((a) =>
      a.id === id ? { ...a, status: outcome, decidedAt, decidedBy: MOCK_DECIDER, decisionReason: reason } : a,
    );
    return {
      ok: true,
      data: { id, status: outcome, decidedAt, decidedBy: MOCK_DECIDER, ...(reason ? { decisionReason: reason } : {}) },
      origin: 'mock',
    };
  });
}

export function createMockDriverApplicationAdapter(): DriverApplicationPort {
  return {
    async list(params) {
      await delay();
      let items = MOCK_APPLICATIONS;
      if (params.status) items = items.filter((a) => a.status === params.status);
      if (params.q) {
        const q = params.q.trim().toLowerCase();
        items = items.filter(
          (a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || a.phone.includes(q) || a.city.toLowerCase().includes(q),
        );
      }
      items = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { ok: true, data: { items, nextCursor: null }, origin: 'mock' };
    },
    async get(id) {
      await delay();
      const found = MOCK_APPLICATIONS.find((a) => a.id === id);
      if (!found) return { ok: false, error: { kind: 'not_found' } };
      return { ok: true, data: found, origin: 'mock' };
    },
    async summary() {
      await delay();
      const summary = MOCK_APPLICATIONS.reduce(
        (acc, a) => ({ ...acc, [a.status]: acc[a.status] + 1 }),
        { pending: 0, approved: 0, rejected: 0 },
      );
      return { ok: true, data: summary, origin: 'mock' };
    },
    // `idempotencyKey` não é usado pelo mock (não há rede de verdade para
    // repetir a chamada) — existe só para a porta ter a mesma assinatura do
    // adaptador HTTP.
    approve(id, _idempotencyKey) {
      return mockDecide(id, 'approved', null);
    },
    reject(id, reason, _idempotencyKey) {
      return mockDecide(id, 'rejected', reason);
    },
  };
}

function delay(ms = 350): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
