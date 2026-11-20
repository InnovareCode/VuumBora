#!/usr/bin/env node
/**
 * Carimba os assets locais do index.html com o hash do próprio conteúdo:
 *
 *   assets/css/style.css   ->   assets/css/style.css?v=3f9a1c2e
 *
 * Por que existe, medido em 20/11/2026: uma correção de CSS foi publicada,
 * entrou no servidor, e o site continuou mostrando a versão antiga. O
 * nginx mandava `Cache-Control: max-age=300`, mas a resposta que chegava
 * ao visitante vinha da Cloudflare com `max-age=14400` — ela sobrescreve o
 * cabeçalho da origem para arquivos estáticos. Na prática: **toda
 * publicação de CSS ou JS levaria até 4 horas para aparecer**, e ninguém
 * saberia se o deploy funcionou ou não.
 *
 * Purgar o cache à mão resolve uma vez e esquece na próxima. O endereço
 * mudar junto com o conteúdo resolve sempre, porque um endereço que a
 * Cloudflare nunca viu ela não tem como servir de cache.
 *
 * O hash é do CONTEÚDO, não a versão nem a data: muda exatamente quando o
 * arquivo muda, e só então. Publicar duas vezes sem mexer no CSS mantém o
 * mesmo endereço, e o cache do visitante continua valendo — que é
 * justamente o que se quer de cache.
 *
 * Roda no Dockerfile, sobre uma cópia; o `index.html` do repositório fica
 * limpo, sem `?v=` no git.
 *
 * Uso:
 *   node scripts/carimbar-assets.mjs <pasta-public>
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const raizPublic = resolve(process.argv[2] ?? 'apps/site/public');
const indexPath = join(raizPublic, 'index.html');

if (!existsSync(indexPath)) {
  console.error(`[carimbo] não achei ${indexPath}`);
  process.exit(1);
}

let html = readFileSync(indexPath, 'utf8');

/**
 * Pega src/href que apontem para assets locais .css ou .js. Fica de fora,
 * de propósito: URL absoluta (http://, //cdn...), que não é nossa e cujo
 * cache não controlamos, e qualquer caminho que já tenha `?`.
 */
const PADRAO = /\b(src|href)="(?!https?:|\/\/|data:)([^"?#]+\.(?:css|js))"/g;

const carimbados = [];
const semArquivo = [];

html = html.replace(PADRAO, (inteiro, attr, caminho) => {
  const arquivo = join(raizPublic, caminho.replace(/^\//, ''));
  if (!existsSync(arquivo)) {
    semArquivo.push(caminho);
    return inteiro; // não inventa hash para arquivo que não existe
  }
  const hash = createHash('sha256').update(readFileSync(arquivo)).digest('hex').slice(0, 8);
  carimbados.push(`${caminho}?v=${hash}`);
  return `${attr}="${caminho}?v=${hash}"`;
});

writeFileSync(indexPath, html, 'utf8');

for (const c of carimbados) console.log(`[carimbo] ${c}`);
if (semArquivo.length > 0) {
  // Não é fatal: pode ser um caminho servido por outra regra do nginx.
  // Mas é digno de nota, porque um typo no caminho aparece exatamente assim.
  for (const s of semArquivo) console.warn(`[carimbo] AVISO: referenciado mas não encontrado — ${s}`);
}
console.log(`[carimbo] ${carimbados.length} asset(s) carimbado(s) em ${indexPath}`);
