import { ADMIN_ROLES, type AdminRole, type AdminUser, type LoginOutcome, type TotpEnrollment } from './types';

/**
 * Validação das respostas de autenticação. Tudo que vem da rede chega aqui como `unknown` e só vira tipo do app se
 * passar: é o que impede "ausência de campo" de valer como login. FALHA FECHADA — qualquer coisa fora do contrato
 * (docs/contrato-admin-2fa.md) devolve `ok: false`, nunca um valor parcial.
 *
 * O `reason` de uma falha vai para o console e fala só de NOMES de campo e TIPOS, jamais de valores: o corpo de uma
 * sessão carrega e-mail, nome e token, e nada disso pode parar num log. A única exceção são os vocabulários fechados
 * (`status` de login e `role`), e só se parecerem um identificador curto em snake_case.
 */

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

type Obj = Readonly<Record<string, unknown>>;

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = (reason: string): { readonly ok: false; readonly reason: string } => ({ ok: false, reason });

export const LOGIN_STATUSES = ['authenticated', 'second_factor_required', 'enrollment_required'] as const;
export type LoginStatus = (typeof LOGIN_STATUSES)[number];

function isRecord(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLoginStatus(value: unknown): value is LoginStatus {
  return typeof value === 'string' && (LOGIN_STATUSES as readonly string[]).includes(value);
}

function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === 'string' && (ADMIN_ROLES as readonly string[]).includes(value);
}

/** Descreve o TIPO do valor, nunca o valor. */
function typeOf(value: unknown): string {
  if (value === undefined) return 'ausente';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'lista';
  if (value === '') return 'texto vazio';
  return typeof value === 'string' ? 'texto' : typeof value;
}

/** Valor de vocabulário fechado, só se for inofensivo de logar; senão, só o tipo. */
function vocabulary(value: unknown): string {
  return typeof value === 'string' && /^[a-z][a-z_]{0,31}$/.test(value) ? `"${value}"` : typeOf(value);
}

function text(source: Obj, name: string): Parsed<string> {
  const value = source[name];
  return typeof value === 'string' && value.length > 0 ? ok(value) : fail(`campo "${name}": esperado texto, veio ${typeOf(value)}`);
}

/** `id`, `name`, `email`, `role` — os campos de `AdminUser`, e SÓ eles (o resto do corpo não vaza para o app). */
function parseAdmin(source: Obj): Parsed<AdminUser> {
  const id = text(source, 'id');
  if (!id.ok) return id;
  const name = text(source, 'name');
  if (!name.ok) return name;
  const email = text(source, 'email');
  if (!email.ok) return email;
  const role = source['role'];
  if (!isAdminRole(role)) return fail(`campo "role": papel desconhecido (${vocabulary(role)})`);
  return ok({ id: id.value, name: name.value, email: email.value, role });
}

/**
 * Sessão NOVA (login autenticado, `2fa/verify`, `enroll/confirm`): o servidor acabou de emitir o cookie e SEMPRE manda o
 * `csrfToken` (texto). Ausente, `null`, vazio ou de outro tipo é contrato quebrado: aceitar como `null` deixaria o painel
 * logado com toda mutação falhando em 403, em vez de `contract_mismatch` (B-9 da revisão S1, rodada 3b).
 */
function parseNewCsrfToken(source: Obj): Parsed<string> {
  const value = source['csrfToken'];
  return typeof value === 'string' && value.length > 0 ? ok(value) : fail(`campo "csrfToken": esperado texto, veio ${typeOf(value)}`);
}

/**
 * SÓ o `GET /me` aceita `null`: é uma sessão que já existia, e `null` = criada antes da migração 0009 (sem token). Ausente
 * também vira `null` aqui (comportamento anterior, mantido); texto vazio ou de outro tipo falha.
 */
function parseExistingCsrfToken(source: Obj): Parsed<string | null> {
  const value = source['csrfToken'];
  if (value === undefined || value === null) return ok(null);
  return typeof value === 'string' && value.length > 0 ? ok(value) : fail(`campo "csrfToken": esperado texto ou null, veio ${typeOf(value)}`);
}

/** Sessão restaurada por `GET /me`: o token pode ser `null`. */
export interface ParsedSession {
  readonly admin: AdminUser;
  readonly csrfToken: string | null;
}

/** Sessão recém-emitida: o token é texto, sempre. */
export interface ParsedNewSession {
  readonly admin: AdminUser;
  readonly csrfToken: string;
}

function parseNewSession(source: Obj): Parsed<ParsedNewSession> {
  const admin = parseAdmin(source);
  if (!admin.ok) return admin;
  const csrfToken = parseNewCsrfToken(source);
  if (!csrfToken.ok) return csrfToken;
  return ok({ admin: admin.value, csrfToken: csrfToken.value });
}

function parseExistingSession(source: Obj): Parsed<ParsedSession> {
  const admin = parseAdmin(source);
  if (!admin.ok) return admin;
  const csrfToken = parseExistingCsrfToken(source);
  if (!csrfToken.ok) return csrfToken;
  return ok({ admin: admin.value, csrfToken: csrfToken.value });
}

