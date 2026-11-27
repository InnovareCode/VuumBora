/**
 * O runner de migração (`src/migrate.ts`, o MESMO do boot e de `npm run migrate`)
 * com VÁRIOS PROCESSOS ao mesmo tempo — réplicas subindo juntas:
 *  1. do zero (o banco nem existe: criação concorrente + TODAS as migrações do diretório),
 *  2. sobre banco já migrado (nada a aplicar, nada muda),
 *  3. UPGRADE de produção: banco parado na 0009 (o que está no ar hoje), COM DADOS,
 *     recebendo 0010 em diante (até a última do diretório) de réplicas concorrentes — os dados sobrevivem e o que a
 *     0013 manda apagar (sessões de dono/financeiro) é o único apagado.
 *  4. 0024 em diante sobre a 0023 com dados do S1: sobe, desce pelos rollbacks (schema volta igual) e sobe de novo.
 *  5. 0025 em diante sobre a 0024 com dados de motorista (aprovado, suspenso, excluído com nota de revisor): sobe sem
 *     perder dado, limpa a nota da conta excluída, desce pelos rollbacks (schema igual ao da 0024) e sobe de novo.
 *
 * Usa um banco descartável por cenário (`..._test`), nunca o banco da suíte.
 * Se a credencial não puder criar banco, os cenários se declaram pulados.
 */
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { after, describe, test } from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, '..', 'migrations');
const CHILD = join(HERE, 'helpers', 'run-migrate.ts');
const FILES = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith('.sql')).sort();

const baseUrl = new URL(process.env['DATABASE_URL']!);
const urlFor = (database: string) => {
  const u = new URL(baseUrl.toString());
  u.pathname = `/${database}`;
  return u.toString();
};
const scratchName = () => `vuumbora_mig_${randomBytes(4).toString('hex')}_test`;

const created: string[] = [];
let canCreate: boolean | null = null;

async function admin<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: urlFor('postgres') });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function ensureCanCreate(): Promise<boolean> {
  if (canCreate !== null) return canCreate;
  try {
    const probe = scratchName();
    await admin((c) => c.query(`CREATE DATABASE "${probe}"`));
    await admin((c) => c.query(`DROP DATABASE "${probe}"`));
    canCreate = true;
  } catch {
    canCreate = false;
  }
  return canCreate;
}

async function inDb<T>(database: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: urlFor(database) });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

interface ChildResult {
  readonly code: number | null;
  readonly report: { ok: boolean; error?: string; lines: string[] };
}

function runChild(database: string): Promise<ChildResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', CHILD], {
      env: { ...process.env, DATABASE_URL: urlFor(database), MIGRATION_DATABASE_URL: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => {
      const line = out.trim().split('\n').filter(Boolean).at(-1) ?? '';
      try {
        resolve({ code, report: JSON.parse(line) });
      } catch {
        reject(new Error(`filho sem relatório JSON (código ${code}): stdout=${out} stderr=${err}`));
      }
    });
  });
}

const runMany = (database: string, n: number) => Promise.all(Array.from({ length: n }, () => runChild(database)));

/** O catálogo do schema public (relações e ACL, colunas, restrições, funções e ACL, gatilhos, índices e comentários). */
const catalogSnapshot = (c: pg.Client) =>
  c.query<{ k: string; v: string }>(`
    SELECT 'rel' AS k, c.relname || ':' || c.relkind::text || ':' || coalesce(c.relacl::text, '') AS v FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace
    UNION ALL SELECT 'col', table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '')
      FROM information_schema.columns WHERE table_schema = 'public'
    UNION ALL SELECT 'con', conrelid::regclass::text || '.' || conname || ':' || pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace = 'public'::regnamespace
    UNION ALL SELECT 'fn', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' || md5(p.prosrc) || ':' || coalesce(p.proacl::text, '')
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
    UNION ALL SELECT 'tg', tgrelid::regclass::text || '.' || tgname FROM pg_trigger WHERE NOT tgisinternal
    UNION ALL SELECT 'idx', pg_get_indexdef(i.indexrelid) FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid WHERE c.relnamespace = 'public'::regnamespace
    UNION ALL SELECT 'cmt', c.relname || ':' || coalesce(obj_description(c.oid, 'pg_class'), '') FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace
    UNION ALL SELECT 'fcmt', p.proname || ':' || coalesce(obj_description(p.oid, 'pg_proc'), '') FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
    ORDER BY 1, 2`);

