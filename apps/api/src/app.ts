/** Monta a instância Fastify: plugins (segurança, CORS, rate limit) + rotas. */
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { env } from './env.js';
import { registerAdminAuthRoutes } from './routes/admin-auth-route.js';
import { registerAdminDriverApplicationRoutes } from './routes/admin-driver-application-route.js';
import { registerDriverApplicationRoute } from './routes/driver-application-route.js';
import { registerHealthRoute } from './routes/health-route.js';
import { registerWaitlistRoute } from './routes/waitlist-route.js';

/**
 * Corta a querystring antes de logar. O pino registra `req.url` inteiro em
 * toda linha de "incoming request"/"request completed" — e `GET
 * /v1/admin/driver-applications?q=...` carrega busca livre por nome, e-mail
 * ou telefone de candidato. Sem isto, qualquer valor buscado (reproduzido
 * pela Íris com `?q=84977000000`) fica em texto puro no log. Vale para toda
 * rota, não só esta: nenhuma querystring deste serviço é segura de logar
 * por padrão.
 */
function pathnameOnly(url: string): string {
  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: pathnameOnly(request.url),
            host: request.host,
            remoteAddress: request.ip,
            ...(request.socket?.remotePort !== undefined ? { remotePort: request.socket.remotePort } : {}),
          };
        },
      },
    },
    trustProxy: env.TRUST_PROXY,
    // Nenhum payload legítimo deste serviço passa disso — corta corpo gigante antes de parsear.
    bodyLimit: 10 * 1024,
  });

  await app.register(helmet);

  // Sem segredo/assinatura: o valor do cookie é um token aleatório opaco,
  // e quem valida é a sessão no banco (hash comparado em
  // `admin-session-repository.ts`) — um cookie adulterado simplesmente não
  // acha sessão nenhuma. Registrar o plugin só liga `request.cookies` e
  // `reply.setCookie`/`clearCookie`.
  await app.register(cookie);

  // Limite global de defesa (além do limite mais estrito da rota de inscrição, abaixo).
  // IMPORTANTE: o plugin dá `throw` no retorno de `errorResponseBuilder` (ver
  // seu index.js) — por isso ele só precisa de `statusCode: 429`; o corpo
  // final de verdade é montado no `setErrorHandler`, abaixo, que também
  // cobre qualquer outro erro lançado antes da rota (ex.: corpo malformado).
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => {
      const err = new Error('rate limited') as FastifyError;
      err.statusCode = 429;
      return err;
    },
  });

  // Dois registros SEPARADOS de `@fastify/cors`, em dois contextos
  // ENCAPSULADOS (cada `app.register(async (instance) => {...})` cria um
  // filho isolado no Fastify) — achado do Órion (auditoria "Rodada 3",
  // `.claude/agent-memory/orion/project_admin_v0_seguranca.md`): um único
  // registro global com `credentials:true` valia para toda origem da
  // lista EM TODA ROTA, inclusive as públicas. Isso deixava o site
  // público (superfície mais exposta a XSS de terceiro, formulário aberto
  // a qualquer um) carregar `credentials:true` só porque precisava estar
  // em alguma lista de CORS — um XSS ali conseguiria `fetch('/v1/admin/me',
  // {credentials:'include'})`, receber o cookie de sessão do admin (mesmo
  // site, `SameSite=Lax` não bloqueia) E a resposta com credenciais,
  // lendo `data.csrfToken` do corpo. A defesa de CSRF inteira
  // (`hooks/require-admin.ts::requireCsrfToken`) dependia de uma premissa
  // ("origem fora da lista nunca recebe o token") que já nascia falsa.
  //
  // Agora: rotas PÚBLICAS (`/v1/waitlist`, `/v1/driver-applications`,
  // `/health`) nunca usam cookie — CORS aqui nunca tem `credentials:true`,
  // não importa quem esteja em `ALLOWED_ORIGINS`. Rotas `/v1/admin/*` são
  // as ÚNICAS com `credentials:true`, e só para origem em
  // `ADMIN_ALLOWED_ORIGINS` — uma lista SEPARADA que nunca deve conter o
  // domínio do site público.
  await app.register(async function publicRoutes(instance) {
    await instance.register(cors, {
      origin: env.ALLOWED_ORIGINS,
      methods: ['GET', 'POST'],
      credentials: false,
    });

    registerHealthRoute(instance);
    registerWaitlistRoute(instance);
    registerDriverApplicationRoute(instance);
  });

  // `prefix: '/v1/admin'` não é só estética: `@fastify/cors` registra uma
  // rota `OPTIONS *` própria para responder preflight (mesmo arquivo,
  // `fastify.options('*', ...)`), e como o plugin é `fastify-plugin`
  // (não cria um novo nível de encapsulamento sozinho), essa rota usa o
  // PREFIXO do contexto em que foi chamado. Sem um prefixo aqui, as DUAS
  // chamadas a `instance.register(cors, ...)` (pública e admin) tentariam
  // registrar a MESMA rota `OPTIONS *` sem prefixo e o Fastify recusa o
  // boot inteiro (`FST_ERR_DUPLICATED_ROUTE`) — só apareceu rodando de
  // verdade, não no typecheck. Com o prefixo, a rota de preflight do
  // admin vira `OPTIONS /v1/admin/*`, distinta da pública.
  await app.register(async function adminRoutes(instance) {
    await instance.register(cors, {
      origin: env.ADMIN_ALLOWED_ORIGINS,
      methods: ['GET', 'POST'],
      // Única família de rota com cookie de sessão httpOnly — sem isso o
      // navegador nunca manda nem aceita `Set-Cookie` em requisição
      // cross-origin (o painel admin e esta API vivem em subdomínios
      // diferentes). `env.ADMIN_ALLOWED_ORIGINS` é curta e fechada
      // (só o domínio do painel), nunca a lista do site público.
      credentials: true,
      // Explícito, não o default (reflete de volta qualquer cabeçalho
      // pedido no preflight) — `X-CSRF-Token`
      // (`hooks/require-admin.ts::requireCsrfToken`) e `Idempotency-Key`
      // (aprovar/recusar candidatura) precisam passar no preflight, e
      // listar por nome documenta a intenção em vez de depender de um
      // comportamento implícito do plugin.
      allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key'],
    });

    registerAdminAuthRoutes(instance);
    registerAdminDriverApplicationRoutes(instance);
  }, { prefix: '/v1/admin' });

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Rota não encontrada.' } });
  });

  // Cobre erros lançados ANTES de chegar na rota (corpo malformado, Content-Type
  // errado, payload maior que `bodyLimit`, limite de requisições excedido) —
  // não só os erros inesperados do handler. Por isso nunca assume 500: lê
  // `statusCode` do erro real e nunca ecoa `err.message` do Fastify (texto em
  // inglês, detalhe de implementação) para quem chama.
  app.setErrorHandler((err: FastifyError, request, reply) => {
    const statusCode = err.statusCode ?? 500;

    if (statusCode === 429) {
      reply.code(429).send({
        ok: false,
        error: { code: 'rate_limited', message: 'Muitas requisições. Tente novamente em alguns minutos.' },
      });
      return;
    }

    if (statusCode >= 400 && statusCode < 500) {
      request.log.info({ event: 'request_rejected', statusCode, message: err.message });
      reply.code(400).send({ ok: false, error: { code: 'invalid_body', message: 'Corpo da requisição inválido.' } });
      return;
    }

    app.log.error({ event: 'unhandled_error', message: err.message });
    reply.code(500).send({ ok: false, error: { code: 'unknown', message: 'Erro interno.' } });
  });

  return app;
}
