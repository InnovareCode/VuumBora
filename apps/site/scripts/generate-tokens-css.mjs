#!/usr/bin/env node
/**
 * Gera `src/styles/tokens.generated.css` a partir da FONTE ÚNICA de tokens
 * (`VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json`, formato W3C DTCG).
 *
 * Por quê um gerador em vez de copiar HEX à mão: a mesma regra do resto do
 * monorepo ("nenhum HEX fora do JSON") vale aqui. `scripts/check-boundaries.mjs`
 * (raiz) não varre arquivos `.css`, então copiar HEX à mão no CSS não quebraria
 * `npm run check` — mas divergiria do JSON silenciosamente na primeira vez que
 * alguém mudasse o token lá e esquecesse de atualizar aqui. Gerando em build
 * (`predev`/`prebuild` → ver package.json), o CSS nunca pode ficar desatualizado.
 *
 * O que este script NÃO copia:
 * - `typography.family`: são nomes de fonte estática do Expo/Android
 *   (ex. "PlusJakartaSans_600SemiBold"), não existem como arquivo de fonte no
 *   navegador. A tipografia do site usa `next/font/google` (ver
 *   src/app/layout.tsx) para a mesma família (Plus Jakarta Sans, docs/tipografia.md).
 * - `color.map.*`: o site não tem mapa.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = join(HERE, '../../../VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json');
const OUT_PATH = join(HERE, '../src/styles/tokens.generated.css');

const raw = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));

/** "yellowPressed" -> "yellow-pressed"; "0".."10" e "sm"/"lg" passam direto. */
function kebab(key) {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function varName(path) {
  return `--${path.map(kebab).join('-')}`;
}

function formatShadow(stop) {
  const inset = stop.inset ? 'inset ' : '';
  const spread = stop.spreadDistance ?? 0;
  return `${inset}${stop.offsetX}px ${stop.offsetY}px ${stop.blurRadius}px ${spread}px ${stop.color}`;
}

function formatGradient(stops) {
  // Direção de arte (docs/direcao-de-arte.md §4): todo gradiente deste design
  // system é vertical (180deg, topo -> base) — confirmado nas descrições de
  // cada token (cta, surfaceRaised, surfaceOverlay, screen, photoScrim).
  const parts = stops.map((s) => `${s.color} ${Math.round(s.position * 100)}%`);
  return `linear-gradient(180deg, ${parts.join(', ')})`;
}

const lines = [
  '/* GERADO por scripts/generate-tokens-css.mjs — NÃO EDITAR À MÃO.',
  ' * Fonte única: VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json',
  ' * Rode `npm run dev` ou `npm run build` nesta pasta para regenerar. */',
  ':root {',
];

let skippedFamilies = 0;

function walk(node, path) {
  if (node === null || typeof node !== 'object') return;
  if ('$value' in node && '$type' in node) {
    const type = node.$type;
    if (type === 'fontFamily') {
      skippedFamilies += 1;
      return;
    }
    const name = varName(path);
    if (type === 'color' || type === 'dimension' || type === 'number' || type === 'fontWeight') {
      lines.push(`  ${name}: ${node.$value};`);
    } else if (type === 'gradient') {
      lines.push(`  ${name}: ${formatGradient(node.$value)};`);
    } else if (type === 'shadow') {
      lines.push(`  ${name}: ${node.$value.map(formatShadow).join(', ')};`);
    } else {
      throw new Error(`[generate-tokens-css] tipo de token desconhecido "${type}" em ${path.join('.')}`);
    }
    return;
  }
  for (const [key, child] of Object.entries(node)) walk(child, [...path, key]);
}

walk(raw.color, ['color']);
walk(raw.spacing, ['spacing']);
walk(raw.radius, ['radius']);
walk(raw.typography.size, ['font-size']);
walk(raw.typography.weight, ['font-weight']);
walk(raw.layout, ['layout']);
walk(raw.opacity, ['opacity']);
walk(raw.gradient, ['gradient']);
walk(raw.elevation, ['elevation']);
walk(raw.glow, ['glow']);

lines.push('}', '');

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, lines.join('\n'), 'utf8');
console.log(
  `[generate-tokens-css] ${OUT_PATH.replace(/\\/g, '/')} gerado (${lines.length - 4} variáveis, ${skippedFamilies} fontFamily ignoradas de propósito).`
);
