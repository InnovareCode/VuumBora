/** Helpers HTTP compartilhados pelas rotas da identidade dos apps (`/v1/auth/*`). */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { userAgentFamily } from '../domain/auth.js';
import type { CurrentLegal } from '../domain/legal.js';
import type { AuthConfig } from '../lib/auth-config.js';
import { BCRYPT_BUSY_RETRY_AFTER_SECONDS, BcryptBusyError } from '../lib/bcrypt-pool.js';
import type { MailDeps } from '../services/code-delivery.js';
import { describeErrorForLog } from '../lib/safe-error.js';
import { ipBucket, ipBucket48 } from '../lib/ip-bucket.js';
import { hmacHex } from '../lib/token-crypto.js';
import type { RequestContext } from '../services/identity-service.js';

export interface ErrorExtras { readonly [key: string]: unknown }

export function fail(reply: FastifyReply, status: number, code: string, message: string, extras: ErrorExtras = {}): void {
  reply.code(status).send({ ok: false, error: { code, message, ...extras } });
}

export function invalidBody(request: FastifyRequest, reply: FastifyReply, event: string, code = 'invalid_body', message = 'Corpo da requisição inválido.'): void {
  request.log.info({ event, reason: code });
  fail(reply, 400, code, message);
}

export function contextOf(request: FastifyRequest, config: AuthConfig): RequestContext {
  const userAgent = request.headers['user-agent'];
  return {
    // Balde (/64 no IPv6), não o endereço: o limite por IP não pode ser driblado trocando os últimos 64 bits.
    ipHash: request.ip ? hmacHex(config.pepper, ipBucket(request.ip)) : null,
    // Balde GROSSO (/48 no IPv6) para a justiça da fila do bcrypt (M-1). Sempre preenchido: IP desconhecido é UM balde, não "sem limite".
    bcryptOrigin: hmacHex(config.pepper, `bcrypt-origin:${request.ip ? ipBucket48(request.ip) : '-'}`),
    userAgentFamily: userAgentFamily(typeof userAgent === 'string' ? userAgent : undefined),
    requestId: String(request.id),
  };
}

/**
 * 503 de pista cheia: o servidor está bem, só não há vaga de bcrypt agora (A-1, rodada 3). Código próprio (`server_busy`)
 * e `Retry-After`: o app mostra "tente de novo em instantes" em vez de tratar como queda. Nada foi comparado nem gasto.
 */
export function serverBusy(request: FastifyRequest, reply: FastifyReply, lane: string): void {
  request.log.warn({ event: 'bcrypt_busy', lane });
  reply.header('Retry-After', String(BCRYPT_BUSY_RETRY_AFTER_SECONDS));
  fail(reply, 503, 'server_busy', 'Muitas solicitações no momento. Tente novamente em alguns segundos.', { retryAfterSeconds: BCRYPT_BUSY_RETRY_AFTER_SECONDS });
}

export function unavailable(request: FastifyRequest, reply: FastifyReply, err: unknown, event: string): void {
  if (err instanceof BcryptBusyError) return serverBusy(request, reply, err.lane);
  request.log.error({ event, ...describeErrorForLog(err) });
  fail(reply, 503, 'unavailable', 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.');
}

/**
 * 409 de aceite desatualizado (M-3): o app exibiu (ou a conta aceitou) uma versão que não é mais a vigente. `error.current` é o
 * MESMO corpo de `GET /v1/legal/current`, para o app mostrar o texto atual sem outra chamada. Nunca vai para cache.
 */
export function consentOutdated(reply: FastifyReply, current: CurrentLegal, extras: ErrorExtras = {}): void {
  reply.header('Cache-Control', 'no-store');
  fail(reply, 409, 'consent_outdated', 'Os Termos ou a Política mudaram. Leia a versão atual e aceite de novo.', { ...extras, current });
}

/** 503 de documentos legais indisponíveis (sem URL base dos textos ou sem versão publicada). Mensagem fixa; o motivo vai só para o log. */
export function consentUnavailable(reply: FastifyReply): void {
  reply.header('Cache-Control', 'no-store');
  fail(reply, 503, 'consent_unavailable', 'Os Termos e a Política estão indisponíveis no momento. Tente novamente mais tarde.');
}

/** 429 padrão: mensagem fixa, `Retry-After` (em segundos) e o mesmo número no corpo (`retryAfterSeconds`). */
export function tooManyAttempts(reply: FastifyReply, retryAfterSeconds: number): void {
  reply.header('Retry-After', String(retryAfterSeconds));
  fail(reply, 429, 'too_many_attempts', 'Muitas tentativas. Aguarde um pouco antes de tentar de novo.', { retryAfterSeconds });
}

/** Falha de envio: loga só o evento e nome/código do erro (nunca a mensagem, o destinatário nem o texto). */
export function mailFailureLogger(log: FastifyRequest['log']): MailDeps['onMailFailure'] {
  return (kind, err) => log.error({ event: 'auth_mail_send_failed', purpose: kind, ...describeErrorForLog(err) });
}
