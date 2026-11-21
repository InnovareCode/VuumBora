/** Camada de dados da identidade: contas, dispositivos, famílias/tokens de renovação, tentativas e trilha de acesso. */
import type { Pool, PoolClient } from 'pg';
import type { AccountSummary, AccountType, DeviceInput } from '../domain/auth.js';
import { delayAfterFailures, type DelaySchedule } from '../lib/progressive-delay.js';

export type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

export type AccessEvent =
  | 'login_success' | 'login_failure' | 'login_blocked' | 'token_refresh'
  | 'token_reuse_detected' | 'logout' | 'logout_all' | 'password_changed'
  | 'register' | 'email_code_sent' | 'email_verified' | 'password_reset_requested' | 'password_reset_completed';

export class EmailTakenError extends Error {}
/** O banco recusou a data de nascimento (rede de segurança da 0019). A mensagem nunca carrega a data. */
export class BirthDateRejectedError extends Error {
  constructor(readonly reason: 'invalid' | 'underage') {
    super(`birth_date_${reason}`);
  }
}
export class PublicIdCollisionError extends Error {}

interface AccountRow { id: string; public_id: string; full_name: string; account_type: AccountType }

function toSummary(row: AccountRow): AccountSummary {
  return { id: row.id, publicId: row.public_id, fullName: row.full_name, accountType: row.account_type };
}

export interface RegisteredAccount {
  readonly account: AccountSummary;
  /**
   * `true` = o e-mail já tinha uma conta NÃO verificada e ela foi SUBSTITUÍDA por esta (id, credencial, código e aceite novos;
   * a conta antiga, com o aceite do primeiro cadastrante, deixou de existir).
   */
  readonly reclaimed: boolean;
}

/** Tentativas do laço de cadastro: cobre a corrida de várias substituições simultâneas do mesmo e-mail. */
const MAX_REGISTER_ATTEMPTS = 6;

/**
 * Cria a conta (e a credencial) ou SUBSTITUI a conta ainda NÃO verificada do mesmo (tipo, e-mail) — revisão S1
 * rodada 2, I-4. Sem a substituição, quem cadastrasse o e-mail de OUTRA pessoa (sem provar que é dono dele) o
 * "reservaria": o dono verdadeiro receberia 409 para sempre.
 *
 * Substituir = apagar a conta antiga pela função `reclaim_unverified_account` (migração 0020, SECURITY DEFINER: a API não
 * tem DELETE) e inserir uma NOVA. Não é UPDATE de propósito: o aceite (`account_consents`) é só-acrescenta e a linha do
 * primeiro cadastrante carregaria a data e o IP dele; apagada a conta, o aceite dela cai em cascata e o aceite final é o do
 * último cadastro. Uma verificação em andamento da conta antiga nunca marca a nova como verificada (o id é outro).
 *
 * Conta já VERIFICADA (ou bloqueada/excluída) nunca é tocada: `EmailTakenError`. Roda na transação do chamador.
 */
export async function insertOrReclaimAccount(
  db: Queryable,
  input: { accountType: AccountType; email: string; fullName: string; phone: string | null; passwordHash: string; birthDate: string },
): Promise<RegisteredAccount> {
  try {
    let reclaimed = false;
    for (let attempt = 0; attempt < MAX_REGISTER_ATTEMPTS; attempt += 1) {
      // `$5::date`: a data entra como texto e o Postgres a interpreta (sem passar por `Date` do JS, que deslocaria o dia).
      const inserted = await db.query<AccountRow>(
        `INSERT INTO accounts (account_type, email, full_name, phone, birth_date) VALUES ($1, $2, $3, $4, $5::date)
         ON CONFLICT (account_type, email) DO NOTHING
         RETURNING id, public_id, full_name, account_type`,
        [input.accountType, input.email, input.fullName, input.phone, input.birthDate],
      );
      const created = inserted.rows[0];
      if (created) {
        await db.query(
          `INSERT INTO account_credentials (account_id, password_hash, hash_algo) VALUES ($1, $2, 'bcrypt')`,
          [created.id, input.passwordHash],
        );
        return { account: toSummary(created), reclaimed };
      }

      // O e-mail já tem conta. Se for ativa e NUNCA verificada, a função a apaga e o laço insere a nova.
      const replaced = await db.query<{ ok: boolean }>(`SELECT reclaim_unverified_account($1, $2) AS ok`, [input.accountType, input.email]);
      if (replaced.rows[0]!.ok) {
        reclaimed = true;
        continue;
      }
      // Nada apagado: ou a conta é de verdade de alguém (verificada/bloqueada) ou outra substituição, simultânea, acabou de mexer nela.
      const current = await db.query<{ status: string; email_verified_at: Date | null }>(
        `SELECT status, email_verified_at FROM accounts WHERE account_type = $1 AND email = $2`,
        [input.accountType, input.email],
      );
      const row = current.rows[0];
      if (row && (row.status !== 'active' || row.email_verified_at !== null)) throw new EmailTakenError();
      // Sem linha (sumiu na corrida) ou ainda não verificada (a do vencedor): tenta de novo.
    }
    throw new Error('register_reclaim_contention');
  } catch (err) {
    if (err instanceof EmailTakenError) throw err;
    const { code, constraint, column } = err as { code?: string; constraint?: string; column?: string };
    // Rede de segurança do banco (gatilho da 0019): o servidor já validou, mas a virada do dia ou um bug não passam.
    if (code === '23514' && constraint === 'accounts_birth_date_min_age') throw new BirthDateRejectedError('underage');
    if (code === '23514' && (constraint === 'accounts_birth_date_not_future' || constraint === 'accounts_birth_date_plausible')) throw new BirthDateRejectedError('invalid');
    if (code === '23502' && column === 'birth_date') throw new BirthDateRejectedError('invalid');
    if (code === '23505' && constraint === 'accounts_type_email_key') throw new EmailTakenError();
    if (code === '23505' && constraint === 'accounts_public_id_key') throw new PublicIdCollisionError();
    throw err;
  }
}

