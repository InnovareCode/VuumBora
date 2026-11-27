/**
 * `createMockDriverOnboarding` (M3, fatia K0 do `docs/plano-m3-m4.md`): caminho feliz da M02/M03/M04
 * e CADA erro do §3 do motorista, mais a ligação com o "ficar online" do `createMockDriverRidePort`.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DOCUMENT_MAX_SIZE_BYTES } from '@vuumbora/domain/driver';
import { createMockDriverRidePort } from '../src/driver/mock-adapter';
import { createMockDriverOnboarding } from '../src/driver/onboarding-mock-adapter';
import type { DocumentUploadRequest, DriverOnboardingInput } from '../src/driver/onboarding-types';
import { createDocumentStore, type MockRequirement } from '../src/documents/mock-store';
import type { DriverVehicleInput } from '../src/documents/types';

const SHA = 'ab'.repeat(32);
const NOW = Date.parse('2026-11-27T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const POINT = { latitude: -5.8113, longitude: -35.2061 };

/** Duas exigências só (uma com validade, uma sem) para o teste caber na cabeça. */
const REQUIREMENTS: readonly MockRequirement[] = [
  { typeCode: 'cnh', label: 'CNH com EAR', required: true, hasExpiry: true },
  { typeCode: 'foto_perfil', label: 'Foto de perfil', required: true, hasExpiry: false },
  { typeCode: 'extra', label: 'Opcional', required: false, hasExpiry: false },
];

const ONBOARDING: DriverOnboardingInput = {
  cpf: '529.982.247-25',
  birthDate: '1990-05-10',
  address: { street: 'Rua Mossoró', number: '500', neighborhood: 'Tirol', city: 'Natal', state: 'RN', postalCode: '59020090' },
  cnh: { number: '12345678901', category: 'B', expiresOn: '2030-01-01', ear: true },
};

const VEHICLE: DriverVehicleInput = { plate: 'QWE-1A23', brand: 'Fiat', model: 'Argo', year: 2022, color: 'Prata' };

const upload = (typeCode: string, overrides: Partial<DocumentUploadRequest> = {}): DocumentUploadRequest => ({
  typeCode,
  contentType: 'image/jpeg',
  sizeBytes: 200_000,
  sha256: SHA,
  ...overrides,
});

function setup(options: Parameters<typeof createMockDriverOnboarding>[0] = {}) {
  let clockMs = NOW;
  const store = createDocumentStore({ clock: () => clockMs, requirements: REQUIREMENTS, settings: { reviewSlaHours: 48, vehicleMaxAgeYears: 10 } });
  const mock = createMockDriverOnboarding({ store, driverId: 'driver-1', ...options });
  return { ...mock, advance: (ms: number) => (clockMs += ms) };
}

/** Pede URL, envia e confirma. Devolve o `documentId`. */
async function sendDocument(mock: ReturnType<typeof setup>, typeCode: string): Promise<string> {
  const target = await mock.port.requestUploadUrl(upload(typeCode));
  assert.ok(target.ok, `upload-url de ${typeCode}`);
  const sent = await mock.uploader.upload(target.data, { uri: 'file:///doc.jpg' });
  assert.ok(sent.ok, `upload de ${typeCode}`);
  const submitted = await mock.port.submitDocument(target.data.documentId);
  assert.ok(submitted.ok, `submit de ${typeCode}`);
  return target.data.documentId;
}

async function linkedWithProfileAndVehicle(options: Parameters<typeof setup>[0] = {}) {
  const mock = setup(options);
  assert.ok((await mock.port.linkApplication()).ok);
  assert.ok((await mock.port.saveOnboarding(ONBOARDING)).ok);
  assert.ok((await mock.port.saveVehicle(VEHICLE)).ok);
  return mock;
}

function expectError(result: { ok: boolean; error?: { kind: string; code?: string } }, kind: string, code: string): void {
  assert.equal(result.ok, false);
  assert.equal(result.error?.kind, kind);
  assert.equal(result.error?.code, code);
}

