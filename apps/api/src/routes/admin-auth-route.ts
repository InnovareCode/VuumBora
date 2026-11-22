/** Rota HTTP — só traduz requisição/resposta. Validação e regra de negócio ficam fora daqui. */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pool } from '../db.js';
import { env } from '../env.js';
import { ADMIN_SESSION_COOKIE } from '../domain/admin.js';
import { requireAdmin } from '../hooks/require-admin.js';
import { insertAuditLog } from '../repositories/admin-audit-repository.js';
import { adminRouteRateLimit } from '../lib/admin-rate-limit.js';
import { routeRateLimitKey } from '../lib/ip-bucket.js';
import { twoFactorConfig } from '../lib/two-factor-config.js';
import { loginAdmin, logoutAdmin } from '../services/admin-auth-service.js';
import { markNoStore, sendAccountLocked, sendChallenge, sendSessionStarted, sendTwoFactorUnavailable } from './admin-auth-http.js';

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

/**
 * Caminhos RELATIVOS ao prefixo `/v1/admin` — aplicado uma vez em
 * `app.ts` (`{ prefix: '/v1/admin' }`), não mais escrito por extenso em
 * cada rota. Precisou virar prefixo de registro (não só convenção de
 * string) para o `@fastify/cors` do contexto admin não colidir com o da
 * API pública na rota de preflight que ele cria sozinho (`OPTIONS *`) —
 * ver o comentário em `app.ts`.
 */
export function registerAdminAuthRoutes(app: FastifyInstance): void {
  app.post(
    '/auth/login',
    {
      config: {
        rateLimit: {
          max: env.ADMIN_LOGIN_RATE_LIMIT_MAX,
          timeWindow: env.ADMIN_LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
          keyGenerator: routeRateLimitKey,
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

      const outcome = await loginAdmin(
        pool,
        parsed.data.email,
        parsed.data.password,
        {
          ttlHours: env.ADMIN_SESSION_TTL_HOURS,
          absoluteTtlHours: env.ADMIN_SESSION_ABSOLUTE_TTL_HOURS,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
        twoFactorConfig,
      );

      switch (outcome.kind) {
        case 'invalid_credentials':
          request.log.info({ event: 'admin_login_failed' });
          sendInvalidCredentials(reply);
          return;
        case 'account_locked':
          request.log.warn({ event: 'admin_login_account_locked' });
          sendAccountLocked(reply, outcome.retryAfterSeconds);
          return;
        case 'two_factor_unavailable':
          sendTwoFactorUnavailable(request, reply);
          return;
        case 'second_factor_required':
        case 'enrollment_required':
          request.log.info({ event: 'admin_login_second_factor_pending', status: outcome.kind });
          sendChallenge(reply, outcome.kind, outcome.challengeToken, outcome.challengeExpiresAt);
          return;
        case 'session':
          await sendSessionStarted(request, reply, outcome, { secondFactor: null });
          return;
      }
    },
  );

  app.post('/auth/logout', adminRouteRateLimit(), async (request: FastifyRequest, reply: FastifyReply) => {
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

  app.get('/me', { ...adminRouteRateLimit(), preHandler: requireAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Também devolve `csrfToken` — é como o painel RECUPERA o token depois
    // de um F5 (ele só vivia em memória no browser, nunca em cookie/
    // localStorage). Sessão criada antes da migração 0009 devolve `null`;
    // o painel deve tratar isso como "sem token ainda" (mutação vai falhar
    // com 403 até logar de novo), não quebrar a leitura do perfil.
    markNoStore(reply);
    reply.code(200).send({ ok: true, data: { ...request.admin, csrfToken: request.adminCsrfToken ?? null } });
  });
}
