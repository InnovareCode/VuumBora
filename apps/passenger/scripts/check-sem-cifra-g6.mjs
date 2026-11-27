#!/usr/bin/env node
/**
 * Aceite D2 da fatia G6 (`docs/plano-m3-m4.md` §4): nenhuma cifra de mockup no código das telas P03-P07 — preço,
 * distância e tempo só do contrato (`FareQuotePort`/`GeoPort`). Procura, fora de comentário: literais como "R$ 23,90",
 * "4 km", "12 min"; texto com "R$" montado à mão ('R$ ' + valor); número solto em valor de dinheiro (`value={23.9}`,
 * `preco = 2390`, `price: 23.9`); número em template com unidade (`${12} min`); e constante somada a um preço
 * (`priceCents + 190`). A bateria de mutantes da Íris na G6 (`semcifra-mutantes.mjs`) mostrou essas formas passando vivas.
 *
 * Olha os arquivos da G6 e a P07 (painel da busca de motorista, que mostra o preço pedido). As telas P08-P11 ainda têm
 * números simulados do despacho e do histórico (M5/P11) e ficam de fora. `src/dev/**` também: só monta cenários de
 * captura, nunca entra no bundle de produção.
 *
 * Uso: node apps/passenger/scripts/check-sem-cifra-g6.mjs  (saída != 0 em qualquer achado)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const ALVOS = [
  'app/(app)/index.tsx',
  'app/(app)/destino.tsx',
  'app/(app)/categoria.tsx',
  'app/(app)/confirmacao.tsx',
  'src/components/home',
  'src/components/destination',
  'src/components/categoria',
  'src/components/confirmation',
  'src/components/map',
  'src/destination',
  'src/geo',
  'src/location',
  'src/store/useRideRequestStore.ts',
  'src/utils/rideQuoteFormatting.ts',
  'src/data/mockTripReceipt.ts',
  // P07 (busca de motorista): o painel mostra o preço da cotação pedida.
  'src/components/ride/SearchingPanel.tsx',
  'src/components/search',
];

const DINHEIRO = '(?:pre[cç]o|valor|tarifa|taxa|total|price|fare|fee|amount|cents|centavos)';

const PADROES = [
  { nome: 'preço em reais', re: /R\$\s?\d/ },
  { nome: 'distância/tempo literal', re: /\b\d+(?:[.,]\d+)?\s?(?:km|min|minutos|metros|quilômetros)\b/ },
  { nome: 'número fixo em campo de preço/distância/tempo', re: /\b(?:amountCents|priceCents|distanceM|durationS|pickupEtaS|etaMinutes)\s*[:=]\s*\d/ },
  { nome: 'constante de preço/tempo', re: /\b[A-Z_]*(?:CENTS|FEE|PRICE|ETA_MINUTES)[A-Z_]*\s*=\s*\d/ },
  { nome: 'texto com "R$" montado à mão', re: /['"`][^'"`\n]*R\$/ },
  { nome: 'número solto em valor de dinheiro', re: /\bvalue\s*[:=]\s*\{?\s*\d/ },
  { nome: 'número fixo em variável de dinheiro', re: new RegExp(`\\b${DINHEIRO}\\w*\\s*[:=]\\s*\\(?\\s*\\d`, 'i') },
  { nome: 'número em template com unidade', re: /\$\{\s*\d+(?:[.,]\d+)?\s*\}\s*(?:km|min|m|h)\b/ },
  {
    nome: 'constante somada a um preço',
    re: new RegExp(`${DINHEIRO}[^\\n;]*[+-]\\s*\\d{2,}|\\d{2,}\\s*[+-][^\\n;]*${DINHEIRO}`, 'i'),
  },
];

function* arquivos(caminho) {
  const cheio = join(APP, caminho);
  if (statSync(cheio).isDirectory()) {
    for (const nome of readdirSync(cheio)) yield* arquivos(join(caminho, nome));
  } else if (/\.(ts|tsx)$/.test(caminho)) {
    yield cheio;
  }
}

/** Tira comentários de linha e de bloco, preservando a numeração das linhas. */
function semComentarios(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, (bloco) => bloco.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (bloco) => bloco.replace(/[^\n]/g, ' '));
}

const achados = [];
for (const alvo of ALVOS) {
  for (const arquivo of arquivos(alvo)) {
    const linhas = semComentarios(readFileSync(arquivo, 'utf8')).split(/\r?\n/);
    linhas.forEach((linha, i) => {
      for (const { nome, re } of PADROES) {
        if (re.test(linha)) achados.push(`${relative(APP, arquivo)}:${i + 1}  ${nome}: ${linha.trim().slice(0, 120)}`);
      }
    });
  }
}

if (achados.length > 0) {
  console.error(`[check-sem-cifra-g6] ${achados.length} cifra(s) de mockup nas telas P03-P07:\n${achados.join('\n')}`);
  process.exit(1);
}
console.log('[check-sem-cifra-g6] ok: nenhuma cifra de mockup nas telas P03-P07 (preço, distância e tempo só do contrato).');
