/**
 * Regras PURAS da busca de endereço do passageiro (M4, fatia G3; decisão N6 do `docs/plano-m3-m4.md`): validação da
 * consulta, normalização do texto, casamento com os pontos próprios (`curated_places`) e a ordem final que junta pontos
 * próprios, Geocoding v6 e Search Box. Sem I/O: quem busca no Mapbox e no banco é `services/geo-service.ts`.
 *
 * Por que a ordem é esta (F10, `docs/area-de-servico-natal.md`):
 *  - pontos próprios PRIMEIRO, quando o lugar pedido é um deles (shopping, hospital, aeroporto...): coordenada conferida
 *    pela equipe, sem depender do Mapbox;
 *  - Geocoding v6 resolve rua + número; Search Box resolve nome de lugar. Com `kind=any` (uma chamada só, pedido da Lyra:
 *    duas chamadas por busca contavam em dobro no limite), a fonte que abre a lista depende de o texto ter cara de
 *    endereço (tipo de logradouro no começo, ou número);
 *  - resultado do Mapbox que não tem NENHUMA palavra do que foi pedido vai para o fim: é o "troca silenciosa de rua" da F10
 *    (pedi "Rua Catavento" e a v6 devolveu "Rua Candelária", com confiança alta). Ele continua na lista (o pino e a
 *    confirmação decidem), só não abre a lista.
 */
import { isPointInServiceArea, type ServiceArea } from './geo-fare-rules.js';

export type GeoSearchKind = 'address' | 'place' | 'any';
export type GeoSearchSource = 'curated' | 'geocoding' | 'searchbox';

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/** O resultado que a rota devolve (`GeoSearchResult` do contrato K0). */
export interface GeoSearchResult extends LatLng {
  readonly id: string;
  readonly label: string;
  readonly sublabel: string;
  readonly source: GeoSearchSource;
}

/** Um ponto próprio ativo, como vem do banco. `aliases` já normalizados (CHECK `search_terms_are_normalized`). */
export interface CuratedPlace extends LatLng {
  readonly code: string;
  readonly name: string;
  readonly address: string;
  readonly aliases: readonly string[];
}

export const MAX_RESULTS = 8;
/** Proximidade quando o app não manda a posição: o centro de Natal (o mesmo da F10). */
export const DEFAULT_PROXIMITY: LatLng = { lat: -5.7945, lng: -35.2094 };
/** Caixa de reserva se a cidade estiver sem área ativa (a da F10, "Grande Natal"). Com área, vale a caixa dela. */
export const FALLBACK_BBOX = [-35.55, -6.15, -35.05, -5.55] as const;
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;
/** Prefixo mínimo para o autocompletar casar um ponto próprio enquanto a pessoa digita ("mid" → Midway Mall). */
const MIN_PREFIX_LENGTH = 3;
/** Mapbox a menos disto de um ponto próprio já listado é o mesmo lugar (some da lista). */
const CURATED_DUPLICATE_RADIUS_M = 150;
/** Dois resultados do Mapbox com o mesmo rótulo a menos disto são o mesmo lugar. */
const MAPBOX_DUPLICATE_RADIUS_M = 100;

/** Palavras que não identificam o lugar pedido: preposições e artigos. */
const STOPWORDS = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'a', 'o', 'em', 'no', 'na']);
/** Tipo de logradouro: no começo do texto, diz que é endereço (Geocoding v6 primeiro). */
const STREET_TYPES = new Set(['rua', 'r', 'av', 'avenida', 'travessa', 'tv', 'trav', 'alameda', 'al', 'estrada', 'est', 'rodovia', 'rod', 'br', 'rn', 'via', 'largo', 'beco', 'vila', 'conjunto', 'cj']);
/** Tipo de lugar que a pessoa põe antes do nome e o ponto próprio pode não ter ("Pç André de Albuquerque"). */
const LEADING_PLACE_TYPES = new Set(['praca', 'pc', 'pca']);
/** Genéricas demais para provar que o resultado é o lugar pedido (cidade, estado, título, tipo). */
const GENERIC_WORDS = new Set([
  ...STOPWORDS, ...STREET_TYPES, ...LEADING_PLACE_TYPES,
  'natal', 'brasil', 'rio', 'grande', 'norte', 'sn', 's', 'n', 'dr', 'dra', 'sr', 'sra', 'pres', 'presidente', 'sen', 'senador',
  'eng', 'engenheiro', 'condominio', 'residencial', 'cep',
]);

