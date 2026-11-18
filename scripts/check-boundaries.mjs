#!/usr/bin/env node
/**
 * Guarda de arquitetura — roda sem dependências (só Node).
 *  1. Nenhum HEX de cor solto em apps/ e packages/ (fonte única: tokens JSON).
 *  2. apps/passenger não importa nada de "/driver" e vice-versa.
 *  3. Subpastas passenger/ e driver/ dos pacotes não se importam mutuamente.
 *  4. Pacotes não importam apps.
 * Saída != 0 em qualquer violação.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCAN = ['apps', 'packages'];
// '.next'/'out': saída de build do Next.js (apps/site) — contém bundle já
// compilado (inclusive o CSS/HEX gerado a partir dos tokens) e o boilerplate
// interno do próprio Next (ex. cores do 404 padrão), nunca código-fonte.
// Mesmo papel que '.expo'/'dist'/'build' já tinham para os apps Expo.
const SKIP_DIRS = new Set(['node_modules', '.expo', '.next', 'out', 'dist', 'build', 'ios', 'android']);
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|json)$/;
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (CODE.test(name)) yield full;
  }
}

function profileOf(rel) {
  const parts = rel.split(sep);
  if (parts[0] === 'apps') return parts[1] === 'passenger' || parts[1] === 'driver' ? parts[1] : null;
  if (parts.includes('passenger')) return 'passenger';
  if (parts.includes('driver')) return 'driver';
  return null;
}

const violations = [];
for (const top of SCAN) {
  for (const file of walk(join(ROOT, top))) {
    const rel = relative(ROOT, file);
    const text = readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);

    lines.forEach((line, i) => {
      for (const m of line.matchAll(HEX)) violations.push(`${rel}:${i + 1}  HEX solto "${m[0]}" — use @vuumbora/tokens`);
    });

    const profile = profileOf(rel);
    const other = profile === 'passenger' ? 'driver' : profile === 'driver' ? 'passenger' : null;
    for (const m of text.matchAll(IMPORT)) {
      const spec = m[1];
      const line = text.slice(0, m.index).split('\n').length;
      if (other && new RegExp(`(^|/)${other}(/|$)`).test(spec)) {
        violations.push(`${rel}:${line}  perfil "${profile}" importa "${spec}" do perfil "${other}"`);
      }
      if (top === 'packages' && /(^|\/)apps\//.test(spec)) {
        violations.push(`${rel}:${line}  pacote importa app ("${spec}")`);
      }
    }
  }
}

if (violations.length) {
  console.error(`check-boundaries: ${violations.length} violação(ões)\n` + violations.map((v) => `  - ${v}`).join('\n'));
  process.exit(1);
}
console.log('check-boundaries: ok (sem HEX solto, sem import cruzado passageiro/motorista)');
