/** Monta a instância Fastify: plugins (segurança, CORS, rate limit) + rotas. */
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError, type FastifyInstance, type onRouteHookHandler } from 'fastify';
import { pool } from './db.js';
import { env } from './env.js';
import type { MailPort } from './lib/mail-port.js';
import { BCRYPT_BUSY_RETRY_AFTER_SECONDS, BcryptBusyError, closeBcryptPools } from './lib/bcrypt-pool.js';
import { hashIpForLog, rateLimitKey, routeRateLimitKey } from './lib/ip-bucket.js';
import { loadLegalConfig } from './lib/legal-config.js';
import { twoFactorConfig } from './lib/two-factor-config.js';
import { describeErrorForLog } from './lib/safe-error.js';
import { documentStorageFromEnv, type DocumentStorageSetup } from './lib/document-storage-config.js';
import { loadGeoConfig } from './lib/geo-config.js';
import { createMapboxProvider } from './lib/mapbox.js';
import { registerAuthRoutes } from './routes/auth-route.js';
import { createSmtpMailer } from './services/mailer.js';
import { registerAdminAuthRoutes } from './routes/admin-auth-route.js';
import { registerAdminTwoFactorRoutes } from './routes/admin-two-factor-route.js';
import { registerAdminEmailSettingsRoutes } from './routes/admin-email-settings-route.js';
import { registerAdminDriverApplicationRoutes } from './routes/admin-driver-application-route.js';
import { registerAdminDocumentReviewRoutes } from './routes/admin-document-review-route.js';
import { registerAdminUserActivationRoute, registerAdminUserRoutes } from './routes/admin-user-route.js';
import { registerDriverApplicationRoute } from './routes/driver-application-route.js';
import { registerDriverRoutes } from './routes/driver-route.js';
import { registerGeoRoutes, type GeoSetup } from './routes/geo-route.js';
import { registerHealthRoute } from './routes/health-route.js';
import { registerLegalRoutes } from './routes/legal-route.js';
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

export interface BuildAppOptions {
  /** Destino do log — só os testes passam isto (para ler o que foi logado). Em produção, stdout. */
  readonly logStream?: NodeJS.WritableStream;
  /** Adaptador de e-mail da identidade dos apps (SMTP em produção; fake nos testes). Sem ele o envio falha de forma explícita. */
  readonly mail?: MailPort;
  /**
   * Só os testes: recebe TODA rota registrada (inclusive as dos contextos encapsulados), para enumerá-las. Serve ao teste que
   * exige `requireCurrentConsent` ou uma exceção declarada em toda rota autenticada (`test/consent-gate-coverage.test.ts`).
   */
  readonly onRoute?: onRouteHookHandler;
  /**
   * Armazenamento dos documentos do motorista (fatia D3). Omitido = lido do ambiente (`lib/document-storage-config.ts`);
   * `null` = indisponível (envio de documento responde 503). Os testes passam o adaptador local com relógio próprio e
   * fecham ele mesmos; o criado a partir do ambiente fecha junto com o app.
   */
  readonly documents?: DocumentStorageSetup | null;
  /**
   * Geografia e cotação (M4, fatias G3/G4). Omitido = lido do ambiente (`lib/geo-config.ts`; sem `MAPBOX_SERVER_TOKEN` as rotas
   * que usam o Mapbox respondem 503, o boot segue). Os testes passam a configuração e o Mapbox com respostas GRAVADAS.
   */
  readonly geo?: GeoSetup;
  /**
   * Só os testes: hooks na RAIZ, antes de qualquer `register` (valem para todo contexto). Serve para provar que nenhuma
   * rota depende de o contexto ter poucos `onSend` assíncronos (`test/public-routes-async-onsend.test.ts`).
   */
  readonly rootHooksForTest?: (app: FastifyInstance) => void;
}

