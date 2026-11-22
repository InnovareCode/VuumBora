/**
 * `npm run legal:publish` (src/lib/legal-publish.ts + scripts/publish-legal.mjs): validação dos argumentos, hash do
 * arquivo e publicação no banco real com a credencial DONA. A API (`vuumbora_api`) não publica: a prova é o 42501.
 * O script `.mjs` em si (que só importa de `dist/`) é exercitado à mão contra o banco, depois do build.
 */
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import type { Pool } from 'pg';
import { after, before, beforeEach, describe, test } from 'node:test';
import { parsePublishArgs, PublishConflictError, publishLegalVersion, sha256OfFile, type PublishRequest } from '../src/lib/legal-publish.js';
import { pool, prepareDatabase, shutdown } from './helpers/harness.js';
import { ensureBaseline, resetLegalCatalog, sha256Of } from './helpers/legal-kit.js';

const SHA_A = sha256Of('texto A\n');
const SHA_B = sha256Of('texto B\n');
const EMPTY_SHA = sha256Of('');

let restricted: Pool;
let workdir: string;

before(async () => {
  await prepareDatabase();
  const url = new URL(process.env['DATABASE_URL']!);
  url.searchParams.set('options', '-c role=vuumbora_api');
  restricted = new pg.Pool({ connectionString: url.toString(), max: 2 });
  workdir = mkdtempSync(join(tmpdir(), 'legal-publish-'));
});
after(async () => {
  rmSync(workdir, { recursive: true, force: true });
  await ensureBaseline(pool); // devolve o catálogo conhecido aos arquivos seguintes
  await restricted.end();
  await shutdown();
});
beforeEach(async () => {
  await resetLegalCatalog(pool);
});

const request = (extra: Partial<PublishRequest> = {}): PublishRequest => ({ document: 'terms', audiences: ['passenger', 'driver'], version: '2026-12-01', sha256: SHA_A, requiresReacceptance: true, ...extra });
const rowsOf = async (version: string) =>
  (await pool.query<{ document: string; audience: string; text_sha256: string; requires_reacceptance: boolean }>(
    'SELECT document, audience, text_sha256, requires_reacceptance FROM legal_document_versions WHERE version = $1 ORDER BY document, audience', [version],
  )).rows;

describe('parsePublishArgs', () => {
  const good = ['--document=terms', '--audience=passenger,driver', '--version=2026-12-01', `--sha256=${SHA_A}`];

  test('argumentos válidos: perfis em ordem fixa, requer novo aceite por padrão, --file ou --sha256', () => {
    const parsed = parsePublishArgs(['--document=privacy', '--audience=driver,passenger', '--version=v1.2', '--file=./texto.txt', '--requires-reacceptance=false', '--dry-run']);
    assert.deepEqual(parsed, { ok: true, options: { request: { document: 'privacy', audiences: ['passenger', 'driver'], version: 'v1.2', requiresReacceptance: false }, file: './texto.txt', sha256: null, dryRun: true } });
    const byHash = parsePublishArgs(good);
    assert.ok(byHash.ok);
    assert.equal(byHash.options.request.requiresReacceptance, true, 'padrão seguro: mudança material');
    assert.equal(byHash.options.dryRun, false);
    assert.equal(byHash.options.sha256, SHA_A);
    const upper = parsePublishArgs(['--document=terms', '--audience=passenger', '--version=1', `--sha256=${SHA_A.toUpperCase()}`]);
    assert.ok(upper.ok && upper.options.sha256 === SHA_A, 'o hash é normalizado para minúsculas');
  });

  test('argumentos inválidos são recusados com mensagem (documento, perfil, versão, hash, combinação, flag desconhecida)', () => {
    const without = (flag: string) => good.filter((arg) => !arg.startsWith(`--${flag}=`));
    const refused: Array<[string[], RegExp]> = [
      [without('document'), /--document/],
      [[...without('document'), '--document=terms_of_use'], /--document/],
      [without('audience'), /--audience/],
      [[...without('audience'), '--audience=all'], /--audience/],
      [[...without('audience'), '--audience=passenger,passenger'], /--audience/],
      [[...without('audience'), '--audience=passenger,admin'], /--audience/],
      [without('version'), /--version/],
      [[...without('version'), '--version=com espaço'], /--version/],
      [[...without('version'), `--version=${'x'.repeat(65)}`], /--version/],
      [[...without('version'), '--version=../x'], /--version/],
      [without('sha256'), /exatamente um/],
      [[...good, '--file=./a.txt'], /exatamente um/],
      [[...without('sha256'), '--sha256=abc'], /--sha256/],
      [[...without('sha256'), `--sha256=${EMPTY_SHA}`], /vazio/],
      [[...good, '--requires-reacceptance=talvez'], /--requires-reacceptance/],
      [[...good, '--versao=2'], /não reconhecido/],
      [[...good, '--document=privacy'], /repetido/],
      [[...good, 'versao'], /não reconhecido/],
    ];
    for (const [argv, message] of refused) {
      const parsed = parsePublishArgs(argv);
      assert.equal(parsed.ok, false, argv.join(' '));
      assert.match(parsed.ok ? '' : parsed.message, message, argv.join(' '));
    }
  });
});

