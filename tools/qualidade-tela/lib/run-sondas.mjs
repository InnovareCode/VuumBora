// Abre cada tela × estado × tamanho (a mesma matriz da captura) e roda as 5 sondas
// do §14.3, gravando um JSON por combinação em `saidaDir/<app>/<ID>-<estado>-<L>x<A>.sondas.json`,
// mais um resumo.json com a contagem de achados por sonda (para entrar no handoff
// sem precisar abrir 40 arquivos).

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getChromium } from './browsers.mjs';
import { iniciarServidorDev } from './dev-server.mjs';
import { abrirTela } from './abrir-tela.mjs';
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
          // mesma abertura da captura (abrir-tela.mjs): bootstrap de sessão mock para
          // telas atrás de `(app)` e, em "sem-rede", o corte de rede que chega ao NetInfo.
          const { page, semRede, fechar } = await abrirTela({ browser, baseUrl, tela, estado, tamanho });

          let resultado;
          try {
            // A sonda de ativação de links reabre a MESMA combinação do zero quando um link
            // navega sem volta (router.replace) — ver probes/ativacao-links.mjs.
            const reabrir = async () => {
              const nova = await abrirTela({ browser, baseUrl, tela, estado, tamanho });
              return { page: nova.page, fechar: nova.fechar };
            };
            resultado = await rodarSondas(page, { reabrir });
          } finally {
            await fechar();
          }
          if (semRede) resultado.semRede = semRede;

          const nomeBase = `${tela.id}-${estado}-${tamanho.largura}x${tamanho.altura}`;
          const destDir = path.join(saidaDir, tela.app);
          mkdirSync(destDir, { recursive: true });
          writeFileSync(path.join(destDir, `${nomeBase}.sondas.json`), JSON.stringify(resultado, null, 2));

          resumo.push({
            app: tela.app,
            id: tela.id,
            estado,
            tamanho,
            // só no estado sem-rede: o banner apareceu de verdade? (sem isto, "sem-rede"
            // podia ser a tela online com outro nome — achado da Íris, onda 4)
            ...(semRede ? { bannerSemRede: semRede.bannerVisivel } : {}),
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
