/**
 * Rotas do cadastro do motorista (fatia D4 do `docs/plano-m3-m4.md` §3, contrato K0 em
 * `packages/api-client/src/driver/onboarding-types.ts`) contra o Postgres REAL, com o app conectando como o papel
 * restrito `vuumbora_api` (as fixtures que a API não pode escrever — candidatura, revisor, aprovação — usam a credencial
 * dona). Arquivos pelo adaptador LOCAL de armazenamento (servidor HTTP de verdade, relógio controlado pelo teste).
 *
 * Um teste por erro do §3 e de cada acréscimo da D4, e as propriedades da revisão M3-D1: id do motorista só da sessão,
 * cidade fixada no servidor, CPF/CNH/endereço validados antes do SQL e fora de toda resposta e de todo log, e dados da
 * CNH travados depois de aprovada.
 *
 * O banco persiste entre execuções: e-mails, CPFs e placas são aleatórios.
 */
import './helpers/auth-env.js';
import './helpers/driver-route-env.js';
import './helpers/runtime-role-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Writable } from 'node:stream';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { parseOnboardingBody } from '../src/domain/driver-onboarding.js';
import type { DocumentStorage } from '../src/lib/document-storage.js';
import * as onboardingService from '../src/services/driver-onboarding-service.js';
import { prepararBanco } from '../src/migrate.js';
import { startLocalDocumentStorage, type LocalDocumentStorage } from '../src/lib/document-storage-local.js';
import { DRIVER_ROUTE_ERRORS } from '../src/routes/driver-route.js';
import { shutdown } from './helpers/harness.js';
import { FakeMailbox, makeClient, randomIp, uniqueEmail } from './helpers/identity-kit.js';
import { ensureBaseline, publishAll, resetToBaseline } from './helpers/legal-kit.js';
import { OWNER_DATABASE_URL } from './helpers/runtime-role-env.js';

const owner = new pg.Pool({ connectionString: OWNER_DATABASE_URL, max: 4 });
let clockMs = Date.now();
let storage: LocalDocumentStorage;
let app: FastifyInstance;
let logBuffer = '';
const mailbox = new FakeMailbox();
let reviewerId = '';

// ---------------------------------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------------------------------

const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
function randomCpf(): string {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (d.every((x) => x === d[0])) d[0] = (d[0]! + 1) % 10;
  for (const len of [9, 10]) d.push(((d.slice(0, len).reduce((acc, x, i) => acc + x * (len + 1 - i), 0) * 10) % 11) % 10);
  return d.join('');
}
const masked = (cpf: string) => `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
const randomPlate = () => `${letters(3)}${digits(1)}${letters(1)}${digits(2)}`;
const isoDaysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const CURRENT_YEAR = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric' }).format(new Date()));
/** Validade dentro do teto de todo tipo (0025: certidão de antecedentes, o menor, até 365 dias). */
const VALID_UNTIL = isoDaysFromNow(300);
const REQUIRED_TYPES = ['cnh', 'crlv', 'criminal_record', 'inss', 'profile_photo'] as const;

function onboardingBody(overrides: { cpf?: string; cnhNumber?: string; ear?: boolean; street?: string } = {}) {
  return {
    cpf: overrides.cpf ?? masked(randomCpf()),
    birthDate: '1988-03-14',
    address: { street: overrides.street ?? '  Rua Mossoró  ', number: '500', complement: 'Apto 3', neighborhood: 'Tirol', city: 'Natal', state: 'RN', postalCode: '59020090' },
    cnh: { number: overrides.cnhNumber ?? digits(11), category: 'B', expiresOn: isoDaysFromNow(900), ear: overrides.ear ?? true },
  };
}

const vehicleBody = (overrides: Partial<{ plate: string; brand: string; model: string; year: number; color: string }> = {}) => ({
  plate: randomPlate(), brand: 'Fiat', model: 'Argo', year: CURRENT_YEAR - 2, color: 'Prata', ...overrides,
});

interface FileSpec { readonly body: Buffer; readonly sha256: string }
function fileOf(text: string): FileSpec {
  const body = Buffer.from(text);
  return { body, sha256: createHash('sha256').update(body).digest('hex') };
}

interface Reply { readonly status: number; readonly body: any; readonly raw: string; readonly headers: Record<string, unknown> }

async function call(method: 'GET' | 'POST' | 'PUT', url: string, options: { token?: string; body?: unknown } = {}): Promise<Reply> {
  const response = await app.inject({
    method,
    url,
    headers: {
      'x-forwarded-for': randomIp(),
      'user-agent': 'okhttp/4.12 (Android)',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body !== undefined ? { payload: options.body as object } : {}),
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null, raw: response.body, headers: response.headers };
}

/** A recusa tem de ser exatamente este código, com o status do catálogo do servidor. */
function assertRefused(reply: Reply, code: keyof typeof DRIVER_ROUTE_ERRORS | 'unauthorized' | 'consent_outdated'): void {
  const expectedStatus = code === 'unauthorized' ? 401 : code === 'consent_outdated' ? 409 : DRIVER_ROUTE_ERRORS[code].status;
  assert.equal(reply.status, expectedStatus, `esperado ${expectedStatus} ${code}, veio ${reply.status} ${reply.raw}`);
  assert.equal(reply.body?.ok, false);
  assert.equal(reply.body?.error?.code, code, reply.raw);
}

interface Driver { readonly token: string; readonly accountId: string; readonly email: string }

/** Conta de motorista de verdade (cadastro, e-mail confirmado, login) e, se pedido, a candidatura com o MESMO e-mail. */
async function newDriver(application: 'approved' | 'pending' | 'none' = 'approved', accountType: 'driver' | 'passenger' = 'driver'): Promise<Driver> {
  const client = makeClient({ t: { app, logs: () => logBuffer }, mailbox });
  const email = uniqueEmail(accountType === 'driver' ? 'motorista' : 'passageiro');
  const session = await client.registerAndLogin(email, accountType);
  if (application !== 'none') {
    await owner.query(
      `INSERT INTO driver_applications (name, email, phone, city, state, status) VALUES ('Motorista de Teste', $1, '84999990000', 'Natal', 'RN', $2)`,
      [email, application],
    );
  }
  return { token: session.accessToken, accountId: session.account.id, email };
}

async function linkedDriver(): Promise<Driver> {
  const driver = await newDriver('approved');
  const reply = await call('POST', '/v1/driver/link-application', { token: driver.token });
  assert.equal(reply.status, 200, reply.raw);
  return driver;
}

/** Vinculado, etapa 2 e veículo feitos. */
async function profiledDriver(): Promise<Driver & { cpf: string; plate: string; vehicleId: string }> {
  const driver = await linkedDriver();
  const cpf = randomCpf();
  assert.equal((await call('PUT', '/v1/driver/onboarding', { token: driver.token, body: onboardingBody({ cpf: masked(cpf) }) })).status, 200);
  const plate = randomPlate();
  const vehicle = await call('PUT', '/v1/driver/vehicle', { token: driver.token, body: vehicleBody({ plate }) });
  assert.equal(vehicle.status, 200, vehicle.raw);
  return { ...driver, cpf, plate, vehicleId: vehicle.body.data.vehicleId };
}

/** Pede a URL, envia o arquivo pelo armazenamento local e confirma. Devolve o `documentId`. */
async function sendDocument(driver: Driver, typeCode: string, file: FileSpec = fileOf(`documento ${typeCode} ${randomUUID()}`)): Promise<string> {
  const target = await call('POST', '/v1/driver/documents/upload-url', {
    token: driver.token,
    body: { typeCode, contentType: 'image/jpeg', sizeBytes: file.body.length, sha256: file.sha256 },
  });
  assert.equal(target.status, 200, target.raw);
  assert.equal(await putFile(target.body.data, file.body), 200);
  const submitted = await call('POST', `/v1/driver/documents/${target.body.data.documentId}/submit`, { token: driver.token });
  assert.equal(submitted.status, 200, submitted.raw);
  return target.body.data.documentId;
}

async function putFile(target: { uploadUrl: string; headers: Record<string, string> }, body: Buffer): Promise<number> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(target.headers)) if (name.toLowerCase() !== 'content-length') headers[name] = value;
  const response = await fetch(target.uploadUrl, { method: 'PUT', headers, body });
  await response.arrayBuffer();
  return response.status;
}

/** O revisor aprova (credencial dona: a rota de revisão é a D5). */
async function approveDocument(documentId: string, expiresOn: string | null): Promise<void> {
  const result = await owner.query(
    `UPDATE driver_documents SET status = 'approved', reviewed_by = $2, expires_on = $3::date WHERE id = $1 AND status = 'submitted'`,
    [documentId, reviewerId, expiresOn],
  );
  assert.equal(result.rowCount, 1);
}

async function rejectDocument(documentId: string, reasonCode: string, note: string): Promise<void> {
  const result = await owner.query(
    `UPDATE driver_documents SET status = 'rejected', reviewed_by = $2, rejection_code = $3, review_note = $4 WHERE id = $1 AND status = 'submitted'`,
    [documentId, reviewerId, reasonCode, note],
  );
  assert.equal(result.rowCount, 1);
}

const HAS_EXPIRY = new Set(['cnh', 'crlv', 'criminal_record']);

/** Motorista com todos os documentos obrigatórios aprovados e `drivers.status = approved` (N4 feito à mão até a D5). */
async function approvedDriver(): Promise<Driver & { cpf: string; docs: Record<string, string> }> {
  const driver = await profiledDriver();
  const docs: Record<string, string> = {};
  for (const type of REQUIRED_TYPES) {
    docs[type] = await sendDocument(driver, type);
    await approveDocument(docs[type]!, HAS_EXPIRY.has(type) ? VALID_UNTIL : null);
  }
  const updated = await owner.query(`UPDATE drivers SET status = 'approved' WHERE account_id = $1 AND status = 'pending'`, [driver.accountId]);
  assert.equal(updated.rowCount, 1);
  return { ...driver, docs };
}

/** Viagem no tempo SÓ na fixture: dono, gatilhos desligados nesta transação (a validade já passou ontem). */
async function backdateExpiry(documentId: string): Promise<void> {
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL session_replication_role = replica`);
    await c.query(`UPDATE driver_documents SET expires_on = city_today('natal') - 1 WHERE id = $1`, [documentId]);
    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

