/**
 * Ordem da busca (`rankSearchResults`, `matchCuratedPlace`, `looksLikeAddress`) — regras puras, sem banco e sem resposta real
 * do Mapbox. Os candidatos abaixo são FICTÍCIOS, montados na FORMA dos casos vistos na amostra da F10 (gravação local de
 * 27/11/2026, fora do git): o que importa é a forma ("a v6 devolve primeiro uma rua de outro tipo, a Search Box traz a certa"),
 * não o dado.
 *
 * Trava o que a régua da F10 NÃO enxerga: ela aceita resultado que divide UMA palavra com a rua pedida, então trocar a
 * "Avenida Senador Salgado Filho" (Lagoa Nova) pela "Rua Salgado Filho" (Guarapés) não mexe na porcentagem. Aqui mexe.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { looksLikeAddress, matchCuratedPlace, rankSearchResults, type CuratedPlace, type GeoSearchResult } from '../src/domain/geo-search.js';

/** Pontos próprios da semente da 0026 usados aqui (mesmos nomes, endereços e apelidos). */
const CURATED: CuratedPlace[] = [
  { code: 'midway-mall', name: 'Midway Mall', address: 'Av. Bernardo Vieira, 3775, Tirol, Natal - RN', lat: -5.811, lng: -35.2065, aliases: ['midway', 'midway mall', 'shopping midway'] },
  { code: 'praia-de-ponta-negra', name: 'Praia de Ponta Negra', address: 'Ponta Negra, Natal - RN', lat: -5.88, lng: -35.169, aliases: ['ponta negra', 'praia de ponta negra', 'morro do careca'] },
  { code: 'praca-andre-albuquerque', name: 'Praça André de Albuquerque', address: 'Cidade Alta, Natal - RN', lat: -5.78, lng: -35.2085, aliases: ['praca andre de albuquerque', 'andre de albuquerque'] },
  { code: 'teatro-alberto-maranhao', name: 'Teatro Alberto Maranhão', address: 'Praça Augusto Severo, Ribeira, Natal - RN', lat: -5.7768, lng: -35.2048, aliases: ['teatro alberto maranhao', 'teatro'] },
  { code: 'ufrn-campus-central', name: 'UFRN - Campus Central', address: 'Av. Sen. Salgado Filho, 3000, Lagoa Nova, Natal - RN', lat: -5.8402, lng: -35.1995, aliases: ['ufrn', 'universidade federal', 'campus central'] },
  { code: 'rodoviaria-natal', name: 'Terminal Rodoviário de Natal', address: 'Av. Capitão-Mor Gouveia, Cidade da Esperança, Natal - RN', lat: -5.8237, lng: -35.2381, aliases: ['rodoviaria', 'rodoviaria de natal', 'terminal rodoviario'] },
];

let counter = 0;
/** Candidato fictício do Mapbox. */
function candidate(source: 'geocoding' | 'searchbox', label: string, sublabel: string, lat: number, lng: number): GeoSearchResult {
  return { id: `${source === 'geocoding' ? 'gc' : 'sb'}:ficticio-${++counter}`, label, sublabel, lat, lng, source };
}

const rank = (q: string, geocoding: GeoSearchResult[], searchbox: GeoSearchResult[]) => rankSearchResults({ q, kind: 'any', curated: CURATED, geocoding, searchbox });

