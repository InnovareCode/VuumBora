/**
 * Endurecimento da identidade dos apps — revisão S1 rodada 2:
 *   I-4  recadastro sobre conta NÃO verificada + purga de contas não verificadas
 *   I-5  limites por e-mail canonical, por /64 IPv6, teto global de e-mails, saudação sanitizada
 *   I-7  teto cumulativo de falhas do código de redefinição + aviso "senha alterada"
 * (I-6, o atraso progressivo, tem arquivo próprio: progressive-delay.test.ts.)
 */
import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { drainBackgroundTasks } from '../src/lib/background-tasks.js';
import { loadAuthConfig } from '../src/lib/auth-config.js';
import { registerAccount } from '../src/services/identity-service.js';
import { canonicalEmailForLimit } from '../src/lib/email-normalize.js';
import { hashEmailCode } from '../src/lib/email-code.js';
import { buildCodeMail, buildPasswordChangedMail, greetingFor } from '../src/lib/identity-mail.js';
import { DEFAULT_RETENTION, runIdentityRetention } from '../src/lib/identity-retention.js';
import { ipBucket } from '../src/lib/ip-bucket.js';
import { hmacHex } from '../src/lib/token-crypto.js';
import { pool, prepareDatabase, shutdown } from './helpers/harness.js';
import { ageCodes, makeClient, PASSWORD, PEPPER, REGISTER_EXTRAS, startIdentityApp, uniqueEmail, type Harness } from './helpers/identity-kit.js';

let h: Harness;
let api!: ReturnType<typeof makeClient>;

before(async () => {
  await prepareDatabase();
  h = await startIdentityApp();
  api = makeClient(h);
});
after(async () => {
  await h.t.app.close();
  await shutdown();
});
beforeEach(async () => {
  await pool.query('TRUNCATE accounts CASCADE');
  await pool.query('TRUNCATE login_attempts');
  h.mailbox.sent.length = 0;
  h.mailbox.failing = false;
});

const call: typeof api.call = (...args) => api.call(...args);
const register: typeof api.register = (...args) => api.register(...args);
const registerAndLogin: typeof api.registerAndLogin = (...args) => api.registerAndLogin(...args);
const randomTag = () => Math.random().toString(36).slice(2, 10);
const signUp = (email: string, extra: Record<string, unknown> = {}, ip?: string) =>
  call('POST', '/v1/auth/register', { ...(ip ? { ip } : {}), body: { accountType: 'passenger', fullName: 'Pessoa', email, password: PASSWORD, ...REGISTER_EXTRAS, ...extra } });
const login = (email: string, password: string) =>
  call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: email, password, device: { installationId: 'instalacao-0001', platform: 'android' } } });
const verify = (email: string, code: string, password = PASSWORD) => call('POST', '/v1/auth/verify-email', { body: { accountType: 'passenger', identifier: email, code, password } });
const forgot = (email: string, ip?: string) => call('POST', '/v1/auth/forgot-password', { ...(ip ? { ip } : {}), body: { accountType: 'passenger', email } });
const reset = (email: string, code: string, newPassword = 'Nova-senha-9876') =>
  call('POST', '/v1/auth/reset-password', { body: { accountType: 'passenger', email, code, newPassword } });
const wrong = (real: string) => (real === '000000' ? '000001' : '000000');
const accountOf = async (email: string) => (await pool.query('SELECT id, public_id, full_name, phone, status, email_verified_at FROM accounts WHERE email = $1', [email])).rows;

