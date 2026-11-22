/**
 * Camada de lógica de negócio — gestão de usuários do painel (F07, só papel
 * `dono`): listar, criar, desativar, reativar, trocar papel; e o primeiro
 * acesso de quem acabou de ser criado (ativação por token).
 *
 * Toda mutação feita pelo DONO (criar/desativar/reativar/trocar papel) exige
 * a senha atual dele na própria requisição — mesmo padrão M-3 já usado em
 * `/2fa/disable` e `/settings/email`: quem só tem o cookie de sessão
 * roubado (CSRF à parte, que a rota também exige) não basta.
 */
import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import type { AdminRole, AdminUser } from '../domain/admin.js';
import { roleRequiresTwoFactor } from '../domain/two-factor.js';
import type { DecodedCursor } from '../domain/pagination.js';
import { decodeCursor, encodeCursor } from '../domain/pagination.js';
import { reauthenticateAdmin } from './admin-auth-service.js';
import { ACCOUNT_ACTIVATION_TTL_HOURS, hashEnrollmentToken, issueEnrollmentToken } from './admin-enrollment-token-service.js';
import { findAdminByEmail } from '../repositories/admin-repository.js';
import { consumeEnrollmentToken } from '../repositories/admin-enrollment-token-repository.js';
import { insertAuditLog } from '../repositories/admin-audit-repository.js';
import { deleteAdminSessionsExcept } from '../repositories/admin-session-repository.js';
import {
  clearAdminUserDeactivated,
  countOtherActiveOwners,
  insertAdminUser,
  listAdminUsers as listAdminUsersPage,
  lockAdminUserById,
  setAdminUserDeactivated,
  setAdminUserPasswordHash,
  setAdminUserRole,
  type AdminUserManagementRow,
  type ListAdminUsersFilter,
} from '../repositories/admin-user-repository.js';
import { reserveAdminBcrypt, withBcryptReservation } from '../lib/bcrypt-pool.js';
import { ipBucket48 } from '../lib/ip-bucket.js';

const BCRYPT_COST = 12;

interface ActorContext {
  readonly adminId: string;
  readonly ipAddress: string | null;
}

export type PasswordGateFailure = { readonly kind: 'password_invalid' } | { readonly kind: 'account_locked'; readonly retryAfterSeconds: number };

/** Mesmo contador por conta do login (`verifyPasswordWithGuard`): não é um gate novo, é reaproveitar o existente. */
async function gatePassword(pool: Pool, actor: AdminUser, password: string, ipAddress: string | null): Promise<{ readonly kind: 'ok' } | PasswordGateFailure> {
  const check = await reauthenticateAdmin(pool, actor, password, ipAddress);
  if (check.kind === 'ok') return { kind: 'ok' };
  if (check.kind === 'locked') return { kind: 'account_locked', retryAfterSeconds: check.retryAfterSeconds };
  return { kind: 'password_invalid' };
}

async function hashRandomPassword(ipAddress: string | null): Promise<string> {
  const origin = `admin:${ipBucket48(ipAddress ?? '-')}`;
  // Senha descartada na hora: nenhum admin criado pelo painel nasce com uma senha que ALGUÉM conhece — só o token
  // de ativação (abaixo) abre o primeiro acesso.
  return withBcryptReservation(reserveAdminBcrypt(origin), (reservation) => reservation.hash(randomBytes(32).toString('hex'), BCRYPT_COST));
}

// ---------------------------------------------------------------- listar

export type ListAdminUsersOutcome =
  | { readonly kind: 'ok'; readonly items: readonly AdminUserManagementRow[]; readonly nextCursor: string | null }
  | { readonly kind: 'invalid_cursor' };

export interface ListAdminUsersInput {
  readonly role?: AdminRole | undefined;
  readonly includeDeactivated: boolean;
  readonly cursor?: string | undefined;
  readonly limit: number;
}

export async function listAdminUsers(pool: Pool, input: ListAdminUsersInput, actor: ActorContext): Promise<ListAdminUsersOutcome> {
  let decoded: DecodedCursor | null = null;
  if (input.cursor) {
    decoded = decodeCursor(input.cursor);
    if (!decoded) return { kind: 'invalid_cursor' };
  }

  const filter: ListAdminUsersFilter = { role: input.role, includeDeactivated: input.includeDeactivated, cursor: decoded, limit: input.limit };
  const result = await listAdminUsersPage(pool, filter);

  // Mesmo padrão de `listDriverApplicationsForAdmin`: audita os FILTROS e a contagem, nunca a lista inteira de PII.
  await insertAuditLog(pool, {
    adminId: actor.adminId,
    action: 'admin.user.listed',
    targetType: 'admin_user',
    targetId: null,
    after: { role: input.role ?? null, includeDeactivated: input.includeDeactivated, count: result.items.length },
    ipAddress: actor.ipAddress,
  });

  const nextCursor = result.hasMore && result.lastCursorValues ? encodeCursor(result.lastCursorValues.createdAt, result.lastCursorValues.id) : null;
  return { kind: 'ok', items: result.items, nextCursor };
}