describe('caminho feliz: de not_started a approved (N4)', () => {
  test('verificação passa por todos os estados da M04, e o último aprovado aprova a conta sozinho', async () => {
    const mock = setup();
    const start = await mock.port.verification();
    assert.ok(start.ok);
    assert.deepEqual(start.data, { status: 'not_started', onboarding: { profileSubmitted: false, vehicleRegistered: false }, requirements: [] });

    const linked = await mock.port.linkApplication();
    assert.ok(linked.ok);
    assert.deepEqual(linked.data, { driverId: 'driver-1', status: 'pending_documents' });

    const saved = await mock.port.saveOnboarding(ONBOARDING);
    assert.ok(saved.ok);
    assert.equal(saved.data.status, 'pending_documents');
    const vehicle = await mock.port.saveVehicle(VEHICLE);
    assert.ok(vehicle.ok);

    const cnh = await sendDocument(mock, 'cnh');
    const photo = await sendDocument(mock, 'foto_perfil');

    const review = await mock.port.verification();
    assert.ok(review.ok);
    assert.equal(review.data.status, 'under_review', 'opcional ausente não segura');
    assert.deepEqual(review.data.onboarding, { profileSubmitted: true, vehicleRegistered: true });
    assert.equal(review.data.reviewDeadline, new Date(NOW + 48 * HOUR).toISOString());
    assert.deepEqual(
      review.data.requirements.map((requirement) => [requirement.typeCode, requirement.document?.status]),
      [['cnh', 'submitted'], ['foto_perfil', 'submitted'], ['extra', undefined]],
    );

    mock.control.review(cnh, { approve: true, expiresOn: '2031-01-01' });
    const halfway = await mock.port.verification();
    assert.ok(halfway.ok);
    assert.equal(halfway.data.status, 'under_review');

    mock.control.review(photo, { approve: true });
    const approved = await mock.port.verification();
    assert.ok(approved.ok);
    assert.equal(approved.data.status, 'approved');
    assert.equal(approved.data.reviewDeadline, undefined);
    assert.equal(approved.data.requirements[0]?.document?.expiresOn, '2031-01-01');
  });

  test('vínculo e envio são idempotentes; a origem é sempre mock', async () => {
    const mock = setup();
    const first = await mock.port.linkApplication();
    const second = await mock.port.linkApplication();
    assert.ok(first.ok && second.ok);
    assert.equal(first.origin, 'mock');
    assert.deepEqual(first.data, second.data);

    await mock.port.saveOnboarding(ONBOARDING);
    await mock.port.saveVehicle(VEHICLE);
    const id = await sendDocument(mock, 'cnh');
    const again = await mock.port.submitDocument(id);
    assert.ok(again.ok);
    assert.equal(again.data.status, 'submitted');
  });

  test('upload informa o progresso até 1 e a URL vale 300 s com método PUT e cabeçalhos', async () => {
    const mock = await linkedWithProfileAndVehicle();
    const target = await mock.port.requestUploadUrl(upload('cnh'));
    assert.ok(target.ok);
    assert.equal(target.data.method, 'PUT');
    assert.equal(target.data.expiresAt, new Date(NOW + 300_000).toISOString());
    assert.equal(target.data.headers['Content-Type'], 'image/jpeg');
    const progress: number[] = [];
    const sent = await mock.uploader.upload(target.data, { uri: 'file:///doc.jpg' }, (fraction) => progress.push(fraction));
    assert.ok(sent.ok);
    assert.deepEqual(progress, [0.25, 0.5, 0.75, 1]);
  });
});

describe('erros do vínculo (N3)', () => {
  test('409 email_not_verified vem antes da candidatura', async () => {
    const mock = setup({ emailVerified: false, application: 'none' });
    expectError(await mock.port.linkApplication(), 'conflict', 'email_not_verified');
  });

  test('409 application_not_approved: sem candidatura ou ainda pendente', async () => {
    expectError(await setup({ application: 'none' }).port.linkApplication(), 'conflict', 'application_not_approved');
    const pending = setup({ application: 'pending' });
    expectError(await pending.port.linkApplication(), 'conflict', 'application_not_approved');
    pending.control.setApplication('approved');
    assert.ok((await pending.port.linkApplication()).ok, 'aprovada depois: liga');
  });

  test('409 driver_not_linked em etapa 2, veículo e upload-url antes do vínculo', async () => {
    const mock = setup();
    expectError(await mock.port.saveOnboarding(ONBOARDING), 'conflict', 'driver_not_linked');
    expectError(await mock.port.saveVehicle(VEHICLE), 'conflict', 'driver_not_linked');
    expectError(await mock.port.requestUploadUrl(upload('cnh')), 'conflict', 'driver_not_linked');
  });
});

