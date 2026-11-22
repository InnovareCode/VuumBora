// Entrega um Chromium e um WebKit utilizáveis a partir do Playwright já instalado na
// máquina (via cache do npx, ver resolve-dep.mjs), SEM declarar "playwright" no
// package.json do projeto.
//
// Armadilha real encontrada ao construir isto (22/11/2026): o pacote "playwright"
// que o `npx` tem em cache espera uma revisão exata de navegador (lida do
// `playwright-core/browsers.json` daquele pacote). Se a revisão instalada em
// `%LOCALAPPDATA%\ms-playwright` (Windows) for de uma versão diferente de
// Playwright, o lançamento falha com "Executable doesn't exist", mesmo com o
// Chromium/WebKit presentes no disco. Por isso esta função varre TODOS os pacotes
// em cache do npx e escolhe o que casa com um navegador já instalado, em vez de
// assumir que "qualquer cópia do playwright" serve.
//
// WebKit é mais frágil: nesta máquina, nenhuma cópia em cache do Playwright tinha a
// revisão exata do WebKit instalado. Nesse caso, força `executablePath` apontando
// para a pasta `webkit-<revisão>` mais nova encontrada — funciona para abrir páginas
// e tirar screenshot, mas não é a combinação testada pelo próprio Playwright: cada
// chamador registra isso no relatório (ver `describeBrowserSetup()`).

import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { findCachedCandidates, resolveDep } from './resolve-dep.mjs';

const require = createRequire(import.meta.url);

function defaultBrowsersPath() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (process.platform === 'win32') return path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  return path.join(os.homedir(), '.cache', 'ms-playwright');
}

const browsersPath = defaultBrowsersPath();

function installedRevisions(prefix) {
  if (!existsSync(browsersPath)) return [];
  return readdirSync(browsersPath)
    .filter((name) => name.startsWith(prefix + '-'))
    .map((name) => name.slice(prefix.length + 1))
    .filter((rev) => /^\d+$/.test(rev))
    .map(Number)
    .sort((a, b) => b - a);
}

function revisionOf(browsersJson, name) {
  const entry = browsersJson.browsers.find((b) => b.name === name);
  return entry ? Number(entry.revision) : null;
}

/**
 * Procura, entre todos os "playwright"/"playwright-core" em cache do npx, um cujo
 * browsers.json aponte para uma revisão de `browserKey` já instalada em
 * `browsersPath`. Devolve { apiDir, revision } ou null. `apiDir` é a pasta que tem
 * `chromium`/`webkit` exportados (tanto "playwright" quanto "playwright-core" têm).
 */
function findMatchingPlaywright(browserKey, folderPrefix) {
  const installed = new Set(installedRevisions(folderPrefix));
  if (installed.size === 0) return null;

  const seen = new Set();
  const candidates = [...findCachedCandidates('playwright'), ...findCachedCandidates('playwright-core')];

  for (const modDir of candidates) {
    const coreDir = modDir.endsWith('playwright-core') ? modDir : path.join(path.dirname(modDir), 'playwright-core');
    if (seen.has(coreDir)) continue;
    seen.add(coreDir);
    const browsersJsonPath = path.join(coreDir, 'browsers.json');
    if (!existsSync(browsersJsonPath)) continue;
    try {
      const browsersJson = require(browsersJsonPath);
      const rev = revisionOf(browsersJson, browserKey);
      if (rev !== null && installed.has(rev)) {
        return { apiDir: modDir, revision: rev };
      }
    } catch {
      // candidato malformado: ignora e segue tentando os demais
    }
  }
  return null;
}

function highestLocalRevisionDir(prefix) {
  const revs = installedRevisions(prefix);
  if (revs.length === 0) return null;
  return path.join(browsersPath, `${prefix}-${revs[0]}`);
}

function findExecutable(dir, candidates) {
  if (!dir || !existsSync(dir)) return null;
  for (const rel of candidates) {
    const full = path.join(dir, rel);
    if (existsSync(full)) return full;
  }
  return null;
}

function withExecutablePath(browserType, executablePath) {
  const originalLaunch = browserType.launch.bind(browserType);
  return { ...browserType, launch: (options = {}) => originalLaunch({ executablePath, ...options }) };
}

const diagnostics = { chromium: null, webkit: null };

/** Chromium: usa a cópia do Playwright cuja revisão casa com o Chromium instalado. */
export function getChromium() {
  const match = findMatchingPlaywright('chromium', 'chromium');
  if (match) {
    diagnostics.chromium = `playwright em cache (revisão ${match.revision}, casou com chromium-${match.revision} instalado)`;
    return require(match.apiDir).chromium;
  }
  const pw = resolveDep('playwright');
  const dir = highestLocalRevisionDir('chromium');
  const exe = findExecutable(dir, [
    path.join('chrome-win64', 'chrome.exe'),
    path.join('chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    path.join('chrome-linux', 'chrome'),
  ]);
  diagnostics.chromium = exe
    ? `sem revisão exata em cache; forçando executablePath=${exe}`
    : 'nenhum Chromium instalado foi encontrado';
  return exe ? withExecutablePath(pw.chromium, exe) : pw.chromium;
}

/** WebKit: quase sempre cai no caminho forçado (ver cabeçalho do arquivo). */
export function getWebkit() {
  const match = findMatchingPlaywright('webkit', 'webkit');
  if (match) {
    diagnostics.webkit = `playwright em cache (revisão ${match.revision}, casou com webkit-${match.revision} instalado)`;
    return require(match.apiDir).webkit;
  }
  const pw = resolveDep('playwright');
  const dir = highestLocalRevisionDir('webkit');
  const exe = findExecutable(dir, ['Playwright.exe', 'pw_run.sh', path.join('minibrowser-gtk', 'MiniBrowser')]);
  diagnostics.webkit = exe
    ? `NENHUMA cópia em cache do Playwright tem a revisão exata do WebKit instalado — forçando ` +
      `executablePath=${exe}. Não é a combinação testada pelo Playwright; se uma sonda de foco falhar, é o motivo.`
    : 'nenhum WebKit instalado foi encontrado';
  return exe ? withExecutablePath(pw.webkit, exe) : pw.webkit;
}

/** Texto curto para entrar no relatório, explicando qual navegador/revisão foi usado. */
export function describeBrowserSetup() {
  return diagnostics;
}