/** Sobe um app com variáveis de ambiente próprias (o limite é lido ao montar as rotas) e restaura tudo no fim. */
async function withApp(overrides: Record<string, string>, body: (harness: Harness, client: ReturnType<typeof makeClient>) => Promise<void>): Promise<void> {
  const saved = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  const harness = await startIdentityApp();
  try {
    await body(harness, makeClient(harness));
  } finally {
    await harness.t.app.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

// ------------------------------------------------------------------ I-4

describe('I-4: cadastro sobre conta NÃO verificada', () => {
  test('SUBSTITUI a conta: a antiga some (com o aceite dela), a nova tem os dados, a senha, o código e o ACEITE do último cadastro', async () => {
    const email = uniqueEmail('ocupada');
    const squatterIp = '203.0.113.10';
    const ownerIp = '203.0.113.20';
    // O "invasor" cadastra o e-mail de OUTRA pessoa.
    const squatter = await register(email, 'passenger', { password: 'Senha-do-invasor-1', ip: squatterIp });
    const squatterConsent = (await pool.query(`SELECT count(*)::int AS n, min(accepted_at) AS at FROM account_consents WHERE account_id = $1`, [squatter.account.id])).rows[0];
    assert.equal(squatterConsent.n, 2);

    // A dona verdadeira se cadastra: antes da correção, 409 para sempre.
    const owner = await signUp(email, { fullName: 'Dona Verdadeira', password: 'Senha-da-dona-2', phone: '84999998888', birthDate: '1985-03-03' }, ownerIp);
    assert.equal(owner.status, 201, JSON.stringify(owner.body));
    assert.notEqual(owner.body.data.account.id, squatter.account.id, 'é uma conta NOVA (a antiga foi substituída, não editada)');
    assert.equal(owner.body.data.account.fullName, 'Dona Verdadeira');
    assert.equal(owner.body.data.verification.emailSent, true);
    assert.equal(h.mailbox.to(email).length, 2, 'um código novo foi enviado');

    const rows = await accountOf(email);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, owner.body.data.account.id);
    assert.equal(rows[0].full_name, 'Dona Verdadeira');
    assert.ok(rows[0].phone, 'telefone da dona');
    assert.equal((await pool.query(`SELECT birth_date::text AS b FROM accounts WHERE id = $1`, [rows[0].id])).rows[0].b, '1985-03-03');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts WHERE id = $1', [squatter.account.id])).rows[0].n, 0, 'a conta do invasor sumiu');

    // O aceite FINAL é o do último cadastro: dois documentos, na conta nova, com o HMAC do IP da dona e a data de depois.
    const consents = (await pool.query(`SELECT account_id, document, ip_hash, accepted_at FROM account_consents ORDER BY document`)).rows;
    assert.deepEqual(consents.map((c) => [c.account_id, c.document]), [[rows[0].id, 'privacy_policy'], [rows[0].id, 'terms_of_use']], 'nenhum aceite do primeiro cadastrante sobrou');
    for (const consent of consents) {
      assert.equal(consent.ip_hash, hmacHex(PEPPER, ownerIp), 'o IP gravado é o do ÚLTIMO cadastro');
      assert.ok(consent.accepted_at > squatterConsent.at, 'a data do aceite é a do último cadastro');
    }
    assert.equal(
      (await pool.query(`SELECT count(*)::int AS n FROM account_consents WHERE ip_hash = $1`, [hmacHex(PEPPER, squatterIp)])).rows[0].n,
      0,
      'o HMAC de IP do invasor não ficou em lugar nenhum',
    );

    // Código e senha: o do cadastro antigo morreu junto com a conta; o novo vale com a senha da dona.
    const fresh = h.mailbox.lastCode(email);
    if (squatter.code !== fresh) assert.equal((await verify(email, squatter.code, 'Senha-da-dona-2')).status, 400, 'o código do cadastro antigo não vale mais');
    assert.equal((await verify(email, fresh, 'Senha-da-dona-2')).status, 200);
    assert.equal((await login(email, 'Senha-do-invasor-1')).status, 401, 'a senha do invasor morreu');
    assert.equal((await login(email, 'Senha-da-dona-2')).status, 200, 'a da dona entra');
  });

  test('cada recadastro manda o código na hora; o teto por endereço é o do cadastro (5 por e-mail canonical por hora)', async () => {
    const email = uniqueEmail('rapida');
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await signUp(email, { password: `Senha-da-dona-${i}-x` })).status);
    assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429]);
    assert.equal(h.mailbox.to(email).length, 5, 'um e-mail por recadastro, no máximo 5 por hora');
    assert.equal((await accountOf(email)).length, 1);
    // A última senha vence; a anterior morreu.
    assert.equal((await login(email, 'Senha-da-dona-3-x')).status, 401);
    const last = await login(email, 'Senha-da-dona-4-x');
    assert.equal(last.status, 403);
    assert.equal(last.body.error.code, 'email_not_verified', 'senha certa, conta ainda não verificada');
  });

  test('conta já VERIFICADA nunca é tocada: 409, sem e-mail, e senha/nome intactos', async () => {
    const email = uniqueEmail('verificada');
    await registerAndLogin(email);
    h.mailbox.sent.length = 0;
    const attempt = await signUp(email, { fullName: 'Invasor', password: 'Senha-do-invasor-1' });
    assert.equal(attempt.status, 409);
    assert.equal(attempt.body.error.code, 'email_taken');
    assert.equal(h.mailbox.sent.length, 0);
    assert.equal((await accountOf(email))[0].full_name, 'Pessoa de Teste');
    assert.equal((await login(email, PASSWORD)).status, 200);
    assert.equal((await login(email, 'Senha-do-invasor-1')).status, 401);
  });

  test('conta bloqueada (não ativa) mesmo sem verificação não é reaproveitada', async () => {
    const email = uniqueEmail('bloqueada');
    await register(email);
    await pool.query(`UPDATE accounts SET status = 'blocked' WHERE email = $1`, [email]);
    assert.equal((await signUp(email)).status, 409);
  });

  test('a conta substituída ENTRE o commit e o aviso de e-mail enviado não derruba o cadastro (trilha sem vínculo, sem 503)', async () => {
    const email = uniqueEmail('substituida-no-meio');
    // O e-mail "sai" no instante em que outro cadastro do mesmo e-mail substitui a conta recém-criada.
    const substituting = {
      async send() {
        await pool.query('SELECT reclaim_unverified_account($1, $2)', ['passenger', email]);
      },
    };
    const result = await registerAccount(
      pool,
      loadAuthConfig()!,
      { mail: substituting, onMailFailure: () => undefined },
      { accountType: 'passenger', fullName: 'Pessoa', email, password: PASSWORD, phone: null, birthDate: REGISTER_EXTRAS.birthDate },
      { ipHash: null, userAgentFamily: 'x', requestId: 'r' },
    );
    assert.equal(result.kind, 'ok');
    assert.equal((await accountOf(email)).length, 0, 'a conta foi mesmo substituída (apagada) no meio do caminho');
  });

  test('CONCORRÊNCIA: 4 cadastros simultâneos do mesmo e-mail terminam em UMA conta só, com UM aceite (sem erro 500)', async () => {
    const email = uniqueEmail('corrida');
    const replies = await Promise.all(Array.from({ length: 4 }, (_, i) => signUp(email, { password: `Senha-numero-${i}-xx` })));
    assert.deepEqual(replies.map((r) => r.status), [201, 201, 201, 201], JSON.stringify(replies.map((r) => r.body)));
    const rows = await accountOf(email);
    assert.equal(rows.length, 1);
    assert.ok(replies.some((r) => r.body.data.account.id === rows[0].id), 'a conta que sobrou é a de uma das respostas (a última a vencer)');
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM account_credentials c JOIN accounts a ON a.id = c.account_id WHERE a.email = $1`, [email])).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_consents')).rows[0].n, 2, 'dois documentos, de UMA conta: os das contas substituídas caíram junto');
    assert.equal((await pool.query('SELECT count(DISTINCT account_id)::int AS n FROM account_consents')).rows[0].n, 1);
  });
});

describe('I-4b: verificar o e-mail exige a SENHA escolhida no cadastro', () => {
  test('código certo com senha errada não verifica: é tratado como código errado (mesma resposta, gasta tentativa)', async () => {
    const created = await register();
    const wrongPassword = await verify(created.email, created.code, 'outra-senha-qualquer');
    assert.equal(wrongPassword.status, 400);
    assert.equal(wrongPassword.body.error.code, 'invalid_code');
    assert.equal(wrongPassword.body.error.attemptsLeft, 4);
    assert.equal(wrongPassword.body.error.message, 'Código ou senha incorretos.');
    const wrongCode = await verify(created.email, wrong(created.code));
    assert.deepEqual(
      { ...wrongCode.body.error, attemptsLeft: undefined },
      { ...wrongPassword.body.error, attemptsLeft: undefined },
      'senha errada e código errado: o corpo da resposta é o mesmo (sem oráculo)',
    );
    assert.equal((await accountOf(created.email))[0].email_verified_at, null, 'continua não verificada');
    assert.equal((await verify(created.email, created.code)).status, 200, 'código certo + senha certa verifica');
  });

  test('5 senhas erradas queimam o código como 5 códigos errados (429 code_locked); depois nem o par certo vale', async () => {
    const created = await register();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await verify(created.email, created.code, `errada-${i}-xxxxx`)).status);
    assert.deepEqual(statuses, [400, 400, 400, 400, 429]);
    const after = await verify(created.email, created.code);
    assert.equal(after.status, 400);
    assert.equal(after.body.error.code, 'code_expired', 'o código morreu; é preciso pedir outro');
  });

  test('sem a senha no corpo: 400 invalid_body; conta desconhecida segue respondendo code_expired (e roda o bcrypt do mesmo jeito)', async () => {
    const created = await register();
    const missing = await call('POST', '/v1/auth/verify-email', { body: { accountType: 'passenger', identifier: created.email, code: created.code } });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error.code, 'invalid_body');
    const ghost = await verify('fantasma-sem-conta@teste.vuumbora.dev', '123456', 'qualquer-senha');
    assert.equal(ghost.status, 400);
    assert.equal(ghost.body.error.code, 'code_expired');
  });

  test('O ATAQUE: o invasor sobrescreve o cadastro pendente da vítima; a vítima digita o código novo e a SUA senha — não verifica nada', async () => {
    const email = uniqueEmail('vitima');
    const victimIp = '198.51.100.10';
    const attackerIp = '198.51.100.99';
    await register(email, 'passenger', { password: 'Senha-da-vitima-1', ip: victimIp });
    // O invasor sobrescreve (o código novo vai para o e-mail da vítima, que não sabe de nada).
    assert.equal((await signUp(email, { password: 'Senha-do-invasor-9', fullName: 'Invasor' }, attackerIp)).status, 201);
    const codeInMailbox = h.mailbox.lastCode(email);

    // A vítima, achando que o e-mail é do cadastro dela, digita o código e a senha que ESCOLHEU.
    const victimTries = await verify(email, codeInMailbox, 'Senha-da-vitima-1');
    assert.equal(victimTries.status, 400, 'sem a correção, a conta seria verificada com a senha do invasor');
    assert.equal((await accountOf(email))[0].email_verified_at, null);
    assert.equal((await login(email, 'Senha-da-vitima-1')).status, 401, 'a senha da vítima não abre a conta do invasor');

    // A saída da vítima: cadastrar de novo (substitui a conta do invasor) e verificar com a própria senha.
    assert.equal((await signUp(email, { password: 'Senha-da-vitima-1', fullName: 'Vítima' }, victimIp)).status, 201);
    const second = h.mailbox.lastCode(email);
    assert.equal((await verify(email, second, 'Senha-da-vitima-1')).status, 200);
    assert.equal((await login(email, 'Senha-da-vitima-1')).status, 200, 'a conta verificada é a da vítima, com a senha dela');
    assert.equal((await login(email, 'Senha-do-invasor-9')).status, 401);
  });

  test('CORRIDA: 8 vítimas e 8 invasores ao mesmo tempo — nenhuma conta termina verificada com a senha do invasor', async () => {
    const rounds = Array.from({ length: 8 }, (_, i) => ({ email: uniqueEmail(`corrida${i}`), i }));
    const outcomes = await Promise.all(
      rounds.map(async ({ email, i }) => {
        const victimPassword = `Senha-da-vitima-${i}-x`;
        const attackerPassword = `Senha-do-invasor-${i}-x`;
        const first = await register(email, 'passenger', { password: victimPassword });
        // Em paralelo: o invasor sobrescreve; a vítima já tenta verificar com o 1º código e a própria senha.
        const [attack, early] = await Promise.all([signUp(email, { password: attackerPassword }), verify(email, first.code, victimPassword)]);
        // Depois: a vítima usa o código MAIS RECENTE da caixa de entrada com a própria senha (a história do ataque).
        const late = attack.status === 201 && h.mailbox.to(email).length > 1 ? await verify(email, h.mailbox.lastCode(email), victimPassword) : null;
        return { email, i, victimPassword, attackerPassword, attack: attack.status, early: early.status, late: late?.status ?? null };
      }),
    );
    for (const o of outcomes) {
      const [row] = await accountOf(o.email);
      assert.ok(row, 'a conta existe');
      if (row.email_verified_at !== null) {
        // Verificada: só pode ser a da vítima (ela provou código + senha dela).
        assert.equal((await login(o.email, o.victimPassword)).status, 200, `${o.email}: verificada com a senha da vítima`);
        assert.equal((await login(o.email, o.attackerPassword)).status, 401, `${o.email}: a senha do invasor não entra`);
      } else {
        // Pendente: se o invasor venceu a corrida, a vítima NÃO pode ter verificado.
        assert.notEqual(o.late, 200, `${o.email}: a vítima verificou uma conta que não era dela`);
      }
      if (o.attack === 201) assert.notEqual(o.late, 200, `${o.email}: depois da sobrescrita, código + senha da vítima não verificam`);
    }
  });
});

describe('I-4: contas nunca verificadas somem da retenção após 7 dias', () => {
  test('apaga só a conta ATIVA, NUNCA verificada e parada há mais de 7 dias — com credencial e códigos', async () => {
    const stale = await register(uniqueEmail('velha'));
    const fresh = await register(uniqueEmail('nova'));
    const resent = await register(uniqueEmail('reenviou'));
    const verified = await registerAndLogin(uniqueEmail('verificada'));
    const blocked = await register(uniqueEmail('bloq'));

    const aged = (accountId: string) =>
      pool.query(`UPDATE account_email_codes SET created_at = created_at - interval '8 days', expires_at = expires_at - interval '8 days' WHERE account_id = $1`, [accountId]);
    const olderThanSevenDays = (accountId: string) => pool.query(`UPDATE accounts SET created_at = created_at - interval '30 days' WHERE id = $1`, [accountId]);
    // A conta verificada também tem o código velho: o que a protege da purga é SÓ o e-mail verificado.
    for (const account of [stale.account, blocked.account, verified.account]) await aged(account.id);
    for (const account of [stale.account, resent.account, blocked.account, verified.account]) await olderThanSevenDays(account.id);
    await pool.query(`UPDATE accounts SET status = 'blocked' WHERE id = $1`, [blocked.account.id]);
    // "reenviou": a conta nasceu há 30 dias, mas o código dela é de hoje (pediu reenvio) — então não está parada.

    const report = await runIdentityRetention(pool, DEFAULT_RETENTION);
    assert.equal(report.unverifiedAccounts, 1);

    const left = (await pool.query<{ id: string }>('SELECT id FROM accounts')).rows.map((r) => r.id).sort();
    assert.deepEqual(left, [fresh.account.id, resent.account.id, verified.account.id, blocked.account.id].sort());
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_credentials WHERE account_id = $1', [stale.account.id])).rows[0].n, 0, 'a cascata levou a credencial');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_email_codes WHERE account_id = $1', [stale.account.id])).rows[0].n, 0, 'e os códigos');
    assert.equal((await login(verified.email, PASSWORD)).status, 200, 'a conta verificada segue entrando');
  });
});

// ------------------------------------------------------------------ I-5

describe('I-5c: e-mail canonical só para limite', () => {
  test('canonicalEmailForLimit junta +tag e pontos do Gmail, e só neles', () => {
    assert.equal(canonicalEmailForLimit('Vitima+1@Gmail.com'), 'vitima@gmail.com');
    assert.equal(canonicalEmailForLimit('v.i.t.i.m.a+spam@googlemail.com'), 'vitima@gmail.com');
    assert.equal(canonicalEmailForLimit('vitima@gmail.com'), 'vitima@gmail.com');
    assert.equal(canonicalEmailForLimit('a.b+c@outro.com.br'), 'a.b@outro.com.br', 'fora do Gmail os pontos contam; o +tag não');
    assert.equal(canonicalEmailForLimit('+x@gmail.com'), '+x@gmail.com', 'sem usuário antes do +: fica como veio');
    assert.equal(canonicalEmailForLimit('sem-arroba'), 'sem-arroba');
  });

  test('cadastro: 5 "endereços diferentes" da MESMA caixa esgotam o teto por e-mail; o 6º é 429', async () => {
    const box = `alvo${randomTag()}`;
    const variants = [`${box}@gmail.com`, `${box.slice(0, 3)}.${box.slice(3)}@gmail.com`, `${box}+a@gmail.com`, `${box.slice(0, 2)}.${box.slice(2)}+b@googlemail.com`, `${box}+c@GMAIL.com`];
    for (const email of variants) assert.equal((await signUp(email)).status, 201, email);
    const sixth = await signUp(`${box}+d@gmail.com`);
    assert.equal(sixth.status, 429, 'sem o e-mail canonical, cada variante teria a sua própria cota');
    assert.equal(sixth.body.error.code, 'too_many_attempts');
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM accounts WHERE email LIKE '%${box.slice(0, 2)}%' OR email LIKE '%${box}%'`)).rows[0].n >= 5, true);
  });

  test('"esqueci a senha": as variantes de uma mesma caixa dividem o teto de pedidos', async () => {
    const box = `caixa${randomTag()}`;
    const statuses: number[] = [];
    for (const tag of ['', '+1', '+2', '+3', '+4', '+5']) statuses.push((await forgot(`${box}${tag}@gmail.com`)).status);
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
  });
});

