/**
 * Rotas de identidade dos apps (passageiro/motorista): `/v1/auth/*`. Só traduz
 * HTTP <-> serviço. Corpo de resposta sempre `{ ok, data }` ou `{ ok:false, error:{ code, message } }`.
 * Mensagens de erro são fixas: nunca ecoam entrada do cliente nem distinguem
 * "e-mail não existe" de "senha errada". Toda resposta sai com `Cache-Control: no-store`.
 * Contrato completo: docs/contrato-identidade-apps.md.
 */
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { deleteAccountSchema, loginSchema, normalizeOptionalPhone, refreshSchema, registerSchema } from '../domain/auth.js';
import { checkBirthDate } from '../domain/birth-date.js';
import { makeRequireAccount } from '../hooks/require-account.js';
import { authConfigProblems, loadAuthConfig } from '../lib/auth-config.js';
import { drainBackgroundTasks } from '../lib/background-tasks.js';
import { env } from '../env.js';
import { rateLimitKey } from '../lib/ip-bucket.js';
import { createIpLimits } from '../lib/ip-rate-limits.js';
import { loadLegalConfig, type LegalConfig } from '../lib/legal-config.js';
import { unavailableMailPort, type MailPort } from '../lib/mail-port.js';
import * as identity from '../services/identity-service.js';
import { getConsentStatus } from '../services/legal-service.js';
import { registerAuthConsentRoutes } from './auth-consent-route.js';
import { registerAuthRecoveryRoutes } from './auth-recovery-route.js';
import { consentOutdated, consentUnavailable, contextOf, fail, invalidBody, mailFailureLogger, tooManyAttempts, unavailable } from './auth-http.js';

export interface AuthRoutesOptions {
  /** Adaptador de e-mail (SMTP em produção, fake nos testes). Sem ele, o envio sempre falha (`emailSent: false`). */
  readonly mail?: MailPort | undefined;
  /** Documentos legais (URL base dos textos). Omitido = lê do ambiente; `null` = indisponível (503 `consent_unavailable`). */
  readonly legal?: LegalConfig | null | undefined;
}

