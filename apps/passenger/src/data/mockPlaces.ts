import type { Place } from '@vuumbora/domain';

/**
 * Endereços de DEMONSTRAÇÃO (especificacoes/PASSAGEIRO.md: "mockups são propostas, não
 * recursos implementados"). Nenhum ponto aqui vem de geocodificação real — só fixa o
 * suficiente para a P04 (destino) ter conteúdo plausível para filtrar/escolher.
 * Sem contrato de `PlacesPort` ainda implementado (pendência da Vega) — por isso a busca
 * roda 100% local, sem chamar nenhum adaptador.
 */

export const MOCK_CURRENT_LOCATION: Place = {
  label: 'Local atual',
  address: 'Ponta Negra, Natal - RN',
  point: { latitude: -5.879, longitude: -35.177, accuracyM: 12 },
};

export const MOCK_SAVED_PLACES: readonly Place[] = [
  { label: 'Casa', address: 'Rua das Dunas, 120 — Ponta Negra, Natal - RN', point: { latitude: -5.881, longitude: -35.18 } },
  {
    label: 'Trabalho',
    address: 'Av. Engenheiro Roberto Freire, 3000 — Capim Macio, Natal - RN',
    point: { latitude: -5.853, longitude: -35.209 },
  },
  {
    label: 'Shopping Midway Mall',
    address: 'Av. Sen. Salgado Filho, 2234 — Candelária, Natal - RN',
    point: { latitude: -5.834, longitude: -35.211 },
  },
];

/** Resultado de autocomplete — filtrado localmente por texto, nunca por geocodificação real. */
export const MOCK_DESTINATION_SUGGESTIONS: readonly Place[] = [
  ...MOCK_SAVED_PLACES,
  { label: 'Aeroporto Internacional de Natal', address: 'São Gonçalo do Amarante - RN', point: { latitude: -5.768, longitude: -35.376 } },
  { label: 'Terminal Rodoviário de Natal', address: 'Av. Capitão Mor Gouveia, 1237 — Cidade da Esperança, Natal - RN', point: { latitude: -5.800, longitude: -35.233 } },
  { label: 'Praia de Ponta Negra', address: 'Ponta Negra, Natal - RN', point: { latitude: -5.887, longitude: -35.171 } },
  { label: 'Centro de Convenções de Natal', address: 'Av. Prudente de Morais, 5680 — Candelária, Natal - RN', point: { latitude: -5.832, longitude: -35.206 } },
  { label: 'Hospital Walfredo Gurgel', address: 'Av. Sen. Salgado Filho, s/n — Tirol, Natal - RN', point: { latitude: -5.802, longitude: -35.209 } },
  { label: 'Fortaleza dos Reis Magos', address: 'Praia do Forte, Natal - RN', point: { latitude: -5.762, longitude: -35.195 } },
];

/** Busca local simples (contém, sem acento-sensibilidade) — substitui `PlacesPort.search` até existir adaptador. */
export function searchMockPlaces(query: string): readonly Place[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return MOCK_DESTINATION_SUGGESTIONS.filter(
    (place) => place.label.toLowerCase().includes(normalized) || place.address.toLowerCase().includes(normalized)
  );
}
