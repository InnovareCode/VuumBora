/**
 * `requireDriverAccount`: as rotas `/v1/driver/*` são só da conta de MOTORISTA. Roda DEPOIS de `requireAccount` (que já
 * provou a sessão viva). Conta de passageiro: `403 not_driver_account`. O tipo vem do banco (é imutável desde a 0010),
 * nunca de algo que o cliente mande.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../db.js';
import { refuseAndStop } from '../lib/early-reply.js';
import { describeErrorForLog } from '../lib/safe-error.js';
import { accountTypeOf } from '../repositories/driver-repository.js';

export async function requireDriverAccount(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const accountId = request.authAccount?.accountId;
  if (!accountId) {
    // Erro de fiação (esqueceram `requireAccount` antes): recusa em vez de deixar a rota aberta.
    request.log.error({ event: 'driver_gate_without_account' });
    await refuseAndStop(reply, 401, { ok: false, error: { code: 'unauthorized', message: 'Sessão inválida ou expirada.' } });
    return;
  }
  try {
    const accountType = await accountTypeOf(pool, accountId);
    if (accountType === null) {
      await refuseAndStop(reply, 401, { ok: false, error: { code: 'unauthorized', message: 'Sessão inválida ou expirada.' } });
      return;
    }
    if (accountType !== 'driver') {
      request.log.info({ event: 'driver_route_refused', reason: 'not_driver_account' });
      // Para a cadeia (também no aborto da conexão): sem isso o handler rodaria mesmo assim (lib/early-reply.ts).
      await refuseAndStop(reply, 403, { ok: false, error: { code: 'not_driver_account', message: 'Esta conta não é de motorista.' } });
    }
  } catch (err) {
    request.log.error({ event: 'driver_gate_failed_internal', ...describeErrorForLog(err) });
    await refuseAndStop(reply, 503, { ok: false, error: { code: 'unavailable', message: 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.' } });
  }
}
