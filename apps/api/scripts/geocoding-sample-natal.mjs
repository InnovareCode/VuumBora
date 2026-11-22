#!/usr/bin/env node
/**
 * F10 — teste de busca de endereço do Mapbox contra uma amostra real de Natal/RN.
 *
 * Objetivo: medir se a Geocoding API v6 do Mapbox (busca de endereço "forward
 * geocoding") acerta endereços reais da região de Natal, usando os parâmetros
 * que a tela de origem/destino do app vai precisar (proximidade, limite
 * geográfico, idioma pt, país BR). Isto decide se dá para abrir o M4 sem
 * esperar a tarifa (docs/plano-mestre.md, fatia F10).
 *
 * Geocoding v6 (endereço postal) x Search Box (nome de lugar): nenhum app
 * tem busca de endereço implementada ainda (confirmado: só existe a tela de
 * prova do mapa, apps/*\/app/(dev)/mapbox-check.*), então não havia endpoint
 * existente a reaproveitar — este script decide e documenta o contrato. A
 * amostra mostrou os dois com pontos fortes diferentes (ver
 * docs/area-de-servico-natal.md): a Geocoding API v6 (`--engine=geocode`,
 * padrão) resolve bem rua+número; a Search Box API (`--engine=searchbox`)
 * resolve muito melhor nome de lugar (shopping, hospital, universidade,
 * monumento) — a v6 chegou a devolver, para 4 nomes de lugar bem diferentes,
 * a MESMA rua errada em outro município, enquanto a Search Box acertou a
 * maioria. Recomendação final: endereço (rua/número) -> Geocoding v6; nome de
 * lugar -> Search Box; o app sempre mostra o endereço/nome devolvido para o
 * usuário confirmar antes de fixar a corrida — nenhum dos dois é confiável a
 * ponto de fixar coordenada sem confirmação visual.
 *
 * Uso:
 *   node apps/api/scripts/geocoding-sample-natal.mjs [--out=caminho.json] [--engine=geocode|searchbox] [--categories=a,b,c]
 *
 * Lê EXPO_PUBLIC_MAPBOX_TOKEN do `.env` da raiz do monorepo (mesma variável
 * que os apps usam — docs/mapbox.md). NUNCA imprime o token, nem a URL
 * completa com o token (os logs de erro removem a query string).
 */
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_ENV = path.resolve(__dirname, '../../../.env');
loadEnv({ path: ROOT_ENV }); // não sobrescreve variável já presente no ambiente

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

// --- parâmetros que a busca de endereço do app vai usar -------------------
// Proximidade: centro de Natal (favorece resultados próximos em caso de
// nome de rua repetido em outra cidade).
const PROXIMITY = '-35.2094,-5.7945';
// Limite geográfico: "Grande Natal" (decisão do dono, docs/decisoes-do-dono.md
// item 16 — "Natal e região metropolitana"), não só o município de Natal,
// porque o aeroporto (São Gonçalo do Amarante) e bairros de borda (Nova
// Parnamirim) ficam fora do município mas dentro da área de serviço.
const BBOX = '-35.55,-6.15,-35.05,-5.55';
const LANGUAGE = 'pt';
const COUNTRY = 'BR';
const ENDPOINTS = {
  geocode: 'https://api.mapbox.com/search/geocode/v6/forward',
  searchbox: 'https://api.mapbox.com/search/searchbox/v1/forward',
};

// Municípios da região metropolitana de Natal — usados para confirmar que o
// resultado não "acertou por acaso" uma rua de mesmo nome em outro estado.
const METRO_PLACES = [
  'natal',
  'parnamirim',
  'extremoz',
  'macaiba',
  'sao goncalo do amarante',
  'ceara-mirim',
  'sao jose de mipibu',
  'nisia floresta',
  'monte alegre',
  'vera cruz',
  'bom jesus',
  'ielmo marinho',
  'taipu',
  'maxaranguape',
];

