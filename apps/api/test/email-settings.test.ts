import './helpers/setup.js';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import { credentialOriginViolation, parseMailbox, resolveEffective, summarize, type EffectiveSmtp, type PanelSmtp } from '../src/domain/email-settings.js';
import { allowInsecureDev, readEnvSmtp } from '../src/lib/email-env.js';
import { encryptSecret, parseEncryptionKey } from '../src/lib/secret-box.js';
import { BlockedHostError, isBlockedAddress, resolveSafeHost } from '../src/lib/smtp-host-guard.js';
import { twoFactorConfig } from '../src/lib/two-factor-config.js';
import { accountKey } from '../src/repositories/admin-login-failure-repository.js';
import { base32Encode, hotp, totpStep } from '../src/lib/totp.js';
import { startAdminSession } from '../src/services/admin-auth-service.js';
import { createSmtpMailer, EmailNotConfiguredError } from '../src/services/mailer.js';
import { saveEmailSettings } from '../src/services/admin-email-settings-service.js';
import type { AdminRole } from '../src/domain/admin.js';
import { PASSWORD, createAdmin, pool, prepareDatabase, send, shutdown, startApp, type TestApp } from './helpers/harness.js';
import { startFakeSmtp, type FakeSmtp } from './helpers/fake-smtp.js';

