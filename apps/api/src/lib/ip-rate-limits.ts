/**
 * Limites por IP das rotas da identidade dos apps (`/v1/auth/*`), em duas classes (valores e motivo em `lib/auth-config.ts`):
 *
 *  - `credentials`: rotas que gastam bcrypt ou mandam e-mail. Cota por rota por endereço IPv4 ou /64 IPv6 (`ipRateLimitMax`) e,
 *    só para IPv6, um TETO por /48 (`ipRateLimitBlockMax`, mais alto) que vale por rota. O /64 sozinho como chave deixaria um
 *    bloco /48 gratuito render 65 536 cotas; o /48 sozinho faria os assinantes de um mesmo bloco de operadora dividirem UMA cota.
 *  - `session`: refresh, logout, logout-all e reaceite. SEM cota por rota (não gastam bcrypt; o refresh token tem 256 bits): valem o
 *    limite GLOBAL (por /64) e o teto por /48 de 1 minuto (`sessionBlockRateLimitMax`), que só existe para o bloco inteiro.
 *
 * `@fastify/rate-limit` aceita UMA chave por rota, então o teto do /48 é um segundo limitador (`createRateLimit`) em hook
 * próprio, criado UMA vez por rota (cada rota tem os seus contadores, como a cota por endereço sempre teve).
 *
 * O teto roda em `preValidation`, DEPOIS do `onRequest` do plugin (cota por endereço ou global): o pedido que a cota do /64 já
 * recusou não chega a ser contado no teto. Sem isso um /64 abusivo gastaria o teto do bloco inteiro e os vizinhos pagariam por ele.
 * Um corpo que nem parseia (JSON ilegível, grande demais) é recusado antes e também não conta: não custa banco nem bcrypt.
 */
import type { FastifyInstance, preValidationAsyncHookHandler } from 'fastify';
import type { AuthConfig } from './auth-config.js';
import { ipBucket, ipBucket48, rateLimitKey, routeRateLimitKey } from './ip-bucket.js';

const SESSION_BLOCK_WINDOW_MS = 60_000;

/** O que se espalha nas opções de uma rota: a cota por endereço (quando existe) e o teto do bloco. */
export interface IpLimitRouteOptions {
  readonly config?: { readonly rateLimit: { readonly max: number; readonly timeWindow: number; readonly keyGenerator: (request: { ip: string }) => string } };
  readonly preValidation: preValidationAsyncHookHandler;
}

/** Uma fábrica por classe: cada chamada devolve opções NOVAS (contadores próprios para a rota que vai usá-las). */
export interface IpLimits {
  readonly credentials: () => IpLimitRouteOptions;
  readonly session: () => IpLimitRouteOptions;
}

/** IPv4 e lixo têm o mesmo balde fino e grosso (o endereço): só o IPv6 tem um /48 distinto do /64. */
function isIpv6Block(ip: string): boolean {
  return ipBucket(ip) !== ipBucket48(ip);
}

/** O 429 que o `setErrorHandler` do app traduz em `{ ok:false, error:{ code:'rate_limited' } }` (nunca o texto do plugin). */
function rateLimitedError(): Error & { statusCode: number } {
  return Object.assign(new Error('rate limited'), { statusCode: 429 });
}

function blockCeiling(app: FastifyInstance, max: number, timeWindowMs: number): preValidationAsyncHookHandler {
  const limit = app.createRateLimit({ max, timeWindow: timeWindowMs, keyGenerator: routeRateLimitKey });
  return async (request, reply) => {
    if (!isIpv6Block(request.ip)) return;
    const result = await limit(request);
    if (result.isAllowed || !result.isExceeded) return;
    reply.header('retry-after', String(result.ttlInSeconds));
    throw rateLimitedError();
  };
}

export function createIpLimits(app: FastifyInstance, config: AuthConfig): IpLimits {
  return {
    credentials: () => ({
      config: { rateLimit: { max: config.ipRateLimitMax, timeWindow: config.ipRateLimitWindowMs, keyGenerator: rateLimitKey } },
      preValidation: blockCeiling(app, config.ipRateLimitBlockMax, config.ipRateLimitWindowMs),
    }),
    // Sem `config.rateLimit`: o plugin aplica o limite global à rota.
    session: () => ({ preValidation: blockCeiling(app, config.sessionBlockRateLimitMax, SESSION_BLOCK_WINDOW_MS) }),
  };
}
