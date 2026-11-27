/**
 * Rotina diária de vencimento dos documentos (`services/document-expiry-service.ts`) contra o Postgres REAL, rodando
 * com o papel restrito da API (o mesmo do cron do operador). Relógio CONTROLADO: o instante de referência é fixado pelo
 * teste, e o vencimento de verdade (que o gatilho da 0024 confere pelo relógio do banco) é montado por fixture.
 *
 * A rotina é global (varre o banco todo, que persiste entre execuções): cada teste confere só os e-mails e documentos
 * que ele mesmo criou.
 */
import './helpers/auth-env.js';
import './helpers/runtime-role-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { prepararBanco } from '../src/migrate.js';
import { EmailNotConfiguredError, type MailMessage } from '../src/services/mailer.js';
import { runDocumentExpiry, type DocumentExpiryLog } from '../src/services/document-expiry-service.js';
import { pool, shutdown } from './helpers/harness.js';
import { insertAccount } from './helpers/legal-kit.js';
import { OWNER_DATABASE_URL } from './helpers/runtime-role-env.js';

const owner = new pg.Pool({ connectionString: OWNER_DATABASE_URL, max: 4 });
let reviewerId = '';

const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
function randomCpf(): string {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (d.every((x) => x === d[0])) d[0] = (d[0]! + 1) % 10;
  for (const len of [9, 10]) d.push(((d.slice(0, len).reduce((acc, x, i) => acc + x * (len + 1 - i), 0) * 10) % 11) % 10);
  return d.join('');
}

/** Motorista com a etapa 2 feita (sem documentos). */
async function driver(): Promise<{ id: string; email: string }> {
  const id = await insertAccount(owner, 'driver', 'vencimento');
  const email = (await owner.query<{ email: string }>(`UPDATE accounts SET email_verified_at = now() WHERE id = $1 RETURNING email`, [id])).rows[0]!.email;
  await owner.query(
    `INSERT INTO driver_applications (name, email, phone, city, state, status) VALUES ('Motorista de Teste', $1, '84999990000', 'Natal', 'RN', 'approved')`,
    [email],
  );
  assert.equal((await pool.query<{ result: string }>(`SELECT result FROM link_driver_application($1, 'natal')`, [id])).rows[0]!.result, 'linked');
  await pool.query(
    `UPDATE drivers SET cpf = $2, cnh_number = $3, cnh_category = 'B', cnh_expires_on = current_date + 365, address_postal_code = '59020090',
            address_street = 'Rua A', address_number = '1', address_neighborhood = 'Tirol', address_city = 'Natal', address_state = 'RN'
      WHERE account_id = $1`,
    [id, randomCpf(), digits(11)],
  );
  return { id, email };
}

async function submitted(driverId: string, typeCode: string): Promise<string> {
  const docId = randomUUID();
  await pool.query(
    `INSERT INTO driver_documents (id, driver_id, type_code, storage_key, content_type, size_bytes, sha256) VALUES ($1, $2, $3, $4, 'image/jpeg', 10, $5)`,
    [docId, driverId, typeCode, `driver-docs/${driverId}/${docId}.jpg`, 'c'.repeat(64)],
  );
  await pool.query(`UPDATE driver_documents SET status = 'submitted' WHERE id = $1`, [docId]);
  return docId;
}

/** Documento APROVADO com a validade pedida (tipo de documento pessoal com validade). */
async function approved(driverId: string, expiresOn: string, typeCode = 'criminal_record'): Promise<string> {
  const docId = await submitted(driverId, typeCode);
  const result = await owner.query(
    `UPDATE driver_documents SET status = 'approved', reviewed_by = $2, expires_on = $3::date WHERE id = $1 AND status = 'submitted'`,
    [docId, reviewerId, expiresOn],
  );
  assert.equal(result.rowCount, 1);
  return docId;
}