// Porta de painel permitida (lista 25/465/587/2525) para o servidor falso. 2525 é a preferida; se outro processo
// da máquina a estiver usando, cai para 587 e depois 25 (sem TLS obrigatório com SMTP_ALLOW_INSECURE_DEV). 465 não serve: é TLS direto.
let PANEL_PORT = 2525;
async function firstFreePort(candidates: readonly number[]): Promise<number> {
  for (const port of candidates) {
    const free = await new Promise<boolean>((resolve) => {
      const probe = createServer();
      probe.once('error', () => resolve(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error('nenhuma porta de painel (2525, 587, 25) livre para o servidor SMTP falso');
}
const ENV_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', 'SMTP_ALLOW_INSECURE_DEV'] as const;
const SECRET = 'S3nha-Super-Secreta-do-SMTP';

let t: TestApp;
let smtp: FakeSmtp | null = null;
before(async () => {
  await prepareDatabase();
  PANEL_PORT = await firstFreePort([2525, 587, 25]);
});
after(shutdown);
beforeEach(async () => {
  for (const key of ENV_KEYS) delete process.env[key];
  await pool.query('DELETE FROM email_settings');
  t = await startApp();
});
afterEach(async () => {
  await t.app.close();
  await smtp?.close();
  smtp = null;
  for (const key of ENV_KEYS) delete process.env[key];
});

/** Segredo TOTP fixo dos admins de teste (20 bytes). */
const TOTP_SECRET = Buffer.alloc(20, 3);
const encryptionKeyForTests = parseEncryptionKey(Buffer.alloc(32, 7).toString('base64'));

/** Admin com 2FA JÁ confirmado (segredo conhecido pelo teste): é o que o dono real tem quando chega ao painel. */
async function session(role: AdminRole = 'dono') {
  const admin = await createAdmin(role);
  await pool.query(`INSERT INTO admin_totp (admin_id, secret_encrypted, confirmed_at) VALUES ($1, $2, now())`, [
    admin.id,
    encryptSecret(base32Encode(TOTP_SECRET), encryptionKeyForTests, admin.id),
  ]);
  const grant = await startAdminSession(pool, { id: admin.id, name: 'x', email: admin.email, role }, { ttlHours: 1, absoluteTtlHours: 2, ipAddress: '127.0.0.1', userAgent: 'test' });
  return { admin, cookie: grant.rawToken, csrf: grant.csrfToken };
}

type Session = Awaited<ReturnType<typeof session>>;

/** Reautenticação válida (senha atual + código do passo corrente). Zera o anti-replay: cada chamada do teste é um "código novo". */
async function stepUp(s: Session): Promise<{ password: string; code: string }> {
  await pool.query('UPDATE admin_totp SET last_used_step = NULL WHERE admin_id = $1', [s.admin.id]);
  return { password: PASSWORD, code: hotp(TOTP_SECRET, totpStep(Date.now())) };
}

/** "Passa o tempo" para a espera progressiva de senha errada (I-6): recua as falhas deste admin. */
const rewindFailures = (s: Session, seconds = 1000) =>
  pool.query('UPDATE admin_login_failures SET created_at = created_at - make_interval(secs => $2) WHERE email_hash = $1', [accountKey(s.admin.email), seconds]);

const get = (s: { cookie: string }) => send(t.app, 'GET', '/settings/email', { cookie: s.cookie });
const post = (s: { cookie: string; csrf: string }, url: string, body: unknown = {}) => send(t.app, 'POST', url, { cookie: s.cookie, csrf: s.csrf, body });
/** Salvar com a reautenticação válida (o caso normal). */
const save = async (s: Session, body: Record<string, unknown>) => post(s, '/settings/email', { ...body, stepUp: await stepUp(s) });
/** Remover a senha salva com a reautenticação válida. */
const removePassword = async (s: Session) => post(s, '/settings/email/password/remove', { stepUp: await stepUp(s) });
const FULL = { host: 'smtp.exemplo.com.br', port: 587, user: 'envio@exemplo.com.br', from: 'VuumBora <envio@exemplo.com.br>' };

describe('trava de host (SSRF)', () => {
  test('bloqueia loopback, rede privada, link-local/metadados, CGNAT, ULA e IPv4 mapeado', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.9', '172.31.255.1', '192.168.0.1', '169.254.169.254', '100.100.100.200', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00:ec2::254', 'fe80::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1', '64:ff9b::a00:1']) {
      assert.equal(isBlockedAddress(ip), true, ip);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111']) assert.equal(isBlockedAddress(ip), false, ip);
  });

  test('localhost (por nome) é bloqueado; a flag de dev libera', async () => {
    await assert.rejects(resolveSafeHost('localhost', false), BlockedHostError);
    await assert.rejects(resolveSafeHost('169.254.169.254', false), BlockedHostError);
    await assert.doesNotReject(resolveSafeHost('127.0.0.1', true));
  });

  test('a flag de dev é ignorada em produção', () => {
    assert.equal(allowInsecureDev({ SMTP_ALLOW_INSECURE_DEV: 'true', NODE_ENV: 'production' }), false);
    assert.equal(allowInsecureDev({ SMTP_ALLOW_INSECURE_DEV: 'true', NODE_ENV: 'test' }), true);
    assert.equal(allowInsecureDev({ NODE_ENV: 'test' }), false);
  });
});

describe('valor efetivo: painel > ambiente > nada', () => {
  const none: PanelSmtp = { host: null, port: null, user: null, from: null, hasPassword: false, updatedAt: null };

  test('origem por campo e resumo (o remetente é independente do servidor)', () => {
    const env = readEnvSmtp({ SMTP_HOST: 'env.host.com', SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASS: 'p', EMAIL_FROM: 'a@b.com' });
    const e = resolveEffective({ ...none, host: 'painel.host.com', port: 587 }, env);
    assert.deepEqual([e.host.source, e.host.value], ['panel', 'painel.host.com']);
    assert.deepEqual([e.port.source, e.port.value], ['panel', 587]);
    assert.deepEqual([e.from.source, e.from.value], ['env', 'a@b.com'], 'remetente cai no ambiente sozinho');
    assert.equal(summarize(e), 'Enviando por painel.host.com:587 como a@b.com');
    const unset = resolveEffective(none, readEnvSmtp({}));
    assert.equal(unset.host.source, 'unset');
    assert.equal(summarize(unset), null);
  });

  // I-1 (revisão S1 rodada 2): servidor, porta, usuário e senha seguem a MESMA origem.
  test('servidor do painel NUNCA herda usuário, senha nem porta do ambiente', () => {
    const env = readEnvSmtp({ SMTP_HOST: 'env.host.com', SMTP_PORT: '465', SMTP_USER: 'usuario-do-ambiente', SMTP_PASS: 'senha-do-ambiente', EMAIL_FROM: 'a@b.com' });
    const e = resolveEffective({ ...none, host: 'servidor-do-painel.com' }, env);
    assert.deepEqual([e.user.source, e.user.value], ['unset', null], 'SMTP_USER do ambiente não vai para o host do painel');
    assert.deepEqual(e.password, { saved: false, source: 'unset' }, 'SMTP_PASS do ambiente não vai para o host do painel');
    assert.deepEqual([e.port.source, e.port.value], ['unset', null], 'porta do ambiente não vale para o host do painel');
    assert.deepEqual(summarize(e), null, 'sem porta do painel não está configurado');
  });

  test('servidor do ambiente ignora usuário, senha e porta que sobraram no painel', () => {
    const env = readEnvSmtp({ SMTP_HOST: 'env.host.com', SMTP_PORT: '465', SMTP_USER: 'usuario-do-ambiente', SMTP_PASS: 'senha-do-ambiente', EMAIL_FROM: 'a@b.com' });
    const e = resolveEffective({ ...none, port: 2525, user: 'usuario-do-painel', hasPassword: true, from: 'Painel <p@x.com>' }, env);
    assert.deepEqual([e.host.source, e.host.value], ['env', 'env.host.com']);
    assert.deepEqual([e.port.source, e.port.value], ['env', 465]);
    assert.deepEqual([e.user.source, e.user.value], ['env', 'usuario-do-ambiente']);
    assert.deepEqual(e.password, { saved: true, source: 'env' });
    assert.deepEqual([e.from.source, e.from.value], ['panel', 'Painel <p@x.com>'], 'só o remetente é do painel');
  });

  test('a trava do envio recusa qualquer mistura de origem', () => {
    const mixed = (patch: Partial<EffectiveSmtp>): EffectiveSmtp => ({
      host: { value: 'h.com', source: 'panel' },
      port: { value: 587, source: 'panel' },
      user: { value: 'u', source: 'panel' },
      from: { value: 'a@b.com', source: 'env' },
      password: { saved: true, source: 'panel' },
      ...patch,
    });
    assert.equal(credentialOriginViolation(mixed({})), null, 'tudo do painel (remetente à parte) é válido');
    assert.equal(credentialOriginViolation(mixed({ password: { saved: true, source: 'env' } })), 'password');
    assert.equal(credentialOriginViolation(mixed({ user: { value: 'u', source: 'env' } })), 'user');
    assert.equal(credentialOriginViolation(mixed({ port: { value: 465, source: 'env' } })), 'port');
    const envHost = { host: { value: 'h.com', source: 'env' as const }, port: { value: 587, source: 'env' as const }, user: { value: 'u', source: 'env' as const } };
    assert.equal(credentialOriginViolation(mixed({ ...envHost, password: { saved: true, source: 'panel' } })), 'password', 'senha do painel com servidor do ambiente');
    assert.equal(credentialOriginViolation(mixed({ ...envHost, password: { saved: true, source: 'env' } })), null);
  });

  test('remetente: nome e injeção de cabeçalho', () => {
    assert.deepEqual(parseMailbox('VuumBora <ola@vuumbora.com.br>'), { name: 'VuumBora', address: 'ola@vuumbora.com.br' });
    assert.equal(parseMailbox('x@y.com\r\nBcc: z@y.com'), null);
    assert.equal(parseMailbox('Nome "<a@b.com>'), null);
  });
});

describe('acesso', () => {
  test('sem sessão 401; papel que não é dono 403; sem CSRF 403', async () => {
    assert.equal((await send(t.app, 'GET', '/settings/email')).status, 401);
    for (const role of ['operacao', 'financeiro', 'suporte', 'revisor_documentos'] as AdminRole[]) {
      const s = await session(role);
      assert.equal((await get(s)).status, 403, role);
      assert.equal((await save(s, FULL)).status, 403, role);
      assert.equal((await post(s, '/settings/email/test')).status, 403, role);
    }
    const owner = await session();
    assert.equal((await send(t.app, 'POST', '/settings/email', { cookie: owner.cookie, body: FULL })).status, 403, 'sem CSRF');
    assert.equal((await send(t.app, 'POST', '/settings/email/test', { cookie: owner.cookie })).status, 403, 'sem CSRF');
    assert.equal((await send(t.app, 'POST', '/settings/email/password/remove', { cookie: owner.cookie })).status, 403, 'sem CSRF');
  });
});

describe('ler e salvar', () => {
  test('sem nada configurado', async () => {
    const s = await session();
    const reply = await get(s);
    assert.equal(reply.status, 200);
    assert.equal(reply.body.data.configured, false);
    assert.equal(reply.body.data.summary, null);
    assert.deepEqual(reply.body.data.fields.host, { value: null, source: 'unset' });
    assert.deepEqual(reply.body.data.missing, ['host', 'port', 'from']);
  });

  test('ambiente aparece como origem "env"; painel sobrepõe; campo em branco volta ao ambiente', async () => {
    process.env['SMTP_HOST'] = 'smtp.ambiente.com.br';
    process.env['SMTP_PORT'] = '465';
    process.env['EMAIL_FROM'] = 'amb@ambiente.com.br';
    process.env['SMTP_PASS'] = SECRET;
    const s = await session();
    const initial = (await get(s)).body.data;
    assert.equal(initial.fields.host.source, 'env');
    assert.equal(initial.fields.password.source, 'env');
    assert.ok(!JSON.stringify(initial).includes(SECRET));
    assert.equal(initial.summary, 'Enviando por smtp.ambiente.com.br:465 como amb@ambiente.com.br');

    const saved = await save(s, { host: 'smtp.painel.com.br', port: 587, from: 'Equipe <eq@painel.com.br>' });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(saved.body.data.fields.host, { value: 'smtp.painel.com.br', source: 'panel' });
    assert.deepEqual(saved.body.data.fields.port, { value: 587, source: 'panel' });
    assert.equal(saved.body.data.summary, 'Enviando por smtp.painel.com.br:587 como Equipe <eq@painel.com.br>');

    const blank = await save(s, { host: '  ', port: '', from: null });
    assert.equal(blank.status, 200, JSON.stringify(blank.body));
    assert.equal(blank.body.data.fields.host.source, 'env');
    assert.equal(blank.body.data.fields.port.source, 'env');
    assert.equal(blank.body.data.fields.from.value, 'amb@ambiente.com.br');
  });

  test('senha: cifrada no banco, nunca devolvida, mantida ao salvar sem senha, removível', async () => {
    const s = await session();
    const saved = await save(s, { ...FULL, password: SECRET });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(saved.body.data.fields.password, { saved: true, source: 'panel' });
    assert.ok(!JSON.stringify(saved.body).includes(SECRET));
    assert.ok(!JSON.stringify((await get(s)).body).includes(SECRET));

    const row = await pool.query('SELECT password_encrypted FROM email_settings');
    assert.match(row.rows[0].password_encrypted, /^v1\./);
    assert.ok(!row.rows[0].password_encrypted.includes(SECRET));

    const again = await save(s, { ...FULL, host: 'outro.exemplo.com.br' });
    assert.equal(again.body.data.fields.password.saved, true, 'sem senha no corpo = mantém');

    const removed = await removePassword(s);
    assert.equal(removed.status, 200);
    assert.deepEqual(removed.body.data.fields.password, { saved: false, source: 'unset' });
    assert.equal((await pool.query('SELECT password_encrypted FROM email_settings')).rows[0].password_encrypted, null);
    assert.equal((await removePassword(s)).status, 200, 'idempotente');

    const viaFlag = await save(s, { ...FULL, password: SECRET });
    assert.equal(viaFlag.body.data.fields.password.saved, true);
    const cleared = await save(s, { ...FULL, clearPassword: true });
    assert.equal(cleared.body.data.fields.password.saved, false);
  });

  test('auditoria registra a mudança e jamais a senha', async () => {
    const s = await session();
    await save(s, { ...FULL, password: SECRET });
    await removePassword(s);
    const audit = await pool.query("SELECT action, before, after FROM admin_audit_log WHERE admin_id = $1 AND target_type = 'email_settings' ORDER BY created_at", [s.admin.id]);
    assert.deepEqual(audit.rows.map((r) => r.action), ['email_settings.updated', 'email_settings.password_removed']);
    assert.equal(audit.rows[0].after.passwordChange, 'set');
    assert.ok(!JSON.stringify(audit.rows).includes(SECRET));
  });

  // B-1 (revisão S1 rodada 3): `admin_audit_log` é imutável (0012) e há relays em que o "usuário" é o próprio token.
  test('B-1: o usuário do SMTP NUNCA vai em claro para a trilha imutável — só "há usuário" e "mudou"', async () => {
    const s = await session();
    // Marca ÚNICA por execução: a trilha é append-only, então uma execução antiga (ou um teste de mutação) que gravou
    // um usuário não pode fazer esta passar a falhar, nem esconder um vazamento novo.
    const tag = Math.random().toString(36).slice(2, 10);
    const USER_A = `token-relay-${tag}-aaaa@exemplo.com.br`;
    const USER_B = `token-relay-${tag}-bbbb`;
    assert.equal((await save(s, { ...FULL, user: USER_A, password: SECRET })).status, 200); // 1) define o usuário
    assert.equal((await save(s, { ...FULL, user: USER_A, host: 'outro.exemplo.com.br' })).status, 200); // 2) mesmo usuário, outro campo
    assert.equal((await save(s, { ...FULL, user: USER_B, host: 'outro.exemplo.com.br' })).status, 200); // 3) troca o usuário
    assert.equal((await save(s, { ...FULL, user: null, host: 'outro.exemplo.com.br' })).status, 200); // 4) apaga o usuário
    assert.equal((await removePassword(s)).status, 200);

    const updated = (await pool.query("SELECT before, after FROM admin_audit_log WHERE admin_id = $1 AND action = 'email_settings.updated' ORDER BY created_at, id", [s.admin.id])).rows;
    assert.equal(updated.length, 4);
    assert.deepEqual(updated.map((r) => r.after.userChanged), [true, false, true, true], 'só diz SE mudou');
    assert.deepEqual(updated.map((r) => r.before.userConfigured), [false, true, true, true]);
    assert.deepEqual(updated.map((r) => r.after.userConfigured), [true, true, true, false]);
    assert.deepEqual(updated.map((r) => r.after.changedFields.includes('user')), [true, false, true, true], 'o NOME do campo continua na lista');
    for (const row of updated) {
      assert.ok(!('user' in row.before) && !('user' in row.after), 'nenhuma chave `user` na trilha');
    }

    // A trilha INTEIRA (não só as linhas deste admin): nenhum pedaço do usuário em claro, em nenhuma ação.
    for (const needle of [USER_A, USER_B, `${tag}-aaaa`, `${tag}-bbbb`, SECRET]) {
      const leaked = await pool.query('SELECT action FROM admin_audit_log WHERE to_jsonb(admin_audit_log)::text LIKE $1', [`%${needle}%`]);
      assert.equal(leaked.rowCount, 0, `"${needle}" apareceu na trilha imutável (${leaked.rows.map((r) => r.action).join(', ')})`);
    }
    assert.deepEqual(await pool.query("SELECT DISTINCT action FROM admin_audit_log WHERE admin_id = $1 AND target_type = 'email_settings' ORDER BY action", [s.admin.id]).then((r) => r.rows.map((x) => x.action)), [
      'email_settings.password_removed',
      'email_settings.updated',
    ]);
  });

  test('validação: host com esquema, porta fora da lista, remetente com quebra de linha, campo extra', async () => {
    const s = await session();
    for (const bad of [{ host: 'http://x.com' }, { host: 'a b.com' }, { host: 'x.com/rota' }, { port: 22 }, { port: 'abc' }, { from: 'a@b.com\r\nBcc: x@y.com' }, { from: 'nao-e-email' }, { admin: true }, { password: 'x', clearPassword: true }]) {
      const reply = await save(s, { ...FULL, ...bad });
      assert.equal(reply.status, 400, JSON.stringify(bad));
      assert.equal(reply.body.error.code, 'validation_failed');
    }
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM email_settings')).rows[0].n, 0, 'nada gravado');
  });

  test('host interno é recusado ao salvar (flag de dev desligada)', async () => {
    const s = await session();
    for (const host of ['127.0.0.1', 'localhost', '10.0.0.5', '169.254.169.254', '192.168.1.10', '::1']) {
      const reply = await save(s, { ...FULL, host });
      assert.equal(reply.status, 422, host);
      assert.equal(reply.body.error.code, 'smtp_host_blocked');
    }
  });

  test('sem chave de cifra, senha não é gravada (503) — falha fechada', async () => {
    const s = await session();
    const admin = { id: s.admin.id, name: 'x', email: s.admin.email, role: 'dono' as const };
    // Chave de 2FA presente (a reautenticação roda), mas a chave que cifra a senha SMTP ausente.
    const outcome = await saveEmailSettings(
      pool,
      admin,
      { host: '8.8.8.8', port: 587, user: 'u', from: null, password: SECRET, stepUp: await stepUp(s) },
      { encryptionKey: null, ipAddress: null, twoFactor: twoFactorConfig },
    );
    assert.equal(outcome.kind, 'encryption_unavailable');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM email_settings')).rows[0].n, 0);
  });

  // I-1: o servidor, a porta, o usuário e a senha do painel são uma unidade.
  test('combinação mista é recusada ao salvar: porta/usuário/senha do painel sem servidor do painel, e servidor sem porta', async () => {
    const s = await session();
    for (const bad of [{ host: null, port: 587 }, { host: null, user: 'u@x.com' }, { host: null, password: SECRET }, { host: 'smtp.exemplo.com.br', port: null }]) {
      const reply = await save(s, { from: 'a@exemplo.com.br', ...bad });
      assert.equal(reply.status, 400, JSON.stringify(bad));
      assert.equal(reply.body.error.code, 'validation_failed');
      assert.ok(reply.body.error.fields.length > 0);
    }
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM email_settings')).rows[0].n, 0, 'nada gravado');
  });

  test('devolver o servidor ao ambiente devolve junto a senha e o usuário (a senha do painel não fica órfã)', async () => {
    process.env['SMTP_HOST'] = 'smtp.ambiente.com.br';
    process.env['SMTP_PORT'] = '587';
    process.env['SMTP_USER'] = 'usuario-do-ambiente';
    process.env['SMTP_PASS'] = 'senha-do-ambiente';
    process.env['EMAIL_FROM'] = 'amb@ambiente.com.br';
    const s = await session();
    const onPanel = await save(s, { ...FULL, password: SECRET });
    assert.equal(onPanel.status, 200, JSON.stringify(onPanel.body));
    assert.deepEqual(onPanel.body.data.fields.password, { saved: true, source: 'panel' });

    const back = await save(s, { host: null, port: null, user: null, from: 'Painel <p@exemplo.com.br>' });
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.deepEqual(back.body.data.fields.password, { saved: true, source: 'env' });
    assert.equal(back.body.data.fields.user.source, 'env');
    assert.equal(back.body.data.fields.host.source, 'env');
    assert.equal(back.body.data.fields.from.source, 'panel');
    assert.equal(back.body.data.panel.passwordSaved, false, 'a senha cifrada do painel foi apagada junto');
    assert.equal((await pool.query('SELECT password_encrypted FROM email_settings')).rows[0].password_encrypted, null);
  });
});

// I-2 (revisão S1 rodada 2): quem controla o SMTP recebe os códigos de verificação e de redefinição de senha dos apps.
describe('reautenticação para alterar o SMTP (senha atual + TOTP do dono)', () => {
  const rowCount = async () => (await pool.query('SELECT count(*)::int AS n FROM email_settings')).rows[0].n as number;
  const auditActions = async (adminId: string) =>
    (await pool.query("SELECT action FROM admin_audit_log WHERE admin_id = $1 AND target_type = 'email_settings' ORDER BY created_at, id", [adminId])).rows.map((r) => r.action as string);

  test('só o cookie de sessão não basta: sem o bloco stepUp, 400 e nada é gravado', async () => {
    const s = await session();
    const reply = await post(s, '/settings/email', FULL);
    assert.equal(reply.status, 400);
    assert.equal(reply.body.error.code, 'validation_failed');
    assert.deepEqual(reply.body.error.fields, ['stepUp']);
    assert.equal((await post(s, '/settings/email/password/remove', {})).status, 400);
    assert.equal(await rowCount(), 0);
  });

  test('senha atual errada: 403 password_invalid e NADA é gravado', async () => {
    const s = await session();
    const reply = await post(s, '/settings/email', { ...FULL, stepUp: { ...(await stepUp(s)), password: 'senha-errada-qualquer' } });
    assert.equal(reply.status, 403, JSON.stringify(reply.body));
    assert.equal(reply.body.error.code, 'password_invalid');
    assert.equal(await rowCount(), 0);
  });

  test('código TOTP errado: 401 invalid_second_factor e NADA é gravado', async () => {
    const s = await session();
    const good = await stepUp(s);
    const wrong = good.code === '000000' ? '000001' : '000000';
    const reply = await post(s, '/settings/email', { ...FULL, stepUp: { password: PASSWORD, code: wrong } });
    assert.equal(reply.status, 401, JSON.stringify(reply.body));
    assert.equal(reply.body.error.code, 'invalid_second_factor');
    assert.equal(await rowCount(), 0);
  });

  test('código de recuperação não vale como TOTP aqui', async () => {
    const s = await session();
    const reply = await post(s, '/settings/email', { ...FULL, stepUp: { password: PASSWORD, code: 'ABCDE-FGHIJ' } });
    assert.equal(reply.status, 401);
    assert.equal(await rowCount(), 0);
  });

  test('o código TOTP é gasto: repetir o mesmo código recusa (replay)', async () => {
    const s = await session();
    const reusable = await stepUp(s);
    assert.equal((await post(s, '/settings/email', { ...FULL, stepUp: reusable })).status, 200);
    const replay = await post(s, '/settings/email', { ...FULL, host: 'outro.exemplo.com.br', stepUp: reusable });
    assert.equal(replay.status, 401, 'mesmo código de novo');
    assert.equal((await pool.query('SELECT host FROM email_settings')).rows[0].host, 'smtp.exemplo.com.br', 'a 2ª alteração não entrou');
  });

  test('senha errada impõe a espera progressiva ao par (o step-up não é palpite livre): até a senha certa espera', async () => {
    const s = await session();
    const wrong = (i: number) => post(s, '/settings/email', { ...FULL, stepUp: { password: 'errada-' + i, code: '000000' } });
    // (o código errado fica de fora de propósito: a senha é verificada ANTES e é ela que gera a espera)
    assert.equal((await wrong(0)).status, 403);
    for (let i = 1; i < 5; i += 1) assert.equal((await wrong(i)).status, 429, 'martelar não passa da espera');
    const right = await save(s, FULL);
    assert.equal(right.status, 429);
    assert.equal(right.body.error.code, 'account_locked');
    assert.equal(right.body.error.retryAfterSeconds, 1);
    assert.equal(await rowCount(), 0);
    await rewindFailures(s, 5);
    assert.equal((await save(s, FULL)).status, 200, 'passada a espera, a senha certa vale');
  });

  test('remover a senha salva também exige a reautenticação', async () => {
    const s = await session();
    assert.equal((await save(s, { ...FULL, password: SECRET })).status, 200);
    const wrong = await post(s, '/settings/email/password/remove', { stepUp: { ...(await stepUp(s)), password: 'nao-e-a-senha' } });
    assert.equal(wrong.status, 403);
    await rewindFailures(s, 5);
    assert.equal((await pool.query('SELECT password_encrypted IS NOT NULL AS has FROM email_settings')).rows[0].has, true, 'a senha continua salva');
    assert.equal((await removePassword(s)).status, 200);
    assert.equal((await pool.query('SELECT password_encrypted IS NOT NULL AS has FROM email_settings')).rows[0].has, false);
  });

  test('sem a chave de 2FA no servidor, a alteração falha fechada (503) e nada é gravado', async () => {
    const s = await session();
    const admin = { id: s.admin.id, name: 'x', email: s.admin.email, role: 'dono' as const };
    const outcome = await saveEmailSettings(pool, admin, { ...FULL, password: undefined, stepUp: await stepUp(s) }, { encryptionKey: null, ipAddress: null });
    assert.deepEqual(outcome, { kind: 'step_up_failed', failure: { kind: 'two_factor_unavailable' } });
    assert.equal(await rowCount(), 0);
  });

  test('alteração válida gera auditoria com os NOMES dos campos alterados (sem valores secretos) e o alerta no log', async () => {
    const s = await session();
    const first = await save(s, { ...FULL, password: SECRET });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const second = await save(s, { ...FULL, host: 'outro.exemplo.com.br' });
    assert.equal(second.status, 200);

    const rows = await pool.query("SELECT after FROM admin_audit_log WHERE admin_id = $1 AND action = 'email_settings.updated' ORDER BY created_at, id", [s.admin.id]);
    assert.deepEqual(rows.rows[0].after.changedFields, ['host', 'port', 'user', 'from', 'password']);
    assert.deepEqual(rows.rows[1].after.changedFields, ['host']);
    assert.equal(rows.rows[1].after.stepUp, 'password+totp');
    assert.ok(!JSON.stringify(rows.rows).includes(SECRET));

    const alerts = t
      .logs()
      .split('\n')
      .filter((line) => line.includes('email_settings_changed'))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.equal(alerts.length, 2);
    assert.equal(alerts[0]!['level'], 40, 'nível warn');
    assert.equal(alerts[0]!['adminId'], s.admin.id);
    assert.deepEqual(alerts[1]!['changedFields'], ['host']);
    const logs = t.logs();
    for (const forbidden of [SECRET, PASSWORD, 'outro.exemplo.com.br', 'envio@exemplo.com.br']) assert.ok(!logs.includes(forbidden), `log vazou: ${forbidden}`);
    assert.deepEqual(await auditActions(s.admin.id), ['email_settings.updated', 'email_settings.updated']);
  });
});

describe('e-mail de teste', () => {
  test('envia pelo servidor falso usando a senha salva (decifrada só no envio)', async () => {
    process.env['SMTP_ALLOW_INSECURE_DEV'] = 'true';
    smtp = await startFakeSmtp({ port: PANEL_PORT, user: 'envio@exemplo.com.br', pass: SECRET });
    const s = await session();
    const saved = await save(s, { host: '127.0.0.1', port: PANEL_PORT, user: 'envio@exemplo.com.br', from: 'VuumBora <ola@vuumbora.com.br>', password: SECRET });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));

    const reply = await post(s, '/settings/email/test', { to: 'dono@exemplo.com' });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.deepEqual(reply.body.data, { delivered: true, to: 'dono@exemplo.com' });
    assert.deepEqual(smtp.logins, [{ user: 'envio@exemplo.com.br', pass: SECRET }]);
    assert.equal(smtp.messages.length, 1);
    assert.deepEqual(smtp.messages[0]!.to, ['dono@exemplo.com']);
    assert.match(smtp.messages[0]!.raw, /From: "?VuumBora"? <ola@vuumbora\.com\.br>/);

    // Sem `to`: vai para o e-mail do próprio admin.
    const self = await post(s, '/settings/email/test');
    assert.equal(self.body.data.to, s.admin.email);
  });

  // I-1: o cenário do achado. O dono (ou uma sessão roubada) aponta o servidor para um host DELE e não digita senha.
  test('SMTP_PASS e SMTP_USER do ambiente NUNCA são enviados a um servidor digitado no painel', async () => {
    process.env['SMTP_ALLOW_INSECURE_DEV'] = 'true';
    process.env['SMTP_HOST'] = 'smtp.ambiente.com.br';
    process.env['SMTP_PORT'] = '587';
    process.env['SMTP_USER'] = 'usuario-do-ambiente';
    process.env['SMTP_PASS'] = 'SENHA-DA-INFRA-NAO-PODE-VAZAR';
    process.env['EMAIL_FROM'] = 'sistema@ambiente.com.br';
    // O "servidor do atacante": aceita qualquer coisa e registra toda tentativa de AUTH.
    smtp = await startFakeSmtp({ port: PANEL_PORT });
    const s = await session();
    const saved = await save(s, { host: '127.0.0.1', port: PANEL_PORT });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(saved.body.data.fields.password, { saved: false, source: 'unset' });
    assert.deepEqual(saved.body.data.fields.user, { value: null, source: 'unset' });

    const reply = await post(s, '/settings/email/test', { to: 'dono@exemplo.com' });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.equal(smtp.messages.length, 1, 'a mensagem foi entregue (sem autenticar)');
    assert.deepEqual(smtp.logins, [], 'nenhuma credencial do ambiente foi apresentada ao servidor do painel');
    assert.ok(!smtp.messages[0]!.raw.includes('SENHA-DA-INFRA'));
  });

  test('servidor do painel com credenciais do painel: usa as DO PAINEL, nunca as do ambiente', async () => {
    process.env['SMTP_ALLOW_INSECURE_DEV'] = 'true';
    process.env['SMTP_HOST'] = 'smtp.ambiente.com.br';
    process.env['SMTP_PORT'] = '587';
    process.env['SMTP_USER'] = 'usuario-do-ambiente';
    process.env['SMTP_PASS'] = 'SENHA-DA-INFRA-NAO-PODE-VAZAR';
    process.env['EMAIL_FROM'] = 'sistema@ambiente.com.br';
    smtp = await startFakeSmtp({ port: PANEL_PORT, user: 'usuario-do-painel', pass: SECRET });
    const s = await session();
    await save(s, { host: '127.0.0.1', port: PANEL_PORT, user: 'usuario-do-painel', password: SECRET });
    const reply = await post(s, '/settings/email/test', { to: 'dono@exemplo.com' });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.deepEqual(smtp.logins, [{ user: 'usuario-do-painel', pass: SECRET }]);
  });

  test('servidor do painel com usuário e SEM senha salva: "faltam campos", não usa a senha do ambiente', async () => {
    process.env['SMTP_ALLOW_INSECURE_DEV'] = 'true';
    process.env['SMTP_PASS'] = 'SENHA-DA-INFRA-NAO-PODE-VAZAR';
    process.env['SMTP_USER'] = 'usuario-do-ambiente';
    smtp = await startFakeSmtp({ port: PANEL_PORT });
    const s = await session();
    await save(s, { host: '127.0.0.1', port: PANEL_PORT, user: 'usuario-do-painel', from: 'a@exemplo.com.br' });
    const reply = await post(s, '/settings/email/test');
    assert.equal(reply.status, 409);
    assert.deepEqual(reply.body.error.missing, ['password']);
    assert.deepEqual(smtp.logins, []);
  });

  test('devolve o erro EXATO do servidor e nunca a senha', async () => {
    process.env['SMTP_ALLOW_INSECURE_DEV'] = 'true';
    smtp = await startFakeSmtp({ port: PANEL_PORT, user: 'u@exemplo.com.br', pass: 'senha-certa' });
    const s = await session();
    await save(s, { host: '127.0.0.1', port: PANEL_PORT, user: 'u@exemplo.com.br', from: 'a@exemplo.com.br', password: SECRET });
    const reply = await post(s, '/settings/email/test');
    assert.equal(reply.status, 502);
    assert.equal(reply.body.error.code, 'smtp_delivery_failed');
    assert.match(reply.body.error.details.serverMessage, /Credenciais recusadas pelo servidor falso/);
    assert.equal(reply.body.error.details.smtpCode, 'EAUTH');
    assert.ok(!JSON.stringify(reply.body).includes(SECRET));
    assert.equal(smtp.messages.length, 0);

    await save(s, { host: '127.0.0.1', port: PANEL_PORT, user: 'u@exemplo.com.br', from: 'a@exemplo.com.br', password: 'senha-certa' });
    await smtp.close();
    smtp = await startFakeSmtp({ port: PANEL_PORT, user: 'u@exemplo.com.br', pass: 'senha-certa', rejectRecipientsWith: 'Relay negado: destinatário fora do domínio' });
    const rejected = await post(s, '/settings/email/test', { to: 'fora@outro.com' });
    assert.equal(rejected.status, 502);
    assert.match(rejected.body.error.details.serverMessage, /Relay negado: destinatário fora do domínio/);
    assert.equal(rejected.body.error.details.responseCode, 550);
  });

  test('host do painel que aponta para dentro é barrado no envio (linha gravada direto no banco)', async () => {
    smtp = await startFakeSmtp({ port: PANEL_PORT });
    await pool.query("INSERT INTO email_settings (id, host, port, from_address) VALUES (1, '127.0.0.1', $1, 'a@b.com')", [PANEL_PORT]);
    const s = await session();
    const reply = await post(s, '/settings/email/test');
    assert.equal(reply.status, 422);
    assert.equal(reply.body.error.code, 'smtp_host_blocked');
    assert.equal(smtp.messages.length, 0);
  });

  test('sem configuração: 409 claro; limite de 5 por hora vale também sob concorrência', async () => {
    const s = await session();
    const none = await post(s, '/settings/email/test');
    assert.equal(none.status, 409);
    assert.equal(none.body.error.code, 'email_not_configured');
    assert.deepEqual(none.body.error.missing, ['host', 'port', 'from']);

    // 1 tentativa já gasta; mais 40 em paralelo: só 4 passam da reserva.
    const replies = await Promise.all(Array.from({ length: 40 }, () => post(s, '/settings/email/test')));
    assert.equal(replies.filter((r) => r.status === 409).length, 4);
    const limited = replies.filter((r) => r.status === 429);
    assert.equal(limited.length, 36);
    assert.equal(limited[0]!.body.error.code, 'test_email_rate_limited');
    assert.ok(limited[0]!.body.error.retryAfterSeconds > 3500);
    assert.ok(limited[0]!.headers['retry-after']);

    const other = await session();
    assert.equal((await post(other, '/settings/email/test')).status, 409, 'limite é por admin');
  });

  test('a reserva do limite espera o lock consultivo do admin (é ele que impede a corrida)', async () => {
    const s = await session();
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`email_settings.test:${s.admin.id}`]);
      let finished = false;
      const pending = post(s, '/settings/email/test').then((reply) => {
        finished = true;
        return reply;
      });
      await new Promise((resolve) => setTimeout(resolve, 400));
      assert.equal(finished, false, 'sem o lock, a reserva passaria direto');
      await holder.query('COMMIT');
      assert.equal((await pending).status, 409);
    } finally {
      holder.release();
    }
  });

  test('o log não contém host, usuário, senha nem destinatário', async () => {
    process.env['SMTP_ALLOW_INSECURE_DEV'] = 'true';
    smtp = await startFakeSmtp({ port: PANEL_PORT, user: 'usuario-secreto', pass: SECRET });
    const s = await session();
    await save(s, { host: '127.0.0.1', port: PANEL_PORT, user: 'usuario-secreto', from: 'a@exemplo.com.br', password: SECRET });
    await post(s, '/settings/email/test', { to: 'destinatario-privado@exemplo.com' });
    await save(s, { host: '127.0.0.1', port: PANEL_PORT, user: 'usuario-secreto', from: 'a@exemplo.com.br', password: 'errada' });
    await post(s, '/settings/email/test');
    const logs = t.logs();
    assert.match(logs, /email_sent/);
    assert.match(logs, /email_send_failed/);
    for (const forbidden of [SECRET, 'errada', 'usuario-secreto', '127.0.0.1:' + PANEL_PORT, 'destinatario-privado', PASSWORD]) assert.ok(!logs.includes(forbidden), `log vazou: ${forbidden}`);
  });
});

