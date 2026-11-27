/**
 * `createMockDocumentReview` (M3, fatia K0 do `docs/plano-m3-m4.md`; fila do painel, D7): papéis,
 * fila (ordem, prazo vencido, cursor), visualização auditada (N5), aprovar/recusar com idempotência,
 * aprovação automática da conta (N4) e suspensão. E a store compartilhada com o app do motorista.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createMockDocumentReview } from '../src/admin/document-review-mock-adapter';
import type { AdminRole } from '../src/admin/types';
import { createDocumentStore } from '../src/documents/mock-store';
import { createMockDriverOnboarding } from '../src/driver/onboarding-mock-adapter';

const NOW = Date.parse('2026-11-27T12:00:00Z');
const HOUR = 60 * 60 * 1000;

function demo(role: AdminRole = 'revisor_documentos') {
  let clockMs = NOW;
  const store = createDocumentStore({ clock: () => clockMs, seed: 'demo' });
  const mock = createMockDocumentReview({ role, store });
  return { ...mock, advance: (ms: number) => (clockMs += ms) };
}

function expectError(result: { ok: boolean; error?: { kind: string; code?: string } }, kind: string, code: string): void {
  assert.equal(result.ok, false, `esperava ${code}`);
  assert.equal(result.error?.kind, kind);
  assert.equal(result.error?.code, code);
}

describe('papéis: só revisor_documentos e dono', () => {
  for (const role of ['suporte', 'financeiro', 'operacao'] as const) {
    test(`${role}: 403 forbidden em TODAS as rotas, antes do 404`, async () => {
      const { port, control } = demo(role);
      const calls = [
        port.queue(),
        port.driver('nao-existe'),
        port.viewUrl('nao-existe'),
        port.approve('nao-existe', {}, 'k1'),
        port.reject('nao-existe', { reasonCode: 'illegible' }, 'k2'),
        port.rejectionReasons(),
        port.suspend('nao-existe', { reason: 'motivo longo o bastante' }, 'k3'),
      ];
      for (const result of await Promise.all(calls)) expectError(result, 'forbidden', 'forbidden');
      assert.equal(control.auditLog().length, 0, 'nada auditado: a recusa vem antes de tudo');
    });
  }

  test('dono e revisor_documentos passam', async () => {
    assert.ok((await demo('dono').port.queue()).ok);
    assert.ok((await demo('revisor_documentos').port.queue()).ok);
  });
});

describe('fila', () => {
  test('mais antigo primeiro, com o prazo vencido destacado; nenhuma URL nos itens', async () => {
    const { port } = demo();
    const page = await port.queue();
    assert.ok(page.ok);
    const items = page.data.items;
    assert.equal(items.length, 5, 'os 5 enviados da motorista em análise');
    const times = items.map((item) => Date.parse(item.submittedAt));
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
    assert.equal(items[0]?.typeCode, 'cnh');
    assert.equal(items[0]?.overdue, true);
    assert.ok(items.slice(1).every((item) => !item.overdue));
    assert.equal(items[0]?.reviewDeadline, new Date(Date.parse(items[0]?.submittedAt ?? '') + 48 * HOUR).toISOString());
    assert.ok(!JSON.stringify(items).includes('http'), 'URL só no clique (viewUrl)');
  });

  test('paginação por cursor, limite e 400 invalid_cursor / invalid_body', async () => {
    const { port } = demo();
    const first = await port.queue({ limit: 2 });
    assert.ok(first.ok);
    assert.equal(first.data.items.length, 2);
    assert.ok(first.data.nextCursor);
    const second = await port.queue({ limit: 2, cursor: first.data.nextCursor ?? '' });
    assert.ok(second.ok);
    assert.notEqual(second.data.items[0]?.documentId, first.data.items[0]?.documentId);
    const last = await port.queue({ limit: 50, cursor: second.data.nextCursor ?? '' });
    assert.ok(last.ok);
    assert.equal(last.data.nextCursor, undefined);

    expectError(await port.queue({ cursor: 'inventado' }), 'validation', 'invalid_cursor');
    expectError(await port.queue({ limit: 51 }), 'validation', 'invalid_body');
    expectError(await port.queue({ limit: 0 }), 'validation', 'invalid_body');
    expectError(await port.queue({ status: 'pending_upload' as never }), 'validation', 'invalid_body');
  });

  test('filtro por status', async () => {
    const { port } = demo();
    const rejected = await port.queue({ status: 'rejected' });
    assert.ok(rejected.ok);
    assert.deepEqual(rejected.data.items.map((item) => item.driverName), ['Bruno Exemplo']);
  });
});

describe('detalhe e visualização', () => {
  test('detalhe traz cadastro, veículo e documentos SEM URL; 404 para desconhecido', async () => {
    const { port } = demo();
    const detail = await port.driver('demo-bruno');
    assert.ok(detail.ok);
    assert.equal(detail.data.status, 'changes_requested');
    assert.equal(detail.data.profile?.cnh.ear, true);
    assert.equal(detail.data.vehicle?.plate, 'RTY2B34');
    assert.equal(detail.data.documents.find((doc) => doc.typeCode === 'cnh')?.internalNote, 'Foto com reflexo no número.');
    assert.ok(!JSON.stringify(detail.data).includes('http'));
    expectError(await port.driver('nao-existe'), 'not_found', 'not_found');
  });

  test('N5: cada visualização grava a trilha ANTES de devolver a URL de 300 s', async () => {
    const { port, control } = demo();
    const link = await port.viewUrl('demo-ana-cnh');
    assert.ok(link.ok);
    assert.equal(link.data.expiresAt, new Date(NOW + 300_000).toISOString());
    assert.deepEqual(control.auditLog(), [{ action: 'document.view_url', targetId: 'demo-ana-cnh', actorRole: 'revisor_documentos', atMs: NOW }]);
    await port.viewUrl('demo-ana-cnh');
    assert.equal(control.auditLog().length, 2, 'duas visualizações, duas linhas');
  });

  test('viewUrl: 404 para inexistente e para documento ainda não enviado (pending_upload)', async () => {
    const store = createDocumentStore({ clock: () => NOW });
    const driver = createMockDriverOnboarding({ store, driverId: 'd1' });
    await driver.port.linkApplication();
    const target = await driver.port.requestUploadUrl({ typeCode: 'cnh', contentType: 'image/png', sizeBytes: 10, sha256: 'c'.repeat(64) });
    assert.ok(target.ok);
    const { port, control } = createMockDocumentReview({ role: 'dono', store });
    expectError(await port.viewUrl(target.data.documentId), 'not_found', 'not_found');
    expectError(await port.viewUrl('nao-existe'), 'not_found', 'not_found');
    assert.equal(control.auditLog().length, 0);
  });
});

describe('aprovar', () => {
  test('tipo com validade exige expiresOn futuro (422 invalid_expires_on no campo expiresOn)', async () => {
    const { port } = demo();
    for (const input of [{}, { expiresOn: '2026-11-26' }, { expiresOn: '2027-02-30' }]) {
      const result = await port.approve('demo-ana-cnh', input, `k-${JSON.stringify(input)}`);
      expectError(result, 'validation', 'invalid_expires_on');
      if (!result.ok && result.error.kind === 'validation') assert.ok('expiresOn' in result.error.fields);
    }
    const ok = await port.approve('demo-ana-cnh', { expiresOn: '2026-11-27' }, 'k-ok');
    assert.ok(ok.ok, 'hoje ainda vale');
  });

  test('tipo SEM validade recusa expiresOn', async () => {
    const { port } = demo();
    expectError(await port.approve('demo-ana-inss', { expiresOn: '2030-01-01' }, 'k'), 'validation', 'invalid_expires_on');
    assert.ok((await port.approve('demo-ana-inss', {}, 'k2')).ok);
  });

  test('N4: aprovar o último obrigatório aprova a conta; a resposta mostra driverStatus', async () => {
    const { port } = demo();
    const decisions = [
      await port.approve('demo-ana-cnh', { expiresOn: '2030-01-01' }, 'a1'),
      await port.approve('demo-ana-crlv', { expiresOn: '2030-01-01' }, 'a2'),
      await port.approve('demo-ana-criminal_record', { expiresOn: '2027-01-01' }, 'a3'),
      await port.approve('demo-ana-inss', {}, 'a4'),
    ];
    for (const decision of decisions) {
      assert.ok(decision.ok);
      assert.equal(decision.data.driverStatus, 'under_review');
    }
    const last = await port.approve('demo-ana-profile_photo', {}, 'a5');
    assert.ok(last.ok);
    assert.equal(last.data.status, 'approved');
    assert.equal(last.data.driverStatus, 'approved');
    const detail = await port.driver('demo-ana');
    assert.ok(detail.ok);
    assert.equal(detail.data.status, 'approved');
  });

  test('idempotência: mesma chave e corpo = mesma resposta; corpo diferente = 409 idempotency_key_reused; outra chave = 409 invalid_transition', async () => {
    const { port, control } = demo();
    const first = await port.approve('demo-ana-inss', {}, 'chave');
    const replay = await port.approve('demo-ana-inss', {}, 'chave');
    assert.ok(first.ok && replay.ok);
    assert.deepEqual(replay.data, first.data);
    assert.equal(control.auditLog().filter((entry) => entry.action === 'document.approve').length, 1, 'uma decisão, uma linha');
    expectError(await port.reject('demo-ana-inss', { reasonCode: 'illegible' }, 'chave'), 'conflict', 'idempotency_key_reused');
    expectError(await port.approve('demo-ana-inss', {}, 'outra'), 'conflict', 'invalid_transition');
  });

  test('400 idempotency_key_required e 404', async () => {
    const { port } = demo();
    expectError(await port.approve('demo-ana-inss', {}, ''), 'validation', 'idempotency_key_required');
    expectError(await port.approve('nao-existe', {}, 'k'), 'not_found', 'not_found');
  });
});

describe('recusar', () => {
  test('422 unknown_reason no campo reasonCode; motivo do catálogo funciona', async () => {
    const { port } = demo();
    const bad = await port.reject('demo-ana-cnh', { reasonCode: 'inventado' }, 'r1');
    expectError(bad, 'validation', 'unknown_reason');
    if (!bad.ok && bad.error.kind === 'validation') assert.ok('reasonCode' in bad.error.fields);
    const reasons = await port.rejectionReasons();
    assert.ok(reasons.ok);
    const code = reasons.data[0]?.code ?? '';
    const ok = await port.reject('demo-ana-cnh', { reasonCode: code, internalNote: 'interna' }, 'r2');
    assert.ok(ok.ok);
    assert.equal(ok.data.status, 'rejected');
    assert.equal(ok.data.rejection?.code, code);
    assert.equal(ok.data.driverStatus, 'changes_requested');
  });

  test('nota interna acima de 1000 é 400 invalid_body; documento já decidido é 409', async () => {
    const { port } = demo();
    expectError(await port.reject('demo-ana-cnh', { reasonCode: 'illegible', internalNote: 'x'.repeat(1001) }, 'r'), 'validation', 'invalid_body');
    expectError(await port.reject('demo-carla-cnh', { reasonCode: 'illegible' }, 'r2'), 'conflict', 'invalid_transition');
  });
});

describe('suspender', () => {
  test('motivo de 10 a 1000 caracteres (400 validation_failed no campo reason); 404', async () => {
    const { port } = demo();
    const short = await port.suspend('demo-carla', { reason: 'curto' }, 's1');
    expectError(short, 'validation', 'validation_failed');
    if (!short.ok && short.error.kind === 'validation') assert.ok('reason' in short.error.fields);
    expectError(await port.suspend('nao-existe', { reason: 'motivo longo o bastante' }, 's2'), 'not_found', 'not_found');
  });

  test('suspende e repetir devolve a suspensão original (uma linha de trilha)', async () => {
    const { port, control, advance } = demo();
    const first = await port.suspend('demo-carla', { reason: 'Documento adulterado na revisão.' }, 's1');
    advance(HOUR);
    const again = await port.suspend('demo-carla', { reason: 'Outro motivo qualquer aqui.' }, 's2');
    assert.ok(first.ok && again.ok);
    assert.deepEqual(again.data, first.data);
    assert.equal(control.auditLog().filter((entry) => entry.action === 'driver.suspend').length, 1);
    const detail = await port.driver('demo-carla');
    assert.ok(detail.ok);
    assert.equal(detail.data.status, 'suspended');
  });
});

describe('store compartilhada: o que o motorista envia aparece na fila, e a decisão volta para ele', () => {
  test('motorista envia → painel aprova tudo → verificação do motorista vira approved', async () => {
    const store = createDocumentStore({ clock: () => NOW });
    const driver = createMockDriverOnboarding({ store, driverId: 'd1', fullName: 'Teste Integrado' });
    await driver.port.linkApplication();
    await driver.port.saveOnboarding({
      cpf: '52998224725',
      birthDate: '1990-01-01',
      address: { street: 'Rua A', number: '1', neighborhood: 'Tirol', city: 'Natal', state: 'RN', postalCode: '59000000' },
      cnh: { number: '12345678901', category: 'B', expiresOn: '2030-01-01', ear: true },
    });
    await driver.port.saveVehicle({ plate: 'ZXC1V23', brand: 'Fiat', model: 'Mobi', year: 2021, color: 'Branco' });
    for (const requirement of store.requirements) {
      const target = await driver.port.requestUploadUrl({ typeCode: requirement.typeCode, contentType: 'image/jpeg', sizeBytes: 100, sha256: 'd'.repeat(64) });
      assert.ok(target.ok);
      assert.ok((await driver.uploader.upload(target.data, { uri: 'file:///x' })).ok);
      assert.ok((await driver.port.submitDocument(target.data.documentId)).ok);
    }

    const admin = createMockDocumentReview({ role: 'revisor_documentos', store });
    const page = await admin.port.queue();
    assert.ok(page.ok);
    assert.equal(page.data.items.length, store.requirements.length);
    assert.ok(page.data.items.every((item) => item.driverName === 'Teste Integrado'));
    let key = 0;
    for (const item of page.data.items) {
      const hasExpiry = store.requirement(item.typeCode)?.hasExpiry;
      const decided = await admin.port.approve(item.documentId, hasExpiry ? { expiresOn: '2030-01-01' } : {}, `k${++key}`);
      assert.ok(decided.ok, item.typeCode);
    }
    const verification = await driver.port.verification();
    assert.ok(verification.ok);
    assert.equal(verification.data.status, 'approved');
    assert.equal(driver.control.goOnlineBlocker(), null);
  });
});

describe('control.failNext', () => {
  test('csrf_token_invalid e unauthorized (os 401/403 que só o http produz de verdade)', async () => {
    const { port, control } = demo();
    control.failNext('csrf_token_invalid');
    expectError(await port.approve('demo-ana-inss', {}, 'k'), 'forbidden', 'csrf_token_invalid');
    control.failNext('unauthorized');
    expectError(await port.queue(), 'unauthorized', 'unauthorized');
    assert.ok((await port.queue()).ok);
  });
});

describe('reativar (D5)', () => {
  test('não suspenso: 409 driver_not_suspended; suspenso e em dia: aprovado; repetir devolve a reativação original', async () => {
    const { port, control } = demo();
    const notSuspended = await port.reinstate('demo-carla', 'r1');
    expectError(notSuspended, 'conflict', 'driver_not_suspended');
    assert.equal((await port.suspend('demo-carla', { reason: 'Conferência de documento.' }, 's1')).ok, true);
    const first = await port.reinstate('demo-carla', 'r2');
    assert.ok(first.ok && first.data.status === 'approved');
    const again = await port.reinstate('demo-carla', 'r3');
    assert.deepEqual(again.ok && again.data, first.ok && first.data);
    assert.equal(control.auditLog().filter((entry) => entry.action === 'driver.reinstate').length, 1);
  });

  test('suspenso com pendência: 409 approval_blocked, e continua suspenso', async () => {
    const { port } = demo();
    assert.equal((await port.suspend('demo-ana', { reason: 'Conferência de documento.' }, 's1')).ok, true);
    expectError(await port.reinstate('demo-ana', 'r1'), 'conflict', 'approval_blocked');
    const detail = await port.driver('demo-ana');
    assert.ok(detail.ok && detail.data.status === 'suspended');
  });
});
