import { ADMIN_ROLES, type ActivateAdminUserResult, type AdminRole, type AdminUserCreateResult, type AdminUserListResult, type AdminUserRecord } from './types';

/**
 * Validação das respostas de gestão de usuários do painel (F07, só `dono`) —
 * mesmo padrão independente de arquivo de `authResponses.ts`. FALHA FECHADA:
 * formato fora do contrato (docs/contrato-admin-usuarios.md) nunca vira um
 * usuário/token exibido na tela, vira `contract_mismatch`
 * (ver `createHttpAdminUserAdapter`).
 */

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

type Obj = Readonly<Record<string, unknown>>;

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = (reason: string): { readonly ok: false; readonly reason: string } => ({ ok: false, reason });

function isRecord(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === 'string' && (ADMIN_ROLES as readonly string[]).includes(value);
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

function nullableText(source: Obj, name: string): Parsed<string | null> {
  const value = source[name];
  if (value === null || value === undefined) return ok(null);
  return typeof value === 'string' ? ok(value) : fail(`campo "${name}": esperado texto ou null, veio ${typeOf(value)}`);
}

function bool(source: Obj, name: string): Parsed<boolean> {
  const value = source[name];
  return typeof value === 'boolean' ? ok(value) : fail(`campo "${name}": esperado booleano, veio ${typeOf(value)}`);
}

/** `id`, `name`, `email`, `role`, `createdAt`, `deactivatedAt` — os campos de `AdminUserRecord`, e SÓ eles. */
function parseAdminUserRecord(source: Obj, what: string): Parsed<AdminUserRecord> {
  const id = text(source, 'id');
  if (!id.ok) return fail(`${what}: ${id.reason}`);
  const name = text(source, 'name');
  if (!name.ok) return fail(`${what}: ${name.reason}`);
  const email = text(source, 'email');
  if (!email.ok) return fail(`${what}: ${email.reason}`);
  const role = source['role'];
  if (!isAdminRole(role)) return fail(`${what}: campo "role": papel desconhecido (${typeOf(role)})`);
  const createdAt = text(source, 'createdAt');
  if (!createdAt.ok) return fail(`${what}: ${createdAt.reason}`);
  const deactivatedAt = nullableText(source, 'deactivatedAt');
  if (!deactivatedAt.ok) return fail(`${what}: ${deactivatedAt.reason}`);
  return ok({ id: id.value, name: name.value, email: email.value, role, createdAt: createdAt.value, deactivatedAt: deactivatedAt.value });
}

export function parseAdminUserListResponse(raw: unknown): Parsed<AdminUserListResult> {
  const body = requireObject(raw, 'lista de usuários');
  if (!body.ok) return body;
  const items = body.value['items'];
  if (!Array.isArray(items)) return fail(`lista de usuários: campo "items": esperado lista, veio ${typeOf(items)}`);
  const parsedItems: AdminUserRecord[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = requireObject(items[i], `lista de usuários: items[${i}]`);
    if (!item.ok) return item;
    const parsed = parseAdminUserRecord(item.value, `lista de usuários: items[${i}]`);
    if (!parsed.ok) return parsed;
    parsedItems.push(parsed.value);
  }
  const nextCursor = body.value['nextCursor'];
  if (nextCursor !== null && typeof nextCursor !== 'string') {
    return fail(`lista de usuários: campo "nextCursor": esperado texto ou null, veio ${typeOf(nextCursor)}`);
  }
  return ok({ items: parsedItems, nextCursor });
}

/** Resposta de `POST /users` — `AdminUserRecord` + o token de ativação de uso único (só aparece esta vez). */
export function parseAdminUserCreateResponse(raw: unknown): Parsed<AdminUserCreateResult> {
  const body = requireObject(raw, 'criação de usuário');
  if (!body.ok) return body;
  const record = parseAdminUserRecord(body.value, 'criação de usuário');
  if (!record.ok) return record;
  const activationToken = text(body.value, 'activationToken');
  if (!activationToken.ok) return fail(`criação de usuário: ${activationToken.reason}`);
  const activationTokenExpiresAt = text(body.value, 'activationTokenExpiresAt');
  if (!activationTokenExpiresAt.ok) return fail(`criação de usuário: ${activationTokenExpiresAt.reason}`);
  return ok({ ...record.value, activationToken: activationToken.value, activationTokenExpiresAt: activationTokenExpiresAt.value });
}

/** Resposta de desativar/reativar/trocar papel — sempre só o `AdminUserRecord` atualizado. */
export function parseAdminUserMutationResponse(raw: unknown): Parsed<AdminUserRecord> {
  const body = requireObject(raw, 'usuário');
  if (!body.ok) return body;
  return parseAdminUserRecord(body.value, 'usuário');
}

/** Resposta de `POST /auth/activate` — SEM sessão, nunca traz `csrfToken` nem cookie. */
export function parseActivateAdminUserResponse(raw: unknown): Parsed<ActivateAdminUserResult> {
  const body = requireObject(raw, 'ativação de conta');
  if (!body.ok) return body;
  const role = body.value['role'];
  if (!isAdminRole(role)) return fail(`ativação de conta: campo "role": papel desconhecido (${typeOf(role)})`);
  const requiresTwoFactorEnrollment = bool(body.value, 'requiresTwoFactorEnrollment');
  if (!requiresTwoFactorEnrollment.ok) return fail(`ativação de conta: ${requiresTwoFactorEnrollment.reason}`);

  if (!requiresTwoFactorEnrollment.value) {
    return ok({ role, requiresTwoFactorEnrollment: false });
  }
  // `true`: `enrollmentToken`/`enrollmentTokenExpiresAt` vêm JUNTOS nesta mesma resposta (contrato) — sem eles
  // não é uma ativação completa para quem precisa do 2FA obrigatório.
  const enrollmentToken = text(body.value, 'enrollmentToken');
  if (!enrollmentToken.ok) return fail(`ativação de conta: ${enrollmentToken.reason}`);
  const enrollmentTokenExpiresAt = text(body.value, 'enrollmentTokenExpiresAt');
  if (!enrollmentTokenExpiresAt.ok) return fail(`ativação de conta: ${enrollmentTokenExpiresAt.reason}`);
  return ok({
    role,
    requiresTwoFactorEnrollment: true,
    enrollmentToken: enrollmentToken.value,
    enrollmentTokenExpiresAt: enrollmentTokenExpiresAt.value,
  });
}
