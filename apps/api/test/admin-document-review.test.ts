/**
 * Revisão de documentos pelo painel (fatia D5 do `docs/plano-m3-m4.md` §3; contrato `DocumentReviewPort` do K0) contra
 * o Postgres REAL, com o app conectando como o papel restrito `vuumbora_api`. Fixtures que a API não escreve
 * (administradores, candidatura) usam a credencial dona.
 *
 * Um teste por erro do catálogo e as regras da D5: papel antes de tudo, autor só da sessão, trilha ANTES da URL de
 * visualização, trilha na MESMA transação da decisão, N4 só para motorista pendente, validade da CNH aprovada no
 * cadastro, suspensão e reativação com autor, conflito de interesse e repetição idempotente.
 */
import './helpers/auth-env.js';
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
import type { AdminRole } from '../src/domain/admin.js';
import { prepararBanco } from '../src/migrate.js';
import type { DocumentStorage } from '../src/lib/document-storage.js';
import { startLocalDocumentStorage, type LocalDocumentStorage } from '../src/lib/document-storage-local.js';
import { DOCUMENT_REVIEW_ROUTE_ERRORS } from '../src/routes/admin-document-review-route.js';
import { startAdminSession } from '../src/services/admin-auth-service.js';
import { pool, send, shutdown } from './helpers/harness.js';
import { ensureBaseline, insertAccount } from './helpers/legal-kit.js';
import { OWNER_DATABASE_URL } from './helpers/runtime-role-env.js';

const owner = new pg.Pool({ connectionString: OWNER_DATABASE_URL, max: 4 });
let storage: LocalDocumentStorage;
let app: FastifyInstance;
let logs = '';

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
const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
const randomPlate = () => `${letters(3)}${digits(1)}${letters(1)}${digits(2)}`;
const isoDaysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const VALID_UNTIL = isoDaysFromNow(300);
const REQUIRED = ['cnh', 'crlv', 'criminal_record', 'inss', 'profile_photo'] as const;
const HAS_EXPIRY = new Set(['cnh', 'crlv', 'criminal_record']);
const SCRUB_HASH = `$2b$04$${'x'.repeat(53)}`;

interface Session { readonly id: string; readonly email: string; readonly cookie: string; readonly csrf: string }

async function session(role: AdminRole, email = `${role}-${randomUUID().slice(0, 8)}@teste.vuumbora.dev`): Promise<Session> {
  const created = await owner.query<{ id: string }>(
    `INSERT INTO admin_users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id`,
    [`Admin ${role}`, email, SCRUB_HASH, role],
  );
  const id = created.rows[0]!.id;
  const grant = await startAdminSession(pool, { id, name: `Admin ${role}`, email, role }, { ttlHours: 1, absoluteTtlHours: 2, ipAddress: '127.0.0.1', userAgent: 'teste' });
  return { id, email, cookie: grant.rawToken, csrf: grant.csrfToken };
}

interface Driver { readonly id: string; readonly email: string; readonly cpf: string; readonly vehicleId: string; readonly docs: Record<string, string> }

