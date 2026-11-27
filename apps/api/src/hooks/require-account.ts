/**
 * Autenticação do app por `Authorization: Bearer <token de acesso>`. Além da
 * assinatura e da validade, confere no banco que a SESSÃO (família) segue
 * viva e a conta ativa: assim logout, logout de todos e reuso detectado
 * valem na hora, e não só quando o token de acesso (curto) expirar.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../db.js';
import type { AuthConfig } from '../lib/auth-config.js';
import { refuseAndStop } from '../lib/early-reply.js';
import { verifyAccessToken } from '../lib/token-crypto.js';
import { isSessionLive } from '../repositories/identity-repository.js';

export interface AuthenticatedAccount {
  readonly accountId: string;
  readonly familyId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    authAccount?: AuthenticatedAccount;
  }
}

export function makeRequireAccount(config: AuthConfig) {
  return async function requireAccount(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const claims = token ? verifyAccessToken(config.jwtSecret, token) : null;
    if (!claims || !(await isSessionLive(pool, claims.sid, claims.sub))) {
      // Para a cadeia (também no aborto da conexão): sem isso o handler rodaria mesmo assim (lib/early-reply.ts).
      await refuseAndStop(reply, 401, { ok: false, error: { code: 'unauthorized', message: 'Sessão inválida ou expirada.' } });
      return;
    }
    request.authAccount = { accountId: claims.sub, familyId: claims.sid };
  };
}
