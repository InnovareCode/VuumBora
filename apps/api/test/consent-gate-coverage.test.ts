/**
 * Revisão S1 rodada 3b, B-2: o portão `requireCurrentConsent` (aceite pendente) não estava ligado a nenhuma rota e NADA
 * forçava que uma rota nova o usasse (fail-open por omissão). Este teste torna o padrão "negado até declarar":
 *
 *  - ENUMERA toda rota registrada no app REAL (pelo `onRoute` de `buildApp`, inclusive os contextos encapsulados);
 *  - toda rota fora do painel (`/v1/admin/*`, outra identidade que não tem aceite de Termos) precisa estar na tabela
 *    `ROUTE_POLICY` (rota nova sem classificação FALHA este teste, que é o ponto);
 *  - rota autenticada por conta (`requireAccount`) só passa se for `account-gated` (tem `requireCurrentConsent` DEPOIS do
 *    `requireAccount`) OU `account-exempt` com o MOTIVO escrito; declarar uma rota autenticada como `public` falha;
 *  - classificação sem rota (rota removida ou renomeada) também falha: a tabela não apodrece.
 *
 * A primeira rota de compromisso é `PUT /v1/driver/availability` (fatia D4: ficar online), `account-gated`; o portão dela
 * só vale para `online: true` (`onlyWhen`), e o comportamento por HTTP está em `driver-onboarding-routes.test.ts`. As
 * demais autenticadas são exceções com motivo. Rota de compromisso nova entra como `account-gated` ou o teste falha.
 *
 * Duas detecções se completam (N3 da passada 4 da Íris: só pelo nome, três formas de esconder a autenticação passavam
 * declaradas `public` — autenticar por `onRequest`, por função anônima no `preHandler` e por `addHook` do contexto):
 *
 *  1. POR NOME, em toda fase do ciclo (`onRequest`, `preParsing`, `preValidation`, `preHandler`): vê `requireAccount` e
 *     `requireCurrentConsent`. O último teste trava esses nomes contra as fábricas reais (um renome não esvazia o teste).
 *  2. POR EFEITO: cada rota fora do painel é sondada SEM sessão (cabeçalho `Authorization` com lixo) e a recusa característica
 *     de `requireAccount` (401 com `error.code = 'unauthorized'`) tem de aparecer exatamente nas rotas declaradas como de conta.
 *     Isso independe de COMO a autenticação foi ligada (nome de função, função anônima, hook do contexto).
 *
 * LIMITAÇÃO REGISTRADA (a sondagem não cobre o portão): o portão de aceite (`requireCurrentConsent`) só se manifesta com uma
 * sessão real e um aceite pendente, e isto aqui não cria conta. Ele continua detectado só pelo nome. Consequências: (a) rota
 * declarada `account-gated` cujo portão esteja escondido (anônimo, `addHook`) FALHA por não achar o nome (falha fechada);
 * (b) um portão escondido numa rota `account-exempt` não é visto, mas essa rota já é uma exceção declarada com motivo; (c) o
 * comportamento do portão por HTTP fica para quando a primeira rota de compromisso existir (pendência registrada no PROGRESSO).
 * A sondagem também só vale para rotas fora de `/v1/admin` (outra identidade, outra recusa).
 *
 * Q3 da passada 5 da Íris (`docs/veredito-iris-s1-passada-5.md`, seção 3): a sondagem SEM corpo cai em `400` (validação do
 * Fastify, ex.: `schema.body`/`schema.querystring` obrigatórios, ou `schema.params` com `format: uuid`) ANTES do
 * `preHandler`, e esse `400` não é a recusa de `requireAccount` — a rota passava por "pública" mesmo autenticada. Correção:
 * uma SEGUNDA sondagem, com corpo/consulta/parâmetro GENÉRICOS (mas válidos o bastante para passar de um `schema` comum:
 * objeto JSON vazio, uma querystring preenchida, um `:param` em formato de UUID), e a rota é tratada como recusada se
 * QUALQUER uma das duas sondagens vir com a recusa característica. Hoje nenhuma rota real usa `schema` do Fastify (a
 * validação é por zod DENTRO do handler, que só roda depois do `preHandler`), então a segunda sondagem não muda nada do
 * app real agora — é rede para quando a primeira rota com `schema` nascer. Ainda ficam sem cobertura (limitação
 * registrada, não corrigida aqui): autenticação própria que responde 401 com outro `code` ou 403, o portão de mentira e o
 * portão escondido numa rota `exempt` (itens (a)/(b)/(c) acima e a tabela de `docs/veredito-iris-s1-passada-5.md`).
 */
