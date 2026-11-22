/**
 * Rotas dos códigos de e-mail: `/v1/auth/{verify-email,resend-verification,forgot-password,reset-password}`.
 * Reenvio e "esqueci a senha" respondem 200 IGUAL exista a conta ou não.
 * Nunca ecoam o código, o e-mail nem a senha, e nunca os logam.
 */
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { forgotPasswordSchema, resendVerificationSchema, resetPasswordSchema, verifyEmailSchema } from '../domain/auth.js';
import type { AuthConfig } from '../lib/auth-config.js';
import type { IpLimitRouteOptions } from '../lib/ip-rate-limits.js';
import type { MailPort } from '../lib/mail-port.js';
import * as recovery from '../services/account-recovery-service.js';
import { contextOf, fail, invalidBody, mailFailureLogger, tooManyAttempts, unavailable } from './auth-http.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

/** Cota máxima de espera informada ao cliente quando o teto cumulativo trava a redefinição (a janela real é de 24 h, rolante). */
const RESET_LOCK_RETRY_AFTER_SECONDS = 24 * 60 * 60;

function replyToCodeCheck(request: FastifyRequest, reply: FastifyReply, result: recovery.CodeCheckResult, event: string, okData: Record<string, unknown>, config: AuthConfig, invalidMessage = 'Código incorreto.'): void {
  switch (result.kind) {
    case 'ok':
      request.log.info({ event: `${event}_succeeded` });
      reply.code(200).send({ ok: true, data: okData });
      return;
    case 'invalid':
      request.log.info({ event: `${event}_invalid_code` });
      fail(reply, 400, 'invalid_code', invalidMessage, { attemptsLeft: result.attemptsLeft });
      return;
    case 'locked':
      request.log.warn({ event: `${event}_code_locked` });
      fail(reply, 429, 'code_locked', 'Muitas tentativas com este código. Peça um novo código.');
      return;
    case 'account_locked':
      // Teto cumulativo do dia (I-7): pedir outro código não adianta; o limite rola com a janela de 24 h.
      request.log.warn({ event: `${event}_account_locked` });
      reply.header('Retry-After', String(RESET_LOCK_RETRY_AFTER_SECONDS));
      fail(reply, 429, 'reset_locked', 'Muitas tentativas de redefinição para esta conta. Tente novamente mais tarde ou fale com o suporte.', { retryAfterSeconds: RESET_LOCK_RETRY_AFTER_SECONDS });
      return;
    case 'blocked':
      request.log.warn({ event: `${event}_blocked` });
      tooManyAttempts(reply, result.retryAfterSeconds);
      return;
    default:
      request.log.info({ event: `${event}_code_expired` });
      fail(reply, 400, 'code_expired', 'Código expirado ou inexistente. Peça um novo código.');
  }
}

/** `ipLimit` é a fábrica da classe "credenciais e códigos" (lib/ip-rate-limits.ts): cada rota recebe contadores próprios. */
export function registerAuthRecoveryRoutes(app: FastifyInstance, config: AuthConfig, mail: MailPort, ipLimit: () => IpLimitRouteOptions): void {
  app.post('/v1/auth/verify-email', ipLimit(), async (request, reply) => {
    const parsed = verifyEmailSchema.safeParse(request.body);
    if (!parsed.success) return invalidBody(request, reply, 'auth_verify_email_rejected');
    try {
      const result = await recovery.verifyEmail(pool, config, parsed.data, contextOf(request, config));
      // Código OU senha errados dão a MESMA resposta (a senha do cadastro faz parte da prova de quem verifica).
      replyToCodeCheck(request, reply, result, 'auth_verify_email', { verified: true }, config, 'Código ou senha incorretos.');
    } catch (err) {
      unavailable(request, reply, err, 'auth_verify_email_failed_internal');
    }
  });

  app.post('/v1/auth/resend-verification', ipLimit(), async (request, reply) => {
    const parsed = resendVerificationSchema.safeParse(request.body);
    if (!parsed.success) return invalidBody(request, reply, 'auth_resend_rejected');
    try {
      const deps = { mail, onMailFailure: mailFailureLogger(request.log) };
      const result = await recovery.requestVerificationCode(pool, config, deps, parsed.data, contextOf(request, config));
      if (result.kind === 'blocked') {
        request.log.warn({ event: 'auth_resend_blocked' });
        return tooManyAttempts(reply, config.codeRequestWindowMinutes * 60);
      }
      reply.code(200).send({ ok: true, data: { resendAfterSeconds: result.resendAfterSeconds } });
    } catch (err) {
      unavailable(request, reply, err, 'auth_resend_failed_internal');
    }
  });

  app.post('/v1/auth/forgot-password', ipLimit(), async (request, reply) => {
    const parsed = forgotPasswordSchema.safeParse(request.body);
    if (!parsed.success) return invalidBody(request, reply, 'auth_forgot_rejected');
    try {
      const deps = { mail, onMailFailure: mailFailureLogger(request.log) };
      const result = await recovery.requestPasswordReset(pool, config, deps, parsed.data, contextOf(request, config));
      if (result.kind === 'blocked') {
        request.log.warn({ event: 'auth_forgot_blocked' });
        return tooManyAttempts(reply, config.codeRequestWindowMinutes * 60);
      }
      reply.code(200).send({ ok: true, data: { resendAfterSeconds: result.resendAfterSeconds } });
    } catch (err) {
      unavailable(request, reply, err, 'auth_forgot_failed_internal');
    }
  });

  app.post('/v1/auth/reset-password', ipLimit(), async (request, reply) => {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      if (field === 'newPassword') return invalidBody(request, reply, 'auth_reset_rejected', 'invalid_password', 'A senha deve ter de 8 a 72 caracteres.');
      return invalidBody(request, reply, 'auth_reset_rejected');
    }
    try {
      const deps = { mail, onMailFailure: mailFailureLogger(request.log) };
      const result = await recovery.resetPassword(pool, config, deps, parsed.data, contextOf(request, config));
      replyToCodeCheck(request, reply, result, 'auth_reset_password', { passwordChanged: true, sessionsRevoked: true }, config);
    } catch (err) {
      unavailable(request, reply, err, 'auth_reset_password_failed_internal');
    }
  });
}
