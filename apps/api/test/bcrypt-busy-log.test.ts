/**
 * Revisão S1 rodada 3c, B-8: a recusa da pista do bcrypt (503 `server_busy`) agora diz POR QUE no log estruturado (`reason`:
 * `origin` | `capacity` | `closing`), sem a chave de origem. Antes só havia `lane`, e um `TRUST_PROXY` errado (todos os clientes viram
 * um balde só) era um bloqueio silencioso, indistinguível de "pista cheia".
 *
 * Prova com o app real e a pista real: a pista é ocupada por reservas feitas aqui (sem gastar bcrypt) e a requisição de verdade
 * é recusada. O corpo da resposta NÃO ganha o motivo (o cliente não precisa dele e ele não ajuda quem ataca).
 */
import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import { adminBcrypt, BCRYPT_BUSY_RETRY_AFTER_SECONDS, reserveAdminBcrypt, reserveAppBcrypt, type BcryptReservation } from '../src/lib/bcrypt-pool.js';
import { ipBucket48 } from '../src/lib/ip-bucket.js';
import { hmacHex } from '../src/lib/token-crypto.js';
import { prepareDatabase, send, shutdown } from './helpers/harness.js';
import { DEVICE, makeClient, PEPPER, startIdentityApp, type Harness } from './helpers/identity-kit.js';

let h: Harness;
let held: BcryptReservation[] = [];

before(prepareDatabase);
after(shutdown);
beforeEach(async () => {
  held = [];
  h = await startIdentityApp();
});
afterEach(async () => {
  for (const reservation of held) reservation.release();
  await h.t.app.close();
});

const IP = '203.0.113.77';
const originKeyOf = (ip: string) => hmacHex(PEPPER, `bcrypt-origin:${ipBucket48(ip)}`);

/** Todas as linhas `bcrypt_busy` do log, já como objeto. */
function busyLines(): Array<Record<string, unknown>> {
  return h.t
    .logs()
    .split('\n')
    .filter((line) => line.includes('"event":"bcrypt_busy"'))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

const RUN = Math.random().toString(36).slice(2, 8);
let seq = 0;
/** Identificador NOVO a cada chamada: o banco de teste persiste e a espera progressiva do par (identificador + IP) devolveria 429 no lugar do 401. */
async function loginFrom(ip: string) {
  seq += 1;
  return makeClient(h).call('POST', '/v1/auth/login', {
    ip,
    body: { accountType: 'passenger', identifier: `ninguem${seq}-${RUN}@teste.vuumbora.dev`, password: 'Senha-qualquer-1', device: DEVICE },
  });
}

/** Ocupa a pista dos apps até a próxima reserva ser recusada. */
function fillAppLane(): void {
  for (;;) {
    try {
      held.push(reserveAppBcrypt(null));
    } catch {
      return;
    }
  }
}

describe('B-8 — o log da recusa do bcrypt diz o motivo', () => {
  test('apps, pista cheia: 503 server_busy e o log traz lane=app, reason=capacity', async () => {
    assert.equal((await loginFrom(IP)).status, 401, 'aquecimento: o hash descartável já existe e a pista atende');
    fillAppLane();
    const refused = await loginFrom('203.0.113.78');
    assert.equal(refused.status, 503);
    assert.equal(refused.body.error.code, 'server_busy');
    assert.equal(refused.headers['retry-after'], String(BCRYPT_BUSY_RETRY_AFTER_SECONDS));
    assert.ok(!('reason' in refused.body.error), 'o motivo é só do log, o cliente não o recebe');

    const lines = busyLines();
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!['lane'], 'app');
    assert.equal(lines[0]!['reason'], 'capacity');
  });

  test('apps, balde de origem no limite com a pista LIVRE: reason=origin, e a chave de origem NUNCA vai ao log', async () => {
    assert.equal((await loginFrom(IP)).status, 401, 'aquecimento');
    const originKey = originKeyOf(IP);
    held.push(reserveAppBcrypt(originKey), reserveAppBcrypt(originKey)); // o máximo do balde (2): a pista tem 8+ lugares livres
    const refused = await loginFrom(IP);
    assert.equal(refused.status, 503, JSON.stringify(refused.body));
    assert.equal(refused.body.error.code, 'server_busy');
    assert.equal((await loginFrom('203.0.113.79')).status, 401, 'outro balde é atendido: não foi capacidade');

    const lines = busyLines();
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!['reason'], 'origin');
    const logs = h.t.logs();
    assert.ok(!logs.includes(originKey), 'o HMAC do balde não está no log');
    assert.ok(!logs.includes(IP), 'o IP em claro não está no log (identidade dos apps)');
  });

  test('admin (o handler de erro do app, que a rota não captura): lane=admin, reason=capacity', async () => {
    await adminBcrypt().hash('aquecimento-da-pista-do-admin', 4);
    for (let i = 0; i < 5; i += 1) held.push(reserveAdminBcrypt(null)); // 1 vaga + fila de 4
    assert.throws(() => reserveAdminBcrypt(null), /bcrypt_busy/);
    const refused = await send(h.t.app, 'POST', '/auth/login', { body: { email: 'ninguem@teste.vuumbora.dev', password: 'Senha-qualquer-1' }, headers: { 'x-forwarded-for': '203.0.113.80' } });
    assert.equal(refused.status, 503, JSON.stringify(refused.body));
    assert.equal(refused.body.error.code, 'server_busy');

    const lines = busyLines();
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!['lane'], 'admin');
    assert.equal(lines[0]!['reason'], 'capacity');
  });
});