/**
 * Registra o aceite dos dois documentos, na MESMA transação do cadastro. `account_consents` é só-acrescenta para a
 * API (sem UPDATE/DELETE): a conta é sempre NOVA (no recadastro a antiga é substituída, `insertOrReclaimAccount`), então não há
 * aceite anterior; `ON CONFLICT DO NOTHING` só protege contra repetição. `ip_hash` é o HMAC
 * (com pepper) do IP — nunca o IP; o `accepted_at` é o relógio do banco (o gatilho descarta qualquer outro valor).
 */
export async function insertConsents(
  db: Queryable,
  input: { accountId: string; termsVersion: string; privacyVersion: string; ipHash: string | null },
): Promise<void> {
  await db.query(
    `INSERT INTO account_consents (account_id, document, version, ip_hash)
     VALUES ($1, 'terms_of_use', $2, $4), ($1, 'privacy_policy', $3, $4)
     ON CONFLICT (account_id, document, version) DO NOTHING`,
    [input.accountId, input.termsVersion, input.privacyVersion, input.ipHash],
  );
}

export interface LoginCandidate { account: AccountSummary; status: string; emailVerified: boolean; passwordHash: string }

/** Busca DENTRO do tipo de conta, por e-mail OU ID público. Conta sem credencial não loga (INNER JOIN). */
export async function findLoginCandidate(
  db: Queryable,
  accountType: AccountType,
  identifier: { kind: 'email' | 'public_id'; value: string },
): Promise<LoginCandidate | null> {
  const column = identifier.kind === 'email' ? 'a.email' : 'a.public_id';
  const result = await db.query<AccountRow & { status: string; email_verified_at: Date | null; password_hash: string }>(
    `SELECT a.id, a.public_id, a.full_name, a.account_type, a.status, a.email_verified_at, c.password_hash
       FROM accounts a JOIN account_credentials c ON c.account_id = a.id
      WHERE a.account_type = $1 AND ${column} = $2`,
    [accountType, identifier.value],
  );
  const row = result.rows[0];
  return row
    ? { account: toSummary(row), status: row.status, emailVerified: row.email_verified_at !== null, passwordHash: row.password_hash }
    : null;
}

/** Hash da senha da conta (só para conferir a senha na verificação do e-mail). Nunca sai da camada de serviço. */
export async function findPasswordHash(db: Queryable, accountId: string): Promise<string | null> {
  const result = await db.query<{ password_hash: string }>(`SELECT password_hash FROM account_credentials WHERE account_id = $1`, [accountId]);
  return result.rows[0]?.password_hash ?? null;
}

export async function findAccountById(db: Queryable, accountId: string): Promise<AccountSummary | null> {
  const result = await db.query<AccountRow>(
    `SELECT a.id, a.public_id, a.full_name, a.account_type FROM accounts a WHERE a.id = $1`,
    [accountId],
  );
  return result.rows[0] ? toSummary(result.rows[0]) : null;
}

