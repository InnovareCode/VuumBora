/**
 * A-1 da revisão S1 rodada 3 — teto GLOBAL de concorrência do bcrypt, com o app e o banco reais e o CUSTO REAL (12).
 *
 * O custo é o que importa aqui: com o custo baixo dos outros testes (4) a comparação gasta milissegundos e nada
 * disto aparece. Antes da correção: 30 `verify-email` de IPs diferentes levavam 14 s e o `/healthz` respondia em
 * 1,9 s (mediana) e até 6,2 s (máximo, só 4 sondas coubam na rajada).
 *
 * A ordem dos testes importa: o PRIMEIRO precisa da pista cheia ANTES de o app subir (ver `before`).
 * Rodada 3b: os dois últimos blocos (B-1 e M-1) provam, com o custo real, que o lugar na pista é tomado ANTES de gravar o
 * contador e que um balde de IP não ocupa a fila inteira.
 */
import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { after, before, describe, test } from 'node:test';
import type { Pool } from 'pg';
import { loadAuthConfig } from '../src/lib/auth-config.js';
import { adminBcrypt, appBcrypt } from '../src/lib/bcrypt-pool.js';
import { loadLegalConfig } from '../src/lib/legal-config.js';
import { resetPassword, verifyEmail } from '../src/services/account-recovery-service.js';
import { verifyPasswordWithGuard } from '../src/services/admin-auth-service.js';
import { getDummyHash, login, registerAccount } from '../src/services/identity-service.js';
import { createAdmin, pool, prepareDatabase, PASSWORD as ADMIN_PASSWORD, send, shutdown } from './helpers/harness.js';
import { REGISTER_EXTRAS, startIdentityApp, uniqueEmail, type Harness } from './helpers/identity-kit.js';

