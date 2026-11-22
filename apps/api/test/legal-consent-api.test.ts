/**
 * M-3 pela HTTP, com banco e papel reais: `GET /v1/legal/current`, cadastro com a versão EXIBIDA (400 `consent_required`,
 * 409 `consent_outdated`, 503 `consent_unavailable`), `consent` em `GET /v1/auth/me`, `POST /v1/auth/consents` e o
 * preHandler `requireCurrentConsent`. O app conecta COMO `vuumbora_api` (só SELECT no catálogo): se a 0021 tirasse grant
 * demais, estes testes quebrariam. O catálogo é refeito a cada teste (helpers/legal-kit.ts).
 */
import './helpers/auth-env.js';
import './helpers/runtime-role-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { Pool } from 'pg';
import { after, before, beforeEach, describe, test } from 'node:test';
import { makeRequireAccount } from '../src/hooks/require-account.js';
import { makeRequireCurrentConsent } from '../src/hooks/require-current-consent.js';
import { loadAuthConfig } from '../src/lib/auth-config.js';
import { loadLegalConfig } from '../src/lib/legal-config.js';
import { hmacHex } from '../src/lib/token-crypto.js';
import { prepararBanco } from '../src/migrate.js';
import { registerAccount } from '../src/services/identity-service.js';
import { acceptConsents } from '../src/services/legal-service.js';
import { pool, shutdown, startApp } from './helpers/harness.js';
import { FakeMailbox, makeClient, PASSWORD, PEPPER, REGISTER_EXTRAS, startIdentityApp, type Harness } from './helpers/identity-kit.js';
import {
  BASELINE_VERSION, ensureBaseline, LEGAL_BASE_URL, publishAll, publishVersion, resetLegalCatalog, resetToBaseline, sha256For,
} from './helpers/legal-kit.js';
import { OWNER_DATABASE_URL } from './helpers/runtime-role-env.js';

// Cache do GET /v1/legal/current DESLIGADO neste arquivo (B-3, rodada 3b): quase todo teste daqui troca o catálogo e relê a vigente na
// hora, e o app é montado UMA vez. O cache em si (TTL, hit, miss, erro não guardado, perfis separados) é provado em
// `legal-current-cache.test.ts`, que usa o prazo padrão.
process.env['LEGAL_CACHE_MAX_AGE_SECONDS'] = '0';

