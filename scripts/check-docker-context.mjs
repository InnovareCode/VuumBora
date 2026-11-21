#!/usr/bin/env node
/**
 * Guarda executável: os `COPY` do Dockerfile do site e o `.dockerignore` são
 * dois lados da mesma decisão, e precisam concordar.
 *
 * Por que existe: em 19/11/2026 o deploy quebrou DUAS vezes seguidas pelo
 * mesmo motivo de fundo — o site passou a importar `@vuumbora/api-client`
 * (que puxa `@vuumbora/domain`) e a imagem não os tinha.
 *
 *   1ª falha: o Dockerfile nem copiava os pacotes.
 *             → "Module not found: Can't resolve '@vuumbora/api-client/waitlist'"
 *   2ª falha: o Dockerfile copiava, e o `.dockerignore` os excluía do contexto.
 *             → "CopyIgnoredFile ... excluded by .dockerignore"
 *
 * As duas só apareceram no servidor, minutos depois do push, porque nesta
 * máquina não há Docker para construir a imagem. Este script é a conferência
 * que dá para fazer SEM Docker: lê os dois arquivos e cruza.
 *
 * O que ele NÃO faz: construir a imagem. Um build verde aqui não promete um
 * deploy verde — promete que o contexto e a lista de cópia não se contradizem.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Os dois Dockerfiles do projeto. Qualquer um novo entra aqui: a guarda só
// protege o que ela conhece, e o deploy que ela deixou passar em 19/11/2026
// custou duas tentativas quebradas no servidor.
const DOCKERFILES = ['apps/site/Dockerfile', 'apps/api/Dockerfile', 'apps/admin/Dockerfile', 'scripts/backup/Dockerfile'];
const DOCKERIGNORE = '.dockerignore';

/** Origens dos COPY do estágio de build (os `--from=` leem de outro estágio). */
function origensDeCopy(texto) {
  const origens = [];
  for (const [i, linha] of texto.split(/\r?\n/).entries()) {
    const limpa = linha.trim();
    if (!limpa.toUpperCase().startsWith('COPY ')) continue;
    if (limpa.includes('--from=')) continue;
    // COPY <origem...> <destino> — o último token é o destino.
    const partes = limpa.slice(5).trim().split(/\s+/).filter((p) => !p.startsWith('--'));
    for (const origem of partes.slice(0, -1)) origens.push({ origem, linha: i + 1 });
  }
  return origens;
}

/** Padrões de exclusão, sem comentários, sem negações (`!`) e sem vazios. */
function padroesIgnorados(texto) {
  return texto
    .split(/\r?\n/)
    .map((l, i) => ({ padrao: l.trim(), linha: i + 1 }))
    .filter(({ padrao }) => padrao && !padrao.startsWith('#') && !padrao.startsWith('!'));
}

/**
 * O `.dockerignore` casa o caminho inteiro ou qualquer pasta acima dele:
 * `packages/domain` exclui tanto `packages/domain` quanto
 * `packages/domain/package.json`.
 *
 * Glob: `*` casa dentro de um segmento e `**` atravessa segmentos — a
 * diferença importa, porque este repositório usa `**​/node_modules` e tratar
 * isso como `*` faria a regra não casar com `apps/site/node_modules`.
 */
function excluiPor(origem, padrao) {
  const o = origem.split('\\').join('/').replace(/^\.\//, '');
  const p = padrao.split('\\').join('/').replace(/^\.\//, '');
  if (p.includes('*')) {
    const esc = p.replace(/[.+^${}()|[\]]/g, '\\$&');
    const re = new RegExp(
      '^' +
        esc
          .split('**/')
          .join('\u0000') // marca o "atravessa segmentos" antes de tratar o `*` simples
          .split('*')
          .join('[^/]*')
          .split('\u0000')
          .join('(?:[^/]+/)*') +
        '(/|$)',
    );
    return re.test(o);
  }
  return o === p || o.startsWith(p + '/');
}

const dockerignore = existsSync(resolve(raiz, DOCKERIGNORE))
  ? readFileSync(resolve(raiz, DOCKERIGNORE), 'utf8')
  : '';
const ignorados = padroesIgnorados(dockerignore);
const problemas = [];
let totalCopies = 0;

for (const DOCKERFILE of DOCKERFILES) {
  if (!existsSync(resolve(raiz, DOCKERFILE))) {
    problemas.push(`${DOCKERFILE} — está na lista da guarda mas não existe no repositório`);
    continue;
  }
  const copies = origensDeCopy(readFileSync(resolve(raiz, DOCKERFILE), 'utf8'));
  totalCopies += copies.length;

  for (const { origem, linha } of copies) {
    if (!existsSync(resolve(raiz, origem))) {
      problemas.push(`${DOCKERFILE}:${linha}  COPY de "${origem}" — esse caminho não existe no repositório`);
      continue;
    }
    const bate = ignorados.find(({ padrao }) => excluiPor(origem, padrao));
    if (bate) {
      problemas.push(
        `${DOCKERFILE}:${linha}  COPY de "${origem}", mas ${DOCKERIGNORE}:${bate.linha} exclui "${bate.padrao}" ` +
          `— o Docker recusa com "CopyIgnoredFile" e o deploy quebra`,
      );
    }
  }
}

if (problemas.length > 0) {
  console.error('check-docker-context: os COPY e o .dockerignore se contradizem\n');
  for (const p of problemas) console.error(`  ${p}`);
  console.error(`\n${problemas.length} problema(s). Isso quebraria o build no servidor.`);
  process.exit(1);
}

console.log(
  `check-docker-context: ok (${totalCopies} COPY de ${DOCKERFILES.length} Dockerfiles, ` +
    `conferidos contra ${ignorados.length} regras do .dockerignore)`,
);