/** Minúsculas ASCII, sem acento, só letras e algarismos, palavras separadas por UM espaço — o formato dos `aliases`. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/ +/g, ' ');
}

function words(normalized: string): string[] {
  return normalized === '' ? [] : normalized.split(' ');
}

function withoutStopwords(normalized: string): string {
  return words(normalized).filter((word) => !STOPWORDS.has(word)).join(' ');
}

/** Palavras que identificam o pedido (sem genéricas nem números): é com elas que se confere o resultado. */
export function significantWords(normalized: string): string[] {
  return words(normalized).filter((word) => word.length >= 3 && !GENERIC_WORDS.has(word) && !/^\d+$/.test(word));
}

export function haversineM(a: LatLng, b: LatLng): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------------------------------------------------
// Validação da consulta (GET /v1/geo/search?q&kind&near e GET /v1/geo/reverse?lat&lng)
// ---------------------------------------------------------------------------------------------------------------------

export interface GeoSearchQuery {
  /** O texto como a pessoa digitou, aparado e com espaços simples (é o que vai ao Mapbox). */
  readonly q: string;
  readonly kind: GeoSearchKind;
  readonly near?: LatLng;
}

/** Um único valor de querystring (repetido = inválido: `?q=a&q=b` chega como lista). */
function single(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? value : null;
}

const NUMBER_PATTERN = /^-?\d{1,3}(\.\d{1,10})?$/;

