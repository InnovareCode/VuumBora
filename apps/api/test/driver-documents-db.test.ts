/**
 * Documentos do motorista (migração 0024, fatia D1 do plano M3/M4, endurecida pela 0025), no banco real.
 *
 * As regras da 0025 têm cada uma um teste NEGATIVO (o banco recusa) que começa pela recusa: com a 0025 desfeita
 * (docs/sql/rollback/0025_down.sql), a primeira asserção de cada um falha porque a operação passa.
 *
 * O app conecta COMO `vuumbora_api` (helpers/runtime-role-env.ts): `pool` é o papel restrito e `owner` é a credencial
 * dona. Cada regra é provada nas duas camadas quando cabe — privilégio (REVOKE) e gatilho (vale até para o dono).
 *
 * O banco persiste entre execuções: e-mails, CPFs e placas são aleatórios, e o que mexe no catálogo imutável roda numa
 * transação desfeita no fim (nada publicado aqui vaza para outro arquivo).
 */
import './helpers/auth-env.js';
import './helpers/runtime-role-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { after, before, describe, test } from 'node:test';
import { prepararBanco } from '../src/migrate.js';
import { pool, shutdown } from './helpers/harness.js';
import { insertAccount } from './helpers/legal-kit.js';
import { OWNER_DATABASE_URL } from './helpers/runtime-role-env.js';

const owner = new pg.Pool({ connectionString: OWNER_DATABASE_URL, max: 4 });
const SCRUB_HASH = `$2b$04$${'x'.repeat(53)}`;

type Failure = { code?: string; constraint?: string };
/** A promessa tem de falhar com este SQLSTATE (e, se dito, esta restrição): nunca "falhou por qualquer motivo". */
async function rejectsWith(promise: Promise<unknown>, code: string, constraint?: string): Promise<void> {
  await assert.rejects(promise, (err: Failure) => {
    assert.equal(err.code, code, `SQLSTATE esperado ${code}, veio ${err.code}`);
    if (constraint !== undefined) assert.equal(err.constraint, constraint);
    return true;
  });
}

const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
/** CPF válido aleatório (dígitos verificadores certos): o CHECK `drivers_cpf_valid` e o índice único valem. */
function randomCpf(): string {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (d.every((x) => x === d[0])) d[0] = (d[0]! + 1) % 10;
  for (const len of [9, 10]) d.push(((d.slice(0, len).reduce((acc, x, i) => acc + x * (len + 1 - i), 0) * 10) % 11) % 10);
  return d.join('');
}
/** Data ISO daqui a N dias (UTC). Com margem de dias, a diferença de fuso para Natal não importa. */
const isoDaysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** Validade dentro do teto de todo tipo (0025: certidão de antecedentes, o menor, vai até 365 dias). */
const VALID_UNTIL = isoDaysFromNow(300);
const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
const randomPlate = () => `${letters(3)}${digits(1)}${letters(1)}${digits(2)}`;

async function admin(role: string, email = `${role}-${randomUUID().slice(0, 8)}@teste.vuumbora.dev`): Promise<string> {
  const res = await owner.query<{ id: string }>(
    `INSERT INTO admin_users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id`,
    [`Admin ${role}`, email, SCRUB_HASH, role],
  );
  return res.rows[0]!.id;
}

/** Conta de motorista ATIVA; verificada por padrão. Devolve id e e-mail normalizado. */
async function driverAccount(verified = true): Promise<{ id: string; email: string }> {
  const id = await insertAccount(owner, 'driver', 'motorista');
  const res = await owner.query<{ email: string }>(
    `UPDATE accounts SET email_verified_at = CASE WHEN $2 THEN now() END WHERE id = $1 RETURNING email`,
    [id, verified],
  );
  return { id, email: res.rows[0]!.email };
}

async function application(email: string, status: 'pending' | 'approved'): Promise<string> {
  const res = await owner.query<{ id: string }>(
    `INSERT INTO driver_applications (name, email, phone, city, state, status) VALUES ('Motorista de Teste', $1, '84999990000', 'Natal', 'RN', $2) RETURNING id`,
    [email, status],
  );
  return res.rows[0]!.id;
}

const link = async (accountId: string) =>
  (await pool.query<{ result: string; driver_status: string | null }>('SELECT * FROM link_driver_application($1, $2)', [accountId, 'natal'])).rows[0]!;

/** Motorista vinculado PELO PAPEL DA API (o caminho real de N3). */
async function linkedDriver(): Promise<string> {
  const acc = await driverAccount();
  await application(acc.email, 'approved');
  assert.deepEqual(await link(acc.id), { result: 'linked', driver_status: 'pending' });
  return acc.id;
}

async function onboard(driverId: string): Promise<void> {
  await pool.query(
    `UPDATE drivers SET cpf = $2, cnh_number = $3, cnh_category = 'B', cnh_expires_on = current_date + 365,
            address_postal_code = '59020000', address_street = 'Rua de Teste', address_number = '10',
            address_neighborhood = 'Tirol', address_city = 'Natal', address_state = 'RN'
      WHERE account_id = $1`,
    [driverId, randomCpf(), digits(11)],
  );
}

