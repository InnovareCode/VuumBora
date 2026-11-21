/**
 * Camada de dados — único lugar que fala SQL com `admin_totp`,
 * `admin_recovery_codes` e `admin_login_challenges` (migração 0013).
 * Funções aceitam `Pool` ou `PoolClient` para rodar dentro da transação
 * que serializa as tentativas de um admin (`SELECT ... FOR UPDATE`).
 */
import type { Pool, PoolClient } from 'pg';
import type { AdminRole, AdminUser } from '../domain/admin.js';

type Queryable = Pool | PoolClient;

export interface TotpRecord {
  readonly adminId: string;
  readonly secretEncrypted: string;
  readonly confirmed: boolean;
  readonly lastUsedStep: number | null;
  /** Segundos de bloqueio que faltam (0 = livre). Calculado pelo banco, não pelo relógio do app. */
  readonly lockedForSeconds: number;
  /** Enrolamento pendente que venceu (ou legado sem prazo): não pode mais ser confirmado nem devolvido. */
  readonly pendingExpired: boolean;
}

interface TotpRow {
  admin_id: string;
  secret_encrypted: string;
  confirmed_at: Date | null;
  last_used_step: string | null;
  locked_for_seconds: string;
  pending_expired: boolean;
}

export async function findTotp(db: Queryable, adminId: string, options: { forUpdate?: boolean } = {}): Promise<TotpRecord | null> {
  const result = await db.query<TotpRow>(
    `SELECT admin_id, secret_encrypted, confirmed_at, last_used_step,
            CASE WHEN locked_until IS NOT NULL AND locked_until > now()
                 THEN CEIL(EXTRACT(EPOCH FROM (locked_until - now()))) ELSE 0 END AS locked_for_seconds,
            (pending_expires_at IS NULL OR pending_expires_at <= now()) AS pending_expired
     FROM admin_totp
     WHERE admin_id = $1
     ${options.forUpdate ? 'FOR UPDATE' : ''}`,
    [adminId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    adminId: row.admin_id,
    secretEncrypted: row.secret_encrypted,
    confirmed: row.confirmed_at !== null,
    lastUsedStep: row.last_used_step === null ? null : Number(row.last_used_step),
    lockedForSeconds: Number(row.locked_for_seconds),
    pendingExpired: row.pending_expired,
  };
}

export type PendingSecretOutcome =
  | { readonly kind: 'created' }
  /** Já havia segredo pendente VÁLIDO: não foi trocado, devolve-se o mesmo (início idempotente). */
  | { readonly kind: 'existing'; readonly secretEncrypted: string }
  | { readonly kind: 'already_enrolled' };

/**
 * Grava o segredo PENDENTE, sem nunca derrubar um que ainda vale (achado M-2:
 * quem só tem a senha não pode trocar o segredo e quebrar o QR que o dono
 * acabou de escanear). Regras, sob `FOR UPDATE`:
 *  - já confirmado            -> `already_enrolled` (nunca sobrescreve);
 *  - pendente dentro do prazo -> `existing` (devolve o mesmo, não troca);
 *  - pendente vencido         -> troca e renova o prazo.
 * Não zera as tentativas: reiniciar o enrolamento não é jeito de fugir do bloqueio.
 */
export async function getOrCreatePendingSecret(pool: Pool, adminId: string, secretEncrypted: string, ttlMinutes: number): Promise<PendingSecretOutcome> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO admin_totp (admin_id, secret_encrypted, pending_expires_at)
       VALUES ($1, $2, now() + make_interval(mins => $3))
       ON CONFLICT (admin_id) DO NOTHING
       RETURNING admin_id`,
      [adminId, secretEncrypted, ttlMinutes],
    );
    if ((inserted.rowCount ?? 0) === 1) {
      await client.query('COMMIT');
      return { kind: 'created' };
    }
    const current = await client.query<{ secret_encrypted: string; confirmed_at: Date | null; pending_expired: boolean }>(
      `SELECT secret_encrypted, confirmed_at, (pending_expires_at IS NULL OR pending_expires_at <= now()) AS pending_expired
       FROM admin_totp WHERE admin_id = $1 FOR UPDATE`,
      [adminId],
    );
    const row = current.rows[0];
    if (!row || row.confirmed_at !== null) {
      await client.query('COMMIT');
      return { kind: 'already_enrolled' };
    }
    if (!row.pending_expired) {
      await client.query('COMMIT');
      return { kind: 'existing', secretEncrypted: row.secret_encrypted };
    }
    await client.query(
      `UPDATE admin_totp
       SET secret_encrypted = $2, pending_expires_at = now() + make_interval(mins => $3), updated_at = now()
       WHERE admin_id = $1`,
      [adminId, secretEncrypted, ttlMinutes],
    );
    await client.query('COMMIT');
    return { kind: 'created' };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function markTotpSuccess(db: Queryable, adminId: string, step: number | null): Promise<void> {
  await db.query(
    `UPDATE admin_totp
     SET failed_attempts = 0, locked_until = NULL, last_used_step = COALESCE($2, last_used_step), updated_at = now()
     WHERE admin_id = $1`,
    [adminId, step],
  );
}

export async function markTotpConfirmed(db: Queryable, adminId: string, step: number): Promise<void> {
  await db.query(
    `UPDATE admin_totp
     SET confirmed_at = now(), last_used_step = $2, failed_attempts = 0, locked_until = NULL, updated_at = now()
     WHERE admin_id = $1`,
    [adminId, step],
  );
}

/** Conta o erro e, ao atingir o limite, trava e zera o contador. Devolve se TRAVOU agora e por quantos segundos. */
export async function markTotpFailure(
  db: Queryable,
  adminId: string,
  maxAttempts: number,
  lockMinutes: number,
): Promise<{ readonly locked: boolean; readonly lockedForSeconds: number }> {
  const result = await db.query<{ locked_for_seconds: string }>(
    `UPDATE admin_totp
     SET failed_attempts = CASE WHEN failed_attempts + 1 >= $2 THEN 0 ELSE failed_attempts + 1 END,
         locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END,
         updated_at = now()
     WHERE admin_id = $1
     RETURNING CASE WHEN locked_until IS NOT NULL AND locked_until > now()
                    THEN CEIL(EXTRACT(EPOCH FROM (locked_until - now()))) ELSE 0 END AS locked_for_seconds`,
    [adminId, maxAttempts, lockMinutes],
  );
  const lockedForSeconds = Number(result.rows[0]?.locked_for_seconds ?? 0);
  return { locked: lockedForSeconds > 0, lockedForSeconds };
}

/** Troca TODOS os códigos de recuperação do admin pelos novos (hashes). Chamar dentro de transação. */
export async function replaceRecoveryCodes(db: Queryable, adminId: string, codeHashes: readonly string[]): Promise<void> {
  await db.query(`DELETE FROM admin_recovery_codes WHERE admin_id = $1`, [adminId]);
  for (const hash of codeHashes) {
    await db.query(`INSERT INTO admin_recovery_codes (admin_id, code_hash) VALUES ($1, $2)`, [adminId, hash]);
  }
}

/** Atômico: o `UPDATE ... WHERE used_at IS NULL` garante que duas requisições simultâneas com o mesmo código não passam as duas. */
export async function consumeRecoveryCode(db: Queryable, adminId: string, codeHash: string): Promise<boolean> {
  const result = await db.query(
    `UPDATE admin_recovery_codes SET used_at = now()
     WHERE admin_id = $1 AND code_hash = $2 AND used_at IS NULL
     RETURNING id`,
    [adminId, codeHash],
  );
  return (result.rowCount ?? 0) === 1;
}

export async function countUnusedRecoveryCodes(db: Queryable, adminId: string): Promise<number> {
  const result = await db.query<{ total: string }>(
    `SELECT count(*) AS total FROM admin_recovery_codes WHERE admin_id = $1 AND used_at IS NULL`,
    [adminId],
  );
  return Number(result.rows[0]?.total ?? 0);
}

export async function deleteAllTwoFactor(db: Queryable, adminId: string): Promise<void> {
  await db.query(`DELETE FROM admin_recovery_codes WHERE admin_id = $1`, [adminId]);
  await db.query(`DELETE FROM admin_totp WHERE admin_id = $1`, [adminId]);
}

export interface CreateChallengeInput {
  readonly adminId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly ipAddress: string | null;
}

export async function insertChallenge(db: Queryable, input: CreateChallengeInput): Promise<void> {
  // Limpeza oportunista: sem job periódico neste serviço, cada login novo varre os vencidos.
  await db.query(`DELETE FROM admin_login_challenges WHERE expires_at < now()`);
  await db.query(
    `INSERT INTO admin_login_challenges (admin_id, token_hash, expires_at, ip_address) VALUES ($1, $2, $3, $4)`,
    [input.adminId, input.tokenHash, input.expiresAt, input.ipAddress],
  );
}

export interface ActiveChallenge {
  readonly challengeId: string;
  readonly admin: AdminUser;
}

/** `null` se o desafio não existe, venceu, ou o admin foi desativado nesse meio tempo. */
export async function findActiveChallenge(db: Queryable, tokenHash: string): Promise<ActiveChallenge | null> {
  const result = await db.query<{ challenge_id: string; id: string; name: string; email: string; role: string }>(
    `SELECT c.id AS challenge_id, u.id, u.name, u.email, u.role
     FROM admin_login_challenges c
     JOIN admin_users u ON u.id = c.admin_id
     WHERE c.token_hash = $1 AND c.expires_at > now() AND u.deactivated_at IS NULL`,
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { challengeId: row.challenge_id, admin: { id: row.id, name: row.name, email: row.email, role: row.role as AdminRole } };
}

/** `true` só para quem de fato apagou — é o que faz o desafio valer uma única vez. */
export async function deleteChallenge(db: Queryable, challengeId: string): Promise<boolean> {
  const result = await db.query(`DELETE FROM admin_login_challenges WHERE id = $1`, [challengeId]);
  return (result.rowCount ?? 0) === 1;
}
