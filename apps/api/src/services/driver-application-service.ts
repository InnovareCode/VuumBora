/** Camada de lógica de negócio — a rota nunca fala com o banco direto. */
import type { Pool } from 'pg';
import type { DriverApplicationInput } from '../domain/driver-application.js';
import { insertDriverApplication } from '../repositories/driver-application-repository.js';

export interface DriverApplicationResult {
  readonly ok: true;
}

/**
 * Sempre devolve o mesmo resultado de sucesso — e-mail novo ou já
 * candidatado não se distinguem por quem chama. Isso é intencional
 * (anti-enumeração, mesmo princípio de `waitlist-service.ts`): quem chama
 * nunca descobre se um e-mail já se candidatou.
 */
export async function submitDriverApplication(
  pool: Pool,
  input: DriverApplicationInput,
): Promise<DriverApplicationResult> {
  await insertDriverApplication(pool, input);
  return { ok: true };
}
