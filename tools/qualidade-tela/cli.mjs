#!/usr/bin/env node
// Ferramenta do portão de qualidade de tela (docs/padrao-premium-telas.md §14).
// Uso: node cli.mjs <comando> [opções]. Ver docs/qualidade-tela.md para o passo a
// passo completo; `node cli.mjs ajuda` imprime este resumo.

import { mkdirSync, cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { TELAS, TAMANHOS, telaPorId } from './screens.config.mjs';
import { BASELINE_DIR, SAIDA_DIR } from './lib/paths.mjs';
import { capturarMatriz } from './lib/capture.mjs';
import { compararMatriz } from './lib/compare.mjs';
import { rodarSondasNaMatriz } from './lib/run-sondas.mjs';
import { montarLadoALado } from './lib/side-by-side.mjs';

const [, , comando, ...resto] = process.argv;

function opcoes(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const chave = args[i].slice(2);
      const valor = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      out[chave] = valor;
    }
  }
  return out;
}

function filtrarTelas(opt) {
  if (!opt.telas) return TELAS;
  const ids = String(opt.telas).split(',').map((s) => s.trim());
  return ids.map(telaPorId);
}

async function cmdCapturar(opt) {
  const telas = filtrarTelas(opt);
  const saidaDir = opt.saida ? path.resolve(opt.saida) : path.join(SAIDA_DIR, 'capturas');
  rmSync(saidaDir, { recursive: true, force: true });
  const manifest = await capturarMatriz({ telas, tamanhos: TAMANHOS, saidaDir });
  console.log(`[qualidade-tela] ${manifest.length} capturas em ${saidaDir}`);
}

async function cmdLinhaBase(opt) {
  const origem = opt.de ? path.resolve(opt.de) : path.join(SAIDA_DIR, 'capturas');
  if (!existsSync(origem)) throw new Error(`Pasta de capturas não existe: ${origem}. Rode "capturar" antes.`);
  mkdirSync(BASELINE_DIR, { recursive: true });
  cpSync(origem, BASELINE_DIR, { recursive: true });
  console.log(`[qualidade-tela] linha de base atualizada em ${BASELINE_DIR} (a partir de ${origem}).`);
  console.log('[qualidade-tela] isto é uma promoção manual — só rode depois de alguém aprovar as capturas.');
}

async function cmdComparar(opt) {
  const telas = filtrarTelas(opt);
  const candidatoDir = opt.capturas ? path.resolve(opt.capturas) : path.join(SAIDA_DIR, 'capturas');
  const baselineDir = opt['linha-base'] ? path.resolve(opt['linha-base']) : BASELINE_DIR;
  const relatorioDir = path.join(SAIDA_DIR, 'relatorios', new Date().toISOString().replace(/[:.]/g, '-'));

  // reconstroi o manifest a partir da config em vez de depender só do manifest.json gravado,
  // para o comando funcionar mesmo apontando para uma pasta de linha de base como "candidato".
  const manifest = [];
  for (const tela of telas) {
    for (const estado of tela.estados) {
      for (const tamanho of TAMANHOS) {
        manifest.push({ app: tela.app, id: tela.id, estado, tamanho, arquivo: path.join(tela.app, `${tela.id}-${estado}-${tamanho.largura}x${tamanho.altura}.png`) });
      }
    }
  }

  const { resumo } = compararMatriz({ manifest, baselineDir, candidatoDir, relatorioDir, maxDiffPixelRatio: opt.limite ? Number(opt.limite) : undefined });
  console.log(`[qualidade-tela] comparação: ${resumo.aprovadas} ok, ${resumo.reprovadas} reprovadas, ${resumo.semLinhaDeBase} sem linha de base.`);
  console.log(`[qualidade-tela] relatório em ${relatorioDir}/relatorio.html`);
  if (resumo.reprovadas > 0) process.exitCode = 1;
}

async function cmdSondas(opt) {
  const telas = filtrarTelas(opt);
  const saidaDir = opt.saida ? path.resolve(opt.saida) : path.join(SAIDA_DIR, 'sondas');
  const resumo = await rodarSondasNaMatriz({ telas, tamanhos: TAMANHOS, saidaDir });
  console.log(`[qualidade-tela] sondas rodadas em ${resumo.length} combinações; resumo em ${saidaDir}/resumo-sondas.json`);
}

