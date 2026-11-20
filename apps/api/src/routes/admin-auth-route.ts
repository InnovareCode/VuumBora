/** Rota HTTP — só traduz requisição/resposta. Validação e regra de negócio ficam fora daqui. */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pool } from '../db.js';
import { env } from '../env.js';
import { ADMIN_SESSION_COOKIE } from '../domain/admin.js';
import { requireAdmin } from '../hooks/require-admin.js';
import { insertAuditLog } from '../repositories/admin-audit-repository.js';
import { loginAdmin, logoutAdmin } from '../services/admin-auth-service.js';

const loginBodySchema = z.object({
  email: z.string().trim().toLowerCase().min(3, 'E-mail inválido.').max(254, 'E-mail inválido.').email('E-mail inválido.'),
  password: z.string().min(1, 'Informe a senha.').max(200, 'Senha inválida.'),
});

function sendInvalidBody(reply: FastifyReply): void {
  reply.code(400).send({ ok: false, error: { code: 'validation_failed', message: 'Informe e-mail e senha válidos.' } });
}

/** Sempre a mesma mensagem para e-mail inexistente, senha errada ou admin desativado — nunca revela qual dos três aconteceu. */
function sendInvalidCredentials(reply: FastifyReply): void {
  reply.code(401).send({ ok: false, error: { code: 'invalid_credentials', message: 'E-mail ou senha incorretos.' } });
}

function setSessionCookie(reply: FastifyReply, rawToken: string, expiresAt: Date): void {
  reply.setCookie(ADMIN_SESSION_COOKIE, rawToken, {
    httpOnly: true,
    // `false` em dev (http://localhost) de propósito — cookie `secure` nunca é
    // enviado em conexão sem TLS, e em produção (Easypanel, HTTPS) isto é `true`.
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function registerAdminAuthRoutes(app: FastifyInstance): void {
  app.post(
    '/v1/admin/auth/login',
    {
      config: {
        rateLimit: {
          max: env.ADMIN_LOGIN_RATE_LIMIT_MAX,
          timeWindow: env.ADMIN_LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = loginBodySchema.safeParse(request.body);
      if (!parsed.success) {
        request.log.info({ event: 'admin_login_rejected', reason: 'validation_failed' });
        sendInvalidBody(reply);
        return;
      }

      const outcome = await loginAdmin(pool, parsed.data.email, parsed.data.password, {
        ttlHours: env.ADMIN_SESSION_TTL_HOURS,
        absoluteTtlHours: env.ADMIN_SESSION_ABSOLUTE_TTL_HOURS,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      });

      if (!outcome.ok) {
        request.log.info({ event: 'admin_login_failed' });
        sendInvalidCredentials(reply);
        return;
      }

      setSessionCookie(reply, outcome.rawToken, outcome.expiresAt);
      await insertAuditLog(pool, {
        adminId: outcome.admin.id,
        action: 'admin.login',
        targetType: 'admin_session',
        targetId: outcome.admin.id,
        ipAddress: request.ip,
      });

      request.log.info({ event: 'admin_login_succeeded', adminId: outcome.admin.id });
      reply.code(200).send({ ok: true, data: outcome.admin });
    },
  );

  app.post('/v1/admin/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const rawToken = request.cookies[ADMIN_SESSION_COOKIE];
    if (rawToken) {
      const admin = await logoutAdmin(pool, rawToken);
      if (admin) {
        await insertAuditLog(pool, {
          adminId: admin.id,
          action: 'admin.logout',
          targetType: 'admin_session',
          targetId: admin.id,
          ipAddress: request.ip,
        });
        request.log.info({ event: 'admin_logout_succeeded', adminId: admin.id });
      }
    }

    // Idempotente de propósito: sem cookie, ou com cookie já inválido, a resposta é a mesma.
    reply.clearCookie(ADMIN_SESSION_COOKIE, { path: '/' });
    reply.code(200).send({ ok: true, data: {} });
  });

  app.get('/v1/admin/me', { preHandler: requireAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    reply.code(200).send({ ok: true, data: request.admin });
  });
}
