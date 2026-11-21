/**
 * Respostas HTTP compartilhadas entre o login (senha) e o segundo fator —
 * as duas rotas terminam do mesmo jeito (cookie + corpo `{ ok, data }`), e
 * uma só implementação evita divergir o formato que a Lyra consome.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env.js';
import { ADMIN_SESSION_COOKIE } from '../domain/admin.js';
import { pool } from '../db.js';
import { insertAuditLog } from '../repositories/admin-audit-repository.js';
import type { AdminSessionGrant } from '../services/admin-auth-service.js';
import type { FactorFailure } from '../services/admin-two-factor-service.js';

/**
 * Resposta que carrega segredo (QR/segredo TOTP, códigos de recuperação, token de
 * desafio, CSRF) nunca pode ficar em cache de navegador nem de proxy intermediário.
 */
export function markNoStore(reply: FastifyReply): void {
  reply.header('Cache-Control', 'no-store');
  reply.header('Pragma', 'no-cache');
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

/**
 * Único ponto que entrega sessão ao navegador: cookie + auditoria
 * `admin.login` (com o método do segundo fator, ou `null` sem ele) + corpo.
 * `csrfToken` sai no corpo, nunca em cookie — ver
 * `hooks/require-admin.ts::requireCsrfToken`.
 */
export async function sendSessionStarted(
  request: FastifyRequest,
  reply: FastifyReply,
  grant: AdminSessionGrant,
  options: { secondFactor: string | null; extra?: Record<string, unknown> },
): Promise<void> {
  markNoStore(reply);
  setSessionCookie(reply, grant.rawToken, grant.expiresAt);
  await insertAuditLog(pool, {
    adminId: grant.admin.id,
    action: 'admin.login',
    targetType: 'admin_session',
    targetId: grant.admin.id,
    after: { secondFactor: options.secondFactor },
    ipAddress: request.ip,
  });
  request.log.info({ event: 'admin_login_succeeded', adminId: grant.admin.id, secondFactor: options.secondFactor });
  reply.code(200).send({
    ok: true,
    data: { status: 'authenticated', ...grant.admin, csrfToken: grant.csrfToken, ...options.extra },
  });
}

/** Senha certa, falta o segundo fator ou o enrolamento. Nenhum cookie é emitido. */
export function sendChallenge(
  reply: FastifyReply,
  status: 'second_factor_required' | 'enrollment_required',
  challengeToken: string,
  challengeExpiresAt: Date,
): void {
  markNoStore(reply);
  reply.code(200).send({ ok: true, data: { status, challengeToken, challengeExpiresAt: challengeExpiresAt.toISOString() } });
}

/** 429 da espera progressiva do par (e-mail + IP) — login e reautenticação. `retryAfterSeconds` vai de 1 s a 15 min. */
export function sendAccountLocked(reply: FastifyReply, retryAfterSeconds: number): void {
  reply
    .code(429)
    .header('Retry-After', String(retryAfterSeconds))
    .send({
      ok: false,
      error: { code: 'account_locked', message: 'Muitas tentativas com senha incorreta. Aguarde antes de tentar de novo.', retryAfterSeconds },
    });
}

export function sendTwoFactorUnavailable(request: FastifyRequest, reply: FastifyReply): void {
  request.log.error({ event: 'two_factor_unavailable', reason: 'encryption_key_missing' });
  reply.code(503).send({
    ok: false,
    error: { code: 'two_factor_unavailable', message: 'Verificação em duas etapas indisponível. Contate o responsável técnico.' },
  });
}

/** Traduz as falhas comuns de qualquer checagem de código para a resposta HTTP. */
export function sendFactorFailure(request: FastifyRequest, reply: FastifyReply, failure: FactorFailure): void {
  switch (failure.kind) {
    case 'invalid_code':
      reply.code(401).send({ ok: false, error: { code: 'invalid_second_factor', message: 'Código inválido.' } });
      return;
    case 'locked':
      reply
        .code(429)
        .header('Retry-After', String(failure.retryAfterSeconds))
        .send({
          ok: false,
          error: {
            code: 'two_factor_locked',
            message: 'Muitas tentativas com código errado. Tente novamente mais tarde.',
            retryAfterSeconds: failure.retryAfterSeconds,
          },
        });
      return;
    case 'challenge_invalid':
      reply.code(401).send({ ok: false, error: { code: 'challenge_invalid', message: 'Sessão de login expirada. Informe e-mail e senha novamente.' } });
      return;
    case 'two_factor_unavailable':
      sendTwoFactorUnavailable(request, reply);
      return;
    case 'password_invalid':
      reply.code(403).send({ ok: false, error: { code: 'password_invalid', message: 'Senha atual incorreta.' } });
      return;
    case 'account_locked':
      sendAccountLocked(reply, failure.retryAfterSeconds);
      return;
    case 'enrollment_token_invalid':
      reply.code(403).send({ ok: false, error: { code: 'enrollment_token_invalid', message: 'Código de ativação inválido, vencido ou já usado. Peça um novo ao responsável técnico.' } });
      return;
  }
}
