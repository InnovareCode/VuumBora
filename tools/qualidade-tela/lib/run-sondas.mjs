// Abre cada tela × estado × tamanho (a mesma matriz da captura) e roda as 5 sondas
// do §14.3, gravando um JSON por combinação em `saidaDir/<app>/<ID>-<estado>-<L>x<A>.sondas.json`,
// mais um resumo.json com a contagem de achados por sonda (para entrar no handoff
// sem precisar abrir 40 arquivos).

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getChromium } from './browsers.mjs';
import { iniciarServidorDev } from './dev-server.mjs';
import { garantirSessaoEDestino } from './auth-bootstrap.mjs';
import { rodarSondas } from './probes/index.mjs';

export async function rodarSondasNaMatriz({ telas, tamanhos, saidaDir }) {
  mkdirSync(saidaDir, { recursive: true });

  const chromium = getChromium();
  const browser = await chromium.launch({ headless: true });
  const servidoresPorApp = new Map();
  const resumo = [];

  try {
    for (const tela of telas) {
      if (!servidoresPorApp.has(tela.app)) {
        servidoresPorApp.set(tela.app, await iniciarServidorDev(tela.app));
      }
      const { url: baseUrl } = servidoresPorApp.get(tela.app);

      for (const estado of tela.estados) {
        for (const tamanho of tamanhos) {
          const context = await browser.newContext({
            viewport: { width: tamanho.largura, height: tamanho.altura },
            deviceScaleFactor: 2,
            reducedMotion: 'reduce',
          });
          const page = await context.newPage();
          // timeout generoso: ver o comentário equivalente em capture.mjs (1ª navegação
          // de cada app paga o custo de compilar o bundle no Metro ao vivo).
          await page.goto(baseUrl + tela.rota, { waitUntil: 'load', timeout: 60000 });
          await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
          // ver o comentário em capture.mjs: sem isto, a sonda roda numa página em branco.
          await page.waitForFunction(() => document.body.innerText.trim().length > 10, { timeout: 30000 });
          await page.waitForTimeout(700); // ver o comentário em capture.mjs (latência da identidade mock)

          // ver o comentário equivalente em capture.mjs: bootstrap de sessão mock para
          // telas atrás de `(app)` (P03, P04, M05...); não faz nada em telas públicas.
          await garantirSessaoEDestino(page, { app: tela.app, rotaDestino: tela.rota });

          if (estado === 'sem-rede') {
            await context.setOffline(true);
            await page.waitForTimeout(50);
          }

          const resultado = await rodarSondas(page);
          const nomeBase = `${tela.id}-${estado}-${tamanho.largura}x${tamanho.altura}`;
          const destDir = path.join(saidaDir, tela.app);
          mkdirSync(destDir, { recursive: true });
          writeFileSync(path.join(destDir, `${nomeBase}.sondas.json`), JSON.stringify(resultado, null, 2));

          resumo.push({
            app: tela.app,
            id: tela.id,
            estado,
            tamanho,
            achados: {
              ultrapassaViewport: resultado.geometria.ultrapassaViewport.length,
              alvosPequenos: resultado.geometria.alvosPequenos.length,
              sobreposicoes: resultado.geometria.sobreposicoes.length,
              textoTruncado: resultado.texto.truncados.length,
              contrasteReprovado: resultado.contraste.reprovados.length,
              contrasteNaoMedido: resultado.contraste.naoMedidos.length,
              semIndicadorDeFoco: resultado.foco.semIndicador.length,
              aneisDeMouse: resultado.foco.aneisDeMouse.length,
              linksComFalhaDeAtivacao: resultado.ativacaoLinks.falhas.length,
              linksComControleInvalido: resultado.ativacaoLinks.controleInvalido.length,
              corForaDoConjunto: resultado.estilo.foraDoConjuntoDeTokens.length,
              contagemAmarelo: resultado.estilo.contagemAmarelo,
              possivelLegado: resultado.estilo.possivelLegado.length,
            },
          });

          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
    for (const { close } of servidoresPorApp.values()) await close();
  }

  writeFileSync(path.join(saidaDir, 'resumo-sondas.json'), JSON.stringify({ geradoEm: new Date().toISOString(), resumo }, null, 2));
  return resumo;
}
