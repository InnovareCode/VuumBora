/**
 * Retenção dos dados da identidade dos apps (achado M-5 / LGPD: não guardar
 * mais do que o necessário). Roda com a credencial DONA do banco, não a da
 * API: `access_log` é append-only para o papel de runtime (migração 0012), e
 * só o dono apaga. Quem chama: `scripts/retention-identity.mjs` (cron do
 * Easypanel, 1x por dia). Cada tabela apaga em lotes para não segurar lock longo.
 *
 * NÃO cobre `admin_audit_log` (trigger de inviolabilidade; procedimento
 * próprio, decisão do dono) nem `admin_login_challenges` (módulo do admin).
 */
import type { Pool } from 'pg';

export interface RetentionPolicy {
  /** `login_attempts`: a maior janela de limite é 1 h; sobra folga para investigação curta. */
  readonly loginAttemptsDays: number;
  /** `access_log`: trilha de acesso — 90 dias (documentado em 0011). */
  readonly accessLogDays: number;
  /** Famílias de refresh vencidas ou revogadas há mais que isto (a cascata apaga os tokens). */
  readonly sessionFamiliesDays: number;
  /** Códigos de e-mail fechados ou vencidos há mais que isto (0014: 7 dias). */
  readonly emailCodesDays: number;
  /**
   * Contas cujo e-mail NUNCA foi verificado e sem atividade (cadastro, reaproveitamento ou
   * reenvio de código) há mais que isto (I-4 / LGPD: nome, e-mail e telefone de quem não provou
   * ser dono do e-mail não ficam guardados). A apagada leva junto credencial e códigos (cascata).
   */
  readonly unverifiedAccountsDays: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = { loginAttemptsDays: 2, accessLogDays: 90, sessionFamiliesDays: 7, emailCodesDays: 7, unverifiedAccountsDays: 7 };

export interface RetentionReport {
  readonly loginAttempts: number;
  readonly accessLog: number;
  readonly sessionFamilies: number;
  readonly emailCodes: number;
  readonly unverifiedAccounts: number;
}

const BATCH = 5000;

async function deleteInBatches(pool: Pool, table: string, idColumn: string, where: string, params: unknown[]): Promise<number> {
  let total = 0;
  for (;;) {
    const result = await pool.query(
      `DELETE FROM ${table} WHERE ${idColumn} IN (SELECT ${idColumn} FROM ${table} WHERE ${where} LIMIT ${BATCH})`,
      params,
    );
    const n = result.rowCount ?? 0;
    total += n;
    if (n < BATCH) return total;
  }
}

function checkPolicy(policy: RetentionPolicy): void {
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`retention_policy_invalid:${name}`);
  }
}

export async function runIdentityRetention(pool: Pool, policy: RetentionPolicy = DEFAULT_RETENTION): Promise<RetentionReport> {
  checkPolicy(policy);
  const days = (n: number) => `${n} days`;
  return {
    // Contas primeiro: a cascata leva os códigos delas, e o que sobra de códigos é apagado logo abaixo.
    unverifiedAccounts: await deleteInBatches(
      pool, 'accounts', 'id',
      // Só conta ativa e nunca verificada. A "última atividade" é o código mais recente (todo cadastro,
      // reaproveitamento e reenvio emitem um); sem código nenhum, vale a criação.
      `status = 'active' AND email_verified_at IS NULL
       AND COALESCE((SELECT max(c.created_at) FROM account_email_codes c WHERE c.account_id = accounts.id), accounts.created_at) < now() - $1::interval`,
      [days(policy.unverifiedAccountsDays)],
    ),
    loginAttempts: await deleteInBatches(pool, 'login_attempts', 'id', `attempted_at < now() - $1::interval`, [days(policy.loginAttemptsDays)]),
    accessLog: await deleteInBatches(pool, 'access_log', 'id', `occurred_at < now() - $1::interval`, [days(policy.accessLogDays)]),
    sessionFamilies: await deleteInBatches(
      pool, 'refresh_token_families', 'id',
      `expires_at < now() - $1::interval OR revoked_at < now() - $1::interval`, [days(policy.sessionFamiliesDays)],
    ),
    emailCodes: await deleteInBatches(
      pool, 'account_email_codes', 'id',
      `expires_at < now() - $1::interval OR closed_at < now() - $1::interval`, [days(policy.emailCodesDays)],
    ),
  };
}
