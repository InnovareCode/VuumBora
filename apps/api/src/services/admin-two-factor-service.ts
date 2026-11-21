/**
 * Segundo fator (TOTP) do admin — enrolamento, verificação, códigos de
 * recuperação, bloqueio por tentativas. Toda ação grava `admin_audit_log`
 * AQUI (camada de serviço), para nenhuma rota nova esquecer de auditar.
 * Nunca entra no log/auditoria: segredo, código digitado, código de
 * recuperação, token de desafio.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AdminUser } from '../domain/admin.js';
import { roleRequiresTwoFactor, type SecondFactorMethod, type TwoFactorConfig } from '../domain/two-factor.js';
import { decryptSecret, encryptSecret } from '../lib/secret-box.js';
import { base32Decode, base32Encode, buildOtpauthUri, generateTotpSecret, verifyTotp } from '../lib/totp.js';
import { insertAuditLog } from '../repositories/admin-audit-repository.js';
import {
  consumeRecoveryCode,
  countUnusedRecoveryCodes,
  deleteAllTwoFactor,
  deleteChallenge,
  findActiveChallenge,
  findTotp,
  markTotpConfirmed,
  markTotpFailure,
  getOrCreatePendingSecret,
  markTotpSuccess,
  replaceRecoveryCodes,
  type ActiveChallenge,
} from '../repositories/admin-two-factor-repository.js';
import { consumeEnrollmentToken, isEnrollmentTokenValid } from '../repositories/admin-enrollment-token-repository.js';
import { deleteAdminSessionsExcept } from '../repositories/admin-session-repository.js';
import { hashEnrollmentToken } from './admin-enrollment-token-service.js';
import { hashToken, reauthenticateAdmin, startAdminSession, type AdminSessionGrant, type LoginContext } from './admin-auth-service.js';

const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export type TwoFactorRequestContext = LoginContext;

/** Códigos legíveis `ABCDE-FGHIJ` (50 bits). 256 % 32 == 0, então `byte % 32` é uniforme. */
function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const chars = Array.from(randomBytes(10), (byte) => RECOVERY_CODE_ALPHABET[byte % 32]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

function normalizeCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

function hashRecoveryCode(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex');
}

type FactorCheck =
  | { readonly kind: 'ok'; readonly method: SecondFactorMethod | 'enrollment' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'locked'; readonly retryAfterSeconds: number; readonly justLocked: boolean }
  /** Não há segredo no estado esperado (nunca enrolou / já enrolou). */
  | { readonly kind: 'not_applicable' };

interface CheckParams {
  readonly adminId: string;
  readonly code: string;
  /** `verify`: exige segredo CONFIRMADO. `enroll`: exige segredo PENDENTE. */
  readonly mode: 'verify' | 'enroll';
  readonly allowRecovery: boolean;
  readonly config: TwoFactorConfig;
  /** Roda na MESMA transação, depois do acerto — se lançar, tudo (inclusive o código gasto) é desfeito. */
  readonly onSuccess?: (client: PoolClient, info: { step: number | null }) => Promise<void>;
}

/**
 * Coração do 2FA. Roda numa transação com `SELECT ... FOR UPDATE` na linha
 * do admin: tentativas do mesmo admin se enfileiram, então 50 palpites em
 * paralelo não conseguem driblar o contador (condição de corrida clássica
 * de "ler, comparar, depois contar"). Falhas SÃO confirmadas (COMMIT) — é o
 * que faz o contador subir.
 */
async function checkSecondFactor(pool: Pool, params: CheckParams): Promise<FactorCheck> {
  const { adminId, code, mode, allowRecovery, config } = params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const record = await findTotp(client, adminId, { forUpdate: true });
    // `enroll` exige segredo pendente AINDA VÁLIDO: um QR vencido não pode ser confirmado.
    const stateMatches = record !== null && (mode === 'verify' ? record.confirmed : !record.confirmed && !record.pendingExpired);
    if (!record || !stateMatches) {
      await client.query('ROLLBACK');
      return { kind: 'not_applicable' };
    }

    if (record.lockedForSeconds > 0) {
      await client.query('ROLLBACK');
      return { kind: 'locked', retryAfterSeconds: record.lockedForSeconds, justLocked: false };
    }

    const secret = base32Decode(decryptSecret(record.secretEncrypted, config.encryptionKey!, adminId));
    const normalized = normalizeCode(code);
    let method: SecondFactorMethod | null = null;
    let step: number | null = null;

    if (/^\d{6}$/.test(normalized)) {
      const matchedStep = verifyTotp(secret, normalized, Date.now());
      // Passo já usado = replay do mesmo código dentro da janela.
      if (matchedStep !== null && (record.lastUsedStep === null || matchedStep > record.lastUsedStep)) {
        method = 'totp';
        step = matchedStep;
      }
    } else if (allowRecovery && /^[A-Z2-7]{10}$/.test(normalized)) {
      if (await consumeRecoveryCode(client, adminId, hashRecoveryCode(normalized))) method = 'recovery_code';
    }

    if (method === null) {
      const failure = await markTotpFailure(client, adminId, config.maxAttempts, config.lockMinutes);
      await client.query('COMMIT');
      return failure.locked
        ? { kind: 'locked', retryAfterSeconds: failure.lockedForSeconds, justLocked: true }
        : { kind: 'invalid' };
    }

    await markTotpSuccess(client, adminId, step);
    await params.onSuccess?.(client, { step });
    await client.query('COMMIT');
    return { kind: 'ok', method: mode === 'enroll' ? 'enrollment' : method };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

class ChallengeAlreadyUsed extends Error {}
class EnrollmentTokenRejected extends Error {}

async function audit(pool: Pool, adminId: string, action: string, context: { ipAddress: string | null }, after?: unknown): Promise<void> {
  await insertAuditLog(pool, { adminId, action, targetType: 'admin_user', targetId: adminId, ...(after !== undefined ? { after } : {}), ipAddress: context.ipAddress });
}

/** Registra o resultado negativo de uma checagem e devolve o desfecho pronto para a rota. */
async function auditFailure(pool: Pool, adminId: string, check: Exclude<FactorCheck, { kind: 'ok' }>, context: { ipAddress: string | null }, purpose: string) {
  if (check.kind === 'invalid') await audit(pool, adminId, 'admin.2fa.verify_failed', context, { purpose });
  else if (check.kind === 'locked') {
    await audit(pool, adminId, check.justLocked ? 'admin.2fa.locked' : 'admin.2fa.attempt_while_locked', context, { purpose, retryAfterSeconds: check.retryAfterSeconds });
  }
}

export type FactorFailure =
  | { readonly kind: 'invalid_code' }
  | { readonly kind: 'locked'; readonly retryAfterSeconds: number }
  | { readonly kind: 'challenge_invalid' }
  | { readonly kind: 'two_factor_unavailable' }
  /** Reautenticação com sessão: a senha atual não confere. */
  | { readonly kind: 'password_invalid' }
  /** Falhas de senha demais nesta conta (mesmo contador do login). */
  | { readonly kind: 'account_locked'; readonly retryAfterSeconds: number }
  /** Primeiro enrolamento de papel obrigatório sem o token fora de banda (ausente, errado, vencido ou já usado). */
  | { readonly kind: 'enrollment_token_invalid' };

function toFailure(check: Exclude<FactorCheck, { kind: 'ok' }>): FactorFailure {
  if (check.kind === 'locked') return { kind: 'locked', retryAfterSeconds: check.retryAfterSeconds };
  return { kind: 'invalid_code' };
}

// ---------------------------------------------------------------- login (etapa 2)

export type VerifyLoginOutcome =
  | ({ readonly kind: 'session'; readonly method: SecondFactorMethod; readonly recoveryCodesRemaining: number } & AdminSessionGrant)
  | FactorFailure;

/** Troca desafio + código (TOTP ou recuperação) por sessão. O desafio vale uma única vez. */
export async function verifyLoginChallenge(
  pool: Pool,
  input: { challengeToken: string; code: string },
  context: TwoFactorRequestContext,
  config: TwoFactorConfig,
): Promise<VerifyLoginOutcome> {
  if (!config.encryptionKey) return { kind: 'two_factor_unavailable' };
  const challenge = await findActiveChallenge(pool, hashToken(input.challengeToken));
  if (!challenge) return { kind: 'challenge_invalid' };

  let check: FactorCheck;
  try {
    check = await checkSecondFactor(pool, {
      adminId: challenge.admin.id,
      code: input.code,
      mode: 'verify',
      allowRecovery: true,
      config,
      onSuccess: async (client) => {
        if (!(await deleteChallenge(client, challenge.challengeId))) throw new ChallengeAlreadyUsed();
      },
    });
  } catch (err) {
    if (err instanceof ChallengeAlreadyUsed) return { kind: 'challenge_invalid' };
    throw err;
  }

  if (check.kind === 'not_applicable') return { kind: 'challenge_invalid' };
  if (check.kind !== 'ok') {
    await auditFailure(pool, challenge.admin.id, check, context, 'login');
    return toFailure(check);
  }

  const method = check.method as SecondFactorMethod;
  const remaining = await countUnusedRecoveryCodes(pool, challenge.admin.id);
  if (method === 'recovery_code') await audit(pool, challenge.admin.id, 'admin.2fa.recovery_code_used', context, { remaining });
  const grant = await startAdminSession(pool, challenge.admin, context);
  return { kind: 'session', method, recoveryCodesRemaining: remaining, ...grant };
}

// ---------------------------------------------------------------- enrolamento

export type StartEnrollmentOutcome =
  | { readonly kind: 'started'; readonly secret: string; readonly otpauthUri: string }
  | { readonly kind: 'already_enrolled' }
  | FactorFailure;

async function startEnrollmentFor(pool: Pool, admin: AdminUser, context: { ipAddress: string | null }, config: TwoFactorConfig): Promise<StartEnrollmentOutcome> {
  if (!config.encryptionKey) return { kind: 'two_factor_unavailable' };
  const fresh = base32Encode(generateTotpSecret());
  const pending = await getOrCreatePendingSecret(pool, admin.id, encryptSecret(fresh, config.encryptionKey, admin.id), config.pendingEnrollmentMinutes);
  if (pending.kind === 'already_enrolled') return { kind: 'already_enrolled' };
  // Segredo pendente ainda válido: devolve o MESMO (idempotente) em vez de trocá-lo.
  const secret = pending.kind === 'existing' ? decryptSecret(pending.secretEncrypted, config.encryptionKey, admin.id) : fresh;
  await audit(pool, admin.id, pending.kind === 'existing' ? 'admin.2fa.enroll_resumed' : 'admin.2fa.enroll_started', context);
  return { kind: 'started', secret, otpauthUri: buildOtpauthUri(config.issuer, admin.email, secret) };
}

type PasswordFailure = Extract<FactorFailure, { kind: 'password_invalid' | 'account_locked' }>;
type PasswordGate = { readonly kind: 'ok' } | PasswordFailure;

/** Reautenticação (M-3): ação sensível pedida por sessão exige a senha atual, sob o contador por conta. */
async function requirePassword(pool: Pool, admin: AdminUser, password: string, context: { ipAddress: string | null }): Promise<PasswordGate> {
  const check = await reauthenticateAdmin(pool, admin, password, context.ipAddress);
  if (check.kind === 'ok') return { kind: 'ok' };
  if (check.kind === 'locked') return { kind: 'account_locked', retryAfterSeconds: check.retryAfterSeconds };
  return { kind: 'password_invalid' };
}

/** Enrolamento por sessão (papéis em que o 2FA é opcional). Exige a senha atual. */
export async function startEnrollment(pool: Pool, admin: AdminUser, password: string, context: { ipAddress: string | null }, config: TwoFactorConfig): Promise<StartEnrollmentOutcome> {
  const gate = await requirePassword(pool, admin, password, context);
  if (gate.kind !== 'ok') return gate;
  return startEnrollmentFor(pool, admin, context, config);
}

/** Resolve o desafio E o token de enrolamento (fora de banda). `null` = desafio inválido; token ruim vira desfecho próprio. */
async function resolveMandatoryEnrollment(pool: Pool, challengeToken: string, enrollmentToken: string, context: { ipAddress: string | null }) {
  const challenge = await findActiveChallenge(pool, hashToken(challengeToken));
  if (!challenge) return { kind: 'challenge_invalid' as const };
  const tokenHash = hashEnrollmentToken(enrollmentToken);
  if (!(await isEnrollmentTokenValid(pool, challenge.admin.id, tokenHash))) {
    await audit(pool, challenge.admin.id, 'admin.2fa.enrollment_token_rejected', context);
    return { kind: 'enrollment_token_invalid' as const };
  }
  return { kind: 'ok' as const, challenge, tokenHash };
}

/** Enrolamento por desafio (papéis obrigatórios — ainda não existe sessão). Exige o token de uso único fora de banda (M-2). */
export async function startEnrollmentFromChallenge(
  pool: Pool,
  input: { challengeToken: string; enrollmentToken: string },
  context: { ipAddress: string | null },
  config: TwoFactorConfig,
): Promise<StartEnrollmentOutcome> {
  const resolved = await resolveMandatoryEnrollment(pool, input.challengeToken, input.enrollmentToken, context);
  if (resolved.kind !== 'ok') return resolved;
  return startEnrollmentFor(pool, resolved.challenge.admin, context, config);
}

export type ConfirmEnrollmentOutcome =
  | { readonly kind: 'confirmed'; readonly recoveryCodes: string[] }
  | FactorFailure
  | { readonly kind: 'not_started' };

interface ConfirmHooks {
  /** Enrolamento por desafio: o desafio é gasto na mesma transação. */
  readonly challenge?: ActiveChallenge;
  /** Hash do token fora de banda, gasto na mesma transação (só no enrolamento obrigatório). */
  readonly enrollmentTokenHash?: string;
  /** Sessão a poupar ao derrubar as demais (M-3); `null` = derruba todas (ainda não há sessão atual). */
  readonly keepSessionTokenHash: string | null;
}

async function confirmEnrollmentFor(
  pool: Pool,
  admin: AdminUser,
  code: string,
  context: { ipAddress: string | null },
  config: TwoFactorConfig,
  hooks: ConfirmHooks,
): Promise<ConfirmEnrollmentOutcome> {
  if (!config.encryptionKey) return { kind: 'two_factor_unavailable' };
  const recoveryCodes = generateRecoveryCodes();

  let check: FactorCheck;
  try {
    check = await checkSecondFactor(pool, {
      adminId: admin.id,
      code,
      mode: 'enroll',
      allowRecovery: false,
      config,
      onSuccess: async (client, { step }) => {
        // `step` nunca é null aqui: no modo `enroll` só TOTP é aceito.
        await markTotpConfirmed(client, admin.id, step!);
        await replaceRecoveryCodes(client, admin.id, recoveryCodes.map((c) => hashRecoveryCode(normalizeCode(c))));
        if (hooks.enrollmentTokenHash && !(await consumeEnrollmentToken(client, admin.id, hooks.enrollmentTokenHash))) throw new EnrollmentTokenRejected();
        if (hooks.challenge && !(await deleteChallenge(client, hooks.challenge.challengeId))) throw new ChallengeAlreadyUsed();
        // Ligar o 2FA derruba as OUTRAS sessões: cookie roubado antes não sobrevive à mudança.
        await deleteAdminSessionsExcept(client, admin.id, hooks.keepSessionTokenHash);
      },
    });
  } catch (err) {
    if (err instanceof ChallengeAlreadyUsed) return { kind: 'challenge_invalid' };
    if (err instanceof EnrollmentTokenRejected) return { kind: 'enrollment_token_invalid' };
    throw err;
  }

  if (check.kind === 'not_applicable') return { kind: 'not_started' };
  if (check.kind !== 'ok') {
    await auditFailure(pool, admin.id, check, context, 'enrollment');
    return toFailure(check);
  }

  await audit(pool, admin.id, 'admin.2fa.enrolled', context, { recoveryCodesIssued: recoveryCodes.length });
  return { kind: 'confirmed', recoveryCodes };
}

/** Confirma o enrolamento por sessão. A senha já foi exigida em `startEnrollment` (só quem a tem lê o segredo que gera o código). */
export function confirmEnrollment(pool: Pool, admin: AdminUser, code: string, sessionTokenHash: string, context: { ipAddress: string | null }, config: TwoFactorConfig) {
  return confirmEnrollmentFor(pool, admin, code, context, config, { keepSessionTokenHash: sessionTokenHash });
}

export type ConfirmEnrollmentLoginOutcome =
  | ({ readonly kind: 'session'; readonly recoveryCodes: string[] } & AdminSessionGrant)
  | Exclude<ConfirmEnrollmentOutcome, { kind: 'confirmed' }>;

/** Confirma o enrolamento obrigatório e, no mesmo ato, conclui o login (troca o desafio por sessão). Exige o token fora de banda. */
export async function confirmEnrollmentFromChallenge(
  pool: Pool,
  input: { challengeToken: string; enrollmentToken: string; code: string },
  context: TwoFactorRequestContext,
  config: TwoFactorConfig,
): Promise<ConfirmEnrollmentLoginOutcome> {
  const resolved = await resolveMandatoryEnrollment(pool, input.challengeToken, input.enrollmentToken, context);
  if (resolved.kind !== 'ok') return resolved;

  const outcome = await confirmEnrollmentFor(pool, resolved.challenge.admin, input.code, context, config, {
    challenge: resolved.challenge,
    enrollmentTokenHash: resolved.tokenHash,
    keepSessionTokenHash: null,
  });
  if (outcome.kind !== 'confirmed') return outcome;

  const grant = await startAdminSession(pool, resolved.challenge.admin, context);
  return { kind: 'session', recoveryCodes: outcome.recoveryCodes, ...grant };
}

// ---------------------------------------------------------------- gerência (com sessão)

export type RegenerateOutcome =
  | { readonly kind: 'regenerated'; readonly recoveryCodes: string[] }
  | FactorFailure
  | { readonly kind: 'not_enrolled' };

/** Exige a senha atual E um código TOTP (não vale código de recuperação: quem perdeu o app não deve gerar códigos novos com um velho). */
export async function regenerateRecoveryCodes(pool: Pool, admin: AdminUser, input: { code: string; password: string }, context: { ipAddress: string | null }, config: TwoFactorConfig): Promise<RegenerateOutcome> {
  if (!config.encryptionKey) return { kind: 'two_factor_unavailable' };
  const gate = await requirePassword(pool, admin, input.password, context);
  if (gate.kind !== 'ok') return gate;
  const recoveryCodes = generateRecoveryCodes();
  const check = await checkSecondFactor(pool, {
    adminId: admin.id,
    code: input.code,
    mode: 'verify',
    allowRecovery: false,
    config,
    onSuccess: (client) => replaceRecoveryCodes(client, admin.id, recoveryCodes.map((c) => hashRecoveryCode(normalizeCode(c)))),
  });
  if (check.kind === 'not_applicable') return { kind: 'not_enrolled' };
  if (check.kind !== 'ok') {
    await auditFailure(pool, admin.id, check, context, 'regenerate_recovery_codes');
    return toFailure(check);
  }
  await audit(pool, admin.id, 'admin.2fa.recovery_codes_regenerated', context, { recoveryCodesIssued: recoveryCodes.length });
  return { kind: 'regenerated', recoveryCodes };
}

export type StepUpOutcome = { readonly kind: 'ok' } | FactorFailure | { readonly kind: 'not_enrolled' };

/**
 * Reautenticação para ação sensível de quem JÁ tem sessão (I-2): senha atual
 * (mesmo contador por conta do login) E um código TOTP (não vale código de
 * recuperação; o código é gasto, como em qualquer verificação). Quem tem só o
 * cookie de sessão roubado não passa daqui. Falhas vão para a auditoria com
 * `purpose`, nunca com a senha nem o código.
 */
export async function verifyStepUp(
  pool: Pool,
  admin: AdminUser,
  input: { code: string; password: string },
  context: { ipAddress: string | null },
  config: TwoFactorConfig,
  purpose: string,
): Promise<StepUpOutcome> {
  if (!config.encryptionKey) return { kind: 'two_factor_unavailable' };
  const gate = await requirePassword(pool, admin, input.password, context);
  if (gate.kind !== 'ok') return gate;
  const check = await checkSecondFactor(pool, { adminId: admin.id, code: input.code, mode: 'verify', allowRecovery: false, config });
  if (check.kind === 'not_applicable') return { kind: 'not_enrolled' };
  if (check.kind !== 'ok') {
    await auditFailure(pool, admin.id, check, context, purpose);
    return toFailure(check);
  }
  return { kind: 'ok' };
}

export type DisableOutcome =
  | { readonly kind: 'disabled' }
  | { readonly kind: 'forbidden_for_role' }
  | FactorFailure
  | { readonly kind: 'not_enrolled' };

/** Só para papéis em que o 2FA é opcional; dono e financeiro nunca desligam. Exige a senha atual E um código; derruba as outras sessões. */
export async function disableTwoFactor(
  pool: Pool,
  admin: AdminUser,
  input: { code: string; password: string },
  sessionTokenHash: string,
  context: { ipAddress: string | null },
  config: TwoFactorConfig,
): Promise<DisableOutcome> {
  if (roleRequiresTwoFactor(admin.role)) return { kind: 'forbidden_for_role' };
  if (!config.encryptionKey) return { kind: 'two_factor_unavailable' };
  const gate = await requirePassword(pool, admin, input.password, context);
  if (gate.kind !== 'ok') return gate;
  const check = await checkSecondFactor(pool, {
    adminId: admin.id,
    code: input.code,
    mode: 'verify',
    allowRecovery: true,
    config,
    onSuccess: async (client) => {
      await deleteAllTwoFactor(client, admin.id);
      await deleteAdminSessionsExcept(client, admin.id, sessionTokenHash);
    },
  });
  if (check.kind === 'not_applicable') return { kind: 'not_enrolled' };
  if (check.kind !== 'ok') {
    await auditFailure(pool, admin.id, check, context, 'disable');
    return toFailure(check);
  }
  await audit(pool, admin.id, 'admin.2fa.disabled', context);
  return { kind: 'disabled' };
}

export interface TwoFactorStatus {
  readonly enabled: boolean;
  /** O papel obriga 2FA (dono, financeiro). */
  readonly required: boolean;
  readonly recoveryCodesRemaining: number;
}

export async function getTwoFactorStatus(pool: Pool, admin: AdminUser): Promise<TwoFactorStatus> {
  const record = await findTotp(pool, admin.id);
  const enabled = record?.confirmed === true;
  return {
    enabled,
    required: roleRequiresTwoFactor(admin.role),
    recoveryCodesRemaining: enabled ? await countUnusedRecoveryCodes(pool, admin.id) : 0,
  };
}

