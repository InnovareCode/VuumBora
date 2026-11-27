// Abre UMA combinação tela × estado × tamanho num contexto novo do Chromium e deixa a
// página pronta para fotografar ou sondar. Era código duplicado em capture.mjs e
// run-sondas.mjs; virou função porque a sonda de ativação de links agora precisa
// REABRIR a mesma tela do zero (link que faz `router.replace` não volta com goBack —
// achado da Íris, onda 4) e a reabertura tem que ser idêntica à abertura original,
// inclusive o corte de rede no estado "sem-rede".

import { garantirSessaoEDestino } from './auth-bootstrap.mjs';
import { aplicarSemRede } from './sem-rede.mjs';
import { ESTADOS } from '../screens.config.mjs';

/**
 * @param {object} opts
 * @param {import('playwright').Browser} opts.browser
 * @param {string} opts.baseUrl  URL do `expo start --web` do app da tela
 * @param {{app:string, rota:string}} opts.tela
 * @param {string} opts.estado   'padrao' | 'sem-rede'
 * @param {{largura:number, altura:number}} opts.tamanho
 * @returns {Promise<{context, page, semRede: object|null, fechar: () => Promise<void>}>}
 */
export async function abrirTela({ browser, baseUrl, tela, estado, tamanho }) {
  const context = await browser.newContext({
    viewport: { width: tamanho.largura, height: tamanho.altura },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });

  try {
    const page = await context.newPage();

    // timeout generoso: contra o Metro ao vivo, a PRIMEIRA navegação de cada app paga o
    // custo de compilar o bundle inteiro no servidor (medido: ~11s para um bundle de
    // ~13MB, não-minificado, em modo --dev) — as rotas seguintes do MESMO app
    // reaproveitam o cache do Metro e voltam a ser quase instantâneas.
    await page.goto(baseUrl + tela.rota, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    // Achado real (22/11/2026): `waitUntil: 'load'` só garante que o HTML e os scripts
    // baixaram — o bundle do RN Web (3MB+) ainda leva bem mais que 150ms para executar e
    // montar a árvore. Sem esperar texto de verdade aparecer, a captura sai em branco.
    // (O 2º argumento de waitForFunction é o ARGUMENTO da função; as opções são o 3º.)
    await page.waitForFunction(() => document.body.innerText.trim().length > 10, null, { timeout: 30000 });
    // Folga para o layout assentar E para a identidade mock (latência artificial de
    // 350ms, `identityClient.ts`) resolver o "Carregando os Termos..." do cadastro —
    // sem isto, a captura "padrao" do P02b/M02 pega o estado de carregamento por acidente.
    await page.waitForTimeout(700);

    // Telas atrás de `(app)` (P03, P04, M05...) caíram na tela de entrada: cria conta
    // mock, loga e navega pelo cliente até `tela.rota` (ver auth-bootstrap.mjs). Não faz
    // nada para telas públicas (P01, P02a, P02b, M01, M02).
    await garantirSessaoEDestino(page, { app: tela.app, rotaDestino: tela.rota });

    // Sem-rede: cortar DEPOIS de carregar (nunca editando código) e fazer o corte chegar
    // ao NetInfo web — ver sem-rede.mjs.
    const semRede = estado === ESTADOS.SEM_REDE ? await aplicarSemRede(context, page) : null;

    return { context, page, semRede, fechar: () => context.close() };
  } catch (err) {
    await context.close().catch(() => {});
    throw err;
  }
}