import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { after, before, describe, test } from 'node:test';
import Fastify, { type FastifyInstance, type HTTPMethods, type onRouteHookHandler } from 'fastify';
import { buildApp } from '../src/app.js';
import { closePool } from '../src/db.js';
import { makeRequireAccount } from '../src/hooks/require-account.js';
import { makeRequireCurrentConsent } from '../src/hooks/require-current-consent.js';
import { loadAuthConfig } from '../src/lib/auth-config.js';

const REQUIRE_ACCOUNT = 'requireAccount';
const REQUIRE_CURRENT_CONSENT = 'requireCurrentConsent';
const ADMIN_PREFIX = '/v1/admin';

type Policy =
  /** Sem sessão de conta (formulários, cadastro, login, recuperação, textos legais, saúde). */
  | { readonly kind: 'public' }
  /** Cria compromisso novo: TEM de ter `requireCurrentConsent` depois de `requireAccount`. */
  | { readonly kind: 'account-gated' }
  /** Autenticada, mas NÃO cria compromisso novo (ou é a própria saída do aceite): o motivo é obrigatório. */
  | { readonly kind: 'account-exempt'; readonly reason: string };

/** Toda rota fora de `/v1/admin`, por "MÉTODO caminho". Rota nova que não estiver aqui faz o teste falhar. */
const ROUTE_POLICY: Readonly<Record<string, Policy>> = {
  'GET /healthz': { kind: 'public' },
  'POST /v1/waitlist': { kind: 'public' },
  'POST /v1/driver-applications': { kind: 'public' },
  'GET /v1/legal/current': { kind: 'public' },
  'POST /v1/auth/register': { kind: 'public' },
  'POST /v1/auth/login': { kind: 'public' },
  'POST /v1/auth/refresh': { kind: 'public' },
  'POST /v1/auth/logout': { kind: 'public' },
  'POST /v1/auth/verify-email': { kind: 'public' },
  'POST /v1/auth/resend-verification': { kind: 'public' },
  'POST /v1/auth/forgot-password': { kind: 'public' },
  'POST /v1/auth/reset-password': { kind: 'public' },
  'GET /v1/auth/me': { kind: 'account-exempt', reason: 'é por aqui que o app descobre o aceite pendente (`consent`); bloqueá-lo escondia a tela de reaceite' },
  'POST /v1/auth/consents': { kind: 'account-exempt', reason: 'é a SAÍDA do aceite pendente (reaceite): nunca pode ser bloqueada por ele' },
  'POST /v1/auth/logout-all': { kind: 'account-exempt', reason: 'encerrar sessões não cria compromisso novo e precisa funcionar com aceite pendente' },
  'POST /v1/auth/delete-account': { kind: 'account-exempt', reason: 'excluir a conta é o oposto de um compromisso novo: nunca pode ser bloqueada por aceite pendente' },
  // Cadastro do motorista (M3, fatia D4): preencher o cadastro não é compromisso com passageiro; o compromisso é ficar online.
  'POST /v1/driver/link-application': { kind: 'account-exempt', reason: 'ligar a conta à candidatura é cadastro, não compromisso com passageiro' },
  'PUT /v1/driver/onboarding': { kind: 'account-exempt', reason: 'etapa 2 do cadastro (dados pessoais e CNH): não cria compromisso com passageiro' },
  'PUT /v1/driver/vehicle': { kind: 'account-exempt', reason: 'cadastro do veículo: não cria compromisso com passageiro' },
  'GET /v1/driver/verification': { kind: 'account-exempt', reason: 'leitura do próprio cadastro: nunca pode ser bloqueada por aceite pendente' },
  'POST /v1/driver/documents/upload-url': { kind: 'account-exempt', reason: 'envio de documento do cadastro: não cria compromisso com passageiro' },
  'POST /v1/driver/documents/:id/submit': { kind: 'account-exempt', reason: 'confirmação do envio de documento do cadastro: não cria compromisso com passageiro' },
  // Ficar ONLINE é o compromisso: o portão vale para `online: true` (ficar offline nunca é bloqueado, R7: `onlyWhen`).
  'PUT /v1/driver/availability': { kind: 'account-gated' },
  // Geografia e cotação do passageiro (M4, fatias G3/G4): o compromisso é PEDIR a corrida (POST /v1/trips, M5), que consome a
  // cotação e entra aqui como `account-gated`. Buscar, ver a área e saber o preço não comprometem ninguém.
  'GET /v1/geo/search': { kind: 'account-exempt', reason: 'busca de endereço: leitura, não cria compromisso' },
  'GET /v1/geo/reverse': { kind: 'account-exempt', reason: 'nome do ponto do pino: leitura, não cria compromisso' },
  'GET /v1/service-area': { kind: 'account-exempt', reason: 'área atendida: leitura de catálogo, não cria compromisso' },
  'GET /v1/categories': { kind: 'account-exempt', reason: 'categorias ligadas: leitura de catálogo, não cria compromisso' },
  'POST /v1/quotes': { kind: 'account-exempt', reason: 'cotação é preço, não pedido: o compromisso é o POST /v1/trips (M5), que consome a cotação' },
  'GET /v1/quotes/:id': { kind: 'account-exempt', reason: 'leitura da própria cotação: não cria compromisso' },
};

