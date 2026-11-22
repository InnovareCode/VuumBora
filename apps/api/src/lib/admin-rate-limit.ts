/**
 * Contador PRÓPRIO por rota do painel que não tem uma classe de limite mais estrita (login, 2FA) e não gasta
 * bcrypt nem manda e-mail — leitura, logout, status, CRUD comum (achado F01-M1 do Órion, rodada 3d, e a revisão
 * 3e que achou o mesmo buraco em `admin-email-settings-route.ts`/`admin-driver-application-route.ts`: toda rota
 * sem `config.rateLimit` próprio cai no limite GLOBAL por bloco /64, compartilhado com QUALQUER outra rota sem
 * cota — martelar uma única rota sem bucket esgota a cota de todas as outras do mesmo bloco).
 *
 * Mesmo teto do global (`GLOBAL_RATE_LIMIT_MAX`) — só o balde muda: fica isolado por ROTA, no /48
 * (`routeRateLimitKey`, igual ao login do admin), não compartilhado com nenhuma outra.
 */
import { env } from '../env.js';
import { routeRateLimitKey } from './ip-bucket.js';

export function adminRouteRateLimit(): { readonly config: { readonly rateLimit: { readonly max: number; readonly timeWindow: string; readonly keyGenerator: (request: { ip: string }) => string } } } {
  return { config: { rateLimit: { max: env.GLOBAL_RATE_LIMIT_MAX, timeWindow: '1 minute', keyGenerator: routeRateLimitKey } } };
}
