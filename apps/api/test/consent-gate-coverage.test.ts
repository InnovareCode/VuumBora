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
 * Hoje não há rota de compromisso (corrida, ficar online), então as três autenticadas são exceções com motivo. Quando a
 * primeira rota de compromisso nascer, ela entra como `account-gated` (e o teste cobra o preHandler) ou o teste falha.
 *
 * A detecção é pelo NOME das funções de `preHandler` (`requireAccount`, `requireCurrentConsent`): o último teste trava esses
 * nomes contra as fábricas reais, para um renome não esvaziar o teste em silêncio.
 */
import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
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
};

interface RouteFacts {
  /** "MÉTODO caminho completo (com o prefixo do contexto)". */
  readonly key: string;
  /** Nomes das funções de `preHandler`, na ordem. */
  readonly handlers: readonly string[];
}

/** Só leitura da tabela e das rotas: devolve o que está errado (vazio = tudo certo). Testada com rotas sintéticas abaixo. */
function findViolations(routes: readonly RouteFacts[], policy: Readonly<Record<string, Policy>>): string[] {
  const violations: string[] = [];
  for (const route of routes) {
    const path = route.key.slice(route.key.indexOf(' ') + 1);
    const authenticated = route.handlers.includes(REQUIRE_ACCOUNT);
    const gateAt = route.handlers.indexOf(REQUIRE_CURRENT_CONSENT);

    if (path === ADMIN_PREFIX || path.startsWith(`${ADMIN_PREFIX}/`)) {
      if (authenticated || gateAt !== -1) violations.push(`${route.key}: rota do painel usa requireAccount/requireCurrentConsent (o painel é outra identidade)`);
      continue;
    }

    const declared = policy[route.key];
    if (!declared) {
      violations.push(`${route.key}: SEM CLASSIFICAÇÃO. Declare em ROUTE_POLICY: 'public' (sem sessão), 'account-gated' (cria compromisso novo: use requireCurrentConsent) ou 'account-exempt' (com o motivo).`);
      continue;
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
const discovered: RouteFacts[] = [];

before(async () => {
  app = await buildApp({
    logStream: new Writable({ write: (_chunk, _encoding, callback) => callback() }),
    onRoute: (route) => {
      const handlers = ([] as unknown[]).concat(route.preHandler ?? []).map((handler) => (typeof handler === 'function' ? handler.name : '?'));
      for (const method of ([] as string[]).concat(route.method)) {
        // HEAD é criado sozinho para cada GET, e OPTIONS é o preflight do CORS: nenhum dos dois é uma rota da aplicação.
        if (method === 'HEAD' || method === 'OPTIONS') continue;
        discovered.push({ key: `${method} ${route.url}`, handlers });
      }
    },
  });
  await app.ready();
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
});