function normalize(text) {
  return (text ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- amostra: 100 endereços reais da região de Natal -----------------------
// Ruas, bairros, praias e nomes de equipamento são reais; números de porta
// nas ruas residenciais não foram conferidos imóvel a imóvel (não é o que o
// teste mede — mede se o serviço acha a RUA/PONTO, não se aquele número
// existe). A categoria "erro_abreviacao" reescreve endereços de cima (ou
// equivalentes) do jeito que alguém digitaria de verdade: sem acento, com
// abreviação, minúsculo, sem número, com nome popular em vez do oficial.
const SAMPLE = [
  // --- bairros (24) ---
  { category: 'bairro', query: 'Rua Potengi, 300, Tirol, Natal, RN' },
  { category: 'bairro', query: 'Av. Afonso Pena, 1100, Tirol, Natal, RN' },
  { category: 'bairro', query: 'Av. Hermes da Fonseca, 721, Tirol, Natal, RN' },
  { category: 'bairro', query: 'Rua Mossoró, 480, Petrópolis, Natal, RN' },
  { category: 'bairro', query: 'Av. Rio Branco, 1200, Petrópolis, Natal, RN' },
  { category: 'bairro', query: 'Rua Jundiaí, 150, Petrópolis, Natal, RN' },
  { category: 'bairro', query: 'Av. Senador Salgado Filho, 2500, Lagoa Nova, Natal, RN' },
  { category: 'bairro', query: 'Av. Bernardo Vieira, 3100, Lagoa Nova, Natal, RN' },
  { category: 'bairro', query: 'Av. Engenheiro Roberto Freire, 4200, Capim Macio, Natal, RN' },
  { category: 'bairro', query: 'Rua Elisa Vilaça, 230, Capim Macio, Natal, RN' },
  { category: 'bairro', query: 'Av. Prudente de Morais, 1800, Candelária, Natal, RN' },
  { category: 'bairro', query: 'Rua Catavento, 190, Candelária, Natal, RN' },
  { category: 'bairro', query: 'Av. Prudente de Morais, 3200, Neópolis, Natal, RN' },
  { category: 'bairro', query: 'Rua Juvenal Lamartine, 500, Neópolis, Natal, RN' },
  { category: 'bairro', query: 'Rua Amaro Bezerra, 870, Alecrim, Natal, RN' },
  { category: 'bairro', query: 'Rua Teixeira de Freitas, 400, Alecrim, Natal, RN' },
  { category: 'bairro', query: 'Rua Chile, 50, Cidade Alta, Natal, RN' },
  { category: 'bairro', query: 'Av. Rio Branco, 500, Ribeira, Natal, RN' },
  { category: 'bairro', query: 'Rua Dr. Sóstenes Rocha, 320, Quintas, Natal, RN' },
  { category: 'bairro', query: 'Av. Gustavo Cordeiro de Farias, 1500, Nova Descoberta, Natal, RN' },
  { category: 'bairro', query: 'Rua João XXIII, 600, Felipe Camarão, Natal, RN' },
  { category: 'bairro', query: 'Rua Chapeuzinho Vermelho, 120, Cidade Nova, Natal, RN' },
  { category: 'bairro', query: 'Av. Antônio Basílio, 2200, Lagoa Nova, Natal, RN' },
  { category: 'bairro', query: 'Rua Dr. João Medeiros Filho, 700, Igapó, Natal, RN' },

  // --- praias (8) ---
  { category: 'praia', query: 'Av. Engenheiro Roberto Freire, 8790, Ponta Negra, Natal, RN' },
  { category: 'praia', query: 'Rua Erivan França, 1199, Ponta Negra, Natal, RN' },
  { category: 'praia', query: 'Via Costeira, s/n, Areia Preta, Natal, RN' },
  { category: 'praia', query: 'Av. Presidente Café Filho, s/n, Praia do Meio, Natal, RN' },
  { category: 'praia', query: 'Rua Francisco Gurgel, 1000, Ponta Negra, Natal, RN' },
  { category: 'praia', query: 'Av. Maestro Francisco Castelo Branco, Redinha, Natal, RN' },
  { category: 'praia', query: 'Praia de Genipabu, Extremoz, RN' },
  { category: 'praia', query: 'Rua Apodi, s/n, Praia dos Artistas, Natal, RN' },

  // --- condomínios (8) ---
  { category: 'condominio', query: 'Alphaville Natal, Nova Parnamirim, RN' },
  { category: 'condominio', query: 'Condomínio Soul Ponta Negra, Rua Francisco Gurgel, Ponta Negra, Natal, RN' },
  { category: 'condominio', query: 'Condomínio Vivaz Ponta Negra, Av. Engenheiro Roberto Freire, Ponta Negra, Natal, RN' },
  { category: 'condominio', query: 'Residencial Reserva do Atlântico, Via Costeira, Natal, RN' },
  { category: 'condominio', query: 'Condomínio residencial, Rua Erivan França, 1199, Ponta Negra, Natal, RN' },
  { category: 'condominio', query: 'Condomínio residencial, Av. Antônio Basílio, 1200, Lagoa Nova, Natal, RN' },
  { category: 'condominio', query: 'Condomínio residencial, Rua Elisa Vilaça, 300, Capim Macio, Natal, RN' },
  { category: 'condominio', query: 'Condomínio residencial, Av. Prudente de Morais, 1500, Candelária, Natal, RN' },

  // --- shoppings (6) ---
  { category: 'shopping', query: 'Midway Mall, Av. Rio Branco, 536, Petrópolis, Natal, RN' },
  { category: 'shopping', query: 'Natal Shopping, Av. Engenheiro Roberto Freire, Capim Macio, Natal, RN' },
  { category: 'shopping', query: 'Partage Norte Shopping, Av. Maestro Francisco Castelo Branco, Lagoa Azul, Natal, RN' },
  { category: 'shopping', query: 'Praia Shopping, Av. Engenheiro Roberto Freire, Ponta Negra, Natal, RN' },
  { category: 'shopping', query: 'Midway Mall Natal RN' },
  { category: 'shopping', query: 'Natal Shopping, Capim Macio, Natal-RN' },

  // --- hospitais (8) ---
  { category: 'hospital', query: 'Hospital Universitário Onofre Lopes, Av. Nilo Peçanha, 620, Petrópolis, Natal, RN' },
  { category: 'hospital', query: 'Hospital Monsenhor Walfredo Gurgel, Av. Senador Salgado Filho, Tirol, Natal, RN' },
  { category: 'hospital', query: 'Maternidade Escola Januário Cicco, Rua Alexandrino de Alencar, Tirol, Natal, RN' },
  { category: 'hospital', query: 'Hospital Giselda Trigueiro, Rua Cônego Monte, Quintas, Natal, RN' },
  { category: 'hospital', query: 'Liga Norte Riograndense Contra o Câncer, Rua Mossoró, Petrópolis, Natal, RN' },
  { category: 'hospital', query: 'Hospital Rio Grande, Av. Hermes da Fonseca, Tirol, Natal, RN' },
  { category: 'hospital', query: 'Hospital do Coração, Av. Engenheiro Roberto Freire, Capim Macio, Natal, RN' },
  { category: 'hospital', query: 'Hospital Santa Catarina, Rua Potengi, Petrópolis, Natal, RN' },

  // --- aeroporto (2) ---
  { category: 'aeroporto', query: 'Aeroporto Internacional Governador Aluízio Alves, São Gonçalo do Amarante, RN' },
  { category: 'aeroporto', query: 'Aeroporto de Natal, São Gonçalo do Amarante, RN' },

  // --- rodoviária (2) ---
  { category: 'rodoviaria', query: 'Terminal Rodoviário Nelson Mandela, Av. Capitão-Mor Gouveia, Cidade da Esperança, Natal, RN' },
  { category: 'rodoviaria', query: 'Rodoviária de Natal, RN' },

  // --- pontos adicionais (12) ---
  { category: 'ponto', query: 'Praça André de Albuquerque, Cidade Alta, Natal, RN' },
  { category: 'ponto', query: 'UFRN, Campus Central, Lagoa Nova, Natal, RN' },
  { category: 'ponto', query: 'Parque das Dunas, Tirol, Natal, RN' },
  { category: 'ponto', query: 'Catedral Metropolitana de Natal, Praia do Meio, Natal, RN' },
  { category: 'ponto', query: 'Forte dos Reis Magos, Praia do Forte, Natal, RN' },
  { category: 'ponto', query: 'Mercado Público de Natal, Cidade Alta, Natal, RN' },
  { category: 'ponto', query: 'Prefeitura Municipal do Natal, Av. Prudente de Morais, Tirol, Natal, RN' },
  { category: 'ponto', query: 'Teatro Alberto Maranhão, Cidade Alta, Natal, RN' },
  { category: 'ponto', query: 'Centro de Convenções de Natal, Capim Macio, Natal, RN' },
  { category: 'ponto', query: 'Estádio Arena das Dunas, Lagoa Nova, Natal, RN' },
  { category: 'ponto', query: 'Fórum Miguel Seabra Fagundes, Lagoa Nova, Natal, RN' },
  { category: 'ponto', query: 'IFRN Campus Natal Central, Cidade Alta, Natal, RN' },

  // --- erro / abreviação deliberada (30) ---
  { category: 'erro_abreviacao', query: 'Av Eng Roberto Freire 8790 Ponta Negra Natal' },
  { category: 'erro_abreviacao', query: 'R. Potengi 300 Tirol Natal RN' },
  { category: 'erro_abreviacao', query: 'Av Pres Cafe Filho Praia do Meio Natal' },
  { category: 'erro_abreviacao', query: 'Av. Sen. Salgado Filho, Lagoa Nova, Natal' },
  { category: 'erro_abreviacao', query: 'Capim Maçio, Natal' },
  { category: 'erro_abreviacao', query: 'Petropoles, Natal RN' },
  { category: 'erro_abreviacao', query: 'Av Rio Branco Petropolis Natal-RN' },
  { category: 'erro_abreviacao', query: 'midway mall natal' },
  { category: 'erro_abreviacao', query: 'natal shopping capim macio' },
  { category: 'erro_abreviacao', query: 'Pç André Albuquerque Cid Alta Natal' },
  { category: 'erro_abreviacao', query: 'UFRN Lagoa Nova' },
  { category: 'erro_abreviacao', query: 'aeroporto internacional de natal' },
  { category: 'erro_abreviacao', query: 'rodoviaria nova natal' },
  { category: 'erro_abreviacao', query: 'Av Engenheiro Roberto Freire s/n Ponta Negra' },
  { category: 'erro_abreviacao', query: 'R Erivan Franca Ponta Negra Natal' },
  { category: 'erro_abreviacao', query: 'Via Costeira Natal' },
  { category: 'erro_abreviacao', query: 'Hospital Walfredo Gurgel Natal' },
  { category: 'erro_abreviacao', query: 'Hospital do Coracao Natal' },
  { category: 'erro_abreviacao', query: 'Forte dos Reis Magos Natal RN' },
  { category: 'erro_abreviacao', query: 'Mercado Publico Natal' },
  { category: 'erro_abreviacao', query: 'Teatro Alberto Maranhao Natal' },
  { category: 'erro_abreviacao', query: 'Arena das Dunas Natal' },
  { category: 'erro_abreviacao', query: 'Catedral de Natal' },
  { category: 'erro_abreviacao', query: 'Parque das Dunas Tirol Natal' },
  { category: 'erro_abreviacao', query: 'Alphaville Natal RN' },
  { category: 'erro_abreviacao', query: 'Condominio Soul Ponta Negra Natal' },
  { category: 'erro_abreviacao', query: 'Terminal Rodoviario Nelson Mandela Natal' },
  { category: 'erro_abreviacao', query: 'Partage Norte Shopping Natal RN' },
  { category: 'erro_abreviacao', query: 'Praia Shopping Ponta Negra Natal' },
  { category: 'erro_abreviacao', query: 'Genipabu Natal RN' },
];

async function fetchWithRetry(url, { attempts = 3, timeoutMs = 10_000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`http_${response.status}`);
        if (attempt < attempts) {
          const backoff = 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200);
          await sleep(backoff);
          continue;
        }
        return { ok: false, status: response.status };
      }
      const body = await response.json();
      return { ok: response.ok, status: response.status, body };
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < attempts) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
    }
  }
  return { ok: false, status: 0, error: String(lastError?.message ?? lastError) };
}

