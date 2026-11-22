/**
 * A-1 da revisão S1 rodada 3 — a conferência de código (verify-email e reset-password) reserva o PAR
 * (tipo + identificador + IP) ANTES do bcrypt. Custo de bcrypt baixo (o do `auth-env.js`): aqui o que se prova é
 * a ORDEM (reserva antes, bcrypt depois), não o custo. O custo real e o teto global estão em `bcrypt-ceiling.test.ts`.
 */
import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { appBcrypt } from '../src/lib/bcrypt-pool.js';
import { getDummyHash } from '../src/services/identity-service.js';
import { pool, prepareDatabase, shutdown } from './helpers/harness.js';
import { startIdentityApp, uniqueEmail, type Harness } from './helpers/identity-kit.js';

let h: Harness;
before(async () => {
  await prepareDatabase();
  h = await startIdentityApp();
  await getDummyHash(4); // o aquecimento feito ao montar as rotas termina ANTES de os testes contarem operações
});
after(async () => {
  await h.t.app.close();
  await shutdown();
});

const post = (url: string, ip: string, payload: unknown) =>
  h.t.app.inject({ method: 'POST', url, headers: { 'x-forwarded-for': ip, 'user-agent': 'okhttp/4.12 (Android)' }, payload: payload as object });
const verifyBody = (identifier: string) => ({ accountType: 'passenger', identifier, code: '123456', password: 'Senha-de-teste-123' });
const resetBody = (email: string) => ({ accountType: 'passenger', email, code: '123456', newPassword: 'Nova-senha-9876' });

describe('A-1: reserva por par antes do bcrypt', () => {
  test('verify-email e reset-password reservam o PAR (identificador + IP) ANTES do bcrypt: a 11ª tentativa é 429 e não gasta bcrypt', async () => {
    await pool.query('TRUNCATE login_attempts');
    const ip = '10.44.0.1';
    const email = uniqueEmail('par');
    for (const [route, body] of [['/v1/auth/verify-email', verifyBody(email)], ['/v1/auth/reset-password', resetBody(email)]] as const) {
      const completedBefore = appBcrypt().stats().completed;
      for (let i = 0; i < 10; i += 1) {
        const ok = await post(route, ip, body);
        assert.equal(ok.statusCode, 400, `${route} tentativa ${i + 1}: ${ok.body}`); // code_expired: conta desconhecida
      }
      const afterTen = appBcrypt().stats().completed;
      assert.equal(afterTen - completedBefore, 10, 'dez tentativas, dez operações de bcrypt');

      const blocked = await post(route, ip, body);
      assert.equal(blocked.statusCode, 429, `${route}: ${blocked.body}`);
      assert.equal(JSON.parse(blocked.body).error.code, 'too_many_attempts');
      assert.equal(blocked.headers['retry-after'], String(15 * 60), 'a janela do limite de conferência (15 min)');
      assert.equal(appBcrypt().stats().completed, afterTen, 'a recusa veio ANTES do bcrypt: nenhuma operação gasta');

      // O par é identificador + IP: outro IP, ou outro identificador do mesmo IP, não é afetado.
      assert.equal((await post(route, '10.44.0.2', body)).statusCode, 400, 'outro IP, mesmo identificador');
      const other = route.endsWith('verify-email') ? verifyBody(uniqueEmail('par')) : resetBody(uniqueEmail('par'));
      assert.equal((await post(route, ip, other)).statusCode, 400, 'mesmo IP, outro identificador');
    }
    // Verificação e redefinição são pares DIFERENTES (finalidade na chave): esgotar uma não trava a outra.
    const other = uniqueEmail('par');
    for (let i = 0; i < 10; i += 1) await post('/v1/auth/verify-email', ip, verifyBody(other));
    assert.equal((await post('/v1/auth/verify-email', ip, verifyBody(other))).statusCode, 429);
    assert.equal((await post('/v1/auth/reset-password', ip, resetBody(other))).statusCode, 400);
  });
});
