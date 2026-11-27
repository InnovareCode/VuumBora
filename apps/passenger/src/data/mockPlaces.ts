import type { Place } from '@vuumbora/domain';

/**
 * "Lugares salvos" de DEMONSTRAÇÃO (especificacoes/PASSAGEIRO.md: "mockups são propostas, não recursos implementados") —
 * ainda sem fonte própria (API do usuário, pendência futura). A tela os marca com o selo "endereços de exemplo".
 *
 * Fatia G6: a busca por texto e o ponto do pino vêm do contrato (`src/geo/geoClient.ts`), e a localização atual vem do
 * aparelho (`src/location`). A "localização atual" fixa que morava aqui (`MOCK_CURRENT_LOCATION`, Ponta Negra) saiu: o
 * app não inventa mais a posição de ninguém.
 */
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
