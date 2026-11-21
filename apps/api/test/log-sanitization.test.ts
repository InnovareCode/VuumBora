import './helpers/setup.js';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareDatabase, shutdown, startApp, type TestApp } from './helpers/harness.js';
import { describeErrorForLog } from '../src/lib/safe-error.js';

let t: TestApp;
before(async () => {
  await prepareDatabase();
  t = await startApp((app) => {
    // Rota de teste que lança um erro cuja mensagem carrega dado pessoal (como o `pg` faz com valor inválido).
    // Dentro de `register` (contexto encapsulado), como as rotas reais: o bug original só aparecia assim.
    app.register(async (instance) => {
      instance.get('/__teste-500', async () => {
        throw Object.assign(new Error('invalid input syntax for type uuid: "PESSOA-SECRETA-42"'), { code: '22P02' });
      });
    });
  });
});
after(async () => {
  await t.app.close();
  await shutdown();
});

// Mutações verificadas (ver handoff): (1) trocar `...describeErrorForLog(err)` por
// `message: err.message` no handler do src/app.ts derruba o teste do 500; (2) mover
// os handlers para depois dos `register` derruba o teste do corpo malformado (o do 500
// ainda passa nesse caso, protegido pelo serializer `err` — rede de segurança, não a defesa principal).

test('corpo malformado: 400 no envelope da API e NADA do corpo no log', async () => {
  const marker = 'MARCADORPII9@example.com';
  const response = await t.app.inject({
    method: 'POST',
    url: '/v1/admin/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: marker,
  });
  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).error.code, 'invalid_body');

  const logs = t.logs();
  assert.ok(logs.includes('request_rejected'), 'a rejeição precisa continuar sendo logada (observabilidade)');
  assert.ok(!logs.includes('MARCADORPII9'), 'dado pessoal do corpo vazou para o log');
  assert.ok(!logs.includes('example.com'), 'dado pessoal do corpo vazou para o log');
});

test('querystring com busca livre nunca entra no log', async () => {
  const response = await t.app.inject({ method: 'GET', url: '/v1/admin/driver-applications?q=84977000000-BUSCAPII' });
  assert.equal(response.statusCode, 401);
  assert.ok(!t.logs().includes('BUSCAPII'));
  assert.ok(!t.logs().includes('84977000000'));
});

test('erro inesperado (500) não loga a mensagem, só nome e código', async () => {
  const response = await t.app.inject({ method: 'GET', url: '/__teste-500' });
  assert.equal(response.statusCode, 500);
  const logs = t.logs();
  assert.ok(logs.includes('unhandled_error'));
  assert.ok(logs.includes('22P02'));
  assert.ok(!logs.includes('PESSOA-SECRETA-42'));
});

test('describeErrorForLog nunca devolve a mensagem', () => {
  const described = describeErrorForLog(Object.assign(new Error('segredo'), { code: 'X1' }));
  assert.deepEqual(described, { errorName: 'Error', errorCode: 'X1' });
  assert.ok(!JSON.stringify(described).includes('segredo'));
});
