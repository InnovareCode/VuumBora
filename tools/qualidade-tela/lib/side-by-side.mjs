// G-07b: "uma imagem composta com o recorte da prancha à esquerda e a captura
// 390×844 da tela à direita, na mesma altura." Usa sempre a captura 390×844 do
// estado "padrao" (é a comparação de layout do alvo visual, não de estado).
//
// Esta função só MONTA a imagem e o gabarito da tabela de 8 linhas; quem preenche
// "confere/diverge" é um humano (Íris/Apolo), exatamente como o §14.1, G-07b, pede
// ("Quem verifica preenche uma tabela..."). A ferramenta não julga layout.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { resolveDep } from './resolve-dep.mjs';
import { recortar, redimensionar, ladoALado } from './image-utils.mjs';
import { PRANCHAS_DIR } from './paths.mjs';
import { nomeArquivo } from '../screens.config.mjs';

const LINHAS_TABELA = [
  'ordem dos blocos de cima para baixo',
  'quantidade e posição de cartões',
  'proporção dos cartões (altura ÷ largura, ±10%)',
  'posição e largura do CTA',
  'ícones (mesmo significado e mesma posição)',
  'barra inferior (existe ou não, quantas abas)',
  'contagem de amarelo',
  'ilustração ou mapa (onde fica e quanto ocupa, ±10% da altura)',
];

/**
 * A tela tem prancha para o G-07b? Várias não têm, por decisão da própria ficha ("sem
 * recorte na prancha — G-07b não se aplica": P07, P07b, P10, P11b, M10…) e simplesmente
 * não declaram `pranchaArquivo`/`recortePrancha` em screens.config.mjs. Declarar só um
 * dos dois é erro de configuração, não "sem prancha".
 * @returns {boolean}
 */
export function temPrancha(tela) {
  const temArquivo = Boolean(tela.pranchaArquivo);
  const temRecorte = Boolean(tela.recortePrancha);
  if (temArquivo !== temRecorte) {
    throw new Error(
      `${tela.id}: configuração de prancha incompleta em screens.config.mjs — ` +
        `pranchaArquivo e recortePrancha vão juntos (ou nenhum dos dois, se G-07b não se aplica).`,
    );
  }
  return temArquivo;
}

/** Monta o G-07b da tela. Devolve o caminho da imagem, ou `null` se a tela não tem
 * prancha (ver `temPrancha`) — quem chama decide como avisar. */
export function montarLadoALado(tela, capturaDir, saidaDir) {
  if (!temPrancha(tela)) return null;
  const { PNG } = resolveDep('pngjs');
  const pranchaPath = path.join(PRANCHAS_DIR, tela.pranchaArquivo);
  if (!existsSync(pranchaPath)) {
    throw new Error(`Prancha não encontrada: ${pranchaPath}`);
  }
  const tamanho390 = { largura: 390, altura: 844 };
  const capturaPath = path.join(capturaDir, tela.app, nomeArquivo(tela, 'padrao', tamanho390));
  if (!existsSync(capturaPath)) {
    throw new Error(`Captura 390x844 "padrao" não encontrada para ${tela.id}: ${capturaPath} (rode a captura primeiro)`);
  }

  const prancha = PNG.sync.read(readFileSync(pranchaPath));
  const recorte = recortar(prancha, {
    x0: tela.recortePrancha.x0,
    y0: tela.recortePrancha.y0,
    x1: tela.recortePrancha.x1,
    y1: tela.recortePrancha.y1,
  });

  const captura = PNG.sync.read(readFileSync(capturaPath)); // 780x1688 (deviceScaleFactor 2)
  const capturaLogica = redimensionar(captura, tamanho390.largura, tamanho390.altura); // volta a 390x844

  // mesma altura: escala o recorte da prancha para a altura da captura (844), mantendo proporção
  const escala = capturaLogica.height / recorte.height;
  const recorteEscalado = redimensionar(recorte, Math.round(recorte.width * escala), capturaLogica.height);

  const composta = ladoALado(recorteEscalado, capturaLogica);

  mkdirSync(saidaDir, { recursive: true });
  const destino = path.join(saidaDir, `${tela.id}-lado-a-lado.png`);
  writeFileSync(destino, PNG.sync.write(composta));

  const tabela = LINHAS_TABELA.map((item, i) => `| ${i + 1} | ${item} | a verificar | |`).join('\n');
  const gabarito =
    `# G-07b · ${tela.id} (${tela.app})\n\n` +
    `Imagem: ${tela.id}-lado-a-lado.png (recorte da prancha à esquerda, captura 390x844 "padrao" à direita)\n\n` +
    `Preencher "confere" ou "diverge (motivo)" em cada linha. Toda "diverge" precisa citar uma linha da ` +
    `tabela de divergências (docs/padrao-premium-telas.md §18.2, D-xx) ou uma regra do padrão — sem isso, reprova (G-07b).\n\n` +
    `| # | Critério | Confere / diverge | Motivo (D-xx ou regra) |\n|---|---|---|---|\n${tabela}\n`;
  writeFileSync(path.join(saidaDir, `${tela.id}-lado-a-lado.md`), gabarito);

  return destino;
}