// ---------------------------------------------------------------- criar

export type CreateAdminUserOutcome =
  | { readonly kind: 'ok'; readonly user: AdminUserManagementRow; readonly activationToken: string; readonly activationTokenExpiresAt: string }
  | { readonly kind: 'email_taken' }
  | PasswordGateFailure;

export interface CreateAdminUserInput {
  readonly name: string;
  readonly email: string;
  readonly role: AdminRole;
  /** Senha ATUAL do dono que está criando — reautenticação, não a senha do novo usuário (ele não tem uma ainda). */
  readonly password: string;
}

export async function createAdminUser(pool: Pool, actor: AdminUser, input: CreateAdminUserInput, context: { ipAddress: string | null }): Promise<CreateAdminUserOutcome> {
  const gate = await gatePassword(pool, actor, input.password, context.ipAddress);
  if (gate.kind !== 'ok') return gate;

  const passwordHash = await hashRandomPassword(context.ipAddress);
  const inserted = await insertAdminUser(pool, { name: input.name, email: input.email, role: input.role, passwordHash });
  if (inserted.kind === 'email_taken') return { kind: 'email_taken' };

  const issued = await issueEnrollmentToken(pool, inserted.row.id, ACCOUNT_ACTIVATION_TTL_HOURS);

  await insertAuditLog(pool, {
    adminId: actor.id,
    action: 'admin.user.created',
    targetType: 'admin_user',
    targetId: inserted.row.id,
    after: { name: input.name, email: input.email, role: input.role },
    ipAddress: context.ipAddress,
  });

  return { kind: 'ok', user: inserted.row, activationToken: issued.token, activationTokenExpiresAt: issued.expiresAt.toISOString() };
}

// ---------------------------------------------------------------- desativar / reativar / trocar papel

export type MutateAdminUserOutcome =
  | { readonly kind: 'ok'; readonly user: AdminUserManagementRow }
  | { readonly kind: 'not_found' }
  /** Deixaria o painel sem nenhum `dono` ativo — recusado, não é uma escolha do dono atual desfazer. */
  | { readonly kind: 'last_owner' }
  | PasswordGateFailure;

async function withLockedTarget<T>(pool: Pool, id: string, body: (client: import('pg').PoolClient, target: AdminUserManagementRow) => Promise<T>): Promise<T | { readonly kind: 'not_found' }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const target = await lockAdminUserById(client, id);
    if (!target) {
      await client.query('ROLLBACK');
      return { kind: 'not_found' };
    }
    const result = await body(client, target);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function deactivateAdminUser(pool: Pool, actor: AdminUser, id: string, password: string, context: { ipAddress: string | null }): Promise<MutateAdminUserOutcome> {
  const gate = await gatePassword(pool, actor, password, context.ipAddress);
  if (gate.kind !== 'ok') return gate;

  const outcome = await withLockedTarget(pool, id, async (client, target) => {
    if (target.deactivatedAt !== null) return { kind: 'ok' as const, user: target, changed: false };
    // Só quando o ALVO é um dono ATIVO é que desativá-lo pode zerar o painel — travar o conjunto inteiro
    // (ver `countOtherActiveOwners`) serializa contra outra desativação/troca de papel concorrente num outro dono.
    if (target.role === 'dono' && (await countOtherActiveOwners(client, id)) < 1) return { kind: 'last_owner' as const };
    const updated = await setAdminUserDeactivated(client, id);
    // Cookie roubado antes da desativação não sobrevive a ela (mesmo motivo do M-3 ao ligar/desligar 2FA).
    await deleteAdminSessionsExcept(client, id, null);
    return { kind: 'ok' as const, user: updated!, changed: true };
  });

  if (outcome.kind !== 'ok') return outcome;
  if (outcome.changed) {
    await insertAuditLog(pool, { adminId: actor.id, action: 'admin.user.deactivated', targetType: 'admin_user', targetId: id, ipAddress: context.ipAddress });
  }
  return { kind: 'ok', user: outcome.user };
}

