/** Primitivas de token da identidade: HMAC com pepper, sha256, token opaco e JWT HS256 (sem dependência externa). */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** HMAC-SHA256 hex (64 chars) — o que vai para `login_attempts`/`access_log` no lugar de e-mail/IP. */
export function hmacHex(pepper: string, value: string): string {
  return createHmac('sha256', pepper).update(value).digest('hex');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Token de renovação: 32 bytes aleatórios; só o sha256 vai ao banco. */
export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export interface AccessClaims {
  /** id da conta */
  readonly sub: string;
  /** id da família de refresh (sessão) */
  readonly sid: string;
}

const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const ISSUER = 'vuumbora-api';

function sign(secret: string, signingInput: string): Buffer {
  return createHmac('sha256', secret).update(signingInput).digest();
}

export function signAccessToken(secret: string, claims: AccessClaims, ttlSeconds: number, nowMs = Date.now()): { token: string; expiresAt: Date } {
  const iat = Math.floor(nowMs / 1000);
  const exp = iat + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({ iss: ISSUER, sub: claims.sub, sid: claims.sid, iat, exp })).toString('base64url');
  const signingInput = `${HEADER}.${payload}`;
  return { token: `${signingInput}.${sign(secret, signingInput).toString('base64url')}`, expiresAt: new Date(exp * 1000) };
}

/** `null` para qualquer defeito (formato, algoritmo, assinatura, expiração) — o chamador não distingue. */
export function verifyAccessToken(secret: string, token: string, nowMs = Date.now()): AccessClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];
  // Algoritmo fixo: o cabeçalho tem que ser exatamente o nosso (barra `alg: none` e troca de algoritmo).
  if (header !== HEADER) return null;
  const expected = sign(secret, `${header}.${payload}`);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (data['iss'] !== ISSUER) return null;
    if (typeof data['exp'] !== 'number' || data['exp'] * 1000 <= nowMs) return null;
    if (typeof data['sub'] !== 'string' || typeof data['sid'] !== 'string') return null;
    return { sub: data['sub'], sid: data['sid'] };
  } catch {
    return null;
  }
}
