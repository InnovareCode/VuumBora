import './helpers/setup.js';
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { AdminRole } from '../src/domain/admin.js';
import { base32Decode, hotp, totpStep } from '../src/lib/totp.js';
import { issueEnrollmentToken } from '../src/services/admin-enrollment-token-service.js';
import { PASSWORD, createAdmin, pool, prepareDatabase, send, shutdown, startApp, type Reply, type TestApp } from './helpers/harness.js';

let t: TestApp;
before(prepareDatabase);
after(shutdown);
beforeEach(async () => {
  t = await startApp();
});
afterEach(() => t.app.close());

const ALL_ROLES: AdminRole[] = ['dono', 'operacao', 'revisor_documentos', 'financeiro', 'suporte'];
const MANDATORY: AdminRole[] = ['dono', 'financeiro'];

const login = (email: string, password = PASSWORD) => send(t.app, 'POST', '/auth/login', { body: { email, password } });
const codeAt = (secret: string, offset = 0) => hotp(base32Decode(secret), totpStep(Date.now()) + offset);
const resetReplayGuard = (adminId: string) => pool.query('UPDATE admin_totp SET last_used_step = NULL WHERE admin_id = $1', [adminId]);

/** Token de ativação (fora de banda) novo para o admin com este e-mail — o que o operador entregaria. */
async function tokenFor(email: string): Promise<string> {
  const row = await pool.query<{ id: string }>('SELECT id FROM admin_users WHERE email = $1', [email]);
  return (await issueEnrollmentToken(pool, row.rows[0]!.id)).token;
}

/** Fluxo obrigatório completo: senha -> desafio -> enrolar (com o token fora de banda) -> confirmar -> sessão. */
async function enrollMandatory(email: string) {
  const first = await login(email);
  assert.equal(first.body.data.status, 'enrollment_required');
  const challengeToken = first.body.data.challengeToken as string;
  const enrollmentToken = await tokenFor(email);
  const started = await send(t.app, 'POST', '/auth/2fa/enroll/start', { body: { challengeToken, enrollmentToken } });
  assert.equal(started.status, 200);
  const secret = started.body.data.secret as string;
  const confirmed = await send(t.app, 'POST', '/auth/2fa/enroll/confirm', { body: { challengeToken, enrollmentToken, code: codeAt(secret) } });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  return { secret, session: confirmed, recoveryCodes: confirmed.body.data.recoveryCodes as string[] };
}

/** Admin já enrolado + um desafio novo (login com senha). */
async function challengeFor(email: string): Promise<string> {
  const reply = await login(email);
  assert.equal(reply.body.data.status, 'second_factor_required');
  return reply.body.data.challengeToken as string;
}

const verify = (challengeToken: string, code: string) => send(t.app, 'POST', '/auth/2fa/verify', { body: { challengeToken, code } });

async function auditActions(adminId: string): Promise<string[]> {
  const result = await pool.query<{ action: string }>('SELECT action FROM admin_audit_log WHERE admin_id = $1 ORDER BY created_at, id', [adminId]);
  return result.rows.map((r) => r.action);
}

describe('papéis reais: quem obriga e quem não obriga 2FA', () => {
  for (const role of ALL_ROLES) {
    test(`login de ${role}`, async () => {
      const admin = await createAdmin(role);
      const reply = await login(admin.email);
      assert.equal(reply.status, 200);
      if (MANDATORY.includes(role)) {
        assert.equal(reply.body.data.status, 'enrollment_required');
        assert.equal(reply.sessionCookie, null, 'papel obrigatório não pode ganhar sessão sem 2FA');
        assert.equal((await send(t.app, 'GET', '/me', {})).status, 401);
      } else {
        assert.equal(reply.body.data.status, 'authenticated');
        assert.ok(reply.sessionCookie);
      }
    });
  }
});