/** Motorista vinculado, com etapa 2, veículo e um documento ENVIADO (`submitted`) de cada tipo obrigatório. */
async function driverWithSubmittedDocuments(): Promise<Driver> {
  const id = await insertAccount(owner, 'driver', 'motorista');
  const email = (await owner.query<{ email: string }>(`UPDATE accounts SET email_verified_at = now() WHERE id = $1 RETURNING email`, [id])).rows[0]!.email;
  await owner.query(
    `INSERT INTO driver_applications (name, email, phone, city, state, status) VALUES ('Motorista de Teste', $1, '84999990000', 'Natal', 'RN', 'approved')`,
    [email],
  );
  assert.equal((await pool.query<{ result: string }>(`SELECT result FROM link_driver_application($1, 'natal')`, [id])).rows[0]!.result, 'linked');
  const cpf = randomCpf();
  await pool.query(
    `UPDATE drivers SET cpf = $2, cnh_number = $3, cnh_category = 'B', cnh_expires_on = current_date + 365,
            address_postal_code = '59020090', address_street = 'Rua Mossoró', address_number = '500',
            address_neighborhood = 'Tirol', address_city = 'Natal', address_state = 'RN'
      WHERE account_id = $1`,
    [id, cpf, digits(11)],
  );
  const vehicleId = (await pool.query<{ id: string }>(
    `INSERT INTO vehicles (driver_id, plate, brand, model, manufacture_year, color) VALUES ($1, $2, 'Fiat', 'Argo', 2022, 'Prata') RETURNING id`,
    [id, randomPlate()],
  )).rows[0]!.id;
  const docs: Record<string, string> = {};
  for (const type of REQUIRED) docs[type] = await submittedDocument(id, type, type === 'crlv' ? vehicleId : null);
  return { id, email, cpf, vehicleId, docs };
}

async function submittedDocument(driverId: string, typeCode: string, vehicleId: string | null): Promise<string> {
  const docId = randomUUID();
  await pool.query(
    `INSERT INTO driver_documents (id, driver_id, type_code, vehicle_id, storage_key, content_type, size_bytes, sha256)
     VALUES ($1, $2, $3, $4, $5, 'image/jpeg', 2048, $6)`,
    [docId, driverId, typeCode, vehicleId, `driver-docs/${driverId}/${docId}.jpg`, 'a'.repeat(64)],
  );
  await pool.query(`UPDATE driver_documents SET status = 'submitted' WHERE id = $1`, [docId]);
  return docId;
}