describe('I-5d: limite por /64 no IPv6', () => {
  test('ipBucket: IPv6 = o /64; IPv4 e IPv4 mapeado = o endereço; lixo volta como veio', () => {
    assert.equal(ipBucket('2001:db8:abcd:12:aaaa:bbbb:cccc:dddd'), '2001:0db8:abcd:0012::/64');
    assert.equal(ipBucket('2001:db8:abcd:12::1'), '2001:0db8:abcd:0012::/64');
    assert.equal(ipBucket('2001:DB8:ABCD:12:0:0:0:ffff'), '2001:0db8:abcd:0012::/64');
    assert.equal(ipBucket('2001:db8:abcd:13::1'), '2001:0db8:abcd:0013::/64', 'outro /64 é outro balde');
    assert.equal(ipBucket('::1'), '0000:0000:0000:0000::/64');
    assert.equal(ipBucket('fe80::1%eth0'), 'fe80:0000:0000:0000::/64');
    assert.equal(ipBucket('203.0.113.7'), '203.0.113.7');
    assert.equal(ipBucket('::ffff:203.0.113.7'), '203.0.113.7');
    assert.equal(ipBucket('::ffff:cb00:7107'), '203.0.113.7');
    assert.equal(ipBucket('64:ff9b::192.0.2.1'), '0064:ff9b:0000:0000::/64');
    assert.equal(ipBucket('nao-e-ip'), 'nao-e-ip');
    assert.equal(ipBucket('1:2:3:4:5:6:7:8:9'), '1:2:3:4:5:6:7:8:9');
  });

  test('teto de cadastros por IP: o atacante que gira os últimos 64 bits cai no MESMO balde', async () => {
    await withApp({ AUTH_REGISTER_MAX_PER_IP: '3' }, async (_harness, client) => {
      const register = (ip: string) => client.call('POST', '/v1/auth/register', { ip, body: { accountType: 'passenger', fullName: 'Pessoa', email: uniqueEmail('v6'), password: PASSWORD, ...REGISTER_EXTRAS } });
      const sameBlock = ['2001:db8:aaaa:1::1', '2001:db8:aaaa:1:1234:5678:9abc:def0', '2001:db8:aaaa:1:ffff::2', '2001:db8:aaaa:1::3'];
      assert.deepEqual((await Promise.all(sameBlock.slice(0, 3).map(register))).map((r) => r.status), [201, 201, 201]);
      assert.equal((await register(sameBlock[3]!)).status, 429, '4º endereço do mesmo /64');
      assert.equal((await register('2001:db8:aaaa:2::1')).status, 201, 'outro /64 tem a própria cota');
      assert.equal((await register('203.0.113.9')).status, 201, 'IPv4 segue por endereço');
    });
  });

  test('o limite por IP do @fastify/rate-limit também usa o /64 (rota com limite próprio)', async () => {
    await withApp({ AUTH_IP_RATE_LIMIT_MAX: '3' }, async (_harness, client) => {
      const refresh = (ip: string) => client.call('POST', '/v1/auth/refresh', { ip, body: { refreshToken: 'x'.repeat(40) } });
      const statuses: number[] = [];
      for (const ip of ['2001:db8:bbbb:1::1', '2001:db8:bbbb:1::2', '2001:db8:bbbb:1:5::3', '2001:db8:bbbb:1:6::4', '2001:db8:bbbb:1:7::5']) statuses.push((await refresh(ip)).status);
      assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
      assert.equal((await refresh('2001:db8:bbbb:2::1')).status, 401, 'outro /64');
    });
  });
});