function buildUrl(query, engine) {
  const params = new URLSearchParams({
    q: query,
    language: LANGUAGE,
    country: COUNTRY,
    proximity: PROXIMITY,
    bbox: BBOX,
    limit: '1',
    access_token: TOKEN,
  });
  return `${ENDPOINTS[engine]}?${params.toString()}`;
}

function redact(url) {
  return url.replace(/access_token=[^&]+/, 'access_token=[redigido]');
}

// Palavras genéricas demais para provar que a RUA pedida é a rua devolvida
// (tipo de logradouro, preposição, estado/país, número, "sem número").
const GENERIC_WORDS = new Set([
  'rua', 'av', 'avenida', 'r', 'praca', 'pc', 'travessa', 'alameda', 'rodovia', 'estrada',
  'de', 'do', 'da', 'dos', 'das', 'e', 'sn', 's', 'n', 'natal', 'rn', 'br', 'brasil',
  'dr', 'dra', 'sr', 'sra', 'pres', 'presidente', 'sen', 'senador', 'eng', 'engenheiro',
  'condominio', 'residencial', 'residencia',
]);

function significantWords(text) {
  return normalize(text)
    .replace(/[^a-z0-9/]+/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 3 && !GENERIC_WORDS.has(w) && !/^\d+$/.test(w));
}