/** Viagem no tempo SÓ na fixture (dono, gatilhos desligados nesta transação). */
async function asOwnerWithoutTriggers(sql: string, params: unknown[]): Promise<void> {
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL session_replication_role = replica`);
    await c.query(sql, params);
    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

const key = () => randomUUID();
const get = (s: Session, url: string) => send(app, 'GET', url, { cookie: s.cookie });
const post = (s: Session, url: string, body: unknown = {}, idempotencyKey: string | null = key()) =>
  send(app, 'POST', url, { cookie: s.cookie, csrf: s.csrf, body, headers: idempotencyKey === null ? {} : { 'idempotency-key': idempotencyKey } });
const approve = (s: Session, documentId: string, expiresOn?: string | null, idempotencyKey: string | null = key()) =>
  post(s, `/documents/${documentId}/approve`, expiresOn === undefined || expiresOn === null ? {} : { expiresOn }, idempotencyKey);

/** Aprova todos os documentos do motorista (N4 leva a `approved`). */
async function approveAll(s: Session, driver: Driver): Promise<void> {
  for (const type of REQUIRED) {
    const reply = await approve(s, driver.docs[type]!, HAS_EXPIRY.has(type) ? VALID_UNTIL : undefined);
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
  }
}

function assertRefused(reply: { status: number; body: any }, code: keyof typeof DOCUMENT_REVIEW_ROUTE_ERRORS | 'forbidden' | 'unauthorized' | 'csrf_token_invalid'): void {
  const status = code === 'forbidden' || code === 'csrf_token_invalid' ? 403 : code === 'unauthorized' ? 401 : DOCUMENT_REVIEW_ROUTE_ERRORS[code].status;
  assert.equal(reply.status, status, `esperado ${status} ${code}, veio ${reply.status} ${JSON.stringify(reply.body)}`);
  assert.equal(reply.body?.error?.code, code, JSON.stringify(reply.body));
}

const auditCount = async (action: string, targetId: string) =>
  (await owner.query<{ n: number }>(`SELECT count(*)::int AS n FROM admin_audit_log WHERE action = $1 AND target_id = $2`, [action, targetId])).rows[0]!.n;

let reviewer: Session;
let dono: Session;

before(async () => {
  await prepararBanco({ databaseUrl: OWNER_DATABASE_URL, pool: owner, log: () => undefined });
  await ensureBaseline(owner);
  storage = await startLocalDocumentStorage();
  app = await buildApp({
    logStream: new Writable({ write: (chunk, _e, cb) => { logs += chunk.toString(); cb(); } }),
    documents: { storage, urlTtlSeconds: 300 },
  });
  await app.ready();
  reviewer = await session('revisor_documentos');
  dono = await session('dono');
});

after(async () => {
  await app.close();
  await storage.close();
  await owner.end();
  await shutdown();
});

// ---------------------------------------------------------------------------------------------------------------------

describe('papéis e CSRF', () => {
  const someId = randomUUID();
  const routes: readonly ['GET' | 'POST', string][] = [
    ['GET', '/document-reviews'],
    ['GET', '/document-rejection-reasons'],
    ['GET', `/drivers/${someId}`],
    ['POST', `/documents/${someId}/view-url`],
    ['POST', `/documents/${someId}/approve`],
    ['POST', `/documents/${someId}/reject`],
    ['POST', `/drivers/${someId}/suspend`],
    ['POST', `/drivers/${someId}/reinstate`],
  ];

  test('suporte, financeiro e operação: 403 forbidden em TODAS as rotas, antes do 404', async () => {
    for (const role of ['suporte', 'financeiro', 'operacao'] as const) {
      const s = await session(role);
      for (const [method, url] of routes) assertRefused(method === 'GET' ? await get(s, url) : await post(s, url), 'forbidden');
    }
  });

  test('sem sessão: 401; mutação sem CSRF: 403 csrf_token_invalid', async () => {
    for (const [method, url] of routes) assertRefused(await send(app, method, url), 'unauthorized');
    for (const [method, url] of routes.filter(([m]) => m === 'POST')) {
      assertRefused(await send(app, method, url, { cookie: reviewer.cookie, body: {}, headers: { 'idempotency-key': key() } }), 'csrf_token_invalid');
    }
  });
});

describe('GET /document-reviews (fila)', () => {
  test('mais antigo primeiro; cursor com microssegundo não perde nem repete documento enviado no MESMO instante; sem CPF', async () => {
    const driver = await driverWithSubmittedDocuments();
    // Os cinco no MESMO instante, num passado único (ficam no começo da fila, em ordem de id): o caso que perde linha
    // quando o cursor trunca o timestamp para milissegundo.
    const old = `2001-01-01 00:00:00.${digits(6)}+00`;
    await asOwnerWithoutTriggers(`UPDATE driver_documents SET submitted_at = $2::timestamptz WHERE driver_id = $1`, [driver.id, old]);
    const mine = new Set(Object.values(driver.docs));
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 500 && seen.filter((id) => mine.has(id)).length < mine.size; page++) {
      const reply = await get(reviewer, `/document-reviews?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      assert.equal(reply.status, 200, JSON.stringify(reply.body));
      assert.equal(reply.body.data.items.length, 1);
      const item = reply.body.data.items[0];
      seen.push(item.documentId);
      if (mine.has(item.documentId)) {
        assert.equal(item.driverId, driver.id);
        assert.equal(item.overdue, true, 'enviado há anos e ainda submitted: prazo vencido');
        assert.ok(!JSON.stringify(reply.body).includes(driver.cpf), 'CPF na fila');
      }
      cursor = reply.body.data.nextCursor;
      if (!cursor) break;
    }
    const ours = seen.filter((id) => mine.has(id));
    assert.deepEqual(ours, [...mine].sort(), 'os cinco, uma vez cada, em ordem de id (desempate do mesmo instante)');
    assert.equal(new Set(seen).size, seen.length, 'nenhum documento repetido entre páginas');
    assert.ok((await owner.query(`SELECT 1 FROM admin_audit_log WHERE admin_id = $1 AND action = 'document_review.listed'`, [reviewer.id])).rowCount! > 0);
  });

  test('400 invalid_body (status, limite) e 400 invalid_cursor', async () => {
    for (const query of ['status=withdrawn', 'status=awaiting_upload', 'limit=0', 'limit=51', 'limit=abc']) assertRefused(await get(reviewer, `/document-reviews?${query}`), 'invalid_body');
    for (const cursor of ['lixo', Buffer.from('2026-01-01T00:00:00.000000Z|nao-uuid').toString('base64url')]) {
      assertRefused(await get(reviewer, `/document-reviews?cursor=${cursor}`), 'invalid_cursor');
    }
  });
});

