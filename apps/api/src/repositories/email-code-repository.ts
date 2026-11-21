/**
 * Camada de dados dos códigos de e-mail. Toda a regra (validade, uso único,
 * tentativas, intervalo/teto de reenvio, troca de senha + revogação de
 * sessões) mora nas funções do banco da migração 0014; aqui só se chama.
 * O código em claro NUNCA chega aqui: só o HMAC.
 */
import type { AccountType } from '../domain/auth.js';
import type { EmailCodePurpose } from '../lib/email-code.js';
import type { Queryable } from './identity-repository.js';

export interface CodeTarget {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
}

/** Conta do tipo informado, por e-mail OU ID público. Só devolve o necessário para emitir/conferir código. */
export async function findCodeTarget(
  db: Queryable,
  accountType: AccountType,
  identifier: { kind: 'email' | 'public_id'; value: string },
): Promise<CodeTarget | null> {
  const column = identifier.kind === 'email' ? 'a.email' : 'a.public_id';
  const result = await db.query<{ id: string; email: string; full_name: string }>(
    `SELECT a.id, a.email, a.full_name FROM accounts a WHERE a.account_type = $1 AND ${column} = $2`,
    [accountType, identifier.value],
  );
  const row = result.rows[0];
  return row ? { id: row.id, email: row.email, fullName: row.full_name } : null;
}

export type IssueOutcome =
  | 'issued' | 'unknown' | 'account_inactive' | 'already_verified' | 'email_not_verified' | 'too_soon' | 'rate_limited'
  /** Redefinição: teto cumulativo de falhas do dia atingido (0018) — não se emite código que não vale. */
  | 'reset_locked';

export async function issueEmailCode(
  db: Queryable,
  input: {
    accountId: string; purpose: EmailCodePurpose; codeHash: string; ttlSeconds: number; minIntervalSeconds: number; maxPerHour: number;
    /** Teto cumulativo de falhas de redefinição por dia (só vale para `password_reset`); `null` = sem teto. */
    maxResetFailures?: number | null;
  },
): Promise<{ outcome: IssueOutcome; retryAfterSeconds: number | null }> {
  const result = await db.query<{ outcome: IssueOutcome; retry_after_s: number | null }>(
    `SELECT outcome, retry_after_s
       FROM issue_email_code($1, $2, $3, make_interval(secs => $4), make_interval(secs => $5), $6, $7)`,
    [input.accountId, input.purpose, input.codeHash, input.ttlSeconds, input.minIntervalSeconds, input.maxPerHour, input.maxResetFailures ?? null],
  );
  const row = result.rows[0]!;
  return { outcome: row.outcome, retryAfterSeconds: row.retry_after_s };
}

/** `account_locked`: teto cumulativo de falhas de redefinição do dia (0018) — nada foi comparado. */
export type ConsumeOutcome = 'ok' | 'invalid' | 'locked' | 'expired' | 'no_code' | 'account_locked';
export interface ConsumeResult { outcome: ConsumeOutcome; attemptsLeft: number }

/** `verify_email` (marca o e-mail como verificado na mesma transação do banco). Não levanta nas recusas. */
export async function consumeEmailCode(db: Queryable, accountId: string, purpose: EmailCodePurpose, codeHash: string): Promise<ConsumeResult> {
  const result = await db.query<{ outcome: ConsumeOutcome; attempts_left: number }>(
    `SELECT outcome, attempts_left FROM consume_email_code($1, $2, $3)`,
    [accountId, purpose, codeHash],
  );
  const row = result.rows[0]!;
  return { outcome: row.outcome, attemptsLeft: row.attempts_left };
}

/** Confere o código de redefinição E troca a senha + revoga todas as sessões, atomicamente. NÃO marca o e-mail como verificado. */
export async function resetPasswordWithCode(db: Queryable, accountId: string, codeHash: string, newPasswordHash: string, maxFailuresPerDay: number): Promise<ConsumeResult> {
  const result = await db.query<{ outcome: ConsumeOutcome; attempts_left: number }>(
    `SELECT outcome, attempts_left FROM reset_password_with_code($1, $2, $3, 'bcrypt', $4)`,
    [accountId, codeHash, newPasswordHash, maxFailuresPerDay],
  );
  const row = result.rows[0]!;
  return { outcome: row.outcome, attemptsLeft: row.attempts_left };
}
