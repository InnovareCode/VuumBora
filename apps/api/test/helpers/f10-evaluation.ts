/**
 * Critério (A) "localizado corretamente" da F10 (`apps/api/scripts/geocoding-sample-natal.mjs`, `docs/area-de-servico-natal.md`
 * §3), aplicado ao PRIMEIRO resultado da rota `GET /v1/geo/search` em vez da feature crua do Mapbox. As funções de texto são
 * CÓPIA FIEL das do script (mesmas palavras genéricas, mesma divisão rua/nome, mesma regra de maioria): o número novo só é
 * comparável ao 86% da F10 se a régua for a mesma.
 *
 * Única adaptação, forçada pela forma do resultado (a rota não devolve `context.region`): "está na região metropolitana"
 * passa a ser "o texto do resultado cita um município da Grande Natal (lista da F10) OU o ponto cai no polígono da área".
 * Os pontos próprios citam o município no endereço; o Mapbox, na legenda ("Bairro, Cidade - UF").
 */
import { isPointInServiceArea, type ServiceArea } from '../../src/domain/geo-fare-rules.js';
import type { GeoSearchResult } from '../../src/domain/geo-search.js';

const METRO_PLACES = [
  'natal', 'parnamirim', 'extremoz', 'macaiba', 'sao goncalo do amarante', 'ceara-mirim', 'sao jose de mipibu', 'nisia floresta',
  'monte alegre', 'vera cruz', 'bom jesus', 'ielmo marinho', 'taipu', 'maxaranguape',
];

function normalize(text: string | null | undefined): string {
  return (text ?? '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const GENERIC_WORDS = new Set([
  'rua', 'av', 'avenida', 'r', 'praca', 'pc', 'travessa', 'alameda', 'rodovia', 'estrada',
  'de', 'do', 'da', 'dos', 'das', 'e', 'sn', 's', 'n', 'natal', 'rn', 'br', 'brasil',
  'dr', 'dra', 'sr', 'sra', 'pres', 'presidente', 'sen', 'senador', 'eng', 'engenheiro',
  'condominio', 'residencial', 'residencia',
]);

function significantWords(text: string): string[] {
  return normalize(text)
    .replace(/[^a-z0-9/]+/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 3 && !GENERIC_WORDS.has(w) && !/^\d+$/.test(w));
}

const STREET_PREFIXES = new Set(['rua', 'av', 'avenida', 'r', 'travessa', 'alameda', 'estrada', 'rodovia', 'via', 'praca', 'pc']);

function splitStreetAndNameTokens(query: string): { streetWords: string[]; nameWords: string[] } {
  const segments = query.split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return { streetWords: [], nameWords: significantWords(query) };
  const streetSegment = segments.find((seg) => STREET_PREFIXES.has(normalize(seg).split(/\s+/)[0]?.replace(/[^a-z]/g, '') ?? ''));
  const nameSegment = segments[0] !== streetSegment ? segments[0] : null;
  return {
    streetWords: streetSegment ? significantWords(streetSegment) : [],
    nameWords: nameSegment ? significantWords(nameSegment) : segments.length === 1 ? significantWords(segments[0]!) : [],
  };
}

function wordsMatch(words: string[], haystack: string): boolean | null {
  if (words.length === 0) return null;
  const hits = words.filter((w) => haystack.includes(w));
  const longest = [...words].sort((a, b) => b.length - a.length)[0]!;
  return haystack.includes(longest) || hits.length >= Math.ceil(words.length / 2);
}

function streetNameSanityCheck(query: string, matchedText: string): boolean {
  const { streetWords, nameWords } = splitStreetAndNameTokens(query);
  const haystack = normalize(matchedText);
  const streetOk = wordsMatch(streetWords, haystack);
  const nameOk = wordsMatch(nameWords, haystack);
  if (streetOk === null && nameOk === null) return true;
  return streetOk === true || nameOk === true;
}

export type F10Verdict = 'ok' | 'sem_resultado' | 'fora_da_regiao' | 'rua_trocada';

export function evaluateTopResult(query: string, top: GeoSearchResult | undefined, area: ServiceArea): F10Verdict {
  if (!top) return 'sem_resultado';
  const text = normalize(`${top.label} ${top.sublabel}`);
  const inMetro = METRO_PLACES.some((place) => text.includes(place)) || isPointInServiceArea(top, area);
  if (!inMetro) return 'fora_da_regiao';
  return streetNameSanityCheck(query, `${top.label} ${top.sublabel}`) ? 'ok' : 'rua_trocada';
}
