/**
 * Idade mínima (18 anos) e aceite dos Termos de Uso / Política de Privacidade no cadastro (decisões do dono,
 * 21/11/2026; migração 0019). Regra pura + HTTP + banco.
 */
import './helpers/auth-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { after, before, beforeEach, describe, test } from 'node:test';
import { checkBirthDate, latestAdultBirthDate, todayInBusinessZone } from '../src/domain/birth-date.js';
import { loadAuthConfig } from '../src/lib/auth-config.js';
import { loadLegalConfig } from '../src/lib/legal-config.js';
import { hmacHex } from '../src/lib/token-crypto.js';
import { BirthDateRejectedError, insertOrReclaimAccount } from '../src/repositories/identity-repository.js';
import { registerAccount } from '../src/services/identity-service.js';
import { pool, prepareDatabase, shutdown } from './helpers/harness.js';
import { makeClient, PASSWORD, PEPPER, REGISTER_EXTRAS, startIdentityApp, uniqueEmail, type Harness } from './helpers/identity-kit.js';
import { BASELINE_VERSION, sha256For } from './helpers/legal-kit.js';

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
});

const BIRTH = REGISTER_EXTRAS.birthDate;
const signUp = (body: Record<string, unknown>, ip?: string) =>
  api.call('POST', '/v1/auth/register', {
    ...(ip ? { ip } : {}),
    body: { accountType: 'passenger', fullName: 'Pessoa', email: uniqueEmail('idade'), password: PASSWORD, ...REGISTER_EXTRAS, ...body },
  });
/** Soma/subtrai dias de uma data ISO sem passar por fuso. */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}
const birthOf = async (email: string) => (await pool.query<{ b: string | null }>('SELECT birth_date::text AS b FROM accounts WHERE email = $1', [email])).rows[0]?.b ?? null;

describe('regra de idade (pura): 18 anos completos, no fuso de Natal', () => {
  test('o "hoje" é o de Natal (UTC-3), não o do servidor', () => {
    assert.equal(todayInBusinessZone(new Date('2026-11-22T01:00:00Z')), '2026-11-21', '22h em Natal ainda é dia 21');
    assert.equal(todayInBusinessZone(new Date('2026-11-22T03:00:00Z')), '2026-11-22', '00h em Natal já é dia 22');
  });

  test('o corte é hoje menos 18 anos; quem nasceu em 29/02 completa 18 em 01/03 nos anos não bissextos', () => {
    assert.equal(latestAdultBirthDate('2026-11-21'), '2008-11-21');
    assert.equal(latestAdultBirthDate('2022-03-01'), '2004-03-01');
    assert.equal(latestAdultBirthDate('2022-02-28'), '2004-02-28');
    assert.equal(latestAdultBirthDate('2024-02-29'), '2006-02-28', 'hoje é 29/02 e o ano de 18 anos atrás não é bissexto: recua para 28/02');
    assert.equal(latestAdultBirthDate('2028-02-29'), '2010-02-28');
    assert.equal(latestAdultBirthDate('2040-02-29'), '2022-02-28');

    const at = (isoUtc: string) => new Date(`${isoUtc}T15:00:00Z`);
    // Nascida em 29/02/2004: em 28/02/2022 ainda tem 17; em 01/03/2022 tem 18.
    assert.deepEqual(checkBirthDate('2004-02-29', at('2022-02-28')), { ok: false, reason: 'underage' });
    assert.deepEqual(checkBirthDate('2004-02-29', at('2022-03-01')), { ok: true });
    // Aniversário comum: o dia do 18º aniversário já vale.
    assert.deepEqual(checkBirthDate('2008-11-21', at('2026-11-21')), { ok: true });
    assert.deepEqual(checkBirthDate('2008-11-22', at('2026-11-21')), { ok: false, reason: 'underage' });
  });

  test('datas inválidas: formato, calendário impossível, futura e anterior a 1900', () => {
    const now = new Date('2026-11-21T15:00:00Z');
    for (const bad of ['', '1990-5-15', '15/05/1990', '1990-05-15T00:00:00Z', '19900515', '1990-13-01', '1990-00-10', '1990-02-30', '2001-02-29', '1990-04-31', '1899-12-31', '2026-11-22', '9999-01-01', 'abcd-ef-gh', ' 1990-05-15']) {
      assert.deepEqual(checkBirthDate(bad, now), { ok: false, reason: 'invalid' }, JSON.stringify(bad));
    }
    assert.deepEqual(checkBirthDate('2000-02-29', now), { ok: true }, '29/02 de ano bissexto existe');
    assert.deepEqual(checkBirthDate('1900-01-01', now), { ok: true });
  });
});

