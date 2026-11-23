#!/usr/bin/env node
/**
 * Empacota `packages/domain/src/index.ts` (o módulo real, sem duplicar nenhuma conta) num arquivo
 * `domain.bundle.js` que a página `index.html` carrega com `<script>` normal — funciona abrindo o
 * arquivo direto no navegador (`file://`), sem servidor nem passo de build para o dono. Usa
 * `calculateFare`/`resolvePlatformFeeTier`/`splitFare` (tarifa) e `toTripRange` (PP-12, faixa de
 * distância/duração da oferta) do MESMO ponto de entrada que `apps/*` e `packages/api-client` usam.
 *
 * Rodar de novo só é preciso se algo em `packages/domain/src/**` mudar. Não faz parte do `npm run
 * check` do repositório — é um utilitário local deste diretório.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(here, '..', '..', 'packages', 'domain', 'src', 'index.ts');
const outfile = path.join(here, 'domain.bundle.js');

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'iife',
  globalName: 'VuumboraDomain',
  target: 'es2018',
  platform: 'browser',
  logLevel: 'info',
});

console.log(`gerado: ${outfile}`);
