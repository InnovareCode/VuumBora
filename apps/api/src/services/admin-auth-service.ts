/** Camada de lógica de negócio — a rota nunca fala com o banco ou com bcrypt direto. */
import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import type { AdminUser } from '../domain/admin.js';
import { findAdminByEmail } from '../repositories/admin-repository.js';
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
 * gerado uma vez no boot. Serve só para o `bcrypt.compare` rodar com o
 * MESMO custo quando o e-mail não existe, para a resposta de login não
 * ficar mensuravelmente mais rápida nesse caso (timing attack de
 * enumeração de e-mail).
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomBytes(32).toString('hex'), BCRYPT_COST);

function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function sessionExpiry(ttlHours: number): Date {
  return new Date(Date.now() + ttlHours * 60 * 60 * 1000);
}

export type LoginOutcome =
  | {
      readonly ok: true;
      readonly admin: AdminUser;
      readonly rawToken: string;
      readonly expiresAt: Date;
      /** Token sincronizador de CSRF desta sessão nova — ver migração 0009. Sai só aqui e em `resolveAdminSession`, nunca em cookie. */
      readonly csrfToken: string;
    }
  | { readonly ok: false };

export interface LoginContext {
  readonly ttlHours: number;
  /** Teto absoluto da sessão — ver `ADMIN_SESSION_ABSOLUTE_TTL_HOURS` e migração 0007. */
  readonly absoluteTtlHours: number;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

/**
 * Sempre executa `bcrypt.compare` (contra o hash real OU contra
 * `DUMMY_PASSWORD_HASH`) antes de decidir — nunca retorna mais rápido só
 * porque o e-mail não existe. O resultado nunca distingue "e-mail não
 * existe", "senha errada" e "admin desativado": os três voltam `{ ok:
 * false }`, e a rota devolve a mesma mensagem genérica para os três.
 */
export async function loginAdmin(pool: Pool, email: string, password: string, context: LoginContext): Promise<LoginOutcome> {
  const record = await findAdminByEmail(pool, email);
  const hashToCompare = record?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const passwordMatches = await bcrypt.compare(password, hashToCompare);

  if (!record || record.deactivatedAt !== null || !passwordMatches) {
    return { ok: false };
  }

  const rawToken = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  const csrfToken = randomBytes(CSRF_TOKEN_BYTES).toString('base64url');
  const expiresAt = sessionExpiry(context.ttlHours);
  // Fixado agora, uma única vez — nenhuma renovação deslizante depois disso avança este valor.
  const absoluteExpiresAt = sessionExpiry(context.absoluteTtlHours);
  await createAdminSession(pool, {
    adminId: record.id,
    tokenHash: hashSessionToken(rawToken),
    expiresAt,
    absoluteExpiresAt,
    csrfToken,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  return {
    ok: true,
    admin: { id: record.id, name: record.name, email: record.email, role: record.role },
    rawToken,
    expiresAt,
    csrfToken,
  };
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
  const tokenHash = hashSessionToken(rawToken);
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
  const tokenHash = hashSessionToken(rawToken);
  const session = await findActiveAdminSessionByTokenHash(pool, tokenHash);
  await deleteAdminSessionByTokenHash(pool, tokenHash);
  return session?.admin ?? null;
}