describe('rua pedida: a faixa de cima exige rua do MESMO tipo com o nome INTEIRO', () => {
  test('"Av. Sen. Salgado Filho, Lagoa Nova": a avenida (Search Box) passa a "Rua Salgado Filho" de outro bairro (v6)', () => {
    const first = rank(
      'Av. Sen. Salgado Filho, Lagoa Nova, Natal',
      [candidate('geocoding', 'Rua Salgado Filho', 'Guarapés, Natal - RN', -5.86, -35.29), candidate('geocoding', 'Natal', 'Natal - RN', -5.79, -35.21)],
      [candidate('searchbox', 'Avenida Senador Salgado Filho', 'Lagoa Nova, Natal', -5.832, -35.207)],
    )[0];
    assert.equal(first?.label, 'Avenida Senador Salgado Filho');
  });

  test('nome PARCIAL não sobe: "Rua Elisa Vilaça" fica no centro do bairro pedido, não na "Rua Elisa Regina" de outra cidade', () => {
    const first = rank(
      'Rua Elisa Vilaça, 230, Capim Macio, Natal, RN',
      [candidate('geocoding', 'Capim Macio', 'Capim Macio, Natal - RN', -5.856, -35.196)],
      [candidate('searchbox', 'Rua Elisa Regina, 395', 'Passagem De Areia, Parnamirim', -5.91, -35.27)],
    )[0];
    assert.equal(first?.label, 'Capim Macio');
  });

  test('lugar que só LEVA o nome da rua não sobe: a escola "… Chapeuzinho Vermelho" não abre a lista', () => {
    const first = rank(
      'Rua Chapeuzinho Vermelho, 120, Cidade Nova, Natal, RN',
      [candidate('geocoding', 'Rua Cidade Nova 120', 'Guarapés, Natal - RN', -5.86, -35.29)],
      [candidate('searchbox', 'Jardim Escola Chapeuzinho Vermelho', 'R. Fictícia, Alecrim, Natal', -5.80, -35.22)],
    )[0];
    assert.ok(!first?.label.includes('Chapeuzinho'), first?.label);
  });

  test('sem vírgula, o nome da rua vai até o número: o resultado com o número pedido (v6) passa o de outro número (Search Box)', () => {
    const first = rank(
      'Av Eng Roberto Freire 8790 Ponta Negra Natal',
      [candidate('geocoding', 'Avenida Engenheiro Roberto Freire 8790', 'Ponta Negra, Natal - RN', -5.874, -35.178)],
      [candidate('searchbox', 'Avenida Engenheiro Roberto Freire, 3515 - Ponta Negra, Natal - RN, Brasil', 'Ponta Negra, Natal', -5.865, -35.183)],
    )[0];
    assert.equal(first?.label, 'Avenida Engenheiro Roberto Freire 8790');
  });

  test('tipo diferente mas nome inteiro ainda serve ("Rua Erivan França" → Avenida Erivan Franca, antes do bairro)', () => {
    const first = rank(
      'Rua Erivan França, 1199, Ponta Negra, Natal, RN',
      [candidate('geocoding', 'Ponta Negra', 'Ponta Negra, Natal - RN', -5.876, -35.18), candidate('geocoding', 'Avenida Erivan Franca', 'Ponta Negra, Natal - RN', -5.881, -35.171)],
      [],
    )[0];
    assert.equal(first?.label, 'Avenida Erivan Franca');
  });
});

describe('pontos próprios', () => {
  const match = (q: string, code: string) => matchCuratedPlace(q, CURATED.find((place) => place.code === code)!) !== null;

  test('o nome ou apelido ABRE o texto: casa mesmo com endereço errado depois', () => {
    assert.ok(match('Midway Mall, Av. Rio Branco, 536, Petrópolis, Natal, RN', 'midway-mall'));
    assert.ok(match('UFRN Lagoa Nova', 'ufrn-campus-central'), 'o resto do trecho é do vocabulário do lugar');
    assert.ok(match('Pç André Albuquerque Cid Alta Natal', 'praca-andre-albuquerque'), 'tipo de lugar no começo e sem preposição');
    assert.ok(match('midw', 'midway-mall'), 'autocompletar');
  });

  test('bairro no FIM de um endereço não é o lugar pedido; apelido de uma palavra com resto estranho também não', () => {
    assert.ok(!match('Av. Eng. Roberto Freire, 8790, Ponta Negra, Natal', 'praia-de-ponta-negra'));
    assert.ok(!match('Condomínio Vivaz Ponta Negra, Av. Engenheiro Roberto Freire', 'praia-de-ponta-negra'));
    assert.ok(!match('Teatro Riachuelo', 'teatro-alberto-maranhao'));
    // Lacuna conhecida (dado, não regra): "rodoviária nova" é o nome popular, e a semente não tem esse apelido.
    assert.ok(!match('rodoviaria nova natal', 'rodoviaria-natal'));
  });

  test('ponto próprio casado vem primeiro e o mesmo lugar do Mapbox (a menos de 150 m) sai da lista', () => {
    const near = candidate('searchbox', 'Midway Mall', 'Tirol, Natal', -5.8112, -35.2061);
    const far = candidate('geocoding', 'Rua Midway', 'Parnamirim - RN', -5.9, -35.26);
    assert.deepEqual(rank('midway mall', [far], [near]).map((result) => result.id), ['midway-mall', far.id]);
  });
});

describe('cara de endereço (quem abre a lista em kind=any)', () => {
  test('tipo de logradouro ou número no primeiro trecho que identifica algo', () => {
    assert.equal(looksLikeAddress('Rua Potengi 300'), true);
    assert.equal(looksLikeAddress('Condomínio residencial, Rua Erivan França, 1199'), true, 'o primeiro trecho só tem palavras genéricas');
    assert.equal(looksLikeAddress('Midway Mall, Av. Rio Branco, 536'), false);
    assert.equal(looksLikeAddress('Hospital do Coracao Natal'), false);
  });

  test('resultado que não cita nada do pedido vai para o fim (rua trocada)', () => {
    const swapped = candidate('geocoding', 'Rua Candelaria 190', 'Guarapés, Natal - RN', -5.84, -35.27);
    const unrelated = candidate('geocoding', 'Rua Nova', 'Redinha, Natal - RN', -5.75, -35.22);
    const ranked = rankSearchResults({ q: 'Rua Catavento, 190, Candelária, Natal, RN', kind: 'address', curated: [], geocoding: [unrelated, swapped], searchbox: [] });
    assert.deepEqual(ranked.map((result) => result.id), [swapped.id, unrelated.id]);
  });
});
