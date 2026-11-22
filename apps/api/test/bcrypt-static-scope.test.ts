/**
 * Q1 da passada 5 da Íris (`docs/veredito-iris-s1-passada-5.md`, achados): tirar o bcrypt do pool em login, cadastro
 * ou login do admin (chamar `bcrypt.compareSync`/`hashSync` direto, fora da thread de trabalho) passava a suíte
 * INTEIRA — a rajada do `bcrypt-ceiling.test.ts` só exercita `verify-email`, e as contas de teste usam custo 4 (a
 * comparação na principal custa ~1 ms, ninguém vê). É a rede que faltava para o A-1 (`lib/bcrypt-pool.ts`).
 *
 * Teste ESTÁTICO (não dinâmico: não sobe app nem mede tempo — isso já é o `bcrypt-ceiling.test.ts`): varre todo
 * `src/**\/*.ts` e exige que só DOIS arquivos importem `bcryptjs` —
 *   - `lib/bcrypt-worker.ts`: a thread de trabalho do pool (roda fora da principal, de propósito — comentário no topo
 *     do arquivo);
 *   - `services/admin-auth-service.ts`: só o `DUMMY_PASSWORD_HASH`, gerado UMA vez no boot (síncrono, antes de
 *     aceitar requisição) para a defesa de tempo do login do admin — nunca em caminho de requisição.
 * Qualquer OUTRO arquivo que importe `bcryptjs` tirou uma comparação do pool: a thread principal volta a travar por
 * ~0,5 s (custo 12) a cada chamada, e a suíte toda (que usa custo 4) não vê nada — por isso a rede tem de ser
 * estática, não só a rajada.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const BCRYPTJS_IMPORT = /from\s+['"]bcryptjs['"]/;
const ALLOWED = new Set(['lib/bcrypt-worker.ts', 'services/admin-auth-service.ts']);

function allTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allTsFiles(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

test('a rede em si não está vazia: pelo menos os dois arquivos permitidos existem e importam bcryptjs', () => {
  const files = allTsFiles(SRC_DIR);
  const found = files
    .filter((file) => BCRYPTJS_IMPORT.test(readFileSync(file, 'utf8')))
    .map((file) => relative(SRC_DIR, file).replace(/\\/g, '/'));
  assert.ok(found.length >= 2, `só ${found.length} arquivo(s) importa(m) bcryptjs: a varredura está cega`);
  for (const allowed of ALLOWED) assert.ok(found.includes(allowed), `${allowed} devia importar bcryptjs e não foi encontrado — a varredura ou o arquivo mudou de lugar`);
});

test('Q1: bcryptjs só é importado pela thread do pool e pelo hash descartável do boot do admin', () => {
  const files = allTsFiles(SRC_DIR);
  const importers = files
    .filter((file) => BCRYPTJS_IMPORT.test(readFileSync(file, 'utf8')))
    .map((file) => relative(SRC_DIR, file).replace(/\\/g, '/'))
    .sort();
  const unexpected = importers.filter((file) => !ALLOWED.has(file));
  assert.deepEqual(
    unexpected,
    [],
    `bcryptjs importado fora da rede permitida (${unexpected.join(', ')}): isso tira uma comparação da thread de ` +
      'trabalho e a trava passa para o laço de eventos principal — a suíte de custo 4 não vê, só uma rajada de ' +
      'custo real (bcrypt-ceiling.test.ts) veria, e nem sempre (Q1).',
  );
});