/** Geografia a partir do ambiente: o Mapbox só existe com token; avisos com nome de variável, nunca valor. */
function geoSetupFromEnv(app: FastifyInstance): GeoSetup {
  const { config, problems } = loadGeoConfig();
  if (problems.length > 0) app.log.warn({ event: 'geo_config_problems', reasons: problems });
  if (config.allowTestFares && env.NODE_ENV === 'production') {
    // Homologação pode precisar; produção com passageiro real, nunca (N8). Fica no log para ninguém esquecer ligado.
    app.log.warn({ event: 'test_fares_allowed_in_production' });
  }
  const provider = config.mapboxToken
    ? createMapboxProvider({ token: config.mapboxToken, profile: config.directionsProfile, timeoutMs: config.mapboxTimeoutMs })
    : null;
  return { config, provider };
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(options.logStream ? { stream: options.logStream } : {}),
      serializers: {
        // Rede de segurança: se algum erro for logado pelo handler padrão do Fastify
        // (ex.: contexto que sobrescreva o handler), a mensagem e a stack não vão junto.
        err(err) {
          return { type: err.name, message: '[omitida]', stack: '[omitida]', ...describeErrorForLog(err), ...(typeof err.statusCode === 'number' ? { statusCode: err.statusCode } : {}) };
        },
        req(request) {
          return {
            method: request.method,
            url: pathnameOnly(request.url),
            host: request.host,
            // Identidade dos apps (/v1/auth): nenhum IP no log, nem hash (só o HMAC estável na trilha do banco).
            // Fora dela (candidatura, lista de espera, painel, saúde — item 16 das pendências jurídicas): também
            // nunca o IP em claro, só um hash de log (`hashIpForLog`, chave aleatória do processo, sem relação com
            // o pepper da identidade) — o bastante para reconhecer "é o mesmo IP" numa investigação, sem guardar o
            // endereço em si.
            ...(request.url.startsWith('/v1/auth/')
              ? {}
              : {
                  remoteAddress: hashIpForLog(request.ip),
                  ...(request.socket?.remotePort !== undefined ? { remotePort: request.socket.remotePort } : {}),
                }),
          };
        },
      },
    },
    trustProxy: env.TRUST_PROXY,
    // Nenhum payload legítimo deste serviço passa disso — corta corpo gigante antes de parsear.
    bodyLimit: 10 * 1024,
  });

  // ORDEM IMPORTA — estes dois handlers precisam ser definidos ANTES de
  // qualquer `register`. Cada `register` cria um contexto encapsulado que
  // herda os handlers do pai NO MOMENTO em que é criado, e `await register`
  // o cria na hora. Definidos depois (como estavam), o handler nunca chegava
  // às rotas públicas nem às `/v1/admin/*`: um corpo malformado voltava no
  // formato cru do Fastify (`{statusCode, code, error, message}`, fora do
  // envelope `{ok:false,error}`) e o erro era logado pelo handler PADRÃO do
  // Fastify, que grava `err.message` e `err.stack` inteiros — o vazamento
  // de dado pessoal que `describeErrorForLog` existe para impedir.
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

    // Pista de bcrypt cheia (A-1, rodada 3) que escapou do catch da rota (ex.: login do admin): 503 estruturado, não 500.
    if (err instanceof BcryptBusyError) {
      // `reason` (origin | capacity | closing) diz POR QUE recusou, sem a chave de origem: um TRUST_PROXY errado, por exemplo, aparece como
      // `origin` em massa (todos os clientes viram um balde só).
      request.log.warn({ event: 'bcrypt_busy', lane: err.lane, reason: err.reason });
      reply.header('Retry-After', String(BCRYPT_BUSY_RETRY_AFTER_SECONDS));
      reply.code(503).send({ ok: false, error: { code: 'server_busy', message: 'Muitas solicitações no momento. Tente novamente em alguns segundos.', retryAfterSeconds: BCRYPT_BUSY_RETRY_AFTER_SECONDS } });
      return;
    }

    if (statusCode === 429) {
      // Quantos 429 cada rota deu é o que calibra os limites por IP (docs/decisoes-do-dono.md). O padrão de rota (`/v1/auth/login`), nunca a URL
      // com a querystring nem o IP: nenhum dado do cliente vai para o log. O 'request completed' do Fastify não traz a rota.
      request.log.info({ event: 'rate_limited', route: request.routeOptions?.url ?? 'desconhecida' });
      reply.code(429).send({
        ok: false,
        error: { code: 'rate_limited', message: 'Muitas requisições. Tente novamente em alguns minutos.' },
      });
      return;
    }

    if (statusCode >= 400 && statusCode < 500) {
      request.log.info({ event: 'request_rejected', statusCode, ...describeErrorForLog(err) });
      reply.code(400).send({ ok: false, error: { code: 'invalid_body', message: 'Corpo da requisição inválido.' } });
      return;
    }

    app.log.error({ event: 'unhandled_error', ...describeErrorForLog(err) });
    reply.code(500).send({ ok: false, error: { code: 'unknown', message: 'Erro interno.' } });
  });

  // As threads do bcrypt (lib/bcrypt-pool.ts) terminam junto com o servidor, depois das operações em curso.
  app.addHook('onClose', async () => closeBcryptPools());

  // Armazenamento de documentos: configuração ausente ou errada não derruba o boot (falha fechada nas rotas que o usam).
  // O aviso leva só NOMES de variável, nunca valor.
  const documents = options.documents !== undefined
    ? options.documents
    : await documentStorageFromEnv((reasons) => app.log.warn({ event: 'document_storage_unavailable', reasons }));
  if (options.documents === undefined && documents) app.addHook('onClose', async () => documents.storage.close());

  // Geografia e cotação: configuração ausente ou errada não derruba o boot (falha fechada nas rotas). O aviso leva só NOMES.
  const geo = options.geo ?? geoSetupFromEnv(app);

  // ANTES de qualquer `register`: o hook só vê as rotas registradas depois dele e é herdado pelos contextos filhos.
  if (options.onRoute) app.addHook('onRoute', options.onRoute);
  options.rootHooksForTest?.(app);

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
    max: env.GLOBAL_RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    // Este limite GLOBAL usa o balde: IPv4 = o endereço, IPv6 = o /64. Sem isso, um único /64 dá 2^64 "IPs" (revisão S1
    // rodada 2, I-5d). Os limites POR ROTA do admin e dos formulários públicos declaram a própria chave, o /48 no IPv6
    // (`routeRateLimitKey`, rodada 3b M-1): o global fica no /64 para não somar, num /48 de provedor, todos os assinantes. A identidade
    // dos apps (`/v1/auth/*`) usa o /64 por rota e um teto por /48 (`lib/ip-rate-limits.ts`); as rotas de sessão dela só têm o global.
    keyGenerator: rateLimitKey,
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
      // PUT: etapa 2, veículo e disponibilidade do motorista (`/v1/driver/*`, Bearer, sem cookie).
      methods: ['GET', 'POST', 'PUT'],
      credentials: false,
    });

    registerHealthRoute(instance, { ttlMs: env.HEALTHZ_CACHE_SECONDS * 1000, testFaresAllowed: geo.config.allowTestFares });
    registerWaitlistRoute(instance);
    registerDriverApplicationRoute(instance);
    // Documentos legais (M-3): uma leitura da configuração serve ao catálogo público e ao aceite da identidade.
    const legal = loadLegalConfig();
    registerLegalRoutes(instance, legal);
    // Sem adaptador injetado (produção): SMTP configurado no painel/ambiente, lido a cada envio.
    registerAuthRoutes(instance, { legal, mail: options.mail ?? createSmtpMailer({ pool, encryptionKey: twoFactorConfig.encryptionKey, log: instance.log }) });
    // Cadastro do motorista (M3, fatia D4): Bearer de conta `driver`, mesma família pública (sem cookie, sem credentials no CORS).
    registerDriverRoutes(instance, { legal, documents });
    // Busca, área, categorias e cotação do passageiro (M4, fatias G3/G4): Bearer de conta, mesma família pública.
    registerGeoRoutes(instance, geo);
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
      // `Date` não é cabeçalho "seguro" para o navegador ler em resposta cross-origin: sem isto, o painel não lê o relógio
      // do servidor e calcularia a validade do link de documento (≤ 300 s) pelo relógio da máquina do revisor.
      exposedHeaders: ['Date'],
    });

    registerAdminAuthRoutes(instance);
    registerAdminTwoFactorRoutes(instance);
    registerAdminEmailSettingsRoutes(instance);
    registerAdminDriverApplicationRoutes(instance);
    // Revisão de documentos do motorista (M3, fatia D5): revisor_documentos e dono; a visualização usa o armazenamento.
    registerAdminDocumentReviewRoutes(instance, { documents });
    registerAdminUserRoutes(instance);
    // Primeiro acesso (F07): SEM sessão, mesma classe de limite do login (pré-autenticação, mesmo risco de martelo).
    registerAdminUserActivationRoute(instance, {
      config: { rateLimit: { max: env.ADMIN_LOGIN_RATE_LIMIT_MAX, timeWindow: env.ADMIN_LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000, keyGenerator: routeRateLimitKey } },
    });
  }, { prefix: '/v1/admin' });

  return app;
}