const STREET_PREFIXES = new Set(['rua', 'av', 'avenida', 'r', 'travessa', 'alameda', 'estrada', 'rodovia', 'via', 'praca', 'pc']);

// Separa a query em dois conjuntos de palavras a conferir: as da RUA (segmento
// que começa com "Rua"/"Av."/etc.) e as do NOME PRÓPRIO (primeiro segmento,
// quando não é o próprio segmento de rua — ex. "Hospital X, Av. Y, 123,
// bairro" tem nome="Hospital X" e rua="Av. Y"). Query sem vírgula nenhuma
// (categoria erro_abreviacao) cai toda no "nome", que é o melhor esforço.
function splitStreetAndNameTokens(query) {
  const segments = query.split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return { streetWords: [], nameWords: significantWords(query) };
  const streetSegment = segments.find((seg) => STREET_PREFIXES.has(normalize(seg).split(/\s+/)[0]?.replace(/[^a-z]/g, '')));
  const nameSegment = segments[0] !== streetSegment ? segments[0] : null;
  return {
    streetWords: streetSegment ? significantWords(streetSegment) : [],
    nameWords: nameSegment ? significantWords(nameSegment) : segments.length === 1 ? significantWords(segments[0]) : [],
  };
}

// true = achou a maioria das palavras (ou a mais longa/discriminante);
// null = não havia palavra para conferir (nada a provar nesse lado).
function wordsMatch(words, haystack) {
  if (words.length === 0) return null;
  const hits = words.filter((w) => haystack.includes(w));
  const longest = [...words].sort((a, b) => b.length - a.length)[0];
  return haystack.includes(longest) || hits.length >= Math.ceil(words.length / 2);
}

