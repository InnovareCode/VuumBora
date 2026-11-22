// Lê VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json e monta um conjunto de
// cores aprovadas, para a sonda de estilo (G-03: "toda cor computada pertence ao
// conjunto dos tokens"). Best-effort: junta todo valor do JSON que pareça cor
// (#hex ou rgba(...)) num Set de "r,g,b" normalizado (sem alfa — o alfa também
// aparece como camada, e comparar só o RGB evita falso positivo de composição).
//
// Limitação sabida (documentada em docs/qualidade-tela.md): isto NÃO entende
// `withAlpha(token, x)` nem gradientes computados pelo React Native Web (que o
// navegador reduz a um `linear-gradient(...)` com várias paradas) — então G-03 aqui é
// um indício para revisão humana, não um veredito automático.

import { readFileSync } from 'node:fs';
import { TOKENS_JSON } from './paths.mjs';

const HEX_RE = /^#([0-9a-f]{6}|[0-9a-f]{8}|[0-9a-f]{3})$/i;

function hexToRgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

function* valoresDeCorEm(node) {
  if (typeof node === 'string') {
    if (HEX_RE.test(node)) {
      yield hexToRgb(node);
    } else {
      const m = node.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (m) yield `${m[1]},${m[2]},${m[3]}`;
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) yield* valoresDeCorEm(item);
    return;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node)) yield* valoresDeCorEm(value);
  }
}

let memo;

/** Set de strings "r,g,b" com todas as cores achadas no JSON de tokens. */
export function conjuntoDeCoresDosTokens() {
  if (memo) return memo;
  const json = JSON.parse(readFileSync(TOKENS_JSON, 'utf8'));
  memo = new Set(valoresDeCorEm(json));
  return memo;
}

/** Converte uma cor computada pelo navegador ("rgb(17, 27, 42)" ou com alfa) em "r,g,b". */
export function cssCorParaRgb(css) {
  if (!css) return null;
  const m = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  return m ? `${m[1]},${m[2]},${m[3]}` : null;
}
