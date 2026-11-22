// Gera a matriz tela × estado × tamanho (padrão premium §14.2) contra um `expo start
// --web` ao vivo (Metro de desenvolvimento) — ver dev-server.mjs para o porquê de não
// ser mais um `expo export` servido estaticamente (achado Q9 da Íris, passada 8).
//
// Uma captura = abrir um contexto novo do Chromium, navegar até a rota, esperar
// fontes carregarem, aplicar o estado (hoje: nada, para "padrao"; cortar a rede
// DEPOIS de carregar, para "sem-rede" — nunca editando código, só
// `context.setOffline(true)`, que é literalmente o parâmetro de teste que o §14.2
// pede), e tirar o screenshot no tamanho exato do aparelho (clip), com
// `deviceScaleFactor: 2` e `reducedMotion: 'reduce'`.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getChromium, describeBrowserSetup } from './browsers.mjs';
import { iniciarServidorDev } from './dev-server.mjs';
import { garantirSessaoEDestino } from './auth-bootstrap.mjs';
import { nomeArquivo } from '../screens.config.mjs';

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
        for (const tamanho of tamanhos) {
          const context = await browser.newContext({
            viewport: { width: tamanho.largura, height: tamanho.altura },
            deviceScaleFactor: 2,
            reducedMotion: 'reduce',
          });
          const page = await context.newPage();

          // timeout generoso: contra o Metro ao vivo, a PRIMEIRA navegação de cada app
          // paga o custo de compilar o bundle inteiro no servidor (medido: ~11s para um
          // bundle de ~13MB, não-minificado, em modo --dev) — as rotas seguintes do
          // MESMO app reaproveitam o cache do Metro e voltam a ser quase instantâneas.
          await page.goto(baseUrl + tela.rota, { waitUntil: 'load', timeout: 60000 });
          await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
          // Achado real (22/11/2026): `waitUntil: 'load'` só garante que o HTML e os
          // scripts baixaram — o bundle do RN Web (3MB+) ainda leva bem mais que
          // 150ms para executar e montar a árvore. Sem esperar texto de verdade
          // aparecer, a captura sai em branco (uma página toda branca passa
          // despercebida se ninguém abrir o PNG — foi descoberto só ao depurar
          // uma sonda que achava zero elementos).
          await page.waitForFunction(() => document.body.innerText.trim().length > 10, { timeout: 30000 });
          // Folga para o layout assentar E para a identidade mock (latência artificial de
          // 350ms, `identityClient.ts`) resolver o "Carregando os Termos..." do cadastro —
          // sem isto, a captura "padrao" do P02b/M02 pega o estado de carregamento por acidente.
          await page.waitForTimeout(700);

          // Telas atrás de `(app)` (P03, P04, M05...) caíram na tela de entrada: cria
          // conta mock, loga e navega pelo cliente até `tela.rota` (ver auth-bootstrap.mjs).
          // Não faz nada para telas públicas (P01, P02a, P02b, M01, M02).
          await garantirSessaoEDestino(page, { app: tela.app, rotaDestino: tela.rota });

          if (estado === 'sem-rede') {
            await context.setOffline(true);
            await page.waitForTimeout(50);
          }

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

          manifest.push({ app: tela.app, id: tela.id, estado, tamanho, arquivo: path.join(tela.app, arquivo) });

          await context.close();
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