async function cmdLadoALado(opt) {
  const telas = filtrarTelas(opt);
  const capturaDir = opt.capturas ? path.resolve(opt.capturas) : path.join(SAIDA_DIR, 'capturas');
  const saidaDir = path.join(SAIDA_DIR, 'lado-a-lado');
  const montadas = [];
  const puladas = [];
  const erros = [];
  // Uma tela sem prancha (a ficha diz que G-07b não se aplica) é PULADA com aviso; um
  // erro numa tela (prancha declarada mas ausente, captura que falta) não derruba as
  // outras — junta tudo e sai com código 1 no fim, para o `tudo` seguir até o comparar.
  for (const tela of telas) {
    try {
      const destino = montarLadoALado(tela, capturaDir, saidaDir);
      if (destino === null) {
        puladas.push(tela.id);
        console.log(`[qualidade-tela] G-07b de ${tela.id}: pulada — sem prancha em screens.config.mjs (G-07b não se aplica a esta tela).`);
      } else {
        montadas.push(tela.id);
        console.log(`[qualidade-tela] G-07b de ${tela.id}: ${destino}`);
      }
    } catch (err) {
      erros.push(tela.id);
      console.error(`[qualidade-tela] G-07b de ${tela.id}: ERRO — ${err.message}`);
    }
  }
  console.log(
    `[qualidade-tela] G-07b: ${montadas.length} montadas, ${puladas.length} puladas sem prancha` +
      (puladas.length ? ` (${puladas.join(', ')})` : '') +
      `, ${erros.length} com erro${erros.length ? ` (${erros.join(', ')})` : ''}.`,
  );
  if (erros.length > 0) process.exitCode = 1;
}

async function cmdAutoteste() {
  const { default: autoteste } = await import('./lib/autoteste.mjs');
  await autoteste();
  await cmdAutotesteLinks();
}

async function cmdAutotesteLinks() {
  const { autotesteLinks } = await import('./lib/autoteste-links.mjs');
  if (!(await autotesteLinks())) process.exitCode = 1;
}

async function cmdTudo(opt) {
  await cmdCapturar(opt);
  await cmdSondas(opt);
  await cmdLadoALado(opt);
  if (existsSync(BASELINE_DIR)) {
    await cmdComparar(opt);
  } else {
    console.log('[qualidade-tela] ainda não há linha de base — rode "linha-base" depois de aprovar estas capturas.');
  }
}

function ajuda() {
  console.log(`
Comandos:
  capturar [--telas P01,M01] sobe "expo start --web" ao vivo dos dois apps (Metro de
                             desenvolvimento, VUUMBORA_BUILD_PROFILE=development) e
                             gera a matriz tela x estado x tamanho -> .saida/capturas
  linha-base [--de <dir>]    promove capturas para a linha de base aprovada (.baseline)
  comparar [--telas ...] [--capturas <dir>] [--linha-base <dir>] [--limite 0.002]
  sondas [--telas ...]       estilo, geometria, texto, contraste e foco (§14.3) — também sobe o Metro ao vivo
  lado-a-lado [--telas ...]  G-07b: recorte da prancha + captura 390x844 lado a lado
  autoteste                  controle negativo: injeta uma mudança visual e prova que o comparador detecta
                             (e roda o autoteste-links no fim)
  autoteste-links            controle negativo da sonda de links (página falsa, sem Metro, segundos)
  tudo                       capturar + sondas + lado-a-lado + comparar (se houver linha de base)
`);
}

try {
  const opt = opcoes(resto);
  switch (comando) {
    case 'capturar': await cmdCapturar(opt); break;
    case 'linha-base': await cmdLinhaBase(opt); break;
    case 'comparar': await cmdComparar(opt); break;
    case 'sondas': await cmdSondas(opt); break;
    case 'lado-a-lado': await cmdLadoALado(opt); break;
    case 'autoteste': await cmdAutoteste(); break;
    case 'autoteste-links': await cmdAutotesteLinks(); break;
    case 'tudo': await cmdTudo(opt); break;
    default: ajuda();
  }
} catch (err) {
  console.error('[qualidade-tela] ERRO:', err.stack ?? err.message);
  process.exitCode = 1;
}