export async function upsertDevice(db: Queryable, accountId: string, device: DeviceInput): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO devices (account_id, installation_id, platform, device_label, app_version)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (account_id, installation_id)
     DO UPDATE SET platform = EXCLUDED.platform, device_label = EXCLUDED.device_label,
                   app_version = EXCLUDED.app_version, last_seen_at = now()
     RETURNING id`,
    [accountId, device.installationId, device.platform, device.label ?? null, device.appVersion ?? null],
  );
  return result.rows[0]!.id;
}

/** Abre a sessão: família (com teto absoluto) + primeiro token de renovação. Devolve id e validade real do token. */
export async function createSession(
  db: Queryable,
  input: { accountId: string; deviceId: string | null; tokenHash: string; refreshExpiresAt: Date; familyExpiresAt: Date },
): Promise<{ familyId: string; refreshExpiresAt: Date }> {
  const family = await db.query<{ id: string }>(
    `INSERT INTO refresh_token_families (account_id, device_id, expires_at) VALUES ($1, $2, $3) RETURNING id`,
    [input.accountId, input.deviceId, input.familyExpiresAt],
  );
  const familyId = family.rows[0]!.id;
  const expiresAt = input.refreshExpiresAt < input.familyExpiresAt ? input.refreshExpiresAt : input.familyExpiresAt;
  await db.query(`INSERT INTO refresh_tokens (family_id, token_hash, expires_at) VALUES ($1, $2, $3)`, [familyId, input.tokenHash, expiresAt]);
  return { familyId, refreshExpiresAt: expiresAt };
}

export type RotationOutcome = 'rotated' | 'reuse_detected' | 'revoked' | 'expired' | 'account_inactive' | 'unknown';
export interface RotationResult { outcome: RotationOutcome; familyId: string | null; accountId: string | null; deviceId: string | null }

/** ÚNICO caminho de renovação: a regra e a atomicidade moram em `rotate_refresh_token()` (migração 0011). */
export async function rotateRefreshToken(db: Queryable, oldHash: string, newHash: string, newExpires: Date): Promise<RotationResult> {
  const result = await db.query<{ outcome: RotationOutcome; family_id: string | null; account_id: string | null; device_id: string | null }>(
    `SELECT outcome, family_id, account_id, device_id FROM rotate_refresh_token($1, $2, $3)`,
    [oldHash, newHash, newExpires],
  );
  const row = result.rows[0]!;
  return { outcome: row.outcome, familyId: row.family_id, accountId: row.account_id, deviceId: row.device_id };
}

export async function getRefreshTokenExpiry(db: Queryable, tokenHash: string): Promise<Date> {
  const result = await db.query<{ expires_at: Date }>(`SELECT expires_at FROM refresh_tokens WHERE token_hash = $1`, [tokenHash]);
  return result.rows[0]!.expires_at;
}

/** Sessão (família) viva E conta ativa? É o que o token de acesso precisa para valer. */
export async function isSessionLive(db: Queryable, familyId: string, accountId: string): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM refresh_token_families f JOIN accounts a ON a.id = f.account_id
      WHERE f.id = $1 AND f.account_id = $2 AND f.revoked_at IS NULL AND f.expires_at > now() AND a.status = 'active' AND a.email_verified_at IS NOT NULL`,
    [familyId, accountId],
  );
  return result.rowCount === 1;
}

/** Logout pelo token de renovação. Idempotente: devolve `null` se desconhecido ou já revogada. */
export async function revokeFamilyByRefreshHash(db: Queryable, tokenHash: string): Promise<{ familyId: string; accountId: string; deviceId: string | null } | null> {
  const result = await db.query<{ id: string; account_id: string; device_id: string | null }>(
    `UPDATE refresh_token_families f SET revoked_at = now(), revoke_reason = 'logout'
      WHERE f.revoked_at IS NULL
        AND f.id = (SELECT t.family_id FROM refresh_tokens t WHERE t.token_hash = $1)
      RETURNING f.id, f.account_id, f.device_id`,
    [tokenHash],
  );
  const row = result.rows[0];
  return row ? { familyId: row.id, accountId: row.account_id, deviceId: row.device_id } : null;
}

export async function revokeAllFamilies(db: Queryable, accountId: string): Promise<number> {
  const result = await db.query(
    `UPDATE refresh_token_families SET revoked_at = now(), revoke_reason = 'logout_all' WHERE account_id = $1 AND revoked_at IS NULL`,
    [accountId],
  );
  return result.rowCount ?? 0;
}

export type AttemptScope = 'login' | 'register' | 'code_request';
export interface AttemptKey {
  readonly identifierHash: string;
  readonly max: number;
  /** Escopo desta chave, se diferente do da chamada (o teto GLOBAL de e-mails é compartilhado entre cadastro e pedidos de código). */
  readonly scope?: AttemptScope;
  /** Janela desta chave, se diferente da da chamada (o teto global é "por hora" qualquer que seja a janela das outras). */
  readonly windowMinutes?: number;
}

/**
 * Reserva uma "vaga" de tentativa de forma ATÔMICA, para UMA OU MAIS chaves
 * (ex.: login = par identificador+IP e teto global do identificador): sob lock
 * por chave (em ordem fixa, sem deadlock) conta as falhas da janela e, se TODAS
 * têm espaço, grava esta tentativa como falha em cada uma. Sem a reserva, N
 * requisições simultâneas veriam todas "4 falhas" e passariam do limite. Se
 * qualquer chave estourou, NADA é gravado (o bloqueio não se alonga sozinho).
 * Nos escopos 'register' e 'code_request' toda tentativa conta (succeeded=false).
 */