async function addVehicle(driverId: string, plate = randomPlate()): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO vehicles (driver_id, plate, brand, model, manufacture_year, color) VALUES ($1, $2, 'Fiat', 'Argo', 2022, 'Prata') RETURNING id`,
    [driverId, plate],
  );
  return res.rows[0]!.id;
}

/** upload-url: o documento nasce `awaiting_upload` (o gatilho ignora o estado que a aplicação mandar). */
async function upload(driverId: string, typeCode: string, vehicleId: string | null = null, db: Pick<pg.Pool, 'query'> = pool): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO driver_documents (driver_id, type_code, vehicle_id, storage_key, content_type, size_bytes, sha256, status)
     VALUES ($1, $2, $3, $4, 'image/jpeg', 204800, $5, 'approved') RETURNING id`,
    [driverId, typeCode, vehicleId, `driver-docs/${driverId}/${randomUUID()}.jpg`, 'a'.repeat(64)],
  );
  return res.rows[0]!.id;
}

const submit = (id: string) => pool.query(`UPDATE driver_documents SET status = 'submitted' WHERE id = $1`, [id]);
const approve = (id: string, reviewer: string, expiresOn: string | null = null) =>
  pool.query(`UPDATE driver_documents SET status = 'approved', reviewed_by = $2, expires_on = $3::date WHERE id = $1 AND status = 'submitted'`, [id, reviewer, expiresOn]);
const blockers = async (driverId: string) =>
  (await pool.query<{ blocker: string; type_code: string | null }>('SELECT * FROM driver_approval_blockers($1)', [driverId])).rows;

/** Motorista com tudo aprovado (etapa 2, veículo e os 5 documentos da lista federal). */
async function fullyDocumentedDriver(reviewer: string): Promise<{ driverId: string; vehicleId: string; docs: Record<string, string> }> {
  const driverId = await linkedDriver();
  await onboard(driverId);
  const vehicleId = await addVehicle(driverId);
  const docs: Record<string, string> = {};
  for (const type of ['cnh', 'crlv', 'criminal_record', 'inss', 'profile_photo']) {
    const id = await upload(driverId, type, type === 'crlv' ? vehicleId : null);
    await submit(id);
    await approve(id, reviewer, ['cnh', 'crlv', 'criminal_record'].includes(type) ? VALID_UNTIL : null);
    docs[type] = id;
  }
  return { driverId, vehicleId, docs };
}

let reviewer = '';
let support = '';

before(async () => {
  await prepararBanco({ databaseUrl: OWNER_DATABASE_URL, pool: owner, log: () => undefined });
  reviewer = await admin('revisor_documentos');
  support = await admin('suporte');
});
after(async () => {
  await shutdown();
  await owner.end();
});

describe('lista de documentos por cidade, com versão (N1)', () => {
  test('a semente é o mínimo federal, provisório, vigente em Natal, e a API a lê', async () => {
    const rows = (
      await pool.query<{ type_code: string; scope: string; required: boolean; has_expiry: boolean; provisional: boolean }>(
        `SELECT type_code, scope, required, has_expiry, provisional FROM current_document_requirements WHERE city_code = 'natal' ORDER BY sort_order`,
      )
    ).rows;
    assert.deepEqual(rows.map((r) => r.type_code), ['cnh', 'crlv', 'criminal_record', 'inss', 'profile_photo']);
    assert.ok(rows.every((r) => r.required && r.provisional));
    assert.deepEqual(rows.filter((r) => r.scope === 'vehicle').map((r) => r.type_code), ['crlv']);
    const settings = (await pool.query(`SELECT review_sla_hours, max_vehicle_age_years, provisional FROM driver_settings WHERE city_code = 'natal'`)).rows[0];
    assert.deepEqual(settings, { review_sla_hours: 48, max_vehicle_age_years: 10, provisional: true });
    assert.ok((await pool.query(`SELECT count(*)::int AS n FROM document_rejection_reasons WHERE active`)).rows[0].n >= 10);
  });

  test('versão publicada é imutável ATÉ para o dono (gatilho), e catálogo não se trunca', async () => {
    const v = (await owner.query<{ id: string }>(`SELECT version_id AS id FROM current_document_requirements WHERE city_code = 'natal' LIMIT 1`)).rows[0]!.id;
    await rejectsWith(owner.query(`UPDATE document_requirement_versions SET provisional = false WHERE id = $1`, [v]), '42501');
    await rejectsWith(owner.query(`DELETE FROM document_requirement_versions WHERE id = $1`, [v]), '42501');
    await rejectsWith(owner.query(`UPDATE document_requirements SET required = false WHERE version_id = $1`, [v]), '42501');
    await rejectsWith(owner.query(`DELETE FROM document_requirements WHERE version_id = $1`, [v]), '42501');
    await rejectsWith(owner.query(`INSERT INTO document_requirements (version_id, type_code, required, has_expiry, sort_order) VALUES ($1, 'cnh', true, true, 99)`, [v]), '42501');
    for (const table of ['document_requirement_versions', 'document_requirements', 'document_types', 'cities', 'document_rejection_reasons', 'driver_settings']) {
      await rejectsWith(owner.query(`TRUNCATE ${table} CASCADE`), '42501');
    }
  });

  test('a lista da STTU entra como versão nova, sem deploy: rascunho -> itens -> publica -> vira a vigente', async () => {
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      const draft = (await c.query<{ id: string; published_at: Date | null }>(
        `INSERT INTO document_requirement_versions (city_code, version, provisional, source, published_at)
         VALUES ('natal', 'teste-sttu', false, 'Ofício de teste', now() - interval '1 day') RETURNING id, published_at`,
      )).rows[0]!;
      assert.equal(draft.published_at, null, 'toda versão nasce rascunho, mesmo se a aplicação mandar a data');
      // Publicar sem item obrigatório é recusado.
      await c.query('SAVEPOINT s');
      await rejectsWith(c.query(`UPDATE document_requirement_versions SET published_at = now() WHERE id = $1`, [draft.id]), '23514', 'document_requirement_versions_has_required_item');
      await c.query('ROLLBACK TO SAVEPOINT s');
      await c.query(`INSERT INTO document_types (code, label, scope) VALUES ('municipal_inspection', 'Vistoria municipal', 'vehicle')`);
      await c.query(
        `INSERT INTO document_requirements (version_id, type_code, required, has_expiry, sort_order)
         VALUES ($1, 'cnh', true, true, 10), ($1, 'crlv', true, true, 20), ($1, 'municipal_inspection', true, true, 30)`,
        [draft.id],
      );
      await c.query(`UPDATE document_requirement_versions SET published_at = now() WHERE id = $1`, [draft.id]);
      const current = (await c.query<{ version: string; type_code: string }>(`SELECT version, type_code FROM current_document_requirements WHERE city_code = 'natal' ORDER BY sort_order`)).rows;
      assert.deepEqual(current, [
        { version: 'teste-sttu', type_code: 'cnh' },
        { version: 'teste-sttu', type_code: 'crlv' },
        { version: 'teste-sttu', type_code: 'municipal_inspection' },
      ]);
      // Depois de publicada, nem o dono acrescenta item.
      await rejectsWith(c.query(`INSERT INTO document_requirements (version_id, type_code, required, has_expiry, sort_order) VALUES ($1, 'inss', true, false, 40)`, [draft.id]), '42501');
    } finally {
      await c.query('ROLLBACK').catch(() => undefined);
      c.release();
    }
    const after = (await owner.query<{ version: string }>(`SELECT DISTINCT version FROM current_document_requirements WHERE city_code = 'natal'`)).rows;
    assert.deepEqual(after, [{ version: '2026-11-federal' }], 'nada desta prova ficou no banco');
  });
});