describe('I-5a: teto global de e-mails por hora', () => {
  test('cadastro/reenvio (verificação) e redefinição têm baldes separados; esgotado um, TODOS recebem 429 sem pista de conta', async () => {
    await withApp({ AUTH_EMAIL_GLOBAL_MAX_PER_HOUR: '4' }, async (harness, client) => {
      const signup = (email: string) => client.call('POST', '/v1/auth/register', { body: { accountType: 'passenger', fullName: 'Pessoa', email, password: PASSWORD, ...REGISTER_EXTRAS } });
      const existing = await client.registerAndLogin(uniqueEmail('existente')); // 1 de 4 do balde "verificação"
      for (let i = 0; i < 3; i += 1) assert.equal((await signup(uniqueEmail('lote'))).status, 201); // 4 de 4
      const blocked = await signup(uniqueEmail('estourou'));
      assert.equal(blocked.status, 429);
      assert.ok(blocked.headers['retry-after']);
      assert.equal(blocked.body.error.code, 'too_many_attempts');
      const resend = await client.call('POST', '/v1/auth/resend-verification', { body: { accountType: 'passenger', identifier: uniqueEmail('qualquer') } });
      assert.equal(resend.status, 429, 'o reenvio divide o mesmo balde, exista a conta ou não');

      // O balde de redefinição é outro: a conta verdadeira ainda recupera a senha.
      harness.mailbox.sent.length = 0;
      const okForgot = await client.call('POST', '/v1/auth/forgot-password', { body: { accountType: 'passenger', email: existing.email } });
      assert.equal(okForgot.status, 200);
      await drainBackgroundTasks();
      assert.equal(harness.mailbox.to(existing.email).length, 1);
      for (let i = 0; i < 3; i += 1) assert.equal((await client.call('POST', '/v1/auth/forgot-password', { body: { accountType: 'passenger', email: uniqueEmail('fantasma') } })).status, 200);
      const exhaustedKnown = await client.call('POST', '/v1/auth/forgot-password', { body: { accountType: 'passenger', email: existing.email } });
      const exhaustedUnknown = await client.call('POST', '/v1/auth/forgot-password', { body: { accountType: 'passenger', email: uniqueEmail('fantasma') } });
      assert.deepEqual([exhaustedKnown.status, exhaustedUnknown.status], [429, 429]);
      assert.deepEqual(exhaustedKnown.body, exhaustedUnknown.body, 'a resposta não distingue conta existente de inexistente');
    });
  });
});

