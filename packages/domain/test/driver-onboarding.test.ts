/**
 * Regras puras do cadastro do motorista (M3, fatia K0): estado derivado da verificação, aprovação
 * automática (N4), regra de ficar online, documento, placa e idade do veículo.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  DOCUMENT_MAX_SIZE_BYTES,
  deriveVerificationStatus,
  documentUploadProblem,
  goOnlineBlocker,
  isCalendarDate,
  isDocumentExpired,
  isReadyForApproval,
  isValidPlate,
  isVehicleTooOld,
  natalCalendarDate,
  normalizePlate,
  type VerificationFacts,
} from '../src/driver/onboarding';

const SHA = 'a'.repeat(64);

function facts(overrides: Partial<VerificationFacts> = {}): VerificationFacts {
  return {
    linked: true,
    accountStatus: 'pending_review',
    profileSubmitted: true,
    vehicleRegistered: true,
    requirements: [
      { required: true, documentStatus: 'submitted' },
      { required: true, documentStatus: 'approved' },
      { required: false },
    ],
    ...overrides,
  };
}

describe('deriveVerificationStatus', () => {
  test('sem vínculo: not_started, mesmo com o resto preenchido', () => {
    assert.equal(deriveVerificationStatus(facts({ linked: false, accountStatus: 'approved' })), 'not_started');
  });

  test('suspensa vence aprovada e documentos', () => {
    assert.equal(deriveVerificationStatus(facts({ accountStatus: 'suspended' })), 'suspended');
  });

  test('aprovada continua approved com documento vencido (o bloqueio é no ficar online)', () => {
    const value = facts({ accountStatus: 'approved', requirements: [{ required: true, documentStatus: 'expired' }] });
    assert.equal(deriveVerificationStatus(value), 'approved');
  });

  test('recusado obrigatório: changes_requested, antes de "falta documento"', () => {
    const value = facts({
      profileSubmitted: false,
      requirements: [{ required: true, documentStatus: 'rejected' }, { required: true }],
    });
    assert.equal(deriveVerificationStatus(value), 'changes_requested');
  });

  test('recusado OPCIONAL não pede correção', () => {
    const value = facts({ requirements: [{ required: true, documentStatus: 'submitted' }, { required: false, documentStatus: 'rejected' }] });
    assert.equal(deriveVerificationStatus(value), 'under_review');
  });

  test('pending_documents: falta etapa 2, veículo, documento obrigatório ou ele venceu', () => {
    assert.equal(deriveVerificationStatus(facts({ profileSubmitted: false })), 'pending_documents');
    assert.equal(deriveVerificationStatus(facts({ vehicleRegistered: false })), 'pending_documents');
    assert.equal(deriveVerificationStatus(facts({ requirements: [{ required: true }] })), 'pending_documents');
    assert.equal(
      deriveVerificationStatus(facts({ requirements: [{ required: true, documentStatus: 'expired' }] })),
      'pending_documents',
    );
  });

  test('tudo enviado: under_review (opcional ausente não segura)', () => {
    assert.equal(deriveVerificationStatus(facts()), 'under_review');
  });
});

describe('isReadyForApproval (N4)', () => {
  test('todos os obrigatórios aprovados, com etapa 2 e veículo', () => {
    const ready = facts({ requirements: [{ required: true, documentStatus: 'approved' }, { required: false }] });
    assert.equal(isReadyForApproval(ready), true);
  });

  test('não aprova com obrigatório em análise, sem veículo, sem etapa 2, suspensa ou já aprovada', () => {
    assert.equal(isReadyForApproval(facts()), false);
    const approvedDocs = [{ required: true, documentStatus: 'approved' as const }];
    assert.equal(isReadyForApproval(facts({ requirements: approvedDocs, vehicleRegistered: false })), false);
    assert.equal(isReadyForApproval(facts({ requirements: approvedDocs, profileSubmitted: false })), false);
    assert.equal(isReadyForApproval(facts({ requirements: approvedDocs, accountStatus: 'suspended' })), false);
    assert.equal(isReadyForApproval(facts({ requirements: approvedDocs, accountStatus: 'approved' })), false);
    assert.equal(isReadyForApproval(facts({ requirements: approvedDocs, linked: false })), false);
  });
});

describe('goOnlineBlocker', () => {
  const approvedDoc = (expiresOn?: string) => ({
    required: true,
    document: { status: 'approved' as const, ...(expiresOn ? { expiresOn } : {}) },
  });

  test('não aprovado: driver_not_approved', () => {
    assert.equal(goOnlineBlocker({ status: 'under_review', requirements: [] }, '2026-11-27'), 'driver_not_approved');
    assert.equal(goOnlineBlocker({ status: 'suspended', requirements: [] }, '2026-11-27'), 'driver_not_approved');
  });

  test('validade é o último dia válido: vence no dia seguinte', () => {
    assert.equal(goOnlineBlocker({ status: 'approved', requirements: [approvedDoc('2026-11-27')] }, '2026-11-27'), null);
    assert.equal(
      goOnlineBlocker({ status: 'approved', requirements: [approvedDoc('2026-11-27')] }, '2026-11-28'),
      'document_expired',
    );
  });

  test('status expired conta; opcional vencido não bloqueia', () => {
    const expired = { required: true, document: { status: 'expired' as const } };
    assert.equal(goOnlineBlocker({ status: 'approved', requirements: [expired] }, '2026-11-27'), 'document_expired');
    const optional = { required: false, document: { status: 'expired' as const } };
    assert.equal(goOnlineBlocker({ status: 'approved', requirements: [optional, approvedDoc()] }, '2026-11-27'), null);
  });

  test('isDocumentExpired: documento em análise com data passada não é "vencido"', () => {
    assert.equal(isDocumentExpired({ status: 'submitted', expiresOn: '2020-01-01' }, '2026-11-27'), false);
  });
});

describe('documento, placa, veículo e calendário', () => {
  test('documentUploadProblem: forma primeiro, tamanho depois', () => {
    assert.equal(documentUploadProblem({ contentType: 'image/jpeg', sizeBytes: 1000, sha256: SHA }), null);
    assert.equal(documentUploadProblem({ contentType: 'application/pdf', sizeBytes: DOCUMENT_MAX_SIZE_BYTES, sha256: SHA }), null);
    assert.equal(
      documentUploadProblem({ contentType: 'image/jpeg', sizeBytes: DOCUMENT_MAX_SIZE_BYTES + 1, sha256: SHA }),
      'file_too_large',
    );
    assert.equal(documentUploadProblem({ contentType: 'image/gif', sizeBytes: 1000, sha256: SHA }), 'invalid_body');
    assert.equal(documentUploadProblem({ contentType: 'image/png', sizeBytes: 0, sha256: SHA }), 'invalid_body');
    assert.equal(documentUploadProblem({ contentType: 'image/png', sizeBytes: 1.5, sha256: SHA }), 'invalid_body');
    assert.equal(documentUploadProblem({ contentType: 'image/png', sizeBytes: 10, sha256: 'A'.repeat(64) }), 'invalid_body');
    assert.equal(
      documentUploadProblem({ contentType: 'image/gif', sizeBytes: DOCUMENT_MAX_SIZE_BYTES + 1, sha256: SHA }),
      'invalid_body',
      'corpo inválido vem antes do tamanho',
    );
  });

  test('placa antiga e Mercosul, com traço e minúscula', () => {
    assert.equal(isValidPlate('ABC1234'), true);
    assert.equal(isValidPlate('abc-1d23'), true);
    assert.equal(normalizePlate('abc-1d23'), 'ABC1D23');
    assert.equal(isValidPlate('AB1234'), false);
    assert.equal(isValidPlate('ABCD123'), false);
    assert.equal(isValidPlate(1234), false);
  });

  test('idade do veículo: passa do limite só quando é maior', () => {
    assert.equal(isVehicleTooOld(2016, { maxAgeYears: 10, currentYear: 2026 }), false);
    assert.equal(isVehicleTooOld(2015, { maxAgeYears: 10, currentYear: 2026 }), true);
    assert.throws(() => isVehicleTooOld(2015.5, { maxAgeYears: 10, currentYear: 2026 }), RangeError);
  });

  test('natalCalendarDate: UTC−3 (02:59 UTC ainda é o dia anterior em Natal)', () => {
    assert.equal(natalCalendarDate(Date.parse('2026-11-28T02:59:00Z')), '2026-11-27');
    assert.equal(natalCalendarDate(Date.parse('2026-11-28T03:00:00Z')), '2026-11-28');
  });

  test('isCalendarDate recusa data inexistente e formato errado', () => {
    assert.equal(isCalendarDate('2027-03-12'), true);
    assert.equal(isCalendarDate('2027-02-30'), false);
    assert.equal(isCalendarDate('12/03/2027'), false);
  });
});