describe('vínculo candidatura -> conta (N3)', () => {
  test('só conta de motorista verificada com candidatura APROVADA de mesmo e-mail; idempotente', async () => {
    const unverified = await driverAccount(false);
    await application(unverified.email, 'approved');
    assert.deepEqual(await link(unverified.id), { result: 'email_not_verified', driver_status: null });

    const noApplication = await driverAccount();
    assert.deepEqual(await link(noApplication.id), { result: 'application_not_approved', driver_status: null });

    const pending = await driverAccount();
    await application(pending.email, 'pending');
    assert.deepEqual(await link(pending.id), { result: 'application_not_approved', driver_status: null });

    const passenger = await insertAccount(owner, 'passenger', 'passageiro');
    assert.deepEqual(await link(passenger), { result: 'not_driver_account', driver_status: null });

    const ok = await driverAccount();
    const appId = await application(ok.email, 'approved');
    assert.deepEqual(await link(ok.id), { result: 'linked', driver_status: 'pending' });
    assert.deepEqual(await link(ok.id), { result: 'already_linked', driver_status: 'pending' });
    const row = (await owner.query(`SELECT application_id, city_code, status FROM drivers WHERE account_id = $1`, [ok.id])).rows[0];
    assert.deepEqual(row, { application_id: appId, city_code: 'natal', status: 'pending' });
  });

  test('o gatilho vale fora da função: INSERT direto com candidatura de outro e-mail ou não aprovada é recusado (até pelo dono)', async () => {
    const acc = await driverAccount();
    const other = await application(`outro-${randomUUID().slice(0, 8)}@teste.vuumbora.dev`, 'approved');
    await rejectsWith(owner.query(`INSERT INTO drivers (account_id, application_id, city_code) VALUES ($1, $2, 'natal')`, [acc.id, other]), '23514', 'drivers_application_email_match');
    const mine = await application(acc.email, 'pending');
    await rejectsWith(owner.query(`INSERT INTO drivers (account_id, application_id, city_code) VALUES ($1, $2, 'natal')`, [acc.id, mine]), '23514', 'drivers_application_approved');
    // Aprovação forjada pelo insert: o estado é sempre 'pending'.
    await owner.query(`UPDATE driver_applications SET status = 'approved' WHERE id = $1`, [mine]);
    const ins = await pool.query<{ status: string }>(`INSERT INTO drivers (account_id, application_id, city_code, status) VALUES ($1, $2, 'natal', 'approved') RETURNING status`, [acc.id, mine]);
    assert.equal(ins.rows[0]!.status, 'pending');
  });
});

