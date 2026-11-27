/**
 * Revisão M3-D3/D4, S-2: nenhuma rota pública pode depender de o contexto ter poucos `onSend` assíncronos.
 *
 * Handler async que chama `reply.send()` e resolve com `undefined` antes de a resposta terminar faz o Fastify enviar de
 * novo ("Reply was already sent", e `ERR_HTTP_HEADERS_SENT` como erro não tratado). Isso aparece só quando o contexto tem
 * `onSend` que espera de verdade (compressão, auditoria) — na D4, um segundo `onSend` async já bastou. Aqui o app REAL
 * ganha, na raiz, um `onSend` que cede a vez à fila de eventos, e o caminho feliz e as recusas de cada rota pública rodam
 * com ele. O log não pode ter nenhum dos dois sinais, e cada resposta tem o status certo.
 *
 * Controle negativo: uma rota de teste no estilo antigo (send sem return) NESTE app dispara o aviso — prova que o
 * `onSend` injetado reproduz o defeito e que a asserção do log enxerga.
 */
import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { after, before, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { drainBackgroundTasks } from '../src/lib/background-tasks.js';
import { prepareDatabase, shutdown } from './helpers/harness.js';
import { DEVICE, FakeMailbox, makeClient, PASSWORD, REGISTER_EXTRAS, uniqueEmail } from './helpers/identity-kit.js';
import { BASELINE_VERSION } from './helpers/legal-kit.js';

let app: FastifyInstance;
let logs = '';
const mailbox = new FakeMailbox();

before(async () => {
  await prepareDatabase();
  app = await buildApp({
    logStream: new Writable({ write: (chunk, _encoding, callback) => { logs += chunk.toString(); callback(); } }),
    mail: mailbox,
    documents: null,
    rootHooksForTest: (root) => {
      root.addHook('onSend', async () => {
        await new Promise((resolve) => setImmediate(resolve));
      });
      // Controle negativo: o padrão antigo (send sem return) numa rota de teste deste MESMO app.
      root.post('/teste/estilo-antigo', async (_request, reply) => {
        await Promise.resolve();
        reply.code(200).send({ ok: true });
      });
    },
  });
  await app.ready();
});

after(async () => {
  await app.close();
  await shutdown();
});

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
};
const doubleSends = (text: string) => text.split(/\r?\n/).filter((line) => line.includes('Reply was already sent') || line.includes('"event":"unhandled_error"'));

test('controle negativo: com este onSend, uma rota que dá send() sem return dispara o aviso', async () => {
  const start = logs.length;
  const reply = await app.inject({ method: 'POST', url: '/teste/estilo-antigo', payload: {} });
  assert.equal(reply.statusCode, 200);
  await settle();
  assert.ok(doubleSends(logs.slice(start)).length > 0, 'se isto falhar, o onSend injetado não reproduz o defeito e o teste abaixo não prova nada');
});

test('rotas públicas (identidade, textos legais, formulários, saúde): status certo e nenhum envio duplo', async () => {
  const start = logs.length;
  const client = makeClient({ t: { app, logs: () => logs }, mailbox });
  const expect = async (promise: Promise<{ status: number; body: unknown }>, status: number, label: string) => {
    const reply = await promise;
    assert.equal(reply.status, status, `${label}: ${JSON.stringify(reply.body)}`);
    return reply;
  };
  const get = (url: string, status: number) => app.inject({ method: 'GET', url }).then((r) => assert.equal(r.statusCode, status, `${url}: ${r.body}`));

  await get('/healthz', 200);
  await get('/v1/legal/current?audience=passenger', 200);
  await get('/v1/legal/current', 400);
  await expect(client.call('POST', '/v1/waitlist', { body: { email: uniqueEmail('espera'), profile: 'passenger' } }), 200, 'waitlist');
  await expect(client.call('POST', '/v1/waitlist', { body: {} }), 400, 'waitlist inválida');
  await expect(client.call('POST', '/v1/driver-applications', { body: 'lixo' }), 400, 'candidatura inválida');

  const email = uniqueEmail('onsend');
  await expect(client.call('POST', '/v1/auth/register', { body: { accountType: 'passenger', fullName: 'Pessoa', email, password: PASSWORD, ...REGISTER_EXTRAS, birthDate: '2020-01-01' } }), 403, 'cadastro menor');
  const created = await client.register(email, 'passenger');
  await expect(client.call('POST', '/v1/auth/verify-email', { body: { accountType: 'passenger', identifier: email, code: '000000', password: PASSWORD } }), 400, 'código errado');
  await expect(client.call('POST', '/v1/auth/verify-email', { body: { accountType: 'passenger', identifier: email, code: created.code, password: PASSWORD } }), 200, 'verificar');
  await expect(client.call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: email, password: 'senha-errada-123', device: DEVICE } }), 401, 'login errado');
  const login = await expect(client.call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: email, password: PASSWORD, device: DEVICE } }), 200, 'login');
  const session = (login.body as { data: { accessToken: string; refreshToken: string } }).data;
  await expect(client.call('GET', '/v1/auth/me', { bearer: session.accessToken }), 200, 'me');
  await expect(client.call('GET', '/v1/auth/me'), 401, 'me sem sessão');
  await expect(client.call('POST', '/v1/auth/consents', { bearer: session.accessToken, body: { termsVersion: BASELINE_VERSION, privacyVersion: BASELINE_VERSION } }), 200, 'reaceite');
  const refreshed = await expect(client.call('POST', '/v1/auth/refresh', { body: { refreshToken: session.refreshToken } }), 200, 'refresh');
  const tokens = (refreshed.body as { data: { accessToken: string; refreshToken: string } }).data;
  await expect(client.call('POST', '/v1/auth/resend-verification', { body: { accountType: 'passenger', identifier: email } }), 200, 'reenvio');
  await expect(client.call('POST', '/v1/auth/forgot-password', { body: { accountType: 'passenger', email } }), 200, 'esqueci');
  await drainBackgroundTasks();
  await expect(client.call('POST', '/v1/auth/reset-password', { body: { accountType: 'passenger', email, code: '000000', newPassword: 'Senha-nova-12345' } }), 400, 'redefinir com código errado');
  await expect(client.call('POST', '/v1/auth/logout-all', { bearer: tokens.accessToken }), 200, 'sair de todas');
  const again = await client.registerAndLogin(uniqueEmail('excluir'), 'passenger');
  await expect(client.call('POST', '/v1/auth/delete-account', { bearer: again.accessToken, body: { password: PASSWORD } }), 200, 'excluir conta');
  await expect(client.call('POST', '/v1/auth/logout', { body: { refreshToken: again.refreshToken } }), 200, 'logout');
  await expect(client.call('GET', '/v1/driver/verification', { bearer: tokens.accessToken }), 401, 'motorista sem sessão viva');

  await drainBackgroundTasks();
  await settle();
  assert.deepEqual(doubleSends(logs.slice(start)).map((line) => line.slice(0, 300)), []);
});
