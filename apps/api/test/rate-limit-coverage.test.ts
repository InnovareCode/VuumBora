/**
 * Revisão 3e do Órion (F07): `admin-email-settings-route.ts` e `admin-driver-application-route.ts` não declaravam
 * `config.rateLimit` próprio e caíam no limite GLOBAL (por bloco /64) — o MESMO balde de qualquer outra rota sem
 * cota própria (achado F01-M1, já corrigido em `/v1/auth/me` e `/v1/legal/current`, mas não nas rotas do painel
 * citadas). Este teste torna isso impossível de esquecer de novo: ENUMERA toda rota registrada no app REAL (pelo
 * `onRoute` de `buildApp`, inclusive os contextos encapsulados) e reprova qualquer uma sem `config.rateLimit`
 * explícito — `rateLimit: false` (ex.: `/healthz`) conta como explícito, é uma escolha deliberada, não uma
 * omissão.
 *
 * Só quatro rotas escapam, e só porque pertencem à classe "sessão" de `lib/ip-rate-limits.ts` (não gastam bcrypt
 * nem mandam e-mail: valem o limite GLOBAL por /64, mais o teto por /48 do próprio bloco `preValidation`, de
 * propósito — ver o comentário daquele arquivo). Rota nova sem classificação FALHA este teste; isso é o ponto.
 */
import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { after, before, test } from 'node:test';
import type { FastifyInstance, onRouteHookHandler } from 'fastify';
import { buildApp } from '../src/app.js';
import { closePool } from '../src/db.js';

/**
 * Lista FECHADA e comentada (Atlas, revisão 3e): a classe "sessão" da identidade dos apps não tem cota por rota —
 * refresh, logout, logout-all e o reaceite de Termos/Política valem só o limite global por propósito (não gastam
 * bcrypt; o refresh token já tem 256 bits de entropia própria). Toda outra rota precisa de `config.rateLimit`
 * explícito (objeto próprio, ou `false` para desligar de caso pensado, como `/healthz`).
 */
const EXEMPT_FROM_OWN_RATE_LIMIT: ReadonlySet<string> = new Set(['POST /v1/auth/refresh', 'POST /v1/auth/logout', 'POST /v1/auth/logout-all', 'POST /v1/auth/consents']);

interface RouteFacts {
  readonly key: string;
  readonly hasOwnConfig: boolean;
}

function createRouteCollector(): { readonly routes: RouteFacts[]; readonly onRoute: onRouteHookHandler } {
  const routes: RouteFacts[] = [];
  const onRoute: onRouteHookHandler = (route) => {
    const hasOwnConfig = (route as unknown as { config?: { rateLimit?: unknown } }).config?.rateLimit !== undefined;
    for (const method of ([] as string[]).concat(route.method)) {
      // HEAD nasce junto de todo GET, e OPTIONS é o preflight do CORS: nenhum dos dois é rota da aplicação.
      if (method === 'HEAD' || method === 'OPTIONS') continue;
      routes.push({ key: `${method} ${route.url}`, hasOwnConfig });
    }
  };
  return { routes, onRoute };
}

/** Só leitura: devolve o que está errado (vazio = tudo certo). Testado com rotas sintéticas abaixo. */
function findViolations(routes: readonly RouteFacts[], exempt: ReadonlySet<string>): string[] {
  const violations: string[] = [];
  for (const route of routes) {
    if (exempt.has(route.key)) continue;
    if (!route.hasOwnConfig) violations.push(`${route.key}: sem config.rateLimit próprio (cai no limite global, compartilhado com qualquer outra rota sem cota)`);
  }
  for (const key of exempt) {
    if (!routes.some((route) => route.key === key)) violations.push(`${key}: exceção SEM ROTA (a rota foi removida ou renomeada: ajuste EXEMPT_FROM_OWN_RATE_LIMIT)`);
  }
  return violations;
}

let app: FastifyInstance;
const collector = createRouteCollector();
const discovered: RouteFacts[] = collector.routes;

before(async () => {
  app = await buildApp({ logStream: new Writable({ write: (_chunk, _encoding, callback) => callback() }), onRoute: collector.onRoute });
  await app.ready();
});
after(async () => {
  await app.close();
  await closePool();
});

test('toda rota do app real declara config.rateLimit próprio, exceto a lista fechada da classe "sessão"', () => {
  assert.deepEqual(findViolations(discovered, EXEMPT_FROM_OWN_RATE_LIMIT), []);
});

test('a enumeração enxerga as rotas de verdade (não é vazia) e as quatro exceções existem, com cota própria, no app real', () => {
  assert.ok(discovered.length >= 30, `só ${discovered.length} rotas enumeradas (os contextos encapsulados do admin e do público devem aparecer)`);
  assert.ok(discovered.some((route) => route.key.startsWith('POST /v1/admin/users')), 'as rotas novas de gestão de usuários (F07) foram enumeradas');
  assert.ok(discovered.some((route) => route.key === 'POST /v1/admin/auth/activate'), 'a rota de ativação (F07) foi enumerada');
  const withOwnConfig = discovered.filter((route) => route.hasOwnConfig);
  assert.ok(withOwnConfig.length >= 20, `só ${withOwnConfig.length} rota(s) com config próprio: a enumeração está cega`);
});

test('controle negativo: rota sintética sem config.rateLimit fora da lista falha; na lista, passa; exceção sem rota falha', () => {
  const synthetic: RouteFacts[] = [
    { key: 'POST /v1/nova', hasOwnConfig: false },
    { key: 'POST /v1/auth/refresh', hasOwnConfig: false },
  ];
  const violations = findViolations(synthetic, EXEMPT_FROM_OWN_RATE_LIMIT);
  assert.ok(violations.some((v) => v.startsWith('POST /v1/nova: sem config.rateLimit')), 'rota nova sem cota e fora da lista deveria falhar');
  assert.ok(!violations.some((v) => v.startsWith('POST /v1/auth/refresh:')), 'a exceção declarada não deveria falhar');
  assert.ok(violations.some((v) => v.includes('POST /v1/auth/logout-all: exceção SEM ROTA') || v.includes('POST /v1/auth/consents: exceção SEM ROTA')), 'exceção sem rota correspondente deveria ser apontada');
});

test('controle negativo: tudo com config (ou na lista) não gera violação', () => {
  const synthetic: RouteFacts[] = [...EXEMPT_FROM_OWN_RATE_LIMIT].map((key) => ({ key, hasOwnConfig: false }));
  synthetic.push({ key: 'GET /v1/admin/users', hasOwnConfig: true });
  assert.deepEqual(findViolations(synthetic, EXEMPT_FROM_OWN_RATE_LIMIT), []);
});
