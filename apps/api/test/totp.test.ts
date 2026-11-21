import './helpers/setup.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decryptSecret, encryptSecret } from '../src/lib/secret-box.js';
import { base32Decode, base32Encode, hotp, verifyTotp } from '../src/lib/totp.js';

// Vetores da RFC 6238 (apêndice B), segredo ASCII "12345678901234567890", SHA-1 — 6 últimos dígitos.
const RFC_SECRET = Buffer.from('12345678901234567890');

test('TOTP bate com os vetores da RFC 6238', () => {
  const vectors: Array<[number, string]> = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ];
  for (const [seconds, expected] of vectors) {
    assert.equal(verifyTotp(RFC_SECRET, expected, seconds * 1000, 0), Math.floor(seconds / 30), `t=${seconds}`);
  }
});

test('verifyTotp aceita ±1 passo e recusa 2 passos de distância', () => {
  const now = 1_700_000_000_000;
  const step = Math.floor(now / 1000 / 30);
  assert.equal(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), now), step - 1);
  assert.equal(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + 1), now), step + 1);
  assert.equal(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + 2), now), null);
  assert.equal(verifyTotp(RFC_SECRET, 'abcdef', now), null);
});

test('base32 ida e volta (vetor da RFC 4648)', () => {
  assert.equal(base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI');
  assert.equal(base32Decode('MZXW6YTBOI').toString(), 'foobar');
  const random = Buffer.from(Array.from({ length: 20 }, (_, i) => (i * 37 + 11) % 256));
  assert.deepEqual(base32Decode(base32Encode(random)), random);
});

test('secret-box: ida e volta, e recusa chave errada, AAD trocado e adulteração', () => {
  const key = Buffer.alloc(32, 1);
  const payload = encryptSecret('JBSWY3DPEHPK3PXP', key, 'admin-1');
  assert.ok(payload.startsWith('v1.'));
  assert.ok(!payload.includes('JBSWY3DPEHPK3PXP'));
  assert.equal(decryptSecret(payload, key, 'admin-1'), 'JBSWY3DPEHPK3PXP');
  assert.throws(() => decryptSecret(payload, Buffer.alloc(32, 2), 'admin-1'));
  assert.throws(() => decryptSecret(payload, key, 'admin-2'));
  const parts = payload.split('.');
  parts[3] = Buffer.from('adulterado').toString('base64url');
  assert.throws(() => decryptSecret(parts.join('.'), key, 'admin-1'));
});