// Confirma que a rua OU o nome próprio pedido está de fato no resultado — e
// não foi trocado por outra coisa que "soa parecido" (achado real desta
// rodada: ver docs/area-de-servico-natal.md, casos "Rua Catavento" ->
// "Rua Candelaria" e "Rua Chapeuzinho Vermelho" -> "Rua Cidade Nova": pedi
// uma rua que não existe no dado do Mapbox e ele devolveu, com confiança
// "alta" em um caso, uma rua DIFERENTE, usando o nome do bairro que eu tinha
// informado como se fosse a rua). Basta UM dos dois lados (rua ou nome
// próprio) confirmar — um geocodificador de endereço tem todo o direito de
// ignorar o nome do estabelecimento e resolver só a rua informada, e vice-versa
// para um buscador de lugar (Search Box) que ignora o endereço e resolve pelo
// nome. Sem nenhum dos dois lados para conferir, não há o que provar: aceito
// sem marca (ex.: query livre sem rua nem nome claro).
function streetNameSanityCheck(query, matchedPlace) {
  const { streetWords, nameWords } = splitStreetAndNameTokens(query);
  const haystack = normalize(matchedPlace ?? '');
  const streetOk = wordsMatch(streetWords, haystack);
  const nameOk = wordsMatch(nameWords, haystack);
  if (streetOk === null && nameOk === null) return { ok: true, checked: false };
  const ok = streetOk === true || nameOk === true;
  return { ok, checked: true, streetOk, nameOk };
}