describe('ciclo do documento e fila de revisão (decisão 9)', () => {
  test('nasce aguardando o arquivo; só revisor/dono decide; decisão gravada não muda; motivo vem da lista fechada', async () => {
    const driverId = await linkedDriver();
    const cnh = await upload(driverId, 'cnh');
    const born = (await pool.query(`SELECT status, submitted_at, reviewed_by FROM driver_documents WHERE id = $1`, [cnh])).rows[0];
    assert.deepEqual(born, { status: 'awaiting_upload', submitted_at: null, reviewed_by: null });

    await rejectsWith(pool.query(`UPDATE driver_documents SET status = 'approved', reviewed_by = $2 WHERE id = $1`, [cnh, reviewer]), '23514', 'driver_documents_status_transition');
    await submit(cnh);
    const queued = await pool.query(`SELECT 1 FROM driver_documents WHERE status = 'submitted' AND id = $1 AND submitted_at IS NOT NULL`, [cnh]);
    assert.equal(queued.rowCount, 1, 'entrou na fila com data de envio do banco');

    await rejectsWith(approve(cnh, support), '42501', 'driver_documents_reviewer_role');
    await rejectsWith(pool.query(`UPDATE driver_documents SET status = 'rejected', reviewed_by = $2, rejection_code = 'inventado' WHERE id = $1`, [cnh, reviewer]), '23503');
    await rejectsWith(pool.query(`UPDATE driver_documents SET status = 'rejected', reviewed_by = $2 WHERE id = $1`, [cnh, reviewer]), '23514', 'driver_documents_rejected_has_reason');
    await pool.query(`UPDATE driver_documents SET status = 'rejected', reviewed_by = $2, rejection_code = 'illegible', review_note = 'reflexo no canto' WHERE id = $1`, [cnh, reviewer]);

    // A decisão é a trilha: nem a API nem o dono a reescrevem.
    for (const db of [pool, owner]) {
      await rejectsWith(db.query(`UPDATE driver_documents SET rejection_code = 'other' WHERE id = $1`, [cnh]), '42501');
      await rejectsWith(db.query(`UPDATE driver_documents SET reviewed_by = $2 WHERE id = $1`, [cnh, support]), '42501');
      await rejectsWith(db.query(`UPDATE driver_documents SET status = 'approved' WHERE id = $1`, [cnh]), '23514', 'driver_documents_status_transition');
    }
    // Reenvio: documento novo; o recusado fica como histórico.
    const again = await upload(driverId, 'cnh');
    await submit(again);
    await approve(again, reviewer, VALID_UNTIL);
    await rejectsWith(pool.query(`UPDATE driver_documents SET storage_key = 'driver-docs/trocado.jpg' WHERE id = $1`, [again]), '42501');
    await rejectsWith(pool.query(`UPDATE driver_documents SET expires_on = '2199-01-01' WHERE id = $1`, [again]), '42501');
    const hist = (await pool.query(`SELECT status FROM driver_documents WHERE driver_id = $1 ORDER BY created_at`, [driverId])).rows.map((r) => r.status);
    assert.deepEqual(hist, ['rejected', 'approved']);
  });

  test('tipo fora da lista vigente, CRLV sem veículo e documento pessoal com veículo são recusados', async () => {
    const driverId = await linkedDriver();
    await owner.query(`INSERT INTO document_types (code, label, scope) VALUES ('fora_da_lista', 'Fora da lista', 'driver') ON CONFLICT DO NOTHING`);
    await rejectsWith(upload(driverId, 'fora_da_lista'), '23514', 'driver_documents_type_in_current_list');
    await rejectsWith(upload(driverId, 'crlv'), '23514', 'driver_documents_vehicle_scope');
    const vehicleId = await addVehicle(driverId);
    await rejectsWith(upload(driverId, 'cnh', vehicleId), '23514', 'driver_documents_vehicle_scope');
    // Veículo de OUTRO motorista: a FK composta recusa.
    const other = await linkedDriver();
    await rejectsWith(upload(other, 'crlv', vehicleId), '23503', 'driver_documents_vehicle_fk');
  });
});

