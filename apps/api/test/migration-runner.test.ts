/**
 * O runner de migração (`src/migrate.ts`, o MESMO do boot e de `npm run migrate`)
 * com VÁRIOS PROCESSOS ao mesmo tempo — réplicas subindo juntas:
 *  1. do zero (o banco nem existe: criação concorrente + TODAS as migrações do diretório),
 *  2. sobre banco já migrado (nada a aplicar, nada muda),
 *  3. UPGRADE de produção: banco parado na 0009 (o que está no ar hoje), COM DADOS,
 *     recebendo 0010 em diante (até a última do diretório) de réplicas concorrentes — os dados sobrevivem e o que a
 *     0013 manda apagar (sessões de dono/financeiro) é o único apagado.
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
});