describe('enrolamento obrigatório (dono / financeiro)', () => {
  for (const role of MANDATORY) {
    test(`${role}: enrola, recebe 10 códigos e entra; segundo login pede código`, async () => {
      const admin = await createAdmin(role);
      const { secret, session, recoveryCodes } = await enrollMandatory(admin.email);

      assert.equal(session.body.data.status, 'authenticated');
      assert.ok(session.sessionCookie && session.body.data.csrfToken);
      assert.equal(recoveryCodes.length, 10);
      assert.ok(recoveryCodes.every((c) => /^[A-Z2-7]{5}-[A-Z2-7]{5}$/.test(c)));
      assert.equal((await send(t.app, 'GET', '/me', { cookie: session.sessionCookie! })).status, 200);

      await resetReplayGuard(admin.id);
      const second = await verify(await challengeFor(admin.email), codeAt(secret));
      assert.equal(second.status, 200);
      assert.equal(second.body.data.status, 'authenticated');
      assert.equal(second.body.data.recoveryCodesRemaining, 10);
      assert.ok(second.sessionCookie);
    });
  }

  test('confirmar com código errado não ativa o 2FA nem cria sessão', async () => {
    const admin = await createAdmin('dono');
    const { body } = await login(admin.email);
    const challengeToken = body.data.challengeToken;
    const enrollmentToken = await tokenFor(admin.email);
    await send(t.app, 'POST', '/auth/2fa/enroll/start', { body: { challengeToken, enrollmentToken } });
    const wrong = await send(t.app, 'POST', '/auth/2fa/enroll/confirm', { body: { challengeToken, enrollmentToken, code: '000000' } });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.error.code, 'invalid_second_factor');
    assert.equal(wrong.sessionCookie, null);
    const row = await pool.query('SELECT confirmed_at FROM admin_totp WHERE admin_id = $1', [admin.id]);
    assert.equal(row.rows[0].confirmed_at, null);
  });

  test('confirmar sem ter iniciado devolve 409', async () => {
    const admin = await createAdmin('dono');
    const { body } = await login(admin.email);
    const reply = await send(t.app, 'POST', '/auth/2fa/enroll/confirm', { body: { challengeToken: body.data.challengeToken, enrollmentToken: await tokenFor(admin.email), code: '123456' } });
    assert.equal(reply.status, 409);
    assert.equal(reply.body.error.code, 'two_factor_enrollment_not_started');
  });

  test('desafio de quem já enrolou não permite reenrolar (409) nem trocar o segredo', async () => {
    const admin = await createAdmin('dono');
    const { secret } = await enrollMandatory(admin.email);
    const challengeToken = await challengeFor(admin.email);
    const again = await send(t.app, 'POST', '/auth/2fa/enroll/start', { body: { challengeToken, enrollmentToken: await tokenFor(admin.email) } });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'two_factor_already_enrolled');
    await resetReplayGuard(admin.id);
    assert.equal((await verify(challengeToken, codeAt(secret))).status, 200, 'o segredo original segue valendo');
  });

  test('desafio de enrolamento não serve como segundo fator de login', async () => {
    const admin = await createAdmin('dono');
    const { body } = await login(admin.email);
    const reply = await verify(body.data.challengeToken, '123456');
    assert.equal(reply.status, 401);
    assert.equal(reply.body.error.code, 'challenge_invalid');
  });
});

