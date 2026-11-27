// Estado "sem-rede" do §14.2 — cortar a rede DEPOIS de a tela carregar, sem editar código
// do app, e garantir que o corte CHEGA à tela.
//
// Achado da Íris (onda 4, 27/11/2026): `context.setOffline(true)` sozinho NÃO chega à tela
// no Chromium. Ele põe `navigator.onLine=false` e dispara `offline` no `window`, mas o
// `@react-native-community/netinfo` 12 (web, `internal/nativeModule.web.js`) escolhe UM
// dos dois caminhos: quando `navigator.connection` existe (Chromium tem a Network
// Information API), escuta SÓ `connection.addEventListener('change', …)` e ignora
// `online`/`offline` do `window`. O Playwright não dispara esse `change`, então o
// `useNetworkStatus` nunca via offline: sem `NetworkBanner`, botões nunca desabilitavam,
// e toda captura/sonda "sem-rede" de ondas anteriores era, na prática, igual à "padrao".
//
// Correção: depois do `setOffline`, disparar `change` no próprio `navigator.connection`.
// O handler do NetInfo relê o estado na hora (`getCurrentState()` -> `navigator.onLine`,
// que já é false; `connection.type` não existe no Chromium de desktop, então o tipo cai
// em `unknown` com `isConnected=false`) e notifica os assinantes de forma síncrona.
// Em motor sem `navigator.connection` (WebKit), o NetInfo escuta `offline` do `window`,
// que o próprio `setOffline` já dispara — não há nada a fazer além dele.

/** O `NetworkBanner` (`packages/ui/src/NetworkBanner.tsx`) é `role="status"` com o texto
 * "Sem conexão. Tentando reconectar…". Não procuramos testID: cada tela passa o seu. */
function bannerNaTela() {
  return Array.from(document.querySelectorAll('[role="status"]')).some((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && /sem conex/i.test(el.textContent || '');
  });
}

/**
 * Corta a rede do contexto e faz o corte chegar ao NetInfo web.
 *
 * @param {import('playwright').BrowserContext} context
 * @param {import('playwright').Page} page
 * @param {{ esperaBannerMs?: number }} [opts] quanto esperar o banner aparecer. Telas sem
 *   `NetworkBanner` (P10, P13…) esgotam esse prazo à toa, por isso ele é curto: o NetInfo
 *   notifica de forma síncrona e o banner aparece no render seguinte (medido: < 300 ms).
 * @returns {Promise<{onLine:boolean, temConnection:boolean, disparouChange:boolean,
 *   bannerVisivel:boolean, textoSemConexao:boolean}>} o que de fato aconteceu — vai para
 *   o manifesto/JSON das sondas, para ninguém aceitar "sem-rede" sem ver se chegou.
 */
export async function aplicarSemRede(context, page, { esperaBannerMs = 2000 } = {}) {
  await context.setOffline(true);

  const disparo = await page.evaluate(() => {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    let disparouChange = false;
    if (c && typeof c.dispatchEvent === 'function') {
      c.dispatchEvent(new Event('change'));
      disparouChange = true;
    }
    return { onLine: navigator.onLine, temConnection: Boolean(c), disparouChange };
  });

  if (disparo.onLine) {
    // setOffline não pegou: a captura sairia como "padrao" com nome de "sem-rede".
    throw new Error('[qualidade-tela] context.setOffline(true) não pôs navigator.onLine=false — o estado sem-rede não foi aplicado.');
  }

  const bannerVisivel = await page
    .waitForFunction(bannerNaTela, null, { timeout: esperaBannerMs, polling: 50 })
    .then(() => true)
    .catch(() => false);

  // folga para o layout assentar depois do banner empurrar o conteúdo para baixo
  await page.waitForTimeout(bannerVisivel ? 250 : 50);

  const textoSemConexao = await page.evaluate(() => /sem conex/i.test(document.body.innerText));

  return { ...disparo, bannerVisivel, textoSemConexao };
}
