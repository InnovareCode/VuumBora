/**
 * Endurecimento do admin (revisão S1): atraso progressivo por par e-mail+IP (A-1 / I-6),
 * token de enrolamento fora de banda + segredo pendente que não é sobrescrito
 * (M-2), reautenticação por senha + derrubada das outras sessões (M-3) e
 * `Cache-Control: no-store` nas respostas com segredo.
 */
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import { base32Decode, hotp, totpStep } from '../src/lib/totp.js';
import { DEFAULT_DELAY_SCHEDULE } from '../src/lib/progressive-delay.js';
import { accountKey, pairLockKey, reserveFailureSlot } from '../src/repositories/admin-login-failure-repository.js';
import { hashEnrollmentToken, issueEnrollmentToken } from '../src/services/admin-enrollment-token-service.js';
import { PASSWORD, createAdmin, pool, prepareDatabase, send, shutdown, startApp, type TestApp } from './helpers/harness.js';

let t: TestApp;
before(prepareDatabase);
after(shutdown);
beforeEach(async () => {
  t = await startApp();
});
afterEach(() => t.app.close());

let ipCounter = 0;
/** Cada chamada sai de um IP diferente (o proxy de borda escreve um único IP, que a API aceita como 1 salto). */
const freshIp = () => ({ 'x-forwarded-for': `10.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}.1` });

const login = (email: string, password = PASSWORD) => send(t.app, 'POST', '/auth/login', { body: { email, password }, headers: freshIp() });
const codeAt = (secret: string, offset = 0) => hotp(base32Decode(secret), totpStep(Date.now()) + offset);
const resetReplayGuard = (adminId: string) => pool.query('UPDATE admin_totp SET last_used_step = NULL WHERE admin_id = $1', [adminId]);
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

async function auditCount(adminId: string, action: string): Promise<number> {
  const r = await pool.query<{ n: string }>('SELECT count(*) AS n FROM admin_audit_log WHERE admin_id = $1 AND action = $2', [adminId, action]);
  return Number(r.rows[0]!.n);
}

/** "Passa o tempo" para a espera progressiva: recua as falhas deste e-mail. */
const rewindFailures = (email: string, seconds: number) =>
  pool.query(`UPDATE admin_login_failures SET created_at = created_at - make_interval(secs => $2) WHERE email_hash = $1`, [accountKey(email), seconds]);

async function failureRows(email: string): Promise<number> {
  const r = await pool.query<{ n: string }>('SELECT count(*) AS n FROM admin_login_failures WHERE email_hash = $1', [accountKey(email)]);
  return Number(r.rows[0]!.n);
}

const ownerFlow = {
  /** Login do dono -> desafio de enrolamento + token fora de banda emitido pelo "operador". */
  async begin(adminId: string, email: string) {
    const first = await login(email);
    assert.equal(first.body.data.status, 'enrollment_required');
    const { token } = await issueEnrollmentToken(pool, adminId);
    return { challengeToken: first.body.data.challengeToken as string, enrollmentToken: token };
  },
};

const startMandatory = (body: object) => send(t.app, 'POST', '/auth/2fa/enroll/start', { body });
const confirmMandatory = (body: object) => send(t.app, 'POST', '/auth/2fa/enroll/confirm', { body });

// ============================================================ A-1: contador por conta

