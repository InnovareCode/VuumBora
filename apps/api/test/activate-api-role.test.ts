/**
 * Os dois scripts de OPERADOR que passam a API de produção ao papel restrito
 * `vuumbora_api` (migração 0012/0017; ver `apps/api/test/runtime-role.test.ts` para a
 * matriz completa de privilégios): `scripts/ativar-papel-api.mjs` (dá LOGIN+senha nova
 * ao papel, com a credencial DONA) e `scripts/conferir-papel-api.mjs` (prova, com a
 * `DATABASE_URL` da API, que o papel é o restrito e que os limites esperados valem).
 *
 * Roda os dois como PROCESSOS FILHOS reais (igual a `migration-runner.test.ts`), nunca
 * importando a lógica: o que importa aqui é o contrato de linha de comando — o que cada
 * um imprime, o código de saída, e que a URL dona nunca aparece na saída.
 *
 * `ALTER ROLE ... LOGIN PASSWORD` é um atributo de CLUSTER (não por banco) — ao final,
 * devolve o papel a `NOLOGIN`, do jeito que a migração 0012 deixa, para não vazar estado
 * entre execuções da suíte (ver `feedback-teste-mutacao-e-banco-compartilhado`).
 */
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { after, before, describe, test } from 'node:test';
import { prepararBanco } from '../src/migrate.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(HERE, '..', 'scripts');
const CWD = join(HERE, '..');

const OWNER_DATABASE_URL = process.env['DATABASE_URL']!;

/**
 * Prova "nunca ecoa a URL dona" com a credencial DONA REAL (não um canário): em CI o
 * Postgres exige senha (md5/scram), então uma senha inventada não autenticaria — tem de
 * ser a mesma URL que o resto da suíte já usa. Confere a URL inteira e, se houver senha,
 * a senha isolada e o par `usuário:senha@`/`usuário@` (forma como ela apareceria embutida
 * numa URL impressa por engano).
 */
function assertNeverLeaksOwnerUrl(stdout: string, stderr: string): void {
  const combined = `${stdout}\n${stderr}`;
  const ownerUrl = new URL(OWNER_DATABASE_URL);
  assert.ok(!combined.includes(OWNER_DATABASE_URL), 'a URL dona completa não pode aparecer na saída');
  if (ownerUrl.password) {
    assert.ok(!combined.includes(ownerUrl.password), 'a senha dona não pode aparecer na saída');
  }
  const userinfo = ownerUrl.password ? `${ownerUrl.username}:${ownerUrl.password}@` : `${ownerUrl.username}@`;
  assert.ok(!combined.includes(userinfo), 'o par usuário(:senha)@ do dono não pode aparecer na saída');
}

const owner = new pg.Pool({ connectionString: OWNER_DATABASE_URL, max: 2 });

interface RunResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runScript(script: string, env: Record<string, string>): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(SCRIPTS_DIR, script)], {
      cwd: CWD,
      env: { ...process.env, DATABASE_URL: '', MIGRATION_DATABASE_URL: '', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function restoreNoLogin() {
  await owner.query(`ALTER ROLE vuumbora_api NOLOGIN PASSWORD NULL`).catch(() => undefined);
}

before(async () => {
  await prepararBanco({ databaseUrl: OWNER_DATABASE_URL, pool: owner, log: () => undefined });
  await restoreNoLogin();
});

after(async () => {
  await restoreNoLogin();
  await owner.end();
});

describe('ativar-papel-api.mjs', () => {
  test('recusa de cara se a credencial resolvida já for do vuumbora_api (não tenta conectar)', async () => {
    const asApiRole = new URL(OWNER_DATABASE_URL);
    asApiRole.username = 'vuumbora_api';
    const r = await runScript('ativar-papel-api.mjs', { MIGRATION_DATABASE_URL: asApiRole.toString() });
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /já é do usuário "vuumbora_api"/);
  });

  test('ativa o papel, imprime uma DATABASE_URL nova do vuumbora_api, e nunca ecoa a URL dona', async () => {
    const r = await runScript('ativar-papel-api.mjs', { MIGRATION_DATABASE_URL: OWNER_DATABASE_URL });
    assert.equal(r.code, 0, `stdout=${r.stdout}\nstderr=${r.stderr}`);
    assertNeverLeaksOwnerUrl(r.stdout, r.stderr);

    const printed = r.stdout.match(/postgres:\/\/\S+/)?.[0];
    assert.ok(printed, 'o script precisa imprimir a nova DATABASE_URL');
    const printedUrl = new URL(printed!);
    const ownerUrl = new URL(OWNER_DATABASE_URL);
    assert.equal(printedUrl.username, 'vuumbora_api');
    assert.equal(printedUrl.hostname, ownerUrl.hostname);
    assert.equal(printedUrl.port, ownerUrl.port);
    assert.equal(printedUrl.pathname, ownerUrl.pathname);
    assert.notEqual(printedUrl.password, '', 'a senha nova não pode ser vazia');
    assert.doesNotMatch(printedUrl.password, /[^A-Za-z0-9_-]/, 'a senha não deve precisar de escape em URL (base64url)');

    // A URL impressa de fato autentica como vuumbora_api e passa na conferência.
    const check = await runScript('conferir-papel-api.mjs', { DATABASE_URL: printedUrl.toString() });
    assert.equal(check.code, 0, `stdout=${check.stdout}\nstderr=${check.stderr}`);
    const lines = check.stdout.trim().split('\n').filter(Boolean);
    assert.ok(lines.length >= 5, 'cinco checagens esperadas (current_user, SELECT 1, DELETE, UPDATE, DDL)');
    for (const line of lines) assert.match(line, /^\[OK\]/, `linha inesperada: ${line}`);
  });
});

describe('conferir-papel-api.mjs', () => {
  test('não deixa efeito colateral mesmo quando as checagens de recusa falham (credencial dona, sem permission denied)', async () => {
    const adminsBefore = (await owner.query('SELECT count(*)::int AS n FROM admin_users')).rows[0].n;
    const auditBefore = (await owner.query('SELECT count(*)::int AS n FROM admin_audit_log')).rows[0].n;

    const r = await runScript('conferir-papel-api.mjs', { DATABASE_URL: OWNER_DATABASE_URL });
    assert.notEqual(r.code, 0, 'a credencial dona não é o papel restrito — a conferência tem de reprovar');
    assert.match(r.stdout, /\[FALHA\].*current_user/);
    assert.match(r.stdout, /\[FALHA\].*DELETE em admin_users/, 'como superusuário, o DELETE passa — e é isso que deve reprovar');
    assert.match(r.stdout, /\[FALHA\].*DDL/);

    const adminsAfter = (await owner.query('SELECT count(*)::int AS n FROM admin_users')).rows[0].n;
    const auditAfter = (await owner.query('SELECT count(*)::int AS n FROM admin_audit_log')).rows[0].n;
    assert.equal(adminsAfter, adminsBefore, 'o DELETE que passou foi desfeito pelo ROLLBACK final');
    assert.equal(auditAfter, auditBefore);

    const ddl = await owner.query(`SELECT to_regclass('public.conferir_papel_api_ddl_probe') AS r`);
    assert.equal(ddl.rows[0].r, null, 'a tabela de prova do DDL não pode sobreviver — foi desfeita pelo ROLLBACK');
  });

  test('exige DATABASE_URL no ambiente', async () => {
    const r = await runScript('conferir-papel-api.mjs', {});
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /defina DATABASE_URL/);
  });
});