/** Fases em que uma função pode autenticar a requisição, na ordem em que o Fastify as roda. */
const HOOK_PHASES = ['onRequest', 'preParsing', 'preValidation', 'preHandler'] as const;
/** Cabeçalho da sondagem: um "token" que nenhuma sessão reconhece (a recusa vem antes de qualquer consulta ao banco). */
const PROBE_AUTHORIZATION = 'Bearer lixo.sem.sessao';
/** `:param` da 2ª sondagem (Q3): formato de UUID, para não cair em `schema.params` com `format: uuid`. */
const PROBE_UUID = '00000000-0000-4000-8000-000000000000';

interface RouteFacts {
  /** "MÉTODO caminho completo (com o prefixo do contexto)". */
  readonly key: string;
  /** Nomes das funções de hook de ROTA (`onRequest`, `preParsing`, `preValidation`, `preHandler`), na ordem do ciclo de vida. */
  readonly handlers: readonly string[];
  /**
   * Resultado da sondagem SEM sessão: a recusa de `requireAccount` apareceu? `undefined` = rota não sondada (painel, ou rota
   * sintética dos controles negativos). Preenchido por `probeWithoutSession`.
   */
  refusesWithoutSession?: boolean | undefined;
}

/** `onRoute` que anota cada rota do app (e dos contextos encapsulados, que herdam o hook) com os nomes dos hooks da própria rota. */
function createRouteCollector(): { readonly routes: RouteFacts[]; readonly onRoute: onRouteHookHandler } {
  const routes: RouteFacts[] = [];
  const onRoute: onRouteHookHandler = (route) => {
    const options = route as unknown as Record<string, unknown>;
    const handlers: string[] = [];
    for (const phase of HOOK_PHASES) {
      for (const hook of ([] as unknown[]).concat(options[phase] ?? [])) handlers.push(typeof hook === 'function' ? hook.name : '?');
    }
    for (const method of ([] as string[]).concat(route.method)) {
      // HEAD é criado sozinho para cada GET, e OPTIONS é o preflight do CORS: nenhum dos dois é uma rota da aplicação.
      if (method === 'HEAD' || method === 'OPTIONS') continue;
      routes.push({ key: `${method} ${route.url}`, handlers });
    }
  };
  return { routes, onRoute };
}

const isAdminPath = (path: string): boolean => path === ADMIN_PREFIX || path.startsWith(`${ADMIN_PREFIX}/`);

/** A recusa característica de `requireAccount`: 401 com `error.code = 'unauthorized'` (um 401 de outra rota, como `invalid_refresh_token`, não conta). */
function isSessionRefusal(statusCode: number, body: string): boolean {
  if (statusCode !== 401) return false;
  try {
    return (JSON.parse(body) as { error?: { code?: unknown } }).error?.code === 'unauthorized';
  } catch {
    return false;
  }
}