describe('GET /drivers/:id (detalhe)', () => {
  test('cadastro completo para conferir (CPF, CNH, endereço, nascimento), documentos sem URL, nota interna; auditado e sem cache', async () => {
    const driver = await driverWithSubmittedDocuments();
    const NOTE = `nota-${randomUUID()}`;
    assert.equal((await post(reviewer, `/documents/${driver.docs['inss']}/reject`, { reasonCode: 'illegible', internalNote: NOTE })).status, 200);
    const reply = await get(reviewer, `/drivers/${driver.id}`);
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.equal(reply.headers['cache-control'], 'no-store');
    const data = reply.body.data;
    assert.equal(data.driverId, driver.id);
    assert.equal(data.email, driver.email);
    assert.equal(data.status, 'changes_requested');
    assert.equal(data.profile.cpf, driver.cpf);
    assert.equal(data.profile.birthDate, '1990-05-15');
    assert.deepEqual(data.profile.address, { street: 'Rua Mossoró', number: '500', neighborhood: 'Tirol', city: 'Natal', state: 'RN', postalCode: '59020090' });
    assert.equal(data.profile.cnh.ear, true);
    assert.equal(data.vehicle.vehicleId, driver.vehicleId);
    assert.equal(data.documents.length, 5);
    const inss = data.documents.find((d: { documentId: string }) => d.documentId === driver.docs['inss']);
    assert.equal(inss.internalNote, NOTE);
    assert.deepEqual(inss.rejection, { code: 'illegible', text: 'A imagem está ilegível. Envie de novo, com boa luz e sem reflexo.' });
    assert.ok(!/https?:\/\//.test(JSON.stringify(data.documents)), 'URL de arquivo no detalhe');
    assert.equal(await auditCount('driver.viewed', driver.id), 1);
  });

  test('404 not_found: id inexistente e id que nem é UUID', async () => {
    assertRefused(await get(reviewer, `/drivers/${randomUUID()}`), 'not_found');
    assertRefused(await get(reviewer, `/drivers/nao-e-uuid`), 'not_found');
  });
});

describe('POST /documents/:id/view-url (N5)', () => {
  test('a URL abre o arquivo, vale ≤ 300 s, e cada pedido grava uma linha na trilha', async () => {
    const driver = await driverWithSubmittedDocuments();
    const docId = driver.docs['cnh']!;
    const file = Buffer.from(`cnh ${randomUUID()}`);
    const upload = await storage.presignUpload({ key: `driver-docs/${driver.id}/${docId}.jpg`, contentType: 'image/jpeg', sizeBytes: file.length, sha256Hex: createHash('sha256').update(file).digest('hex'), ttlSeconds: 60 });
    const put = await fetch(upload.url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'x-amz-checksum-sha256': upload.headers['x-amz-checksum-sha256']! }, body: file });
    assert.equal(put.status, 200);
    const before = Date.now();
    const reply = await post(reviewer, `/documents/${docId}/view-url`, {}, null);
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.equal(reply.headers['cache-control'], 'no-store');
    assert.ok(Date.parse(reply.body.data.expiresAt) - before <= 300_000 + 1_000);
    const opened = await fetch(reply.body.data.url);
    assert.deepEqual(Buffer.from(await opened.arrayBuffer()), file);
    await post(reviewer, `/documents/${docId}/view-url`, {}, null);
    assert.equal(await auditCount('document.view_url', docId), 2);
    assert.ok(!logs.includes(new URL(reply.body.data.url).searchParams.get('X-Local-Signature')!), 'URL assinada no log');
  });

  test('a trilha vem ANTES da URL: se a assinatura falhar, a linha da trilha já existe (e a resposta é 503)', async () => {
    const driver = await driverWithSubmittedDocuments();
    const failing: DocumentStorage = { ...storage, presignView: async () => { throw new Error('armazenamento fora'); } };
    const other = await buildApp({ logStream: new Writable({ write: (_c, _e, cb) => cb() }), documents: { storage: failing, urlTtlSeconds: 300 } });
    await other.ready();
    try {
      const reply = await send(other, 'POST', `/documents/${driver.docs['inss']}/view-url`, { cookie: reviewer.cookie, csrf: reviewer.csrf, body: {} });
      assert.equal(reply.status, 503);
    } finally {
      await other.close();
    }
    assert.equal(await auditCount('document.view_url', driver.docs['inss']!), 1);
  });

  test('404: documento inexistente ou ainda não enviado; 503 sem armazenamento', async () => {
    const driver = await driverWithSubmittedDocuments();
    assertRefused(await post(reviewer, `/documents/${randomUUID()}/view-url`, {}, null), 'not_found');
    // Libera a vaga de "um em andamento por tipo" e cria um envio que nunca foi confirmado.
    assert.equal((await approve(reviewer, driver.docs['inss']!)).status, 200);
    const pending = randomUUID();
    await pool.query(
      `INSERT INTO driver_documents (id, driver_id, type_code, storage_key, content_type, size_bytes, sha256) VALUES ($1, $2, 'inss', $3, 'image/jpeg', 10, $4)`,
      [pending, driver.id, `driver-docs/${driver.id}/${pending}.jpg`, 'b'.repeat(64)],
    );
    assertRefused(await post(reviewer, `/documents/${pending}/view-url`, {}, null), 'not_found');
    const bare = await buildApp({ logStream: new Writable({ write: (_c, _e, cb) => cb() }), documents: null });
    await bare.ready();
    try {
      assert.equal((await send(bare, 'POST', `/documents/${driver.docs['cnh']}/view-url`, { cookie: reviewer.cookie, csrf: reviewer.csrf, body: {} })).status, 503);
    } finally {
      await bare.close();
    }
  });
});