export async function reserveAttempts(
  pool: Pool,
  input: { scope: AttemptScope; keys: readonly AttemptKey[]; ipHash: string | null; windowMinutes: number },
): Promise<boolean> {
  const keys = [...input.keys].sort((a, b) => (a.identifierHash < b.identifierHash ? -1 : 1));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const key of keys) {
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`${key.scope ?? input.scope}:${key.identifierHash}`]);
    }
    for (const key of keys) {
      const count = await client.query<{ n: number }>(
        `SELECT login_failures_in_window($1, make_interval(mins => $2), $3) AS n`,
        [key.identifierHash, key.windowMinutes ?? input.windowMinutes, key.scope ?? input.scope],
      );
      if (count.rows[0]!.n >= key.max) {
        await client.query('COMMIT');
        return false;
      }
    }
    for (const key of keys) {
      await client.query(
        `INSERT INTO login_attempts (scope, identifier_hash, ip_hash, succeeded) VALUES ($1, $2, $3, false)`,
        [key.scope ?? input.scope, key.identifierHash, input.ipHash],
      );
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export type DelayedAttempt = { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

/**
 * Reserva uma tentativa de login sob ATRASO PROGRESSIVO (I-6, `lib/progressive-delay.ts`) para UMA chave
 * (o par tipo + identificador + IP). Sob lock da chave: conta as falhas desde o último sucesso (memória de 24 h)
 * e olha há quanto tempo foi a última; se a espera dessa contagem ainda não passou, recusa SEM gravar nada
 * (esperar não alonga a espera: martelar a rota não empurra o relógio). Se passou, grava esta tentativa como
 * falha ANTES de a senha ser comparada — duas requisições simultâneas do mesmo par: a segunda enxerga a
 * falha da primeira e espera. Quem acerta a senha zera a contagem (`recordLoginSuccess`).
 * O relógio é `clock_timestamp()` (não `now()`, que é o início da transação): a ordem das falhas é a real.
 */
export async function reserveDelayedAttempt(
  pool: Pool,
  input: { scope: AttemptScope; identifierHash: string; ipHash: string | null; schedule: DelaySchedule; memoryHours: number },
): Promise<DelayedAttempt> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`${input.scope}:${input.identifierHash}`]);
    const state = await client.query<{ failures: number; age_s: number | null }>(
      `SELECT count(*)::int AS failures, EXTRACT(EPOCH FROM (clock_timestamp() - max(attempted_at)))::float8 AS age_s
         FROM login_attempts
        WHERE scope = $1 AND identifier_hash = $2 AND NOT succeeded
          AND attempted_at > clock_timestamp() - make_interval(hours => $3)
          AND attempted_at > COALESCE(
                (SELECT max(attempted_at) FROM login_attempts WHERE scope = $1 AND identifier_hash = $2 AND succeeded),
                '-infinity'::TIMESTAMPTZ)`,
      [input.scope, input.identifierHash, input.memoryHours],
    );
    const { failures, age_s: ageSeconds } = state.rows[0]!;
    const wait = delayAfterFailures(failures, input.schedule);
    if (failures > 0 && ageSeconds !== null && ageSeconds < wait) {
      await client.query('COMMIT');
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(wait - ageSeconds)) };
    }
    await client.query(
      `INSERT INTO login_attempts (scope, identifier_hash, ip_hash, succeeded, attempted_at) VALUES ($1, $2, $3, false, clock_timestamp())`,
      [input.scope, input.identifierHash, input.ipHash],
    );
    await client.query('COMMIT');
    return { allowed: true };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Login certo: zera a contagem de falhas de cada chave (escopo 'login'). */
export async function recordLoginSuccess(db: Queryable, identifierHashes: readonly string[], ipHash: string | null): Promise<void> {
  for (const identifierHash of identifierHashes) {
    await db.query(`INSERT INTO login_attempts (scope, identifier_hash, ip_hash, succeeded, attempted_at) VALUES ('login', $1, $2, true, clock_timestamp())`, [identifierHash, ipHash]);
  }
}

export async function insertAccessLog(
  db: Queryable,
  entry: { event: AccessEvent; accountId: string | null; deviceId: string | null; ipHash: string | null; userAgentFamily: string; requestId: string },
): Promise<void> {
  await db.query(
    `INSERT INTO access_log (event, account_id, device_id, ip_hash, user_agent_family, request_id) VALUES ($1, $2, $3, $4, $5, $6)`,
    [entry.event, entry.accountId, entry.deviceId, entry.ipHash, entry.userAgentFamily, entry.requestId],
  );
}
