/** Camada de dados — único lugar que fala SQL com `waitlist_signups`. */
import type { Pool } from 'pg';
import type { WaitlistProfile, WaitlistSignupOutcome } from '../domain/waitlist.js';

/** Origem fixa por agora: só o site institucional cadastra. Nunca vem do cliente. */
const SOURCE = 'site';

/**
 * Idempotente por natureza: a constraint UNIQUE em `email` (não o código da
 * aplicação) é quem garante que duas requisições concorrentes com o mesmo
 * e-mail nunca criam duas linhas — `ON CONFLICT DO NOTHING` só evita que a
 * segunda tentativa estoure erro.
 */
export async function insertWaitlistSignup(
  pool: Pool,
  email: string,
  profile: WaitlistProfile | undefined,
): Promise<WaitlistSignupOutcome> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO waitlist_signups (email, profile, source)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [email, profile ?? null, SOURCE],
  );
  return result.rowCount !== null && result.rowCount > 0 ? 'created' : 'already_registered';
}