describe('cadastro: data de nascimento', () => {
  test('ausente ou mal formada: 400 invalid_birth_date (nada é criado)', async () => {
    for (const body of [{ birthDate: undefined }, { birthDate: '' }, { birthDate: '15/05/1990' }, { birthDate: '1990-02-30' }, { birthDate: 19900515 }, { birthDate: '1990-05-15T00:00' }]) {
      const reply = await signUp(body);
      assert.equal(reply.status, 400, JSON.stringify(body));
      assert.equal(reply.body.error.code, 'invalid_birth_date');
    }
    const future = await signUp({ birthDate: addDays(todayInBusinessZone(), 1) });
    assert.equal(future.status, 400);
    assert.equal(future.body.error.code, 'invalid_birth_date');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n, 0);
  });

  test('menor de 18: 403 underage; no dia do 18º aniversário passa (e um dia antes, não)', async () => {
    const cutoff = latestAdultBirthDate(todayInBusinessZone());
    const minor = await signUp({ birthDate: addDays(cutoff, 1) });
    assert.equal(minor.status, 403);
    assert.equal(minor.body.error.code, 'underage');
    assert.equal(minor.body.error.message, 'É preciso ter 18 anos ou mais para criar uma conta.');
    assert.equal((await signUp({ birthDate: cutoff })).status, 201, 'hoje faz 18 anos: vale');
    assert.equal((await signUp({ birthDate: '2015-06-01', accountType: 'driver' })).status, 403, 'vale também para motorista');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n, 1);
  });

  test('a data é gravada como veio (sem deslocar o dia por fuso) e NUNCA é devolvida nem logada', async () => {
    const email = uniqueEmail('privada');
    const reply = await signUp({ email, birthDate: '1987-03-09' });
    assert.equal(reply.status, 201, JSON.stringify(reply.body));
    assert.equal(await birthOf(email), '1987-03-09');
    assert.ok(!JSON.stringify(reply.body).includes('1987'), 'a resposta não carrega a data');
    // Rejeições também não ecoam a data.
    const refused = await signUp({ birthDate: '2015-06-01' });
    assert.ok(!JSON.stringify(refused.body).includes('2015'));
    const logs = h.t.logs();
    assert.ok(!logs.includes('1987-03-09') && !logs.includes('2015-06-01'), 'nenhuma data de nascimento no log');
    assert.ok(logs.includes('"reason":"underage"'), 'só o motivo é logado (decidido pela regra do servidor, não pela rede do banco)');
  });
});

