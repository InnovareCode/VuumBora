/**
 * Adaptador `mock` de `PlacesPort` (`search`, declarado em `./types.ts`). Não existia adaptador
 * nenhum até esta fatia (onda 2, P04) — a busca de endereço do app rodava 100% local
 * (`apps/passenger/src/data/mockPlaces.ts`, `searchMockPlaces`), fora do padrão portas &
 * adaptadores do pacote. Este módulo só move essa mesma ideia para o lugar certo, com:
 *
 * - **atraso simulado** (`delayMs`, padrão 350ms) — sem ele a tela nunca mostra o estado
 *   "carregando" (ficha P04 §5 pede esqueleto depois de 300ms de digitação parada);
 * - endereços de Natal/RN, no espírito da amostra da F10 (`docs/area-de-servico-natal.md`) —
 *   não é a mesma lista (aquela é só teste de API), mas cobre bairro, praia, shopping, ponto
 *   turístico e os erros de abreviação/sem acento mais comuns, para a busca ter algo plausível
 *   para filtrar;
 * - normalização sem acento (`normalize('NFD')`) — "midway mall" e "nao" (sem ~) encontram
 *   "Midway Mall" e "Natal" do mesmo jeito que a amostra da F10 testou.
 *
 * **Sem Mapbox real** (D1 do plano dos apps continua aberto): quando o adaptador `http`
 * existir, ele implementa Geocoding v6 + Search Box conforme `docs/area-de-servico-natal.md`
 * §5 — esta porta só precisa ser trocada aqui, nenhuma tela conhece o mock por fora deste
 * módulo (mesmo espírito de `passengerRideClient.ts`).
 */
import type { Place } from '@vuumbora/domain';
import { failWith, succeed } from '../trip/result';
import type { Result } from '../index';
import type { PlacesPort } from './types';

export interface MockPlacesOptions {
  /** Atraso simulado por busca, em ms (padrão 350 — suficiente para o estado "carregando" aparecer). */
  readonly delayMs?: number;
  readonly places?: readonly Place[];
  /** Injetável nos testes: força a próxima busca a devolver erro (`kind: 'unavailable'`), uma vez. */
  readonly failNext?: () => boolean;
}

const DEFAULT_PLACES: readonly Place[] = [
  { label: 'Midway Mall', address: 'Av. Sen. Salgado Filho, 2234 — Candelária, Natal - RN', point: { latitude: -5.834, longitude: -35.211 }, neighborhood: 'Candelária' },
  { label: 'Natal Shopping', address: 'Av. Sen. Salgado Filho, 159 — Capim Macio, Natal - RN', point: { latitude: -5.85, longitude: -35.208 }, neighborhood: 'Capim Macio' },
  { label: 'Praia de Ponta Negra', address: 'Ponta Negra, Natal - RN', point: { latitude: -5.887, longitude: -35.171 }, neighborhood: 'Ponta Negra' },
  { label: 'Praia do Meio', address: 'Via Costeira, Natal - RN', point: { latitude: -5.776, longitude: -35.195 }, neighborhood: 'Santos Reis' },
  { label: 'Aeroporto Internacional de Natal', address: 'São Gonçalo do Amarante - RN', point: { latitude: -5.768, longitude: -35.376 } },
  { label: 'Terminal Rodoviário de Natal', address: 'Av. Capitão Mor Gouveia, 1237 — Cidade da Esperança, Natal - RN', point: { latitude: -5.8, longitude: -35.233 }, neighborhood: 'Cidade da Esperança' },
  { label: 'Hospital Walfredo Gurgel', address: 'Av. Sen. Salgado Filho, s/n — Tirol, Natal - RN', point: { latitude: -5.802, longitude: -35.209 }, neighborhood: 'Tirol' },
  { label: 'Hospital Giselda Trigueiro', address: 'Rua Cônego Monte, s/n — Quintas, Natal - RN', point: { latitude: -5.787, longitude: -35.227 }, neighborhood: 'Quintas' },
  { label: 'Fortaleza dos Reis Magos', address: 'Praia do Forte, Natal - RN', point: { latitude: -5.762, longitude: -35.195 }, neighborhood: 'Praia do Forte' },
  { label: 'Centro de Convenções de Natal', address: 'Av. Prudente de Morais, 5680 — Candelária, Natal - RN', point: { latitude: -5.832, longitude: -35.206 }, neighborhood: 'Candelária' },
  { label: 'Teatro Alberto Maranhão', address: 'Praça Augusto Severo, s/n — Cidade Alta, Natal - RN', point: { latitude: -5.795, longitude: -35.206 }, neighborhood: 'Cidade Alta' },
  { label: 'Alphaville Natal', address: 'Nova Parnamirim, Parnamirim - RN', point: { latitude: -5.902, longitude: -35.213 }, neighborhood: 'Nova Parnamirim' },
  { label: 'UFRN — Campus Central', address: 'Av. Sen. Salgado Filho, 3000 — Lagoa Nova, Natal - RN', point: { latitude: -5.838, longitude: -35.199 }, neighborhood: 'Lagoa Nova' },
  { label: 'Morro do Careca', address: 'Ponta Negra, Natal - RN', point: { latitude: -5.896, longitude: -35.169 }, neighborhood: 'Ponta Negra' },
];

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalize(value: string): string {
  return stripDiacritics(value.trim().toLowerCase());
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMockPlacesPort(options: MockPlacesOptions = {}): PlacesPort {
  const delayMs = options.delayMs ?? 350;
  const places = options.places ?? DEFAULT_PLACES;

  return {
    async search(query: string): Promise<Result<readonly Place[]>> {
      await wait(delayMs);

      if (options.failNext?.()) {
        return failWith({ kind: 'unavailable', retryable: true });
      }

      const normalized = normalize(query);
      if (!normalized) return succeed([]);

      const matches = places.filter(
        (place) => normalize(place.label).includes(normalized) || normalize(place.address).includes(normalized),
      );
      return succeed(matches.slice(0, 8));
    },
  };
}