describe('I-5e: saudação do e-mail sanitizada', () => {
  test('greetingFor: só primeiro nome curto de letras (com hífen/apóstrofo); o resto vira "Olá!"', () => {
    assert.equal(greetingFor('Maria Souza'), 'Olá, Maria!');
    assert.equal(greetingFor("  D'Ávila Neto "), "Olá, D'Ávila!");
    assert.equal(greetingFor('Ana-Clara'), 'Olá, Ana-Clara!');
    assert.equal(greetingFor('João'), 'Olá, João!');
    for (const bad of [
      'https://phishing.exemplo/x!', 'http://x.co', 'www.golpe.com', 'golpe.com', 'user@golpe.com', 'x/y', 'Ana<script>', '1234', 'Ana2',
      'A'.repeat(31), '', '   ', '-Ana', 'Ana-', '‮Ana', 'Ana\u0000',
    ]) {
      assert.equal(greetingFor(bad), 'Olá!', JSON.stringify(bad));
    }
    assert.equal(greetingFor('A'.repeat(30)), `Olá, ${'A'.repeat(30)}!`, '30 letras é o teto');
  });

  test('o e-mail de verificação enviado não carrega URL do nome digitado', async () => {
    await signUp(uniqueEmail('golpe'), { fullName: 'https://phishing.exemplo/login?x=1 Maria' });
    const text = h.mailbox.sent.at(-1)!.text;
    assert.ok(text.startsWith('Olá!\n'), text.slice(0, 40));
    assert.ok(!/phishing|http|\.exemplo/i.test(text));
    const normal = uniqueEmail('normal');
    await signUp(normal, { fullName: 'Maria Souza' });
    assert.ok(h.mailbox.to(normal)[0]!.text.startsWith('Olá, Maria!\n'));
  });

  test('buildCodeMail usa a mesma saudação nas duas finalidades', () => {
    const base = { to: 'a@b.com', fullName: 'http://x.co', code: '123456', ttlSeconds: 900 };
    for (const purpose of ['verify_email', 'password_reset'] as const) assert.ok(buildCodeMail({ ...base, purpose }).text.startsWith('Olá!\n'));
  });
});