describe('POST /documents/:id/approve', () => {
  test('400 idempotency_key_required, 400 invalid_body, 404 not_found', async () => {
    const driver = await driverWithSubmittedDocuments();
    assertRefused(await approve(reviewer, driver.docs['inss']!, undefined, null), 'idempotency_key_required');
    assertRefused(await post(reviewer, `/documents/${driver.docs['cnh']}/approve`, { expiresOn: 20301231 }), 'invalid_body');
    assertRefused(await approve(reviewer, randomUUID()), 'not_found');
  });

  test('422 invalid_expires_on: falta em tipo com validade, já passou, passa do teto, ou sobra em tipo sem validade', async () => {
    const driver = await driverWithSubmittedDocuments();
    for (const expiresOn of [undefined, isoDaysFromNow(-2), '2030-02-30', isoDaysFromNow(366)]) {
      assertRefused(await approve(reviewer, driver.docs['criminal_record']!, expiresOn), 'invalid_expires_on');
    }
    assertRefused(await approve(reviewer, driver.docs['inss']!, VALID_UNTIL), 'invalid_expires_on');
    assert.equal((await owner.query(`SELECT status FROM driver_documents WHERE id = $1`, [driver.docs['criminal_record']])).rows[0].status, 'submitted');
  });

  test('autor SÓ da sessão; validade da CNH vai para o cadastro; trilha na mesma transação', async () => {
    const driver = await driverWithSubmittedDocuments();
    const forged = await post(reviewer, `/documents/${driver.docs['cnh']}/approve`, { expiresOn: VALID_UNTIL, reviewedBy: dono.id, adminId: dono.id });
    assert.equal(forged.status, 200, JSON.stringify(forged.body));
    assert.equal(forged.body.data.status, 'approved');
    assert.equal(forged.body.data.expiresOn, VALID_UNTIL);
    const row = await owner.query(`SELECT reviewed_by FROM driver_documents WHERE id = $1`, [driver.docs['cnh']]);
    assert.equal(row.rows[0].reviewed_by, reviewer.id);
    const cnh = await owner.query(`SELECT to_char(cnh_expires_on, 'YYYY-MM-DD') AS d FROM drivers WHERE account_id = $1`, [driver.id]);
    assert.equal(cnh.rows[0].d, VALID_UNTIL);
    assert.equal(await auditCount('document.approved', driver.docs['cnh']!), 1);
  });

  test('repetição: mesma chave e mesmo corpo = mesma resposta; mesma chave com outro corpo = 409 idempotency_key_reused; outra chave = 409 invalid_transition', async () => {
    const driver = await driverWithSubmittedDocuments();
    const k = key();
    const first = await approve(reviewer, driver.docs['inss']!, undefined, k);
    assert.equal(first.status, 200);
    const again = await approve(reviewer, driver.docs['inss']!, undefined, k);
    assert.equal(again.status, 200);
    assert.deepEqual(again.body.data, first.body.data);
    assertRefused(await approve(reviewer, driver.docs['inss']!, VALID_UNTIL, k), 'idempotency_key_reused');
    assertRefused(await approve(reviewer, driver.docs['inss']!), 'invalid_transition');
    assert.equal(await auditCount('document.approved', driver.docs['inss']!), 1, 'repetição não grava decisão nova');
  });

  test('N4: aprovar o último obrigatório aprova o motorista PENDENTE na mesma transação; suspenso continua suspenso', async () => {
    const pending = await driverWithSubmittedDocuments();
    for (const type of REQUIRED.slice(0, -1)) assert.equal((await approve(reviewer, pending.docs[type]!, HAS_EXPIRY.has(type) ? VALID_UNTIL : undefined)).body.data.driverStatus, 'under_review');
    const last = await approve(reviewer, pending.docs['profile_photo']!);
    assert.equal(last.body.data.driverStatus, 'approved');
    assert.equal((await owner.query(`SELECT status FROM drivers WHERE account_id = $1`, [pending.id])).rows[0].status, 'approved');
    assert.equal(await auditCount('driver.approved', pending.id), 1);

    const suspended = await driverWithSubmittedDocuments();
    assert.equal((await post(reviewer, `/drivers/${suspended.id}/suspend`, { reason: 'Queixa de passageira em análise.' })).status, 200);
    await approveAll(reviewer, suspended);
    assert.equal((await owner.query(`SELECT status FROM drivers WHERE account_id = $1`, [suspended.id])).rows[0].status, 'suspended', 'aprovar documento NÃO tira da suspensão');
  });

  test('renovação: aprovar a CNH nova substitui a aprovada anterior', async () => {
    const driver = await driverWithSubmittedDocuments();
    await approveAll(reviewer, driver);
    const renewed = await submittedDocument(driver.id, 'cnh', null);
    const later = isoDaysFromNow(330);
    assert.equal((await approve(reviewer, renewed, later)).status, 200);
    assert.equal((await owner.query(`SELECT status FROM driver_documents WHERE id = $1`, [driver.docs['cnh']])).rows[0].status, 'superseded');
    assert.equal((await owner.query(`SELECT to_char(cnh_expires_on, 'YYYY-MM-DD') AS d FROM drivers WHERE account_id = $1`, [driver.id])).rows[0].d, later);
  });

  test('403 own_registration: quem tem o e-mail do motorista não decide sobre o cadastro dele', async () => {
    const driver = await driverWithSubmittedDocuments();
    const self = await session('revisor_documentos', driver.email);
    assertRefused(await approve(self, driver.docs['inss']!), 'own_registration');
    assertRefused(await post(self, `/documents/${driver.docs['inss']}/reject`, { reasonCode: 'illegible' }), 'own_registration');
    assertRefused(await post(self, `/drivers/${driver.id}/suspend`, { reason: 'Motivo qualquer de teste.' }), 'own_registration');
  });
});

