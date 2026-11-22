/**
 * Documentos legais publicados: `GET /v1/legal/current?audience=passenger|driver` (SEM sessão; o app o chama antes do
 * cadastro). Devolve a versão vigente dos DOIS documentos do perfil, com o SHA-256 do arquivo exato e a URL do texto.
 * Só leitura do catálogo (a API não tem INSERT lá: quem publica é o operador, `npm run legal:publish`).
 * Contrato: docs/contrato-identidade-apps.md.
 */
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { legalCurrentQuerySchema } from '../domain/legal.js';
import { CurrentLegalCache } from '../lib/current-legal-cache.js';
import { env } from '../env.js';
import { rateLimitKey } from '../lib/ip-bucket.js';
import { legalConfigProblems, type LegalConfig } from '../lib/legal-config.js';
import { loadCurrentLegal } from '../services/legal-service.js';
import { consentUnavailable, invalidBody, unavailable } from './auth-http.js';

export function registerLegalRoutes(app: FastifyInstance, legal: LegalConfig | null): void {
  if (!legal) {
    // Nomes de variável e motivo, nunca valor. Sem a URL base não há como mostrar o texto: falha fechada (503).
    app.log.error({ event: 'legal_unavailable', reason: 'legal_config_missing_or_invalid', reasons: legalConfigProblems() });
  }

  // Uma consulta ao banco por perfil a cada `LEGAL_CACHE_MAX_AGE_SECONDS`, não uma por pedido (B-3): o endpoint é público.
  const cache = new CurrentLegalCache(legal ? legal.cacheMaxAgeSeconds * 1000 : 0);

  app.get('/v1/legal/current', {
    // Contador PRÓPRIO desta rota (achado F01-M1 do Órion, rodada 3d): sem isto, por não declarar `config.rateLimit`,
    // ela caía no MESMO contador GLOBAL (por /64) que `refresh`/`logout`/`logout-all`/`consents` também usam de
    // propósito (a classe "sessão" não tem cota por ROTA — só o global, `lib/ip-rate-limits.ts`). Como esta rota é
    // PÚBLICA (sem sessão, sem bcrypt, qualquer um chama), martelar `/legal/current` esgotava, para todo o /64, a
    // cota que a renovação de sessão de QUALQUER CONTA daquele bloco precisa — um 429 na hora errada desconecta gente
    // que não tem nada a ver com quem martelou. Mesmo número do padrão global (`GLOBAL_RATE_LIMIT_MAX`, 100/min por
    // /64): o volume não muda, só o BALDE, que passa a ser só dela (o cache de 60 s, `CurrentLegalCache`, já evita
    // que o volume vire custo de banco).
    config: { rateLimit: { max: env.GLOBAL_RATE_LIMIT_MAX, timeWindow: '1 minute', keyGenerator: rateLimitKey } },
  }, async (request, reply) => {
    const parsed = legalCurrentQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.header('Cache-Control', 'no-store');
      return invalidBody(request, reply, 'legal_current_rejected');
    }
    try {
      const result = await cache.get(parsed.data.audience, () => loadCurrentLegal(pool, legal, parsed.data.audience));
      if (result.kind === 'unavailable' || !legal) {
        request.log.error({ event: 'legal_current_unavailable', reason: result.kind === 'unavailable' ? result.reason : 'not_configured', audience: parsed.data.audience });
        return consentUnavailable(reply);
      }
      // A vigente muda só quando o operador publica; o 409 `consent_outdated` já traz `error.current`, então um cache velho se corrige sozinho.
      reply.header('Cache-Control', `public, max-age=${legal.cacheMaxAgeSeconds}`);
      reply.code(200).send({ ok: true, data: result.current });
    } catch (err) {
      reply.header('Cache-Control', 'no-store');
      unavailable(request, reply, err, 'legal_current_failed_internal');
    }
  });
}