/**
 * Chama cada rota fora do painel SEM sessão, com um Bearer inválido, em DUAS sondagens, e anota se QUALQUER uma viu a
 * recusa característica de `requireAccount`:
 *  1) sem corpo, sem `content-type` — pega a autenticação escondida do olhar por nome (`onRequest`, função anônima,
 *     `addHook` do contexto): o efeito é o mesmo de qualquer forma;
 *  2) com corpo/consulta/parâmetro GENÉRICOS, porém válidos (Q3, passada 5 da Íris) — pega a rota que exige
 *     `schema.body`/`schema.querystring`/`schema.params` do Fastify, cuja validação (400) aconteceria ANTES do
 *     `preHandler` na sondagem 1 e esconderia uma autenticação real por trás de um 400 que não é a recusa dela.
 */
async function probeWithoutSession(app: FastifyInstance, routes: readonly RouteFacts[]): Promise<void> {
  for (const route of routes) {
    const separator = route.key.indexOf(' ');
    const path = route.key.slice(separator + 1);
    if (isAdminPath(path)) continue;
    const method = route.key.slice(0, separator) as HTTPMethods;
    const bare = await app.inject({ method, url: path.replace(/:[A-Za-z0-9_]+/g, 'x'), headers: { authorization: PROBE_AUTHORIZATION } });
    const withPayload = await app.inject({
      method,
      url: `${path.replace(/:[A-Za-z0-9_]+/g, PROBE_UUID)}?probe=1`,
      headers: { authorization: PROBE_AUTHORIZATION, 'content-type': 'application/json' },
      payload: '{}',
    });
    route.refusesWithoutSession = isSessionRefusal(bare.statusCode, bare.body) || isSessionRefusal(withPayload.statusCode, withPayload.body);
  }
}

/** Só leitura da tabela e das rotas: devolve o que está errado (vazio = tudo certo). Testada com rotas sintéticas abaixo. */
function findViolations(routes: readonly RouteFacts[], policy: Readonly<Record<string, Policy>>): string[] {
  const violations: string[] = [];
  for (const route of routes) {
    const path = route.key.slice(route.key.indexOf(' ') + 1);
    const authenticated = route.handlers.includes(REQUIRE_ACCOUNT);
    const gateAt = route.handlers.indexOf(REQUIRE_CURRENT_CONSENT);

    if (isAdminPath(path)) {
      if (authenticated || gateAt !== -1) violations.push(`${route.key}: rota do painel usa requireAccount/requireCurrentConsent (o painel é outra identidade)`);
      continue;
    }

    const declared = policy[route.key];
    if (!declared) {
      violations.push(`${route.key}: SEM CLASSIFICAÇÃO. Declare em ROUTE_POLICY: 'public' (sem sessão), 'account-gated' (cria compromisso novo: use requireCurrentConsent) ou 'account-exempt' (com o motivo).`);
      continue;
    }
    // Por EFEITO (N3): vale qualquer que seja a forma de ligar a autenticação, inclusive as que o nome não enxerga.
    if (route.refusesWithoutSession !== undefined) {
      if (declared.kind === 'public' && route.refusesWithoutSession) {
        violations.push(`${route.key}: declarada 'public', mas RECUSA a requisição sem sessão (401 unauthorized): há autenticação escondida do teste (hook em onRequest, função anônima ou addHook do contexto). Declare a rota como de conta e use requireAccount no preHandler dela.`);
      }
      if (declared.kind !== 'public' && !route.refusesWithoutSession) {
        violations.push(`${route.key}: declarada '${declared.kind}', mas NÃO recusou a requisição sem sessão (esperado 401 unauthorized): a autenticação não está valendo de verdade.`);
      }
    }
    if (declared.kind === 'public') {
      if (authenticated) violations.push(`${route.key}: declarada 'public', mas usa requireAccount`);
      if (gateAt !== -1) violations.push(`${route.key}: declarada 'public', mas usa requireCurrentConsent`);
      continue;
    }
    if (!authenticated) violations.push(`${route.key}: declarada '${declared.kind}', mas não usa requireAccount (rota autenticada precisa de sessão)`);
    if (declared.kind === 'account-gated') {
      if (gateAt === -1) violations.push(`${route.key}: declarada 'account-gated', mas NÃO tem requireCurrentConsent no preHandler`);
      else if (gateAt < route.handlers.indexOf(REQUIRE_ACCOUNT)) violations.push(`${route.key}: requireCurrentConsent roda ANTES de requireAccount (sem conta ele recusa tudo)`);
    } else {
      if (declared.reason.trim().length < 10) violations.push(`${route.key}: exceção sem motivo escrito`);
      if (gateAt !== -1) violations.push(`${route.key}: declarada 'account-exempt', mas TEM requireCurrentConsent (escolha uma das duas)`);
    }
  }
  for (const key of Object.keys(policy)) {
    if (!routes.some((route) => route.key === key)) violations.push(`${key}: classificação SEM ROTA (a rota foi removida ou renomeada: ajuste a tabela)`);
  }
  return violations;
}