function requireObject(raw: unknown, what: string): Parsed<Obj> {
  return isRecord(raw) ? ok(raw) : fail(`${what}: esperado objeto, veio ${typeOf(raw)}`);
}

/** Exige `status: 'authenticated'` — usado onde o contrato promete uma sessão pronta (2fa/verify, enroll/confirm). */
function requireAuthenticated(source: Obj, what: string): Parsed<Obj> {
  const status = source['status'];
  return status === 'authenticated' ? ok(source) : fail(`${what}: campo "status" esperado "authenticated", veio ${status === undefined ? 'ausente' : vocabulary(status)}`);
}

/**
 * `POST /auth/login`. `status` discrimina e é OBRIGATÓRIO: a resposta de uma API anterior ao segundo fator (sem
 * `status`) não é um login, por mais que traga `id`, `name`, `email` e `role`.
 */
export function parseLoginResponse(raw: unknown): Parsed<{ readonly outcome: LoginOutcome; readonly csrfToken: string | null }> {
  const body = requireObject(raw, 'login');
  if (!body.ok) return body;
  const status = body.value['status'];
  if (!isLoginStatus(status)) {
    return fail(status === undefined ? 'login: campo "status" ausente' : `login: status desconhecido (${vocabulary(status)})`);
  }
  if (status === 'authenticated') {
    const session = parseNewSession(body.value);
    if (!session.ok) return fail(`login (authenticated): ${session.reason}`);
    return ok({ outcome: { status, admin: session.value.admin }, csrfToken: session.value.csrfToken });
  }
  const challengeToken = text(body.value, 'challengeToken');
  if (!challengeToken.ok) return fail(`login (${status}): ${challengeToken.reason}`);
  const challengeExpiresAt = text(body.value, 'challengeExpiresAt');
  if (!challengeExpiresAt.ok) return fail(`login (${status}): ${challengeExpiresAt.reason}`);
  return ok({ outcome: { status, challengeToken: challengeToken.value, challengeExpiresAt: challengeExpiresAt.value }, csrfToken: null });
}

/** `GET /me`: os campos de `AdminUser` + `csrfToken`. Não traz `status`. */
export function parseMeResponse(raw: unknown): Parsed<ParsedSession> {
  const body = requireObject(raw, 'me');
  if (!body.ok) return body;
  const session = parseExistingSession(body.value);
  return session.ok ? session : fail(`me: ${session.reason}`);
}

/** `POST /auth/2fa/verify`: sessão pronta + quantos códigos de recuperação restam (`null` se o servidor não disser). */
export function parseSecondFactorVerifyResponse(raw: unknown): Parsed<ParsedNewSession & { readonly recoveryCodesRemaining: number | null }> {
  const body = requireObject(raw, '2fa/verify');
  if (!body.ok) return body;
  const authenticated = requireAuthenticated(body.value, '2fa/verify');
  if (!authenticated.ok) return authenticated;
  const session = parseNewSession(body.value);
  if (!session.ok) return fail(`2fa/verify: ${session.reason}`);
  const remaining = body.value['recoveryCodesRemaining'];
  return ok({ ...session.value, recoveryCodesRemaining: typeof remaining === 'number' && Number.isFinite(remaining) ? remaining : null });
}

/** `POST /auth/2fa/enroll/start`: segredo base32 + `otpauth://` do QR. */
export function parseEnrollmentStartResponse(raw: unknown): Parsed<TotpEnrollment> {
  const body = requireObject(raw, '2fa/enroll/start');
  if (!body.ok) return body;
  const secret = text(body.value, 'secret');
  if (!secret.ok) return fail(`2fa/enroll/start: ${secret.reason}`);
  const otpauthUri = text(body.value, 'otpauthUri');
  if (!otpauthUri.ok) return fail(`2fa/enroll/start: ${otpauthUri.reason}`);
  return ok({ secret: secret.value, otpauthUri: otpauthUri.value });
}

/** `POST /auth/2fa/enroll/confirm`: sessão pronta + os códigos de recuperação (única exibição — sem eles, não é sucesso). */
export function parseEnrollmentConfirmResponse(raw: unknown): Parsed<ParsedNewSession & { readonly recoveryCodes: readonly string[] }> {
  const body = requireObject(raw, '2fa/enroll/confirm');
  if (!body.ok) return body;
  const authenticated = requireAuthenticated(body.value, '2fa/enroll/confirm');
  if (!authenticated.ok) return authenticated;
  const session = parseNewSession(body.value);
  if (!session.ok) return fail(`2fa/enroll/confirm: ${session.reason}`);
  const codes = body.value['recoveryCodes'];
  if (!Array.isArray(codes) || codes.length === 0 || !codes.every((code): code is string => typeof code === 'string' && code.length > 0)) {
    return fail(`2fa/enroll/confirm: campo "recoveryCodes": esperado lista de textos, veio ${typeOf(codes)}`);
  }
  return ok({ ...session.value, recoveryCodes: codes });
}