// Custo real e pista pequena e conhecida (2 operações simultâneas, 4 na fila). Depois do `auth-env.js` (que fixa 4).
process.env['AUTH_BCRYPT_COST'] = '12';
process.env['AUTH_BCRYPT_CONCURRENCY'] = '2';
process.env['AUTH_BCRYPT_QUEUE_MAX'] = '4';
const SIZE = 2;
const QUEUE = 4;
/** Ver a justificativa no item (3) da rajada: protegem o defeito (segundos), não a velocidade da máquina. */
const HEALTHZ_MEDIAN_LIMIT_MS = 50;
const HEALTHZ_WORST_LIMIT_MS = 1000;
/** Ciclo normal da sonda = chamada (poucos ms) + pausa de 15 ms. Só o que passa de 50 ms por ciclo entra na conta da parada total. */
const HEALTHZ_CYCLE_FLOOR_MS = 50;
const HEALTHZ_STALL_BUDGET_MS = 1000;
const ADMIN_LOGIN_LIMIT_MS = 1000;

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
    // Duração de cada CICLO da sonda (a chamada + a pausa de 15 ms). A latência da chamada (`ms`) não vê uma parada do laço que
    // caia DURANTE a pausa (o relógio só começa depois dela); o ciclo inteiro vê.
    const cycles: number[] = [];
    let running = true;
    const prober = (async () => {
      while (running) {
        const t0 = performance.now();
        const r = await h.t.app.inject({ method: 'GET', url: '/healthz' });
        probes.push({ ms: performance.now() - t0, status: r.statusCode });
        await sleep(15);
        cycles.push(performance.now() - t0);
      }
    })();

    const started = performance.now();
    let burstSettled = false;
    const burst = Promise.all(Array.from({ length: 30 }, (_, i) => post('/v1/auth/verify-email', `10.77.0.${i + 1}`, verifyBody(uniqueEmail('rajada')))))
      .finally(() => { burstSettled = true; });
    // Espera a pista dos apps lotar e trabalhar (sem fixar um tempo: o banco de CI pode ser lento).
    for (const deadline = Date.now() + 5000; appBcrypt().stats().active < SIZE && Date.now() < deadline; ) await sleep(5);
    assert.equal(appBcrypt().stats().active, SIZE, 'a pista dos apps está ocupada de verdade');
    const adminStarted = performance.now();
    const adminReply = await adminLogin();
    const adminMs = performance.now() - adminStarted;
    const adminFinishedDuringBurst = !burstSettled; // lido logo ao voltar do login: a rajada pública ainda tinha operação em curso?
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
    // F4 da Íris (passada 3): na rajada SIMULTÂNEA a recusa também não gasta tentativa (antes: 30 linhas para 30 requisições, 20 recusadas).
    assert.equal(await attempts(), byStatus(400).length, 'só as requisições atendidas reservaram tentativa do par; as 503 não gravaram nada');
    // (3) O servidor segue vivo: o /healthz respondeu várias vezes DURANTE a rajada, e o laço de eventos não ficou parado.
    // Por que NÃO um máximo de 200 ms (N1 da passada 4 da Íris): o máximo falhou 3 vezes em ~107 execuções (223, 228 e 233 ms)
    // com o típico de 16 a 34 ms, nas três condições (sem afinidade, 2 CPUs, carga 2x). Não era bcrypt na thread principal (esse
    // trava por SEGUNDOS): é UMA parada do laço por disputa de CPU (2 vagas de bcrypt + principal + Postgres na mesma máquina).
    // Um limite absoluto apertado mede a máquina, não o código. O que o teste protege é o defeito original: o bcrypt na thread
    // principal parando o laço (mediana de 1,9 s e máximo de 6,2 s). Uma parada ISOLADA de ~0,2 s é ruído; o defeito é parada
    // SUSTENTADA e somada (6 comparações de ~0,5 s = ~2,9 s). Por isso quatro travas, cada uma com folga:
    //  - pelo menos 10 sondas dentro da rajada (a sonda só reinicia quando a anterior responde);
    //  - mediana < 50 ms: o laço NÃO está ocupado de forma sustentada (uma parada isolada não mexe na mediana);
    //  - máximo < 1000 ms: nenhuma parada de segundos;
    //  - parada TOTAL < 1000 ms: a soma, por ciclo da sonda, do que passou de 50 ms. É esta a que pega o bcrypt SÍNCRONO na
    //    principal com teto (cada comparação para o laço por ~0,5 s, mas as paradas vêm em blocos de ~1 s e a latência máxima
    //    da chamada fica no limite), sem reprovar a parada única de 0,2 s do ruído. Medido em cópia: esse mutante soma 2,8 a 2,9 s;
    //    as execuções limpas, 0 a 60 ms (máquina livre, presa a 2 CPUs e com carga 2x); uma parada simulada de 250 ms soma ~220 ms
    //    e 4 delas (~0,9 s) ainda passam.
    assert.ok(probes.length >= 10, `só ${probes.length} sondas do /healthz couberam na rajada de ${burstMs.toFixed(0)} ms (o laço de eventos parou)`);
    const sortedMs = probes.map((p) => p.ms).sort((a, b) => a - b);
    const worst = sortedMs[sortedMs.length - 1]!;
    const median = sortedMs[Math.floor(sortedMs.length / 2)]!;
    const stalledMs = cycles.reduce((sum, cycle) => sum + Math.max(0, cycle - HEALTHZ_CYCLE_FLOOR_MS), 0);
    assert.ok(median < HEALTHZ_MEDIAN_LIMIT_MS, `/healthz teve mediana de ${median.toFixed(0)} ms durante a rajada (limite ${HEALTHZ_MEDIAN_LIMIT_MS} ms): o laço está ocupado de forma sustentada`);
    assert.ok(worst < HEALTHZ_WORST_LIMIT_MS, `/healthz demorou ${worst.toFixed(0)} ms durante a rajada (limite ${HEALTHZ_WORST_LIMIT_MS} ms)`);
    assert.ok(stalledMs < HEALTHZ_STALL_BUDGET_MS, `o laço de eventos ficou parado ${stalledMs.toFixed(0)} ms no total durante a rajada (limite ${HEALTHZ_STALL_BUDGET_MS} ms, contando só o que passa de ${HEALTHZ_CYCLE_FLOOR_MS} ms por ciclo da sonda)`);
    assert.ok(probes.every((p) => p.status === 200), '/healthz sempre 200');
    // (4) O login do admin tem pista própria: entra durante a rajada pública, sem fila nem recusa.
    // Mesma lição do N1: um único login medido contra 400 ms só tinha margem de 4x sobre o pior caso medido (96 ms com 2 CPUs e
    // carga 2x), e uma parada de ~0,2 s do laço já o aproximava do limite. A prova que não depende da velocidade da máquina é a
    // ORDEM: com pista própria o admin termina enquanto a rajada pública ainda tem operação em curso (ele leva dezenas de ms;
    // a rajada, 3 rodadas de ~480 ms). Se ele esperasse numa fila de bcrypt dos apps, terminaria DEPOIS das atendidas.
    // O limite absoluto fica só como rede contra "segundos".
    assert.equal(adminReply.status, 200, JSON.stringify(adminReply.body));
    assert.ok(adminFinishedDuringBurst, `o login do admin (${adminMs.toFixed(0)} ms) só terminou DEPOIS de a rajada pública acabar: ele esperou na fila dos apps`);
    assert.ok(adminMs < ADMIN_LOGIN_LIMIT_MS, `login do admin levou ${adminMs.toFixed(0)} ms durante a rajada pública (limite ${ADMIN_LOGIN_LIMIT_MS} ms)`);
    console.log(`# rajada de 30: ${byStatus(400).length} atendidas, ${byStatus(503).length} recusadas, ${burstMs.toFixed(0)} ms; /healthz ${probes.length} sondas, mediana ${median.toFixed(0)} ms, máx ${worst.toFixed(0)} ms, laço parado ${stalledMs.toFixed(0)} ms no total; login do admin ${adminMs.toFixed(0)} ms; pico ${stats.peakActive}/${SIZE}, fila ${stats.peakWaiting}/${QUEUE}`);
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