let app: FastifyInstance;
const collector = createRouteCollector();
const discovered: RouteFacts[] = collector.routes;

before(async () => {
  app = await buildApp({
    logStream: new Writable({ write: (_chunk, _encoding, callback) => callback() }),
    onRoute: collector.onRoute,
  });
  await app.ready();
  await probeWithoutSession(app, discovered);
});
after(async () => {
  await app.close();
  await closePool();
});

describe('B-2: toda rota autenticada exige requireCurrentConsent OU uma exceção declarada com motivo', () => {
  test('o app real: nenhuma rota sem classificação, nenhuma autenticada fora da regra, nenhuma classificação sem rota', () => {
    assert.deepEqual(findViolations(discovered, ROUTE_POLICY), []);
  });

  test('a enumeração enxerga as rotas autenticadas de verdade (o teste não é vazio): exatamente as declaradas como de conta', () => {
    const authenticated = discovered.filter((route) => route.handlers.includes(REQUIRE_ACCOUNT)).map((route) => route.key).sort();
    const declared = Object.entries(ROUTE_POLICY).filter(([, policy]) => policy.kind !== 'public').map(([key]) => key).sort();
    assert.ok(authenticated.length >= 3, `só ${authenticated.length} rota(s) autenticada(s) enumerada(s): a enumeração está cega`);
    assert.deepEqual(authenticated, declared);
    assert.ok(discovered.length >= 30, `só ${discovered.length} rotas enumeradas (os contextos encapsulados do admin e do público devem aparecer)`);
    assert.ok(discovered.some((route) => route.key.startsWith('POST /v1/admin/')), 'o contexto encapsulado do painel foi enumerado');
  });

  test('os nomes que a detecção usa são os das fábricas reais (um renome não esvazia o teste em silêncio)', () => {
    assert.equal(makeRequireAccount(loadAuthConfig()!).name, REQUIRE_ACCOUNT);
    assert.equal(makeRequireCurrentConsent(null).name, REQUIRE_CURRENT_CONSENT);
  });

  test('a sondagem sem sessão enxerga de verdade (não é vazia): todas as rotas fora do painel foram sondadas e só as de conta recusaram', () => {
    const outsideAdmin = discovered.filter((route) => !isAdminPath(route.key.slice(route.key.indexOf(' ') + 1)));
    assert.ok(outsideAdmin.length >= 15, `só ${outsideAdmin.length} rotas fora do painel enumeradas`);
    assert.ok(outsideAdmin.every((route) => route.refusesWithoutSession !== undefined), 'toda rota fora do painel foi sondada');
    const refused = outsideAdmin.filter((route) => route.refusesWithoutSession).map((route) => route.key).sort();
    const declared = Object.entries(ROUTE_POLICY).filter(([, policy]) => policy.kind !== 'public').map(([key]) => key).sort();
    assert.ok(refused.length >= 3, `só ${refused.length} rota(s) recusou(aram) a requisição sem sessão: a sondagem está cega`);
    assert.deepEqual(refused, declared);
    assert.ok(discovered.filter((route) => isAdminPath(route.key.slice(route.key.indexOf(' ') + 1))).every((route) => route.refusesWithoutSession === undefined), 'o painel não é sondado aqui');
  });
});

