/**
 * `apiErrorFromServerReply` + catálogos (fatia K0): o mock e o http passam pela MESMA função, então
 * provar a função e os catálogos prova o `ApiError` que a tela recebe dos dois lados.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { apiErrorFromServerReply, catalogError, fieldsOfCatalog, type ErrorCatalog } from '../src/server-error';
import { DOCUMENT_REVIEW_ERRORS, FARE_ADMIN_ERRORS } from '../src/admin/types';
import { DRIVER_ONBOARDING_ERRORS } from '../src/driver/onboarding-types';
import { GEO_QUOTE_ERRORS } from '../src/passenger/geo-types';

const reply = (status: number, code: string, message = 'mensagem', extra: Record<string, unknown> = {}) => ({
  status,
  body: { ok: false, error: { code, message, ...extra } },
});

describe('apiErrorFromServerReply: kind pelo status, code intacto', () => {
  test('400, 413 e 422 são validation, com a mensagem no campo do code (ou em form)', () => {
    const fields = { invalid_cpf: 'cpf', file_too_large: 'sizeBytes' };
    assert.deepEqual(apiErrorFromServerReply(reply(422, 'invalid_cpf', 'CPF inválido.'), fields), {
      kind: 'validation',
      fields: { cpf: 'CPF inválido.' },
      code: 'invalid_cpf',
    });
    assert.deepEqual(apiErrorFromServerReply(reply(413, 'file_too_large', 'grande'), fields), {
      kind: 'validation',
      fields: { sizeBytes: 'grande' },
      code: 'file_too_large',
    });
    assert.deepEqual(apiErrorFromServerReply(reply(400, 'invalid_body', 'x'), fields), {
      kind: 'validation',
      fields: { form: 'x' },
      code: 'invalid_body',
    });
  });

  test('409 é conflict com reason = code; 5xx é unavailable', () => {
    assert.deepEqual(apiErrorFromServerReply(reply(409, 'quote_expired')), { kind: 'conflict', reason: 'quote_expired', code: 'quote_expired' });
    assert.deepEqual(apiErrorFromServerReply(reply(503, 'fare_not_configured')), {
      kind: 'unavailable',
      retryable: true,
      code: 'fare_not_configured',
    });
    assert.deepEqual(apiErrorFromServerReply(reply(502, 'route_unavailable')), { kind: 'unavailable', retryable: true, code: 'route_unavailable' });
  });

  test('401, 403, 404 e 429 (com Retry-After de reserva)', () => {
    assert.equal(apiErrorFromServerReply(reply(401, 'unauthorized')).kind, 'unauthorized');
    assert.deepEqual(apiErrorFromServerReply(reply(403, 'forbidden')), { kind: 'forbidden', code: 'forbidden' });
    assert.equal(apiErrorFromServerReply(reply(404, 'not_found')).kind, 'not_found');
    assert.deepEqual(apiErrorFromServerReply({ ...reply(429, 'rate_limited'), retryAfterHeader: '30' }), {
      kind: 'rate_limited',
      code: 'rate_limited',
      retryAfterSeconds: 30,
    });
  });

  test('corpo fora do envelope: sem code, mensagem genérica; code fora do padrão é descartado', () => {
    assert.deepEqual(apiErrorFromServerReply({ status: 418, body: '<html>' }), { kind: 'unknown', message: 'status HTTP 418' });
    const weird = apiErrorFromServerReply(reply(409, 'Quote Expired!'));
    assert.equal(weird.code, undefined);
    assert.deepEqual(weird, { kind: 'conflict', reason: 'conflict' });
  });
});

describe('catálogos: cada código vira o ApiError do seu status', () => {
  const catalogs: Record<string, ErrorCatalog> = {
    DRIVER_ONBOARDING_ERRORS,
    DOCUMENT_REVIEW_ERRORS,
    FARE_ADMIN_ERRORS,
    GEO_QUOTE_ERRORS,
  };
  for (const [name, catalog] of Object.entries(catalogs)) {
    test(`${name}: kind coerente com o status e code sempre presente`, () => {
      for (const [code, entry] of Object.entries(catalog)) {
        const error = catalogError(catalog, code);
        assert.equal(error.code, code, `${name}.${code}`);
        const expectedKind =
          entry.status === 400 || entry.status === 413 || entry.status === 422
            ? 'validation'
            : entry.status === 401
              ? 'unauthorized'
              : entry.status === 403
                ? 'forbidden'
                : entry.status === 404
                  ? 'not_found'
                  : entry.status === 409
                    ? 'conflict'
                    : entry.status === 429
                      ? 'rate_limited'
                      : 'unavailable';
        assert.equal(error.kind, expectedKind, `${name}.${code}`);
        if (error.kind === 'validation') {
          assert.deepEqual(Object.keys(error.fields), [entry.field ?? 'form'], `${name}.${code}`);
        }
        if (error.kind === 'conflict') assert.equal(error.reason, code);
      }
    });
  }

  test('os códigos do §3 estão nos catálogos com o status do plano', () => {
    const expected: [ErrorCatalog, string, number][] = [
      [DRIVER_ONBOARDING_ERRORS, 'application_not_approved', 409],
      [DRIVER_ONBOARDING_ERRORS, 'email_not_verified', 409],
      [DRIVER_ONBOARDING_ERRORS, 'cnh_without_ear', 422],
      [DRIVER_ONBOARDING_ERRORS, 'invalid_cpf', 422],
      [DRIVER_ONBOARDING_ERRORS, 'plate_in_use', 409],
      [DRIVER_ONBOARDING_ERRORS, 'vehicle_too_old', 422],
      [DRIVER_ONBOARDING_ERRORS, 'unknown_document_type', 422],
      [DRIVER_ONBOARDING_ERRORS, 'file_too_large', 413],
      [DRIVER_ONBOARDING_ERRORS, 'upload_missing', 409],
      [DOCUMENT_REVIEW_ERRORS, 'forbidden', 403],
      [DOCUMENT_REVIEW_ERRORS, 'unknown_reason', 422],
      [GEO_QUOTE_ERRORS, 'outside_service_area', 422],
      [GEO_QUOTE_ERRORS, 'route_too_short', 422],
      [GEO_QUOTE_ERRORS, 'route_unavailable', 502],
      [GEO_QUOTE_ERRORS, 'fare_not_configured', 503],
      [GEO_QUOTE_ERRORS, 'quote_expired', 409],
    ];
    for (const [catalog, code, status] of expected) assert.equal(catalog[code]?.status, status, code);
  });

  test('fieldsOfCatalog é o mapa que o http usa (só os códigos com campo)', () => {
    assert.deepEqual(fieldsOfCatalog(GEO_QUOTE_ERRORS), {});
    assert.equal(fieldsOfCatalog(DRIVER_ONBOARDING_ERRORS)['cnh_without_ear'], 'cnh.ear');
  });

  test('código fora do catálogo lança (erro de quem monta o mock, nunca resposta)', () => {
    assert.throws(() => catalogError(GEO_QUOTE_ERRORS, 'nao_existe' as never), TypeError);
  });
});