export async function reactivateAdminUser(pool: Pool, actor: AdminUser, id: string, password: string, context: { ipAddress: string | null }): Promise<MutateAdminUserOutcome> {
  const gate = await gatePassword(pool, actor, password, context.ipAddress);
  if (gate.kind !== 'ok') return gate;

  const outcome = await withLockedTarget(pool, id, async (client, target) => {
    if (target.deactivatedAt === null) return { kind: 'ok' as const, user: target, changed: false };
    const updated = await clearAdminUserDeactivated(client, id);
    return { kind: 'ok' as const, user: updated!, changed: true };
  });

  if (outcome.kind !== 'ok') return outcome;
  if (outcome.changed) {
    await insertAuditLog(pool, { adminId: actor.id, action: 'admin.user.reactivated', targetType: 'admin_user', targetId: id, ipAddress: context.ipAddress });
  }
  return { kind: 'ok', user: outcome.user };
}

export async function changeAdminUserRole(pool: Pool, actor: AdminUser, id: string, role: AdminRole, password: string, context: { ipAddress: string | null }): Promise<MutateAdminUserOutcome> {
  const gate = await gatePassword(pool, actor, password, context.ipAddress);
  if (gate.kind !== 'ok') return gate;

  const outcome = await withLockedTarget(pool, id, async (client, target) => {
    if (target.role === role) return { kind: 'ok' as const, user: target, before: target.role, changed: false };
    // Só o dono ATIVO entra na conta de "quantos sobram" — rebaixar quem já estava desativado não tira ninguém
    // de circulação de verdade.
    if (target.role === 'dono' && target.deactivatedAt === null && (await countOtherActiveOwners(client, id)) < 1) return { kind: 'last_owner' as const };
    const updated = await setAdminUserRole(client, id, role);
    return { kind: 'ok' as const, user: updated, before: target.role, changed: true };
  });

  if (outcome.kind !== 'ok') return outcome;
  if (outcome.changed) {
    await insertAuditLog(pool, {
      adminId: actor.id,
      action: 'admin.user.role_changed',
      targetType: 'admin_user',
      targetId: id,
      before: { role: outcome.before },
      after: { role },
      ipAddress: context.ipAddress,
    });
  }
  return { kind: 'ok', user: outcome.user };
}

// ---------------------------------------------------------------- primeiro acesso (ativação)

export interface ActivateAdminUserInput {
  readonly email: string;
  readonly token: string;
  readonly newPassword: string;
}

export type ActivateAdminUserOutcome =
  | {
      readonly kind: 'ok';
      readonly role: AdminRole;
      readonly requiresTwoFactorEnrollment: boolean;
      /** Só quando o papel exige 2FA (dono/financeiro): a pessoa acabou de provar quem é (o token), então o
       * token de enrolamento do 2FA sai JUNTO, sem precisar de uma segunda entrega fora de banda pelo dono. */
      readonly enrollmentToken?: string;
      readonly enrollmentTokenExpiresAt?: string;
    }
  /** E-mail inexistente, admin desativado, ou token ausente/errado/vencido/já usado — SEMPRE a mesma resposta (sem oráculo). */
  | { readonly kind: 'invalid' };

export async function activateAdminUser(pool: Pool, input: ActivateAdminUserInput, context: { ipAddress: string | null }): Promise<ActivateAdminUserOutcome> {
  const record = await findAdminByEmail(pool, input.email);
  if (!record || record.deactivatedAt !== null) return { kind: 'invalid' };

  const tokenHash = hashEnrollmentToken(input.token);
  const consumed = await consumeEnrollmentToken(pool, record.id, tokenHash);
  if (!consumed) return { kind: 'invalid' };

  const passwordHash = await (async () => {
    const origin = `admin:${ipBucket48(context.ipAddress ?? '-')}`;
    return withBcryptReservation(reserveAdminBcrypt(origin), (reservation) => reservation.hash(input.newPassword, BCRYPT_COST));
  })();
  await setAdminUserPasswordHash(pool, record.id, passwordHash);

  const requiresTwoFactorEnrollment = roleRequiresTwoFactor(record.role);
  let enrollment: { readonly enrollmentToken: string; readonly enrollmentTokenExpiresAt: string } | undefined;
  if (requiresTwoFactorEnrollment) {
    const issued = await issueEnrollmentToken(pool, record.id);
    enrollment = { enrollmentToken: issued.token, enrollmentTokenExpiresAt: issued.expiresAt.toISOString() };
  }

  await insertAuditLog(pool, { adminId: record.id, action: 'admin.user.activated', targetType: 'admin_user', targetId: record.id, ipAddress: context.ipAddress });

  return { kind: 'ok', role: record.role, requiresTwoFactorEnrollment, ...enrollment };
}