describe('A-1 / I-6 — atraso PROGRESSIVO por par (e-mail + IP); nunca bloqueia a conta inteira', () => {
  const loginFrom = (ip: string, email: string, password = PASSWORD) =>
    send(t.app, 'POST', '/auth/login', { body: { email, password }, headers: { 'x-forwarded-for': ip } });
  /** "Passa o tempo": recua as falhas DESTE e-mail (a espera é medida contra a hora da última falha). */
  const rewind = (email: string, seconds: number) =>
    pool.query(`UPDATE admin_login_failures SET created_at = created_at - make_interval(secs => $2) WHERE email_hash = $1`, [accountKey(email), seconds]);

  test('a espera DOBRA a cada erro (1 s, 2 s, 4 s, 8 s); antes dela é 429 account_locked + Retry-After, até com a senha certa', async () => {
    const admin = await createAdmin('operacao');
    const ip = freshIp()['x-forwarded-for'];
    for (const expectedWait of [1, 2, 4, 8]) {
      assert.equal((await loginFrom(ip, admin.email, 'errada-123456')).status, 401, `falha que gera espera de ${expectedWait} s`);
      const blocked = await loginFrom(ip, admin.email, 'errada-123456');
      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.error.code, 'account_locked');
      assert.equal(blocked.body.error.retryAfterSeconds, expectedWait);
      assert.equal(blocked.headers['retry-after'], String(expectedWait));
      assert.equal(blocked.sessionCookie, null);
      assert.equal((await loginFrom(ip, admin.email)).status, 429, 'a senha certa também espera');
      await rewind(admin.email, expectedWait);
    }
    assert.equal((await loginFrom(ip, admin.email)).status, 200, 'passada a espera, entra');
  });

  test('o 429 NÃO alonga a espera: martelar a rota não empurra o relógio nem grava falha', async () => {
    const admin = await createAdmin('operacao');
    const ip = freshIp()['x-forwarded-for'];
    assert.equal((await loginFrom(ip, admin.email, 'errada-123456')).status, 401);
    for (let i = 0; i < 6; i += 1) assert.equal((await loginFrom(ip, admin.email, 'errada-123456')).status, 429);
    assert.equal(await failureRows(admin.email), 1);
  });

  test('a espera tem TETO de 15 min: Retry-After nunca passa de 900 s, por mais que o par erre', async () => {
    const admin = await createAdmin('operacao');
    const ip = freshIp()['x-forwarded-for'];
    for (let i = 0; i < 14; i += 1) {
      await rewind(admin.email, 1000);
      assert.equal((await loginFrom(ip, admin.email, 'errada-123456')).status, 401);
    }
    const blocked = await loginFrom(ip, admin.email, 'errada-123456');
    assert.equal(blocked.status, 429);
    assert.ok(blocked.body.error.retryAfterSeconds > 880 && blocked.body.error.retryAfterSeconds <= 900, String(blocked.body.error.retryAfterSeconds));
  });

  test('quem erra de OUTROS IPs não impede o dono de entrar: 25 IPs diferentes errando, e o dono entra', async () => {
    const admin = await createAdmin('operacao');
    for (let i = 0; i < 25; i += 1) assert.equal((await login(admin.email, 'errada-123456')).status, 401, `IP ${i + 1}`);
    assert.equal(await failureRows(admin.email), 25, 'as falhas ficam registradas (auditoria), mas cada IP é um par');
    const owner = await login(admin.email); // senha CERTA, de um IP que nunca errou
    assert.equal(owner.status, 200);
    assert.ok(owner.sessionCookie);
  });

  test('o atacante espera SÓ no par dele (mesmo e-mail, IP diferente = sem espera)', async () => {
    const admin = await createAdmin('operacao');
    const attacker = freshIp()['x-forwarded-for'];
    assert.equal((await loginFrom(attacker, admin.email, 'errada-123456')).status, 401);
    assert.equal((await loginFrom(attacker, admin.email, 'errada-123456')).status, 429);
    assert.equal((await loginFrom(freshIp()['x-forwarded-for'], admin.email)).status, 200);
  });

  test('conta inexistente tem o MESMO comportamento (sem oráculo de existência) e conta vizinha não é afetada', async () => {
    const ghost = `fantasma-${Math.random().toString(36).slice(2, 8)}@teste.vuumbora.dev`;
    const ip = freshIp()['x-forwarded-for'];
    assert.equal((await loginFrom(ip, ghost, 'errada-123456')).status, 401);
    const blocked = await loginFrom(ip, ghost, 'errada-123456');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'account_locked');
    assert.equal(blocked.body.error.retryAfterSeconds, 1);

    const other = await createAdmin('operacao');
    assert.equal((await loginFrom(ip, other.email)).status, 200, 'mesmo IP, outra conta: sem espera');
  });

  test('senha certa zera o par: depois dela a próxima falha volta a esperar 1 s', async () => {
    const admin = await createAdmin('operacao');
    const ip = freshIp()['x-forwarded-for'];
    for (let i = 0; i < 3; i += 1) {
      await loginFrom(ip, admin.email, 'errada-123456');
      await rewind(admin.email, 100);
    }
    assert.equal((await loginFrom(ip, admin.email)).status, 200);
    assert.equal(await failureRows(admin.email), 0, 'o acerto apaga as falhas do par');
    assert.equal((await loginFrom(ip, admin.email, 'errada-123456')).status, 401);
    assert.equal((await loginFrom(ip, admin.email, 'errada-123456')).body.error.retryAfterSeconds, 1, 'recomeçou do zero (não 8 s)');
  });

  test('as falhas "evaporam" depois de 24 h sem errar', async () => {
    const admin = await createAdmin('operacao');
    const ip = freshIp()['x-forwarded-for'];
    for (let i = 0; i < 12; i += 1) {
      await rewind(admin.email, 1000);
      await loginFrom(ip, admin.email, 'errada-123456');
    }
    assert.equal((await loginFrom(ip, admin.email, 'errada-123456')).status, 429);
    await rewind(admin.email, 25 * 3600);
    assert.equal((await loginFrom(ip, admin.email)).status, 200, 'par limpo');
  });

  test('IPv6: trocar os últimos 64 bits não abre um par novo (o par é o /64)', async () => {
    const admin = await createAdmin('operacao');
    assert.equal((await loginFrom('2001:db8:dddd:1::1', admin.email, 'errada-123456')).status, 401);
    assert.equal((await loginFrom('2001:db8:dddd:1:a:b:c:d', admin.email, 'errada-123456')).status, 429);
    assert.equal((await loginFrom('2001:db8:dddd:2::1', admin.email)).status, 200, 'outro /64');
  });

  test('concorrência: 12 palpites paralelos do mesmo par viram UM erro (401) + 11 esperas (429)', async () => {
    const admin = await createAdmin('operacao');
    const ip = freshIp()['x-forwarded-for'];
    const replies = await Promise.all(Array.from({ length: 12 }, () => loginFrom(ip, admin.email, 'errada-123456')));
    assert.equal(replies.filter((r) => r.status === 401).length, 1);
    assert.equal(replies.filter((r) => r.status === 429).length, 11);
    assert.equal(await failureRows(admin.email), 1);
  });

  test('a reserva espera o advisory lock do PAR (o que impede "ler 0 falhas" em paralelo); outro par não espera', async () => {
    const emailHash = accountKey(`lock-${Math.random().toString(36).slice(2, 8)}@teste.vuumbora.dev`);
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [pairLockKey(emailHash, '10.1.1.1')]);

      let finished = false;
      const waiting = reserveFailureSlot(pool, { emailHash, adminId: null, ipBucket: '10.1.1.1' }, DEFAULT_DELAY_SCHEDULE).then(() => { finished = true; });
      await reserveFailureSlot(pool, { emailHash, adminId: null, ipBucket: '10.2.2.2' }, DEFAULT_DELAY_SCHEDULE); // outro IP: não bloqueia
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(finished, false, 'a reserva do MESMO par tem que esperar quem segura o lock');

      await holder.query('COMMIT');
      await waiting;
      assert.equal(finished, true);
    } finally {
      holder.release();
    }
  });

  test('auditoria: cada falha vira admin.login_failed e atingir a espera MÁXIMA vira admin.login_locked (uma vez)', async () => {
    const admin = await createAdmin('operacao');
    const ip = freshIp()['x-forwarded-for'];
    for (let i = 0; i < 13; i += 1) {
      await rewind(admin.email, 1000);
      await loginFrom(ip, admin.email, 'errada-123456');
    }
    assert.equal(await auditCount(admin.id, 'admin.login_failed'), 13);
    assert.equal(await auditCount(admin.id, 'admin.login_locked'), 1, 'só na falha que leva o par a 15 min');
    const row = await pool.query<{ after: unknown; ip_address: string }>(
      `SELECT after, ip_address FROM admin_audit_log WHERE admin_id = $1 AND action = 'admin.login_failed' LIMIT 1`,
      [admin.id],
    );
    assert.deepEqual(row.rows[0]!.after, { purpose: 'login' });
    assert.equal(row.rows[0]!.ip_address, ip, 'a auditoria guarda o IP exato');
  });

  test('a espera vale também para a reautenticação (a mesma senha, o mesmo par)', async () => {
    const admin = await createAdmin('operacao');
    const ip = freshIp()['x-forwarded-for'];
    // Sessão do admin, aberta pelo mesmo IP que vai errar a senha ao reautenticar.
    const session = await loginFrom(ip, admin.email);
    assert.equal(session.status, 200);
    const start = (password: string) =>
      send(t.app, 'POST', '/2fa/enroll/start', { cookie: session.sessionCookie!, csrf: session.body.data.csrfToken, body: { password }, headers: { 'x-forwarded-for': ip } });
    assert.equal((await start('senha-errada-qualquer')).status, 403);
    const blocked = await start(PASSWORD);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'account_locked');
  });

  test('o contador guarda só o hash do e-mail e nada da senha', async () => {
    const admin = await createAdmin('operacao');
    await login(admin.email, 'palavra-passe-secreta');
    const dump = JSON.stringify((await pool.query('SELECT * FROM admin_login_failures WHERE email_hash = $1', [accountKey(admin.email)])).rows);
    assert.ok(!dump.includes(admin.email) && !dump.includes('palavra-passe-secreta'));
    assert.ok(!t.logs().includes('palavra-passe-secreta'));
  });
});

