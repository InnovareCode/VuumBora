/** Camada de dados — único lugar que fala SQL com `driver_applications`. */
import type { Pool } from 'pg';
import type { DriverApplicationInput, DriverApplicationOutcome } from '../domain/driver-application.js';

/** Origem fixa por agora: só o site institucional recebe candidatura. Nunca vem do cliente. */
const SOURCE = 'site';

/**
 * Idempotente por natureza: a constraint UNIQUE em `email` (não o código da
 * aplicação) é quem garante que duas requisições concorrentes com o mesmo
 * e-mail nunca criam duas candidaturas — `ON CONFLICT DO NOTHING` só evita
 * que a segunda tentativa estoure erro. `status` não entra no INSERT: o
 * banco aplica o `DEFAULT 'pending'` sozinho (migração 0002).
 */
export async function insertDriverApplication(
  pool: Pool,
  input: DriverApplicationInput,
): Promise<DriverApplicationOutcome> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO driver_applications (name, email, phone, city, state, already_drives_for_app, has_own_vehicle, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [
      input.name,
      input.email,
      input.phone,
      input.city,
      input.state,
      input.alreadyDrivesForApp ?? null,
      input.hasOwnVehicle ?? null,
      SOURCE,
    ],
  );
  return result.rowCount !== null && result.rowCount > 0 ? 'created' : 'already_registered';
}