describe('aprovação do motorista (N4) e regra de disponibilidade', () => {
  test('approved só quando a lista vigente está satisfeita; o banco recusa antes disso', async () => {
    const driverId = await linkedDriver();
    assert.deepEqual((await blockers(driverId)).map((b) => b.blocker), [
      'onboarding_incomplete', 'no_active_vehicle',
      'document_missing', 'document_missing', 'document_missing', 'document_missing', 'document_missing',
    ]);
    await rejectsWith(pool.query(`UPDATE drivers SET status = 'approved' WHERE account_id = $1`, [driverId]), '23514', 'drivers_approval_blocked');

    const { driverId: ready } = await fullyDocumentedDriver(reviewer);
    assert.deepEqual(await blockers(ready), []);
    const ok = await pool.query<{ status: string; approved: boolean }>(
      `UPDATE drivers SET status = 'approved' WHERE account_id = $1 AND status = 'pending' RETURNING status, approved_at IS NOT NULL AS approved`,
      [ready],
    );
    assert.deepEqual(ok.rows[0], { status: 'approved', approved: true });
  });

  test('outro carro: o CRLV antigo deixa de valer; placa não troca na mesma linha', async () => {
    const { driverId, vehicleId } = await fullyDocumentedDriver(reviewer);
    await rejectsWith(pool.query(`UPDATE vehicles SET plate = $2 WHERE id = $1`, [vehicleId, randomPlate()]), '42501');
    await pool.query(`UPDATE vehicles SET status = 'inactive' WHERE id = $1`, [vehicleId]);
    await addVehicle(driverId);
    assert.deepEqual(await blockers(driverId), [{ blocker: 'document_missing', type_code: 'crlv' }]);
    await rejectsWith(pool.query(`UPDATE vehicles SET status = 'active' WHERE id = $1`, [vehicleId]), '23514', 'vehicles_status_transition');
  });

  test('documento vencido vira bloqueio document_expired e pode passar a expired; não se aprova já vencido', async () => {
    const { driverId, docs } = await fullyDocumentedDriver(reviewer);
    await rejectsWith(pool.query(`UPDATE driver_documents SET status = 'expired' WHERE id = $1`, [docs['cnh']]), '23514', 'driver_documents_expired_after_date');
    // Viagem no tempo só na fixture (dono, gatilhos desligados nesta transação).
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SET LOCAL session_replication_role = replica`);
      await c.query(`UPDATE driver_documents SET expires_on = current_date - 2 WHERE id = $1`, [docs['cnh']]);
      await c.query('COMMIT');
    } finally {
      c.release();
    }
    assert.deepEqual(await blockers(driverId), [{ blocker: 'document_expired', type_code: 'cnh' }]);
    await pool.query(`UPDATE driver_documents SET status = 'expired' WHERE id = $1`, [docs['cnh']]);
    assert.deepEqual(await blockers(driverId), [{ blocker: 'document_expired', type_code: 'cnh' }]);

    const late = await upload(driverId, 'cnh');
    await submit(late);
    await rejectsWith(approve(late, reviewer, '2000-01-01'), '23514', 'driver_documents_not_expired_on_approval');
  });
});

describe('o papel da API não apaga documento nem altera a trilha de auditoria', () => {
  test('DELETE de documento, motorista e veículo: 42501; trilha (admin_audit_log) só recebe linha nova', async () => {
    const { driverId, vehicleId, docs } = await fullyDocumentedDriver(reviewer);
    await rejectsWith(pool.query(`DELETE FROM driver_documents WHERE id = $1`, [docs['cnh']]), '42501');
    await rejectsWith(pool.query(`DELETE FROM driver_documents WHERE driver_id = $1`, [driverId]), '42501');
    await rejectsWith(pool.query(`DELETE FROM vehicles WHERE id = $1`, [vehicleId]), '42501');
    await rejectsWith(pool.query(`DELETE FROM drivers WHERE account_id = $1`, [driverId]), '42501');
    // Nem o dono apaga documento EM USO (camada do gatilho).
    await rejectsWith(owner.query(`DELETE FROM driver_documents WHERE id = $1`, [docs['cnh']]), '42501');

    // Visualização auditada (N5): a API acrescenta; não reescreve nem apaga.
    const audit = await pool.query<{ id: string }>(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id) VALUES ($1, 'driver_document.view_url', 'driver_document', $2) RETURNING id`,
      [reviewer, docs['cnh']],
    );
    const auditId = audit.rows[0]!.id;
    await rejectsWith(pool.query(`UPDATE admin_audit_log SET action = 'adulterado' WHERE id = $1`, [auditId]), '42501');
    await rejectsWith(pool.query(`DELETE FROM admin_audit_log WHERE id = $1`, [auditId]), '42501');
    await rejectsWith(pool.query(`TRUNCATE admin_audit_log`), '42501');
    const still = await owner.query(`SELECT action FROM admin_audit_log WHERE id = $1`, [auditId]);
    assert.deepEqual(still.rows, [{ action: 'driver_document.view_url' }]);
    assert.equal((await owner.query(`SELECT count(*)::int AS n FROM driver_documents WHERE driver_id = $1`, [driverId])).rows[0].n, 5);
  });

  test('nenhuma coluna binária no banco: o arquivo mora no armazenamento de objetos', async () => {
    const bin = await owner.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'bytea'`);
    assert.deepEqual(bin.rows, []);
  });
});

describe('exclusão de conta de motorista (delete_account, 0022 estendida)', () => {
  test('apaga CPF, CNH e endereço, inativa o veículo, retira os documentos e libera o CPF', async () => {
    const { driverId, vehicleId } = await fullyDocumentedDriver(reviewer);
    await pool.query(`UPDATE drivers SET status = 'approved' WHERE account_id = $1`, [driverId]);
    const cpf = (await owner.query<{ cpf: string }>(`SELECT cpf FROM drivers WHERE account_id = $1`, [driverId])).rows[0]!.cpf;

    const res = await pool.query<{ r: string }>('SELECT delete_account($1, $2) AS r', [driverId, SCRUB_HASH]);
    assert.equal(res.rows[0]!.r, 'ok');
    const d = (await owner.query(`SELECT status, cpf, cnh_number, address_street FROM drivers WHERE account_id = $1`, [driverId])).rows[0];
    assert.deepEqual(d, { status: 'deleted', cpf: null, cnh_number: null, address_street: null });
    assert.equal((await owner.query(`SELECT status FROM vehicles WHERE id = $1`, [vehicleId])).rows[0].status, 'inactive');
    const docs = (await owner.query(`SELECT DISTINCT status FROM driver_documents WHERE driver_id = $1`, [driverId])).rows;
    assert.deepEqual(docs, [{ status: 'withdrawn' }], 'saíram da fila e ficam marcados para o descarte do objeto');
    await rejectsWith(pool.query(`UPDATE drivers SET status = 'pending' WHERE account_id = $1`, [driverId]), '42501');

    // O CPF voltou a ser livre (a regra "um CPF, um motorista" vale entre contas vivas).
    const next = await linkedDriver();
    await pool.query(`UPDATE drivers SET cpf = $2 WHERE account_id = $1`, [next, cpf]);
    await rejectsWith(pool.query(`UPDATE drivers SET cpf = $2 WHERE account_id = $1`, [next, randomCpf()]), '23514', 'drivers_cpf_immutable');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 0025: endurecimento. Cada teste começa pela recusa que a 0025 introduz.
// ---------------------------------------------------------------------------------------------------------------

const availability = async (driverId: string) =>
  (await pool.query<{ blocker: string; type_code: string | null }>('SELECT * FROM driver_availability_blockers($1)', [driverId])).rows;
const approveDriver = (driverId: string) => pool.query(`UPDATE drivers SET status = 'approved' WHERE account_id = $1 AND status = 'pending'`, [driverId]);
const suspendDriver = (driverId: string, by: string) =>
  pool.query(`UPDATE drivers SET status = 'suspended', suspended_by = $2, suspension_reason = 'Queixa em análise' WHERE account_id = $1`, [driverId, by]);
const reinstateDriver = (driverId: string, by: string | null) =>
  pool.query(`UPDATE drivers SET status = 'approved', reinstated_by = $2 WHERE account_id = $1`, [driverId, by]);

/** Muda uma linha sem passar pelos gatilhos (dono, só nesta transação): simula dado gravado antes da regra. */
async function legacyRowFixture(sql: string, params: unknown[]): Promise<void> {
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL session_replication_role = replica`);
    await c.query(sql, params);
    await c.query('COMMIT');
  } finally {
    c.release();
  }
}

