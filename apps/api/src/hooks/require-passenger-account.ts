/**
 * `requirePassengerAccount`: a cotação (`/v1/quotes*`) é só da conta de PASSAGEIRO — o gatilho `fare_quotes_passenger_account`
 * da 0026 recusaria a gravação de qualquer outra. Roda DEPOIS de `requireAccount` (que já provou a sessão viva). Conta de
 * motorista: `403 not_passenger_account`. O tipo vem do banco (imutável desde a 0010), nunca do cliente.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../db.js';
import { refuseAndStop } from '../lib/early-reply.js';
import { describeErrorForLog } from '../lib/safe-error.js';
import { accountTypeOf } from '../repositories/driver-repository.js';

export async function requirePassengerAccount(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const accountId = request.authAccount?.accountId;
  if (!accountId) {
    // Erro de fiação (esqueceram `requireAccount` antes): recusa em vez de deixar a rota aberta.
    request.log.error({ event: 'passenger_gate_without_account' });
    await refuseAndStop(reply, 401, { ok: false, error: { code: 'unauthorized', message: 'Sessão inválida ou expirada.' } });
    return;
  }
  try {
    const accountType = await accountTypeOf(pool, accountId);
    if (accountType === null) {
      await refuseAndStop(reply, 401, { ok: false, error: { code: 'unauthorized', message: 'Sessão inválida ou expirada.' } });
      return;
    }
    if (accountType !== 'passenger') {
      request.log.info({ event: 'passenger_route_refused', reason: 'not_passenger_account' });
      await refuseAndStop(reply, 403, { ok: false, error: { code: 'not_passenger_account', message: 'Esta conta não é de passageiro.' } });
    }
  } catch (err) {
    request.log.error({ event: 'passenger_gate_failed_internal', ...describeErrorForLog(err) });
    await refuseAndStop(reply, 503, { ok: false, error: { code: 'unavailable', message: 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.' } });
  }
}
