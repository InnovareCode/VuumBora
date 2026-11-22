// Utilidades de imagem sem dependência de redimensionamento "de verdade" (sem
// sharp/libvips na máquina): recorte e reamostragem do vizinho mais próximo, que
// bastam para a montagem lado a lado do G-07b (comparação visual grosseira feita
// por um humano, não medição de pixel).

import { resolveDep } from './resolve-dep.mjs';

function PNGClass() {
  return resolveDep('pngjs').PNG;
}

export function recortar(png, { x0, y0, x1, y1 }) {
  const PNG = PNGClass();
  const x = Math.max(0, Math.round(x0));
  const y = Math.max(0, Math.round(y0));
  const largura = Math.min(png.width - x, Math.round(x1 - x0));
  const altura = Math.min(png.height - y, Math.round(y1 - y0));
  const out = new PNG({ width: largura, height: altura });
  for (let row = 0; row < altura; row++) {
    const srcStart = ((y + row) * png.width + x) << 2;
    const dstStart = (row * largura) << 2;
    png.data.copy(out.data, dstStart, srcStart, srcStart + (largura << 2));
  }
  return out;
}

export function redimensionar(png, novaLargura, novaAltura) {
  const PNG = PNGClass();
  const out = new PNG({ width: novaLargura, height: novaAltura });
  for (let y = 0; y < novaAltura; y++) {
    const srcY = Math.min(png.height - 1, Math.floor((y * png.height) / novaAltura));
    for (let x = 0; x < novaLargura; x++) {
      const srcX = Math.min(png.width - 1, Math.floor((x * png.width) / novaLargura));
      const srcIdx = (srcY * png.width + srcX) << 2;
      const dstIdx = (y * novaLargura + x) << 2;
      out.data[dstIdx] = png.data[srcIdx];
      out.data[dstIdx + 1] = png.data[srcIdx + 1];
      out.data[dstIdx + 2] = png.data[srcIdx + 2];
      out.data[dstIdx + 3] = png.data[srcIdx + 3];
    }
  }
  return out;
}

/** Concatena duas imagens lado a lado, alinhadas pelo topo, com uma faixa cinza entre elas. */
export function ladoALado(esquerda, direita, gap = 6) {
  const PNG = PNGClass();
  const altura = Math.max(esquerda.height, direita.height);
  const largura = esquerda.width + gap + direita.width;
  const out = new PNG({ width: largura, height: altura });
  out.data.fill(255); // fundo branco

  for (let y = 0; y < esquerda.height; y++) {
    const srcStart = (y * esquerda.width) << 2;
    const dstStart = (y * largura) << 2;
    esquerda.data.copy(out.data, dstStart, srcStart, srcStart + (esquerda.width << 2));
  }
  // faixa cinza divisória
  for (let y = 0; y < altura; y++) {
    for (let g = 0; g < gap; g++) {
      const idx = (y * largura + esquerda.width + g) << 2;
      out.data[idx] = out.data[idx + 1] = out.data[idx + 2] = 200;
      out.data[idx + 3] = 255;
    }
  }
  for (let y = 0; y < direita.height; y++) {
    const srcStart = (y * direita.width) << 2;
    const dstStart = (y * largura + esquerda.width + gap) << 2;
    direita.data.copy(out.data, dstStart, srcStart, srcStart + (direita.width << 2));
  }
  return out;
}