describe('0025: validade do documento (obrigatória, com teto, só de tipo da lista vigente)', () => {
  test('tipo com validade não se aprova sem data; tipo sem validade, sim', async () => {
    const driverId = await linkedDriver();
    const cnh = await upload(driverId, 'cnh');
    await submit(cnh);
    await rejectsWith(approve(cnh, reviewer, null), '23514', 'driver_documents_expiry_required');
    await approve(cnh, reviewer, VALID_UNTIL);

    const inss = await upload(driverId, 'inss');
    await submit(inss);
    await approve(inss, reviewer, null);
    const rows = (await pool.query(`SELECT type_code, status FROM driver_documents WHERE id = ANY($1) ORDER BY type_code`, [[cnh, inss]])).rows;
    assert.deepEqual(rows, [{ type_code: 'cnh', status: 'approved' }, { type_code: 'inss', status: 'approved' }]);
  });

  test('aprovado sem data não satisfaz tipo que exige validade (linha gravada antes da regra)', async () => {
    const { driverId, docs } = await fullyDocumentedDriver(reviewer);
    assert.deepEqual(await blockers(driverId), []);
    await legacyRowFixture(`UPDATE driver_documents SET expires_on = NULL WHERE id = $1`, [docs['cnh']]);
    assert.deepEqual(await blockers(driverId), [{ blocker: 'document_missing', type_code: 'cnh' }]);
    await rejectsWith(approveDriver(driverId), '23514', 'drivers_approval_blocked');
  });

  test('validade além do teto do tipo é recusada (ex.: ano digitado errado)', async () => {
    const driverId = await linkedDriver();
    const cnh = await upload(driverId, 'cnh');
    await submit(cnh);
    await rejectsWith(approve(cnh, reviewer, '2099-12-31'), '23514', 'driver_documents_expiry_within_limit');
    const record = await upload(driverId, 'criminal_record');
    await submit(record);
    await rejectsWith(approve(record, reviewer, isoDaysFromNow(400)), '23514', 'driver_documents_expiry_within_limit');

    await approve(cnh, reviewer, isoDaysFromNow(9 * 365));
    await approve(record, reviewer, isoDaysFromNow(200));
    const n = (await pool.query(`SELECT count(*)::int AS n FROM driver_documents WHERE id = ANY($1) AND status = 'approved'`, [[cnh, record]])).rows[0].n;
    assert.equal(n, 2);
  });

  test('documento de tipo que saiu da lista vigente não é aprovado', async () => {
    const driverId = await linkedDriver();
    const inss = await upload(driverId, 'inss');
    await submit(inss);
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      const v = (await c.query<{ id: string }>(
        `INSERT INTO document_requirement_versions (city_code, version, provisional, source) VALUES ('natal', 'teste-sem-inss', false, 'Ofício de teste') RETURNING id`,
      )).rows[0]!.id;
      await c.query(`INSERT INTO document_requirements (version_id, type_code, required, has_expiry, sort_order) VALUES ($1, 'cnh', true, true, 10)`, [v]);
      await c.query(`UPDATE document_requirement_versions SET published_at = now() WHERE id = $1`, [v]);
      await rejectsWith(
        c.query(`UPDATE driver_documents SET status = 'approved', reviewed_by = $2 WHERE id = $1`, [inss, reviewer]),
        '23514', 'driver_documents_type_in_current_list',
      );
    } finally {
      await c.query('ROLLBACK').catch(() => undefined);
      c.release();
    }
    // Com a lista federal de volta (a versão de teste foi desfeita), o mesmo documento é aprovado.
    await approve(inss, reviewer, null);
    assert.equal((await pool.query(`SELECT status FROM driver_documents WHERE id = $1`, [inss])).rows[0].status, 'approved');
  });
});