export function parseLatLng(latRaw: string, lngRaw: string): LatLng | null {
  if (!NUMBER_PATTERN.test(latRaw) || !NUMBER_PATTERN.test(lngRaw)) return null;
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * `null` = 400 `invalid_body`. `kind` padrão `address` (contrato K0); `any` junta os dois tipos numa chamada só.
 * Menos de 2 caracteres úteis NÃO é erro: a rota responde lista vazia (quem digita ainda está no começo).
 */
export function parseSearchQuery(query: unknown): GeoSearchQuery | null {
  if (typeof query !== 'object' || query === null) return null;
  const raw = query as Record<string, unknown>;
  const q = single(raw['q']);
  const kind = single(raw['kind']);
  const near = single(raw['near']);
  if (typeof q !== 'string' || q.length > MAX_QUERY_LENGTH || kind === null || near === null) return null;
  if (kind !== undefined && kind !== 'address' && kind !== 'place' && kind !== 'any') return null;
  let nearPoint: LatLng | undefined;
  if (near !== undefined) {
    const parts = near.split(',');
    const parsed = parts.length === 2 ? parseLatLng(parts[0]!.trim(), parts[1]!.trim()) : null;
    if (!parsed) return null;
    nearPoint = parsed;
  }
  return { q: q.trim().replace(/\s+/g, ' '), kind: kind ?? 'address', ...(nearPoint ? { near: nearPoint } : {}) };
}

export function parseReverseQuery(query: unknown): LatLng | null {
  if (typeof query !== 'object' || query === null) return null;
  const raw = query as Record<string, unknown>;
  const lat = single(raw['lat']);
  const lng = single(raw['lng']);
  if (typeof lat !== 'string' || typeof lng !== 'string') return null;
  return parseLatLng(lat.trim(), lng.trim());
}

/** A consulta é curta demais para buscar (responde `results: []` sem chamar ninguém). */
export function isQueryTooShort(q: string): boolean {
  return normalizeSearchText(q).replace(/ /g, '').length < MIN_QUERY_LENGTH;
}

/**
 * O texto tem cara de ENDEREÇO (rua + número) e não de nome de lugar: o primeiro trecho QUE IDENTIFICA ALGO (até a vírgula;
 * "Condomínio residencial, Rua Erivan França, 1199" pula o primeiro, só de palavras genéricas) começa com tipo de
 * logradouro ou traz um número. Decide qual fonte do Mapbox abre a lista em `kind=any`.
 */
export function looksLikeAddress(q: string): boolean {
  const segments = q.split(',').map(normalizeSearchText).filter((segment) => segment !== '');
  const segment = segments.find((candidate) => significantWords(candidate).length > 0) ?? segments[0] ?? '';
  const first = words(segment)[0] ?? '';
  return STREET_TYPES.has(first) || /\b\d+\b/.test(segment);
}

/** Arredonda a coordenada de proximidade (privacidade e chave de cache): 2 casas ≈ 1,1 km. */
export function roundNear(point: LatLng): LatLng {
  return { lat: Math.round(point.lat * 100) / 100, lng: Math.round(point.lng * 100) / 100 };
}

// ---------------------------------------------------------------------------------------------------------------------
// Pontos próprios
// ---------------------------------------------------------------------------------------------------------------------

interface CuratedMatch {
  readonly place: CuratedPlace;
  /** Quantas palavras do termo casaram (mais = mais específico). */
  readonly strength: number;
}

/**
 * O ponto próprio é o que a pessoa pediu? Casa quando um termo dele (nome ou apelido, sem preposições) ABRE o primeiro trecho
 * do texto — "Midway Mall, Av. Rio Branco..." casa com "midway mall"; "Av. Eng. Roberto Freire, 8790, Ponta Negra" NÃO casa
 * com a praia de Ponta Negra (o bairro no fim de um endereço não é o lugar pedido). Termo de UMA palavra só casa se o resto
 * do trecho também é do vocabulário do lugar ("UFRN Lagoa Nova" sim; "Teatro Riachuelo" não vira o Teatro Alberto Maranhão).
 * Enquanto a pessoa digita, o texto inteiro como começo de um termo também casa ("midw" → Midway Mall).
 */
export function matchCuratedPlace(q: string, place: CuratedPlace): CuratedMatch | null {
  let segment = withoutStopwords(normalizeSearchText(q.split(',')[0] ?? ''));
  const segmentWords = words(segment);
  if (segmentWords.length > 1 && LEADING_PLACE_TYPES.has(segmentWords[0]!)) segment = segmentWords.slice(1).join(' ');
  if (segment === '') return null;

  const terms = [normalizeSearchText(place.name), ...place.aliases].map(withoutStopwords).filter((term) => term !== '');
  const vocabulary = new Set(words(withoutStopwords(normalizeSearchText(`${place.name} ${place.address} ${place.aliases.join(' ')}`))));
  let best = 0;
  for (const term of terms) {
    const termWords = words(term);
    if (segment === term || segment.startsWith(`${term} `)) {
      // `.trim()`: sem ele o resto começa com espaço, vira uma palavra vazia "não explicada" e apelido de UMA palavra nunca
      // casava com resto ("UFRN Lagoa Nova") — achado pelo teste de ordem, não pela amostra (a Search Box acertava por baixo).
      const rest = words(segment.slice(term.length).trim());
      const restExplained = rest.every((word) => vocabulary.has(word) || GENERIC_WORDS.has(word) || /^\d+$/.test(word));
      if (termWords.length >= 2 || restExplained) best = Math.max(best, termWords.length);
    } else if (segment.length >= MIN_PREFIX_LENGTH && term.startsWith(segment)) {
      best = Math.max(best, words(segment).length);
    }
  }
  return best > 0 ? { place, strength: best } : null;
}

export function curatedToResult(place: CuratedPlace): GeoSearchResult {
  return { id: place.code, label: place.name, sublabel: place.address, lat: place.lat, lng: place.lng, source: 'curated' };
}

// ---------------------------------------------------------------------------------------------------------------------
// Ordem final
// ---------------------------------------------------------------------------------------------------------------------

function mentionsAny(wanted: readonly string[], text: string): boolean {
  const haystack = words(normalizeSearchText(text));
  return wanted.some((word) => haystack.some((candidate) => candidate === word || candidate.startsWith(word)));
}

/** Tipo de logradouro canônico: "av" e "avenida" são o mesmo pedido. */
const STREET_TYPE_CANONICAL: Readonly<Record<string, string>> = {
  r: 'rua', rua: 'rua', av: 'avenida', avenida: 'avenida', tv: 'travessa', trav: 'travessa', travessa: 'travessa',
  al: 'alameda', alameda: 'alameda', est: 'estrada', estrada: 'estrada', rod: 'rodovia', rodovia: 'rodovia',
};
const canonicalStreetType = (word: string): string => STREET_TYPE_CANONICAL[word] ?? word;

/** O tipo de logradouro com que o rótulo começa ("Avenida Hermes da Fonseca" → avenida), ou `null` se é nome de lugar. */
function streetTypeOfLabel(label: string): string | null {
  const first = words(normalizeSearchText(label))[0] ?? '';
  return STREET_TYPES.has(first) ? canonicalStreetType(first) : null;
}

function mentionsAll(wanted: readonly string[], text: string): boolean {
  const haystack = words(normalizeSearchText(text));
  return wanted.every((word) => haystack.some((candidate) => candidate === word || candidate.startsWith(word)));
}

/** O resultado traz ao menos uma palavra significativa do pedido (a última pode estar pela metade: casa pelo começo). */
export function mentionsQuery(q: string, result: Pick<GeoSearchResult, 'label' | 'sublabel'>): boolean {
  const wanted = significantWords(normalizeSearchText(q));
  if (wanted.length === 0) return true; // nada a conferir ("Rua 10")
  return mentionsAny(wanted, `${result.label} ${result.sublabel}`);
}

export interface RequestedStreet {
  /** Tipo canônico (rua, avenida...). */
  readonly type: string;
  /** Palavras do nome da rua (sem genéricas nem número). */
  readonly words: readonly string[];
}

/**
 * A rua pedida: o trecho (até a vírgula) que começa com tipo de logradouro. Sem vírgula ("Av Eng Roberto Freire 8790 Ponta
 * Negra"), o nome vai só até o número — o resto é bairro e cidade. `null` = o texto não pede rua.
 */
export function requestedStreet(q: string): RequestedStreet | null {
  const segment = q.split(',').map(normalizeSearchText).find((candidate) => STREET_TYPES.has(words(candidate)[0] ?? ''));
  if (!segment) return null;
  const segmentWords = words(segment);
  const numberAt = segmentWords.findIndex((word) => /^\d+$/.test(word));
  const nameWords = q.includes(',') || numberAt === -1 ? segmentWords : segmentWords.slice(0, numberAt);
  const significant = significantWords(nameWords.join(' '));
  return significant.length > 0 ? { type: canonicalStreetType(segmentWords[0]!), words: significant } : null;
}

/**
 * Faixa do resultado do Mapbox (menor = antes), partição ESTÁVEL (dentro da faixa vale a ordem das fontes):
 *  0. é RUA, do MESMO tipo pedido, com o nome INTEIRO da rua pedida ("Av. Sen. Salgado Filho" → "Avenida Senador Salgado
 *     Filho", e não a "Rua Salgado Filho" de Guarapés que a v6 devolve primeiro);
 *  1. é rua com o nome inteiro, de outro tipo (a pessoa escreveu "Rua Erivan França"; a via é Avenida);
 *  2. cita alguma palavra do pedido (o bairro, por exemplo: o centro do bairro quando o Mapbox não conhece a rua);
 *  3. não cita nada (rua trocada).
 * "Nome inteiro" e "é rua" de propósito (medido na amostra da F10): com UMA palavra, "Rua Elisa Vilaça" puxava "Rua Elisa
 * Regina" (Parnamirim) para o topo; sem exigir rua, "Rua Chapeuzinho Vermelho" puxava uma escola com esse nome.
 */
export function resultTier(q: string, street: RequestedStreet | null, result: Pick<GeoSearchResult, 'label' | 'sublabel'>): 0 | 1 | 2 | 3 {
  if (street) {
    const type = streetTypeOfLabel(result.label);
    if (type !== null && mentionsAll(street.words, `${result.label} ${result.sublabel}`)) return type === street.type ? 0 : 1;
  }
  return mentionsQuery(q, result) ? 2 : 3;
}

function interleave<T>(first: readonly T[], second: readonly T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(first.length, second.length); i++) {
    if (i < first.length) out.push(first[i]!);
    if (i < second.length) out.push(second[i]!);
  }
  return out;
}

