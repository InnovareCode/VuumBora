/**
 * Todo motivo de falha da conferência tem texto nosso, e o texto segue as regras de copy do projeto.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { VERIFY_FAILURE_COPY, describeVerifyFailure } from '../src/device/verifyFailureCopy';
import type { VerifyFailureReason } from '../src/device/verifiedText';

// Lista explícita (e não as chaves do Record): se um motivo novo entrar no tipo sem texto, o `tsc` reprova o Record; se
// entrar na lista de testes de `verifiedText`, este teste o cobra.
const REASONS: readonly VerifyFailureReason[] = [
  'bad_url',
  'insecure_url',
  'bad_expected_hash',
  'network',
  'timeout',
  'http_status',
  'redirected',
  'too_large',
  'hash_unavailable',
  'hash_mismatch',
  'invalid_text',
];

describe('texto de falha da conferência', () => {
  it('cobre todos os motivos, sem sobra', () => {
    assert.deepEqual(Object.keys(VERIFY_FAILURE_COPY).sort(), [...REASONS].sort());
  });

  for (const reason of REASONS) {
    it(`${reason}: título e mensagem em português, sem jargão e sem "cadastro"`, () => {
      const view = describeVerifyFailure(reason);
      for (const text of [view.title, view.message]) {
        assert.ok(text.length > 10, text);
        assert.equal(/sha|hash|origem|checksum|digest|https?:|erro \d/i.test(text), false, `jargão em: ${text}`);
        assert.equal(/cadastr/i.test(text), false, `"cadastro" em: ${text}`);
      }
      assert.match(view.message, /[.]$/, 'a mensagem termina em ponto');
    });
  }

  it('só oferece "tentar de novo" quando repetir pode resolver (rede, servidor, conteúdo trocado no caminho)', () => {
    const retryable = REASONS.filter((reason) => describeVerifyFailure(reason).retryable).sort();
    assert.deepEqual(retryable, ['hash_mismatch', 'http_status', 'network', 'timeout']);
  });

  it('quando repetir não adianta, manda falar com o suporte; quando adianta, só depois de tentar', () => {
    for (const reason of REASONS) {
      const { retryable, message } = describeVerifyFailure(reason);
      if (['network', 'timeout', 'hash_unavailable'].includes(reason)) continue;
      assert.match(message, retryable ? /Se continuar, fale com o suporte\./ : /Fale com o suporte\./, reason);
    }
  });
});
