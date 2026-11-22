/** Camada de lógica de negócio — a rota nunca fala com o banco ou com bcrypt direto. */
import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import type { AdminUser, AdminUserRecord } from '../domain/admin.js';
import { roleRequiresTwoFactor, type TwoFactorConfig } from '../domain/two-factor.js';
import { findAdminByEmail, findAdminRecordById } from '../repositories/admin-repository.js';
import { accountKey, clearPairFailures, reserveFailureSlot } from '../repositories/admin-login-failure-repository.js';
import { adminBcrypt, assertAdminBcryptCapacity } from '../lib/bcrypt-pool.js';
import { ipBucket } from '../lib/ip-bucket.js';
import { DEFAULT_DELAY_SCHEDULE, type DelaySchedule } from '../lib/progressive-delay.js';
import { insertAuditLog } from '../repositories/admin-audit-repository.js';
import { findTotp, insertChallenge } from '../repositories/admin-two-factor-repository.js';
import {
  createAdminSession,
  deleteAdminSessionByTokenHash,
  findActiveAdminSessionByTokenHash,
  touchAdminSession,
} from '../repositories/admin-session-repository.js';

const BCRYPT_COST = 12;
const SESSION_TOKEN_BYTES = 32;
const CSRF_TOKEN_BYTES = 32;

/**
 * Hash válido, mas de uma senha aleatória que nunca autentica ninguém —
 * gerado uma vez no boot (síncrono, UMA vez, antes de aceitar requisição). Serve só para o `bcrypt.compare` rodar com o
 * MESMO custo quando o e-mail não existe, para a resposta de login não
 * ficar mensuravelmente mais rápida nesse caso (timing attack de
 * enumeração de e-mail).
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomBytes(32).toString('hex'), BCRYPT_COST);

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function sessionExpiry(ttlHours: number): Date {
  return new Date(Date.now() + ttlHours * 60 * 60 * 1000);
}

/** Sessão recém-criada — o token bruto só existe aqui, na resposta (vai para o cookie). */
export interface AdminSessionGrant {
  readonly admin: AdminUser;
  readonly rawToken: string;
  readonly expiresAt: Date;
  /** Token sincronizador de CSRF desta sessão nova — ver migração 0009. Sai só aqui e em `resolveAdminSession`, nunca em cookie. */
  readonly csrfToken: string;
}

export type LoginOutcome =
  | ({ readonly kind: 'session' } & AdminSessionGrant)
  /** Senha certa, 2FA ativo: falta o código. Nenhuma sessão foi criada. */
  | { readonly kind: 'second_factor_required'; readonly challengeToken: string; readonly challengeExpiresAt: Date }
  /** Senha certa, papel obriga 2FA e ainda não há: falta enrolar. Nenhuma sessão foi criada. */
  | { readonly kind: 'enrollment_required'; readonly challengeToken: string; readonly challengeExpiresAt: Date }
  | { readonly kind: 'invalid_credentials' }
  /**
   * A espera progressiva do par (e-mail + IP) ainda não passou: a senha nem foi comparada. O nome `account_locked`
   * ficou por compatibilidade com o painel; a espera é CURTA (1 s, 2 s, 4 s... até 15 min) e NÃO vale para
   * quem vem de outro IP.
   */
  | { readonly kind: 'account_locked'; readonly retryAfterSeconds: number }
  /** 2FA necessário mas `ADMIN_TOTP_ENCRYPTION_KEY` ausente — falha fechada. */
  | { readonly kind: 'two_factor_unavailable' };