// ---------------------------------------------------------------------------------------------------------------
// Rodada 3b: B-1 (lugar na pista ANTES de gravar o contador) e M-1 (justiça por origem, pela HTTP).
// ---------------------------------------------------------------------------------------------------------------

/**
 * Pool do pg que, na PRIMEIRA reserva transacional (`connect`), enche a pista inteira com trabalho lento (custo 12): reproduz, de forma
 * determinística, a janela do B-1 (a pista enche ENTRE a checagem de capacidade e o bcrypt, enquanto a rota grava o contador).
 */
function poolThatFillsTheLane(lane: ReturnType<typeof appBcrypt>) {
  const fillers: Array<Promise<unknown>> = [];
  let fired = false;
  const fire = () => {
    if (fired) return;
    fired = true;
    fillers.push(...fill(lane));
  };
  const wrapped = {
    // Só `connect` dispara: é por onde passam as reservas do par/limite (transação), DEPOIS de a rota ter tomado o lugar na pista.
    // As leituras simples (`query`, como a conferência da versão dos documentos no cadastro) vêm ANTES do lugar e não contam.
    query: (...args: unknown[]) => (pool.query as (...a: unknown[]) => Promise<unknown>).apply(pool, args),
    connect: async () => {
      fire();
      return pool.connect();
    },
  } as unknown as Pool;
  return { pool: wrapped, fillers, fired: () => fired };
}

const CTX = { ipHash: null, userAgentFamily: 'x', requestId: 'r', bcryptOrigin: 'origem-do-teste-b1' } as const;
const mailDeps = { mail: { send: async () => undefined }, onMailFailure: () => undefined };

