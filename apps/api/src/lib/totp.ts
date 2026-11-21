/** TOTP (RFC 6238) e base32 (RFC 4648) com `node:crypto` — sem dependência externa. */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('base32 inválido');
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 20 bytes = 160 bits, o tamanho da saída do HMAC-SHA1 (recomendação da RFC 4226). */
export function generateTotpSecret(): Buffer {
  return randomBytes(20);
}

export function hotp(secret: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(message).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) | (hmac[offset + 1]! << 16) | (hmac[offset + 2]! << 8) | hmac[offset + 3]!;
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

/**
 * Passo do TOTP que bate com `code` (±`window` passos de tolerância de relógio),
 * ou `null`. Avalia todos os passos sem sair no primeiro acerto, e compara em
 * tempo constante — o tempo de resposta não diz qual dígito errou.
 */
export function verifyTotp(secret: Buffer, code: string, nowMs: number, window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const provided = Buffer.from(code);
  const current = totpStep(nowMs);
  let matched: number | null = null;
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = Buffer.from(hotp(secret, current + offset));
    if (timingSafeEqual(expected, provided) && matched === null) matched = current + offset;
  }
  return matched;
}

export function buildOtpauthUri(issuer: string, account: string, secretBase32: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