describe('cadastro: aceite dos Termos de Uso e da Política de Privacidade', () => {
  test('sem o aceite (ausente, false ou texto): 400 consent_required e nada é criado', async () => {
    for (const body of [{ termsAccepted: undefined }, { privacyAccepted: undefined }, { termsAccepted: false }, { privacyAccepted: false }, { termsAccepted: 'true' }, { privacyAccepted: 1 }]) {
      const reply = await signUp(body);
      assert.equal(reply.status, 400, JSON.stringify(body));
      assert.equal(reply.body.error.code, 'consent_required');
    }
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_consents')).rows[0].n, 0);
  });

  test('o aceite é gravado na criação: dois documentos, a versão exibida, HMAC do IP (nunca o IP) e relógio do banco', async () => {
    const email = uniqueEmail('aceite');
    const ip = '203.0.113.50';
    const reply = await signUp({ email }, ip);
    assert.equal(reply.status, 201);
    const rows = (await pool.query(`SELECT c.document, c.version, c.audience, c.text_sha256, c.ip_hash, c.accepted_at > now() - interval '1 minute' AS recent
                                      FROM account_consents c JOIN accounts a ON a.id = c.account_id WHERE a.email = $1 ORDER BY c.document`, [email])).rows;
    assert.deepEqual(rows.map((r) => [r.document, r.version]), [['privacy_policy', BASELINE_VERSION], ['terms_of_use', BASELINE_VERSION]]);
    for (const row of rows) {
      assert.equal(row.audience, 'passenger', 'o perfil é o da conta (gravado pelo banco)');
      assert.equal(row.text_sha256, sha256For(row.document, 'passenger', BASELINE_VERSION), 'o hash é o do catálogo (gravado pelo banco)');
      assert.equal(row.ip_hash, hmacHex(PEPPER, ip), 'HMAC com pepper do IP');
      assert.equal(row.recent, true);
    }
    const dump = JSON.stringify((await pool.query('SELECT * FROM account_consents')).rows);
    assert.ok(!dump.includes(ip), 'o IP em claro nunca entra na tabela');
  });

  test('perfil, hash do texto e data são do BANCO: campos a mais no corpo do cadastro são descartados', async () => {
    const email = uniqueEmail('versao');
    const reply = await signUp({ email, audience: 'driver', textSha256: 'a'.repeat(64), text_sha256: 'a'.repeat(64), version: 'x', acceptedAt: '2001-01-01T00:00:00Z' });
    assert.equal(reply.status, 201, JSON.stringify(reply.body));
    const rows = (await pool.query(`SELECT c.version, c.audience, c.text_sha256, c.accepted_at > now() - interval '1 minute' AS recent
                                      FROM account_consents c JOIN accounts a ON a.id = c.account_id WHERE a.email = $1 ORDER BY c.document`, [email])).rows;
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.version, BASELINE_VERSION);
      assert.equal(row.audience, 'passenger');
      assert.notEqual(row.text_sha256, 'a'.repeat(64));
      assert.equal(row.recent, true);
    }
  });

  test('o aceite entra na MESMA transação da conta: se ele falha, a conta não nasce', async () => {
    const config = loadAuthConfig()!;
    const legal = loadLegalConfig();
    const email = uniqueEmail('atomica');
    const failingPool = {
      query: pool.query.bind(pool),
      connect: async () => {
        const client = await pool.connect();
        const patchable = client as unknown as { query: unknown; release: (err?: unknown) => void };
        const originalQuery = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>;
        const originalRelease = client.release.bind(client);
        patchable.query = (text: unknown, ...rest: unknown[]) =>
          typeof text === 'string' && text.includes('account_consents') ? Promise.reject(new Error('falha simulada no aceite')) : originalQuery(text, ...rest);
        // O pool reaproveita o MESMO objeto de conexão: devolve-o limpo, senão a falha simulada vaza para os testes seguintes.
        patchable.release = (err?: unknown) => {
          patchable.query = (text: unknown, ...rest: unknown[]) => originalQuery(text, ...rest);
          originalRelease(err as Error | undefined);
        };
        return client;
      },
    } as unknown as Pool;
    await assert.rejects(
      registerAccount(
        failingPool, config, legal, { mail: h.mailbox, onMailFailure: () => undefined },
        { accountType: 'passenger', fullName: 'Pessoa', email, password: PASSWORD, phone: null, birthDate: BIRTH, termsVersion: BASELINE_VERSION, privacyVersion: BASELINE_VERSION },
        { ipHash: null, userAgentFamily: 'x', requestId: 'r' },
      ),
      /falha simulada no aceite/,
    );
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts WHERE email = $1', [email])).rows[0].n, 0, 'ROLLBACK levou a conta junto');
    assert.equal(h.mailbox.sent.length, 0, 'nenhum e-mail de verificação saiu');
  });

  test('sem a URL base dos textos (ausente ou inaceitável): cadastro indisponível (503 consent_unavailable), login e o resto seguem', async () => {
    for (const bad of ['', 'ftp://textos.dev/legal', 'https://usuario:senha-secreta@textos.dev/legal', 'https://textos.dev/legal?x=1', 'não é url']) {
      const saved = process.env['LEGAL_DOCUMENTS_BASE_URL'];
      process.env['LEGAL_DOCUMENTS_BASE_URL'] = bad;
      const harness = await startIdentityApp();
      try {
        const client = makeClient(harness);
        const reply = await client.call('POST', '/v1/auth/register', { body: { accountType: 'passenger', fullName: 'Pessoa', email: uniqueEmail('sem-versao'), password: PASSWORD, ...REGISTER_EXTRAS } });
        assert.equal(reply.status, 503, JSON.stringify(bad));
        assert.equal(reply.body.error.code, 'consent_unavailable');
        assert.equal((await client.call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: 'x@y.com', password: PASSWORD } })).status, 401, 'o login não depende dos documentos legais');
        assert.ok(harness.t.logs().includes('LEGAL_DOCUMENTS_BASE_URL'), 'o boot avisa QUAL variável é o problema');
        assert.ok(!harness.t.logs().includes('senha-secreta'), 'e nunca o valor');
      } finally {
        await harness.t.app.close();
        process.env['LEGAL_DOCUMENTS_BASE_URL'] = saved;
      }
    }
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n, 0);
  });

  test('recadastro sobre conta NÃO verificada (I-4): o aceite FINAL é o do último cadastro (data e HMAC de IP), o do primeiro some', async () => {
    const email = uniqueEmail('recadastro');
    const first = await signUp({ email, birthDate: '1980-01-01' }, '203.0.113.31');
    assert.equal(first.status, 201);
    const firstAt = (await pool.query(`SELECT max(accepted_at) AS at FROM account_consents`)).rows[0].at as Date;
    const second = await signUp({ email, birthDate: '1985-03-03' }, '203.0.113.32');
    assert.equal(second.status, 201);
    assert.equal(await birthOf(email), '1985-03-03', 'a data é a do último cadastro');

    const consents = (await pool.query(`SELECT account_id, document, version, ip_hash, accepted_at FROM account_consents ORDER BY document`)).rows;
    assert.equal(consents.length, 2, 'dois documentos, nada duplicado nem sobrando da conta antiga');
    for (const consent of consents) {
      assert.equal(consent.account_id, second.body.data.account.id);
      assert.notEqual(consent.account_id, first.body.data.account.id);
      assert.equal(consent.ip_hash, hmacHex(PEPPER, '203.0.113.32'), 'IP do ÚLTIMO cadastro');
      assert.equal(consent.version, BASELINE_VERSION);
      assert.ok(consent.accepted_at > firstAt, 'data do ÚLTIMO cadastro');
    }
  });

  test('a API continua sem UPDATE/DELETE em account_consents: a substituição passa SÓ pela função da 0020 (cascata)', async () => {
    const accountOf = async (address: string) => (await pool.query('SELECT id FROM accounts WHERE email = $1', [address])).rows;
    const email = uniqueEmail('cascata');
    const created = await signUp({ email });
    assert.equal(created.status, 201);
    // Nem o gatilho do banco deixa apagar o aceite diretamente (só em cascata da exclusão da conta).
    await assert.rejects(pool.query('DELETE FROM account_consents WHERE account_id = $1', [created.body.data.account.id]), (err: { code?: string }) => err.code === '42501');
    await assert.rejects(pool.query(`UPDATE account_consents SET accepted_at = now() - interval '1 year' WHERE account_id = $1`, [created.body.data.account.id]), (err: { code?: string }) => err.code === '42501');
    // A função só apaga conta ativa e NUNCA verificada, do (tipo, e-mail) exato.
    const fn = (type: string, address: string) => pool.query<{ ok: boolean }>('SELECT reclaim_unverified_account($1, $2) AS ok', [type, address]).then((r) => r.rows[0]!.ok);
    assert.equal(await fn('driver', email), false, 'outro tipo de conta: não existe');
    assert.equal(await fn('passenger', 'outro@teste.vuumbora.dev'), false);
    assert.equal((await accountOf(email)).length, 1);
    assert.equal(await fn('passenger', email), true);
    assert.equal((await accountOf(email)).length, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_consents')).rows[0].n, 0, 'o aceite caiu em cascata');
    // Conta verificada: intocável.
    const verified = await api.registerAndLogin();
    assert.equal(await fn('passenger', verified.email), false);
    assert.equal((await accountOf(verified.email)).length, 1);
    await pool.query(`UPDATE accounts SET status = 'blocked' WHERE id = $1`, [verified.account.id]);
    assert.equal(await fn('passenger', verified.email), false);
  });

  test('conta nunca verificada some da retenção JUNTO com o aceite (cascata)', async () => {
    const email = uniqueEmail('purga');
    assert.equal((await signUp({ email })).status, 201);
    await pool.query(`UPDATE account_email_codes SET created_at = created_at - interval '8 days', expires_at = expires_at - interval '8 days'`);
    await pool.query(`UPDATE accounts SET created_at = created_at - interval '30 days' WHERE email = $1`, [email]);
    const { runIdentityRetention, DEFAULT_RETENTION } = await import('../src/lib/identity-retention.js');
    assert.equal((await runIdentityRetention(pool, DEFAULT_RETENTION)).unverifiedAccounts, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_consents')).rows[0].n, 0);
  });
});

