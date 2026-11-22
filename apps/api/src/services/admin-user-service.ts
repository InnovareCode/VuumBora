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
import type { TwoFactorConfig } from '../domain/two-factor.js';
import type { StepUpInput } from '../domain/email-settings.js';
import type { DecodedCursor } from '../domain/pagination.js';
import { decodeCursor, encodeCursor } from '../domain/pagination.js';
import { reauthenticateAdmin } from './admin-auth-service.js';
import { ACCOUNT_ACTIVATION_TTL_HOURS, hashEnrollmentToken, issueEnrollmentToken } from './admin-enrollment-token-service.js';
import { verifyStepUp } from './admin-two-factor-service.js';
import { findAdminByEmail, findAdminRecordById } from '../repositories/admin-repository.js';
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

/** Contexto comum das mutações: IP para auditoria/contador, e a configuração de 2FA para o passo extra (dono/financeiro, ponto 3 abaixo). */
export interface MutationContext {
  readonly ipAddress: string | null;
  readonly twoFactor?: TwoFactorConfig | undefined;
}

export type PasswordGateFailure = { readonly kind: 'password_invalid' } | { readonly kind: 'account_locked'; readonly retryAfterSeconds: number };

/**
 * Falha do gate de uma mutação — senha sozinha (papéis normais) ou senha + TOTP (dono/financeiro, revisão S1
 * rodada 3g: recomendação do Órion sobre a 0023, decisão do Atlas de fazer agora). `PasswordGateFailure` é o
 * subconjunto que a senha sozinha pode devolver.
 */
export type StepUpFailure =
  | PasswordGateFailure
  | { readonly kind: 'invalid_code' }
  | { readonly kind: 'two_factor_locked'; readonly retryAfterSeconds: number }
  | { readonly kind: 'two_factor_unavailable' }
  | { readonly kind: 'two_factor_not_enrolled' };

/** Mesmo contador por conta do login (`verifyPasswordWithGuard`): não é um gate novo, é reaproveitar o existente. */
async function gatePassword(pool: Pool, actor: AdminUser, password: string, ipAddress: string | null): Promise<{ readonly kind: 'ok' } | PasswordGateFailure> {
  const check = await reauthenticateAdmin(pool, actor, password, ipAddress);
  if (check.kind === 'ok') return { kind: 'ok' };
  if (check.kind === 'locked') return { kind: 'account_locked', retryAfterSeconds: check.retryAfterSeconds };
  return { kind: 'password_invalid' };
}

/**
 * Gate da mutação, de acordo com o papel ENVOLVIDO (o novo papel, ao criar ou promover; o papel atual, ao
 * reativar): só senha para os quatro papéis normais; senha + TOTP (`verifyStepUp`, reaproveitado de
 * `admin-email-settings-service.ts`) para `dono`/`financeiro` (`roleRequiresTwoFactor`). Sem `code` enviado,
 * o TOTP é checado com string vazia — falha como "código inválido", sem um terceiro caminho para tratar.
 */
