/** Rotas HTTP do segundo fator (TOTP) do admin. Só traduz requisição/resposta; a regra mora em `admin-two-factor-service.ts`. */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pool } from '../db.js';
import { env } from '../env.js';
import { ADMIN_SESSION_COOKIE } from '../domain/admin.js';
import { requireAdmin, requireCsrfToken } from '../hooks/require-admin.js';
import { twoFactorConfig } from '../lib/two-factor-config.js';
import {
  confirmEnrollment,
  confirmEnrollmentFromChallenge,
  disableTwoFactor,
  getTwoFactorStatus,
  regenerateRecoveryCodes,
  startEnrollment,
  startEnrollmentFromChallenge,
  verifyLoginChallenge,
} from '../services/admin-two-factor-service.js';
import { hashToken } from '../services/admin-auth-service.js';
import { markNoStore, sendFactorFailure, sendSessionStarted } from './admin-auth-http.js';

const challengeSchema = z.object({ challengeToken: z.string().min(20).max(100) });
const codeSchema = z.object({ code: z.string().trim().min(6).max(32) });
const passwordSchema = z.object({ password: z.string().min(1).max(200) });
/** Token de uso único entregue fora de banda (scripts create-admin / reissue-2fa-enrollment). */
const enrollmentTokenSchema = z.object({ enrollmentToken: z.string().trim().min(10).max(64) });
const challengeAndCodeSchema = challengeSchema.extend(codeSchema.shape);
const mandatoryStartSchema = challengeSchema.extend(enrollmentTokenSchema.shape);
const mandatoryConfirmSchema = challengeAndCodeSchema.extend(enrollmentTokenSchema.shape);
const codeAndPasswordSchema = codeSchema.extend(passwordSchema.shape);

// Mesmo limite por IP do login: estas rotas são a continuação dele.
const rateLimit = {
  config: {
    rateLimit: {
      max: env.ADMIN_LOGIN_RATE_LIMIT_MAX,
      timeWindow: env.ADMIN_LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    },
  },
};

function sendValidationFailed(reply: FastifyReply): void {
  reply.code(400).send({ ok: false, error: { code: 'validation_failed', message: 'Dados inválidos.' } });
}

/** Segredo TOTP / URI do QR: nunca em cache (`Cache-Control: no-store`). */
function sendSecret(reply: FastifyReply, outcome: { secret: string; otpauthUri: string }): FastifyReply {
  markNoStore(reply);
  return reply.code(200).send({ ok: true, data: { secret: outcome.secret, otpauthUri: outcome.otpauthUri } });
}

function sendRecoveryCodes(reply: FastifyReply, recoveryCodes: string[]): FastifyReply {
  markNoStore(reply);
  return reply.code(200).send({ ok: true, data: { recoveryCodes } });
}

function sendAlreadyEnrolled(reply: FastifyReply): void {
  reply.code(409).send({ ok: false, error: { code: 'two_factor_already_enrolled', message: 'Verificação em duas etapas já está ativa.' } });
}

function sendNotEnrolled(reply: FastifyReply): void {
  reply.code(409).send({ ok: false, error: { code: 'two_factor_not_enrolled', message: 'Verificação em duas etapas não está ativa.' } });
}

function sendNotStarted(reply: FastifyReply): void {
  reply.code(409).send({ ok: false, error: { code: 'two_factor_enrollment_not_started', message: 'Inicie o enrolamento antes de confirmar o código.' } });
}

/** Hash do cookie da sessão atual — é a que NÃO cai quando o 2FA é ligado/desligado. `requireAdmin` já garantiu que o cookie existe. */
function currentSessionHash(request: FastifyRequest): string {
  return hashToken(request.cookies[ADMIN_SESSION_COOKIE] ?? '');
}

function requestContext(request: FastifyRequest) {
  return {
    ttlHours: env.ADMIN_SESSION_TTL_HOURS,
    absoluteTtlHours: env.ADMIN_SESSION_ABSOLUTE_TTL_HOURS,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'] ?? null,
  };
}