// ------------------------------------------------------------------ I-7

describe('I-7: teto cumulativo de falhas do código de redefinição', () => {
  /** Peça um código de redefinição e erre `guesses` vezes. Devolve o desfecho do último palpite. */
  async function failOnce(email: string, accountId: string, guesses: number) {
    await ageCodes(accountId);
    assert.equal((await forgot(email)).status, 200);
    await drainBackgroundTasks();
    const real = h.mailbox.lastCode(email);
    let last = { status: 0, body: null as any };
    for (let i = 0; i < guesses; i += 1) last = await reset(email, wrong(real));
    return { real, last };
  }

  test('10 falhas em 24 h (somando códigos): nem o código certo vale, nenhum e-mail novo sai, e a janela rola', async () => {
    const session = await registerAndLogin();
    const first = await failOnce(session.email, session.account.id, 5); // 5 falhas, código 1 morre
    assert.equal(first.last.body.error.code, 'code_locked');
    const second = await failOnce(session.email, session.account.id, 4); // 9 falhas, código 2 ainda vivo
    assert.equal(second.last.body.error.code, 'invalid_code');

    // O 10º palpite errado fecha o teto do dia.
    const tenth = await reset(session.email, wrong(second.real));
    assert.equal(tenth.status, 429);
    h.mailbox.sent.length = 0;

    // Pedir outro código: a resposta é a mesma de sempre, mas NENHUM e-mail sai (não se manda código que não vale).
    await ageCodes(session.account.id);
    assert.equal((await forgot(session.email)).status, 200);
    await drainBackgroundTasks();
    assert.equal(h.mailbox.to(session.email).length, 0, 'sem e-mail com código inútil');

    // Um código vivo com hash conhecido (o atacante teria acertado): mesmo assim, recusado, e a senha não muda.
    await pool.query(
      `INSERT INTO account_email_codes (account_id, purpose, code_hash, expires_at) VALUES ($1, 'password_reset', $2, now() + interval '10 minutes')`,
      [session.account.id, hashEmailCode(PEPPER, 'password_reset', session.account.id, '123456')],
    );
    const locked = await reset(session.email, '123456');
    assert.equal(locked.status, 429, JSON.stringify(locked.body));
    assert.equal(locked.body.error.code, 'reset_locked');
    assert.ok(locked.headers['retry-after']);
    assert.equal((await login(session.email, PASSWORD)).status, 200, 'a senha antiga segue valendo');
    assert.equal((await login(session.email, 'Nova-senha-9876')).status, 401);

    // A janela de 24 h rola: as falhas antigas saem e a redefinição volta a funcionar.
    await pool.query(
      `UPDATE account_email_codes SET created_at = created_at - interval '25 hours', expires_at = expires_at - interval '25 hours' WHERE account_id = $1 AND attempts > 0`,
      [session.account.id],
    );
    const ok = await reset(session.email, '123456');
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((await login(session.email, 'Nova-senha-9876')).status, 200);
  });

  test('o teto vale só para a redefinição: erros na VERIFICAÇÃO do e-mail não o consomem', async () => {
    const created = await register();
    for (let i = 0; i < 4; i += 1) await verify(created.email, wrong(created.code));
    const session = await registerAndLogin();
    const first = await failOnce(session.email, session.account.id, 5);
    assert.equal(first.last.status, 429);
    assert.equal((await pool.query(`SELECT reset_failures_last_day($1) AS n`, [session.account.id])).rows[0].n, 5);
    assert.equal((await pool.query(`SELECT reset_failures_last_day($1) AS n`, [created.account.id])).rows[0].n, 0, 'verify_email não conta');
  });

  test('CONCORRÊNCIA: 6 palpites errados simultâneos com 9 falhas no dia deixam o total em 10, não em 15', async () => {
    const session = await registerAndLogin();
    // 9 falhas já confirmadas (dois códigos fechados por excesso de tentativas, 5 + 4).
    await pool.query(
      `INSERT INTO account_email_codes (account_id, purpose, code_hash, attempts, closed_at, close_reason, expires_at)
       VALUES ($1, 'password_reset', repeat('a', 64), 5, now(), 'too_many_attempts', now() + interval '10 minutes'),
              ($1, 'password_reset', repeat('b', 64), 4, now(), 'superseded', now() + interval '10 minutes')`,
      [session.account.id],
    );
    await ageCodes(session.account.id);
    assert.equal((await forgot(session.email)).status, 200);
    await drainBackgroundTasks();
    const real = h.mailbox.lastCode(session.email);

    const replies = await Promise.all(Array.from({ length: 6 }, () => reset(session.email, wrong(real))));
    const statuses = replies.map((r) => r.body.error.code).sort();
    assert.deepEqual(statuses, ['invalid_code', 'reset_locked', 'reset_locked', 'reset_locked', 'reset_locked', 'reset_locked']);
    assert.equal((await pool.query(`SELECT reset_failures_last_day($1) AS n`, [session.account.id])).rows[0].n, 10);
  });

  test('AUTH_RESET_MAX_FAILURES_PER_DAY ajusta o teto', async () => {
    await withApp({ AUTH_RESET_MAX_FAILURES_PER_DAY: '2' }, async (harness, client) => {
      const session = await client.registerAndLogin();
      await ageCodes(session.account.id);
      await client.call('POST', '/v1/auth/forgot-password', { body: { accountType: 'passenger', email: session.email } });
      await drainBackgroundTasks();
      const real = harness.mailbox.lastCode(session.email);
      const bad = (code: string) => client.call('POST', '/v1/auth/reset-password', { body: { accountType: 'passenger', email: session.email, code, newPassword: 'Nova-senha-9876' } });
      assert.equal((await bad(wrong(real))).body.error.code, 'invalid_code');
      assert.equal((await bad(wrong(real))).body.error.code, 'invalid_code');
      assert.equal((await bad(real)).body.error.code, 'reset_locked', 'com 2 falhas o teto de 2 fechou: o certo também é recusado');
    });
  });
});

