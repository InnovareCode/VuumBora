/** Camada de lógica de negócio — a rota nunca fala com o banco direto. */
import type { Pool } from 'pg';
import type { WaitlistProfile } from '../domain/waitlist.js';
import { insertWaitlistSignup } from '../repositories/waitlist-repository.js';

export interface WaitlistSignupResult {
  readonly ok: true;
}

/**
 * Sempre devolve o mesmo resultado de sucesso — e-mail novo ou já inscrito
 * não se distinguem por quem chama. Isso é intencional (anti-enumeração,
 * ver docs/lista-de-espera.md): quem chama nunca descobre se um e-mail já
 * está cadastrado.
 */
export async function signUpForWaitlist(
  pool: Pool,
  email: string,
  profile: WaitlistProfile | undefined,
): Promise<WaitlistSignupResult> {
  await insertWaitlistSignup(pool, email, profile);
  return { ok: true };
}