describe('B-1: a pista que enche ENTRE a checagem e o bcrypt não consome o contador do titular sem comparar', () => {
  test('login: com a pista enchendo enquanto o par é reservado, a comparação AINDA roda (nada de 503 depois da falha gravada)', async () => {
    await getDummyHash(12);
    await pool.query('TRUNCATE login_attempts');
    const config = loadAuthConfig()!;
    const lane = appBcrypt();
    const rig = poolThatFillsTheLane(lane);
    const completedBefore = lane.stats().completed;

    const result = await login(rig.pool, config, { accountType: 'passenger', identifier: uniqueEmail('janela-login'), password: 'Senha-de-teste-123' }, CTX);
    assert.equal(rig.fired(), true, 'a pista foi enchida no meio (durante a reserva do par)');
    assert.equal(result.kind, 'invalid_credentials', 'a comparação rodou: o titular não levou 503 depois de a falha do par ser gravada');
    assert.equal(await attempts(), 1, 'a falha gravada corresponde a UMA comparação que de fato aconteceu');
    await Promise.all(rig.fillers);
    assert.ok(lane.stats().completed > completedBefore, 'e a operação foi contada como concluída');
    assert.equal(lane.stats().reserved, 0, 'nenhum lugar ficou preso');
  });

  test('verify-email: idem (a reserva do par de conferência não é gasta sem o bcrypt rodar)', async () => {
    await getDummyHash(12);
    await pool.query('TRUNCATE login_attempts');
    const rig = poolThatFillsTheLane(appBcrypt());
    const result = await verifyEmail(rig.pool, loadAuthConfig()!, { accountType: 'passenger', identifier: uniqueEmail('janela-verify'), code: '123456', password: 'Senha-de-teste-123' }, CTX);
    assert.equal(rig.fired(), true);
    assert.deepEqual(result, { kind: 'expired' }, 'conta desconhecida: o bcrypt rodou e o desfecho é o de sempre');
    assert.equal(await attempts(), 1);
    await Promise.all(rig.fillers);
    assert.equal(appBcrypt().stats().reserved, 0);
  });

  test('reset-password: idem', async () => {
    await pool.query('TRUNCATE login_attempts');
    const rig = poolThatFillsTheLane(appBcrypt());
    const result = await resetPassword(rig.pool, loadAuthConfig()!, mailDeps, { accountType: 'passenger', email: uniqueEmail('janela-reset'), code: '123456', newPassword: 'Nova-senha-9876' }, CTX);
    assert.equal(rig.fired(), true);
    assert.deepEqual(result, { kind: 'expired' });
    assert.equal(await attempts(), 1);
    await Promise.all(rig.fillers);
    assert.equal(appBcrypt().stats().reserved, 0);
  });

  test('cadastro: a conta é criada mesmo que a pista encha depois do teto de e-mails e do limite do cadastro serem gastos', async () => {
    await pool.query('TRUNCATE login_attempts');
    const accountsBefore = await accounts();
    const rig = poolThatFillsTheLane(appBcrypt());
    const email = uniqueEmail('janela-cadastro');
    const result = await registerAccount(
      rig.pool, loadAuthConfig()!, loadLegalConfig(), mailDeps,
      { accountType: 'passenger', fullName: 'Pessoa', email, password: 'Senha-de-teste-123', phone: null, ...REGISTER_EXTRAS }, CTX,
    );
    assert.equal(rig.fired(), true);
    assert.equal(result.kind, 'ok', 'o limite do cadastro foi gasto E o hash rodou: não sobrou limite gasto sem conta');
    assert.equal(await accounts(), accountsBefore + 1);
    await Promise.all(rig.fillers);
  });

  test('admin: a espera progressiva do dono não cresce por uma comparação que não rodou, mesmo com a pista do admin enchendo no meio', async () => {
    const failuresBefore = (await pool.query('SELECT count(*)::int AS n FROM admin_login_failures')).rows[0].n as number;
    const rig = poolThatFillsTheLane(adminBcrypt());
    const result = await verifyPasswordWithGuard(rig.pool, { email: `janela-${uniqueEmail('admin')}`, record: null, password: 'qualquer-senha-123', ipAddress: '10.98.0.1', purpose: 'login' });
    assert.equal(rig.fired(), true);
    assert.deepEqual(result, { kind: 'invalid' }, 'a comparação rodou (e-mail desconhecido = senha errada)');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM admin_login_failures')).rows[0].n - failuresBefore, 1);
    await Promise.all(rig.fillers);
    assert.equal(adminBcrypt().stats().reserved, 0);
  });
});

