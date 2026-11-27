/**
 * Mock da fila de documentos do PAINEL (`createMockDocumentReviewAdapter`): as mesmas regras do mock do K0
 * — 403 por papel antes de tudo, semente com prazo vencido, visualização auditada antes da URL (N5),
 * validade obrigatória/proibida, N4, idempotência, motivo só do catálogo e suspensão.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createMockDocumentReviewAdapter, type MockDocumentAuditEntry } from '../src/api/documentReviewMock';
import type { AdminRole } from '../src/api/types';

const NOW = Date.parse('2026-11-27T12:00:00Z');

function mock(initialRole: AdminRole | null = 'revisor_documentos') {
  let role = initialRole;
  const audit: MockDocumentAuditEntry[] = [];
  const port = createMockDocumentReviewAdapter({ role: () => role, now: () => NOW, delayMs: 0, onAudit: (entry) => audit.push(entry) });
  return { port, audit, setRole: (next: AdminRole | null) => (role = next) };
}

function ok<T>(result: { readonly ok: boolean; readonly data?: T; readonly error?: unknown }): T {
  assert.equal(result.ok, true, `esperava ok, veio ${JSON.stringify(result.error)}`);
  return result.data as T;
}

describe('papéis', () => {
  for (const role of ['suporte', 'financeiro', 'operacao', null] as const) {
    test(`${role ?? 'sem sessão'}: 403 em TODAS as rotas, antes do 404`, async () => {
      const { port, audit } = mock(role);
      const results = await Promise.all([
        port.queue(),
        port.driver('nao-existe'),
        port.viewUrl('nao-existe'),
        port.approve('nao-existe', {}, 'k1'),
        port.reject('nao-existe', { reasonCode: 'illegible' }, 'k2'),
        port.rejectionReasons(),
        port.suspend('nao-existe', { reason: 'motivo longo o bastante' }, 'k3'),
      ]);
      for (const result of results) assert.deepEqual(result, { ok: false, error: { kind: 'forbidden' } });
      assert.equal(audit.length, 0, '403 não deixa trilha de visualização');
    });
  }

  test('o papel é lido a cada chamada (trocar a sessão vale na hora)', async () => {
    const { port, setRole } = mock('dono');
    assert.equal((await port.queue()).ok, true);
    setRole('suporte');
    assert.deepEqual(await port.queue(), { ok: false, error: { kind: 'forbidden' } });
  });
});

describe('fila', () => {
  test('semente: 5 em análise, mais antigo primeiro, só a CNH da Ana vencida', async () => {
    const { port } = mock();
    const page = ok(await port.queue());
    assert.equal(page.items.length, 5);
    const submitted = page.items.map((item) => Date.parse(item.submittedAt));
    assert.deepEqual(submitted, [...submitted].sort((a, b) => a - b));
    assert.deepEqual(
      page.items.filter((item) => item.overdue).map((item) => item.documentId),
      ['demo-ana-cnh'],
    );
    assert.equal(page.nextCursor, undefined);
  });

  test('paginação por cursor e limite fora da faixa', async () => {
    const { port } = mock();
    const first = ok(await port.queue({ limit: 2 }));
    assert.equal(first.items.length, 2);
    assert.ok(first.nextCursor);
    const second = ok(await port.queue({ limit: 2, cursor: first.nextCursor }));
    assert.notEqual(second.items[0]?.documentId, first.items[0]?.documentId);
    assert.equal((await port.queue({ limit: 51 })).ok, false);
  });

  test('outras situações: aprovados e recusados da semente', async () => {
    const { port } = mock();
    assert.equal(ok(await port.queue({ status: 'rejected' })).items.length, 1);
    assert.equal(ok(await port.queue({ status: 'approved' })).items.length, 9);
    assert.equal(ok(await port.queue({ status: 'expired' })).items.length, 0);
  });
});

describe('visualização (N5)', () => {
  test('registra a trilha a CADA pedido, antes de devolver a URL de até 300 s', async () => {
    const { port, audit } = mock('dono');
    const link = ok(await port.viewUrl('demo-ana-cnh'));
    assert.equal(audit.length, 1);
    assert.deepEqual(audit[0], { action: 'document.view_url', targetId: 'demo-ana-cnh', actorRole: 'dono', atMs: NOW });
    assert.ok(Date.parse(link.expiresAt) - NOW <= 300_000);
    ok(await port.viewUrl('demo-ana-cnh'));
    assert.equal(audit.length, 2, 'cada visualização é uma linha');
  });

  test('o detalhe nunca traz URL', async () => {
    const { port } = mock();
    const detail = ok(await port.driver('demo-ana'));
    assert.equal(JSON.stringify(detail).includes('data:'), false);
    assert.equal(JSON.stringify(detail).includes('http'), false);
  });

  test('documento inexistente: 404, sem trilha', async () => {
    const { port, audit } = mock();
    assert.deepEqual(await port.viewUrl('nao-existe'), { ok: false, error: { kind: 'not_found' } });
    assert.equal(audit.length, 0);
  });
});

describe('aprovar', () => {
  test('tipo com validade: sem data ou data passada → campo expiresOn', async () => {
    const { port } = mock();
    const missing = await port.approve('demo-ana-cnh', {}, 'k1');
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.error.kind, 'validation');
    const past = await port.approve('demo-ana-cnh', { expiresOn: '2020-01-01' }, 'k2');
    assert.ok(!past.ok && past.error.kind === 'validation' && 'expiresOn' in past.error.fields);
  });

  test('tipo sem validade: data proibida', async () => {
    const { port } = mock();
    const result = await port.approve('demo-ana-inss', { expiresOn: '2030-01-01' }, 'k1');
    assert.ok(!result.ok && result.error.kind === 'validation' && 'expiresOn' in result.error.fields);
  });

  test('N4: o último obrigatório aprovado aprova o cadastro', async () => {
    const { port } = mock();
    const withExpiry = ['cnh', 'crlv', 'antecedentes'];
    const statuses: string[] = [];
    for (const type of ['cnh', 'crlv', 'antecedentes', 'inss', 'foto_perfil']) {
      const decision = ok(
        await port.approve(`demo-ana-${type}`, withExpiry.includes(type) ? { expiresOn: '2030-01-01' } : {}, `k-${type}`),
      );
      statuses.push(decision.driverStatus);
    }
    assert.deepEqual(statuses, ['under_review', 'under_review', 'under_review', 'under_review', 'approved']);
    assert.equal(ok(await port.driver('demo-ana')).status, 'approved');
  });

  test('idempotência: mesma chave e corpo = mesma resposta; corpo novo = 409; outra chave = já analisado', async () => {
    const { port } = mock();
    const first = ok(await port.approve('demo-ana-inss', {}, 'chave'));
    assert.deepEqual(ok(await port.approve('demo-ana-inss', {}, 'chave')), first);
    assert.deepEqual(await port.approve('demo-ana-inss', { expiresOn: '2030-01-01' }, 'chave'), {
      ok: false,
      error: { kind: 'conflict', reason: 'idempotency_key_reused' },
    });
    assert.deepEqual(await port.approve('demo-ana-inss', {}, 'outra'), { ok: false, error: { kind: 'conflict', reason: 'invalid_transition' } });
  });
});

describe('recusar', () => {
  test('motivo fora do catálogo → campo reasonCode; nota longa → dados inválidos', async () => {
    const { port } = mock();
    const unknown = await port.reject('demo-ana-cnh', { reasonCode: 'inventado' }, 'k1');
    assert.ok(!unknown.ok && unknown.error.kind === 'validation' && 'reasonCode' in unknown.error.fields);
    const longNote = await port.reject('demo-ana-cnh', { reasonCode: 'illegible', internalNote: 'x'.repeat(1001) }, 'k2');
    assert.deepEqual(longNote, { ok: false, error: { kind: 'unknown', message: 'Dados inválidos.' } });
  });

  test('recusa grava o motivo do catálogo e a nota interna fica só no detalhe do painel', async () => {
    const { port } = mock();
    const decision = ok(await port.reject('demo-ana-crlv', { reasonCode: 'wrong_document', internalNote: 'arquivo é o RG' }, 'k1'));
    assert.equal(decision.rejection?.code, 'wrong_document');
    assert.equal(decision.driverStatus, 'changes_requested');
    assert.equal('internalNote' in decision, false);
    const doc = ok(await port.driver('demo-ana')).documents.find((item) => item.documentId === 'demo-ana-crlv');
    assert.equal(doc?.internalNote, 'arquivo é o RG');
  });
});

describe('suspender', () => {
  test('motivo curto → campo reason; suspender de novo devolve a suspensão original', async () => {
    const { port, audit } = mock();
    const short = await port.suspend('demo-carla', { reason: 'curto' }, 'k1');
    assert.ok(!short.ok && short.error.kind === 'validation' && 'reason' in short.error.fields);
    const first = ok(await port.suspend('demo-carla', { reason: 'motivo longo o bastante' }, 'k2'));
    const again = ok(await port.suspend('demo-carla', { reason: 'outro motivo qualquer' }, 'k3'));
    assert.deepEqual(again, first);
    assert.equal(audit.filter((entry) => entry.action === 'driver.suspend').length, 1);
    const detail = ok(await port.driver('demo-carla'));
    assert.equal(detail.status, 'suspended');
    assert.equal(detail.suspension?.reason, 'motivo longo o bastante');
  });
});