/** Caminhos relativos a `/v1/admin` (prefixo aplicado em `app.ts`). */
export function registerAdminTwoFactorRoutes(app: FastifyInstance): void {
  // ---- Antes da sessão: o "bearer" é o desafio emitido pelo login com senha certa.

  app.post('/auth/2fa/verify', rateLimit, async (request, reply) => {
    const parsed = challengeAndCodeSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationFailed(reply);

    const outcome = await verifyLoginChallenge(pool, parsed.data, requestContext(request), twoFactorConfig);
    if (outcome.kind !== 'session') return sendFactorFailure(request, reply, outcome);

    await sendSessionStarted(request, reply, outcome, {
      secondFactor: outcome.method,
      extra: { recoveryCodesRemaining: outcome.recoveryCodesRemaining },
    });
  });

  app.post('/auth/2fa/enroll/start', rateLimit, async (request, reply) => {
    const parsed = mandatoryStartSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationFailed(reply);

    const outcome = await startEnrollmentFromChallenge(pool, parsed.data, { ipAddress: request.ip }, twoFactorConfig);
    if (outcome.kind === 'started') return sendSecret(reply, outcome);
    if (outcome.kind === 'already_enrolled') return sendAlreadyEnrolled(reply);
    return sendFactorFailure(request, reply, outcome);
  });

  /** Confirma o enrolamento obrigatório E conclui o login: devolve sessão + códigos de recuperação (única vez). */
  app.post('/auth/2fa/enroll/confirm', rateLimit, async (request, reply) => {
    const parsed = mandatoryConfirmSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationFailed(reply);

    const outcome = await confirmEnrollmentFromChallenge(pool, parsed.data, requestContext(request), twoFactorConfig);
    if (outcome.kind === 'not_started') return sendNotStarted(reply);
    if (outcome.kind !== 'session') return sendFactorFailure(request, reply, outcome);

    await sendSessionStarted(request, reply, outcome, {
      secondFactor: 'enrollment',
      extra: { recoveryCodes: outcome.recoveryCodes },
    });
  });

  // ---- Com sessão (papéis em que o 2FA é opcional, e gerência para todos).

  app.get('/2fa/status', { preHandler: requireAdmin }, async (request, reply) => {
    reply.code(200).send({ ok: true, data: await getTwoFactorStatus(pool, request.admin!) });
  });

  app.post('/2fa/enroll/start', { ...rateLimit, preHandler: [requireAdmin, requireCsrfToken] }, async (request, reply) => {
    const parsed = passwordSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationFailed(reply);

    const outcome = await startEnrollment(pool, request.admin!, parsed.data.password, { ipAddress: request.ip }, twoFactorConfig);
    if (outcome.kind === 'started') return sendSecret(reply, outcome);
    if (outcome.kind === 'already_enrolled') return sendAlreadyEnrolled(reply);
    return sendFactorFailure(request, reply, outcome);
  });

  app.post('/2fa/enroll/confirm', { ...rateLimit, preHandler: [requireAdmin, requireCsrfToken] }, async (request, reply) => {
    const parsed = codeSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationFailed(reply);

    const outcome = await confirmEnrollment(pool, request.admin!, parsed.data.code, currentSessionHash(request), { ipAddress: request.ip }, twoFactorConfig);
    if (outcome.kind === 'confirmed') return sendRecoveryCodes(reply, outcome.recoveryCodes);
    if (outcome.kind === 'not_started') return sendNotStarted(reply);
    return sendFactorFailure(request, reply, outcome);
  });

  app.post('/2fa/recovery-codes/regenerate', { ...rateLimit, preHandler: [requireAdmin, requireCsrfToken] }, async (request, reply) => {
    const parsed = codeAndPasswordSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationFailed(reply);

    const outcome = await regenerateRecoveryCodes(pool, request.admin!, parsed.data, { ipAddress: request.ip }, twoFactorConfig);
    if (outcome.kind === 'regenerated') return sendRecoveryCodes(reply, outcome.recoveryCodes);
    if (outcome.kind === 'not_enrolled') return sendNotEnrolled(reply);
    return sendFactorFailure(request, reply, outcome);
  });

  app.post('/2fa/disable', { ...rateLimit, preHandler: [requireAdmin, requireCsrfToken] }, async (request, reply) => {
    const parsed = codeAndPasswordSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationFailed(reply);

    const outcome = await disableTwoFactor(pool, request.admin!, parsed.data, currentSessionHash(request), { ipAddress: request.ip }, twoFactorConfig);
    if (outcome.kind === 'disabled') return reply.code(200).send({ ok: true, data: {} });
    if (outcome.kind === 'not_enrolled') return sendNotEnrolled(reply);
    if (outcome.kind === 'forbidden_for_role') {
      return reply.code(403).send({ ok: false, error: { code: 'two_factor_required_for_role', message: 'Seu papel exige verificação em duas etapas; ela não pode ser desativada.' } });
    }
    return sendFactorFailure(request, reply, outcome);
  });
}