describe('POST /documents/:id/reject e GET /document-rejection-reasons', () => {
  test('catálogo: os 11 motivos ativos, na ordem', async () => {
    const reply = await get(reviewer, '/document-rejection-reasons');
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body.data.map((r: { code: string }) => r.code), [
      'illegible', 'cropped', 'expired', 'wrong_document', 'data_mismatch', 'cnh_missing_ear', 'cnh_category_not_allowed',
      'photo_not_compliant', 'certificate_not_accepted', 'vehicle_not_compliant', 'other',
    ]);
  });

  test('422 unknown_reason, 400 invalid_body (nota longa ou com caractere de controle), 200 com o motivo; a nota não vai para a trilha', async () => {
    const driver = await driverWithSubmittedDocuments();
    const id = driver.docs['criminal_record']!;
    assertRefused(await post(reviewer, `/documents/${id}/reject`, { reasonCode: 'inventado' }), 'unknown_reason');
    assertRefused(await post(reviewer, `/documents/${id}/reject`, { reasonCode: 'illegible', internalNote: 'x'.repeat(1001) }), 'invalid_body');
    assertRefused(await post(reviewer, `/documents/${id}/reject`, { reasonCode: 'illegible', internalNote: 'nota\u0000' }), 'invalid_body');
    assertRefused(await post(reviewer, `/documents/${id}/reject`, {}), 'invalid_body');
    const NOTE = `nota-sigilosa-${randomUUID()}`;
    const reply = await post(reviewer, `/documents/${id}/reject`, { reasonCode: 'data_mismatch', internalNote: `${NOTE}\nsegunda linha` });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.deepEqual(reply.body.data.rejection, { code: 'data_mismatch', text: 'Os dados não conferem com o seu cadastro (nome, CPF ou placa).' });
    assert.equal(reply.body.data.driverStatus, 'changes_requested');
    const trail = await owner.query<{ t: string }>(`SELECT after::text AS t FROM admin_audit_log WHERE target_id = $1 AND action = 'document.rejected'`, [id]);
    assert.equal(trail.rows.length, 1);
    assert.ok(!trail.rows[0]!.t.includes(NOTE), 'nota interna na trilha');
  });
});

