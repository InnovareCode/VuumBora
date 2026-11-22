// Controle negativo pedido no aceite: prova que o comparador detecta uma mudança
// visual de verdade, em vez de ser um "sempre aprova" disfarçado. Não edita
// nenhum arquivo do app — a mutação é um `page.addStyleTag()` injetado em tempo de
// execução (ver `mutarEstilo` em capture.mjs), então nada aqui deixa rastro em
// apps/* nem precisa ser revertido.
//
// Roda em 3 passos, só com P01 (boas-vindas) em 390x844, para ficar rápido:
//   1. captura A (linha de base do autoteste)
//   2. captura B, idêntica a A -> comparar(A, B) tem que dar OK (ratio ~0)
//   3. captura C, com o CTA pintado de um verde berrante -> comparar(A, C) tem
//      que dar REPROVADO (ratio > 0,2%)
// Se (2) reprovar ou (3) passar, o autoteste falha alto (exit 1): o comparador
// está quebrado e ninguém deveria confiar na regressão visual até corrigir.

import { rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { telaPorId } from '../screens.config.mjs';
import { capturarMatriz } from './capture.mjs';
import { compararImagens } from './compare.mjs';
import { SAIDA_DIR } from './paths.mjs';

const TAMANHO = [{ largura: 390, altura: 844 }];

export default async function autoteste() {
  const tela = telaPorId('P01');
  const base = path.join(SAIDA_DIR, 'autoteste');
  rmSync(base, { recursive: true, force: true });
  mkdirSync(base, { recursive: true });

  const dirA = path.join(base, 'a-linha-de-base');
  const dirB = path.join(base, 'b-identica');
  const dirC = path.join(base, 'c-mutada');

  console.log('[autoteste] capturando A (referência)...');
  await capturarMatriz({ telas: [tela], tamanhos: TAMANHO, saidaDir: dirA });

  console.log('[autoteste] capturando B (deveria sair igual a A)...');
  await capturarMatriz({ telas: [tela], tamanhos: TAMANHO, saidaDir: dirB });

  console.log('[autoteste] capturando C (com uma mudança visual injetada)...');
  await capturarMatriz({
    telas: [tela],
    tamanhos: TAMANHO,
    saidaDir: dirC,
    // marca um quadrado sólido no canto: muda pixels de verdade independente de como
    // o CTA é desenhado por baixo (gradiente, SVG, View absoluta etc.)
    mutarEstilo: { css: 'body::after { content: ""; position: fixed; top: 24px; left: 24px; width: 120px; height: 120px; background: #ff00ff; z-index: 999999; }' },
  });

  const arquivo = path.join(tela.app, `${tela.id}-padrao-390x844.png`);

  const resultadoIgual = compararImagens(path.join(dirA, arquivo), path.join(dirB, arquivo), path.join(base, 'diff-b.png'));
  const resultadoMutado = compararImagens(path.join(dirA, arquivo), path.join(dirC, arquivo), path.join(base, 'diff-c.png'));

  console.log(`[autoteste] A vs B (deveria passar): pass=${resultadoIgual.pass} ratio=${resultadoIgual.ratio}`);
  console.log(`[autoteste] A vs C (deveria reprovar): pass=${resultadoMutado.pass} ratio=${resultadoMutado.ratio}`);

  const ok = resultadoIgual.pass === true && resultadoMutado.pass === false;
  if (!ok) {
    console.error('[autoteste] FALHOU: o comparador não se comportou como esperado — não confie na regressão visual até investigar.');
    process.exitCode = 1;
    return;
  }
  console.log('[autoteste] OK: comparação idêntica passou e a mudança injetada foi detectada (controle negativo confirmado).');
}