const rollbackOf = (f: string) => readFileSync(join(HERE, '..', '..', '..', 'docs', 'sql', 'rollback', `${f.slice(0, 4)}_down.sql`), 'utf8');
const applied = (r: ChildResult) => r.report.lines.filter((l) => l.startsWith('[migrate] aplicada: ')).map((l) => l.slice('[migrate] aplicada: '.length));

after(async () => {
  for (const name of created) {
    await admin((c) => c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)).catch(() => undefined);
  }
});

describe('runner de migração com várias réplicas ao mesmo tempo', () => {
  test('DO ZERO: o banco nem existe; 6 processos criam e migram juntos — cada migração entra UMA vez e ninguém falha', async (t) => {
    if (!(await ensureCanCreate())) return t.skip('a credencial não cria banco neste ambiente');
    const db = scratchName();
    created.push(db);

    const results = await runMany(db, 6);
    for (const r of results) assert.ok(r.report.ok && r.code === 0, `um processo falhou: ${r.report.error}\n${r.report.lines.join('\n')}`);

    const everyApplied = results.flatMap(applied).sort();
    assert.deepEqual(everyApplied, [...FILES], 'cada arquivo aparece como aplicado exatamente uma vez, somando todos os processos');

    await inDb(db, async (c) => {
      const rows = (await c.query<{ id: string }>('SELECT id FROM schema_migrations ORDER BY id')).rows.map((r) => r.id);
      assert.deepEqual(rows, [...FILES]);
      const objects = await c.query(`
        SELECT to_regclass('public.waitlist_signups') AS a, to_regclass('public.admin_login_failures') AS b,
               to_regclass('public.admin_enrollment_tokens') AS c, to_regclass('public.account_email_codes') AS d,
               to_regclass('public.email_settings') AS e, to_regclass('public.account_consents') AS f,
               (SELECT count(*) FROM pg_roles WHERE rolname = 'vuumbora_api')::int AS role_exists,
               (SELECT count(*) FROM pg_trigger WHERE tgname IN ('admin_audit_log_no_update_delete', 'admin_audit_log_no_truncate'))::int AS audit_triggers,
               (SELECT count(*) FROM pg_proc WHERE proname IN ('rotate_refresh_token', 'consume_email_code', 'issue_email_code', 'reset_password_with_code'))::int AS fns`);
      const o = objects.rows[0];
      assert.ok(o.a && o.b && o.c && o.d && o.e && o.f, `tabelas das ${FILES.length} migrações existem`);
      assert.equal(o.role_exists, 1);
      assert.equal(o.audit_triggers, 2, 'a trilha de auditoria nasceu inviolável');
      assert.equal(o.fns, 4);
    });
  });

  test('SOBRE BANCO JÁ MIGRADO: 6 processos juntos => nenhuma migração nova, applied_at intacto, ninguém falha', async (t) => {
    if (!(await ensureCanCreate())) return t.skip('a credencial não cria banco neste ambiente');
    const db = scratchName();
    created.push(db);
    const first = await runChild(db);
    assert.ok(first.report.ok, first.report.error);

    const before = await inDb(db, (c) => c.query(`SELECT id, applied_at::text FROM schema_migrations ORDER BY id`));
    const results = await runMany(db, 6);
    for (const r of results) {
      assert.ok(r.report.ok && r.code === 0, `um processo falhou: ${r.report.error}`);
      assert.deepEqual(applied(r), [], 'nada a aplicar');
      assert.ok(r.report.lines.some((l) => l.includes('0 migração(ões) nova(s)')));
    }
    const after = await inDb(db, (c) => c.query(`SELECT id, applied_at::text FROM schema_migrations ORDER BY id`));
    assert.deepEqual(after.rows, before.rows);
  });

  test('UPGRADE COM DADOS: banco na 0009 (produção hoje) recebe 0010 em diante de 4 processos juntos; dados sobrevivem, só as sessões de dono/financeiro caem', async (t) => {
    if (!(await ensureCanCreate())) return t.skip('a credencial não cria banco neste ambiente');
    const db = scratchName();
    created.push(db);
    await admin((c) => c.query(`CREATE DATABASE "${db}"`));

    // Estado de produção na 0009: aplica 0001..0009 do jeito do runner e semeia dados reais.
    const legacy = FILES.filter((f) => f <= '0009_zzz');
    assert.equal(legacy.length, 9);
    const ids = await inDb(db, async (c) => {
      await c.query(`CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      for (const f of legacy) {
        await c.query('BEGIN');
        await c.query(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
        await c.query('INSERT INTO schema_migrations (id) VALUES ($1)', [f]);
        await c.query('COMMIT');
      }
      const mk = async (name: string, role: string) =>
        (await c.query<{ id: string }>(`INSERT INTO admin_users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id`, [name, `${name}@teste.vuumbora.dev`, `$2b$04$${'x'.repeat(53)}`, role])).rows[0]!.id;
      const dono = await mk('dono', 'dono');
      const financeiro = await mk('financeiro', 'financeiro');
      const suporte = await mk('suporte', 'suporte');
      for (const [id, tag] of [[dono, 'a'], [financeiro, 'b'], [suporte, 'c']] as const) {
        await c.query(
          `INSERT INTO admin_sessions (admin_id, token_hash, expires_at, csrf_token) VALUES ($1, $2, now() + interval '1 hour', $3)`,
          [id, tag.repeat(64), `csrf-${tag}`],
        );
        await c.query(`INSERT INTO admin_audit_log (admin_id, action, target_type, target_id) VALUES ($1, 'admin.login', 'admin_user', $2)`, [id, id]);
      }
      for (let i = 0; i < 5; i += 1) await c.query(`INSERT INTO waitlist_signups (email, profile) VALUES ($1, 'passenger')`, [`fila${i}@teste.vuumbora.dev`]);
      await c.query(
        `INSERT INTO driver_applications (name, email, phone, city, state, status, decided_by, decided_at, decision_reason)
         VALUES ('Motorista Um', 'm1@teste.vuumbora.dev', '84999990001', 'Natal', 'RN', 'approved', $1, now(), 'ok')`,
        [dono],
      );
      await c.query(`INSERT INTO driver_applications (name, email, phone, city, state) VALUES ('Motorista Dois', 'm2@teste.vuumbora.dev', '84999990002', 'Natal', 'RN')`);
      return { dono, financeiro, suporte };
    });

    const results = await runMany(db, 4);
    for (const r of results) assert.ok(r.report.ok && r.code === 0, `um processo falhou: ${r.report.error}\n${r.report.lines.join('\n')}`);
    assert.deepEqual(results.flatMap(applied).sort(), FILES.slice(9), `só ${FILES[9]!.slice(0, 4)}..${FILES.at(-1)!.slice(0, 4)} entram, cada uma uma vez`);

    await inDb(db, async (c) => {
      const n = async (sql: string) => (await c.query<{ n: number }>(sql)).rows[0]!.n;
      assert.equal(await n('SELECT count(*)::int AS n FROM waitlist_signups'), 5);
      assert.equal(await n('SELECT count(*)::int AS n FROM driver_applications'), 2);
      assert.equal(await n(`SELECT count(*)::int AS n FROM driver_applications WHERE status = 'approved' AND decided_by IS NOT NULL`), 1);
      assert.equal(await n('SELECT count(*)::int AS n FROM admin_users'), 3);
      assert.equal(await n('SELECT count(*)::int AS n FROM admin_audit_log'), 3, 'a trilha de auditoria não perde linha');
      const sessions = (await c.query<{ admin_id: string }>('SELECT admin_id FROM admin_sessions')).rows.map((r) => r.admin_id);
      assert.deepEqual(sessions, [ids.suporte], 'só a sessão do suporte sobrevive: dono e financeiro precisam logar de novo (agora com 2FA)');
      // O trigger vale sobre as linhas que já existiam.
      await assert.rejects(c.query(`UPDATE admin_audit_log SET action = 'adulterado'`), (e: { code?: string }) => e.code === '42501');
      await assert.rejects(c.query(`DELETE FROM admin_audit_log`), (e: { code?: string }) => e.code === '42501');
      assert.equal(await n('SELECT count(*)::int AS n FROM schema_migrations'), FILES.length);
    });

    const again = await runMany(db, 3);
    for (const r of again) assert.deepEqual(applied(r), []);
  });

  // Generaliza para as próximas: tudo depois da 0023 sobe, e desce pelos rollbacks em ordem inversa (toda migração nova
  // precisa de docs/sql/rollback/NNNN_down.sql, senão este cenário falha ao ler o arquivo).
  test('0024 EM DIANTE SOBRE A 0023 COM DADOS DO S1: sobe por 3 réplicas, o vínculo funciona nos dados antigos, desce pelos rollbacks (schema igual ao da 0023) e sobe de novo', async (t) => {
    if (!(await ensureCanCreate())) return t.skip('a credencial não cria banco neste ambiente');
    const db = scratchName();
    created.push(db);
    await admin((c) => c.query(`CREATE DATABASE "${db}"`));
    const upTo23 = FILES.filter((f) => f <= '0023_zzz');
    assert.equal(upTo23.length, 23);
    const after23 = FILES.slice(23);
    assert.ok(after23[0]?.startsWith('0024_'), 'a 0024 existe');

    const snapshot = catalogSnapshot;

    // Banco na 0023 com dados do S1: candidatura aprovada e conta de motorista verificada de mesmo e-mail (o caso de N3).
    const before = await inDb(db, async (c) => {
      await c.query(`CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      for (const f of upTo23) {
        await c.query('BEGIN');
        await c.query(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
        await c.query('INSERT INTO schema_migrations (id) VALUES ($1)', [f]);
        await c.query('COMMIT');
      }
      const dono = (await c.query<{ id: string }>(`INSERT INTO admin_users (name, email, password_hash, role) VALUES ('dono', 'dono@teste.vuumbora.dev', $1, 'dono') RETURNING id`, [`$2b$04$${'x'.repeat(53)}`])).rows[0]!.id;
      await c.query(`INSERT INTO admin_audit_log (admin_id, action, target_type, target_id) VALUES ($1::uuid, 'admin.login', 'admin_user', $1::text)`, [dono]);
      await c.query(`INSERT INTO driver_applications (name, email, phone, city, state, status, decided_by, decided_at) VALUES ('Motorista Um', 'm1@teste.vuumbora.dev', '84999990001', 'Natal', 'RN', 'approved', $1, now())`, [dono]);
      await c.query(`INSERT INTO driver_applications (name, email, phone, city, state) VALUES ('Motorista Dois', 'm2@teste.vuumbora.dev', '84999990002', 'Natal', 'RN')`);
      await c.query(`INSERT INTO accounts (account_type, email, full_name, birth_date, email_verified_at) VALUES ('driver', 'm1@teste.vuumbora.dev', 'Motorista Um', '1990-01-01', now()), ('passenger', 'p1@teste.vuumbora.dev', 'Passageira', '1992-02-02', now())`);
      await c.query(`INSERT INTO access_log (event) VALUES ('account_deleted')`);
      return (await snapshot(c)).rows;
    });

    const up = await runMany(db, 3);
    for (const r of up) assert.ok(r.report.ok && r.code === 0, `um processo falhou: ${r.report.error}\n${r.report.lines.join('\n')}`);
    assert.deepEqual(up.flatMap(applied).sort(), after23, 'só o que vem depois da 0023 entra, uma vez cada');

    await inDb(db, async (c) => {
      const n = async (sql: string) => (await c.query<{ n: number }>(sql)).rows[0]!.n;
      assert.equal(await n('SELECT count(*)::int AS n FROM driver_applications'), 2, 'candidaturas do S1 intactas');
      assert.equal(await n('SELECT count(*)::int AS n FROM accounts'), 2);
      assert.equal(await n('SELECT count(*)::int AS n FROM admin_audit_log'), 1);
      const driver = (await c.query<{ id: string }>(`SELECT id FROM accounts WHERE account_type = 'driver'`)).rows[0]!.id;
      const linked = await c.query(`SELECT * FROM link_driver_application($1, 'natal')`, [driver]);
      assert.deepEqual(linked.rows, [{ result: 'linked', driver_status: 'pending' }], 'o vínculo funciona sobre a candidatura aprovada que já existia');
      await c.query(`INSERT INTO access_log (event, account_id) VALUES ('driver_application_linked', $1)`, [driver]);

      // Desce (ordem inversa): apaga o que é da 0024 em diante e devolve o schema exatamente ao da 0023, sem tocar no resto.
      for (const f of [...after23].reverse()) await c.query(rollbackOf(f));
      assert.deepEqual((await snapshot(c)).rows, before, 'schema depois do rollback == schema na 0023');
      assert.equal(await n('SELECT count(*)::int AS n FROM driver_applications'), 2);
      assert.equal(await n('SELECT count(*)::int AS n FROM accounts'), 2);
      assert.equal(await n(`SELECT count(*)::int AS n FROM access_log WHERE event = 'account_deleted'`), 1);
      assert.equal(await n('SELECT count(*)::int AS n FROM schema_migrations'), 23);
    });

    const reup = await runMany(db, 2);
    for (const r of reup) assert.ok(r.report.ok && r.code === 0, `reaplicar falhou: ${r.report.error}`);
    assert.deepEqual(reup.flatMap(applied).sort(), after23, 'sobe de novo depois do rollback');
  });

  test('0025 EM DIANTE SOBRE A 0024 COM DADOS DE MOTORISTA: sobe por 3 réplicas sem perder dado, limpa a nota da conta excluída, desce pelos rollbacks (schema igual ao da 0024) e sobe de novo', async (t) => {
    if (!(await ensureCanCreate())) return t.skip('a credencial não cria banco neste ambiente');
    const db = scratchName();
    created.push(db);
    await admin((c) => c.query(`CREATE DATABASE "${db}"`));
    const upTo24 = FILES.filter((f) => f <= '0024_zzz');
    assert.equal(upTo24.length, 24);
    const after24 = FILES.slice(24);
    assert.ok(after24[0]?.startsWith('0025_'), 'a 0025 existe');

    const ids = { kept: '', gone: '', reviewer: '', goneDoc: '' };
    // Banco na 0024 com motoristas: A aprovado com os 5 documentos e depois suspenso; B com documento recusado (com nota
    // interna do revisor) e conta excluída — na 0024 a nota fica no documento retirado.
    const before = await inDb(db, async (c) => {
      await c.query(`CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      for (const f of upTo24) {
        await c.query('BEGIN');
        await c.query(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
        await c.query('INSERT INTO schema_migrations (id) VALUES ($1)', [f]);
        await c.query('COMMIT');
      }
      const hash = `$2b$04$${'x'.repeat(53)}`;
      const one = async (sql: string, params: unknown[] = []) => (await c.query<{ id: string }>(sql, params)).rows[0]!.id;
      const dono = await one(`INSERT INTO admin_users (name, email, password_hash, role) VALUES ('dono', 'dono@teste.vuumbora.dev', $1, 'dono') RETURNING id`, [hash]);
      ids.reviewer = await one(`INSERT INTO admin_users (name, email, password_hash, role) VALUES ('Revisora', 'revisora@teste.vuumbora.dev', $1, 'revisor_documentos') RETURNING id`, [hash]);
      for (const [email, name] of [['ma@teste.vuumbora.dev', 'Motorista A'], ['mb@teste.vuumbora.dev', 'Motorista B']] as const) {
        await c.query(`INSERT INTO driver_applications (name, email, phone, city, state, status, decided_by, decided_at) VALUES ($1, $2, '84999990001', 'Natal', 'RN', 'approved', $3, now())`, [name, email, dono]);
        const id = await one(`INSERT INTO accounts (account_type, email, full_name, birth_date, email_verified_at) VALUES ('driver', $1, $2, '1990-01-01', now()) RETURNING id`, [email, name]);
        assert.deepEqual((await c.query(`SELECT result FROM link_driver_application($1, 'natal')`, [id])).rows, [{ result: 'linked' }]);
        if (email.startsWith('ma')) ids.kept = id;
        else ids.gone = id;
      }
      const doc = (driver: string, type: string, vehicle: string | null = null) =>
        one(
          `INSERT INTO driver_documents (driver_id, type_code, vehicle_id, storage_key, content_type, size_bytes, sha256) VALUES ($1, $2, $3, $4, 'image/jpeg', 2048, repeat('a', 64)) RETURNING id`,
          [driver, type, vehicle, `driver-docs/${driver}/${randomBytes(8).toString('hex')}.jpg`],
        );
      await c.query(
        `UPDATE drivers SET cpf = '52998224725', cnh_number = '12345678901', cnh_category = 'B', cnh_expires_on = current_date + 365,
                address_postal_code = '59020000', address_street = 'Rua de Teste', address_number = '10',
                address_neighborhood = 'Tirol', address_city = 'Natal', address_state = 'RN'
          WHERE account_id = $1`,
        [ids.kept],
      );
      const vehicle = await one(`INSERT INTO vehicles (driver_id, plate, brand, model, manufacture_year, color) VALUES ($1, 'ABC1D23', 'Fiat', 'Argo', 2022, 'Prata') RETURNING id`, [ids.kept]);
      for (const type of ['cnh', 'crlv', 'criminal_record', 'inss', 'profile_photo']) {
        const id = await doc(ids.kept, type, type === 'crlv' ? vehicle : null);
        await c.query(`UPDATE driver_documents SET status = 'submitted' WHERE id = $1`, [id]);
        await c.query(
          `UPDATE driver_documents SET status = 'approved', reviewed_by = $2, expires_on = CASE WHEN $3 THEN current_date + 200 END WHERE id = $1`,
          [id, ids.reviewer, ['cnh', 'crlv', 'criminal_record'].includes(type)],
        );
      }
      await c.query(`UPDATE drivers SET status = 'approved' WHERE account_id = $1`, [ids.kept]);
      await c.query(`UPDATE drivers SET status = 'suspended', suspended_by = $2, suspension_reason = 'Queixa em análise' WHERE account_id = $1`, [ids.kept, ids.reviewer]);

      ids.goneDoc = await doc(ids.gone, 'cnh');
      await c.query(`UPDATE driver_documents SET status = 'submitted' WHERE id = $1`, [ids.goneDoc]);
      await c.query(`UPDATE driver_documents SET status = 'rejected', reviewed_by = $2, rejection_code = 'data_mismatch', review_note = 'nome diverge' WHERE id = $1`, [ids.goneDoc, ids.reviewer]);
      assert.equal((await c.query<{ r: string }>('SELECT delete_account($1, $2) AS r', [ids.gone, hash])).rows[0]!.r, 'ok');
      assert.deepEqual((await c.query(`SELECT status, review_note FROM driver_documents WHERE id = $1`, [ids.goneDoc])).rows, [{ status: 'withdrawn', review_note: 'nome diverge' }]);
      return (await catalogSnapshot(c)).rows;
    });

    const up = await runMany(db, 3);
    for (const r of up) assert.ok(r.report.ok && r.code === 0, `um processo falhou: ${r.report.error}\n${r.report.lines.join('\n')}`);
    assert.deepEqual(up.flatMap(applied).sort(), after24, 'só o que vem depois da 0024 entra, uma vez cada');

    await inDb(db, async (c) => {
      const n = async (sql: string) => (await c.query<{ n: number }>(sql)).rows[0]!.n;
      const counts = async () => [await n('SELECT count(*)::int AS n FROM drivers'), await n('SELECT count(*)::int AS n FROM driver_documents'), await n('SELECT count(*)::int AS n FROM vehicles')];
      assert.deepEqual(await counts(), [2, 6, 1], 'motoristas, documentos e veículo da 0024 intactos');
      const kept = (await c.query(`SELECT status, suspended_by, suspension_reason FROM drivers WHERE account_id = $1`, [ids.kept])).rows[0];
      assert.deepEqual(kept, { status: 'suspended', suspended_by: ids.reviewer, suspension_reason: 'Queixa em análise' });
      assert.deepEqual(
        (await c.query(`SELECT status, review_note, rejection_code FROM driver_documents WHERE id = $1`, [ids.goneDoc])).rows,
        [{ status: 'withdrawn', review_note: null, rejection_code: 'data_mismatch' }],
        'a nota da conta já excluída sai; o motivo fica',
      );
      assert.deepEqual((await c.query(`SELECT blocker FROM driver_availability_blockers($1)`, [ids.kept])).rows, [{ blocker: 'driver_suspended' }]);
      // A suspensão gravada na 0024 só sai com autor.
      await assert.rejects(
        c.query(`UPDATE drivers SET status = 'approved' WHERE account_id = $1`, [ids.kept]),
        (err: { constraint?: string }) => err.constraint === 'drivers_reinstater_role',
      );
      await c.query(`UPDATE drivers SET status = 'approved', reinstated_by = $2 WHERE account_id = $1`, [ids.kept, ids.reviewer]);

      // Desce (ordem inversa): o schema volta exatamente ao da 0024, os dados ficam.
      for (const f of [...after24].reverse()) await c.query(rollbackOf(f));
      assert.deepEqual((await catalogSnapshot(c)).rows, before, 'schema depois do rollback == schema na 0024');
      assert.deepEqual(await counts(), [2, 6, 1]);
      assert.equal(await n('SELECT count(*)::int AS n FROM schema_migrations'), 24);
      // A reativação sai com a coluna; a linha (aprovado com a suspensão anterior) é válida nas regras da 0024.
      const row = (await c.query(`SELECT status, suspension_reason FROM drivers WHERE account_id = $1`, [ids.kept])).rows[0];
      assert.deepEqual(row, { status: 'approved', suspension_reason: 'Queixa em análise' });
    });

    const reup = await runMany(db, 2);
    for (const r of reup) assert.ok(r.report.ok && r.code === 0, `reaplicar falhou: ${r.report.error}`);
    assert.deepEqual(reup.flatMap(applied).sort(), after24, 'sobe de novo depois do rollback');
  });
});
