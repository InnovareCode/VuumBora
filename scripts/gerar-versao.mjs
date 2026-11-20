#!/usr/bin/env node
/**
 * Gera `assets/js/version.js` da página pública a partir do `package.json`
 * da raiz. Fonte única: para publicar uma versão nova, muda-se o `version`
 * do package.json e o rodapé acompanha sozinho.
 *
 * Mesmo princípio do ModaShop (`frontend/src/lib/appInfo.ts`), adaptado ao
 * que a página do VuumBora é: HTML, CSS e JS puros, sem build e sem
 * bundler que injete constantes. Aqui quem injeta é este script, rodado
 * dentro do Dockerfile — por isso a data de compilação é a data real da
 * imagem que está no ar, não a data em que alguém lembrou de editar um
 * arquivo à mão.
 *
 * Por que a versão fica visível: sem ela, um chamado de suporte não
 * consegue dizer qual build o usuário estava usando, e "já corrigimos
 * isso" vira discussão sem prova.
 *
 * Uso:
 *   node scripts/gerar-versao.mjs            # escreve no caminho padrão
 *   node scripts/gerar-versao.mjs --stdout   # imprime (usado no Docker)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'apps', 'site', 'public', 'assets', 'js', 'version.js');

const pkg = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'));

const versao = String(pkg.version ?? '').trim();
if (!/^\d+\.\d+\.\d+/.test(versao)) {
  console.error(`[versao] "version" do package.json inválido: ${JSON.stringify(pkg.version)}`);
  process.exit(1);
}

// AAAA-MM-DD em UTC: a data que o rodapé mostra é a do build, igual em
// qualquer máquina, sem depender do fuso de quem publicou.
const compiladoEm = new Date().toISOString().slice(0, 10);

const conteudo = `/**
 * GERADO AUTOMATICAMENTE por scripts/gerar-versao.mjs — não edite à mão.
 *
 * A versão vem do "version" do package.json da raiz; a data é a do build.
 * O arquivo versionado no git serve ao desenvolvimento local; a imagem que
 * vai ao ar recebe um gerado na hora da compilação.
 */
window.VUUMBORA_VERSION = Object.freeze({
  versao: '${versao}',
  compiladoEm: '${compiladoEm}'
});
`;

if (process.argv.includes('--stdout')) {
  process.stdout.write(conteudo);
} else {
  writeFileSync(DESTINO, conteudo, 'utf8');
  console.log(`[versao] v${versao} (compilado em ${compiladoEm}) -> ${DESTINO}`);
}