describe('erros da etapa 2 e do veículo', () => {
  test('422 invalid_cpf no campo cpf', async () => {
    const mock = setup();
    await mock.port.linkApplication();
    const result = await mock.port.saveOnboarding({ ...ONBOARDING, cpf: '529.982.247-24' });
    expectError(result, 'validation', 'invalid_cpf');
    if (!result.ok && result.error.kind === 'validation') assert.ok('cpf' in result.error.fields);
  });

  test('422 cnh_without_ear no campo cnh.ear', async () => {
    const mock = setup();
    await mock.port.linkApplication();
    const result = await mock.port.saveOnboarding({ ...ONBOARDING, cnh: { ...ONBOARDING.cnh, ear: false } });
    expectError(result, 'validation', 'cnh_without_ear');
    if (!result.ok && result.error.kind === 'validation') assert.ok('cnh.ear' in result.error.fields);
  });

  test('400 invalid_body: data inexistente, UF, CEP, categoria de moto', async () => {
    const mock = setup();
    await mock.port.linkApplication();
    const bad: unknown[] = [
      { ...ONBOARDING, birthDate: '1990-02-30' },
      { ...ONBOARDING, address: { ...ONBOARDING.address, state: 'rn' } },
      { ...ONBOARDING, address: { ...ONBOARDING.address, postalCode: '59020-090' } },
      { ...ONBOARDING, cnh: { ...ONBOARDING.cnh, category: 'A' } },
      { ...ONBOARDING, cnh: { ...ONBOARDING.cnh, ear: 'sim' } },
    ];
    for (const input of bad) expectError(await mock.port.saveOnboarding(input as DriverOnboardingInput), 'validation', 'invalid_body');
  });

  test('409 plate_in_use (placa de outro motorista, com ou sem traço)', async () => {
    const mock = setup();
    await mock.port.linkApplication();
    expectError(await mock.port.saveVehicle({ ...VEHICLE, plate: 'abc-1d23' }), 'conflict', 'plate_in_use');
  });

  test('a mesma placa do próprio motorista não conflita e mantém o vehicleId', async () => {
    const mock = await linkedWithProfileAndVehicle();
    const first = mock.store.drivers.get('driver-1')?.vehicle?.vehicleId;
    const again = await mock.port.saveVehicle({ ...VEHICLE, color: 'Branco' });
    assert.ok(again.ok);
    assert.equal(again.data.vehicleId, first);
  });

  test('422 vehicle_too_old no campo year; no limite exato passa', async () => {
    const mock = setup();
    await mock.port.linkApplication();
    const old = await mock.port.saveVehicle({ ...VEHICLE, year: 2015 });
    expectError(old, 'validation', 'vehicle_too_old');
    if (!old.ok && old.error.kind === 'validation') assert.ok('year' in old.error.fields);
    assert.ok((await mock.port.saveVehicle({ ...VEHICLE, year: 2016 })).ok);
  });

  test('400 invalid_body: placa fora do padrão ou ano no futuro distante', async () => {
    const mock = setup();
    await mock.port.linkApplication();
    expectError(await mock.port.saveVehicle({ ...VEHICLE, plate: 'AB-123' }), 'validation', 'invalid_body');
    expectError(await mock.port.saveVehicle({ ...VEHICLE, year: 2030 }), 'validation', 'invalid_body');
  });
});