describe('sha256OfFile', () => {
  test('é o SHA-256 dos BYTES exatos (um byte a mais muda o hash); arquivo vazio é recusado', () => {
    const file = join(workdir, 'termos.txt');
    writeFileSync(file, 'texto A\n', 'utf8');
    assert.equal(sha256OfFile(file), SHA_A);
    writeFileSync(file, 'texto A \n', 'utf8');
    assert.notEqual(sha256OfFile(file), SHA_A);
    writeFileSync(file, '', 'utf8');
    assert.throws(() => sha256OfFile(file), /vazio/);
    assert.throws(() => sha256OfFile(join(workdir, 'nao-existe.txt')), (err: { code?: string }) => err.code === 'ENOENT');
  });
});

describe('publishLegalVersion (credencial dona)', () => {
  test('publica o documento nos perfis pedidos, numa transação, com o hash e a flag; a nova passa a ser a vigente', async () => {
    const outcomes = await publishLegalVersion(pool, request({ requiresReacceptance: false }));
    assert.deepEqual(outcomes, [
      { audience: 'passenger', status: 'published', isCurrent: true, currentVersion: '2026-12-01' },
      { audience: 'driver', status: 'published', isCurrent: true, currentVersion: '2026-12-01' },
    ]);
    assert.deepEqual(await rowsOf('2026-12-01'), [
      { document: 'terms_of_use', audience: 'driver', text_sha256: SHA_A, requires_reacceptance: false },
      { document: 'terms_of_use', audience: 'passenger', text_sha256: SHA_A, requires_reacceptance: false },
    ]);
    const only = await publishLegalVersion(pool, request({ document: 'privacy', audiences: ['driver'], version: '2026-12-02', sha256: SHA_B }));
    assert.equal(only.length, 1);
    assert.equal((await rowsOf('2026-12-02')).length, 1, 'só o perfil pedido');
  });

  test('idempotente: reenviar a MESMA versão com o MESMO texto não muda nada; versão antiga reenviada diz que NÃO é a vigente', async () => {
    await publishLegalVersion(pool, request());
    const before = (await pool.query('SELECT version, published_at FROM legal_document_versions ORDER BY 1')).rows;
    const again = await publishLegalVersion(pool, request());
    assert.deepEqual(again.map((o) => o.status), ['already_published', 'already_published']);
    assert.deepEqual((await pool.query('SELECT version, published_at FROM legal_document_versions ORDER BY 1')).rows, before, 'nenhuma linha nova, nenhuma data mexida');

    await publishLegalVersion(pool, request({ version: '2026-12-09', sha256: SHA_B }));
    const old = await publishLegalVersion(pool, request());
    assert.deepEqual(old.map((o) => [o.status, o.isCurrent, o.currentVersion]), [['already_published', false, '2026-12-09'], ['already_published', false, '2026-12-09']]);
  });

  test('a MESMA versão com OUTRO texto é ERRO ALTO (versão publicada é imutável) e nada muda — nem no outro perfil (tudo ou nada)', async () => {
    await publishLegalVersion(pool, request({ audiences: ['driver'] }));
    await assert.rejects(
      publishLegalVersion(pool, request({ sha256: SHA_B })), // passageiro entraria; o motorista conflita
      (err: unknown) => err instanceof PublishConflictError && err.audience === 'driver' && /OUTRO texto/.test(err.message),
    );
    assert.deepEqual((await rowsOf('2026-12-01')).map((r) => [r.audience, r.text_sha256]), [['driver', SHA_A]], 'o passageiro NÃO foi publicado (ROLLBACK) e o hash original do motorista segue');
  });

  test('o papel da API NÃO publica (sem INSERT no catálogo): 42501', async () => {
    await assert.rejects(publishLegalVersion(restricted, request()), (err: { code?: string }) => err.code === '42501');
    assert.equal((await rowsOf('2026-12-01')).length, 0);
  });

  test('só o erro de relógio do banco é repetido (3 tentativas); outro erro sobe na hora', async () => {
    const clockError = Object.assign(new Error('relógio'), { code: '23514', constraint: 'legal_document_versions_published_at_monotonic' });
    const fakePool = (failures: number, error: Error) => {
      let inserts = 0;
      const calls: string[] = [];
      const client = {
        async query(text: string) {
          calls.push(text.trim().split(/\s+/)[0]!);
          if (text.includes('INSERT INTO legal_document_versions')) {
            inserts += 1;
            if (inserts <= failures) throw error;
            return { rowCount: 1, rows: [] };
          }
          if (text.includes('legal_current_versions')) return { rowCount: 1, rows: [{ version: '2026-12-01' }] };
          return { rowCount: 0, rows: [] };
        },
        release() {},
      };
      return { pool: { connect: async () => client } as unknown as Pool, inserts: () => inserts, calls };
    };
    const twice = fakePool(2, clockError);
    assert.equal((await publishLegalVersion(twice.pool, request({ audiences: ['passenger'] }))).length, 1);
    assert.equal(twice.inserts(), 3, 'duas falhas de relógio e a terceira tentativa passa');
    assert.ok(twice.calls.filter((c) => c === 'ROLLBACK').length === 2, 'cada tentativa falha desfaz a transação');

    const always = fakePool(99, clockError);
    await assert.rejects(publishLegalVersion(always.pool, request({ audiences: ['passenger'] })), /relógio/);
    assert.equal(always.inserts(), 3, 'desiste na 3ª');

    const other = fakePool(99, Object.assign(new Error('outro'), { code: '23505' }));
    await assert.rejects(publishLegalVersion(other.pool, request({ audiences: ['passenger'] })), /outro/);
    assert.equal(other.inserts(), 1, 'erro que não é de relógio não se repete');
  });
});
