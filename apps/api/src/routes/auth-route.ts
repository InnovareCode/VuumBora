/**
 * Rotas de identidade dos apps (passageiro/motorista): `/v1/auth/*`. Só traduz
 * HTTP <-> serviço. Corpo de resposta sempre `{ ok, data }` ou `{ ok:false, error:{ code, message } }`.
 * Mensagens de erro são fixas: nunca ecoam entrada do cliente nem distinguem
 * "e-mail não existe" de "senha errada". Toda resposta sai com `Cache-Control: no-store`.
 * Contrato completo: docs/contrato-identidade-apps.md.
 */
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { loginSchema, normalizeOptionalPhone, refreshSchema, registerSchema } from '../domain/auth.js';
import { checkBirthDate } from '../domain/birth-date.js';
import { makeRequireAccount } from '../hooks/require-account.js';
import { authConfigProblems, loadAuthConfig } from '../lib/auth-config.js';
import { drainBackgroundTasks } from '../lib/background-tasks.js';
import { rateLimitKey } from '../lib/ip-bucket.js';
import { unavailableMailPort, type MailPort } from '../lib/mail-port.js';
import * as identity from '../services/identity-service.js';
import { registerAuthRecoveryRoutes } from './auth-recovery-route.js';
import { contextOf, fail, invalidBody, mailFailureLogger, tooManyAttempts, unavailable } from './auth-http.js';

export interface AuthRoutesOptions {
  /** Adaptador de e-mail (SMTP em produção, fake nos testes). Sem ele, o envio sempre falha (`emailSent: false`). */
  readonly mail?: MailPort | undefined;
}

export function registerAuthRoutes(app: FastifyInstance, options: AuthRoutesOptions = {}): void {
  const config = loadAuthConfig();

  // Resposta de autenticação nunca pode ser guardada por cache (navegador, proxy, CDN).
  app.addHook('onSend', async (request, reply) => {
    if (request.url.startsWith('/v1/auth/')) reply.header('Cache-Control', 'no-store');
  });

  if (!config) {
    // Sem segredos: falha fechada (503), o servidor sobe e o resto da API segue de pé.
    // `reasons`: nomes de variável e motivo, nunca valor (lib/auth-config.ts::authConfigProblems).
    app.log.error({ event: 'auth_unavailable', reason: 'secrets_missing_weak_or_equal', reasons: authConfigProblems() });
    app.all('/v1/auth/*', async (_request, reply) => {
      fail(reply, 503, 'auth_unavailable', 'Autenticação indisponível no momento.');
    });
    return;
  }

  const mail = options.mail ?? unavailableMailPort;
  const requireAccount = makeRequireAccount(config);
  // Esquenta o hash descartável (login de conta desconhecida) fora da thread principal: o primeiro login com e-mail
  // inexistente não pode custar mais que os seguintes (o tempo denunciaria). Falha aqui é ignorada: tenta no primeiro uso.
  identity.getDummyHash(config.bcryptCost).catch(() => undefined);
  // Um balde por IPv4 e por /64 IPv6 (I-5d): sem isto o atacante troca os últimos 64 bits a cada requisição.
  const ipLimit = { config: { rateLimit: { max: config.ipRateLimitMax, timeWindow: config.ipRateLimitWindowMs, keyGenerator: rateLimitKey } } };

  // Envios em segundo plano terminam antes do servidor fechar.
  app.addHook('onClose', async () => drainBackgroundTasks());

  app.post('/v1/auth/register', ipLimit, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      if (field === 'email') return invalidBody(request, reply, 'auth_register_rejected', 'invalid_email', 'E-mail inválido.');
      if (field === 'password') return invalidBody(request, reply, 'auth_register_rejected', 'invalid_password', 'A senha deve ter de 8 a 72 caracteres.');
      if (field === 'birthDate') return invalidBody(request, reply, 'auth_register_rejected', 'invalid_birth_date', 'Informe a data de nascimento no formato AAAA-MM-DD.');
      if (field === 'termsAccepted' || field === 'privacyAccepted') {
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
      const { accountType, fullName, email, password, birthDate } = parsed.data;
      const result = await identity.registerAccount(pool, config, deps, { accountType, fullName, email, password, birthDate, phone: phone.value }, contextOf(request, config));
      if (result.kind === 'consent_unavailable') {
        request.log.error({ event: 'auth_register_unavailable', reason: 'consent_versions_not_configured' });
        return fail(reply, 503, 'consent_unavailable', 'Cadastro indisponível no momento. Tente novamente mais tarde.');
      }
      if (result.kind === 'blocked') {
        request.log.warn({ event: 'auth_register_blocked' });
        return tooManyAttempts(reply, config.registerWindowMinutes * 60);
      }
      request.log.info({ event: 'auth_registered', accountId: result.account.id, accountType: result.account.accountType, emailSent: result.emailSent, reclaimed: result.reclaimed });
      reply.code(201).send({
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
      unavailable(request, reply, err, 'auth_register_failed');
    }
  });

  app.post('/v1/auth/login', ipLimit, async (request, reply) => {
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
      reply.code(200).send({ ok: true, data: result.session });
    } catch (err) {
      unavailable(request, reply, err, 'auth_login_failed_internal');
    }
  });

  registerAuthRecoveryRoutes(app, config, mail, ipLimit);

  app.post('/v1/auth/refresh', ipLimit, async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) return invalidBody(request, reply, 'auth_refresh_rejected');
    try {
      const result = await identity.refresh(pool, config, parsed.data.refreshToken, contextOf(request, config));
      if (result.kind === 'invalid') {
        request.log.info({ event: 'auth_refresh_refused' });
        return fail(reply, 401, 'invalid_refresh_token', 'Sessão expirada. Faça login novamente.');
      }
      reply.code(200).send({ ok: true, data: result.tokens });
    } catch (err) {
      unavailable(request, reply, err, 'auth_refresh_failed_internal');
    }
  });

  app.post('/v1/auth/logout', ipLimit, async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) return invalidBody(request, reply, 'auth_logout_rejected');
    try {
      await identity.logout(pool, parsed.data.refreshToken, contextOf(request, config));
      reply.code(200).send({ ok: true });
    } catch (err) {
      unavailable(request, reply, err, 'auth_logout_failed_internal');
    }
  });

  app.post('/v1/auth/logout-all', { ...ipLimit, preHandler: requireAccount }, async (request, reply) => {
    try {
      const revoked = await identity.logoutAll(pool, request.authAccount!.accountId, contextOf(request, config));
      reply.code(200).send({ ok: true, data: { revokedSessions: revoked } });
    } catch (err) {
      unavailable(request, reply, err, 'auth_logout_all_failed_internal');
    }
  });

  app.get('/v1/auth/me', { preHandler: requireAccount }, async (request, reply) => {
    try {
      const account = await identity.getAccount(pool, request.authAccount!.accountId);
      if (!account) return fail(reply, 401, 'unauthorized', 'Sessão inválida ou expirada.');
      reply.code(200).send({ ok: true, data: account });
    } catch (err) {
      unavailable(request, reply, err, 'auth_me_failed_internal');
    }
  });
}