// ============================================================ M-2: token fora de banda

describe('M-2 — primeiro enrolamento de dono/financeiro exige o token fora de banda', () => {
  test('só a senha não basta: sem token, token errado ou de outro admin => 403 e NADA é criado', async () => {
    const admin = await createAdmin('dono');
    const other = await createAdmin('financeiro');
    const { challengeToken, enrollmentToken } = await ownerFlow.begin(admin.id, admin.email);
    const otherToken = (await issueEnrollmentToken(pool, other.id)).token;

    assert.equal((await startMandatory({ challengeToken })).status, 400, 'sem o campo');
    for (const wrong of ['AAAAA-BBBBB-CCCCC-DDDDD', otherToken]) {
      const reply = await startMandatory({ challengeToken, enrollmentToken: wrong });
      assert.equal(reply.status, 403);
      assert.equal(reply.body.error.code, 'enrollment_token_invalid');
    }
    assert.equal((await pool.query('SELECT 1 FROM admin_totp WHERE admin_id = $1', [admin.id])).rowCount, 0, 'nenhum segredo gravado');
    assert.ok(await auditCount(admin.id, 'admin.2fa.enrollment_token_rejected') >= 2);

    // Confirmar sem token também falha, ainda que o enrolamento "legítimo" tenha começado.
    const secret = (await startMandatory({ challengeToken, enrollmentToken })).body.data.secret as string;
    const noToken = await confirmMandatory({ challengeToken, enrollmentToken: 'AAAAA-BBBBB-CCCCC-DDDDD', code: codeAt(secret) });
    assert.equal(noToken.status, 403);
    assert.equal(noToken.sessionCookie, null);
    assert.equal((await pool.query('SELECT confirmed_at FROM admin_totp WHERE admin_id = $1', [admin.id])).rows[0].confirmed_at, null);
  });

  test('com o token: enrola, entra, e o token é de USO ÚNICO (gasto na mesma transação do acerto)', async () => {
    const admin = await createAdmin('dono');
    const { challengeToken, enrollmentToken } = await ownerFlow.begin(admin.id, admin.email);
    const secret = (await startMandatory({ challengeToken, enrollmentToken })).body.data.secret as string;
    const done = await confirmMandatory({ challengeToken, enrollmentToken, code: codeAt(secret) });
    assert.equal(done.status, 200);
    assert.ok(done.sessionCookie);

    const used = await pool.query('SELECT used_at FROM admin_enrollment_tokens WHERE token_hash = $1', [hashEnrollmentToken(enrollmentToken)]);
    assert.ok(used.rows[0].used_at, 'token marcado como usado');
    // Depois de enrolado, o token gasto não abre nada: nem reenrolar.
    const challenge2 = (await login(admin.email)).body.data.challengeToken as string;
    assert.equal((await startMandatory({ challengeToken: challenge2, enrollmentToken })).body.error.code, 'enrollment_token_invalid');
  });

  test('token gasto entre o start e o confirm: 403, nenhum 2FA ativo e o código TOTP não é gasto', async () => {
    const admin = await createAdmin('dono');
    const { challengeToken, enrollmentToken } = await ownerFlow.begin(admin.id, admin.email);
    const secret = (await startMandatory({ challengeToken, enrollmentToken })).body.data.secret as string;
    // Token gasto entre o `start` e o `confirm` (ex.: outro confirm paralelo).
    await pool.query('UPDATE admin_enrollment_tokens SET used_at = now() WHERE admin_id = $1', [admin.id]);
    const reply = await confirmMandatory({ challengeToken, enrollmentToken, code: codeAt(secret) });
    assert.equal(reply.status, 403);
    const row = await pool.query('SELECT confirmed_at, last_used_step FROM admin_totp WHERE admin_id = $1', [admin.id]);
    assert.equal(row.rows[0].confirmed_at, null);
    assert.equal(row.rows[0].last_used_step, null, 'rollback: o código não foi gasto');
  });

  test('token vencido não vale; reemitir invalida o anterior', async () => {
    const admin = await createAdmin('financeiro');
    const first = await ownerFlow.begin(admin.id, admin.email);
    await pool.query(`UPDATE admin_enrollment_tokens SET expires_at = now() - interval '1 minute' WHERE admin_id = $1`, [admin.id]);
    assert.equal((await startMandatory(first)).body.error.code, 'enrollment_token_invalid', 'vencido');

    const older = (await issueEnrollmentToken(pool, admin.id)).token;
    const newer = (await issueEnrollmentToken(pool, admin.id)).token;
    assert.equal((await startMandatory({ challengeToken: first.challengeToken, enrollmentToken: older })).status, 403, 'o antigo morreu');
    assert.equal((await startMandatory({ challengeToken: first.challengeToken, enrollmentToken: newer.toLowerCase().replace(/-/g, ' ') })).status, 200, 'caixa e separadores são tolerados');
  });

  test('segredo pendente válido NÃO é sobrescrito: repetir `start` devolve o MESMO segredo e o banco não muda', async () => {
    const admin = await createAdmin('dono');
    const { challengeToken, enrollmentToken } = await ownerFlow.begin(admin.id, admin.email);
    const first = await startMandatory({ challengeToken, enrollmentToken });
    const before = (await pool.query('SELECT secret_encrypted FROM admin_totp WHERE admin_id = $1', [admin.id])).rows[0].secret_encrypted;

    const again = await startMandatory({ challengeToken, enrollmentToken });
    const after = (await pool.query('SELECT secret_encrypted FROM admin_totp WHERE admin_id = $1', [admin.id])).rows[0].secret_encrypted;
    assert.equal(again.body.data.secret, first.body.data.secret);
    assert.equal(after, before, 'o segredo cifrado ficou como estava');
    assert.equal(await auditCount(admin.id, 'admin.2fa.enroll_resumed'), 1);
    // E o QR escaneado antes do segundo `start` continua valendo.
    const done = await confirmMandatory({ challengeToken, enrollmentToken, code: codeAt(first.body.data.secret) });
    assert.equal(done.status, 200);
  });

  test('segredo pendente VENCIDO é trocado, e um QR vencido não pode ser confirmado', async () => {
    const admin = await createAdmin('dono');
    const { challengeToken, enrollmentToken } = await ownerFlow.begin(admin.id, admin.email);
    const stale = (await startMandatory({ challengeToken, enrollmentToken })).body.data.secret as string;
    await pool.query(`UPDATE admin_totp SET pending_expires_at = now() - interval '1 second' WHERE admin_id = $1`, [admin.id]);

    const expired = await confirmMandatory({ challengeToken, enrollmentToken, code: codeAt(stale) });
    assert.equal(expired.status, 409);
    assert.equal(expired.body.error.code, 'two_factor_enrollment_not_started');

    const renewed = (await startMandatory({ challengeToken, enrollmentToken })).body.data.secret as string;
    assert.notEqual(renewed, stale);
    assert.equal((await confirmMandatory({ challengeToken, enrollmentToken, code: codeAt(renewed) })).status, 200);
  });

  test('concorrência: 8 `start` paralelos de uma conta nova resultam em UM só segredo', async () => {
    const admin = await createAdmin('dono');
    const { challengeToken, enrollmentToken } = await ownerFlow.begin(admin.id, admin.email);
    const replies = await Promise.all(Array.from({ length: 8 }, () => startMandatory({ challengeToken, enrollmentToken })));
    const secrets = new Set(replies.map((r) => r.body.data.secret as string));
    assert.equal(secrets.size, 1);
  });

  test('os scripts: create-admin emite o código; reissue recusa quem já enrolou e --reset-2fa apaga 2FA e sessões', async () => {
    const scripts = (name: string) => fileURLToPath(new URL(`../scripts/${name}`, import.meta.url));
    const run = (script: string, args: string[]) => spawnSync(process.execPath, [scripts(script), ...args], { encoding: 'utf8', env: process.env, cwd: fileURLToPath(new URL('..', import.meta.url)) });
    const tokenIn = (out: string) => /([A-Z2-7]{5}(?:-[A-Z2-7]{5}){3})/.exec(out)?.[1];

    const email = `script-${Math.random().toString(36).slice(2, 8)}@teste.vuumbora.dev`;
    const created = run('create-admin.mjs', [`--email=${email}`, '--name=Dono Script', '--role=dono', `--password=${PASSWORD}`]);
    assert.equal(created.status, 0, created.stderr);
    const firstToken = tokenIn(created.stdout);
    assert.ok(firstToken, 'create-admin imprime o código de ativação do dono');

    const suporte = run('create-admin.mjs', [`--email=s-${email}`, '--name=Suporte Script', '--role=suporte', `--password=${PASSWORD}`]);
    assert.equal(suporte.status, 0, suporte.stderr);
    assert.equal(tokenIn(suporte.stdout), undefined, 'papel opcional não recebe código de ativação');

    // O token do script funciona na API real (mesma normalização + sha256).
    const adminId = (await pool.query<{ id: string }>('SELECT id FROM admin_users WHERE email = $1', [email])).rows[0]!.id;
    const challenge1 = (await login(email)).body.data.challengeToken as string;
    const secret = (await startMandatory({ challengeToken: challenge1, enrollmentToken: firstToken })).body.data.secret as string;
    const done = await confirmMandatory({ challengeToken: challenge1, enrollmentToken: firstToken, code: codeAt(secret) });
    assert.equal(done.status, 200);
    const oldCookie = done.sessionCookie!;

    const refused = run('reissue-2fa-enrollment.mjs', [`--email=${email}`]);
    assert.notEqual(refused.status, 0, 'já enrolado: recusa sem --reset-2fa');

    const reset = run('reissue-2fa-enrollment.mjs', [`--email=${email}`, '--reset-2fa']);
    assert.equal(reset.status, 0, reset.stderr);
    const secondToken = tokenIn(reset.stdout);
    assert.ok(secondToken && secondToken !== firstToken);
    assert.equal((await pool.query('SELECT 1 FROM admin_totp WHERE admin_id = $1', [adminId])).rowCount, 0, '2FA apagado');
    assert.equal((await send(t.app, 'GET', '/me', { cookie: oldCookie })).status, 401, 'sessão antiga caiu');
    assert.equal(await auditCount(adminId, 'admin.2fa.reset_by_operator'), 1);

    const challenge2 = (await login(email)).body.data;
    assert.equal(challenge2.status, 'enrollment_required');
    assert.equal((await startMandatory({ challengeToken: challenge2.challengeToken, enrollmentToken: firstToken })).status, 403, 'o token antigo não vale');
    assert.equal((await startMandatory({ challengeToken: challenge2.challengeToken, enrollmentToken: secondToken })).status, 200);

    const notMandatory = run('reissue-2fa-enrollment.mjs', [`--email=s-${email}`]);
    assert.notEqual(notMandatory.status, 0, 'papel opcional não usa código de ativação');
  });
});

