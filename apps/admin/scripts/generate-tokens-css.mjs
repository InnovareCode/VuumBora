#!/usr/bin/env node
/**
 * Gera `src/styles/tokens.css` a partir da fonte única de tokens
 * (`VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json`), igual ao que
 * `packages/tokens` faz para os apps React Native — aqui o destino é CSS
 * custom properties, não um objeto RN.
 *
 * Roda antes de `dev`/`build` (ver package.json). Arquivo gerado, não editar
 * à mão — rode `npm run tokens:css` para atualizar depois de mudar o JSON.
 *
 * `typography.family` do JSON guarda nomes de asset RN (ex.
 * "PlusJakartaSans_400Regular"), inúteis em CSS — a família web usa o nome
 * real da fonte ("Plus Jakarta Sans", carregada via @font-face) e o PESO vem
 * de `typography.weight`, exatamente como a decisão do dono em
 * docs/tipografia.md descreve para a web.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = resolve(here, '../../../VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json');
const OUT_PATH = resolve(here, '../src/styles/tokens.css');

const raw = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));

/** kebab-case simples: "yellowPressed" -> "yellow-pressed". */
function kebab(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

const lines = [];
lines.push('/**');
lines.push(' * GERADO — não edite à mão.');
lines.push(` * Fonte: VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json (v${raw.version}).`);
lines.push(' * Regenerar: npm run tokens:css (workspace @vuumbora/admin).');
lines.push(' */');
lines.push(':root {');

function walkColors(group, prefix) {
  for (const [key, token] of Object.entries(group)) {
    lines.push(`  --color-${prefix}-${kebab(key)}: ${token.$value};`);
  }
}
for (const [group, value] of Object.entries(raw.color)) {
  walkColors(value, kebab(group));
}

for (const [key, token] of Object.entries(raw.spacing)) {
  lines.push(`  --space-${key}: ${token.$value};`);
}
for (const [key, token] of Object.entries(raw.radius)) {
  lines.push(`  --radius-${kebab(key)}: ${token.$value};`);
}
for (const [key, token] of Object.entries(raw.typography.size)) {
  lines.push(`  --font-size-${kebab(key)}: ${token.$value};`);
}
for (const [key, token] of Object.entries(raw.typography.weight)) {
  lines.push(`  --font-weight-${kebab(key)}: ${token.$value};`);
}
if (raw.layout) {
  for (const [key, token] of Object.entries(raw.layout)) {
    lines.push(`  --layout-${kebab(key)}: ${token.$value};`);
  }
}

// Família web: um único nome real de fonte (Google Fonts), peso via
// --font-weight-*. Ver nota de topo.
lines.push(`  --font-family-base: 'Plus Jakarta Sans', system-ui, sans-serif;`);

lines.push('}');
lines.push('');

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, lines.join('\n'), 'utf8');
console.log(`[tokens:css] gerado ${OUT_PATH} a partir de ${TOKENS_PATH}`);