export function registerAuthRoutes(app: FastifyInstance, options: AuthRoutesOptions = {}): void {
  const config = loadAuthConfig();

  // Resposta de autenticação nunca pode ser guardada por cache (navegador, proxy, CDN).
  app.addHook('onSend', async (request, reply) => {
    if (request.url.startsWith('/v1/auth/')) reply.header('Cache-Control', 'no-store');
  });

  if (!config) {
    // Sem segredos válidos (ou com custo de bcrypt abaixo do piso de produção): falha fechada (503), o servidor sobe e o resto da API segue de pé.
    // `reasons`: nomes de variável e motivo, nunca valor (lib/auth-config.ts::authConfigProblems).
    app.log.error({ event: 'auth_unavailable', reason: 'config_missing_weak_or_invalid', reasons: authConfigProblems() });
    app.all('/v1/auth/*', async (_request, reply) => {
      return fail(reply, 503, 'auth_unavailable', 'Autenticação indisponível no momento.');
    });
    return;
  }

  const mail = options.mail ?? unavailableMailPort;
  const legal = options.legal === undefined ? loadLegalConfig() : options.legal;
  const requireAccount = makeRequireAccount(config);
  // Esquenta o hash descartável (login de conta desconhecida) fora da thread principal: o primeiro login com e-mail
  // inexistente não pode custar mais que os seguintes (o tempo denunciaria). Falha aqui é ignorada: tenta no primeiro uso.
  identity.getDummyHash(config.bcryptCost).catch(() => undefined);
  // Duas classes de limite por IP (lib/ip-rate-limits.ts): credenciais e códigos têm cota por rota; sessão (refresh, logout, logout-all,
  // reaceite) não gasta bcrypt e vale só o limite global, mais um teto por bloco /48.
  const limits = createIpLimits(app, config);

  // Envios em segundo plano terminam antes do servidor fechar.
  app.addHook('onClose', async () => drainBackgroundTasks());

  app.post('/v1/auth/register', limits.credentials(), async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      if (field === 'email') return invalidBody(request, reply, 'auth_register_rejected', 'invalid_email', 'E-mail inválido.');
      if (field === 'password') return invalidBody(request, reply, 'auth_register_rejected', 'invalid_password', 'A senha deve ter de 8 a 72 caracteres.');
      if (field === 'birthDate') return invalidBody(request, reply, 'auth_register_rejected', 'invalid_birth_date', 'Informe a data de nascimento no formato AAAA-MM-DD.');
      if (field === 'termsAccepted' || field === 'privacyAccepted' || field === 'termsVersion' || field === 'privacyVersion') {
        return invalidBody(request, reply, 'auth_register_rejected', 'consent_required', 'É preciso aceitar os Termos de Uso e a Política de Privacidade.');
      }
      return invalidBody(request, reply, 'auth_register_rejected');
    }
    // Idade mínima (18 anos completos, fuso de Natal). A data NUNCA vai para o log: só o motivo.
    const age = checkBirthDate(parsed.data.birthDate);
    if (!age.ok) {
      request.log.info({ event: 'auth_register_rejected', reason: age.reason === 'underage' ? 'underage' : 'invalid_birth_date' });
      return age.reason === 'underage'
        ? fail(reply, 403, 'underage', 'É preciso ter 18 anos ou mais para criar uma conta.')
        : fail(reply, 400, 'invalid_birth_date', 'Data de nascimento inválida. Use o formato AAAA-MM-DD.');
    }
    const phone = normalizeOptionalPhone(parsed.data.phone);
    if (!phone.ok) return invalidBody(request, reply, 'auth_register_rejected', 'invalid_phone', 'Telefone inválido.');

    try {
      const deps = { mail, onMailFailure: mailFailureLogger(request.log) };
      const { accountType, fullName, email, password, birthDate, termsVersion, privacyVersion } = parsed.data;
      const result = await identity.registerAccount(
        pool, config, legal, deps,
        { accountType, fullName, email, password, birthDate, termsVersion, privacyVersion, phone: phone.value },
        contextOf(request, config),
      );
      if (result.kind === 'consent_unavailable') {
        request.log.error({ event: 'auth_register_unavailable', reason: 'legal_documents_unavailable' });
        return consentUnavailable(reply);
      }
      if (result.kind === 'consent_outdated') {
        request.log.info({ event: 'auth_register_rejected', reason: 'consent_outdated' });
        return consentOutdated(reply, result.current);
      }
      if (result.kind === 'blocked') {
        request.log.warn({ event: 'auth_register_blocked' });
        return tooManyAttempts(reply, config.registerWindowMinutes * 60);
      }
      request.log.info({ event: 'auth_registered', accountId: result.account.id, accountType: result.account.accountType, emailSent: result.emailSent, reclaimed: result.reclaimed });
      return reply.code(201).send({
        ok: true,
        data: {
          account: result.account,
          verification: { required: true, emailSent: result.emailSent, resendAfterSeconds: result.resendAfterSeconds },
        },
      });
    } catch (err) {
      if (err instanceof identity.EmailTakenError) {
        request.log.info({ event: 'auth_register_rejected', reason: 'email_taken' });
        return fail(reply, 409, 'email_taken', 'Este e-mail já está cadastrado.');
      }
      if (err instanceof identity.BirthDateRejectedError) {
        // O servidor já validou: o banco só recusa por virada de dia/bug. Mesma resposta de antes, sem a data.
        request.log.warn({ event: 'auth_register_rejected', reason: `db_${err.reason}` });
        return err.reason === 'underage'
          ? fail(reply, 403, 'underage', 'É preciso ter 18 anos ou mais para criar uma conta.')
          : fail(reply, 400, 'invalid_birth_date', 'Data de nascimento inválida. Use o formato AAAA-MM-DD.');
      }
      return unavailable(request, reply, err, 'auth_register_failed');
    }
  });

  app.post('/v1/auth/login', limits.credentials(), async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return invalidBody(request, reply, 'auth_login_rejected');
    try {
      const result = await identity.login(pool, config, parsed.data, contextOf(request, config));
      if (result.kind === 'blocked') {
        request.log.warn({ event: 'auth_login_blocked' });
        return tooManyAttempts(reply, result.retryAfterSeconds);
      }
      if (result.kind === 'invalid_credentials') {
        request.log.info({ event: 'auth_login_failed' });
        return fail(reply, 401, 'invalid_credentials', 'E-mail/ID ou senha incorretos.');
      }
      if (result.kind === 'email_not_verified') {
        request.log.info({ event: 'auth_login_email_not_verified' });
        return fail(reply, 403, 'email_not_verified', 'Confirme seu e-mail para entrar.');
      }
      request.log.info({ event: 'auth_login_succeeded', accountId: result.session.account.id });
      return reply.code(200).send({ ok: true, data: result.session });
    } catch (err) {
      return unavailable(request, reply, err, 'auth_login_failed_internal');
    }
  });

  registerAuthRecoveryRoutes(app, config, mail, limits.credentials);

  app.post('/v1/auth/refresh', limits.session(), async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    // Código PRÓPRIO (não o genérico `invalid_body`): é a assinatura que o app lê para saber que o refresh guardado está malformado e a sessão acabou. Um 4xx de
    // transporte (413, 415, corpo ilegível) sai como `invalid_body` (app.ts) e NÃO encerra sessão nenhuma.
    //
    // Q2 da passada 6 da Íris: `invalid_refresh_body` só vale quando o corpo CHEGOU como objeto JSON válido e falhou
    // SÓ no formato do `refreshToken` em si (o caso real: o app leu um token corrompido do armazenamento) — é a
    // única situação em que faz sentido tratar como "sessão encerrada". Corpo que nem chegou a ser um objeto (sem
    // corpo e sem `Content-Type`, ou `text/plain`: `request.body` vira `undefined`/string, nunca um objeto) não prova
    // nada sobre o token guardado; um intermediário que mudasse o tipo do corpo ou o removesse não pode derrubar a
    // sessão por engano. Esses casos caem no `invalid_body` genérico, que o app trata como transitório.
    if (!parsed.success) {
      const isJsonObjectBody = typeof request.body === 'object' && request.body !== null && !Array.isArray(request.body);
      return invalidBody(request, reply, 'auth_refresh_rejected', isJsonObjectBody ? 'invalid_refresh_body' : 'invalid_body');
    }
    try {
      const result = await identity.refresh(pool, config, parsed.data.refreshToken, contextOf(request, config));
      if (result.kind === 'invalid') {
        request.log.info({ event: 'auth_refresh_refused' });
        return fail(reply, 401, 'invalid_refresh_token', 'Sessão expirada. Faça login novamente.');
      }
      return reply.code(200).send({ ok: true, data: result.tokens });
    } catch (err) {
      return unavailable(request, reply, err, 'auth_refresh_failed_internal');
    }
  });

  app.post('/v1/auth/logout', limits.session(), async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) return invalidBody(request, reply, 'auth_logout_rejected');
    try {
      await identity.logout(pool, parsed.data.refreshToken, contextOf(request, config));
      return reply.code(200).send({ ok: true });
    } catch (err) {
      return unavailable(request, reply, err, 'auth_logout_failed_internal');
    }
  });

  app.post('/v1/auth/logout-all', { ...limits.session(), preHandler: requireAccount }, async (request, reply) => {
    try {
      const revoked = await identity.logoutAll(pool, request.authAccount!.accountId, contextOf(request, config));
      return reply.code(200).send({ ok: true, data: { revokedSessions: revoked } });
    } catch (err) {
      return unavailable(request, reply, err, 'auth_logout_all_failed_internal');
    }
  });

  registerAuthConsentRoutes(app, config, legal, limits.session, requireAccount);

  // Exclusão de conta (item 3 das pendências jurídicas): reautentica por senha (gasta bcrypt — mesma classe de limite
  // de login/cadastro) e, só se ela confere, anonimiza a conta e revoga toda sessão. Nunca bloqueada por aceite
  // pendente (não é "compromisso novo": é o oposto, encerrar a conta) — por isso não leva `requireCurrentConsent`.
  app.post('/v1/auth/delete-account', { ...limits.credentials(), preHandler: requireAccount }, async (request, reply) => {
    const parsed = deleteAccountSchema.safeParse(request.body);
    if (!parsed.success) return invalidBody(request, reply, 'auth_delete_account_rejected');
    try {
      const result = await identity.deleteAccount(pool, config, request.authAccount!.accountId, parsed.data.password, contextOf(request, config));
      if (result.kind === 'blocked') {
        request.log.warn({ event: 'auth_delete_account_blocked' });
        return tooManyAttempts(reply, result.retryAfterSeconds);
      }
      if (result.kind === 'wrong_password') {
        request.log.info({ event: 'auth_delete_account_failed' });
        // 403 (não 401, decisão do Atlas em 22/11/2026, conferência PP-12 da Nova): 401 colidia com "token de acesso
        // inválido" no cliente — o SessionManager renovava a sessão e repetia a chamada, a senha errada era
        // conferida duas vezes, e a repetição automática chegava dentro da espera progressiva do par conta+IP,
        // virando `429 too_many_attempts` em vez de "senha incorreta". Mesmo desenho de `403 email_not_verified`
        // (acima) e do painel admin.
        return fail(reply, 403, 'wrong_password', 'Senha incorreta.');
      }
      if (result.kind === 'account_missing') return fail(reply, 401, 'unauthorized', 'Sessão inválida ou expirada.');
      request.log.info({ event: 'auth_account_deleted', accountId: request.authAccount!.accountId });
      return reply.code(200).send({ ok: true, data: { accountDeleted: true } });
    } catch (err) {
      return unavailable(request, reply, err, 'auth_delete_account_failed_internal');
    }
  });

  app.get('/v1/auth/me', {
    preHandler: requireAccount,
    // Mesmo motivo do F01-M1 em `/v1/legal/current` (achado do Órion, rodada 3d): contador PRÓPRIO, separado do
    // global que `refresh`/`logout`/`logout-all`/`consents` usam de propósito. `/me` é chamado toda vez que o app
    // abre em primeiro plano; sem isolamento, muitas contas no MESMO /64 chamando `/me` esgotavam a cota de
    // renovação de sessão dos vizinhos daquele bloco. Mesmo número do padrão global (100/min por /64).
    config: { rateLimit: { max: env.GLOBAL_RATE_LIMIT_MAX, timeWindow: '1 minute', keyGenerator: rateLimitKey } },
  }, async (request, reply) => {
    try {
      const accountId = request.authAccount!.accountId;
      const account = await identity.getAccount(pool, accountId);
      if (!account) return fail(reply, 401, 'unauthorized', 'Sessão inválida ou expirada.');
      // Aceite pendente (M-3): uma consulta a `legal_pending_for_account`. `null` = textos indisponíveis por configuração
      // (o boot já avisou): o app não consegue mostrar reaceite, mas a sessão continua funcionando.
      const status = await getConsentStatus(pool, legal, accountId);
      if (status.kind === 'account_missing') return fail(reply, 401, 'unauthorized', 'Sessão inválida ou expirada.');
      return reply.code(200).send({ ok: true, data: { ...account, consent: status.kind === 'ok' ? status.status : null } });
    } catch (err) {
      return unavailable(request, reply, err, 'auth_me_failed_internal');
    }
  });
}