describe('0025: ninguém decide sobre o próprio cadastro de motorista', () => {
  test('o revisor com o e-mail da conta do motorista não aprova, não recusa, não suspende nem reativa', async () => {
    const { driverId, docs } = await fullyDocumentedDriver(reviewer);
    const email = (await owner.query<{ email: string }>(`SELECT email FROM accounts WHERE id = $1`, [driverId])).rows[0]!.email;
    // Mesmo e-mail com caixa diferente: a comparação normaliza.
    const self = await admin('revisor_documentos', email.toUpperCase());

    // Reenvio da certidão (a aprovada sai antes, como a aplicação faz).
    await pool.query(`UPDATE driver_documents SET status = 'superseded' WHERE id = $1`, [docs['criminal_record']]);
    const again = await upload(driverId, 'criminal_record');
    await submit(again);
    await rejectsWith(approve(again, self, VALID_UNTIL), '42501', 'driver_documents_reviewer_not_self');
    await rejectsWith(
      pool.query(`UPDATE driver_documents SET status = 'rejected', reviewed_by = $2, rejection_code = 'illegible' WHERE id = $1`, [again, self]),
      '42501', 'driver_documents_reviewer_not_self',
    );
    await approve(again, reviewer, VALID_UNTIL);

    await approveDriver(driverId);
    await rejectsWith(suspendDriver(driverId, self), '42501', 'drivers_actor_not_self');
    await suspendDriver(driverId, reviewer);
    await rejectsWith(reinstateDriver(driverId, self), '42501', 'drivers_actor_not_self');
    await reinstateDriver(driverId, reviewer);
  });
});

describe('0025: suspensão com autor e trilha; disponibilidade olha o status', () => {
  test('sair da suspensão exige autor; a suspensão fica na linha e approved_at guarda a primeira aprovação', async () => {
    const { driverId } = await fullyDocumentedDriver(reviewer);
    await approveDriver(driverId);
    await suspendDriver(driverId, reviewer);
    // A rota que aprova o último documento e faz UPDATE ... status = 'approved' sem filtrar o status não reativa.
    await rejectsWith(pool.query(`UPDATE drivers SET status = 'approved' WHERE account_id = $1`, [driverId]), '42501', 'drivers_reinstater_role');
    await rejectsWith(reinstateDriver(driverId, support), '42501', 'drivers_reinstater_role');
    await rejectsWith(
      pool.query(
        `UPDATE drivers SET status = 'approved', reinstated_by = $2, suspended_at = NULL, suspended_by = NULL, suspension_reason = NULL WHERE account_id = $1`,
        [driverId, reviewer],
      ),
      '42501',
    );

    const before = (await owner.query<{ approved_at: Date; suspended_at: Date }>(`SELECT approved_at, suspended_at FROM drivers WHERE account_id = $1`, [driverId])).rows[0]!;
    await reinstateDriver(driverId, reviewer);
    const row = (await owner.query(
      `SELECT status, approved_at, suspended_at, suspended_by, suspension_reason, reinstated_by, reinstated_at >= suspended_at AS after_suspension
         FROM drivers WHERE account_id = $1`,
      [driverId],
    )).rows[0];
    assert.deepEqual(
      { ...row, approved_at: row.approved_at.getTime(), suspended_at: row.suspended_at.getTime() },
      {
        status: 'approved', approved_at: before.approved_at.getTime(), suspended_at: before.suspended_at.getTime(),
        suspended_by: reviewer, suspension_reason: 'Queixa em análise', reinstated_by: reviewer, after_suspension: true,
      },
    );

    // Suspensão nova substitui a anterior e encerra a reativação.
    await suspendDriver(driverId, reviewer);
    const again = (await owner.query(`SELECT status, reinstated_at, reinstated_by FROM drivers WHERE account_id = $1`, [driverId])).rows[0];
    assert.deepEqual(again, { status: 'suspended', reinstated_at: null, reinstated_by: null });
  });

  test('fora da troca de estado, aprovação e suspensão não se reescrevem, nem pelo dono; aprovar não grava reativação', async () => {
    const { driverId } = await fullyDocumentedDriver(reviewer);
    await approveDriver(driverId);
    await suspendDriver(driverId, reviewer);
    for (const db of [pool, owner]) {
      await rejectsWith(db.query(`UPDATE drivers SET suspension_reason = 'Motivo reescrito' WHERE account_id = $1`, [driverId]), '42501');
      await rejectsWith(db.query(`UPDATE drivers SET suspended_by = $2 WHERE account_id = $1`, [driverId, support]), '42501');
      await rejectsWith(db.query(`UPDATE drivers SET approved_at = now() - interval '1 year' WHERE account_id = $1`, [driverId]), '42501');
    }
    const { driverId: other } = await fullyDocumentedDriver(reviewer);
    await rejectsWith(reinstateDriver(other, reviewer), '42501');
    assert.equal((await owner.query(`SELECT status FROM drivers WHERE account_id = $1`, [other])).rows[0].status, 'pending');
  });

  test('driver_availability_blockers: o status vem primeiro; driver_approval_blockers não o enxerga', async () => {
    assert.deepEqual(await availability(randomUUID()), [{ blocker: 'driver_not_found', type_code: null }]);
    const { driverId, vehicleId } = await fullyDocumentedDriver(reviewer);
    assert.deepEqual(await availability(driverId), [{ blocker: 'driver_not_approved', type_code: null }]);
    await approveDriver(driverId);
    assert.deepEqual(await availability(driverId), []);

    await suspendDriver(driverId, reviewer);
    assert.deepEqual(await blockers(driverId), [], 'a aprovação não olha o status');
    assert.deepEqual(await availability(driverId), [{ blocker: 'driver_suspended', type_code: null }]);

    await pool.query(`UPDATE vehicles SET status = 'inactive' WHERE id = $1`, [vehicleId]);
    assert.deepEqual(await availability(driverId), [
      { blocker: 'driver_suspended', type_code: null },
      { blocker: 'no_active_vehicle', type_code: null },
      { blocker: 'document_missing', type_code: 'crlv' },
    ]);
  });
});

