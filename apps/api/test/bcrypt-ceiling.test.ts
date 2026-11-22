/**
 * A-1 da revisão S1 rodada 3 — teto GLOBAL de concorrência do bcrypt, com o app e o banco reais e o CUSTO REAL (12).
 *
 * O custo é o que importa aqui: com o custo baixo dos outros testes (4) a comparação gasta milissegundos e nada
 * disto aparece. Antes da correção: 30 `verify-email` de IPs diferentes levavam 14 s e o `/healthz` respondia em
 * 1,9 s (mediana) e até 6,2 s (máximo, só 4 sondas coubam na rajada).
 *
 * A ordem dos testes importa: o PRIMEIRO precisa da pista cheia ANTES de o app subir (ver `before`).
 */
import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { after, before, describe, test } from 'node:test';
import { adminBcrypt, appBcrypt } from '../src/lib/bcrypt-pool.js';
import { getDummyHash } from '../src/services/identity-service.js';
import { createAdmin, pool, prepareDatabase, PASSWORD as ADMIN_PASSWORD, send, shutdown } from './helpers/harness.js';
import { REGISTER_EXTRAS, startIdentityApp, uniqueEmail, type Harness } from './helpers/identity-kit.js';

// Custo real e pista pequena e conhecida (2 operações simultâneas, 4 na fila). Depois do `auth-env.js` (que fixa 4).
process.env['AUTH_BCRYPT_COST'] = '12';
process.env['AUTH_BCRYPT_CONCURRENCY'] = '2';
process.env['AUTH_BCRYPT_QUEUE_MAX'] = '4';
const SIZE = 2;
const QUEUE = 4;

let h: Harness;
let fillersAtBoot: Array<Promise<unknown>> = [];

const post = (url: string, ip: string, payload: unknown) =>
  h.t.app.inject({ method: 'POST', url, headers: { 'x-forwarded-for': ip, 'user-agent': 'okhttp/4.12 (Android)' }, payload: payload as object });
