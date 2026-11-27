// Gera a matriz tela × estado × tamanho (padrão premium §14.2) contra um `expo start
// --web` ao vivo (Metro de desenvolvimento) — ver dev-server.mjs para o porquê de não
// ser mais um `expo export` servido estaticamente (achado Q9 da Íris, passada 8).
//
// Uma captura = abrir a tela num contexto novo do Chromium (abrir-tela.mjs: navegar,
// esperar fontes e conteúdo, bootstrap de sessão mock, e — no estado "sem-rede" — cortar
// a rede DEPOIS de carregar e fazer o corte chegar ao NetInfo web, ver sem-rede.mjs) e
// tirar o screenshot no tamanho exato do aparelho (clip), com `deviceScaleFactor: 2` e
// `reducedMotion: 'reduce'`.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getChromium, describeBrowserSetup } from './browsers.mjs';
import { iniciarServidorDev } from './dev-server.mjs';
import { abrirTela } from './abrir-tela.mjs';
import { nomeArquivo, ESTADOS } from '../screens.config.mjs';

/**
 * @param {object} opts
 * @param {import('../screens.config.mjs').TELAS} opts.telas
 * @param {Array<{largura:number,altura:number}>} opts.tamanhos
 * @param {string} opts.saidaDir pasta onde gravar <app>/<arquivo>.png
 * @param {{seletor:string, propriedade:string, valor:string}|null} [opts.mutarEstilo]
 *   só para o autoteste (controle negativo): injeta um `addStyleTag` depois da
 *   carga, para provar que o comparador detecta uma mudança visual de verdade.
 */
export async function capturarMatriz({ telas, tamanhos, saidaDir, mutarEstilo = null }) {
  mkdirSync(saidaDir, { recursive: true });

  const chromium = getChromium();
  const browser = await chromium.launch({ headless: true });

  const servidoresPorApp = new Map();
  const manifest = [];

  try {
    for (const tela of telas) {
      if (!servidoresPorApp.has(tela.app)) {
        servidoresPorApp.set(tela.app, await iniciarServidorDev(tela.app));
      }
      const { url: baseUrl } = servidoresPorApp.get(tela.app);

      for (const estado of tela.estados) {
        const bannerPorTamanho = [];

        for (const tamanho of tamanhos) {
          const { page, semRede, fechar } = await abrirTela({ browser, baseUrl, tela, estado, tamanho });

          try {
            if (mutarEstilo) {
              const conteudo = mutarEstilo.css
                ? mutarEstilo.css
                : `${mutarEstilo.seletor} { ${mutarEstilo.propriedade}: ${mutarEstilo.valor} !important; }`;
              await page.addStyleTag({ content: conteudo });
              await page.waitForTimeout(50);
            }

            const arquivo = nomeArquivo(tela, estado, tamanho);
            const destDir = path.join(saidaDir, tela.app);
            mkdirSync(destDir, { recursive: true });
            const destino = path.join(destDir, arquivo);

            await page.screenshot({
              path: destino,
              clip: { x: 0, y: 0, width: tamanho.largura, height: tamanho.altura },
            });

            const item = { app: tela.app, id: tela.id, estado, tamanho, arquivo: path.join(tela.app, arquivo) };
            // O que o corte de rede de fato produziu na tela: quem confere G-18 olha
            // `bannerVisivel` antes de aceitar a captura como prova do estado offline.
            if (semRede) {
              item.semRede = semRede;
              bannerPorTamanho.push(semRede.bannerVisivel);
            }
            manifest.push(item);
          } finally {
            await fechar();
          }
        }

        if (estado === ESTADOS.SEM_REDE) {
          const comBanner = bannerPorTamanho.filter(Boolean).length;
          console.log(
            `[qualidade-tela] ${tela.id} sem-rede: banner "Sem conexão" visível em ${comBanner}/${bannerPorTamanho.length} tamanhos` +
              (comBanner === 0 ? ' (esperado só se a tela não tiver NetworkBanner)' : ''),
          );
        }
      }
    }
  } finally {
    await browser.close();
    for (const { close } of servidoresPorApp.values()) await close();
  }

  writeFileSync(path.join(saidaDir, 'manifest.json'), JSON.stringify({
    geradoEm: new Date().toISOString(),
    navegador: describeBrowserSetup(),
    capturas: manifest,
  }, null, 2));

  return manifest;
}
