/**
 * Recusa num hook async TEM de interromper a cadeia (lib/early-reply.ts), também num contexto com `onSend` ASSÍNCRONO
 * — o caso das rotas públicas do app real (Cache-Control da identidade e do motorista).
 *
 * Causa raiz (fatia D4): no Fastify 5 o handler roda depois de um hook async que já respondeu, se a resposta ainda não
 * TERMINOU quando o hook resolve; com `onSend` async ela termina depois. O portão de aceite (`requireCurrentConsent`)
 * respondia 409 e a rota de compromisso executava assim mesmo; o teste antigo do portão passava porque montava a rota
 * na RAIZ, sem `onSend` async. Aqui cada hook de recusa do projeto roda num contexto COM `onSend` async e o contador
 * do handler não pode andar. O controle negativo prova que o contexto reproduz o defeito.
 *
 * Segunda parte (revisão M3-D3/D4, IMP-1): o cliente DERRUBA a conexão enquanto a recusa ainda passa pelo `onSend`.
 * Esperar o fim da resposta não basta (ela nunca termina; a espera resolve no `close`): sem o `hijack` o handler rodaria
 * com a sessão já carregada. Servidor HTTP de verdade (`listen` + `http.request` + `destroy()`), sem relógio: o `onSend`
 * espera uma porta que o teste abre só depois de o servidor ver o `close`.
 */
import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import { closePool } from '../src/db.js';
import { makeRequireAccount } from '../src/hooks/require-account.js';
import { requireAdmin, requireAdminRole, requireCsrfToken } from '../src/hooks/require-admin.js';
import { makeRequireCurrentConsent } from '../src/hooks/require-current-consent.js';
import { requireDriverAccount } from '../src/hooks/require-driver-account.js';
import { loadAuthConfig } from '../src/lib/auth-config.js';
import { refuseAndStop } from '../src/lib/early-reply.js';

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

// ---------------------------------------------------------------------------------------------------------------------
// IMP-1: cliente derruba a conexão durante a recusa
// ---------------------------------------------------------------------------------------------------------------------

interface Deferred { readonly promise: Promise<void>; resolve(): void }
function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

describe('IMP-1: cliente derruba a conexão enquanto a recusa passa por um onSend que espera de verdade', () => {
  let server: FastifyInstance;
  let port = 0;
  const hits = new Map<string, number>();
  /** Por requisição: o `onSend` avisa que entrou e espera `gate`; o `close` do lado do servidor resolve `closed`. */
  let current = { entered: deferred(), gate: deferred(), closed: deferred() };

  /** O padrão da D4 ANTES da correção: espera o fim (`finish`/`close`) sem assumir a resposta. */
  async function waitOnlyRefusal(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.code(403).send({ ok: false, error: { code: 'forbidden', message: 'recusado' } });
    await new Promise<void>((resolve) => {
      if (reply.raw.writableEnded || reply.raw.destroyed) return resolve();
      reply.raw.once('finish', () => resolve());
      reply.raw.once('close', () => resolve());
    });
  }

  before(async () => {
    server = Fastify({ logger: false });
    await server.register(cookie);
    await server.register(async (context) => {
      context.addHook('onRequest', async (_request, reply) => {
        const mine = current;
        reply.raw.once('close', () => mine.closed.resolve());
      });
      // `onSend` que espera de verdade (compressão, trilha de auditoria): a recusa só termina quando o teste deixar.
      context.addHook('onSend', async () => {
        current.entered.resolve();
        await current.gate.promise;
      });
      const routes: Record<string, unknown[]> = {
        '/controle-espera-sem-hijack': [waitOnlyRefusal],
        '/refuse-and-stop': [async (_request: FastifyRequest, reply: FastifyReply) => refuseAndStop(reply, 403, { ok: false })],
        '/require-account': [makeRequireAccount(loadAuthConfig()!)],
        '/require-current-consent': [makeRequireCurrentConsent(null)],
        '/require-driver-account': [requireDriverAccount],
        '/require-admin': [requireAdmin],
        '/require-admin-role': [requireAdminRole('dono')],
        '/require-csrf': [requireCsrfToken],
      };
      for (const [path, preHandler] of Object.entries(routes)) {
        hits.set(path, 0);
        context.post(path, { preHandler: preHandler as never }, async (_request, reply) => {
          hits.set(path, (hits.get(path) ?? 0) + 1);
          return reply.send({ ok: true });
        });
      }
    });
    await server.listen({ port: 0, host: '127.0.0.1' });
    port = (server.server.address() as AddressInfo).port;
  });

  after(async () => {
    current.gate.resolve();
    server.server.closeAllConnections();
    await server.close();
  });

  /** Manda a requisição, derruba a conexão quando a recusa está no `onSend`, e só depois libera o `onSend`. */
  async function abortDuringRefusal(path: string): Promise<number> {
    current = { entered: deferred(), gate: deferred(), closed: deferred() };
    const request = httpRequest({ host: '127.0.0.1', port, path, method: 'POST', headers: { authorization: 'Bearer lixo.sem.sessao', 'content-type': 'application/json' } });
    request.on('error', () => undefined); // o destroy abaixo gera ECONNRESET do lado do cliente: é o que queremos
    request.end('{}');
    await current.entered.promise;
    request.destroy();
    await current.closed.promise;
    await settle(); // o hook resolve depois do `close`: é aqui que o handler rodaria
    current.gate.resolve();
    await settle();
    return hits.get(path) ?? 0;
  }

  test('controle negativo: só esperar o fim da resposta deixa o handler rodar no aborto (o defeito do IMP-1)', async () => {
    assert.equal(await abortDuringRefusal('/controle-espera-sem-hijack'), 1, 'se isto falhar, o cenário não reproduz o aborto e o teste abaixo não prova nada');
  });

  test('refuseAndStop e todo hook de recusa do projeto: o handler NÃO roda mesmo com a conexão derrubada', async () => {
    for (const path of ['/refuse-and-stop', '/require-account', '/require-current-consent', '/require-driver-account', '/require-admin', '/require-admin-role', '/require-csrf']) {
      assert.equal(await abortDuringRefusal(path), 0, `${path}: o handler rodou depois do aborto`);
    }
  });
});
