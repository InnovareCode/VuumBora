/**
 * Camada de dados — único lugar que fala SQL com `admin_login_failures`
 * (migração 0016): o contador de falhas de senha do admin por PAR (e-mail + IP).
 *
 * Desde a revisão S1 rodada 2 (I-6, decisão do dono) NÃO há bloqueio da conta inteira: a espera cresce por
 * par (e-mail + IP), de forma progressiva (`lib/progressive-delay.ts`), e quem erra de outro IP não impede
 * o dono legítimo de entrar. Sem isso, qualquer um que soubesse o e-mail do dono o trancava de fora por 15 min
 * (e de novo, e de novo) com ~1 requisição por minuto.
 *
 * A tentativa é RESERVADA antes de a senha ser comparada (a linha nasce primeiro): contar depois de comparar
 * deixaria 50 requisições paralelas passarem todas pelo "ainda não esperou". Senha certa apaga as falhas do par.
 * `ip_address` guarda o BALDE do IP (IPv4 = o endereço; IPv6 = o /64, `lib/ip-bucket.ts`): trocar os últimos
 * 64 bits não abre um par novo. O IP exato fica na auditoria (`admin.login_failed`).
 */
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { delayAfterFailures, justReachedMaxDelay, LOGIN_FAILURE_MEMORY_HOURS, type DelaySchedule } from '../lib/progressive-delay.js';

/** Chave da conta no contador: hash do e-mail normalizado (e-mail inexistente conta igual — sem oráculo de existência). */
export function accountKey(email: string): string {
  return createHash('sha256').update(`admin-login-v1:${email.trim().toLowerCase()}`).digest('hex');
}

/** Chave do advisory lock do PAR (e-mail + balde de IP): tentativas do mesmo par se enfileiram, pares diferentes não. */
export function pairLockKey(emailHash: string, ipBucket: string | null): string {
  return `admin-login:${emailHash}|${ipBucket ?? '-'}`;
}

export type ReserveOutcome =
  | { readonly kind: 'reserved'; readonly slotId: string; readonly reachedMax: boolean }
  /** A espera do par ainda não passou: a senha nem foi comparada e nada foi gravado. */
  | { readonly kind: 'locked'; readonly retryAfterSeconds: number };

export async function reserveFailureSlot(
  pool: Pool,
  input: { readonly emailHash: string; readonly adminId: string | null; /** Balde do IP (`ipBucket`), ou `null` se desconhecido. */ readonly ipBucket: string | null },
  schedule: DelaySchedule,
): Promise<ReserveOutcome> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [pairLockKey(input.emailHash, input.ipBucket)]);

    // Limpeza oportunista (sem job periódico neste serviço): a memória do par é de 24 h, nada mais velho interessa.
    await client.query(`DELETE FROM admin_login_failures WHERE created_at < now() - interval '1 day'`);

    const state = await client.query<{ failures: number; age_s: number | null }>(
      `SELECT count(*)::int AS failures, EXTRACT(EPOCH FROM (clock_timestamp() - max(created_at)))::float8 AS age_s
         FROM admin_login_failures
        WHERE email_hash = $1 AND ip_address IS NOT DISTINCT FROM $2
          AND created_at > clock_timestamp() - make_interval(hours => $3)`,
      [input.emailHash, input.ipBucket, LOGIN_FAILURE_MEMORY_HOURS],
    );
    const { failures, age_s: ageSeconds } = state.rows[0]!;
    const wait = delayAfterFailures(failures, schedule);
    if (failures > 0 && ageSeconds !== null && ageSeconds < wait) {
      await client.query('COMMIT');
      return { kind: 'locked', retryAfterSeconds: Math.max(1, Math.ceil(wait - ageSeconds)) };
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO admin_login_failures (email_hash, admin_id, ip_address, created_at) VALUES ($1, $2, $3, clock_timestamp()) RETURNING id`,
      [input.emailHash, input.adminId, input.ipBucket],
    );
    await client.query('COMMIT');
    return { kind: 'reserved', slotId: inserted.rows[0]!.id, reachedMax: justReachedMaxDelay(failures + 1, schedule) };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Senha certa: as falhas DESTE par (incluindo a reservada agora) deixam de contar. Outros pares (outros IPs) não são tocados. */
export async function clearPairFailures(pool: Pool, input: { readonly emailHash: string; readonly ipBucket: string | null }): Promise<void> {
  await pool.query(`DELETE FROM admin_login_failures WHERE email_hash = $1 AND ip_address IS NOT DISTINCT FROM $2`, [input.emailHash, input.ipBucket]);
}