// ============================================================ M-3: senha + sessões

describe('M-3 — reautenticação por senha e derrubada das demais sessões', () => {
  async function supportSession() {
    const admin = await createAdmin('suporte');
    const session = await login(admin.email);
    return { admin, cookie: session.sessionCookie!, csrf: session.body.data.csrfToken as string };
  }
  const post = (path: string, s: { cookie: string; csrf: string }, body?: object) => send(t.app, 'POST', path, { cookie: s.cookie, csrf: s.csrf, ...(body ? { body } : {}) });

  test('enroll/start exige a senha ATUAL: sem corpo 400, senha errada 403, e nenhum segredo nasce', async () => {
    const s = await supportSession();
    assert.equal((await post('/2fa/enroll/start', s)).status, 400);
    const wrong = await post('/2fa/enroll/start', s, { password: 'outra-senha-123' });
    assert.equal(wrong.status, 403);
    assert.equal(wrong.body.error.code, 'password_invalid');
    assert.equal((await pool.query('SELECT 1 FROM admin_totp WHERE admin_id = $1', [s.admin.id])).rowCount, 0);
    await rewindFailures(s.admin.email, 5); // a senha errada impôs 1 s de espera ao par
    assert.equal((await post('/2fa/enroll/start', s, { password: PASSWORD })).status, 200);
  });

  test('regenerar códigos e desativar exigem a senha além do código; senha errada não gasta o código nem desliga nada', async () => {
    const s = await supportSession();
    const secret = (await post('/2fa/enroll/start', s, { password: PASSWORD })).body.data.secret as string;
    assert.equal((await post('/2fa/enroll/confirm', s, { code: codeAt(secret) })).status, 200);
    await resetReplayGuard(s.admin.id);

    const regen = await post('/2fa/recovery-codes/regenerate', s, { code: codeAt(secret), password: 'outra-senha-123' });
    assert.equal(regen.status, 403);
    assert.equal(regen.body.error.code, 'password_invalid');
    await rewindFailures(s.admin.email, 1000);
    const off = await post('/2fa/disable', s, { code: codeAt(secret), password: 'outra-senha-123' });
    assert.equal(off.status, 403);
    await rewindFailures(s.admin.email, 1000);
    assert.equal((await post('/2fa/disable', s, { code: codeAt(secret) })).status, 400, 'sem a senha no corpo');
    assert.equal((await send(t.app, 'GET', '/2fa/status', { cookie: s.cookie })).body.data.enabled, true, 'segue ligado');

    assert.equal((await post('/2fa/recovery-codes/regenerate', s, { code: codeAt(secret), password: PASSWORD })).status, 200, 'o código não foi gasto pela senha errada');
  });

  test('a senha errada na reautenticação conta no MESMO par do login (e-mail + IP): espera até para o login do mesmo IP; outro IP segue livre', async () => {
    const s = await supportSession();
    assert.equal((await post('/2fa/enroll/start', s, { password: 'errada-123456' })).status, 403);
    const locked = await post('/2fa/enroll/start', s, { password: PASSWORD });
    assert.equal(locked.status, 429);
    assert.equal(locked.body.error.code, 'account_locked');
    // `post` sai do IP padrão do inject (127.0.0.1): o login desse mesmo IP espera; um IP novo não.
    const sameIp = await send(t.app, 'POST', '/auth/login', { body: { email: s.admin.email, password: PASSWORD }, headers: { 'x-forwarded-for': '127.0.0.1' } });
    assert.equal(sameIp.status, 429);
    assert.equal((await login(s.admin.email)).status, 200, 'o dono de outro IP entra');
  });

  test('LIGAR o 2FA derruba as outras sessões e mantém a atual', async () => {
    const a = await supportSession();
    const b = await login(a.admin.email);
    const c = await login(a.admin.email);
    assert.equal((await send(t.app, 'GET', '/me', { cookie: b.sessionCookie! })).status, 200);

    const secret = (await post('/2fa/enroll/start', a, { password: PASSWORD })).body.data.secret as string;
    assert.equal((await post('/2fa/enroll/confirm', a, { code: codeAt(secret) })).status, 200);

    assert.equal((await send(t.app, 'GET', '/me', { cookie: a.cookie })).status, 200, 'a atual segue');
    assert.equal((await send(t.app, 'GET', '/me', { cookie: b.sessionCookie! })).status, 401);
    assert.equal((await send(t.app, 'GET', '/me', { cookie: c.sessionCookie! })).status, 401);
  });

  test('DESLIGAR o 2FA derruba as outras sessões e mantém a atual', async () => {
    const a = await supportSession();
    const secret = (await post('/2fa/enroll/start', a, { password: PASSWORD })).body.data.secret as string;
    await post('/2fa/enroll/confirm', a, { code: codeAt(secret) });

    // Nova sessão (já com 2FA ligado) para o admin: login + código.
    await resetReplayGuard(a.admin.id);
    const challengeToken = (await login(a.admin.email)).body.data.challengeToken as string;
    const other = await send(t.app, 'POST', '/auth/2fa/verify', { body: { challengeToken, code: codeAt(secret) } });
    assert.equal(other.status, 200);
    assert.equal((await send(t.app, 'GET', '/me', { cookie: other.sessionCookie! })).status, 200);

    await resetReplayGuard(a.admin.id);
    const off = await post('/2fa/disable', a, { code: codeAt(secret), password: PASSWORD });
    assert.equal(off.status, 200);
    assert.equal((await send(t.app, 'GET', '/me', { cookie: a.cookie })).status, 200, 'a atual segue');
    assert.equal((await send(t.app, 'GET', '/me', { cookie: other.sessionCookie! })).status, 401);
  });

  test('o enrolamento obrigatório (dono) também derruba sessões antigas que existissem', async () => {
    const admin = await createAdmin('dono');
    // Sessão antiga forjada direto no banco (o 0013 já apagou as reais; cobre o dono promovido depois).
    const oldToken = `sessao-antiga-${Math.random().toString(36).slice(2)}-0123456789abcdef`;
    await pool.query(
      `INSERT INTO admin_sessions (admin_id, token_hash, expires_at, absolute_expires_at, csrf_token)
       VALUES ($1, $2, now() + interval '1 hour', now() + interval '1 day', 'csrf-antigo')`,
      [admin.id, sha256(oldToken)],
    );
    assert.equal((await send(t.app, 'GET', '/me', { cookie: oldToken })).status, 200);

    const { challengeToken, enrollmentToken } = await ownerFlow.begin(admin.id, admin.email);
    const secret = (await startMandatory({ challengeToken, enrollmentToken })).body.data.secret as string;
    const done = await confirmMandatory({ challengeToken, enrollmentToken, code: codeAt(secret) });
    assert.equal(done.status, 200);
    assert.equal((await send(t.app, 'GET', '/me', { cookie: oldToken })).status, 401);
    assert.equal((await send(t.app, 'GET', '/me', { cookie: done.sessionCookie! })).status, 200);
  });
});