export interface RankInput {
  readonly q: string;
  readonly kind: GeoSearchKind;
  readonly curated: readonly CuratedPlace[];
  /** Resultados de cada fonte do Mapbox, na ordem do Mapbox. Fonte não consultada (ou que falhou) = lista vazia. */
  readonly geocoding: readonly GeoSearchResult[];
  readonly searchbox: readonly GeoSearchResult[];
  readonly near?: LatLng;
  readonly maxResults?: number;
}

export function rankSearchResults(input: RankInput): GeoSearchResult[] {
  const maxResults = input.maxResults ?? MAX_RESULTS;
  const near = input.near;
  const curated = input.curated
    .map((place) => matchCuratedPlace(input.q, place))
    .filter((match): match is CuratedMatch => match !== null)
    .sort((a, b) => b.strength - a.strength || (near ? haversineM(near, a.place) - haversineM(near, b.place) : 0))
    .map((match) => curatedToResult(match.place));

  const geocoding = input.kind === 'place' ? [] : input.geocoding;
  const searchbox = input.kind === 'address' ? [] : input.searchbox;
  const mapbox = looksLikeAddress(input.q) ? interleave(geocoding, searchbox) : interleave(searchbox, geocoding);

  const kept: GeoSearchResult[] = [];
  for (const candidate of mapbox) {
    if (curated.some((place) => haversineM(place, candidate) <= CURATED_DUPLICATE_RADIUS_M)) continue;
    const label = normalizeSearchText(candidate.label);
    if (kept.some((other) => normalizeSearchText(other.label) === label && haversineM(other, candidate) <= MAPBOX_DUPLICATE_RADIUS_M)) continue;
    kept.push(candidate);
  }
  const street = requestedStreet(input.q);
  const tiers = new Map(kept.map((result) => [result, resultTier(input.q, street, result)]));
  const ordered = [0, 1, 2, 3].flatMap((wanted) => kept.filter((result) => tiers.get(result) === wanted));
  return [...curated, ...ordered].slice(0, maxResults);
}

/** O ponto está na área atendida (borda conta dentro; fora da área NÃO é erro na busca nem no pino). */
export function insideArea(point: LatLng, area: ServiceArea | null): boolean {
  return area !== null && isPointInServiceArea(point, area);
}
