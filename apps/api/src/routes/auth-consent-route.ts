/**
 * Reaceite dos Termos e da Política: `POST /v1/auth/consents` (Bearer). O app envia as versões que EXIBIU; cada uma tem
 * de ser a vigente do perfil da conta (senão 409 `consent_outdated` com `error.current`, e nada é gravado). Idempotente:
 * reaceitar a mesma versão devolve 200 sem duplicar. Nunca bloqueado por aceite pendente (é a saída dele).
 * Contrato: docs/contrato-identidade-apps.md.
 */
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { pool } from '../db.js';
import { consentsBodySchema } from '../domain/legal.js';
import type { AuthConfig } from '../lib/auth-config.js';
import type { IpLimitRouteOptions } from '../lib/ip-rate-limits.js';
import type { LegalConfig } from '../lib/legal-config.js';
import { acceptConsents } from '../services/legal-service.js';
import { consentOutdated, consentUnavailable, contextOf, fail, invalidBody, unavailable } from './auth-http.js';

export function registerAuthConsentRoutes(
  app: FastifyInstance,
  config: AuthConfig,
  legal: LegalConfig | null,
  /** Fábrica da classe "sessão" (lib/ip-rate-limits.ts): o reaceite não gasta bcrypt e tem Bearer; vale o limite global. */
  ipLimit: () => IpLimitRouteOptions,
  requireAccount: preHandlerAsyncHookHandler,
): void {
  app.post('/v1/auth/consents', { ...ipLimit(), preHandler: requireAccount }, async (request, reply) => {
    const parsed = consentsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      // Problema numa das versões (ausente nas duas, tipo errado, formato inválido) = o app não disse o que exibiu.
      const field = parsed.error.issues[0]?.path[0];
      if (field === 'termsVersion' || field === 'privacyVersion') {
        return invalidBody(request, reply, 'auth_consents_rejected', 'consent_required', 'Informe a versão dos Termos e/ou da Política que foi exibida.');
      }
      return invalidBody(request, reply, 'auth_consents_rejected');
    }
    try {
      const result = await acceptConsents(pool, legal, {
        accountId: request.authAccount!.accountId,
        termsVersion: parsed.data.termsVersion,
        privacyVersion: parsed.data.privacyVersion,
        ipHash: contextOf(request, config).ipHash,
      });
      if (result.kind === 'unavailable') {
        request.log.error({ event: 'auth_consents_unavailable', reason: 'legal_documents_unavailable' });
        return consentUnavailable(reply);
      }
      if (result.kind === 'account_missing') return fail(reply, 401, 'unauthorized', 'Sessão inválida ou expirada.');
      if (result.kind === 'outdated') {
        request.log.info({ event: 'auth_consents_rejected', reason: 'consent_outdated' });
        return consentOutdated(reply, result.current);
      }
      request.log.info({ event: 'auth_consents_accepted', accountId: request.authAccount!.accountId, upToDate: result.status.upToDate });
      return reply.code(200).send({ ok: true, data: { consent: result.status } });
    } catch (err) {
      return unavailable(request, reply, err, 'auth_consents_failed_internal');
    }
  });
}