describe('erros do envio de documento', () => {
  test('413 file_too_large no campo sizeBytes; no limite exato passa', async () => {
    const mock = await linkedWithProfileAndVehicle();
    const big = await mock.port.requestUploadUrl(upload('cnh', { sizeBytes: DOCUMENT_MAX_SIZE_BYTES + 1 }));
    expectError(big, 'validation', 'file_too_large');
    if (!big.ok && big.error.kind === 'validation') assert.ok('sizeBytes' in big.error.fields);
    assert.ok((await mock.port.requestUploadUrl(upload('cnh', { sizeBytes: DOCUMENT_MAX_SIZE_BYTES }))).ok);
  });

  test('422 unknown_document_type no campo typeCode', async () => {
    const mock = await linkedWithProfileAndVehicle();
    const result = await mock.port.requestUploadUrl(upload('passaporte'));
    expectError(result, 'validation', 'unknown_document_type');
    if (!result.ok && result.error.kind === 'validation') assert.ok('typeCode' in result.error.fields);
  });

  test('400 invalid_body: tipo de arquivo, hash e tamanho', async () => {
    const mock = await linkedWithProfileAndVehicle();
    const bad = [
      upload('cnh', { contentType: 'image/gif' as never }),
      upload('cnh', { sha256: 'xyz' }),
      upload('cnh', { sizeBytes: 0 }),
      upload('', {}),
    ];
    for (const input of bad) expectError(await mock.port.requestUploadUrl(input), 'validation', 'invalid_body');
  });

  test('409 upload_missing: confirmou sem enviar', async () => {
    const mock = await linkedWithProfileAndVehicle();
    const target = await mock.port.requestUploadUrl(upload('cnh'));
    assert.ok(target.ok);
    expectError(await mock.port.submitDocument(target.data.documentId), 'conflict', 'upload_missing');
  });

  test('409 upload_missing: o arquivo chegou diferente do declarado (hash)', async () => {
    const mock = await linkedWithProfileAndVehicle();
    const target = await mock.port.requestUploadUrl(upload('cnh'));
    assert.ok(target.ok);
    mock.control.failNextUpload('corrupted');
    assert.ok((await mock.uploader.upload(target.data, { uri: 'file:///doc.jpg' })).ok);
    expectError(await mock.port.submitDocument(target.data.documentId), 'conflict', 'upload_missing');
  });

  test('409 document_under_review: um por tipo aguardando o revisor; recusado pode reenviar', async () => {
    const mock = await linkedWithProfileAndVehicle();
    const id = await sendDocument(mock, 'cnh');
    expectError(await mock.port.requestUploadUrl(upload('cnh')), 'conflict', 'document_under_review');
    mock.control.review(id, { reject: 'illegible' });
    assert.ok((await mock.port.requestUploadUrl(upload('cnh'))).ok);
  });

  test('409 invalid_transition: confirmar de novo um documento já decidido', async () => {
    const mock = await linkedWithProfileAndVehicle();
    const id = await sendDocument(mock, 'foto_perfil');
    mock.control.review(id, { approve: true });
    expectError(await mock.port.submitDocument(id), 'conflict', 'invalid_transition');
  });

  test('404 not_found: documento de outro motorista, inexistente, ou URL abandonada por outra', async () => {
    const store = createDocumentStore({ requirements: REQUIREMENTS });
    const other = createMockDriverOnboarding({ store, driverId: 'driver-2' });
    const mine = createMockDriverOnboarding({ store, driverId: 'driver-1' });
    await other.port.linkApplication();
    await mine.port.linkApplication();
    const theirs = await other.port.requestUploadUrl(upload('cnh'));
    assert.ok(theirs.ok);
    expectError(await mine.port.submitDocument(theirs.data.documentId), 'not_found', 'not_found');
    expectError(await mine.port.submitDocument('nao-existe'), 'not_found', 'not_found');

    const first = await mine.port.requestUploadUrl(upload('cnh'));
    const second = await mine.port.requestUploadUrl(upload('cnh'));
    assert.ok(first.ok && second.ok);
    expectError(await mine.port.submitDocument(first.data.documentId), 'not_found', 'not_found');
  });

  test('upload: URL vencida é forbidden upload_url_expired; sem rede é network', async () => {
    const mock = await linkedWithProfileAndVehicle();
    const target = await mock.port.requestUploadUrl(upload('cnh'));
    assert.ok(target.ok);
    mock.control.failNextUpload('network');
    assert.deepEqual(await mock.uploader.upload(target.data, { uri: 'file:///a' }), { ok: false, error: { kind: 'network', retryable: true } });
    mock.advance(300_001);
    const expired = await mock.uploader.upload(target.data, { uri: 'file:///a' });
    assert.deepEqual(expired, { ok: false, error: { kind: 'forbidden', code: 'upload_url_expired' } });
  });
});