describe('POST /drivers/:id/suspend e /reinstate', () => {
  test('400 validation_failed (curto, longo, controle), 404, 200; suspenso de novo = suspensão original; trilha', async () => {
    const driver = await driverWithSubmittedDocuments();
    for (const reason of ['curto', 'x'.repeat(501), 'Motivo com\u0007sino no meio.']) assertRefused(await post(reviewer, `/drivers/${driver.id}/suspend`, { reason }), 'validation_failed');
    assertRefused(await post(reviewer, `/drivers/${randomUUID()}/suspend`, { reason: 'Motivo válido de teste.' }), 'not_found');
    const first = await post(reviewer, `/drivers/${driver.id}/suspend`, { reason: 'Queixa de passageira em análise.' });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.data.status, 'suspended');
    const again = await post(dono, `/drivers/${driver.id}/suspend`, { reason: 'Outro motivo qualquer aqui.' });
    assert.deepEqual(again.body.data, first.body.data);
    const row = await owner.query(`SELECT suspended_by, suspension_reason FROM drivers WHERE account_id = $1`, [driver.id]);
    assert.deepEqual(row.rows[0], { suspended_by: reviewer.id, suspension_reason: 'Queixa de passageira em análise.' });
    assert.equal(await auditCount('driver.suspended', driver.id), 1);
    // O motivo (texto livre, pode citar a passageira) fica só na linha do motorista, que a exclusão da conta apaga; a
    // trilha é append-only e sobrevive.
    const trail = await owner.query<{ t: string }>(`SELECT after::text AS t FROM admin_audit_log WHERE target_id = $1 AND action = 'driver.suspended'`, [driver.id]);
    assert.ok(!trail.rows[0]!.t.includes('Queixa de passageira'), 'motivo da suspensão na trilha');
    const blockers = await pool.query<{ blocker: string }>(`SELECT blocker FROM driver_availability_blockers($1)`, [driver.id]);
    assert.equal(blockers.rows[0]!.blocker, 'driver_suspended');
  });

  test('reativar: 409 driver_not_suspended; 409 approval_blocked com documento vencido; 200 com autor; repetir devolve a original', async () => {
    const driver = await driverWithSubmittedDocuments();
    assertRefused(await post(reviewer, `/drivers/${driver.id}/reinstate`), 'driver_not_suspended');
    await approveAll(reviewer, driver);
    assertRefused(await post(reviewer, `/drivers/${driver.id}/reinstate`), 'driver_not_suspended');
    assert.equal((await post(reviewer, `/drivers/${driver.id}/suspend`, { reason: 'Documento em conferência.' })).status, 200);

    await asOwnerWithoutTriggers(`UPDATE driver_documents SET expires_on = city_today('natal') - 1 WHERE id = $1`, [driver.docs['criminal_record']]);
    assertRefused(await post(dono, `/drivers/${driver.id}/reinstate`), 'approval_blocked');
    await asOwnerWithoutTriggers(`UPDATE driver_documents SET expires_on = $2::date WHERE id = $1`, [driver.docs['criminal_record'], VALID_UNTIL]);

    assertRefused(await post(dono, `/drivers/${driver.id}/reinstate`, {}, null), 'idempotency_key_required');
    const reinstated = await post(dono, `/drivers/${driver.id}/reinstate`);
    assert.equal(reinstated.status, 200, JSON.stringify(reinstated.body));
    assert.equal(reinstated.body.data.status, 'approved');
    const row = await owner.query(`SELECT status, reinstated_by, suspended_by FROM drivers WHERE account_id = $1`, [driver.id]);
    assert.deepEqual(row.rows[0], { status: 'approved', reinstated_by: dono.id, suspended_by: reviewer.id });
    const again = await post(dono, `/drivers/${driver.id}/reinstate`);
    assert.deepEqual(again.body.data, reinstated.body.data);
    assert.equal(await auditCount('driver.reinstated', driver.id), 1);
  });
});

describe('contrato', () => {
  test('catálogo do servidor = DOCUMENT_REVIEW_ERRORS do api-client (código e status)', () => {
    const source = readFileSync(new URL('../../../packages/api-client/src/admin/types.ts', import.meta.url), 'utf8');
    const start = source.indexOf('export const DOCUMENT_REVIEW_ERRORS');
    const block = source.slice(start, source.indexOf('} as const', start));
    const client = new Map<string, number>([...block.matchAll(/^\s{2}([a-z_]+): \{ status: (\d{3}),/gm)].map((m) => [m[1]!, Number(m[2])]));
    for (const [code, { status }] of Object.entries(DOCUMENT_REVIEW_ROUTE_ERRORS)) assert.equal(client.get(code), status, code);
  });

  test('nenhum envio duplo no log', () => {
    assert.deepEqual(logs.split(/\r?\n/).filter((line) => line.includes('Reply was already sent') || line.includes('"event":"unhandled_error"')), []);
  });
});