// ============================================================ Cache-Control

describe('Cache-Control: no-store em toda resposta que carrega segredo', () => {
  const noStore = (reply: { headers: Record<string, unknown>; status: number }, label: string) => {
    assert.equal(reply.status, 200, `${label}: status`);
    assert.equal(reply.headers['cache-control'], 'no-store', `${label}: Cache-Control`);
  };

  test('desafio, segredo do QR, códigos de recuperação, sessão e /me', async () => {
    // Obrigatório (por desafio).
    const owner = await createAdmin('dono');
    const { challengeToken, enrollmentToken } = await ownerFlow.begin(owner.id, owner.email);
    const challengeReply = await send(t.app, 'POST', '/auth/login', { body: { email: owner.email, password: PASSWORD }, headers: freshIp() });
    noStore(challengeReply, 'login -> desafio');
    const started = await startMandatory({ challengeToken, enrollmentToken });
    noStore(started, 'auth/2fa/enroll/start');
    const confirmed = await confirmMandatory({ challengeToken, enrollmentToken, code: codeAt(started.body.data.secret) });
    noStore(confirmed, 'auth/2fa/enroll/confirm');

    // Opcional (por sessão).
    const admin = await createAdmin('suporte');
    const session = await login(admin.email);
    noStore(session, 'login -> sessão');
    const s = { cookie: session.sessionCookie!, csrf: session.body.data.csrfToken as string };
    noStore(await send(t.app, 'GET', '/me', { cookie: s.cookie }), 'me');
    const own = await send(t.app, 'POST', '/2fa/enroll/start', { ...s, body: { password: PASSWORD } });
    noStore(own, '2fa/enroll/start');
    const own2 = await send(t.app, 'POST', '/2fa/enroll/confirm', { ...s, body: { code: codeAt(own.body.data.secret) } });
    noStore(own2, '2fa/enroll/confirm');
    await resetReplayGuard(admin.id);
    noStore(await send(t.app, 'POST', '/2fa/recovery-codes/regenerate', { ...s, body: { code: codeAt(own.body.data.secret, 1), password: PASSWORD } }), '2fa/recovery-codes/regenerate');
  });
});