describe('I-7: aviso "senha alterada"', () => {
  test('redefinição bem-sucedida avisa o titular (sem código, senha nem link); falha não avisa', async () => {
    const session = await registerAndLogin();
    await ageCodes(session.account.id);
    await forgot(session.email);
    await drainBackgroundTasks();
    const code = h.mailbox.lastCode(session.email);
    const before = h.mailbox.to(session.email).length;

    assert.equal((await reset(session.email, wrong(code))).status, 400);
    await drainBackgroundTasks();
    assert.equal(h.mailbox.to(session.email).length, before, 'código errado não gera aviso');

    assert.equal((await reset(session.email, code, 'Senha-nova-secreta-77')).status, 200);
    await drainBackgroundTasks();
    const notices = h.mailbox.to(session.email).slice(before);
    assert.equal(notices.length, 1);
    const notice = notices[0]!;
    assert.equal(notice.subject, 'Sua senha do VuumBora foi alterada');
    assert.ok(notice.text.startsWith('Olá, Pessoa!'));
    assert.ok(!/\b\d{6}\b/.test(notice.text) && !notice.text.includes('Senha-nova-secreta-77') && !/https?:/.test(notice.text));
    assert.match(notice.text, /Se NÃO foi você/);
  });

  test('conta inexistente não recebe nada; falha do e-mail de aviso não desfaz a troca e não vaza o destinatário no log', async () => {
    const ghost = uniqueEmail('fantasma');
    assert.equal((await reset(ghost, '123456')).status, 400);
    await drainBackgroundTasks();
    assert.equal(h.mailbox.to(ghost).length, 0);

    const session = await registerAndLogin();
    await ageCodes(session.account.id);
    await forgot(session.email);
    await drainBackgroundTasks();
    const code = h.mailbox.lastCode(session.email);
    h.mailbox.failing = true; // só o aviso falha (o código já foi enviado)
    const done = await reset(session.email, code, 'Senha-nova-secreta-88');
    assert.equal(done.status, 200, 'a troca vale mesmo sem o aviso');
    await drainBackgroundTasks();
    assert.equal((await login(session.email, 'Senha-nova-secreta-88')).status, 200);
    assert.ok(h.t.logs().includes('auth_mail_send_failed') && h.t.logs().includes('password_changed_notice'));
    assert.ok(!h.t.logs().includes(session.email));
  });

  test('buildPasswordChangedMail: só o fato e o que fazer', () => {
    const mail = buildPasswordChangedMail({ to: 'a@b.com', fullName: 'Ana Souza' });
    assert.equal(mail.to, 'a@b.com');
    assert.ok(mail.text.startsWith('Olá, Ana!'));
  });
});