describe('M-1: justiça por origem na fila do bcrypt, pela HTTP', () => {
  test('um /48 do atacante (8 /64 diferentes) segura no máximo 2 lugares de espera: o excesso é 503 e o titular de OUTRO IP é atendido', async () => {
    await pool.query('TRUNCATE login_attempts');
    const lane = appBcrypt();
    // Ocupa as vagas de RODAR com trabalho lento (custo 13, ~1 s): nada do que chegar agora começa antes de a rajada inteira ser decidida, mesmo num runner de 2 CPUs.
    const runners = Array.from({ length: SIZE }, () => lane.hash('ocupando-a-vaga', 13).catch(() => undefined));
    assert.equal(lane.stats().active, SIZE);
    const before = lane.stats();

    const attackers = Array.from({ length: 8 }, (_, i) => post('/v1/auth/verify-email', `2001:db8:abcd:${i + 1}::1`, verifyBody(uniqueEmail('atacante'))));
    const titular = post('/v1/auth/verify-email', '10.123.0.1', verifyBody(uniqueEmail('titular')));
    const replies = await Promise.all(attackers);
    const titularReply = await titular;
    await Promise.all(runners);

    const statuses = replies.map((r) => r.statusCode).sort();
    assert.deepEqual(statuses, [400, 400, 503, 503, 503, 503, 503, 503], `8 /64 do MESMO /48: 2 lugares de espera, 6 recusadas (${statuses.join(',')})`);
    for (const refused of replies.filter((r) => r.statusCode === 503)) {
      assert.equal(JSON.parse(refused.body).error.code, 'server_busy');
      assert.equal(refused.headers['retry-after'], '3');
    }
    assert.equal(titularReply.statusCode, 400, `o titular de outro IP foi atendido (conta desconhecida = 400), não recusado: ${titularReply.body}`);
    assert.equal(lane.stats().rejectedByOrigin - before.rejectedByOrigin, 6, 'as 6 recusas foram pelo limite do balde, não pela pista cheia');
    assert.equal(lane.stats().reserved, 0, 'nenhum lugar ficou preso depois da rajada');
  });

  test('a mesma rajada do mesmo IPv4: 2 lugares de espera, o resto 503; a recusa não grava tentativa nenhuma para quem foi recusado', async () => {
    await pool.query('TRUNCATE login_attempts');
    const lane = appBcrypt();
    const runners = Array.from({ length: SIZE }, () => lane.hash('ocupando-a-vaga', 13).catch(() => undefined));
    assert.equal(lane.stats().active, SIZE);
    const replies = await Promise.all(Array.from({ length: 5 }, (_, i) => post('/v1/auth/login', '10.124.0.1', { accountType: 'passenger', identifier: uniqueEmail(`mesmo-ip-${i}`), password: 'Senha-de-teste-123' })));
    await Promise.all(runners);
    assert.equal(replies.filter((r) => r.statusCode === 503).length, 3);
    assert.equal(replies.filter((r) => r.statusCode === 401).length, 2);
    assert.equal(await attempts(), 2, 'só as 2 requisições admitidas reservaram tentativa; as 3 recusadas não gravaram nada');
  });

  test('pista do ADMIN: um /48 do atacante também segura só 2 lugares de espera, e o dono entra de outro IP', async () => {
    const admin = await createAdmin('suporte');
    const lane = adminBcrypt();
    const runner = lane.hash('ocupando-a-vaga', 13).catch(() => undefined);
    assert.equal(lane.stats().active, 1);
    const before = lane.stats();
    const attackers = Array.from({ length: 4 }, (_, i) =>
      send(h.t.app, 'POST', '/auth/login', { body: { email: `atacante-${i}-${uniqueEmail()}`, password: 'qualquer-senha-123' }, headers: { 'x-forwarded-for': `2001:db8:beef:${i + 1}::1` } }));
    const owner = send(h.t.app, 'POST', '/auth/login', { body: { email: admin.email, password: ADMIN_PASSWORD }, headers: { 'x-forwarded-for': '10.125.0.1' } });
    const replies = await Promise.all(attackers);
    const ownerReply = await owner;
    await runner;
    assert.deepEqual(replies.map((r) => r.status).sort(), [401, 401, 503, 503]);
    assert.equal(ownerReply.status, 200, JSON.stringify(ownerReply.body));
    assert.equal(lane.stats().rejectedByOrigin - before.rejectedByOrigin, 2);
  });
});