describe('B-2: o verificador cai quando deve (controle negativo, com rotas sintéticas)', () => {
  const route = (key: string, ...handlers: string[]): RouteFacts => ({ key, handlers });
  const exempt = (reason = 'motivo escrito por extenso'): Policy => ({ kind: 'account-exempt', reason });

  test('um conjunto correto não tem violação', () => {
    const routes = [route('GET /x', REQUIRE_ACCOUNT), route('POST /corrida', REQUIRE_ACCOUNT, REQUIRE_CURRENT_CONSENT), route('POST /livre'), route('GET /v1/admin/me', 'requireAdmin')];
    const policy = { 'GET /x': exempt(), 'POST /corrida': { kind: 'account-gated' }, 'POST /livre': { kind: 'public' } } as const;
    assert.deepEqual(findViolations(routes, policy), []);
  });

  test('rota autenticada NOVA, sem classificação: falha (é o fail-open por omissão que o B-2 aponta)', () => {
    const violations = findViolations([route('POST /v1/corridas', REQUIRE_ACCOUNT)], {});
    assert.equal(violations.length, 1);
    assert.match(violations[0]!, /POST \/v1\/corridas: SEM CLASSIFICAÇÃO/);
  });

  test('rota nova SEM sessão e sem classificação também falha (nada fica sem decisão explícita)', () => {
    assert.match(findViolations([route('POST /v1/nova')], {})[0]!, /SEM CLASSIFICAÇÃO/);
  });

  test('rota autenticada declarada como pública: falha', () => {
    assert.match(findViolations([route('POST /x', REQUIRE_ACCOUNT)], { 'POST /x': { kind: 'public' } })[0]!, /declarada 'public', mas usa requireAccount/);
  });

  test('account-gated sem o hook, ou com o hook ANTES de requireAccount: falha', () => {
    assert.match(findViolations([route('POST /corrida', REQUIRE_ACCOUNT)], { 'POST /corrida': { kind: 'account-gated' } })[0]!, /NÃO tem requireCurrentConsent/);
    assert.match(findViolations([route('POST /corrida', REQUIRE_CURRENT_CONSENT, REQUIRE_ACCOUNT)], { 'POST /corrida': { kind: 'account-gated' } })[0]!, /roda ANTES de requireAccount/);
  });

  test('exceção sem motivo (ou com motivo vazio), e exceção que na verdade tem o portão: falha', () => {
    assert.match(findViolations([route('GET /x', REQUIRE_ACCOUNT)], { 'GET /x': exempt('') })[0]!, /exceção sem motivo/);
    assert.match(findViolations([route('GET /x', REQUIRE_ACCOUNT)], { 'GET /x': exempt('curto') })[0]!, /exceção sem motivo/);
    assert.match(findViolations([route('GET /x', REQUIRE_ACCOUNT, REQUIRE_CURRENT_CONSENT)], { 'GET /x': exempt() })[0]!, /TEM requireCurrentConsent/);
  });

  test('classificação de rota autenticada em rota que não autentica, e classificação sem rota: falham', () => {
    assert.match(findViolations([route('GET /x')], { 'GET /x': exempt() })[0]!, /não usa requireAccount/);
    assert.match(findViolations([], { 'GET /sumiu': { kind: 'public' } })[0]!, /classificação SEM ROTA/);
  });

  test('rota do painel que use o portão das contas dos apps: falha; rota do painel comum não precisa de classificação', () => {
    assert.match(findViolations([route('GET /v1/admin/x', REQUIRE_ACCOUNT)], {})[0]!, /rota do painel usa requireAccount/);
    assert.deepEqual(findViolations([route('GET /v1/admin/x', 'requireAdmin')], {}), []);
  });

  test('sondagem: pública que recusa sem sessão falha; de conta que NÃO recusa falha; coerente passa; não sondada é ignorada (N3)', () => {
    const probed = (key: string, refuses: boolean | undefined, ...handlers: string[]): RouteFacts => ({ key, handlers, refusesWithoutSession: refuses });
    assert.match(findViolations([probed('POST /x', true)], { 'POST /x': { kind: 'public' } })[0]!, /declarada 'public', mas RECUSA a requisição sem sessão/);
    assert.match(findViolations([probed('GET /y', false, REQUIRE_ACCOUNT)], { 'GET /y': exempt() })[0]!, /NÃO recusou a requisição sem sessão/);
    assert.deepEqual(findViolations([probed('POST /livre', false), probed('GET /y', true, REQUIRE_ACCOUNT)], { 'POST /livre': { kind: 'public' }, 'GET /y': exempt() }), []);
    assert.deepEqual(findViolations([probed('GET /v1/admin/z', undefined)], {}), [], 'o painel e as rotas não sondadas não entram na sondagem');
  });
});