async function gateForRole(
  pool: Pool,
  actor: AdminUser,
  role: AdminRole,
  input: { readonly password: string; readonly code?: string | undefined },
  ipAddress: string | null,
  twoFactor: TwoFactorConfig | undefined,
  purpose: string,
): Promise<{ readonly kind: 'ok' } | StepUpFailure> {
  if (!roleRequiresTwoFactor(role)) return gatePassword(pool, actor, input.password, ipAddress);
  if (!twoFactor) return { kind: 'two_factor_unavailable' };

  const stepUpInput: StepUpInput = { password: input.password, code: input.code ?? '' };
  const outcome = await verifyStepUp(pool, actor, stepUpInput, { ipAddress }, twoFactor, purpose);
  switch (outcome.kind) {
    case 'ok':
      return { kind: 'ok' };
    case 'password_invalid':
      return { kind: 'password_invalid' };
    case 'account_locked':
      return { kind: 'account_locked', retryAfterSeconds: outcome.retryAfterSeconds };
    case 'invalid_code':
      return { kind: 'invalid_code' };
    case 'locked':
      return { kind: 'two_factor_locked', retryAfterSeconds: outcome.retryAfterSeconds };
    case 'not_enrolled':
      return { kind: 'two_factor_not_enrolled' };
    // `challenge_invalid`/`enrollment_token_invalid` são de outros fluxos (login e enrolamento por desafio,
    // sem sessão); `verifyStepUp` por sessão nunca os devolve — só aqui para a troca ser exaustiva.
    case 'challenge_invalid':
    case 'enrollment_token_invalid':
    case 'two_factor_unavailable':
    default:
      return { kind: 'two_factor_unavailable' };
  }
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
  | StepUpFailure;

export interface CreateAdminUserInput {
  readonly name: string;
  readonly email: string;
  readonly role: AdminRole;
  /** Senha ATUAL do dono que está criando — reautenticação, não a senha do novo usuário (ele não tem uma ainda). */
  readonly password: string;
  /** TOTP do dono — só exigido (e só checado) quando `role` é `dono`/`financeiro` (ponto 3, revisão S1 rodada 3g). */
  readonly code?: string | undefined;
}

export async function createAdminUser(pool: Pool, actor: AdminUser, input: CreateAdminUserInput, context: MutationContext): Promise<CreateAdminUserOutcome> {
  const gate = await gateForRole(pool, actor, input.role, input, context.ipAddress, context.twoFactor, 'admin.user.create');
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
    after: { name: input.name, email: input.email, role: input.role, stepUp: roleRequiresTwoFactor(input.role) ? 'password+totp' : 'password' },
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
  /**
   * Conflito passageiro: deadlock (`40P01`) entre duas mutações concorrentes sobre donos diferentes
   * (`countOtherActiveOwners` trava o conjunto inteiro), ou o papel do alvo mudou entre a checagem do gate e
   * o lock desta transação (reativar) de um jeito que pede uma prova mais forte do que a que foi dada. A
   * regra nunca é violada; só pede para repetir a chamada.
   */
  | { readonly kind: 'retry' }
  | StepUpFailure;

const DEADLOCK_ERROR_CODE = '40P01';

async function withLockedTarget<T>(pool: Pool, id: string, body: (client: import('pg').PoolClient, target: AdminUserManagementRow) => Promise<T>): Promise<T | { readonly kind: 'not_found' } | { readonly kind: 'retry' }> {
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
    // Duas mutações concorrentes sobre donos DIFERENTES (`countOtherActiveOwners` trava o conjunto inteiro)
    // podem se esperar em ordem cruzada — a regra do último dono nunca é violada, só pede para repetir.
    if ((err as { code?: string }).code === DEADLOCK_ERROR_CODE) return { kind: 'retry' };
    throw err;
  } finally {
    client.release();
  }
}

export async function deactivateAdminUser(pool: Pool, actor: AdminUser, id: string, input: { readonly password: string }, context: MutationContext): Promise<MutateAdminUserOutcome> {
  const gate = await gatePassword(pool, actor, input.password, context.ipAddress);
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

/**
 * Reativar um `dono` exige senha + TOTP (ponto 3); os outros quatro papéis, só senha. O papel que decide é o
 * ATUAL do alvo, só conhecido depois de ler o registro — por isso o gate roda numa leitura (sem lock) ANTES da
 * transação, e a transação CONFERE de novo com a linha já travada: se o papel mudou nesse intervalo de um jeito
 * que pedia TOTP e só houve senha, devolve `retry` em vez de reativar com uma prova fraca demais para o papel real.
 */
export async function reactivateAdminUser(pool: Pool, actor: AdminUser, id: string, input: { readonly password: string; readonly code?: string | undefined }, context: MutationContext): Promise<MutateAdminUserOutcome> {
  const current = await findAdminRecordById(pool, id);
  if (!current) return { kind: 'not_found' };

  const gate = await gateForRole(pool, actor, current.role, input, context.ipAddress, context.twoFactor, 'admin.user.reactivate');
  if (gate.kind !== 'ok') return gate;

  const outcome = await withLockedTarget(pool, id, async (client, target) => {
    if (roleRequiresTwoFactor(target.role) && !roleRequiresTwoFactor(current.role)) return { kind: 'retry' as const };
    if (target.deactivatedAt === null) return { kind: 'ok' as const, user: target, changed: false };
    const updated = await clearAdminUserDeactivated(client, id);
    return { kind: 'ok' as const, user: updated!, changed: true };
  });

  if (outcome.kind !== 'ok') return outcome;
  if (outcome.changed) {
    await insertAuditLog(pool, {
      adminId: actor.id,
      action: 'admin.user.reactivated',
      targetType: 'admin_user',
      targetId: id,
      after: { stepUp: roleRequiresTwoFactor(current.role) ? 'password+totp' : 'password' },
      ipAddress: context.ipAddress,
    });
  }
  return { kind: 'ok', user: outcome.user };
}

/** Promover para `dono`/`financeiro` exige senha + TOTP (ponto 3); as outras trocas, só senha — decidido pelo NOVO papel, conhecido direto do pedido. */
export async function changeAdminUserRole(pool: Pool, actor: AdminUser, id: string, role: AdminRole, input: { readonly password: string; readonly code?: string | undefined }, context: MutationContext): Promise<MutateAdminUserOutcome> {
  const gate = await gateForRole(pool, actor, role, input, context.ipAddress, context.twoFactor, 'admin.user.role_change');
  if (gate.kind !== 'ok') return gate;

  const outcome = await withLockedTarget(pool, id, async (client, target) => {
    if (target.role === role) return { kind: 'ok' as const, user: target, before: target.role, changed: false };
    // Só o dono ATIVO entra na conta de "quantos sobram" — rebaixar quem já estava desativado não tira ninguém
    // de circulação de verdade.
    if (target.role === 'dono' && target.deactivatedAt === null && (await countOtherActiveOwners(client, id)) < 1) return { kind: 'last_owner' as const };
    const updated = await setAdminUserRole(client, id, role);
    // Mesmo motivo da desativação (M-3): um admin já logado, promovido ou rebaixado, não continua com a sessão
    // antiga — quem ganhou um papel mais sensível entra de novo e passa pelo 2FA que esse papel agora exige.
    await deleteAdminSessionsExcept(client, id, null);
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
      after: { role, stepUp: roleRequiresTwoFactor(role) ? 'password+totp' : 'password' },
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

/**
 * Id que nunca é de admin de verdade (a coluna é `uuid`, nunca gerada como nil) — só para dar ao `UPDATE` de
 * `consumeEnrollmentToken` abaixo uma linha-alvo que sempre afunda em "0 linhas" pelo índice de `admin_id`, do
 * mesmo jeito que um token errado de um admin real afundaria. Mesmo papel do `getDummyHash` (`identity-service.ts`):
 * gastar o mesmo trabalho no caminho que não existe.
 */
const DUMMY_ENROLLMENT_ADMIN_ID = '00000000-0000-0000-0000-000000000000';

export async function activateAdminUser(pool: Pool, input: ActivateAdminUserInput, context: { ipAddress: string | null }): Promise<ActivateAdminUserOutcome> {
  const record = await findAdminByEmail(pool, input.email);
  // SEMPRE o mesmo trabalho (1 SELECT + 1 hash + 1 UPDATE), exista ou não o e-mail: o Órion (revisão S1 rodada 3g)
  // achou que o caminho "e-mail inexistente" saía mais rápido (só o SELECT) do que "e-mail existe, token errado"
  // (SELECT + hash + UPDATE), e isso é um oráculo de tempo que revela quais e-mails de admin existem. O `UPDATE`
  // roda contra o id real quando a conta existe, ou contra `DUMMY_ENROLLMENT_ADMIN_ID` quando não — nos dois casos
  // 0 linhas batem (token errado também não bate), e o trabalho do banco é o mesmo.
  const tokenHash = hashEnrollmentToken(input.token);
  const consumed = await consumeEnrollmentToken(pool, record?.id ?? DUMMY_ENROLLMENT_ADMIN_ID, tokenHash);
  if (!record || record.deactivatedAt !== null || !consumed) return { kind: 'invalid' };

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
