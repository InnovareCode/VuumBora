/** `preHandler` reutilizável — qualquer rota admin que exige sessão válida usa este hook, nunca reimplementa a checagem. */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../db.js';
import { env } from '../env.js';
import { ADMIN_SESSION_COOKIE, type AdminRole, type AdminUser } from '../domain/admin.js';
import { refuseAndStop } from '../lib/early-reply.js';
import { resolveAdminSession } from '../services/admin-auth-service.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Presente só depois de `requireAdmin` ter passado (nunca antes). */
    admin?: AdminUser;
    /** Token sincronizador de CSRF da sessão atual — ver `requireCsrfToken`, abaixo. `null` para sessão criada antes da migração 0009. */
    adminCsrfToken?: string | null;
  }
}

// As recusas ESPERAM a resposta terminar (lib/early-reply.ts): hoje o contexto do painel não tem `onSend` assíncrono e o
// `send()` termina na hora, mas um `onSend` async novo faria o handler rodar apesar do 401/403 (o papel e o CSRF
// deixariam de proteger a ação).
async function sendUnauthorized(reply: FastifyReply, message: string): Promise<void> {
  await refuseAndStop(reply, 401, { ok: false, error: { code: 'unauthorized', message } });
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const rawToken = request.cookies[ADMIN_SESSION_COOKIE];
  if (!rawToken) {
    await sendUnauthorized(reply, 'Faça login para continuar.');
    return;
  }

  const resolved = await resolveAdminSession(pool, rawToken, env.ADMIN_SESSION_TTL_HOURS);
  if (!resolved) {
    // Cookie presente mas sessão inválida/expirada: limpa o cookie velho —
    // sem isso o navegador insiste em mandar um token morto em toda requisição.
    reply.clearCookie(ADMIN_SESSION_COOKIE, { path: '/' });
    await sendUnauthorized(reply, 'Sessão expirada. Faça login novamente.');
    return;
  }

  request.admin = resolved.admin;
  request.adminCsrfToken = resolved.csrfToken;
}

async function sendForbidden(reply: FastifyReply): Promise<void> {
  await refuseAndStop(reply, 403, { ok: false, error: { code: 'forbidden', message: 'Seu papel não tem acesso a este recurso.' } });
}

/**
 * Fábrica de `preHandler` — exige sessão válida (via `requireAdmin`) E que
 * `request.admin.role` esteja entre os papéis passados. Única forma de
 * restringir rota por papel: antes desta função, toda rota só checava
 * sessão, então qualquer papel autenticado acessava qualquer rota admin
 * (achado do Órion). Uso: `{ preHandler: requireAdminRole('dono', 'operacao') }`.
 */
export function requireAdminRole(...allowedRoles: readonly AdminRole[]) {
  return async function requireAdminRoleHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await requireAdmin(request, reply);
    if (reply.sent) return; // `requireAdmin` já respondeu 401 — não segue para a checagem de papel.

    if (!allowedRoles.includes(request.admin!.role)) {
      await sendForbidden(reply);
    }
  };
}

const CSRF_HEADER = 'x-csrf-token';

/** Compara em tempo constante quando os dois valores têm o MESMO tamanho (tamanho do token é fixo e público — vazar isso não ajuda um ataque). Tamanhos diferentes já não batem, sem precisar olhar o conteúdo. */
function csrfTokensMatch(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

async function sendInvalidCsrf(reply: FastifyReply): Promise<void> {
  await refuseAndStop(reply, 403, { ok: false, error: { code: 'csrf_token_invalid', message: 'Token CSRF ausente ou inválido.' } });
}

/**
 * `preHandler` obrigatório em toda rota que MUTA estado (`/v1/admin/*`
 * aprovação/recusa, e qualquer mutação futura). Tem que vir DEPOIS de
 * `requireAdmin`/`requireAdminRole` na lista de `preHandler` da rota —
 * depende de `request.adminCsrfToken`, só preenchido por eles.
 *
 * Defesa escolhida: token sincronizador por sessão (não é o "double-submit
 * cookie" clássico). Por quê: painel (`admin.vuumbora.com.br`) e API
 * (`api.vuumbora.com.br`) são subdomínios do MESMO site registrável, então
 * é tráfego "same-site" — `SameSite=Lax` no cookie de sessão NÃO o
 * bloqueia, mesmo vindo de um subdomínio-irmão comprometido (ex.: XSS numa
 * área menos crítica do site). Um cookie CSRF lido via JavaScript teria o
 * MESMO problema: se tivesse `Domain=.vuumbora.com.br` para o painel
 * conseguir lê-lo, o subdomínio comprometido leria também, e a defesa não
 * defenderia nada.
 *
 * Por isso o token (gerado em `admin-auth-service.ts::loginAdmin`, uma
 * string aleatória por SESSÃO, nunca derivada do cookie) só sai pelo CORPO
 * da resposta de `admin.login`/`GET /v1/admin/me` — nunca em cookie. Ler
 * esse corpo cross-origin exige que o CORS da API aprove a origem de quem
 * chamou COM credenciais.
 *
 * ACHADO DO ÓRION (auditoria "Rodada 3") que corrigiu esta premissa: a
 * primeira versão desta defesa usava a MESMA lista de origem
 * (`ALLOWED_ORIGINS`) e o MESMO registro de `@fastify/cors` para TODA
 * rota, inclusive as públicas — e o site público (`www.vuumbora.com.br`,
 * formulário aberto a qualquer terceiro) PRECISA estar numa lista de CORS
 * por outro motivo legítimo (`/v1/waitlist`, `/v1/driver-applications`).
 * Um XSS no site, então, ganhava `credentials:true` de brinde e conseguia
 * `fetch('/v1/admin/me', {credentials:'include'})` e ler o `csrfToken` do
 * corpo — a defesa inteira furada pela origem mais exposta do sistema.
 *
 * Correção (`app.ts`): dois registros SEPARADOS e ENCAPSULADOS de
 * `@fastify/cors` — rotas públicas com `credentials:false` sempre (não
 * usam cookie, não importa quem esteja em `ALLOWED_ORIGINS`), rotas
 * `/v1/admin/*` com `credentials:true` só para origem em
 * `ADMIN_ALLOWED_ORIGINS`, uma lista SEPARADA e fechada (nunca o domínio
 * do site público). Agora a premissa é verdadeira de novo: uma origem
 * fora de `ADMIN_ALLOWED_ORIGINS` — inclusive o site público — nunca
 * recebe o corpo da resposta com credenciais, então nunca lê o token. Só
 * pode disparar a requisição mutante (o cookie de sessão viaja sozinho,
 * same-site), mas não sabe qual valor colocar em `X-CSRF-Token`, e a
 * falsificação falha aqui.
 */
export async function requireCsrfToken(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (reply.sent) return; // preHandler anterior (sessão/papel) já recusou — não segue adiante.

  const expected = request.adminCsrfToken;
  const provided = request.headers[CSRF_HEADER];

  if (!expected || typeof provided !== 'string' || !csrfTokensMatch(expected, provided)) {
    await sendInvalidCsrf(reply);
  }
}