/** Viagem no tempo SÓ na fixture (dono, gatilhos desligados nesta transação). */
async function setExpiry(documentId: string, sqlExpression: string): Promise<void> {
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL session_replication_role = replica`);
    await c.query(`UPDATE driver_documents SET expires_on = ${sqlExpression} WHERE id = $1`, [documentId]);
    await c.query('COMMIT');
  } finally {
    c.release();
  }
}

const statusOf = async (id: string) => (await owner.query<{ status: string }>(`SELECT status FROM driver_documents WHERE id = $1`, [id])).rows[0]!.status;

function recorder() {
  const sent: MailMessage[] = [];
  const lines: Record<string, unknown>[] = [];
  const log: DocumentExpiryLog = { info: (obj) => lines.push(obj), warn: (obj) => lines.push(obj) };
  return { sent, lines, log, mailer: { send: async (message: MailMessage) => void sent.push(message) } };
}

before(async () => {
  await prepararBanco({ databaseUrl: OWNER_DATABASE_URL, pool: owner, log: () => undefined });
  reviewerId = (await owner.query<{ id: string }>(
    `INSERT INTO admin_users (name, email, password_hash, role) VALUES ('Revisora', $1, $2, 'revisor_documentos') RETURNING id`,
    [`revisora-${randomUUID().slice(0, 8)}@teste.vuumbora.dev`, `$2b$04$${'x'.repeat(53)}`],
  )).rows[0]!.id;
});

after(async () => {
  await owner.end();
  await shutdown();
});

describe('avisos 30 e 7 dias antes, no dia LOCAL da cidade (relógio fixado)', () => {
  // 02:30 UTC de 01/03/2027 ainda é 28/02/2027 em Natal (UTC−3): o dia que conta é o de Natal.
  const NOW = new Date('2027-03-01T02:30:00Z');

  test('só os marcos de 30 e 7 dias (pelo dia de Natal, não o UTC) recebem aviso; quem já mandou a versão nova, não', async () => {
    const thirty = await driver();
    const seven = await driver();
    const utcThirty = await driver();
    const utcSeven = await driver();
    const twentyNine = await driver();
    const renewing = await driver();
    await approved(thirty.id, '2027-03-30');
    await approved(seven.id, '2027-03-07');
    await approved(utcThirty.id, '2027-03-31'); // 30 dias pelo dia UTC (01/03), 31 pelo de Natal
    await approved(utcSeven.id, '2027-03-08');
    await approved(twentyNine.id, '2027-03-29');
    await approved(renewing.id, '2027-03-30');
    await submitted(renewing.id, 'criminal_record');

    const { sent, log, mailer } = recorder();
    const report = await runDocumentExpiry({ pool, mailer, log }, { now: NOW });
    assert.equal(report.ran, true);
    const mine = new Map([thirty, seven, utcThirty, utcSeven, twentyNine, renewing].map((d) => [d.email, d]));
    const ours = sent.filter((message) => mine.has(message.to));
    assert.deepEqual(ours.map((message) => message.to).sort(), [thirty.email, seven.email].sort());
    const toThirty = ours.find((message) => message.to === thirty.email)!;
    assert.match(toThirty.subject, /vence em 30 dias/);
    assert.match(toThirty.text, /"Certidão de antecedentes criminais" do seu cadastro de motorista VuumBora vence em 30\/03\/2027/);
    assert.match(ours.find((message) => message.to === seven.email)!.subject, /vence em 7 dias/);
  });

  test('sem SMTP: nenhum envio, nada falha, e o log tem só contagens (nenhum e-mail, rótulo ou data)', async () => {
    const one = await driver();
    await approved(one.id, '2027-03-07');
    for (const mailer of [null, { send: async () => { throw new EmailNotConfiguredError(['host']); } }]) {
      const lines: Record<string, unknown>[] = [];
      const report = await runDocumentExpiry({ pool, mailer, log: { info: (o) => lines.push(o), warn: (o) => lines.push(o) } }, { now: NOW });
      assert.equal(report.noticesSent, 0);
      assert.ok(report.noticesSkipped >= 1);
      assert.equal(report.noticesSkipped, report.noticesDue);
      const text = JSON.stringify(lines);
      assert.ok(lines.some((line) => line['event'] === 'document_expiry_notices_not_sent' && line['reason'] === 'smtp_not_configured'));
      assert.ok(!text.includes('@') && !text.includes('Certidão') && !text.includes('2027'), text);
    }
  });

  test('falha de envio de um aviso não derruba os outros e não vai para o log com destinatário', async () => {
    const failing = await driver();
    const fine = await driver();
    await approved(failing.id, '2027-03-30');
    await approved(fine.id, '2027-03-30');
    const delivered: string[] = [];
    const lines: Record<string, unknown>[] = [];
    const mailer = {
      send: async (message: MailMessage) => {
        if (message.to === failing.email) throw Object.assign(new Error(`recusado para ${message.to}`), { code: 'EENVELOPE' });
        delivered.push(message.to);
      },
    };
    const report = await runDocumentExpiry({ pool, mailer, log: { info: (o) => lines.push(o), warn: (o) => lines.push(o) } }, { now: NOW });
    assert.ok(report.noticesFailed >= 1);
    assert.ok(delivered.includes(fine.email));
    assert.ok(lines.some((line) => line['event'] === 'document_expiry_notice_failed' && line['errorCode'] === 'EENVELOPE'));
    assert.ok(!JSON.stringify(lines).includes(failing.email));
  });
});

describe('vencimento: aprovado e vencido no dia local passa a expired', () => {
  test('vencido ontem vira expired; o último dia válido (hoje) não; repetir não muda nada; e o motorista não fica online', async () => {
    const d = await driver();
    const yesterday = await approved(d.id, '2027-01-01', 'criminal_record');
    const today = await approved(d.id, '2027-01-01', 'cnh');
    await setExpiry(yesterday, `city_today('natal') - 1`);
    await setExpiry(today, `city_today('natal')`);

    // Relógio de referência 10 dias atrás: pelo dia de ENTÃO, nenhum dos dois venceu.
    const past = await runDocumentExpiry({ pool, mailer: null, log: { info: () => undefined, warn: () => undefined } }, { now: new Date(Date.now() - 10 * 86_400_000) });
    assert.equal(past.ran, true);
    assert.equal(await statusOf(yesterday), 'approved');

    const first = await runDocumentExpiry({ pool, mailer: null, log: { info: () => undefined, warn: () => undefined } });
    assert.ok(first.expired >= 1);
    assert.equal(await statusOf(yesterday), 'expired');
    assert.equal(await statusOf(today), 'approved', 'a validade é o ÚLTIMO dia válido');
    await runDocumentExpiry({ pool, mailer: null, log: { info: () => undefined, warn: () => undefined } });
    assert.equal(await statusOf(yesterday), 'expired');
    const blockers = await pool.query<{ blocker: string; type_code: string }>(`SELECT blocker, type_code FROM driver_approval_blockers($1)`, [d.id]);
    assert.ok(blockers.rows.some((row) => row.blocker === 'document_expired' && row.type_code === 'criminal_record'));
  });

  test('duas execuções ao mesmo tempo: a segunda desiste (trava consultiva) e não envia nada', async () => {
    const holder = await owner.connect();
    try {
      await holder.query(`SELECT pg_advisory_lock(hashtextextended('vuumbora:document-expiry', 0))`);
      const { sent, lines, log, mailer } = recorder();
      const report = await runDocumentExpiry({ pool, mailer, log });
      assert.deepEqual(report, { ran: false, expired: 0, noticesDue: 0, noticesSent: 0, noticesFailed: 0, noticesSkipped: 0 });
      assert.equal(sent.length, 0);
      assert.ok(lines.some((line) => line['event'] === 'document_expiry_already_running'));
    } finally {
      await holder.query(`SELECT pg_advisory_unlock(hashtextextended('vuumbora:document-expiry', 0))`);
      holder.release();
    }
  });
});