const ALL_ROUTES: readonly ['GET' | 'POST' | 'PUT', string][] = [
  ['POST', '/v1/driver/link-application'],
  ['PUT', '/v1/driver/onboarding'],
  ['PUT', '/v1/driver/vehicle'],
  ['GET', '/v1/driver/verification'],
  ['POST', '/v1/driver/documents/upload-url'],
  ['POST', `/v1/driver/documents/${randomUUID()}/submit`],
  ['PUT', '/v1/driver/availability'],
];

before(async () => {
  await prepararBanco({ databaseUrl: OWNER_DATABASE_URL, pool: owner, log: () => undefined });
  await ensureBaseline(owner);
  const reviewer = await owner.query<{ id: string }>(
    `INSERT INTO admin_users (name, email, password_hash, role) VALUES ('Revisora', $1, $2, 'revisor_documentos') RETURNING id`,
    [`revisora-${randomUUID().slice(0, 8)}@teste.vuumbora.dev`, `$2b$04$${'x'.repeat(53)}`],
  );
  reviewerId = reviewer.rows[0]!.id;
  storage = await startLocalDocumentStorage({ now: () => clockMs });
  app = await buildApp({
    logStream: new Writable({ write: (chunk, _encoding, callback) => { logBuffer += chunk.toString(); callback(); } }),
    mail: mailbox,
    documents: { storage, urlTtlSeconds: 300 },
  });
  await app.ready();
});

after(async () => {
  await app.close();
  await storage.close();
  await owner.end();
  await shutdown();
});

// ---------------------------------------------------------------------------------------------------------------------
// Portões comuns
// ---------------------------------------------------------------------------------------------------------------------

