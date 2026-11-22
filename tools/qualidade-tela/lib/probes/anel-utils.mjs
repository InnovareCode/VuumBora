// Matemática de contraste e cobertura por lado, portada do `ring6.mjs`/`ring.mjs`
// que a Íris deixou na passada 6 (ver docs/qualidade-tela.md, mapeamento G-22).
// Sem dependência nova: usa o `pngjs` que já resolvemos em resolve-dep.mjs.

import { resolveDep } from '../resolve-dep.mjs';

function luminanciaRelativa(r, g, b) {
  const canal = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function razaoDeContraste(a, b) {
  const la = luminanciaRelativa(a[0], a[1], a[2]);
  const lb = luminanciaRelativa(b[0], b[1], b[2]);
  const maior = Math.max(la, lb);
  const menor = Math.min(la, lb);
  return (maior + 0.05) / (menor + 0.05);
}

/** Tira um recorte (clip) em torno de um retângulo, com folga, e decodifica com pngjs. */
export async function recortarElemento(page, rect, pad = 10) {
  const { PNG } = resolveDep('pngjs');
  const viewport = page.viewportSize();
  const x = Math.max(0, Math.floor(rect.x - pad));
  const y = Math.max(0, Math.floor(rect.y - pad));
  const x2 = Math.min(viewport.width, Math.ceil(rect.x + rect.width + pad));
  const y2 = Math.min(viewport.height, Math.ceil(rect.y + rect.height + pad));
  if (x2 - x < 4 || y2 - y < 4) return null;
  const buf = await page.screenshot({ clip: { x, y, width: x2 - x, height: y2 - y } });
  return { png: PNG.sync.read(buf), x, y };
}

/**
 * Cobertura por lado (topo/base/esquerda/direita): fração das posições (80%
 * centrais daquele lado) onde algum pixel na faixa de ±6px da borda mudou com
 * contraste >= 3:1 entre a imagem desfocada (A) e a focada (B). `rect` é o
 * retângulo do alvo nas coordenadas da VIEWPORT (não do recorte).
 */
export function coberturaPorLado(desfocado, focado, rect) {
  const W = desfocado.png.width;
  const H = desfocado.png.height;
  const pixel = (recorte, x, y) => {
    const i = (y * W + x) * 4;
    return [recorte.png.data[i], recorte.png.data[i + 1], recorte.png.data[i + 2]];
  };
  const mudou = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    return razaoDeContraste(pixel(desfocado, x, y), pixel(focado, x, y)) >= 3;
  };

  const left = Math.round(rect.x - desfocado.x);
  const top = Math.round(rect.y - desfocado.y);
  const right = left + Math.round(rect.width);
  const bottom = top + Math.round(rect.height);

  const faixaCentral = (de, ate) => {
    const n = ate - de;
    return [Math.round(de + n * 0.1), Math.round(ate - n * 0.1)];
  };
  const lado = (eixo, borda, [a, b]) => {
    let bateu = 0;
    let total = 0;
    for (let t = a; t <= b; t += 1) {
      total += 1;
      let algumMudou = false;
      for (let d = -6; d <= 6 && !algumMudou; d += 1) {
        algumMudou = eixo === 'h' ? mudou(t, borda + d) : mudou(borda + d, t);
      }
      if (algumMudou) bateu += 1;
    }
    return total === 0 ? 0 : bateu / total;
  };

  const [x0, x1] = faixaCentral(left, right);
  const [y0, y1] = faixaCentral(top, bottom);
  return {
    topo: lado('h', top, [x0, x1]),
    base: lado('h', bottom, [x0, x1]),
    esquerda: lado('v', left, [y0, y1]),
    direita: lado('v', right, [y0, y1]),
  };
}

export function menorLado(cobertura) {
  return Math.min(cobertura.topo, cobertura.base, cobertura.esquerda, cobertura.direita);
}