// Critério de acerto (ver docs/area-de-servico-natal.md para a justificativa
// completa e o que ele NÃO prova). Duas camadas:
//   A. localizado_corretamente — o bastante para um pino arrastável no mapa:
//      1) a resposta trouxe pelo menos 1 feature;
//      2) está na região metropolitana de Natal (region_code "RN" e o
//         município do contexto em METRO_PLACES) — evita contar como acerto
//         uma rua de mesmo nome em outro estado;
//      3) passa o streetNameSanityCheck — evita contar como acerto uma troca
//         silenciosa de rua (achado acima).
//   B. numero_exato — dentro de (A), confiança alta/exata no match_code
//      (número da casa resolvido, não interpolado). Quando (A) passa mas o
//      número só foi "plausível"/interpolado ou a resposta degradou para a
//      rua sem número, o pino cai no lugar certo da rua mas pode exigir
//      ajuste manual — registrado como numero_exato=false, não como erro.
function evaluate(query, feature) {
  if (!feature) return { found: false, reason: 'sem_resultado', numeroExato: false };
  const props = feature.properties ?? {};
  const context = props.context ?? {};
  const regionCode = context.region?.region_code;
  const placeName = normalize(context.place?.name ?? context.locality?.name ?? '');
  // A Search Box API às vezes omite "region" quando o lugar já é inequívoco
  // dentro do bbox; nesse caso confiamos no município (place), que já está
  // restrito a BR pelo parâmetro `country`.
  const regionOk = regionCode === 'RN' || regionCode === undefined;
  const isMetroNatal = regionOk && METRO_PLACES.some((p) => placeName.includes(p) || p.includes(placeName));
  const confidence = props.match_code?.confidence ?? null;
  const matchedPlace = props.full_address ?? props.name ?? '';
  // Para POI (Search Box), o nome próprio ("Teatro Alberto Maranhão") mora em
  // `name`, separado do endereço postal em `full_address` — junta os dois
  // antes do cheque de sanidade, senão todo POI reprova (o endereço postal
  // nunca repete o nome do lugar).
  const sanityHaystack = `${props.name ?? ''} ${matchedPlace}`;
  const sanity = streetNameSanityCheck(query, sanityHaystack);

  if (!isMetroNatal) {
    return { found: false, reason: 'fora_da_regiao', regionCode, placeName: context.place?.name, confidence, numeroExato: false };
  }
  if (!sanity.ok) {
    return { found: false, reason: 'rua_trocada', confidence, placeName: context.place?.name, numeroExato: false, sanity };
  }
  const numeroExato = confidence === 'exact' || confidence === 'high';
  return { found: true, reason: numeroExato ? 'confianca_alta' : 'rua_ok_numero_aproximado', confidence, placeName: context.place?.name, numeroExato };
}