describe('0025: exclusão, chave do arquivo e nota do revisor', () => {
  test('motorista só vira deleted junto com a conta excluída (nem o dono pula a exclusão)', async () => {
    const driverId = await linkedDriver();
    await rejectsWith(pool.query(`UPDATE drivers SET status = 'deleted' WHERE account_id = $1`, [driverId]), '23514', 'drivers_deleted_requires_account_deleted');
    await rejectsWith(owner.query(`UPDATE drivers SET status = 'deleted' WHERE account_id = $1`, [driverId]), '23514', 'drivers_deleted_requires_account_deleted');
    assert.equal((await owner.query(`SELECT status FROM drivers WHERE account_id = $1`, [driverId])).rows[0].status, 'pending');
    assert.equal((await pool.query<{ r: string }>('SELECT delete_account($1, $2) AS r', [driverId, SCRUB_HASH])).rows[0]!.r, 'ok');
    assert.equal((await owner.query(`SELECT status FROM drivers WHERE account_id = $1`, [driverId])).rows[0].status, 'deleted');
  });

  test('a chave do arquivo fica na pasta do próprio motorista', async () => {
    const mine = await linkedDriver();
    const other = await linkedDriver();
    const insert = (key: string) =>
      pool.query(
        `INSERT INTO driver_documents (driver_id, type_code, storage_key, content_type, size_bytes, sha256) VALUES ($1, 'cnh', $2, 'image/jpeg', 1024, $3)`,
        [mine, key, 'b'.repeat(64)],
      );
    await rejectsWith(insert(`driver-docs/${other}/${randomUUID()}.jpg`), '23514', 'driver_documents_storage_key_owner');
    await rejectsWith(insert(`driver-docs/${mine}-x/${randomUUID()}.jpg`), '23514', 'driver_documents_storage_key_owner');
    await rejectsWith(insert(`driver-docs/${randomUUID()}.jpg`), '23514', 'driver_documents_storage_key_owner');
    await insert(`driver-docs/${mine}/${randomUUID()}.jpg`);
  });

  test('nota interna do revisor: sai na retirada e na exclusão da conta; nunca se reescreve', async () => {
    const driverId = await linkedDriver();
    const rejectWithNote = async () => {
      const id = await upload(driverId, 'cnh');
      await submit(id);
      await pool.query(
        `UPDATE driver_documents SET status = 'rejected', reviewed_by = $2, rejection_code = 'data_mismatch', review_note = 'nome diverge' WHERE id = $1`,
        [id, reviewer],
      );
      return id;
    };
    const first = await rejectWithNote();
    await pool.query(`UPDATE driver_documents SET status = 'withdrawn', review_note = NULL WHERE id = $1`, [first]);

    const second = await rejectWithNote();
    await pool.query(`UPDATE driver_documents SET status = 'withdrawn' WHERE id = $1`, [second]);
    await rejectsWith(pool.query(`UPDATE driver_documents SET review_note = 'nota reescrita' WHERE id = $1`, [second]), '42501');
    await rejectsWith(pool.query(`UPDATE driver_documents SET rejection_code = 'other', review_note = NULL WHERE id = $1`, [second]), '42501');

    await rejectWithNote();
    assert.equal((await pool.query<{ r: string }>('SELECT delete_account($1, $2) AS r', [driverId, SCRUB_HASH])).rows[0]!.r, 'ok');
    const left = (await owner.query(
      `SELECT count(*) FILTER (WHERE review_note IS NOT NULL)::int AS notes, count(*) FILTER (WHERE status <> 'withdrawn')::int AS alive,
              count(*) FILTER (WHERE rejection_code IS NOT NULL AND reviewed_by IS NOT NULL)::int AS decisions
         FROM driver_documents WHERE driver_id = $1`,
      [driverId],
    )).rows[0];
    assert.deepEqual(left, { notes: 0, alive: 0, decisions: 3 }, 'a nota sai; motivo e autor da recusa ficam como prova');
  });
});