describe('login em duas etapas', () => {
  test('replay: o mesmo código TOTP não vale duas vezes; o do passo seguinte vale', async () => {
    const admin = await createAdmin('dono');
    const { secret } = await enrollMandatory(admin.email); // o código do passo atual foi gasto aqui

    // O passo gasto vem do BANCO (`last_used_step`), não do relógio: se a virada dos 30 s cair entre o enrolamento e
    // este ponto, `codeAt(secret, 0)` já seria o código do passo SEGUINTE (válido) e o teste ficaria intermitente.
    const spent = Number((await pool.query<{ last_used_step: string }>('SELECT last_used_step FROM admin_totp WHERE admin_id = $1', [admin.id])).rows[0]!.last_used_step);
    const codeForStep = (step: number) => hotp(base32Decode(secret), step);

    const replay = await verify(await challengeFor(admin.email), codeForStep(spent));
    assert.equal(replay.status, 401);
    assert.equal(replay.body.error.code, 'invalid_second_factor');

    const next = await verify(await challengeFor(admin.email), codeForStep(spent + 1));
    assert.equal(next.status, 200);
  });

  test('desafio vale uma única vez', async () => {
    const admin = await createAdmin('dono');
    const { secret } = await enrollMandatory(admin.email);
    await resetReplayGuard(admin.id);
    const challengeToken = await challengeFor(admin.email);
    assert.equal((await verify(challengeToken, codeAt(secret))).status, 200);
    await resetReplayGuard(admin.id);
    const reuse = await verify(challengeToken, codeAt(secret));
    assert.equal(reuse.status, 401);
    assert.equal(reuse.body.error.code, 'challenge_invalid');
  });

  test('desafio vencido e token inventado: challenge_invalid', async () => {
    const admin = await createAdmin('dono');
    const { secret } = await enrollMandatory(admin.email);
    await resetReplayGuard(admin.id);
    const challengeToken = await challengeFor(admin.email);
    await pool.query(`UPDATE admin_login_challenges SET expires_at = now() - interval '1 second'`);
    assert.equal((await verify(challengeToken, codeAt(secret))).body.error.code, 'challenge_invalid');
    assert.equal((await verify('x'.repeat(43), '123456')).body.error.code, 'challenge_invalid');
  });

  test('senha errada nunca chega ao desafio; corpo inválido é 400', async () => {
    const admin = await createAdmin('dono');
    const reply = await login(admin.email, 'senha-errada');
    assert.equal(reply.status, 401);
    assert.equal(reply.body.data, undefined);
    assert.equal((await send(t.app, 'POST', '/auth/2fa/verify', { body: { code: '123456' } })).status, 400);
  });

  test('código de recuperação: entra uma vez, formatos tolerados, segunda vez recusa', async () => {
    const admin = await createAdmin('financeiro');
    const { recoveryCodes } = await enrollMandatory(admin.email);
    const code = recoveryCodes[0]!;

    const ok = await verify(await challengeFor(admin.email), code.toLowerCase().replace('-', ' '));
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.recoveryCodesRemaining, 9);

    const again = await verify(await challengeFor(admin.email), code);
    assert.equal(again.status, 401);
    assert.equal(again.body.error.code, 'invalid_second_factor');
    assert.ok((await auditActions(admin.id)).includes('admin.2fa.recovery_code_used'));
  });

  test('concorrência: o mesmo código de recuperação em 2 desafios paralelos entra uma única vez', async () => {
    const admin = await createAdmin('dono');
    const { recoveryCodes } = await enrollMandatory(admin.email);
    const c1 = await challengeFor(admin.email);
    const c2 = await challengeFor(admin.email);
    const replies = await Promise.all([verify(c1, recoveryCodes[1]!), verify(c2, recoveryCodes[1]!)]);
    assert.deepEqual(replies.map((r) => r.status).sort(), [200, 401]);
  });
});

describe('limite de tentativas (429)', () => {
  test('concorrência: o MESMO código TOTP certo em 2 desafios paralelos entra uma única vez (replay)', async () => {
    const admin = await createAdmin('dono');
    const { secret } = await enrollMandatory(admin.email);
    await resetReplayGuard(admin.id);
    const c1 = await challengeFor(admin.email);
    const c2 = await challengeFor(admin.email);
    const code = codeAt(secret);
    const replies = await Promise.all([verify(c1, code), verify(c2, code)]);
    assert.deepEqual(replies.map((r) => r.status).sort(), [200, 401]);
  });

  test('5 erros travam o admin; durante o bloqueio nem o código certo entra; depois do prazo volta', async () => {
    const admin = await createAdmin('dono');
    const { secret } = await enrollMandatory(admin.email);
    await resetReplayGuard(admin.id);
    const challengeToken = await challengeFor(admin.email);

    for (let i = 0; i < 4; i += 1) assert.equal((await verify(challengeToken, '000000')).status, 401);
    const locking = await verify(challengeToken, '000000');
    assert.equal(locking.status, 429);
    assert.equal(locking.body.error.code, 'two_factor_locked');
    assert.ok(Number(locking.headers['retry-after']) > 0 && locking.body.error.retryAfterSeconds > 0);

    const whileLocked = await verify(challengeToken, codeAt(secret));
    assert.equal(whileLocked.status, 429, 'código certo durante o bloqueio também é recusado');

    await pool.query(`UPDATE admin_totp SET locked_until = now() - interval '1 second' WHERE admin_id = $1`, [admin.id]);
    assert.equal((await verify(challengeToken, codeAt(secret))).status, 200);

    const actions = await auditActions(admin.id);
    assert.ok(actions.includes('admin.2fa.verify_failed'));
    assert.ok(actions.includes('admin.2fa.locked'));
    assert.ok(actions.includes('admin.2fa.attempt_while_locked'));
  });

  test('concorrência: 10 palpites paralelos viram exatamente 4 erros + 6 bloqueios (o 5º trava)', async () => {
    const admin = await createAdmin('dono');
    await enrollMandatory(admin.email);
    const challengeToken = await challengeFor(admin.email);
    const replies = await Promise.all(Array.from({ length: 10 }, () => verify(challengeToken, '000000')));
    const count = (status: number) => replies.filter((r) => r.status === status).length;
    assert.equal(count(401), 4);
    assert.equal(count(429), 6);
  });

  test('reiniciar o enrolamento não zera o bloqueio', async () => {
    const admin = await createAdmin('dono');
    const { body } = await login(admin.email);
    const challengeToken = body.data.challengeToken;
    const enrollmentToken = await tokenFor(admin.email);
    await send(t.app, 'POST', '/auth/2fa/enroll/start', { body: { challengeToken, enrollmentToken } });
    for (let i = 0; i < 5; i += 1) await send(t.app, 'POST', '/auth/2fa/enroll/confirm', { body: { challengeToken, enrollmentToken, code: '000000' } });
    await send(t.app, 'POST', '/auth/2fa/enroll/start', { body: { challengeToken, enrollmentToken } });
    const row = await pool.query('SELECT locked_until > now() AS locked FROM admin_totp WHERE admin_id = $1', [admin.id]);
    assert.equal(row.rows[0].locked, true);
  });
});

