import type { Place } from '@vuumbora/domain';

/**
 * Endereços de DEMONSTRAÇÃO (especificacoes/PASSAGEIRO.md: "mockups são propostas, não
 * recursos implementados"). Nenhum ponto aqui vem de geocodificação real.
 *
 * A busca por texto da P04 passou a usar `placesClient` (`src/places/placesClient.ts`, porta
 * `PlacesPort` de `@vuumbora/api-client/passenger`) — o que sobra aqui é só o que a porta NÃO
 * cobre: a localização atual (ponto de partida padrão, também usado pela store) e os "lugares
 * salvos" (ainda sem fonte própria — API do usuário, pendência futura).
 */

// Rótulo "Sua localização atual" é a copy da ficha P04 (`docs/fichas-de-tela/P04-origem-e-destino.md`
// §7) — era "Local atual" antes desta fatia; conferido que não aparece em mais nenhuma tela.
export const MOCK_CURRENT_LOCATION: Place = {
  label: 'Sua localização atual',
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
