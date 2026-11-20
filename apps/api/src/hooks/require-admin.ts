/** `preHandler` reutilizável — qualquer rota admin que exige sessão válida usa este hook, nunca reimplementa a checagem. */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../db.js';
import { env } from '../env.js';
import { ADMIN_SESSION_COOKIE, type AdminRole, type AdminUser } from '../domain/admin.js';
import { resolveAdminSession } from '../services/admin-auth-service.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Presente só depois de `requireAdmin` ter passado (nunca antes). */
    admin?: AdminUser;
  }
}

function sendUnauthorized(reply: FastifyReply, message: string): void {
  reply.code(401).send({ ok: false, error: { code: 'unauthorized', message } });
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const rawToken = request.cookies[ADMIN_SESSION_COOKIE];
  if (!rawToken) {
    sendUnauthorized(reply, 'Faça login para continuar.');
    return;
  }

  const admin = await resolveAdminSession(pool, rawToken, env.ADMIN_SESSION_TTL_HOURS);
  if (!admin) {
    // Cookie presente mas sessão inválida/expirada: limpa o cookie velho —
    // sem isso o navegador insiste em mandar um token morto em toda requisição.
    reply.clearCookie(ADMIN_SESSION_COOKIE, { path: '/' });
    sendUnauthorized(reply, 'Sessão expirada. Faça login novamente.');
    return;
  }

  request.admin = admin;
}

function sendForbidden(reply: FastifyReply): void {
  reply.code(403).send({ ok: false, error: { code: 'forbidden', message: 'Seu papel não tem acesso a este recurso.' } });
}

/**
 * Fábrica de `preHandler` — exige sessão válida (via `requireAdmin`) E que
 * `request.admin.role` esteja entre os papéis passados. Única forma de
 * restringir rota por papel: antes desta função, toda rota só checava
 * sessão, então qualquer papel autenticado acessava qualquer rota admin
 * (achado do Órion). Uso: `{ preHandler: requireAdminRole('dono', 'operacao') }`.
 */
export function requireAdminRole(...allowedRoles: readonly AdminRole[]) {
  return async function requireAdminRoleHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await requireAdmin(request, reply);
    if (reply.sent) return; // `requireAdmin` já respondeu 401 — não segue para a checagem de papel.

    if (!allowedRoles.includes(request.admin!.role)) {
      sendForbidden(reply);
    }
  };
}
