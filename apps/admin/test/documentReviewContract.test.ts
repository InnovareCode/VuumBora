/**
 * O espelho do painel contra o contrato REAL do K0 (`@vuumbora/api-client/admin`), em runtime: a saída do
 * mock do K0 (o que o servidor da D5 vai imitar) passa pelos validadores fail-closed do painel. Se o K0
 * mudar um campo, um estado ou um papel, isto (ou `contract/documentReview.contract.ts`) quebra antes da
 * tela. Só roda no `npm test` do admin — nunca entra no bundle.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  DOCUMENT_REVIEW_ERRORS,
  DOCUMENT_REVIEW_ROLES as PKG_ROLES,
  createDocumentStore,
  createMockDocumentReview,
} from '@vuumbora/api-client/admin';
import { DOCUMENT_REVIEW_FIELD_BY_CODE, DOCUMENT_REVIEW_ROLES } from '../src/api/documentReviewTypes';
import {
  parseAdminDriverDetailResponse,
  parseDocumentDecisionResponse,
  parseDocumentReviewQueueResponse,
  parseDocumentViewUrlResponse,
  parseDriverSuspensionResponse,
  parseRejectionReasonsResponse,
} from '../src/api/documentReviewResponses';

const NOW = Date.parse('2026-11-27T12:00:00Z');

function k0() {
  const store = createDocumentStore({ clock: () => NOW, seed: 'demo' });
  return createMockDocumentReview({ role: 'revisor_documentos', store });
}

function data<T>(result: { readonly ok: boolean; readonly data?: T }): T {
  assert.equal(result.ok, true, 'o mock do K0 devia responder ok');
  return result.data as T;
}

describe('espelho de valores (o typecheck cobre os tipos; isto cobre as constantes)', () => {
  test('mesmos papéis de revisão', () => {
    assert.deepEqual([...DOCUMENT_REVIEW_ROLES].sort(), [...PKG_ROLES].sort());
  });

  test('mesmo mapa code → campo do catálogo de erros', () => {
    const fromCatalog: Record<string, string> = {};
    for (const [code, entry] of Object.entries(DOCUMENT_REVIEW_ERRORS)) {
      if ('field' in entry && typeof entry.field === 'string') fromCatalog[code] = entry.field;
    }
    assert.deepEqual({ ...DOCUMENT_REVIEW_FIELD_BY_CODE }, fromCatalog);
  });
});

describe('a saída do mock do K0 passa pelos validadores do painel', () => {
  test('fila (as quatro situações)', async () => {
    const { port } = k0();
    for (const status of ['submitted', 'approved', 'rejected', 'expired'] as const) {
      const page = data(await port.queue({ status }));
      const parsed = parseDocumentReviewQueueResponse(page);
      assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.reason);
      if (parsed.ok) assert.deepEqual(parsed.value, page);
    }
  });

  test('fila paginada (com nextCursor)', async () => {
    const { port } = k0();
    const page = data(await port.queue({ limit: 2 }));
    assert.ok(page.nextCursor, 'a semente tem mais de 2 documentos em análise');
    const parsed = parseDocumentReviewQueueResponse(page);
    assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.reason);
    if (parsed.ok) assert.deepEqual(parsed.value, page);
  });

  test('detalhe dos três motoristas da semente', async () => {
    const { port } = k0();
    for (const driverId of ['demo-ana', 'demo-bruno', 'demo-carla']) {
      const detail = data(await port.driver(driverId));
      const parsed = parseAdminDriverDetailResponse(detail);
      assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.reason);
      if (parsed.ok) assert.deepEqual(parsed.value, detail);
    }
  });

  test('link de visualização (https do mock do K0)', async () => {
    const { port } = k0();
    const link = data(await port.viewUrl('demo-ana-cnh'));
    const parsed = parseDocumentViewUrlResponse(link);
    assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.reason);
    if (parsed.ok) assert.deepEqual(parsed.value, link);
  });

  test('aprovar (com validade), recusar (com nota) e o efeito N4', async () => {
    const { port } = k0();
    const approved = data(await port.approve('demo-ana-cnh', { expiresOn: '2030-01-01' }, 'k-1'));
    const parsedApproved = parseDocumentDecisionResponse(approved);
    assert.equal(parsedApproved.ok, true, parsedApproved.ok ? '' : parsedApproved.reason);
    if (parsedApproved.ok) assert.deepEqual(parsedApproved.value, approved);

    const rejected = data(await port.reject('demo-ana-crlv', { reasonCode: 'illegible', internalNote: 'nota' }, 'k-2'));
    const parsedRejected = parseDocumentDecisionResponse(rejected);
    assert.equal(parsedRejected.ok, true, parsedRejected.ok ? '' : parsedRejected.reason);
    if (parsedRejected.ok) assert.deepEqual(parsedRejected.value, rejected);
    // A nota interna não está na RESPOSTA da decisão (só no detalhe do painel).
    assert.equal('internalNote' in rejected, false);
  });

  test('catálogo de motivos e suspensão', async () => {
    const { port } = k0();
    const reasons = data(await port.rejectionReasons());
    const parsedReasons = parseRejectionReasonsResponse(reasons);
    assert.equal(parsedReasons.ok, true, parsedReasons.ok ? '' : parsedReasons.reason);
    if (parsedReasons.ok) assert.deepEqual(parsedReasons.value, reasons);

    const suspension = data(await port.suspend('demo-bruno', { reason: 'motivo de teste longo' }, 'k-3'));
    const parsedSuspension = parseDriverSuspensionResponse(suspension);
    assert.equal(parsedSuspension.ok, true, parsedSuspension.ok ? '' : parsedSuspension.reason);
    if (parsedSuspension.ok) assert.deepEqual(parsedSuspension.value, suspension);
  });
});