describe('estados da M04 fora do caminho feliz', () => {
  test('changes_requested: o motivo do catálogo chega ao app; a nota interna NUNCA', async () => {
    const mock = await linkedWithProfileAndVehicle();
    const id = await sendDocument(mock, 'cnh');
    await sendDocument(mock, 'foto_perfil');
    mock.control.review(id, { reject: 'illegible', internalNote: 'NOTA-INTERNA-7f3a' });
    const result = await mock.port.verification();
    assert.ok(result.ok);
    assert.equal(result.data.status, 'changes_requested');
    const cnh = result.data.requirements.find((requirement) => requirement.typeCode === 'cnh');
    assert.equal(cnh?.document?.status, 'rejected');
    assert.equal(cnh?.document?.rejection?.code, 'illegible');
    assert.ok(!JSON.stringify(result.data).includes('NOTA-INTERNA-7f3a'), 'a nota interna não vaza (marcador único: o texto do motivo pode repetir palavras da nota)');
  });

  test('suspended', async () => {
    const mock = await linkedWithProfileAndVehicle();
    mock.control.suspend();
    const result = await mock.port.verification();
    assert.ok(result.ok);
    assert.equal(result.data.status, 'suspended');
  });

  test('documento vencido: aparece expired, a conta segue approved e o ficar online responde document_expired', async () => {
    const mock = await linkedWithProfileAndVehicle();
    const cnh = await sendDocument(mock, 'cnh');
    const photo = await sendDocument(mock, 'foto_perfil');
    mock.control.review(cnh, { approve: true, expiresOn: '2026-11-30' });
    mock.control.review(photo, { approve: true });

    const ride = createMockDriverRidePort({ availabilityGate: mock.control.goOnlineBlocker });
    const online = await ride.journeyPort.setAvailability({ online: true, point: POINT });
    assert.ok(online.ok, 'em dia: liga');

    mock.advance(4 * 24 * HOUR); // 2026-12-01 em Natal: a validade de 30/11 passou
    const after = await mock.port.verification();
    assert.ok(after.ok);
    assert.equal(after.data.status, 'approved');
    assert.equal(after.data.requirements[0]?.document?.status, 'expired');
    const blocked = await ride.journeyPort.setAvailability({ online: true, point: POINT });
    assert.deepEqual(blocked, { ok: false, error: { kind: 'conflict', reason: 'document_expired', code: 'document_expired' } });
    assert.ok((await ride.journeyPort.setAvailability({ online: false })).ok, 'R7: offline sempre funciona');
  });

  test('ficar online antes da aprovação: driver_not_approved pela regra do cadastro', async () => {
    const mock = await linkedWithProfileAndVehicle();
    const ride = createMockDriverRidePort({ availabilityGate: mock.control.goOnlineBlocker });
    const result = await ride.journeyPort.setAvailability({ online: true, point: POINT });
    assert.deepEqual(result, { ok: false, error: { kind: 'conflict', reason: 'driver_not_approved', code: 'driver_not_approved' } });
  });
});

describe('control.failNext', () => {
  test('força o próximo erro de qualquer código (uma vez só), e network', async () => {
    const mock = setup();
    mock.control.failNext('rate_limited');
    expectError(await mock.port.verification(), 'rate_limited', 'rate_limited');
    assert.ok((await mock.port.verification()).ok, 'consumido');
    mock.control.failNext('network');
    assert.deepEqual(await mock.port.linkApplication(), { ok: false, error: { kind: 'network', retryable: true } });
  });

  test('controle recusa revisar documento que não está aguardando (erro de configuração do teste)', async () => {
    const mock = await linkedWithProfileAndVehicle();
    assert.throws(() => mock.control.review('nao-existe', { approve: true }), TypeError);
    const id = await sendDocument(mock, 'foto_perfil');
    assert.throws(() => mock.control.review(id, { reject: 'motivo_inventado' }), TypeError);
  });
});