const verifyBody = (identifier: string) => ({ accountType: 'passenger', identifier, code: '123456', password: 'Senha-de-teste-123' });
const resetBody = (email: string) => ({ accountType: 'passenger', email, code: '123456', newPassword: 'Nova-senha-9876' });
const attempts = async () => (await pool.query('SELECT count(*)::int AS n FROM login_attempts')).rows[0].n as number;
const accounts = async () => (await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n as number;

/** Enche a pista (vagas + fila) com trabalho lento de verdade; devolve as promessas para o teste esperar. */
function fill(lane: ReturnType<typeof appBcrypt>): Array<Promise<unknown>> {
  return Array.from({ length: lane.size + lane.maxQueue }, () => lane.hash('enchendo-a-pista', 12).catch(() => undefined));
}

before(async () => {
  await prepareDatabase();
  // A pista dos apps nasce CHEIA, antes de o app montar as rotas: o aquecimento do hash descartável (feito ao montar)
  // é recusado por falta de vaga. Se essa recusa ficasse guardada, todo login de conta desconhecida falharia
  // para sempre — o primeiro teste prova que não fica.
  fillersAtBoot = fill(appBcrypt());
  assert.equal(appBcrypt().saturated, true);
  h = await startIdentityApp();
  await Promise.all(fillersAtBoot);
});
after(async () => {
  await h.t.app.close();
  await shutdown();
});

describe('A-1: teto global do bcrypt', () => {
  test('o hash descartável que foi RECUSADO no aquecimento não fica guardado: login de conta desconhecida funciona', async () => {
    await pool.query('TRUNCATE login_attempts');
    const reply = await post('/v1/auth/login', '10.55.0.1', { accountType: 'passenger', identifier: uniqueEmail('naoexiste'), password: 'Senha-de-teste-123' });
    assert.equal(reply.statusCode, 401, reply.body);
    assert.equal(JSON.parse(reply.body).error.code, 'invalid_credentials');
    assert.equal(typeof (await getDummyHash(12)), 'string');
  });

  test('rajada de 30 verify-email de IPs distintos: o bcrypt nunca passa do teto, o excesso é 503 imediato e o /healthz e o login do admin seguem rápidos', async () => {
    await pool.query('TRUNCATE login_attempts');
    const admin = await createAdmin('suporte'); // papel sem 2FA obrigatório
    const adminLogin = () => send(h.t.app, 'POST', '/auth/login', { body: { email: admin.email, password: ADMIN_PASSWORD }, headers: { 'x-forwarded-for': '10.66.0.1' } });
    assert.equal((await adminLogin()).status, 200, 'aquecimento: a pista do admin sobe a thread dela');
    await h.t.app.inject({ method: 'GET', url: '/healthz' });
    const baseline = appBcrypt().stats();

    const probes: Array<{ ms: number; status: number }> = [];
    let running = true;
    const prober = (async () => {
      while (running) {
        const t0 = performance.now();
        const r = await h.t.app.inject({ method: 'GET', url: '/healthz' });
        probes.push({ ms: performance.now() - t0, status: r.statusCode });
        await sleep(15);
      }
    })();

    const started = performance.now();
    const burst = Promise.all(Array.from({ length: 30 }, (_, i) => post('/v1/auth/verify-email', `10.77.0.${i + 1}`, verifyBody(uniqueEmail('rajada')))));
    // Espera a pista dos apps lotar e trabalhar (sem fixar um tempo: o banco de CI pode ser lento).
    for (const deadline = Date.now() + 5000; appBcrypt().stats().active < SIZE && Date.now() < deadline; ) await sleep(5);
    assert.equal(appBcrypt().stats().active, SIZE, 'a pista dos apps está ocupada de verdade');
    const adminStarted = performance.now();
    const adminReply = await adminLogin();
    const adminMs = performance.now() - adminStarted;
    const replies = await burst;
    const burstMs = performance.now() - started;
    running = false;
    await prober;

    const stats = appBcrypt().stats();
    const byStatus = (status: number) => replies.filter((r) => r.statusCode === status);
    // (1) O teto: nunca mais operações simultâneas que o configurado, nunca fila acima do limite.
    assert.ok(stats.peakActive <= SIZE, `pico de ${stats.peakActive} operações simultâneas (teto ${SIZE})`);
    assert.ok(stats.peakWaiting <= QUEUE, `fila chegou a ${stats.peakWaiting} (limite ${QUEUE})`);
    // (2) O excesso é recusado, com resposta estruturada; o resto é atendido normalmente (conta desconhecida = 400).
    assert.deepEqual([...new Set(replies.map((r) => r.statusCode))].sort(), [400, 503], 'só atendida (400) ou recusada (503)');
    assert.ok(byStatus(503).length >= 10, `só ${byStatus(503).length} de 30 foram recusadas: o teto não está barrando`);
    for (const refused of byStatus(503)) {
      assert.equal(JSON.parse(refused.body).error.code, 'server_busy');
      assert.equal(JSON.parse(refused.body).error.retryAfterSeconds, 3);
      assert.equal(refused.headers['retry-after'], '3');
    }
    assert.equal(stats.completed - baseline.completed, byStatus(400).length, 'cada requisição atendida gastou exatamente UMA operação de bcrypt');
    // (3) O servidor segue vivo: o /healthz respondeu várias vezes DURANTE a rajada e nunca demorou 200 ms.
    assert.ok(probes.length >= 10, `só ${probes.length} sondas do /healthz couberam na rajada de ${burstMs.toFixed(0)} ms (o laço de eventos parou)`);
    const worst = Math.max(...probes.map((p) => p.ms));
    assert.ok(worst < 200, `/healthz demorou ${worst.toFixed(0)} ms durante a rajada (limite 200 ms)`);
    assert.ok(probes.every((p) => p.status === 200), '/healthz sempre 200');
    // (4) O login do admin tem pista própria: entra durante a rajada pública, sem fila nem recusa.
    assert.equal(adminReply.status, 200, JSON.stringify(adminReply.body));
    assert.ok(adminMs < 400, `login do admin levou ${adminMs.toFixed(0)} ms durante a rajada pública`);
    console.log(`# rajada de 30: ${byStatus(400).length} atendidas, ${byStatus(503).length} recusadas, ${burstMs.toFixed(0)} ms; /healthz ${probes.length} sondas, máx ${worst.toFixed(0)} ms; login do admin ${adminMs.toFixed(0)} ms; pico ${stats.peakActive}/${SIZE}, fila ${stats.peakWaiting}/${QUEUE}`);
  });

  test('pista cheia: login, cadastro, verificação e redefinição recusam com 503 ANTES de reservar tentativa ou criar conta', async () => {
    await pool.query('TRUNCATE login_attempts');
    const accountsBefore = await accounts();
    const fillers = fill(appBcrypt());
    assert.equal(appBcrypt().saturated, true);

    const email = uniqueEmail('cheia');
    const replies = {
      login: await post('/v1/auth/login', '10.88.0.1', { accountType: 'passenger', identifier: email, password: 'Senha-de-teste-123' }),
      register: await post('/v1/auth/register', '10.88.0.2', { accountType: 'passenger', fullName: 'Pessoa', email, password: 'Senha-de-teste-123', ...REGISTER_EXTRAS }),
      verify: await post('/v1/auth/verify-email', '10.88.0.3', verifyBody(email)),
      reset: await post('/v1/auth/reset-password', '10.88.0.4', resetBody(email)),
    };
    for (const [name, reply] of Object.entries(replies)) {
      assert.equal(reply.statusCode, 503, `${name}: ${reply.body}`);
      assert.equal(JSON.parse(reply.body).error.code, 'server_busy', name);
      assert.equal(reply.headers['retry-after'], '3', name);
    }
    assert.equal(await attempts(), 0, 'nenhuma falha foi reservada para quem nem chegou a ser comparado');
    assert.equal(await accounts(), accountsBefore, 'nenhuma conta foi criada');

    await Promise.all(fillers);
    const again = await post('/v1/auth/login', '10.88.0.1', { accountType: 'passenger', identifier: email, password: 'Senha-de-teste-123' });
    assert.equal(again.statusCode, 401, 'a pista esvaziou: volta a atender (e o par não ficou com espera)');
  });

  test('pista do ADMIN cheia: 503 estruturado (não 500) e sem falha reservada para o par', async () => {
    const admin = await createAdmin('suporte');
    const failuresBefore = (await pool.query('SELECT count(*)::int AS n FROM admin_login_failures')).rows[0].n as number;
    const fillers = fill(adminBcrypt());
    const reply = await send(h.t.app, 'POST', '/auth/login', { body: { email: admin.email, password: ADMIN_PASSWORD }, headers: { 'x-forwarded-for': '10.99.0.9' } });
    assert.equal(reply.status, 503, JSON.stringify(reply.body));
    assert.equal(reply.body.error.code, 'server_busy');
    assert.equal(reply.headers['retry-after'], '3');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM admin_login_failures')).rows[0].n, failuresBefore, 'a espera progressiva do admin não cresceu');
    await Promise.all(fillers);
    const again = await send(h.t.app, 'POST', '/auth/login', { body: { email: admin.email, password: ADMIN_PASSWORD }, headers: { 'x-forwarded-for': '10.99.0.9' } });
    assert.equal(again.status, 200, 'esvaziou: o admin entra');
  });
});