describe('portões: sessão e tipo de conta', () => {
  test('sem sessão: 401 unauthorized em todas as rotas', async () => {
    for (const [method, url] of ALL_ROUTES) assertRefused(await call(method, url, method === 'GET' ? {} : { body: {} }), 'unauthorized');
  });

  test('conta de PASSAGEIRO: 403 not_driver_account em todas as rotas, e nada é criado', async () => {
    const passenger = await newDriver('approved', 'passenger');
    for (const [method, url] of ALL_ROUTES) {
      assertRefused(await call(method, url, method === 'GET' ? { token: passenger.token } : { token: passenger.token, body: { online: false } }), 'not_driver_account');
    }
    assert.equal((await owner.query('SELECT 1 FROM drivers WHERE account_id = $1', [passenger.accountId])).rowCount, 0);
  });

  test('toda resposta é no-store', async () => {
    const driver = await newDriver('none');
    const reply = await call('GET', '/v1/driver/verification', { token: driver.token });
    assert.equal(reply.status, 200);
    assert.equal(reply.headers['cache-control'], 'no-store');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// POST /v1/driver/link-application
// ---------------------------------------------------------------------------------------------------------------------

describe('POST /v1/driver/link-application (N3)', () => {
  test('liga à candidatura aprovada: 200 { driverId, status }, cidade do SERVIDOR, conta da SESSÃO, trilha uma vez; repetir é idempotente', async () => {
    const driver = await newDriver('approved');
    const other = await newDriver('approved');
    // Corpo forjado: outra conta e outra cidade. Os dois são ignorados (só a sessão e o servidor decidem).
    const first = await call('POST', '/v1/driver/link-application', { token: driver.token, body: { accountId: other.accountId, cityCode: 'sao-paulo' } });
    assert.equal(first.status, 200, first.raw);
    assert.deepEqual(first.body.data, { driverId: driver.accountId, status: 'pending_documents' });
    const row = await owner.query(`SELECT account_id, city_code, status FROM drivers WHERE account_id = ANY($1::uuid[])`, [[driver.accountId, other.accountId]]);
    assert.deepEqual(row.rows, [{ account_id: driver.accountId, city_code: 'natal', status: 'pending' }]);

    const again = await call('POST', '/v1/driver/link-application', { token: driver.token });
    assert.equal(again.status, 200);
    assert.deepEqual(again.body.data, first.body.data);
    const trail = await owner.query(`SELECT count(*)::int AS n FROM access_log WHERE account_id = $1 AND event = 'driver_application_linked'`, [driver.accountId]);
    assert.equal(trail.rows[0].n, 1);
  });

  test('409 application_not_approved: sem candidatura, ou candidatura ainda pendente', async () => {
    assertRefused(await call('POST', '/v1/driver/link-application', { token: (await newDriver('none')).token }), 'application_not_approved');
    assertRefused(await call('POST', '/v1/driver/link-application', { token: (await newDriver('pending')).token }), 'application_not_approved');
  });

  test('409 application_already_linked: a candidatura já é de uma conta (excluída) e o mesmo e-mail volta com conta nova', async () => {
    const first = await linkedDriver();
    await owner.query(`SELECT delete_account($1, $2)`, [first.accountId, `$2b$04$${'x'.repeat(53)}`]);
    const client = makeClient({ t: { app, logs: () => logBuffer }, mailbox });
    const again = await client.registerAndLogin(first.email, 'driver');
    assertRefused(await call('POST', '/v1/driver/link-application', { token: again.accessToken }), 'application_already_linked');
  });

  test('email_not_verified é inalcançável pela API: sessão de conta sem e-mail verificado já é 401 (o código fica para o mock)', async () => {
    const driver = await newDriver('approved');
    await owner.query(`UPDATE accounts SET email_verified_at = NULL WHERE id = $1`, [driver.accountId]);
    assertRefused(await call('POST', '/v1/driver/link-application', { token: driver.token }), 'unauthorized');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// PUT /v1/driver/onboarding
// ---------------------------------------------------------------------------------------------------------------------

describe('PUT /v1/driver/onboarding (etapa 2)', () => {
  test('400 invalid_body antes de qualquer regra (forma, limites dos CHECKs, 18 anos), e nada gravado', async () => {
    const driver = await linkedDriver();
    const valid = onboardingBody();
    const invalid: unknown[] = [
      {},
      { ...valid, address: undefined },
      { ...valid, address: { ...valid.address, postalCode: '59020-090' } },
      { ...valid, address: { ...valid.address, state: 'rn' } },
      { ...valid, address: { ...valid.address, complement: 'x'.repeat(61) } },
      { ...valid, address: { ...valid.address, street: '   ' } },
      { ...valid, birthDate: isoDaysFromNow(-365 * 17) },
      { ...valid, birthDate: '1990-02-30' },
      { ...valid, cnh: { ...valid.cnh, category: 'A' } },
      { ...valid, cnh: { ...valid.cnh, number: '1234567890' } },
      { ...valid, cnh: { ...valid.cnh, ear: 'sim' } },
      { ...valid, cpf: 12345678909 },
      // S-5: caractere de controle (o Postgres recusaria o NUL com 22021, que viraria 503)
      { ...valid, address: { ...valid.address, complement: 'Apto\u00003' } },
      { ...valid, address: { ...valid.address, street: 'Rua\u0007Mossoró' } },
      { ...valid, address: { ...valid.address, city: 'Natal\u0085' } },
    ];
    for (const body of invalid) assertRefused(await call('PUT', '/v1/driver/onboarding', { token: driver.token, body }), 'invalid_body');
    const row = await owner.query(`SELECT cpf, cnh_number, address_postal_code FROM drivers WHERE account_id = $1`, [driver.accountId]);
    assert.deepEqual(row.rows[0], { cpf: null, cnh_number: null, address_postal_code: null });
  });

  test('409 driver_not_linked: conta sem vínculo (corpo válido)', async () => {
    assertRefused(await call('PUT', '/v1/driver/onboarding', { token: (await newDriver('approved')).token, body: onboardingBody() }), 'driver_not_linked');
  });

  test('422 invalid_cpf e 422 cnh_without_ear, nessa ordem, e nada gravado', async () => {
    const driver = await linkedDriver();
    assertRefused(await call('PUT', '/v1/driver/onboarding', { token: driver.token, body: onboardingBody({ cpf: '111.111.111-11', ear: false }) }), 'invalid_cpf');
    assertRefused(await call('PUT', '/v1/driver/onboarding', { token: driver.token, body: onboardingBody({ cpf: '529.982.247-24' }) }), 'invalid_cpf');
    assertRefused(await call('PUT', '/v1/driver/onboarding', { token: driver.token, body: onboardingBody({ ear: false }) }), 'cnh_without_ear');
    assert.equal((await owner.query(`SELECT cpf FROM drivers WHERE account_id = $1`, [driver.accountId])).rows[0].cpf, null);
  });

  test('200: CPF normalizado e texto aparado no banco; a resposta não devolve CPF, CNH nem endereço', async () => {
    const driver = await linkedDriver();
    const cpf = randomCpf();
    const body = onboardingBody({ cpf: masked(cpf) });
    const reply = await call('PUT', '/v1/driver/onboarding', { token: driver.token, body });
    assert.equal(reply.status, 200, reply.raw);
    assert.deepEqual(reply.body.data, { status: 'pending_documents' });
    for (const secret of [cpf, body.cnh.number, 'Mossoró', '59020090']) assert.ok(!reply.raw.includes(secret), `resposta vazou ${secret}`);
    const row = await owner.query(`SELECT cpf, address_street, address_complement, cnh_category FROM drivers WHERE account_id = $1`, [driver.accountId]);
    assert.deepEqual(row.rows[0], { cpf, address_street: 'Rua Mossoró', address_complement: 'Apto 3', cnh_category: 'B' });
  });

  test('409 cpf_locked: CPF já informado não troca (o mesmo CPF passa, e o endereço muda livre)', async () => {
    const driver = await profiledDriver();
    assertRefused(await call('PUT', '/v1/driver/onboarding', { token: driver.token, body: onboardingBody({ cpf: randomCpf() }) }), 'cpf_locked');
    const same = await call('PUT', '/v1/driver/onboarding', { token: driver.token, body: onboardingBody({ cpf: driver.cpf, street: 'Avenida Hermes da Fonseca' }) });
    assert.equal(same.status, 200, same.raw);
    const row = await owner.query(`SELECT cpf, address_street FROM drivers WHERE account_id = $1`, [driver.accountId]);
    assert.deepEqual(row.rows[0], { cpf: driver.cpf, address_street: 'Avenida Hermes da Fonseca' });
  });

  test('409 cpf_in_use: o CPF de outro motorista vivo é recusado ANTES do índice único, e o CPF não aparece em log nenhum', async () => {
    const first = await profiledDriver();
    const second = await linkedDriver();
    const logStart = logBuffer.length;
    assertRefused(await call('PUT', '/v1/driver/onboarding', { token: second.token, body: onboardingBody({ cpf: masked(first.cpf) }) }), 'cpf_in_use');
    const logs = logBuffer.slice(logStart);
    assert.ok(!logs.includes(first.cpf) && !logs.includes(masked(first.cpf)), 'CPF no log da API');
    assert.ok(!logs.includes('23505'), 'a recusa veio do índice único (o DETAIL com o CPF iria ao log do Postgres)');
  });

  test('409 cnh_locked: com a CNH em análise, e depois de APROVADA, os dados dela não mudam; o mesmo dado passa', async () => {
    const driver = await linkedDriver();
    const body = onboardingBody();
    assert.equal((await call('PUT', '/v1/driver/onboarding', { token: driver.token, body })).status, 200);
    const cnh = await sendDocument(driver, 'cnh');
    const changed = { ...body, cnh: { ...body.cnh, number: digits(11) } };
    assertRefused(await call('PUT', '/v1/driver/onboarding', { token: driver.token, body: changed }), 'cnh_locked');
    await approveDocument(cnh, VALID_UNTIL);
    assertRefused(await call('PUT', '/v1/driver/onboarding', { token: driver.token, body: changed }), 'cnh_locked');
    assertRefused(await call('PUT', '/v1/driver/onboarding', { token: driver.token, body: { ...body, cnh: { ...body.cnh, expiresOn: isoDaysFromNow(2000) } } }), 'cnh_locked');
    const sameCnhNewAddress = await call('PUT', '/v1/driver/onboarding', { token: driver.token, body: { ...body, address: { ...body.address, number: '77' } } });
    assert.equal(sameCnhNewAddress.status, 200, sameCnhNewAddress.raw);
    const row = await owner.query(`SELECT cnh_number, address_number FROM drivers WHERE account_id = $1`, [driver.accountId]);
    assert.deepEqual(row.rows[0], { cnh_number: body.cnh.number, address_number: '77' });
  });

  test('CNH aprovada e VENCIDA não trava mais os dados (renovação)', async () => {
    const driver = await linkedDriver();
    const body = onboardingBody();
    assert.equal((await call('PUT', '/v1/driver/onboarding', { token: driver.token, body })).status, 200);
    const cnh = await sendDocument(driver, 'cnh');
    await approveDocument(cnh, VALID_UNTIL);
    await backdateExpiry(cnh);
    const renewed = await call('PUT', '/v1/driver/onboarding', { token: driver.token, body: { ...body, cnh: { ...body.cnh, expiresOn: isoDaysFromNow(3000) } } });
    assert.equal(renewed.status, 200, renewed.raw);
  });
});

describe('etapa 2: a recusa de CPF repetido vem da checagem prévia, não do índice único', () => {
  /** Pool que anota todo SQL (o mesmo papel restrito do app), para provar o que NÃO foi executado. */
  function recordingPool(seen: string[]): pg.Pool {
    const record = (sql: unknown) => seen.push(typeof sql === 'string' ? sql : String((sql as { text?: unknown })?.text));
    return {
      query: (sql: never, params?: never) => (record(sql), pool.query(sql, params)),
      connect: async () => {
        const client = await pool.connect();
        return new Proxy(client, {
          get(target, property) {
            if (property === 'query') return (sql: never, params?: never) => (record(sql), target.query(sql, params));
            const value = Reflect.get(target, property) as unknown;
            return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
          },
        });
      },
    } as unknown as pg.Pool;
  }

  test('o UPDATE com o CPF de outro motorista nem chega ao banco (a violação levaria a linha ao log do Postgres)', async () => {
    const first = await profiledDriver();
    const second = await linkedDriver();
    const seen: string[] = [];
    const parsed = parseOnboardingBody(onboardingBody({ cpf: masked(first.cpf) }));
    assert.ok(parsed);
    const outcome = await onboardingService.saveOnboarding(recordingPool(seen), second.accountId, parsed);
    assert.deepEqual(outcome, { kind: 'cpf_in_use' });
    assert.ok(seen.length > 0);
    assert.ok(!seen.some((sql) => /UPDATE\s+drivers/i.test(sql)), seen.join('\n---\n'));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// PUT /v1/driver/vehicle
// ---------------------------------------------------------------------------------------------------------------------

describe('PUT /v1/driver/vehicle', () => {
  test('400 invalid_body: placa fora do padrão, ano fora de 1950..ano seguinte, marca acima de 40', async () => {
    const driver = await linkedDriver();
    for (const body of [
      vehicleBody({ plate: 'AB-1234' }),
      vehicleBody({ year: 1949 }),
      vehicleBody({ year: CURRENT_YEAR + 2 }),
      vehicleBody({ year: 2020.5 }),
      vehicleBody({ brand: 'x'.repeat(41) }),
      vehicleBody({ color: '' }),
      vehicleBody({ brand: 'Fiat\u0000' }),
      vehicleBody({ model: 'Argo\u001b[31m' }),
    ]) {
      assertRefused(await call('PUT', '/v1/driver/vehicle', { token: driver.token, body }), 'invalid_body');
    }
  });

  test('409 driver_not_linked', async () => {
    assertRefused(await call('PUT', '/v1/driver/vehicle', { token: (await newDriver('approved')).token, body: vehicleBody() }), 'driver_not_linked');
  });

  test('200: placa normalizada; mesma placa/marca/modelo/ano = mesmo veículo (só a cor muda)', async () => {
    const driver = await linkedDriver();
    const plate = randomPlate();
    const first = await call('PUT', '/v1/driver/vehicle', { token: driver.token, body: vehicleBody({ plate: `${plate.slice(0, 3).toLowerCase()}-${plate.slice(3)}` }) });
    assert.equal(first.status, 200, first.raw);
    const again = await call('PUT', '/v1/driver/vehicle', { token: driver.token, body: vehicleBody({ plate, color: 'Branco' }) });
    assert.equal(again.body.data.vehicleId, first.body.data.vehicleId);
    const rows = await owner.query(`SELECT plate, color, status FROM vehicles WHERE driver_id = $1`, [driver.accountId]);
    assert.deepEqual(rows.rows, [{ plate, color: 'Branco', status: 'active' }]);
  });

  test('409 plate_in_use: placa ativa de outro motorista', async () => {
    const first = await profiledDriver();
    const second = await linkedDriver();
    assertRefused(await call('PUT', '/v1/driver/vehicle', { token: second.token, body: vehicleBody({ plate: first.plate }) }), 'plate_in_use');
  });

  test('422 vehicle_too_old: idade acima da configuração (driver_settings: 10 anos)', async () => {
    const driver = await linkedDriver();
    assertRefused(await call('PUT', '/v1/driver/vehicle', { token: driver.token, body: vehicleBody({ year: CURRENT_YEAR - 11 }) }), 'vehicle_too_old');
    assert.equal((await call('PUT', '/v1/driver/vehicle', { token: driver.token, body: vehicleBody({ year: CURRENT_YEAR - 10 }) })).status, 200);
  });

  test('outro carro: o anterior fica inativo, os documentos dele saem de uso, e o CRLV volta a faltar', async () => {
    const driver = await profiledDriver();
    const crlv = await sendDocument(driver, 'crlv');
    await approveDocument(crlv, VALID_UNTIL);
    const swap = await call('PUT', '/v1/driver/vehicle', { token: driver.token, body: vehicleBody() });
    assert.equal(swap.status, 200);
    assert.notEqual(swap.body.data.vehicleId, driver.vehicleId);
    assert.equal((await owner.query(`SELECT status FROM vehicles WHERE id = $1`, [driver.vehicleId])).rows[0].status, 'inactive');
    assert.equal((await owner.query(`SELECT status FROM driver_documents WHERE id = $1`, [crlv])).rows[0].status, 'superseded');
    const verification = await call('GET', '/v1/driver/verification', { token: driver.token });
    assert.equal(verification.body.data.requirements.find((r: { typeCode: string }) => r.typeCode === 'crlv').document, undefined);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// GET /v1/driver/verification
// ---------------------------------------------------------------------------------------------------------------------

describe('GET /v1/driver/verification', () => {
  test('só os documentos do PRÓPRIO motorista aparecem (o envio mais novo de outro motorista não vaza)', async () => {
    const driver = await linkedDriver();
    const other = await linkedDriver();
    await sendDocument(other, 'inss');
    await sendDocument(other, 'profile_photo');
    const reply = await call('GET', '/v1/driver/verification', { token: driver.token });
    assert.equal(reply.status, 200);
    for (const requirement of reply.body.data.requirements) assert.equal(requirement.document, undefined, requirement.typeCode);
  });

  test('sem vínculo: not_started, sem exigências', async () => {
    const reply = await call('GET', '/v1/driver/verification', { token: (await newDriver('approved')).token });
    assert.deepEqual(reply.body.data, { status: 'not_started', onboarding: { profileSubmitted: false, vehicleRegistered: false }, requirements: [] });
  });

  test('do vínculo à aprovação: pending_documents → under_review (prazo) → changes_requested (motivo, nunca a nota) → approved → vencido', async () => {
    const driver = await linkedDriver();
    let reply = await call('GET', '/v1/driver/verification', { token: driver.token });
    assert.equal(reply.body.data.status, 'pending_documents');
    assert.deepEqual(reply.body.data.onboarding, { profileSubmitted: false, vehicleRegistered: false });
    assert.deepEqual(
      reply.body.data.requirements.map((r: { typeCode: string; required: boolean; hasExpiry: boolean }) => [r.typeCode, r.required, r.hasExpiry]),
      [['cnh', true, true], ['crlv', true, true], ['criminal_record', true, true], ['inss', true, false], ['profile_photo', true, false]],
    );

    const cpf = randomCpf();
    assert.equal((await call('PUT', '/v1/driver/onboarding', { token: driver.token, body: onboardingBody({ cpf }) })).status, 200);
    assert.equal((await call('PUT', '/v1/driver/vehicle', { token: driver.token, body: vehicleBody() })).status, 200);
    const docs: Record<string, string> = {};
    for (const type of REQUIRED_TYPES) docs[type] = await sendDocument(driver, type);
    const firstSubmitted = await owner.query<{ s: Date }>(`SELECT min(submitted_at) AS s FROM driver_documents WHERE driver_id = $1`, [driver.accountId]);

    reply = await call('GET', '/v1/driver/verification', { token: driver.token });
    assert.equal(reply.body.data.status, 'under_review');
    assert.equal(Date.parse(reply.body.data.reviewDeadline), firstSubmitted.rows[0]!.s.getTime() + 48 * 3_600_000);
    assert.deepEqual(reply.body.data.onboarding, { profileSubmitted: true, vehicleRegistered: true });
    assert.ok(!reply.raw.includes(cpf), 'CPF na verificação');

    const NOTE = `nota-interna-${randomUUID()}`;
    await rejectDocument(docs['inss']!, 'illegible', NOTE);
    reply = await call('GET', '/v1/driver/verification', { token: driver.token });
    assert.equal(reply.body.data.status, 'changes_requested');
    const inss = reply.body.data.requirements.find((r: { typeCode: string }) => r.typeCode === 'inss');
    assert.deepEqual(inss.document, { id: docs['inss'], status: 'rejected', rejection: { code: 'illegible', text: 'A imagem está ilegível. Envie de novo, com boa luz e sem reflexo.' } });
    assert.ok(!reply.raw.includes(NOTE), 'a nota interna do revisor vazou para o app');

    docs['inss'] = await sendDocument(driver, 'inss');
    for (const type of REQUIRED_TYPES) await approveDocument(docs[type]!, HAS_EXPIRY.has(type) ? VALID_UNTIL : null);
    await owner.query(`UPDATE drivers SET status = 'approved' WHERE account_id = $1`, [driver.accountId]);
    reply = await call('GET', '/v1/driver/verification', { token: driver.token });
    assert.equal(reply.body.data.status, 'approved');
    assert.equal(reply.body.data.reviewDeadline, undefined);
    const cnh = reply.body.data.requirements.find((r: { typeCode: string }) => r.typeCode === 'cnh');
    assert.deepEqual(cnh.document, { id: docs['cnh'], status: 'approved', expiresOn: VALID_UNTIL });

    await backdateExpiry(docs['cnh']!);
    reply = await call('GET', '/v1/driver/verification', { token: driver.token });
    const expired = reply.body.data.requirements.find((r: { typeCode: string }) => r.typeCode === 'cnh').document;
    assert.equal(expired.status, 'expired', 'aprovado com a validade passada sai como vencido, antes mesmo da rotina diária');
    assert.equal(reply.body.data.status, 'approved', 'documento vencido NÃO muda o estado do cadastro: bloqueia só ficar online');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// POST /v1/driver/documents/upload-url
// ---------------------------------------------------------------------------------------------------------------------

describe('POST /v1/driver/documents/upload-url', () => {
  const SHA = 'ab'.repeat(32);

  test('400 invalid_body e 413 file_too_large, nessa ordem, antes do vínculo', async () => {
    const unlinked = await newDriver('approved');
    for (const body of [
      {},
      { typeCode: 'cnh', contentType: 'image/gif', sizeBytes: 10, sha256: SHA },
      { typeCode: 'cnh', contentType: 'image/jpeg', sizeBytes: 10, sha256: SHA.toUpperCase() },
      { typeCode: 'cnh', contentType: 'image/jpeg', sizeBytes: 0, sha256: SHA },
      { typeCode: 'cnh', contentType: 'image/jpeg', sizeBytes: 1.5, sha256: SHA },
      { typeCode: '', contentType: 'image/jpeg', sizeBytes: 10, sha256: SHA },
      { typeCode: 'cnh\u0000', contentType: 'image/jpeg', sizeBytes: 10, sha256: SHA },
    ]) {
      assertRefused(await call('POST', '/v1/driver/documents/upload-url', { token: unlinked.token, body }), 'invalid_body');
    }
    assertRefused(
      await call('POST', '/v1/driver/documents/upload-url', { token: unlinked.token, body: { typeCode: 'cnh', contentType: 'application/pdf', sizeBytes: 10 * 1024 * 1024 + 1, sha256: SHA } }),
      'file_too_large',
    );
    assertRefused(await call('POST', '/v1/driver/documents/upload-url', { token: unlinked.token, body: { typeCode: 'cnh', contentType: 'image/jpeg', sizeBytes: 10, sha256: SHA } }), 'driver_not_linked');
  });

  test('422 unknown_document_type (fora da lista vigente) e 409 vehicle_not_registered (CRLV sem veículo)', async () => {
    const driver = await linkedDriver();
    assertRefused(await call('POST', '/v1/driver/documents/upload-url', { token: driver.token, body: { typeCode: 'passaporte', contentType: 'image/jpeg', sizeBytes: 10, sha256: SHA } }), 'unknown_document_type');
    assertRefused(await call('POST', '/v1/driver/documents/upload-url', { token: driver.token, body: { typeCode: 'crlv', contentType: 'image/jpeg', sizeBytes: 10, sha256: SHA } }), 'vehicle_not_registered');
  });

  test('200: URL do armazenamento com validade de 300 s, cabeçalhos assinados, chave sob o prefixo do PRÓPRIO motorista; a URL não vai ao log', async () => {
    const driver = await linkedDriver();
    const logStart = logBuffer.length;
    const reply = await call('POST', '/v1/driver/documents/upload-url', { token: driver.token, body: { typeCode: 'profile_photo', contentType: 'image/png', sizeBytes: 2048, sha256: SHA } });
    assert.equal(reply.status, 200, reply.raw);
    const data = reply.body.data;
    assert.match(data.documentId, /^[0-9a-f-]{36}$/);
    assert.ok(data.uploadUrl.startsWith(`${storage.baseUrl}/o/driver-docs/${driver.accountId}/`));
    assert.equal(data.method, 'PUT');
    assert.deepEqual(Object.keys(data.headers).sort(), ['Content-Length', 'Content-Type', 'x-amz-checksum-sha256']);
    assert.equal(Date.parse(data.expiresAt) - clockMs, 300_000);
    const row = await owner.query(`SELECT status, storage_key, size_bytes, sha256 FROM driver_documents WHERE id = $1`, [data.documentId]);
    assert.deepEqual(row.rows[0], { status: 'awaiting_upload', storage_key: `driver-docs/${driver.accountId}/${data.documentId}.png`, size_bytes: 2048, sha256: SHA });
    const signature = new URL(data.uploadUrl).searchParams.get('X-Local-Signature')!;
    assert.ok(!logBuffer.slice(logStart).includes(signature), 'URL assinada no log');
  });

  test('pedir outra URL do mesmo tipo abandona a anterior: o submit dela é 404', async () => {
    const driver = await linkedDriver();
    const file = fileOf('foto de perfil');
    const body = { typeCode: 'profile_photo', contentType: 'image/jpeg', sizeBytes: file.body.length, sha256: file.sha256 };
    const first = await call('POST', '/v1/driver/documents/upload-url', { token: driver.token, body });
    const second = await call('POST', '/v1/driver/documents/upload-url', { token: driver.token, body });
    assert.equal(second.status, 200);
    assert.equal(await putFile(first.body.data, file.body), 200);
    assertRefused(await call('POST', `/v1/driver/documents/${first.body.data.documentId}/submit`, { token: driver.token }), 'not_found');
  });

  test('409 document_under_review: já há um deste tipo com o revisor', async () => {
    const driver = await linkedDriver();
    await sendDocument(driver, 'inss');
    assertRefused(await call('POST', '/v1/driver/documents/upload-url', { token: driver.token, body: { typeCode: 'inss', contentType: 'image/jpeg', sizeBytes: 10, sha256: SHA } }), 'document_under_review');
  });

  test('429 rate_limited: teto de pedidos por conta por hora (12 neste teste), nada gravado além do teto', async () => {
    const driver = await linkedDriver();
    for (let i = 0; i < 12; i++) {
      const ok = await call('POST', '/v1/driver/documents/upload-url', { token: driver.token, body: { typeCode: 'profile_photo', contentType: 'image/jpeg', sizeBytes: 10 + i, sha256: SHA } });
      assert.equal(ok.status, 200, ok.raw);
    }
    assertRefused(await call('POST', '/v1/driver/documents/upload-url', { token: driver.token, body: { typeCode: 'profile_photo', contentType: 'image/jpeg', sizeBytes: 99, sha256: SHA } }), 'rate_limited');
    assert.equal((await owner.query(`SELECT count(*)::int AS n FROM driver_documents WHERE driver_id = $1`, [driver.accountId])).rows[0].n, 12);
  });

  test('503 unavailable sem armazenamento configurado (falha fechada), sem gravar nada', async () => {
    const driver = await linkedDriver();
    const bare = await buildApp({ logStream: new Writable({ write: (_c, _e, cb) => cb() }), mail: mailbox, documents: null });
    await bare.ready();
    try {
      const reply = await bare.inject({ method: 'POST', url: '/v1/driver/documents/upload-url', headers: { authorization: `Bearer ${driver.token}` }, payload: { typeCode: 'inss', contentType: 'image/jpeg', sizeBytes: 10, sha256: SHA } });
      assert.equal(reply.statusCode, 503);
      assert.equal(JSON.parse(reply.body).error.code, 'unavailable');
    } finally {
      await bare.close();
    }
    assert.equal((await owner.query(`SELECT count(*)::int AS n FROM driver_documents WHERE driver_id = $1`, [driver.accountId])).rows[0].n, 0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// POST /v1/driver/documents/:id/submit
// ---------------------------------------------------------------------------------------------------------------------

describe('POST /v1/driver/documents/:id/submit', () => {
  test('409 upload_missing também quando o objeto existe com OUTRO tamanho, OUTRO hash ou hash desconhecido', async () => {
    const driver = await linkedDriver();
    const file = fileOf('comprovante do INSS');
    const target = await call('POST', '/v1/driver/documents/upload-url', {
      token: driver.token,
      body: { typeCode: 'inss', contentType: 'image/jpeg', sizeBytes: file.body.length, sha256: file.sha256 },
    });
    assert.equal(target.status, 200);
    // O armazenamento local recusa conteúdo diferente do assinado; um provedor S3 sem checksum adicional aceitaria.
    // Por isso a conferência é do servidor, e é ela que se prova aqui, com o que o armazenamento RESPONDE.
    const answering = (info: { sizeBytes: number; sha256Hex: string | null }): DocumentStorage => ({ ...storage, inspect: async () => info });
    for (const info of [
      { sizeBytes: file.body.length + 1, sha256Hex: file.sha256 },
      { sizeBytes: file.body.length, sha256Hex: 'f'.repeat(64) },
      { sizeBytes: file.body.length, sha256Hex: null },
    ]) {
      const outcome = await onboardingService.submitDocument(pool, driver.accountId, target.body.data.documentId, answering(info));
      assert.deepEqual(outcome, { kind: 'upload_missing' }, JSON.stringify(info));
    }
    const ok = await onboardingService.submitDocument(pool, driver.accountId, target.body.data.documentId, answering({ sizeBytes: file.body.length, sha256Hex: file.sha256 }));
    assert.deepEqual(ok, { kind: 'ok' });
  });

  test('200 com o objeto certo; repetir devolve o mesmo 200 (idempotente)', async () => {
    const driver = await linkedDriver();
    const id = await sendDocument(driver, 'inss');
    const again = await call('POST', `/v1/driver/documents/${id}/submit`, { token: driver.token });
    assert.equal(again.status, 200);
    assert.deepEqual(again.body.data, { status: 'submitted' });
    assert.equal((await owner.query(`SELECT status FROM driver_documents WHERE id = $1`, [id])).rows[0].status, 'submitted');
  });

  test('409 upload_missing: nada enviado, ou a URL venceu antes do envio (o armazenamento recusou)', async () => {
    const driver = await linkedDriver();
    const file = fileOf('certidão');
    const body = { typeCode: 'criminal_record', contentType: 'application/pdf', sizeBytes: file.body.length, sha256: file.sha256 };
    const target = await call('POST', '/v1/driver/documents/upload-url', { token: driver.token, body });
    assertRefused(await call('POST', `/v1/driver/documents/${target.body.data.documentId}/submit`, { token: driver.token }), 'upload_missing');
    clockMs += 301_000;
    try {
      assert.equal(await putFile(target.body.data, file.body), 403, 'URL vencida é recusada pelo armazenamento');
    } finally {
      clockMs -= 301_000;
    }
    assertRefused(await call('POST', `/v1/driver/documents/${target.body.data.documentId}/submit`, { token: driver.token }), 'upload_missing');
    assert.equal((await owner.query(`SELECT status FROM driver_documents WHERE id = $1`, [target.body.data.documentId])).rows[0].status, 'awaiting_upload');
  });

  test('404 not_found: documento de OUTRO motorista, id inexistente e id que nem é UUID', async () => {
    const owner1 = await linkedDriver();
    const intruder = await linkedDriver();
    const id = await sendDocument(owner1, 'inss');
    assertRefused(await call('POST', `/v1/driver/documents/${id}/submit`, { token: intruder.token }), 'not_found');
    assertRefused(await call('POST', `/v1/driver/documents/${randomUUID()}/submit`, { token: intruder.token }), 'not_found');
    assertRefused(await call('POST', `/v1/driver/documents/nao-e-uuid'--/submit`, { token: intruder.token }), 'not_found');
  });

  test('409 invalid_transition: documento já decidido pelo revisor', async () => {
    const driver = await linkedDriver();
    const id = await sendDocument(driver, 'inss');
    await approveDocument(id, null);
    assertRefused(await call('POST', `/v1/driver/documents/${id}/submit`, { token: driver.token }), 'invalid_transition');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// PUT /v1/driver/availability
// ---------------------------------------------------------------------------------------------------------------------

describe('PUT /v1/driver/availability (driver_availability_blockers)', () => {
  const POINT = { latitude: -5.8113, longitude: -35.2061 };

  test('desligar sempre funciona (R7), até sem vínculo', async () => {
    const reply = await call('PUT', '/v1/driver/availability', { token: (await newDriver('none')).token, body: { online: false } });
    assert.equal(reply.status, 200, reply.raw);
    assert.deepEqual(reply.body.data, { phase: 'offline' });
  });

  test('400 invalid_body: ligar sem ponto, coordenada fora do intervalo, online não booleano', async () => {
    const driver = await linkedDriver();
    for (const body of [{ online: true }, { online: true, point: { latitude: 91, longitude: 0 } }, { online: 'sim', point: POINT }, {}]) {
      assertRefused(await call('PUT', '/v1/driver/availability', { token: driver.token, body }), 'invalid_body');
    }
  });

  test('409 driver_not_approved: sem vínculo, pendente, e SUSPENSO com documentos em dia', async () => {
    assertRefused(await call('PUT', '/v1/driver/availability', { token: (await newDriver('none')).token, body: { online: true, point: POINT } }), 'driver_not_approved');
    assertRefused(await call('PUT', '/v1/driver/availability', { token: (await linkedDriver()).token, body: { online: true, point: POINT } }), 'driver_not_approved');
    const suspended = await approvedDriver();
    await owner.query(`UPDATE drivers SET status = 'suspended', suspended_by = $2, suspension_reason = 'Teste de suspensão' WHERE account_id = $1`, [suspended.accountId, reviewerId]);
    assertRefused(await call('PUT', '/v1/driver/availability', { token: suspended.token, body: { online: true, point: POINT } }), 'driver_not_approved');
  });

  test('aprovado e em dia: 200 online; documento obrigatório VENCIDO: 409 document_expired (e desligar continua funcionando)', async () => {
    const driver = await approvedDriver();
    const online = await call('PUT', '/v1/driver/availability', { token: driver.token, body: { online: true, point: POINT } });
    assert.equal(online.status, 200, online.raw);
    assert.deepEqual(online.body.data, { phase: 'online' });

    await backdateExpiry(driver.docs['criminal_record']!);
    assertRefused(await call('PUT', '/v1/driver/availability', { token: driver.token, body: { online: true, point: POINT } }), 'document_expired');
    const offline = await call('PUT', '/v1/driver/availability', { token: driver.token, body: { online: false } });
    assert.deepEqual(offline.body.data, { phase: 'offline' });
  });

  test('aceite pendente dos Termos: ligar dá 409 consent_outdated; desligar passa (o portão só vale para online: true)', async () => {
    const driver = await approvedDriver();
    await publishAll(owner, `d4-${randomUUID().slice(0, 8)}`, { audiences: ['driver'] });
    try {
      assertRefused(await call('PUT', '/v1/driver/availability', { token: driver.token, body: { online: true, point: POINT } }), 'consent_outdated');
      const offline = await call('PUT', '/v1/driver/availability', { token: driver.token, body: { online: false } });
      assert.equal(offline.status, 200, offline.raw);
    } finally {
      await resetToBaseline(owner);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Recusa interrompe a rota (lib/early-reply.ts)
// ---------------------------------------------------------------------------------------------------------------------

describe('nenhuma recusa deixou a rota rodar', () => {
  test('o log da suíte inteira não tem "Reply was already sent" nem erro não tratado', async () => {
    await new Promise((resolve) => setImmediate(resolve));
    // Vale também para /v1/auth (cadastro, login das fixtures): um `onSend` ASSÍNCRONO a mais no contexto público fazia
    // as rotas dela, que chamam reply.send() sem devolver nada, enviarem duas vezes (ERR_HTTP_HEADERS_SENT).
    const lines = logBuffer.split(/\r?\n/).filter((line) => line.includes('Reply was already sent'));
    assert.deepEqual(lines.map((line) => line.slice(0, 400)), [], 'um hook recusou e o handler rodou mesmo assim');
    const unhandled = logBuffer.split(/\r?\n/).filter((line) => line.includes('"event":"unhandled_error"'));
    assert.deepEqual(unhandled.map((line) => line.slice(0, 400)), [], 'erro não tratado no log');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Contrato: o catálogo do servidor e o do api-client não divergem
// ---------------------------------------------------------------------------------------------------------------------

describe('catálogo de erros: servidor = api-client (mock e http)', () => {
  test('todo código que estas rotas respondem está no catálogo do api-client com o MESMO status', () => {
    // Lido como TEXTO: `apps/api` não importa outro workspace (Dockerfile standalone).
    const source = readFileSync(new URL('../../../packages/api-client/src/driver/onboarding-types.ts', import.meta.url), 'utf8');
    const clientStatus = new Map<string, number>();
    for (const match of source.matchAll(/^\s{2}([a-z_]+): \{ status: (\d{3}),/gm)) {
      const previous = clientStatus.get(match[1]!);
      const status = Number(match[2]);
      assert.ok(previous === undefined || previous === status, `${match[1]} com status diferente nos dois catálogos do api-client`);
      clientStatus.set(match[1]!, status);
    }
    for (const [code, { status }] of Object.entries(DRIVER_ROUTE_ERRORS)) {
      assert.equal(clientStatus.get(code), status, `${code}: servidor ${status}, api-client ${clientStatus.get(code)}`);
    }
  });
});