const owner = new pg.Pool({ connectionString: OWNER_DATABASE_URL, max: 4 });
/** E-mail ALEATÓRIO: o banco persiste entre execuções e o contador do kit repetiria e-mails de contas já verificadas (409 email_taken). */
const uniqueEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@teste.vuumbora.dev`;
let h: Harness;
let api!: ReturnType<typeof makeClient>;

before(async () => {
  await prepararBanco({ databaseUrl: OWNER_DATABASE_URL, pool: owner, log: () => undefined });
  await resetToBaseline(owner);
  h = await startIdentityApp();
  api = makeClient(h);
});
after(async () => {
  await h.t.app.close();
  await ensureBaseline(owner); // devolve o catálogo conhecido aos arquivos seguintes
  await shutdown();
  await owner.end();
});
beforeEach(async () => {
  await resetToBaseline(owner);
  h.mailbox.sent.length = 0;
});

const getCurrent = (audience: string) => api.call('GET', `/v1/legal/current?audience=${audience}`);
const registerBody = (extra: Record<string, unknown> = {}, email = uniqueEmail('legal'), accountType = 'passenger') =>
  ({ accountType, fullName: 'Pessoa', email, password: PASSWORD, ...REGISTER_EXTRAS, ...extra });
const signUp = (extra: Record<string, unknown> = {}, accountType = 'passenger') => api.call('POST', '/v1/auth/register', { body: registerBody(extra, uniqueEmail('legal'), accountType) });
const accountCount = async () => (await owner.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n as number;
const attemptCount = async () => (await owner.query('SELECT count(*)::int AS n FROM login_attempts')).rows[0].n as number;
const consentRows = async (accountId: string) =>
  (await owner.query<{ document: string; version: string; audience: string; text_sha256: string; ip_hash: string | null }>(
    'SELECT document, version, audience, text_sha256, ip_hash FROM account_consents WHERE account_id = $1 ORDER BY document, version', [accountId],
  )).rows;
const sessionOf = (accountType: 'passenger' | 'driver' = 'passenger') => api.registerAndLogin(uniqueEmail('sessao'), accountType);
const me = (bearer: string) => api.call('GET', '/v1/auth/me', { bearer });

/** Pool que ANOTA cada instrução SQL (no pool e nos clientes das transações): prova o que a API NÃO chegou a executar. */
function trackingPool() {
  const statements: string[] = [];
  const queryOf = (target: { query: unknown }) => target.query as (...args: unknown[]) => Promise<unknown>;
  const tracked = {
    query: (text: unknown, ...rest: unknown[]) => {
      if (typeof text === 'string') statements.push(text);
      return queryOf(pool).call(pool, text, ...rest);
    },
    connect: async () => {
      const client = await pool.connect();
      const patchable = client as unknown as { query: unknown; release: (err?: unknown) => void };
      const originalQuery = queryOf(client).bind(client);
      const originalRelease = client.release.bind(client);
      patchable.query = (text: unknown, ...rest: unknown[]) => {
        if (typeof text === 'string') statements.push(text);
        return originalQuery(text, ...rest);
      };
      // O pool reaproveita o MESMO objeto de conexão: devolve-o limpo.
      patchable.release = (err?: unknown) => {
        patchable.query = (text: unknown, ...rest: unknown[]) => originalQuery(text, ...rest);
        originalRelease(err as Error | undefined);
      };
      return client;
    },
  } as unknown as Pool;
  return { pool: tracked, statements };
}
const wroteAnything = (statements: string[]) => statements.some((sql) => /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i.test(sql));
const accept = (bearer: string, body: unknown, ip?: string) => api.call('POST', '/v1/auth/consents', { bearer, body, ...(ip ? { ip } : {}) });

describe('GET /v1/legal/current', () => {
  test('200 sem sessão: os DOIS documentos do perfil, com versão, sha256 do catálogo, publishedAt e url; Cache-Control com o prazo configurado', async () => {
    for (const audience of ['passenger', 'driver'] as const) {
      const reply = await getCurrent(audience);
      assert.equal(reply.status, 200, JSON.stringify(reply.body));
      assert.deepEqual(Object.keys(reply.body.data).sort(), ['audience', 'privacy', 'terms']);
      assert.equal(reply.body.ok, true);
      assert.equal(reply.body.data.audience, audience);
      assert.equal(reply.body.data.terms.version, BASELINE_VERSION);
      assert.equal(reply.body.data.terms.sha256, sha256For('terms_of_use', audience, BASELINE_VERSION));
      assert.equal(reply.body.data.privacy.sha256, sha256For('privacy_policy', audience, BASELINE_VERSION));
      assert.equal(reply.body.data.terms.url, `${LEGAL_BASE_URL}/terms/${audience}/${BASELINE_VERSION}`);
      assert.equal(reply.body.data.privacy.url, `${LEGAL_BASE_URL}/privacy/${audience}/${BASELINE_VERSION}`);
      for (const key of ['terms', 'privacy']) {
        assert.deepEqual(Object.keys(reply.body.data[key]).sort(), ['publishedAt', 'sha256', 'url', 'version']);
        assert.ok(new Date(reply.body.data[key].publishedAt).getTime() <= Date.now() && new Date(reply.body.data[key].publishedAt).getTime() > Date.now() - 3_600_000);
      }
      assert.equal(reply.headers['cache-control'], 'public, max-age=0', 'o prazo vem de LEGAL_CACHE_MAX_AGE_SECONDS (0 neste arquivo)');
      assert.equal(reply.headers['set-cookie'], undefined);
    }
  });

  test('a vigente acompanha a publicação (também a editorial) e os perfis são independentes', async () => {
    await publishAll(owner, 'v2', { requiresReacceptance: false });
    await publishAll(owner, 'so-motorista', { audiences: ['driver'] });
    const passenger = (await getCurrent('passenger')).body.data;
    const driver = (await getCurrent('driver')).body.data;
    assert.equal(passenger.terms.version, 'v2');
    assert.equal(passenger.privacy.version, 'v2');
    assert.equal(driver.terms.version, 'so-motorista');
    assert.equal(driver.terms.url, `${LEGAL_BASE_URL}/terms/driver/so-motorista`);
  });

  test('audience ausente, vazio, inválido, repetido ou com outra caixa: 400 invalid_body e nada em cache', async () => {
    for (const query of ['', '?audience=', '?audience=admin', '?audience=all', '?audience=Passenger', '?audience=passenger&audience=driver', '?audience[]=passenger']) {
      const reply = await api.call('GET', `/v1/legal/current${query}`);
      assert.equal(reply.status, 400, query);
      assert.equal(reply.body.error.code, 'invalid_body');
      assert.equal(reply.headers['cache-control'], 'no-store');
    }
  });

  test('falta versão publicada de um dos dois documentos (ou de todos): 503 consent_unavailable, sem cache; ao completar, 200', async () => {
    await resetLegalCatalog(owner);
    const empty = await getCurrent('passenger');
    assert.equal(empty.status, 503);
    assert.equal(empty.body.error.code, 'consent_unavailable');
    assert.equal(empty.headers['cache-control'], 'no-store');

    await publishVersion(owner, { document: 'terms_of_use', audience: 'passenger', version: 'v1' });
    const half = await getCurrent('passenger');
    assert.equal(half.status, 503, 'só os Termos: a Política não tem versão');
    assert.equal(half.body.error.code, 'consent_unavailable');
    assert.equal((await getCurrent('driver')).status, 503, 'o outro perfil também não tem nada');
    assert.ok(h.t.logs().includes('"reason":"not_published"'), 'o motivo vai para o log, não para a resposta');

    await publishVersion(owner, { document: 'privacy_policy', audience: 'passenger', version: 'v1' });
    assert.equal((await getCurrent('passenger')).status, 200);
  });

  test('a querystring nunca vai para o log', async () => {
    await api.call('GET', '/v1/legal/current?audience=passenger&marca=segredo-da-querystring-9f3');
    assert.ok(!h.t.logs().includes('segredo-da-querystring-9f3'));
  });
});

describe('POST /v1/auth/register com a versão exibida', () => {
  test('versões ausentes, de tipo errado ou fora do formato: 400 consent_required e nada é criado', async () => {
    const before = await accountCount();
    const bad: Array<Record<string, unknown>> = [
      { termsVersion: undefined }, { privacyVersion: undefined }, { termsVersion: undefined, privacyVersion: undefined },
      { termsVersion: 7 }, { privacyVersion: null }, { termsVersion: '' }, { privacyVersion: 'versão com espaço' },
      { termsVersion: ` ${BASELINE_VERSION}` }, { privacyVersion: `${BASELINE_VERSION} ` }, { termsVersion: 'x'.repeat(65) }, { privacyVersion: '../etc' },
    ];
    for (const extra of bad) {
      const reply = await signUp(extra);
      assert.equal(reply.status, 400, JSON.stringify(extra));
      assert.equal(reply.body.error.code, 'consent_required', JSON.stringify(extra));
    }
    assert.equal(await accountCount(), before);
    assert.equal(h.mailbox.sent.length, 0);
  });

  test('versão que não é a vigente: 409 consent_outdated com error.current igual ao GET; nada criado, nenhum e-mail, nenhum limite gasto', async () => {
    await publishAll(owner, 'v2');
    const current = (await getCurrent('passenger')).body.data;
    const accounts = await accountCount();
    const attempts = await attemptCount();

    for (const extra of [{}, { termsVersion: 'v2' }, { privacyVersion: 'v2' }, { termsVersion: 'nunca-publicada', privacyVersion: 'nunca-publicada' }]) {
      const reply = await signUp(extra);
      assert.equal(reply.status, 409, JSON.stringify(extra));
      assert.equal(reply.body.ok, false);
      assert.equal(reply.body.error.code, 'consent_outdated');
      assert.equal(reply.body.error.message, 'Os Termos ou a Política mudaram. Leia a versão atual e aceite de novo.');
      assert.deepEqual(reply.body.error.current, current, 'o app mostra o texto atual sem outra chamada');
      assert.equal(reply.headers['cache-control'], 'no-store');
    }
    assert.equal(await accountCount(), accounts, 'nada criado');
    assert.equal(h.mailbox.sent.length, 0, 'nenhum e-mail de verificação');
    assert.equal(await attemptCount(), attempts, 'o 409 não gasta o limite de cadastro do e-mail');
  });

  test('a vigente comparada é a do PERFIL da conta: versão só de passageiro não vale para motorista', async () => {
    await publishAll(owner, 'so-passageiro', { audiences: ['passenger'] });
    const asDriver = await signUp({ termsVersion: 'so-passageiro', privacyVersion: 'so-passageiro' }, 'driver');
    assert.equal(asDriver.status, 409, JSON.stringify(asDriver.body));
    assert.equal(asDriver.body.error.current.audience, 'driver');
    assert.equal(asDriver.body.error.current.terms.version, BASELINE_VERSION, 'o corpo traz a vigente do MOTORISTA');
    assert.equal((await signUp({ termsVersion: 'so-passageiro', privacyVersion: 'so-passageiro' }, 'passenger')).status, 201);
  });

  test('o motorista que exibiu a SUA vigente se cadastra mesmo quando a do passageiro é outra (a comparação usa o perfil, nos dois sentidos)', async () => {
    await publishAll(owner, 'so-motorista', { audiences: ['driver'] });
    const asDriver = await signUp({ termsVersion: 'so-motorista', privacyVersion: 'so-motorista' }, 'driver');
    assert.equal(asDriver.status, 201, JSON.stringify(asDriver.body));
    const asPassenger = await signUp({ termsVersion: 'so-motorista', privacyVersion: 'so-motorista' }, 'passenger');
    assert.equal(asPassenger.status, 409, 'a vigente do passageiro segue a baseline');
    assert.equal(asPassenger.body.error.current.terms.version, BASELINE_VERSION);
  });

  test('versão desatualizada é recusada ANTES de qualquer escrita: nenhum INSERT, UPDATE ou DELETE chega ao banco (conferência da API, à parte da rede do banco)', async () => {
    await publishAll(owner, 'v2');
    const tracked = trackingPool();
    const result = await registerAccount(
      tracked.pool, loadAuthConfig()!, loadLegalConfig(), { mail: h.mailbox, onMailFailure: () => undefined },
      { accountType: 'passenger', fullName: 'Pessoa', email: uniqueEmail('antes-da-escrita'), password: PASSWORD, phone: null, birthDate: REGISTER_EXTRAS.birthDate, termsVersion: BASELINE_VERSION, privacyVersion: BASELINE_VERSION },
      { ipHash: null, userAgentFamily: 'x', requestId: 'r' },
    );
    assert.equal(result.kind, 'consent_outdated');
    assert.ok(tracked.statements.length > 0, 'o rastreador viu a leitura do catálogo');
    assert.equal(wroteAnything(tracked.statements), false, tracked.statements.join(String.fromCharCode(10)));
  });

  test('versão vigente: 201 e o aceite grava a versão que o cliente enviou, o perfil e o hash do CATÁLOGO', async () => {
    await publishAll(owner, 'v2');
    const reply = await signUp({ termsVersion: 'v2', privacyVersion: 'v2' });
    assert.equal(reply.status, 201, JSON.stringify(reply.body));
    const rows = await consentRows(reply.body.data.account.id);
    assert.deepEqual(rows.map((r) => [r.document, r.version, r.audience, r.text_sha256]), [
      ['privacy_policy', 'v2', 'passenger', sha256For('privacy_policy', 'passenger', 'v2')],
      ['terms_of_use', 'v2', 'passenger', sha256For('terms_of_use', 'passenger', 'v2')],
    ]);
  });

  test('corrida: publicam outra versão ENTRE a conferência e o INSERT — o banco recusa, a conta é desfeita e a resposta é o mesmo 409', async () => {
    let raced = false;
    const racingPool = {
      query: pool.query.bind(pool),
      connect: async () => {
        const client = await pool.connect();
        const patchable = client as unknown as { query: unknown; release: (err?: unknown) => void };
        const originalQuery = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>;
        const originalRelease = client.release.bind(client);
        patchable.query = async (text: unknown, ...rest: unknown[]) => {
          if (!raced && typeof text === 'string' && text.includes('INSERT INTO account_consents')) {
            raced = true;
            await publishAll(owner, 'v-da-corrida'); // o operador publica no meio do cadastro
          }
          return originalQuery(text, ...rest);
        };
        // O pool reaproveita o MESMO objeto de conexão: devolve-o limpo, senão a corrida simulada vaza para os testes seguintes.
        patchable.release = (err?: unknown) => {
          patchable.query = (text: unknown, ...rest: unknown[]) => originalQuery(text, ...rest);
          originalRelease(err as Error | undefined);
        };
        return client;
      },
    } as unknown as Pool;
    const email = uniqueEmail('corrida');
    const result = await registerAccount(
      racingPool, loadAuthConfig()!, loadLegalConfig(), { mail: h.mailbox, onMailFailure: () => undefined },
      { accountType: 'passenger', fullName: 'Pessoa', email, password: PASSWORD, phone: null, birthDate: REGISTER_EXTRAS.birthDate, termsVersion: BASELINE_VERSION, privacyVersion: BASELINE_VERSION },
      { ipHash: null, userAgentFamily: 'x', requestId: 'r' },
    );
    assert.equal(raced, true, 'a corrida aconteceu');
    assert.equal(result.kind, 'consent_outdated');
    assert.ok(result.kind === 'consent_outdated' && result.current.terms.version === 'v-da-corrida' && result.current.privacy.version === 'v-da-corrida', 'o corpo traz a vigente RELIDA');
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM accounts WHERE email = $1', [email])).rows[0].n, 0, 'o ROLLBACK levou a conta junto');
    assert.equal(h.mailbox.sent.length, 0);
  });

  test('sem versão publicada para o perfil: 503 consent_unavailable (cadastro fechado), login segue', async () => {
    await resetLegalCatalog(owner);
    const reply = await signUp();
    assert.equal(reply.status, 503);
    assert.equal(reply.body.error.code, 'consent_unavailable');
    assert.equal(reply.headers['cache-control'], 'no-store');
    assert.equal((await api.call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: 'x@y.com', password: PASSWORD } })).status, 401);
  });
});

describe('GET /v1/auth/me: consent', () => {
  test('em dia logo após o cadastro; mudança MATERIAL deixa pendente (Termos antes da Política); mudança EDITORIAL não incomoda', async () => {
    const session = await sessionOf();
    const first = await me(session.accessToken);
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.data.consent, { upToDate: true, pending: [] });
    assert.deepEqual(Object.keys(first.body.data).sort(), ['accountType', 'consent', 'fullName', 'id', 'publicId']);

    await publishAll(owner, 'v2', { requiresReacceptance: false });
    assert.deepEqual((await me(session.accessToken)).body.data.consent, { upToDate: true, pending: [] }, 'editorial: ninguém é incomodado');

    await publishAll(owner, 'v3'); // material
    const pending = (await me(session.accessToken)).body.data.consent;
    assert.equal(pending.upToDate, false);
    assert.deepEqual(pending.pending.map((p: { document: string; version: string }) => [p.document, p.version]), [['terms', 'v3'], ['privacy', 'v3']], 'a VIGENTE de cada documento pendente');
    const terms = pending.pending[0];
    assert.deepEqual(Object.keys(terms).sort(), ['document', 'publishedAt', 'sha256', 'url', 'version']);
    assert.equal(terms.sha256, sha256For('terms_of_use', 'passenger', 'v3'));
    assert.equal(terms.url, `${LEGAL_BASE_URL}/terms/passenger/v3`);
  });

  test('o perfil decide a pendência: publicação só para motorista não pende o passageiro', async () => {
    const passenger = await sessionOf('passenger');
    const driver = await sessionOf('driver');
    await publishAll(owner, 'so-motorista', { audiences: ['driver'] });
    assert.equal((await me(passenger.accessToken)).body.data.consent.upToDate, true);
    assert.equal((await me(driver.accessToken)).body.data.consent.upToDate, false);
  });
});

describe('POST /v1/auth/consents', () => {
  test('sem Bearer: 401', async () => {
    assert.equal((await api.call('POST', '/v1/auth/consents', { body: { termsVersion: BASELINE_VERSION } })).status, 401);
  });

  test('corpo sem versão utilizável: 400 consent_required; corpo que nem é objeto: 400 invalid_body', async () => {
    const session = await sessionOf();
    for (const body of [{}, { termsVersion: 5 }, { privacyVersion: 'a b' }, { termsVersion: null }, { termsVersion: '', privacyVersion: '' }]) {
      const reply = await accept(session.accessToken, body);
      assert.equal(reply.status, 400, JSON.stringify(body));
      assert.equal(reply.body.error.code, 'consent_required', JSON.stringify(body));
    }
    for (const body of [undefined, [], 'texto']) {
      const reply = await accept(session.accessToken, body);
      assert.equal(reply.status, 400);
      assert.equal(reply.body.error.code, 'invalid_body');
    }
  });

  test('reaceite: 200 { consent } em dia; grava a versão, o perfil, o hash do catálogo e o HMAC do IP (nunca o IP)', async () => {
    const session = await sessionOf();
    await publishAll(owner, 'v2');
    assert.equal((await me(session.accessToken)).body.data.consent.upToDate, false);

    const ip = '203.0.113.77';
    const reply = await accept(session.accessToken, { termsVersion: 'v2', privacyVersion: 'v2' }, ip);
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.deepEqual(reply.body, { ok: true, data: { consent: { upToDate: true, pending: [] } } });
    assert.equal(reply.headers['cache-control'], 'no-store');
    assert.deepEqual((await me(session.accessToken)).body.data.consent, { upToDate: true, pending: [] });

    const rows = (await consentRows(session.account.id)).filter((r) => r.version === 'v2');
    assert.deepEqual(rows.map((r) => [r.document, r.audience, r.text_sha256]), [
      ['privacy_policy', 'passenger', sha256For('privacy_policy', 'passenger', 'v2')],
      ['terms_of_use', 'passenger', sha256For('terms_of_use', 'passenger', 'v2')],
    ]);
    for (const row of rows) assert.equal(row.ip_hash, hmacHex(PEPPER, ip));
    assert.ok(!JSON.stringify((await owner.query('SELECT * FROM account_consents')).rows).includes(ip), 'o IP em claro nunca entra na tabela');
    assert.equal((await consentRows(session.account.id)).length, 4, 'o aceite do cadastro (baseline) segue lá: a trilha só acrescenta');
  });

  test('idempotente: reaceitar a mesma versão (inclusive em rajada) devolve 200 e não duplica', async () => {
    const session = await sessionOf();
    await publishAll(owner, 'v2');
    const body = { termsVersion: 'v2', privacyVersion: 'v2' };
    assert.equal((await accept(session.accessToken, body)).status, 200);
    const again = await accept(session.accessToken, body);
    assert.equal(again.status, 200);
    assert.deepEqual(again.body.data.consent, { upToDate: true, pending: [] });
    const burst = await Promise.all(Array.from({ length: 6 }, () => accept(session.accessToken, body)));
    assert.deepEqual(burst.map((r) => r.status), [200, 200, 200, 200, 200, 200]);
    assert.equal((await consentRows(session.account.id)).length, 4, 'baseline x2 + v2 x2: nenhuma linha repetida');
    // Quem já está em dia e reenvia a baseline (agora SUPERADA) recebe 409, não um 200 enganoso.
    assert.equal((await accept(session.accessToken, { termsVersion: BASELINE_VERSION })).status, 409);
  });

  test('aceite parcial: só os Termos deixa a Política pendente; depois a Política fecha', async () => {
    const session = await sessionOf();
    await publishAll(owner, 'v2');
    const onlyTerms = await accept(session.accessToken, { termsVersion: 'v2' });
    assert.equal(onlyTerms.status, 200);
    assert.equal(onlyTerms.body.data.consent.upToDate, false);
    assert.deepEqual(onlyTerms.body.data.consent.pending.map((p: { document: string }) => p.document), ['privacy']);
    const onlyPrivacy = await accept(session.accessToken, { privacyVersion: 'v2' });
    assert.deepEqual(onlyPrivacy.body.data.consent, { upToDate: true, pending: [] });
  });

  test('versão que não é a vigente: 409 consent_outdated com error.current; TUDO OU NADA (a versão certa do outro documento não é gravada)', async () => {
    const session = await sessionOf();
    await publishAll(owner, 'v2');
    const current = (await getCurrent('passenger')).body.data;
    const rowsBefore = (await consentRows(session.account.id)).length;
    for (const body of [{ termsVersion: BASELINE_VERSION }, { termsVersion: 'v2', privacyVersion: BASELINE_VERSION }, { termsVersion: 'nunca-publicada' }]) {
      const reply = await accept(session.accessToken, body);
      assert.equal(reply.status, 409, JSON.stringify(body));
      assert.equal(reply.body.error.code, 'consent_outdated');
      assert.deepEqual(reply.body.error.current, current);
    }
    assert.equal((await consentRows(session.account.id)).length, rowsBefore, 'nada foi gravado');
    assert.equal((await me(session.accessToken)).body.data.consent.upToDate, false);
  });

  test('versão desatualizada é recusada ANTES de qualquer escrita (conferência da API, à parte da rede do banco)', async () => {
    const session = await sessionOf();
    await publishAll(owner, 'v2');
    const tracked = trackingPool();
    const result = await acceptConsents(tracked.pool, loadLegalConfig(), { accountId: session.account.id, termsVersion: BASELINE_VERSION, privacyVersion: 'v2', ipHash: null });
    assert.equal(result.kind, 'outdated');
    assert.ok(tracked.statements.length > 0, 'o rastreador viu a leitura do catálogo');
    assert.equal(wroteAnything(tracked.statements), false, tracked.statements.join(String.fromCharCode(10)));
    // E a versão vigente SIM chega a escrever (o rastreador enxerga escrita quando ela acontece).
    const written = trackingPool();
    assert.equal((await acceptConsents(written.pool, loadLegalConfig(), { accountId: session.account.id, termsVersion: 'v2', privacyVersion: 'v2', ipHash: null })).kind, 'ok');
    assert.equal(wroteAnything(written.statements), true);
  });

  test('a vigente EDITORIAL também é a que se aceita (a anterior, superada, é recusada); motorista não aceita versão só de passageiro', async () => {
    const passenger = await sessionOf('passenger');
    const driver = await sessionOf('driver');
    await publishAll(owner, 'v2', { requiresReacceptance: false });
    assert.equal((await accept(passenger.accessToken, { termsVersion: BASELINE_VERSION })).status, 409);
    assert.equal((await accept(passenger.accessToken, { termsVersion: 'v2', privacyVersion: 'v2' })).status, 200);
    await publishAll(owner, 'so-passageiro', { audiences: ['passenger'] });
    assert.equal((await accept(driver.accessToken, { termsVersion: 'so-passageiro' })).status, 409, 'a vigente do motorista continua v2');
  });

  test('corrida: publicam outra versão entre a conferência e o INSERT — nada gravado e a resposta é o 409 com a vigente RELIDA', async () => {
    const session = await sessionOf();
    await publishAll(owner, 'v2');
    let raced = false;
    const racingPool = {
      query: pool.query.bind(pool),
      connect: pool.connect.bind(pool),
    } as unknown as Pool;
    // O INSERT do reaceite roda direto no pool (sem transação): intercepta o `query` do pool e publica antes de executá-lo.
    const originalQuery = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>;
    (racingPool as unknown as { query: unknown }).query = async (text: unknown, ...rest: unknown[]) => {
      if (!raced && typeof text === 'string' && text.includes('INSERT INTO account_consents')) {
        raced = true;
        await publishAll(owner, 'v-da-corrida');
      }
      return originalQuery(text, ...rest);
    };
    const rowsBefore = (await consentRows(session.account.id)).length;
    const result = await acceptConsents(racingPool, loadLegalConfig(), { accountId: session.account.id, termsVersion: 'v2', privacyVersion: 'v2', ipHash: null });
    assert.equal(raced, true);
    assert.equal(result.kind, 'outdated');
    assert.ok(result.kind === 'outdated' && result.current.terms.version === 'v-da-corrida');
    assert.equal((await consentRows(session.account.id)).length, rowsBefore);
  });

  test('NÃO é bloqueado por aceite pendente (é a saída dele); `me` e renovação de sessão também não', async () => {
    const session = await sessionOf();
    await publishAll(owner, 'v2');
    assert.equal((await me(session.accessToken)).status, 200);
    const refreshed = await api.call('POST', '/v1/auth/refresh', { body: { refreshToken: session.refreshToken } });
    assert.equal(refreshed.status, 200, JSON.stringify(refreshed.body));
    assert.equal((await accept(refreshed.body.data.accessToken, { termsVersion: 'v2', privacyVersion: 'v2' })).status, 200);
  });
});

describe('textos indisponíveis por configuração (sem LEGAL_DOCUMENTS_BASE_URL)', () => {
  test('GET legal, cadastro e reaceite: 503 consent_unavailable; `me` segue com consent null; o login funciona', async () => {
    const session = await sessionOf();
    const saved = process.env['LEGAL_DOCUMENTS_BASE_URL'];
    delete process.env['LEGAL_DOCUMENTS_BASE_URL'];
    const harness = await startIdentityApp();
    try {
      const client = makeClient(harness);
      const call = client.call;
      assert.equal((await call('GET', '/v1/legal/current?audience=passenger')).body.error.code, 'consent_unavailable');
      assert.equal((await call('POST', '/v1/auth/register', { body: registerBody() })).body.error.code, 'consent_unavailable');
      assert.equal((await call('POST', '/v1/auth/consents', { bearer: session.accessToken, body: { termsVersion: BASELINE_VERSION } })).status, 503);
      const profile = await call('GET', '/v1/auth/me', { bearer: session.accessToken });
      assert.equal(profile.status, 200);
      assert.equal(profile.body.data.consent, null);
      assert.equal((await call('POST', '/v1/auth/login', { body: { accountType: 'passenger', identifier: session.email, password: PASSWORD } })).status, 200);
      assert.ok(harness.t.logs().includes('LEGAL_DOCUMENTS_BASE_URL:missing'));
    } finally {
      await harness.t.app.close();
      process.env['LEGAL_DOCUMENTS_BASE_URL'] = saved;
    }
  });
});

describe('requireCurrentConsent (helper para as futuras rotas de compromisso)', () => {
  let guarded: Harness;
  let reached = 0;
  const get = (url: string, bearer?: string) =>
    guarded.t.app.inject({ method: 'GET', url, headers: { 'x-forwarded-for': '10.9.9.9', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) } })
      .then((r) => ({ status: r.statusCode, body: r.body ? JSON.parse(r.body) : null, headers: r.headers }));

  before(async () => {
    const mailbox = new FakeMailbox();
    const requireAccount = makeRequireAccount(loadAuthConfig()!);
    const handler = async (_request: unknown, reply: { send: (payload: unknown) => void }) => {
      reached += 1;
      reply.send({ ok: true });
    };
    const t = await startApp((app) => {
      // Rotas de TESTE: ainda não existe rota de corrida. A fiação é a que a rota real deve usar: requireAccount e, DEPOIS, o helper.
      app.get('/test/compromisso', { preHandler: [requireAccount, makeRequireCurrentConsent(loadLegalConfig())] }, handler);
      app.get('/test/sem-requireaccount', { preHandler: [makeRequireCurrentConsent(loadLegalConfig())] }, handler);
      app.get('/test/sem-textos', { preHandler: [requireAccount, makeRequireCurrentConsent(null)] }, handler);
    }, { mail: mailbox });
    guarded = { t, mailbox };
  });
  after(async () => {
    await guarded.t.app.close();
  });

  const session = async (accountType: 'passenger' | 'driver' = 'passenger') => makeClient(guarded).registerAndLogin(uniqueEmail('compromisso'), accountType);

  test('sem Bearer: 401 (requireAccount vem antes); em dia: a rota executa', async () => {
    const before = reached;
    assert.equal((await get('/test/compromisso')).status, 401);
    assert.equal(reached, before);
    const user = await session();
    assert.equal((await get('/test/compromisso', user.accessToken)).status, 200);
    assert.equal(reached, before + 1);
  });

  test('aceite pendente: 409 consent_outdated com error.pending e error.current (igual ao GET); a rota NÃO executa; depois de aceitar, executa', async () => {
    const user = await session();
    await publishAll(owner, 'v2'); // material
    const before = reached;
    const blocked = await get('/test/compromisso', user.accessToken);
    assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
    assert.equal(blocked.body.error.code, 'consent_outdated');
    assert.deepEqual(blocked.body.error.pending, ['terms', 'privacy']);
    assert.deepEqual(blocked.body.error.current, (await getCurrent('passenger')).body.data);
    assert.equal(blocked.headers['cache-control'], 'no-store');
    assert.equal(reached, before, 'o compromisso novo NÃO foi assumido');

    // Aceitar só os Termos: segue bloqueado, agora só pela Política.
    await accept(user.accessToken, { termsVersion: 'v2' });
    const partial = await get('/test/compromisso', user.accessToken);
    assert.equal(partial.status, 409);
    assert.deepEqual(partial.body.error.pending, ['privacy']);
    await accept(user.accessToken, { privacyVersion: 'v2' });
    assert.equal((await get('/test/compromisso', user.accessToken)).status, 200);
    assert.equal(reached, before + 1);
  });

  test('mudança editorial não bloqueia; mudança material só do outro perfil também não', async () => {
    const user = await session('passenger');
    const driver = await session('driver');
    await publishAll(owner, 'v2', { requiresReacceptance: false });
    assert.equal((await get('/test/compromisso', user.accessToken)).status, 200, 'editorial: em dia');
    assert.equal((await get('/test/compromisso', driver.accessToken)).status, 200, 'editorial: em dia');
    await publishAll(owner, 'so-motorista', { audiences: ['driver'] });
    assert.equal((await get('/test/compromisso', user.accessToken)).status, 200, 'o passageiro não é afetado');
    const blocked = await get('/test/compromisso', driver.accessToken);
    assert.equal(blocked.status, 409, 'o motorista, sim');
    assert.equal(blocked.body.error.current.audience, 'driver');
  });

  test('rotas que NÃO são compromisso novo seguem abertas com aceite pendente (me, renovação, reaceite)', async () => {
    const user = await session();
    await publishAll(owner, 'v2');
    assert.equal((await get('/test/compromisso', user.accessToken)).status, 409);
    assert.equal((await get('/v1/auth/me', user.accessToken)).status, 200);
    assert.equal((await guarded.t.app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: user.refreshToken } })).statusCode, 200);
  });

  test('falha FECHADO: sem requireAccount antes, ou sem a URL base dos textos, a rota NÃO executa', async () => {
    const user = await session();
    const before = reached;
    const miswired = await get('/test/sem-requireaccount', user.accessToken);
    assert.equal(miswired.status, 401);
    assert.equal(miswired.body.error.code, 'unauthorized');
    const noTexts = await get('/test/sem-textos', user.accessToken);
    assert.equal(noTexts.status, 503);
    assert.equal(noTexts.body.error.code, 'consent_unavailable');
    assert.equal(reached, before, 'nenhuma das duas executou o compromisso');
  });
});
