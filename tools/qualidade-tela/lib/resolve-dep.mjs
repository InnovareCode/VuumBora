// Resolve pacotes npm (ex.: "playwright", "pngjs") sem que este projeto precise
// declará-los em package.json/package-lock.json (pedido do Vulcano: não tocar nesses
// dois arquivos porque a Lyra é a única pessoa no lock agora).
//
// Ordem de busca:
//   1. `require(pkgName)` normal — funciona se um dia a dependência entrar de verdade
//      no node_modules do projeto (ex.: alguém decide declarar em
//      tools/qualidade-tela/package.json, fora do workspace do npm).
//   2. Cache do `npx` (`npm config get cache`/_npx/<hash>/node_modules/<pkgName>`):
//      toda vez que alguém roda `npx playwright ...` nesta máquina, o npm baixa o
//      pacote e deixa em cache ali, sem instalar no projeto. Se já rodou uma vez,
//      a ferramenta reaproveita.
//
// Se nada for encontrado, falha com uma mensagem que diz exatamente o que fazer —
// nunca falha em silêncio.

import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);

const moduleCache = new Map();
const pathCache = new Map();

function tryRequire(id) {
  try {
    return require(id);
  } catch {
    return null;
  }
}

let npxCacheRootMemo;
function npxCacheRoot() {
  if (npxCacheRootMemo !== undefined) return npxCacheRootMemo;
  try {
    const cache = execSync('npm config get cache', { encoding: 'utf8' }).trim();
    npxCacheRootMemo = path.join(cache, '_npx');
  } catch {
    npxCacheRootMemo = null;
  }
  return npxCacheRootMemo;
}

/** Lista candidatos (pastas dentro do cache do npx) que têm `node_modules/<pkgName>`. */
export function findCachedCandidates(pkgName) {
  const root = npxCacheRoot();
  if (!root || !existsSync(root)) return [];
  const out = [];
  for (const entry of readdirSync(root)) {
    const candidate = path.join(root, entry, 'node_modules', pkgName);
    if (existsSync(candidate)) out.push(candidate);
  }
  return out;
}

function helpMessage(pkgName) {
  return (
    `Não encontrei o pacote "${pkgName}" nem em node_modules local nem no cache do npx.\n` +
    `Rode "npx ${pkgName} --version" (ou um comando equivalente do pacote) uma vez nesta máquina para\n` +
    `baixar e deixar em cache, ou peça ao Atlas para declarar "${pkgName}" como devDependency dentro de\n` +
    `tools/qualidade-tela/ (um package.json próprio, fora do workspace do npm — não altera o lock da raiz).`
  );
}

/** Devolve o módulo já carregado (require). Lança erro explicativo se não achar. */
export function resolveDep(pkgName) {
  if (moduleCache.has(pkgName)) return moduleCache.get(pkgName);

  let mod = tryRequire(pkgName);
  if (!mod) {
    for (const candidate of findCachedCandidates(pkgName)) {
      mod = tryRequire(candidate);
      if (mod) break;
    }
  }
  if (!mod) throw new Error(helpMessage(pkgName));

  moduleCache.set(pkgName, mod);
  return mod;
}

/** Devolve o caminho absoluto do pacote resolvido (útil para montar sub-caminhos). */
export function resolveDepPath(pkgName) {
  if (pathCache.has(pkgName)) return pathCache.get(pkgName);

  let resolved = null;
  try {
    resolved = require.resolve(pkgName);
    resolved = path.dirname(resolved);
  } catch {
    for (const candidate of findCachedCandidates(pkgName)) {
      if (tryRequire(candidate)) {
        resolved = candidate;
        break;
      }
    }
  }
  if (!resolved) throw new Error(helpMessage(pkgName));

  pathCache.set(pkgName, resolved);
  return resolved;
}
