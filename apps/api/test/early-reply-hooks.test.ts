/**
 * Recusa num hook async TEM de interromper a cadeia (lib/early-reply.ts), também num contexto com `onSend` ASSÍNCRONO
 * — o caso das rotas públicas do app real (Cache-Control da identidade e do motorista).
 *
 * Causa raiz (fatia D4): no Fastify 5 o handler roda depois de um hook async que já respondeu, se a resposta ainda não
 * TERMINOU quando o hook resolve; com `onSend` async ela termina depois. O portão de aceite (`requireCurrentConsent`)
 * respondia 409 e a rota de compromisso executava assim mesmo; o teste antigo do portão passava porque montava a rota
 * na RAIZ, sem `onSend` async. Aqui cada hook de recusa do projeto roda num contexto COM `onSend` async e o contador
 * do handler não pode andar. O controle negativo prova que o contexto reproduz o defeito.
 */
import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import { closePool } from '../src/db.js';
import { makeRequireAccount } from '../src/hooks/require-account.js';
import { requireAdmin, requireAdminRole, requireCsrfToken } from '../src/hooks/require-admin.js';
import { makeRequireCurrentConsent } from '../src/hooks/require-current-consent.js';
import { requireDriverAccount } from '../src/hooks/require-driver-account.js';
import { loadAuthConfig } from '../src/lib/auth-config.js';

let app: FastifyInstance;
const reached = new Map<string, number>();

/**
 * O handler indevido roda DEPOIS de a resposta terminar (o `inject` já resolveu): deixa a fila de eventos andar antes de
 * contar. O controle negativo prova que esta janela basta para ver o defeito.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
}

/**
 * O defeito, isolado: depois de um `await` (como a consulta ao banco dos hooks reais), responde e resolve sem esperar a
 * resposta terminar.
 */
async function naiveRefusal(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await Promise.resolve();
  reply.code(403).send({ ok: false, error: { code: 'forbidden', message: 'recusado' } });
}

before(async () => {
  app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(async (context) => {
    // Como o contexto público do app real: `onSend` ASSÍNCRONO faz o `send()` terminar depois. Lá são vários (identidade,
    // motorista) e a corrida depende de quantos; aqui um que cede a vez à fila de eventos torna o defeito determinístico.
    context.addHook('onSend', async (_request, reply) => {
      await new Promise((resolve) => setImmediate(resolve));
      reply.header('Cache-Control', 'no-store');
    });
    const routes: Record<string, unknown[]> = {
      '/controle-ingenuo': [naiveRefusal],
      '/require-account': [makeRequireAccount(loadAuthConfig()!)],
      '/require-current-consent': [makeRequireCurrentConsent(null)],
      '/require-driver-account': [requireDriverAccount],
      '/require-admin': [requireAdmin],
      '/require-admin-role': [requireAdminRole('dono')],
      '/require-csrf': [requireCsrfToken],
    };
    for (const [path, preHandler] of Object.entries(routes)) {
      reached.set(path, 0);
      context.post(path, { preHandler: preHandler as never }, async (_request, reply) => {
        reached.set(path, (reached.get(path) ?? 0) + 1);
        return reply.send({ ok: true });
      });
    }
  });
  await app.ready();
});

after(async () => {
  await app.close();
  await closePool();
});

test('controle negativo: o contexto com onSend async REPRODUZ o defeito (hook ingênuo deixa o handler rodar)', async () => {
  const reply = await app.inject({ method: 'POST', url: '/controle-ingenuo', payload: {} });
  assert.equal(reply.statusCode, 403);
  await settle();
  assert.equal(reached.get('/controle-ingenuo'), 1, 'se isto falhar, o contexto não reproduz mais o defeito e os testes abaixo não provam nada');
});

test('todo hook de recusa do projeto interrompe a cadeia: a resposta é a recusa e o handler NÃO roda', async () => {
  const expected: Record<string, number> = {
    '/require-account': 401,
    '/require-current-consent': 401,
    '/require-driver-account': 401,
    '/require-admin': 401,
    '/require-admin-role': 401,
    '/require-csrf': 403,
  };
  for (const [path, status] of Object.entries(expected)) {
    const reply = await app.inject({ method: 'POST', url: path, headers: { authorization: 'Bearer lixo.sem.sessao' }, payload: {} });
    assert.equal(reply.statusCode, status, `${path}: ${reply.body}`);
    await settle();
    assert.equal(reached.get(path), 0, `${path}: o handler rodou apesar da recusa`);
  }
});