export interface LoginContext {
  readonly ttlHours: number;
  /** Teto absoluto da sessão — ver `ADMIN_SESSION_ABSOLUTE_TTL_HOURS` e migração 0007. */
  readonly absoluteTtlHours: number;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

/** Cria a sessão no banco. Único caminho que emite sessão: login sem 2FA e troca de desafio por código passam por aqui. */
export async function startAdminSession(pool: Pool, admin: AdminUser, context: LoginContext): Promise<AdminSessionGrant> {
  const rawToken = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  const csrfToken = randomBytes(CSRF_TOKEN_BYTES).toString('base64url');
  const expiresAt = sessionExpiry(context.ttlHours);
  // Fixado agora, uma única vez — nenhuma renovação deslizante depois disso avança este valor.
  const absoluteExpiresAt = sessionExpiry(context.absoluteTtlHours);
  await createAdminSession(pool, {
    adminId: admin.id,
    tokenHash: hashToken(rawToken),
    expiresAt,
    absoluteExpiresAt,
    csrfToken,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  return { admin, rawToken, expiresAt, csrfToken };
}

export async function issueLoginChallenge(pool: Pool, adminId: string, ipAddress: string | null, ttlMinutes: number): Promise<{ challengeToken: string; challengeExpiresAt: Date }> {
  const challengeToken = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  const challengeExpiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  await insertChallenge(pool, { adminId, tokenHash: hashToken(challengeToken), expiresAt: challengeExpiresAt, ipAddress });
  return { challengeToken, challengeExpiresAt };
}

/**
 * Atraso PROGRESSIVO entre senhas erradas, por PAR (e-mail + IP): 1 s, 2 s, 4 s... até 15 min (decisão do dono,
 * 21/11/2026, revisão S1 rodada 2, I-6). Substitui o teto de 10 falhas em 15 min POR CONTA (A-1), que deixava
 * quem sabia o e-mail do dono trancá-lo de fora de propósito. Quem erra de outro IP não atrapalha o dono: o par
 * dele está limpo. Custo de adivinhação (conta em `lib/progressive-delay.ts`): 13 tentativas na 1ª hora e 105 em
 * 24 h POR par; o total é a soma dos pares (cada IP/ /64 novo abre um par). Os papéis dono e financeiro ainda
 * têm o 2FA, cujo bloqueio de 15 min do CÓDIGO não mudou.
 */
export const DEFAULT_LOGIN_DELAY: DelaySchedule = DEFAULT_DELAY_SCHEDULE;

export type PasswordCheck =
  | { readonly kind: 'ok' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'locked'; readonly retryAfterSeconds: number };

/**
 * Compara a senha sob a espera progressiva do par (e-mail + IP). A tentativa é RESERVADA antes do
 * bcrypt (concorrência) e devolvida se a senha estiver certa. Sempre roda
 * `bcrypt.compare` (hash real OU `DUMMY_PASSWORD_HASH`) — e-mail inexistente,
 * senha errada e admin desativado não se distinguem por resposta nem por
 * tempo, e e-mail inexistente também conta no limite (sem oráculo de existência).
 * Falha de conta que existe vai para `admin_audit_log`; a de e-mail inexistente
 * só para o log de aplicação (a trilha exige `admin_id`).
 */
export async function verifyPasswordWithGuard(
  pool: Pool,
  input: { readonly email: string; readonly record: AdminUserRecord | null; readonly password: string; readonly ipAddress: string | null; readonly purpose: 'login' | 'reauth' },
  schedule: DelaySchedule = DEFAULT_LOGIN_DELAY,
): Promise<PasswordCheck> {
  // Pista do admin cheia: recusa ANTES de reservar a falha do par (o bcrypt não rodaria, e a espera progressiva do
  // dono não pode crescer por causa de uma recusa que não foi culpa dele).
  assertAdminBcryptCapacity();
  const pair = { emailHash: accountKey(input.email), ipBucket: input.ipAddress ? ipBucket(input.ipAddress) : null };
  const slot = await reserveFailureSlot(pool, { ...pair, adminId: input.record?.id ?? null }, schedule);
  if (slot.kind === 'locked') return { kind: 'locked', retryAfterSeconds: slot.retryAfterSeconds };

  const matches = await adminBcrypt().compare(input.password, input.record?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (input.record && input.record.deactivatedAt === null && matches) {
    await clearPairFailures(pool, pair);
    return { kind: 'ok' };
  }

  if (input.record) {
    const base = { adminId: input.record.id, targetType: 'admin_user', targetId: input.record.id, ipAddress: input.ipAddress };
    await insertAuditLog(pool, { ...base, action: 'admin.login_failed', after: { purpose: input.purpose } });
    // Uma vez só: a falha que leva o par à espera MÁXIMA (15 min) é o sinal de ataque insistente.
    if (slot.reachedMax) await insertAuditLog(pool, { ...base, action: 'admin.login_locked', after: { purpose: input.purpose } });
  }
  return { kind: 'invalid' };
}

/** Reautenticação de quem já tem sessão (enrolar/desativar 2FA, regenerar códigos): mesma senha, mesmo contador por conta. */
export async function reauthenticateAdmin(pool: Pool, admin: AdminUser, password: string, ipAddress: string | null): Promise<PasswordCheck> {
  const record = await findAdminRecordById(pool, admin.id);
  return verifyPasswordWithGuard(pool, { email: admin.email, record, password, ipAddress, purpose: 'reauth' });
}

/**
 * Login: senha primeiro (com o contador por conta), e só depois se decide sobre
 * o segundo fator: com 2FA ativo, ou papel que o obriga (dono, financeiro), NÃO
 * nasce sessão — nasce um desafio, e a sessão só sai de `admin-two-factor-service.ts`.
 */
export async function loginAdmin(
  pool: Pool,
  email: string,
  password: string,
  context: LoginContext,
  twoFactor: TwoFactorConfig,
): Promise<LoginOutcome> {
  const record = await findAdminByEmail(pool, email);
  const check = await verifyPasswordWithGuard(pool, { email, record, password, ipAddress: context.ipAddress, purpose: 'login' });
  if (check.kind === 'locked') return { kind: 'account_locked', retryAfterSeconds: check.retryAfterSeconds };
  if (check.kind !== 'ok' || !record) return { kind: 'invalid_credentials' };

  const admin: AdminUser = { id: record.id, name: record.name, email: record.email, role: record.role };
  const totp = await findTotp(pool, admin.id);
  const enrolled = totp?.confirmed === true;

  if (enrolled || roleRequiresTwoFactor(admin.role)) {
    if (!twoFactor.encryptionKey) return { kind: 'two_factor_unavailable' };
    const challenge = await issueLoginChallenge(pool, admin.id, context.ipAddress, twoFactor.challengeTtlMinutes);
    return { kind: enrolled ? 'second_factor_required' : 'enrollment_required', ...challenge };
  }

  return { kind: 'session', ...(await startAdminSession(pool, admin, context)) };
}

export interface ResolvedAdminSession {
  readonly admin: AdminUser;
  /** `null` para sessão criada antes da migração 0009 — força o admin a logar de novo para mutar algo. */
  readonly csrfToken: string | null;
}

/**
 * Resolve o cookie de sessão para o admin autenticado, ou `null` se o
 * token não existe/expirou/o admin foi desativado. Expiração deslizante:
 * toda resolução bem-sucedida empurra `expires_at` para a frente — sessão
 * em uso não expira no meio do trabalho.
 */
export async function resolveAdminSession(pool: Pool, rawToken: string, ttlHours: number): Promise<ResolvedAdminSession | null> {
  const tokenHash = hashToken(rawToken);
  const session = await findActiveAdminSessionByTokenHash(pool, tokenHash);
  if (!session) return null;

  await touchAdminSession(pool, session.sessionId, sessionExpiry(ttlHours));
  return { admin: session.admin, csrfToken: session.csrfToken };
}

/**
 * Devolve o admin que estava na sessão (para o chamador registrar
 * `admin.logout` no audit log com o `admin_id` certo) e então apaga a
 * sessão. Idempotente: chamar duas vezes, ou com um token que já não
 * existe, não é erro — só não acha ninguém na segunda vez.
 */
export async function logoutAdmin(pool: Pool, rawToken: string): Promise<AdminUser | null> {
  const tokenHash = hashToken(rawToken);
  const session = await findActiveAdminSessionByTokenHash(pool, tokenHash);
  await deleteAdminSessionByTokenHash(pool, tokenHash);
  return session?.admin ?? null;
}