describe('rede de segurança do banco (gatilho da 0019) mapeada para erro de domínio', () => {
  const direct = (birthDate: string) =>
    insertOrReclaimAccount(pool, { accountType: 'passenger', email: uniqueEmail('rede'), fullName: 'Pessoa', phone: null, passwordHash: '$2b$04$' + 'x'.repeat(53), birthDate });

  test('menor, futura, anterior a 1900 e ausente viram BirthDateRejectedError (o servidor já validou: isto é a rede)', async () => {
    const reasonOf = async (promise: Promise<unknown>) => {
      try {
        await promise;
        return 'aceitou';
      } catch (err) {
        return err instanceof BirthDateRejectedError ? err.reason : `outro erro: ${(err as Error).message}`;
      }
    };
    assert.equal(await reasonOf(direct(addDays(latestAdultBirthDate(todayInBusinessZone()), 1))), 'underage');
    assert.equal(await reasonOf(direct(addDays(todayInBusinessZone(), 5))), 'invalid');
    assert.equal(await reasonOf(direct('1899-12-31')), 'invalid');
    assert.equal(await reasonOf(direct(null as unknown as string)), 'invalid', 'sem data: 23502 do gatilho');
    assert.equal(await reasonOf(direct(latestAdultBirthDate(todayInBusinessZone()))), 'aceitou');
  });

  test('a mensagem do erro nunca carrega a data', async () => {
    await assert.rejects(direct('2015-06-01'), (err: Error) => err instanceof BirthDateRejectedError && !err.message.includes('2015'));
  });
});
