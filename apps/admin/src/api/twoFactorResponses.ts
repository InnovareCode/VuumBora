import type { RecoveryCodes, TotpEnrollment, TwoFactorStatus } from './types';

/**
 * Validação das respostas de 2FA (com sessão: `/2fa/status`, `/2fa/enroll/*`, `/2fa/recovery-codes/regenerate`) —
 * mesmo padrão independente de arquivo de `authResponses.ts`. FALHA FECHADA: formato fora do contrato
 * (docs/contrato-admin-2fa.md) nunca vira status/segredo/código exibido, vira `contract_mismatch`
 * (ver `createHttpTwoFactorAdapter`).
 */

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

type Obj = Readonly<Record<string, unknown>>;

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = (reason: string): { readonly ok: false; readonly reason: string } => ({ ok: false, reason });

function isRecord(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function typeOf(value: unknown): string {
  if (value === undefined) return 'ausente';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'lista';
  if (value === '') return 'texto vazio';
  return typeof value === 'string' ? 'texto' : typeof value;
}

function requireObject(raw: unknown, what: string): Parsed<Obj> {
  return isRecord(raw) ? ok(raw) : fail(`${what}: esperado objeto, veio ${typeOf(raw)}`);
}

function text(source: Obj, name: string): Parsed<string> {
  const value = source[name];
  return typeof value === 'string' && value.length > 0 ? ok(value) : fail(`campo "${name}": esperado texto, veio ${typeOf(value)}`);
}

function bool(source: Obj, name: string): Parsed<boolean> {
  const value = source[name];
  return typeof value === 'boolean' ? ok(value) : fail(`campo "${name}": esperado booleano, veio ${typeOf(value)}`);
}

function num(source: Obj, name: string): Parsed<number> {
  const value = source[name];
  return typeof value === 'number' && Number.isFinite(value) ? ok(value) : fail(`campo "${name}": esperado número, veio ${typeOf(value)}`);
}

export function parseTwoFactorStatusResponse(raw: unknown): Parsed<TwoFactorStatus> {
  const body = requireObject(raw, 'status do 2FA');
  if (!body.ok) return body;
  const enabled = bool(body.value, 'enabled');
  if (!enabled.ok) return fail(`status do 2FA: ${enabled.reason}`);
  const required = bool(body.value, 'required');
  if (!required.ok) return fail(`status do 2FA: ${required.reason}`);
  const recoveryCodesRemaining = num(body.value, 'recoveryCodesRemaining');
  if (!recoveryCodesRemaining.ok) return fail(`status do 2FA: ${recoveryCodesRemaining.reason}`);
  return ok({ enabled: enabled.value, required: required.value, recoveryCodesRemaining: recoveryCodesRemaining.value });
}

export function parseTotpEnrollmentResponse(raw: unknown): Parsed<TotpEnrollment> {
  const body = requireObject(raw, 'início de ativação do 2FA');
  if (!body.ok) return body;
  const secret = text(body.value, 'secret');
  if (!secret.ok) return fail(`início de ativação do 2FA: ${secret.reason}`);
  const otpauthUri = text(body.value, 'otpauthUri');
  if (!otpauthUri.ok) return fail(`início de ativação do 2FA: ${otpauthUri.reason}`);
  return ok({ secret: secret.value, otpauthUri: otpauthUri.value });
}

export function parseRecoveryCodesResponse(raw: unknown): Parsed<RecoveryCodes> {
  const body = requireObject(raw, 'códigos de recuperação');
  if (!body.ok) return body;
  const codes = body.value['recoveryCodes'];
  if (!Array.isArray(codes) || codes.length === 0 || !codes.every((code): code is string => typeof code === 'string' && code.length > 0)) {
    return fail(`códigos de recuperação: campo "recoveryCodes": esperado lista de textos, veio ${typeOf(codes)}`);
  }
  return ok({ recoveryCodes: codes });
}
