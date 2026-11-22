// Compara uma captura contra a linha de base aprovada (padrão premium §14.2):
// diferença máxima de 0,2% dos pixels (`maxDiffPixelRatio: 0.002`), limiar de cor
// 0,1 (10% de distância por canal, numa escala 0–1). Sem pixelmatch disponível
// offline nesta máquina: decodifica os PNGs com `pngjs` (achado em cache do npx,
// ver resolve-dep.mjs) e faz a comparação pixel a pixel à mão — é só subtração de
// canais, não precisa de biblioteca de diff.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { resolveDep } from './resolve-dep.mjs';

function carregarPng(filePath) {
  const { PNG } = resolveDep('pngjs');
  return PNG.sync.read(readFileSync(filePath));
}

/**
 * Distância entre dois pixels RGBA, normalizada 0–1 por canal, usando a maior
 * distância entre R, G e B (o alfa entra como diferença de opacidade separada).
 */
function distanciaPixel(a, ai, b, bi) {
  const dr = Math.abs(a.data[ai] - b.data[bi]) / 255;
  const dg = Math.abs(a.data[ai + 1] - b.data[bi + 1]) / 255;
  const db = Math.abs(a.data[ai + 2] - b.data[bi + 2]) / 255;
  const da = Math.abs(a.data[ai + 3] - b.data[bi + 3]) / 255;
  return Math.max(dr, dg, db, da);
}

/**
 * @returns {{pass:boolean, semLinhaDeBase?:boolean, tamanhosDiferentes?:boolean,
 *   ratio:number, diffPixels:number, totalPixels:number}}
 */
export function compararImagens(baselinePath, candidatoPath, diffOutPath, opts = {}) {
  const maxDiffPixelRatio = opts.maxDiffPixelRatio ?? 0.002;
  const limiarCor = opts.limiarCor ?? 0.1;

  if (!existsSync(baselinePath)) {
    return { pass: false, semLinhaDeBase: true, ratio: null, diffPixels: null, totalPixels: null };
  }

  const base = carregarPng(baselinePath);
  const cand = carregarPng(candidatoPath);

  if (base.width !== cand.width || base.height !== cand.height) {
    return {
      pass: false,
      tamanhosDiferentes: true,
      ratio: null,
      diffPixels: null,
      totalPixels: null,
      detalhe: `base ${base.width}x${base.height} ≠ captura ${cand.width}x${cand.height}`,
    };
  }

  const { width, height } = base;
  const { PNG } = resolveDep('pngjs');
  const diff = new PNG({ width, height });
  let diffPixels = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const d = distanciaPixel(base, idx, cand, idx);
      const diferente = d > limiarCor;
      if (diferente) diffPixels++;

      // imagem de diff: pixel igual fica em cinza claro e meio transparente (dá para
      // ver a silhueta da tela por baixo); pixel diferente fica vermelho opaco.
      if (diferente) {
        diff.data[idx] = 255;
        diff.data[idx + 1] = 0;
        diff.data[idx + 2] = 0;
        diff.data[idx + 3] = 255;
      } else {
        diff.data[idx] = cand.data[idx];
        diff.data[idx + 1] = cand.data[idx + 1];
        diff.data[idx + 2] = cand.data[idx + 2];
        diff.data[idx + 3] = Math.round(cand.data[idx + 3] * 0.35);
      }
    }
  }

  const totalPixels = width * height;
  const ratio = diffPixels / totalPixels;
  const pass = ratio <= maxDiffPixelRatio;

  if (diffOutPath) {
    mkdirSync(path.dirname(diffOutPath), { recursive: true });
    writeFileSync(diffOutPath, PNG.sync.write(diff));
  }

  return { pass, ratio, diffPixels, totalPixels };
}

/**
 * Roda a comparação para toda a matriz de um manifest (gerado por capture.mjs).
 * Grava relatorio.json e relatorio.html em `relatorioDir`.
 */
export function compararMatriz({ manifest, baselineDir, candidatoDir, relatorioDir, maxDiffPixelRatio, limiarCor }) {
  mkdirSync(relatorioDir, { recursive: true });
  const itens = manifest.map((item) => {
    const baselinePath = path.join(baselineDir, item.arquivo);
    const candidatoPath = path.join(candidatoDir, item.arquivo);
    const diffPath = path.join(relatorioDir, 'diffs', item.arquivo);
    const resultado = compararImagens(baselinePath, candidatoPath, diffPath, { maxDiffPixelRatio, limiarCor });
    return { ...item, ...resultado };
  });

  const resumo = {
    total: itens.length,
    aprovadas: itens.filter((i) => i.pass).length,
    semLinhaDeBase: itens.filter((i) => i.semLinhaDeBase).length,
    reprovadas: itens.filter((i) => !i.pass && !i.semLinhaDeBase).length,
  };

  writeFileSync(path.join(relatorioDir, 'relatorio.json'), JSON.stringify({ geradoEm: new Date().toISOString(), resumo, itens }, null, 2));
  writeFileSync(path.join(relatorioDir, 'relatorio.html'), gerarHtml(resumo, itens));

  return { resumo, itens };
}

function gerarHtml(resumo, itens) {
  const linhas = itens
    .map((i) => {
      const status = i.semLinhaDeBase
        ? '<span style="color:#888">sem linha de base</span>'
        : i.pass
          ? '<span style="color:#1a7f37">OK</span>'
          : `<span style="color:#cf222e">REPROVADA (${(i.ratio * 100).toFixed(3)}% dos pixels)</span>`;
      const linkDiff = !i.semLinhaDeBase ? `<a href="diffs/${i.arquivo.replace(/\\/g, '/')}">diff</a>` : '';
      return `<tr><td>${i.app}</td><td>${i.id}</td><td>${i.estado}</td><td>${i.tamanho.largura}x${i.tamanho.altura}</td><td>${status}</td><td>${linkDiff}</td></tr>`;
    })
    .join('\n');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Regressão visual — qualidade-tela</title>
<style>body{font:14px/1.4 system-ui,sans-serif;margin:24px} table{border-collapse:collapse;width:100%} td,th{border:1px solid #ddd;padding:6px 10px;text-align:left}</style>
</head><body>
<h1>Regressão visual</h1>
<p>Aprovadas: ${resumo.aprovadas} · Reprovadas: ${resumo.reprovadas} · Sem linha de base: ${resumo.semLinhaDeBase} · Total: ${resumo.total}</p>
<table><thead><tr><th>App</th><th>Tela</th><th>Estado</th><th>Tamanho</th><th>Status</th><th></th></tr></thead>
<tbody>${linhas}</tbody></table>
</body></html>`;
}
