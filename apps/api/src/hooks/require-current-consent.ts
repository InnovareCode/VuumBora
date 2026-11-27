/**
 * `requireCurrentConsent`: o ÚNICO preHandler de "aceite pendente" (M-3, contrato em
 * docs/contrato-identidade-apps.md, seção "Reaceite quando a versão muda").
 *
 * USO: só em rota que cria COMPROMISSO NOVO (motorista ficar online, passageiro pedir corrida, aceitar corrida),
 * sempre DEPOIS de `requireAccount`:
 *
 *     const requireCurrentConsent = makeRequireCurrentConsent(loadLegalConfig());
 *     app.post('/v1/...', { preHandler: [requireAccount, requireCurrentConsent] }, handler);
 *
 * NUNCA em rota que mexe em viagem em andamento (posição, concluir, cancelar), exclusão de conta, acesso aos próprios
 * dados, `me`, `consents`, `login`, `refresh`, `logout`: ninguém é jogado para fora no meio de uma corrida, e o reaceite
 * precisa continuar alcançável. Proposta a confirmar com o dono/jurídico; sem prazo de carência.
 *
 * Aceite pendente: `409 consent_outdated` com `error.pending` (`["terms"|"privacy", ...]`) e `error.current` (o corpo de
 * `GET /v1/legal/current`). Textos indisponíveis (sem URL base) ou erro de banco: FALHA FECHADO (503), nunca deixa passar.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../db.js';
import { stopAfterSend } from '../lib/early-reply.js';
import type { LegalConfig } from '../lib/legal-config.js';
import { consentOutdated, consentUnavailable, fail, unavailable } from '../routes/auth-http.js';
import { checkCommitmentConsent } from '../services/legal-service.js';

export interface RequireCurrentConsentOptions {
  /**
   * Quando a MESMA rota tem um lado que cria compromisso e outro que não: o portão só vale se isto devolver `true`.
   * Ex.: `PUT /v1/driver/availability` — ficar online cria compromisso; ficar OFFLINE nunca é bloqueado (R7), nem por
   * aceite pendente. Roda depois do parse do corpo (`preHandler`); corpo inválido segue para a rota, que responde 400.
   */
  readonly onlyWhen?: (request: FastifyRequest) => boolean;
}

export function makeRequireCurrentConsent(legal: LegalConfig | null, options: RequireCurrentConsentOptions = {}) {
  return async function requireCurrentConsent(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (options.onlyWhen && !options.onlyWhen(request)) return;
    const accountId = request.authAccount?.accountId;
    if (!accountId) {
      // Erro de fiação (esqueceram `requireAccount` antes): recusa em vez de deixar a rota aberta.
      request.log.error({ event: 'consent_gate_without_account' });
      fail(reply, 401, 'unauthorized', 'Sessão inválida ou expirada.');
      await stopAfterSend(reply);
      return;
    }
    // Toda recusa abaixo PARA a cadeia (espera o fim da resposta e, se a conexão caiu, assume a resposta): sem isso a
    // rota de compromisso executaria apesar do 409
    // (lib/early-reply.ts; a prova na rota real está em driver-onboarding-routes.test.ts).
    try {
      const gate = await checkCommitmentConsent(pool, legal, accountId);
      if (gate.kind === 'ok') return;
      if (gate.kind === 'unavailable') {
        request.log.error({ event: 'consent_gate_unavailable', reason: 'legal_documents_unavailable' });
        consentUnavailable(reply);
        await stopAfterSend(reply);
        return;
      }
      if (gate.kind === 'account_missing') {
        fail(reply, 401, 'unauthorized', 'Sessão inválida ou expirada.');
        await stopAfterSend(reply);
        return;
      }
      request.log.info({ event: 'consent_pending_blocked', accountId, pending: gate.pending });
      consentOutdated(reply, gate.current, { pending: gate.pending });
      await stopAfterSend(reply);
    } catch (err) {
      unavailable(request, reply, err, 'consent_gate_failed_internal');
      await stopAfterSend(reply);
    }
  };
}