describe('B-2 (N3): as três formas de esconder a autenticação, declaradas `public`, são pegas (rotas reais do Fastify, `requireAccount` real)', () => {
  /** Mini app com as três formas + uma rota pública honesta, todas anotadas pelo MESMO coletor e pela MESMA sondagem do app real. */
  async function buildMiniApp() {
    const requireAccount = makeRequireAccount(loadAuthConfig()!);
    const mini = Fastify({ logger: false });
    const miniCollector = createRouteCollector();
    mini.addHook('onRoute', miniCollector.onRoute); // antes das rotas, como no app real
    const handler = async () => ({ ok: true });
    mini.get('/forma-onrequest', { onRequest: requireAccount }, handler);
    // Função anônima: o nome dela é `preHandler` (herdado da propriedade), nunca `requireAccount`.
    mini.get('/forma-anonima', { preHandler: async (request, reply) => { await requireAccount(request, reply); } }, handler);
    await mini.register(async (context) => {
      context.addHook('preHandler', requireAccount); // vale para toda rota do contexto e NÃO aparece nas opções da rota
      context.get('/forma-contexto', handler);
    });
    mini.get('/honesta', handler);
    await mini.ready();
    await probeWithoutSession(mini, miniCollector.routes);
    return { mini, routes: miniCollector.routes };
  }
  const allPublic = Object.fromEntries(['/forma-onrequest', '/forma-anonima', '/forma-contexto', '/honesta'].map((path) => [`GET ${path}`, { kind: 'public' } as const])) as Record<string, Policy>;

  test('cada forma escondida é pega; a rota pública honesta do mesmo app não é', async () => {
    const { mini, routes } = await buildMiniApp();
    try {
      const byKey = (key: string) => routes.find((route) => route.key === key)!;
      // O que o NOME enxerga: só a forma onRequest. As outras duas são invisíveis por nome (o ponto do N3).
      assert.ok(byKey('GET /forma-onrequest').handlers.includes(REQUIRE_ACCOUNT), 'por nome: onRequest é visto');
      assert.ok(!byKey('GET /forma-anonima').handlers.includes(REQUIRE_ACCOUNT), 'por nome: a função anônima NÃO é vista');
      assert.deepEqual(byKey('GET /forma-contexto').handlers, [], 'por nome: o hook do contexto NÃO é visto');
      // O que a SONDAGEM enxerga: as três recusam sem sessão; a honesta não.
      assert.deepEqual(routes.filter((route) => route.refusesWithoutSession).map((route) => route.key).sort(), ['GET /forma-anonima', 'GET /forma-contexto', 'GET /forma-onrequest']);
      assert.equal(byKey('GET /honesta').refusesWithoutSession, false);

      const violations = findViolations(routes, allPublic);
      for (const path of ['/forma-onrequest', '/forma-anonima', '/forma-contexto']) {
        assert.ok(violations.some((v) => v.startsWith(`GET ${path}: declarada 'public'`)), `GET ${path} declarada public deveria falhar (${violations.join(' || ')})`);
      }
      assert.ok(!violations.some((v) => v.startsWith('GET /honesta')), 'a rota pública honesta não gera violação');
      assert.match(violations.find((v) => v.startsWith('GET /forma-anonima'))!, /RECUSA a requisição sem sessão/);
      assert.match(violations.find((v) => v.startsWith('GET /forma-contexto'))!, /RECUSA a requisição sem sessão/);
    } finally {
      await mini.close();
    }
  });

  test('declaradas como de conta, a sondagem concorda (as duas recusam sem sessão) e só a checagem por NOME reclama, pedindo requireAccount visível (falha fechada)', async () => {
    const { mini, routes } = await buildMiniApp();
    try {
      const policy: Record<string, Policy> = {
        'GET /forma-anonima': { kind: 'account-exempt', reason: 'rota de teste: autentica por função anônima' },
        'GET /forma-contexto': { kind: 'account-exempt', reason: 'rota de teste: autentica por hook do contexto' },
        'GET /honesta': { kind: 'public' },
      };
      // A forma onRequest é vista por nome E por efeito; fora de `policy` ela cai como "sem classificação" (esperado).
      const violations = findViolations(routes.filter((route) => route.key !== 'GET /forma-onrequest'), policy);
      // As duas formas escondidas declaradas como de conta falham SÓ por não terem `requireAccount` visível por nome:
      // a verificação por nome continua exigindo o nome para rota autenticada (falha fechada), e a sondagem concorda com ela.
      assert.deepEqual(violations.filter((v) => /NÃO recusou/.test(v)), [], 'a sondagem confirma que as duas recusam sem sessão');
      assert.ok(violations.every((v) => /não usa requireAccount/.test(v)), `só a checagem por nome reclama (${violations.join(' || ')})`);
    } finally {
      await mini.close();
    }
  });
});
