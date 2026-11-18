// Renderizador dos geradores de arte. Uso: node render.js <arquivo.html[?k=v]> <saida.png> <largura> <altura> [dpr] [1=pagina inteira]
// O repo nao tem playwright-core; aponte PLAYWRIGHT_CORE para uma instalacao existente.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
(async () => {
  const [html, out, w, h, dpr, full] = process.argv.slice(2);
  const exe = process.env.CHROMIUM_EXE || 'C:/Users/Personal Computer/AppData/Local/ms-playwright/chromium-1254/chrome-win64/chrome.exe';
  const b = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
  const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +(dpr || 1) });
  p.on('pageerror',e=>console.error('PAGEERR',e.message));p.on('console',m=>console.log('CONSOLE',m.text()));
  await p.goto((()=>{const [f,q]=html.split('?');return pathToFileURL(path.resolve(f)).href+(q?'?'+q:'')})());
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  if (process.env.MEASURE) console.log(JSON.stringify(await p.evaluate(process.env.MEASURE), null, 0));
  await p.screenshot({ path: out, fullPage: full === '1', omitBackground: process.env.ALPHA === '1' });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
