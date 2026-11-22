/**
 * Rotas HTTP da configuração SMTP (papel `dono`). Só traduz requisição/resposta;
 * a regra mora em `admin-email-settings-service.ts`. Caminhos relativos a `/v1/admin`.
 * Só GET/POST: o CORS do admin (app.ts) libera só esses métodos.
 *
 * Salvar e remover a senha exigem reautenticação (`stepUp`: senha atual + código
 * TOTP do dono) — revisão S1 rodada 2, I-2. Contrato: docs/contrato-admin-email.md.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { removePasswordSchema, saveSettingsSchema, testEmailSchema } from '../domain/email-settings.js';
import { pool } from '../db.js';
import { requireAdminRole, requireCsrfToken } from '../hooks/require-admin.js';
import { adminRouteRateLimit } from '../lib/admin-rate-limit.js';
import { twoFactorConfig } from '../lib/two-factor-config.js';
import {
  getEmailSettings,
  removeSavedPassword,
  saveEmailSettings,
  sendTestEmail,
  TEST_EMAIL_LIMIT_PER_HOUR,
  type EmailSettingsContext,
  type StepUpFailure,
} from '../services/admin-email-settings-service.js';
import { createSmtpMailer } from '../services/mailer.js';
import { sendFactorFailure } from './admin-auth-http.js';

const requireOwner = requireAdminRole('dono');
const requireOwnerMutation = [requireOwner, requireCsrfToken];

function sendValidationFailed(reply: FastifyReply, fields: readonly string[]): void {
  reply.code(400).send({ ok: false, error: { code: 'validation_failed', message: 'Dados inválidos.', fields } });
}

/** `stepUp.password` vira `stepUp` (o cliente só precisa saber QUAL bloco falhou, não o subcampo). */
function fieldsOf(issues: readonly { path: readonly PropertyKey[] }[]): string[] {
  return [...new Set(issues.map((issue) => String(issue.path[0] ?? '')))];
}

/** A chave de cifra é a mesma do 2FA (ADMIN_TOTP_ENCRYPTION_KEY), com AAD próprio. */
function contextOf(request: FastifyRequest): EmailSettingsContext {
  return { encryptionKey: twoFactorConfig.encryptionKey, ipAddress: request.ip, twoFactor: twoFactorConfig, log: request.log };
}

/** Falha da reautenticação: os mesmos códigos do restante do painel (`password_invalid`, `invalid_second_factor`, `account_locked`...). */
function sendStepUpFailure(request: FastifyRequest, reply: FastifyReply, failure: StepUpFailure): void {
  if (failure.kind === 'not_enrolled') {
    reply.code(409).send({ ok: false, error: { code: 'two_factor_not_enrolled', message: 'Ative a verificação em duas etapas antes de alterar o e-mail.' } });
    return;
  }
  sendFactorFailure(request, reply, failure);
}

export function registerAdminEmailSettingsRoutes(app: FastifyInstance): void {
  app.get('/settings/email', { ...adminRouteRateLimit(), preHandler: requireOwner }, async (request, reply) => {
    reply.code(200).send({ ok: true, data: await getEmailSettings(pool, contextOf(request)) });
  });

  app.post('/settings/email', { ...adminRouteRateLimit(), preHandler: requireOwnerMutation }, async (request, reply) => {
    const parsed = saveSettingsSchema.safeParse(request.body ?? {});
    if (!parsed.success) return sendValidationFailed(reply, fieldsOf(parsed.error.issues));

    const outcome = await saveEmailSettings(pool, request.admin!, parsed.data, contextOf(request));
    if (outcome.kind === 'step_up_failed') return sendStepUpFailure(request, reply, outcome.failure);
    if (outcome.kind === 'host_blocked') {
      return reply.code(422).send({ ok: false, error: { code: 'smtp_host_blocked', message: 'Este servidor aponta para uma rede interna ou endereço reservado e não é permitido.' } });
    }
    if (outcome.kind === 'encryption_unavailable') {
      return reply.code(503).send({ ok: false, error: { code: 'encryption_unavailable', message: 'O servidor não tem a chave de cifra configurada; não é possível guardar a senha no painel. Use a variável SMTP_PASS.' } });
    }
    reply.code(200).send({ ok: true, data: outcome.view });
  });

  app.post('/settings/email/password/remove', { ...adminRouteRateLimit(), preHandler: requireOwnerMutation }, async (request, reply) => {
    const parsed = removePasswordSchema.safeParse(request.body ?? {});
    if (!parsed.success) return sendValidationFailed(reply, fieldsOf(parsed.error.issues));

    const outcome = await removeSavedPassword(pool, request.admin!, parsed.data.stepUp, contextOf(request));
    if (outcome.kind === 'step_up_failed') return sendStepUpFailure(request, reply, outcome.failure);
    reply.code(200).send({ ok: true, data: outcome.view });
  });

  app.post('/settings/email/test', { ...adminRouteRateLimit(), preHandler: requireOwnerMutation }, async (request, reply) => {
    const parsed = testEmailSchema.safeParse(request.body ?? {});
    if (!parsed.success) return sendValidationFailed(reply, ['to']);

    const context = contextOf(request);
    const mailer = createSmtpMailer({ pool, encryptionKey: context.encryptionKey, log: request.log });
    const outcome = await sendTestEmail(pool, request.admin!, parsed.data.to, context, mailer);

    switch (outcome.kind) {
      case 'sent':
        return reply.code(200).send({ ok: true, data: { delivered: true, to: outcome.to } });
      case 'rate_limited':
        return reply
          .code(429)
          .header('Retry-After', String(outcome.retryAfterSeconds))
          .send({ ok: false, error: { code: 'test_email_rate_limited', message: `Limite de ${TEST_EMAIL_LIMIT_PER_HOUR} e-mails de teste por hora atingido.`, retryAfterSeconds: outcome.retryAfterSeconds } });
      case 'not_configured':
        return reply.code(409).send({ ok: false, error: { code: 'email_not_configured', message: 'Configure servidor, porta e remetente antes de testar.', missing: outcome.missing } });
      case 'failed': {
        const status = outcome.error.kind === 'blocked_host' ? 422 : 502;
        const code = outcome.error.kind === 'blocked_host' ? 'smtp_host_blocked' : 'smtp_delivery_failed';
        return reply.code(status).send({
          ok: false,
          // `serverMessage` é o texto exato do servidor SMTP (ou do erro de conexão), para o dono corrigir.
          error: { code, message: 'O envio de teste falhou.', details: { kind: outcome.error.kind, serverMessage: outcome.error.message, ...outcome.error.details } },
        });
      }
    }
  });
}