describe('papel com 2FA opcional (suporte): gerência por sessão', () => {
  async function loggedIn() {
    const admin = await createAdmin('suporte');
    const session = await login(admin.email);
    return { admin, cookie: session.sessionCookie!, csrf: session.body.data.csrfToken as string };
  }

  test('enrolar exige CSRF; confirmar ativa; status reflete; próximo login pede o código', async () => {
    const { admin, cookie, csrf } = await loggedIn();
    assert.equal((await send(t.app, 'POST', '/2fa/enroll/start', { cookie, body: { password: PASSWORD } })).status, 403, 'sem CSRF');
    assert.equal((await send(t.app, 'POST', '/2fa/enroll/start', { csrf, body: { password: PASSWORD } })).status, 401, 'sem sessão');

    const started = await send(t.app, 'POST', '/2fa/enroll/start', { cookie, csrf, body: { password: PASSWORD } });
    assert.equal(started.status, 200);
    assert.match(started.body.data.otpauthUri, /^otpauth:\/\/totp\//);
    const secret = started.body.data.secret as string;

    assert.equal((await send(t.app, 'GET', '/2fa/status', { cookie })).body.data.enabled, false);
    const confirmed = await send(t.app, 'POST', '/2fa/enroll/confirm', { cookie, csrf, body: { code: codeAt(secret) } });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.data.recoveryCodes.length, 10);
    assert.deepEqual((await send(t.app, 'GET', '/2fa/status', { cookie })).body.data, { enabled: true, required: false, recoveryCodesRemaining: 10 });

    assert.equal((await login(admin.email)).body.data.status, 'second_factor_required');
    assert.equal((await send(t.app, 'POST', '/2fa/enroll/start', { cookie, csrf, body: { password: PASSWORD } })).status, 409);
  });

  test('regenerar códigos exige TOTP atual (não vale código de recuperação) e invalida os antigos', async () => {
    const { admin, cookie, csrf } = await loggedIn();
    const secret = (await send(t.app, 'POST', '/2fa/enroll/start', { cookie, csrf, body: { password: PASSWORD } })).body.data.secret as string;
    const old = (await send(t.app, 'POST', '/2fa/enroll/confirm', { cookie, csrf, body: { code: codeAt(secret) } })).body.data.recoveryCodes as string[];

    const withRecovery = await send(t.app, 'POST', '/2fa/recovery-codes/regenerate', { cookie, csrf, body: { code: old[0], password: PASSWORD } });
    assert.equal(withRecovery.status, 401);

    await resetReplayGuard(admin.id);
    const regenerated = await send(t.app, 'POST', '/2fa/recovery-codes/regenerate', { cookie, csrf, body: { code: codeAt(secret), password: PASSWORD } });
    assert.equal(regenerated.status, 200);
    assert.equal(regenerated.body.data.recoveryCodes.length, 10);

    await pool.query(`UPDATE admin_totp SET failed_attempts = 0, locked_until = NULL WHERE admin_id = $1`, [admin.id]);
    const useOld = await verify(await challengeFor(admin.email), old[1]!);
    assert.equal(useOld.status, 401, 'código antigo morreu');
  });

  test('desativar com código funciona; dono/financeiro nunca desativam (403)', async () => {
    const { admin, cookie, csrf } = await loggedIn();
    const secret = (await send(t.app, 'POST', '/2fa/enroll/start', { cookie, csrf, body: { password: PASSWORD } })).body.data.secret as string;
    await send(t.app, 'POST', '/2fa/enroll/confirm', { cookie, csrf, body: { code: codeAt(secret) } });
    await resetReplayGuard(admin.id);
    const off = await send(t.app, 'POST', '/2fa/disable', { cookie, csrf, body: { code: codeAt(secret), password: PASSWORD } });
    assert.equal(off.status, 200);
    assert.equal((await login(admin.email)).body.data.status, 'authenticated');
    assert.ok((await auditActions(admin.id)).includes('admin.2fa.disabled'));

    const owner = await createAdmin('dono');
    const { session } = await enrollMandatory(owner.email);
    const denied = await send(t.app, 'POST', '/2fa/disable', {
      cookie: session.sessionCookie!,
      csrf: session.body.data.csrfToken,
      body: { code: '123456', password: PASSWORD },
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, 'two_factor_required_for_role');
  });
});

describe('segredo em repouso, auditoria e log', () => {
  test('banco guarda só texto cifrado; auditoria e logs nunca contêm segredo, código, recuperação ou token de desafio', async () => {
    const admin = await createAdmin('dono');
    const first = await login(admin.email);
    const challengeToken = first.body.data.challengeToken as string;
    const enrollmentToken = await tokenFor(admin.email);
    const started = await send(t.app, 'POST', '/auth/2fa/enroll/start', { body: { challengeToken, enrollmentToken } });
    const secret = started.body.data.secret as string;
    const typedCode = codeAt(secret);
    const confirmed = await send(t.app, 'POST', '/auth/2fa/enroll/confirm', { body: { challengeToken, enrollmentToken, code: typedCode } });
    const recoveryCodes = confirmed.body.data.recoveryCodes as string[];

    const stored = await pool.query<{ secret_encrypted: string }>('SELECT secret_encrypted FROM admin_totp WHERE admin_id = $1', [admin.id]);
    const ciphertext = stored.rows[0]!.secret_encrypted;
    assert.ok(ciphertext.startsWith('v1.'));
    assert.ok(!ciphertext.includes(secret));

    const dump =
      JSON.stringify((await pool.query('SELECT * FROM admin_audit_log WHERE admin_id = $1', [admin.id])).rows) +
      JSON.stringify((await pool.query('SELECT * FROM admin_recovery_codes WHERE admin_id = $1', [admin.id])).rows);
    const logs = t.logs();
    const secrets = [secret, challengeToken, ...recoveryCodes, ...recoveryCodes.map((c) => c.replace('-', ''))];
    for (const value of secrets) {
      assert.ok(!dump.includes(value), 'segredo na auditoria/tabela de códigos');
      assert.ok(!logs.includes(value), 'segredo no log');
    }
    assert.ok(!logs.includes(`"${typedCode}"`));

    assert.deepEqual(await auditActions(admin.id), ['admin.2fa.enroll_started', 'admin.2fa.enrolled', 'admin.login']);
    const loginAudit = await pool.query(`SELECT after FROM admin_audit_log WHERE action = 'admin.login' AND admin_id = $1`, [admin.id]);
    assert.deepEqual(loginAudit.rows[0].after, { secondFactor: 'enrollment' });
  });

  test('segredo cifrado para um admin não decifra em outro (AAD)', async () => {
    const a = await createAdmin('dono', 'a');
    const b = await createAdmin('financeiro', 'b');
    await enrollMandatory(a.email);
    const { secret: secretB } = await enrollMandatory(b.email);
    await pool.query(
      `UPDATE admin_totp SET secret_encrypted = (SELECT secret_encrypted FROM admin_totp WHERE admin_id = $1) WHERE admin_id = $2`,
      [a.id, b.id],
    );
    await resetReplayGuard(b.id);
    const attempt = await verify(await challengeFor(b.email), codeAt(secretB));
    assert.equal(attempt.status, 500, 'ciphertext transplantado não pode autenticar');
  });
});

describe('contrato anterior preservado', () => {
  test('login sem 2FA ganhou só `status` (aditivo)', async () => {
    const admin = await createAdmin('operacao');
    const reply: Reply = await login(admin.email);
    assert.deepEqual(Object.keys(reply.body.data).sort(), ['csrfToken', 'email', 'id', 'name', 'role', 'status']);
  });
});