async function main() {
  if (!TOKEN) {
    console.error('[geocoding-sample] EXPO_PUBLIC_MAPBOX_TOKEN não encontrado no ambiente nem em', ROOT_ENV);
    console.error('[geocoding-sample] copie o token para o `.env` da raiz do monorepo (ver docs/mapbox.md) e rode de novo.');
    process.exitCode = 1;
    return;
  }

  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const outPath = outArg ? outArg.slice('--out='.length) : null;
  const engineArg = process.argv.find((a) => a.startsWith('--engine='));
  const engine = engineArg ? engineArg.slice('--engine='.length) : 'geocode';
  if (!ENDPOINTS[engine]) {
    console.error(`[geocoding-sample] --engine inválido: ${engine} (use geocode ou searchbox)`);
    process.exitCode = 1;
    return;
  }
  const categoriesArg = process.argv.find((a) => a.startsWith('--categories='));
  const categories = categoriesArg ? new Set(categoriesArg.slice('--categories='.length).split(',')) : null;
  const sample = categories ? SAMPLE.filter((item) => categories.has(item.category)) : SAMPLE;

  const results = [];
  let i = 0;
  for (const item of sample) {
    i += 1;
    const url = buildUrl(item.query, engine);
    const response = await fetchWithRetry(url);
    let evalResult = { found: false, reason: 'erro_de_rede' };
    let topFeature = null;
    if (response.ok && response.body) {
      topFeature = response.body.features?.[0] ?? null;
      evalResult = evaluate(item.query, topFeature);
    } else {
      console.error(`[geocoding-sample] ${i}/${sample.length} falha http (${response.status}) em`, redact(url));
    }
    results.push({
      id: i,
      category: item.category,
      query: item.query,
      httpStatus: response.status ?? null,
      found: evalResult.found,
      numeroExato: evalResult.numeroExato ?? false,
      reason: evalResult.reason,
      confidence: evalResult.confidence ?? null,
      matchedPlace: topFeature?.properties?.full_address ?? topFeature?.properties?.name ?? null,
    });
    const mark = evalResult.found ? 'OK ' : 'MISS';
    console.log(`[${mark}] ${String(i).padStart(3, '0')} (${item.category}) ${item.query} -> ${evalResult.reason}`);
    // Espaçamento entre chamadas: evita 429 por rajada; não é o limite real
    // da conta (não temos como ler a cota sem consumi-la), é prudência.
    await sleep(300);
  }

  const total = results.length;
  const hits = results.filter((r) => r.found).length;
  const exatos = results.filter((r) => r.numeroExato).length;
  const byCategory = {};
  for (const r of results) {
    byCategory[r.category] ??= { total: 0, hits: 0, exatos: 0 };
    byCategory[r.category].total += 1;
    if (r.found) byCategory[r.category].hits += 1;
    if (r.numeroExato) byCategory[r.category].exatos += 1;
  }

  console.log('\n--- resumo ---');
  console.log(`rua/local localizado corretamente (A): ${hits}/${total} (${((hits / total) * 100).toFixed(1)}%)`);
  console.log(`  dos quais com número exato, não interpolado (B): ${exatos}/${total} (${((exatos / total) * 100).toFixed(1)}%)`);
  for (const [category, stat] of Object.entries(byCategory)) {
    console.log(
      `  ${category}: localizado ${stat.hits}/${stat.total} (${((stat.hits / stat.total) * 100).toFixed(1)}%) | número exato ${stat.exatos}/${stat.total}`,
    );
  }

  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify({ proximity: PROXIMITY, bbox: BBOX, total, hits, byCategory, results }, null, 2));
    console.log(`\nresultado completo salvo em ${outPath}`);
  }
}

main();