describe('Mailer', () => {
  const key = parseEncryptionKey(Buffer.alloc(32, 7).toString('base64'));

  test('sem SMTP configurado falha com EmailNotConfiguredError', async () => {
    const mailer = createSmtpMailer({ pool, encryptionKey: key, readEnv: () => readEnvSmtp({}) });
    await assert.rejects(mailer.send({ to: 'a@b.com', subject: 's', text: 't' }), EmailNotConfiguredError);
  });

  test('lê a configuração a cada envio; o host do ambiente não passa pela trava', async () => {
    smtp = await startFakeSmtp();
    const env = { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.port), EMAIL_FROM: 'Sistema <sis@vuumbora.com.br>' } as NodeJS.ProcessEnv;
    // Sem a flag de dev, STARTTLS é obrigatório: o servidor falso não oferece e o envio falha.
    const strict = createSmtpMailer({ pool, encryptionKey: key, readEnv: () => readEnvSmtp(env), insecureDev: () => false });
    await assert.rejects(strict.send({ to: 'a@b.com', subject: 's', text: 't' }), /STARTTLS|TLS/i);
    const dev = createSmtpMailer({ pool, encryptionKey: key, readEnv: () => readEnvSmtp(env), insecureDev: () => true });
    await dev.send({ to: 'a@b.com', subject: 'Olá', text: 'corpo' });
    assert.equal(smtp.messages.length, 1);
    // O painel passa a valer na próxima mensagem, sem recriar o mailer.
    await pool.query("INSERT INTO email_settings (id, from_address) VALUES (1, 'painel@vuumbora.com.br') ON CONFLICT (id) DO UPDATE SET from_address = EXCLUDED.from_address");
    await dev.send({ to: 'a@b.com', subject: 'Olá 2', text: 'corpo' });
    assert.match(smtp.messages[1]!.raw, /painel@vuumbora\.com\.br/);
  });
});