describe('F4: o 503 da rajada SIMULTÂNEA também não gasta tentativa, limite nem conta (a reserva só vem depois do lugar na pista)', () => {
  test('rajada de 30 reset-password de IPs distintos: uma linha de tentativa por requisição ATENDIDA, nenhuma por recusada', async () => {
    await pool.query('TRUNCATE login_attempts');
    const replies = await Promise.all(Array.from({ length: 30 }, (_, i) => post('/v1/auth/reset-password', `10.131.0.${i + 1}`, resetBody(uniqueEmail('rajada-reset')))));
    const served = replies.filter((r) => r.statusCode !== 503).length;
    const refused = replies.filter((r) => r.statusCode === 503).length;
    assert.ok(refused >= 10, `a rajada tem que ter sido recusada em parte (${refused} de 30): sem isto o teste não prova nada`);
    assert.equal(await attempts(), served, `${served} atendidas = ${served} linhas (e não 30)`);
  });

  test('rajada de 30 cadastros: a conta e todas as linhas de limite existem só para as atendidas', async () => {
    await pool.query('TRUNCATE login_attempts');
    // Calibra: quantas linhas de limite UM cadastro grava (por e-mail, por IP e o teto global de e-mails).
    const calibration = await post('/v1/auth/register', '10.132.0.200', { accountType: 'passenger', fullName: 'Pessoa', email: uniqueEmail('calibra'), password: 'Senha-de-teste-123', ...REGISTER_EXTRAS });
    assert.equal(calibration.statusCode, 201, calibration.body);
    const rowsPerRegistration = await attempts();
    assert.ok(rowsPerRegistration >= 1);
    await pool.query('TRUNCATE login_attempts');
    const accountsBefore = await accounts();

    const replies = await Promise.all(Array.from({ length: 30 }, (_, i) =>
      post('/v1/auth/register', `10.132.0.${i + 1}`, { accountType: 'passenger', fullName: 'Pessoa', email: uniqueEmail('rajada-cadastro'), password: 'Senha-de-teste-123', ...REGISTER_EXTRAS })));
    const created = replies.filter((r) => r.statusCode === 201).length;
    const refused = replies.filter((r) => r.statusCode === 503).length;
    assert.ok(refused >= 10, `a rajada tem que ter sido recusada em parte (${refused} de 30)`);
    assert.equal(created + refused, 30, 'ou criou ou foi recusada com 503 (nenhum outro desfecho)');
    assert.equal(await accounts() - accountsBefore, created);
    assert.equal(await attempts(), created * rowsPerRegistration, 'as 503 não gastaram o limite do cadastro nem o teto global de e-mails');
  });
});
