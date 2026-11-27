import type { Api, DocumentReviewPort, Result } from '../../src/api';
import type { AdminDriverDetail, AdminDriverDocument } from '../../src/api/documentReviewTypes';
import type { AdminRole } from '../../src/api/types';

export const SECRET = 'SEGREDO-DA-ASSINATURA';
export const DRIVER_NAME = 'Joana Teste';
export const CPF_FORMATTED = '529.982.247-25';
export const STREET = 'Rua das Dunas';

const iso = (ms: number) => new Date(ms).toISOString();

export function driverDocument(overrides: Partial<AdminDriverDocument> = {}): AdminDriverDocument {
  return {
    documentId: 'doc-cnh',
    typeCode: 'cnh',
    typeLabel: 'CNH com EAR',
    status: 'submitted',
    contentType: 'image/png',
    sizeBytes: 1200,
    submittedAt: iso(Date.now() - 60 * 3600e3),
    ...overrides,
  };
}

export function driverDetail(): AdminDriverDetail {
  return {
    driverId: 'drv-1',
    fullName: DRIVER_NAME,
    email: 'joana@exemplo.invalid',
    applicationId: 'app-1',
    status: 'under_review',
    profile: {
      cpf: '52998224725',
      birthDate: '1991-02-03',
      address: { street: STREET, number: '10', neighborhood: 'Ponta Negra', city: 'Natal', state: 'RN', postalCode: '59090000' },
      cnh: { number: '01234567890', category: 'B', expiresOn: '2031-01-01', ear: true },
    },
    vehicle: { vehicleId: 'v1', plate: 'ABC1D23', brand: 'Marca', model: 'Modelo', year: 2021, color: 'Branco' },
    documents: [driverDocument(), driverDocument({ documentId: 'doc-foto', typeCode: 'foto_perfil', typeLabel: 'Foto de perfil' })],
  };
}

export const ok = <T>(data: T): Result<T> => ({ ok: true, data, origin: 'real' });
export const forbidden = <T>(): Result<T> => ({ ok: false, error: { kind: 'forbidden' } });
export const network = <T>(): Result<T> => ({ ok: false, error: { kind: 'network', retryable: true } });

/**
 * Api falsa só com o que a área de documentos e o `AuthProvider` chamam. Cada método da porta conta as
 * chamadas em `calls`; `overrides` troca o comportamento (ex.: `viewUrl: async () => forbidden()`).
 */
export function fakeApi(overrides: Partial<DocumentReviewPort> = {}, role: AdminRole = 'revisor_documentos') {
  const calls: Record<keyof DocumentReviewPort, number> = { queue: 0, driver: 0, viewUrl: 0, approve: 0, reject: 0, rejectionReasons: 0, suspend: 0 };
  const base: DocumentReviewPort = {
    async queue() {
      return ok({ items: [] });
    },
    async driver() {
      return ok(driverDetail());
    },
    async viewUrl() {
      return ok({ url: `https://bucket.exemplo.invalid/doc.png?sig=${SECRET}`, expiresAt: iso(Date.now() + 300_000) });
    },
    async approve(documentId) {
      return ok({ documentId, status: 'approved', reviewedAt: iso(Date.now()), driverStatus: 'under_review' });
    },
    async reject(documentId, input) {
      return ok({ documentId, status: 'rejected', reviewedAt: iso(Date.now()), rejection: { code: input.reasonCode, text: 'texto' }, driverStatus: 'changes_requested' });
    },
    async rejectionReasons() {
      return ok([{ code: 'illegible', text: 'Não conseguimos ler o documento.' }]);
    },
    async suspend(driverId) {
      return ok({ driverId, status: 'suspended', suspendedAt: iso(Date.now()) });
    },
  };
  const merged = { ...base, ...overrides };
  const documentReview = Object.fromEntries(
    (Object.keys(calls) as (keyof DocumentReviewPort)[]).map((name) => [
      name,
      (...args: unknown[]) => {
        calls[name] += 1;
        return (merged[name] as (...a: unknown[]) => unknown)(...args);
      },
    ]),
  ) as unknown as DocumentReviewPort;
  const api = {
    mode: 'http',
    auth: { me: async () => ok({ id: 'adm-1', name: 'Revisora', email: 'revisora@exemplo.invalid', role }) },
    documentReview,
  } as unknown as Api;
  return { api, calls };
}
