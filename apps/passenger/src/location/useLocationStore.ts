import { useMemo } from 'react';
import { create } from 'zustand';
import type { Place } from '@vuumbora/domain';
import { geoPort } from '../geo/geoClient';
import { currentLocationPlace } from '../geo/geoFormat';
import { locationPort as platformLocationPort } from './locationPort';
import type { LocationPort } from './locationPort.types';

/**
 * Posição do aparelho, COMPARTILHADA entre a P03 (mapa e chip "você está aqui") e a P04 (origem padrão "Sua localização
 * atual"). É estado global de propósito: as duas telas leem a mesma leitura, e a P04 não pergunta de novo.
 *
 * - `checking`: lendo a permissão (sem perguntar nada);
 * - `needs_permission`: a P03 mostra a pré-permissão (ficha P03 §5) ANTES de o sistema perguntar;
 * - `locating` → `located` | `error` (prazo/sem sinal) | `denied` | `unavailable` (sem API: nativo sem `expo-location`).
 *
 * Depois de `located`, o servidor dá nome ao ponto (`geoPort.reverse`): é ele que diz se a pessoa está dentro da área
 * atendida (`inServiceArea`). Se o nome falhar, a posição continua valendo (a origem vira "Sua localização atual").
 */
export type LocationStatus = 'idle' | 'checking' | 'needs_permission' | 'locating' | 'located' | 'denied' | 'error' | 'unavailable';
export type PlaceLookupStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DevicePosition {
  readonly lat: number;
  readonly lng: number;
  readonly accuracyM?: number;
}

export interface LocationState {
  readonly status: LocationStatus;
  readonly position?: DevicePosition | undefined;
  readonly placeStatus: PlaceLookupStatus;
  readonly placeLabel?: string | undefined;
  readonly inServiceArea?: boolean | undefined;

  /** Começa a leitura uma vez (P03/P04 chamam ao montar). Não faz nada se já começou. */
  ensureStarted(): void;
  /** A pessoa tocou "Permitir" na pré-permissão: é aqui que o sistema/navegador pergunta. */
  requestPermission(): void;
  /** "Tentar de novo" / "Centralizar no meu local": lê a posição de novo. */
  relocate(): void;
}

let port: LocationPort = platformLocationPort;
/** Invalida leitura/nome em voo quando uma mais nova começa (voo único). */
let generation = 0;

/** SÓ `__DEV__`: troca a porta por um cenário de desenvolvimento (`?devLocal=`) e recomeça do zero. */
export function setDevLocationPort(devPort: LocationPort): void {
  if (!__DEV__) return;
  port = devPort;
  generation += 1;
  useLocationStore.setState({ status: 'idle', position: undefined, placeStatus: 'idle', placeLabel: undefined, inServiceArea: undefined });
}

export const useLocationStore = create<LocationState>((set, get) => {
  async function lookUpPlace(position: DevicePosition, myGeneration: number): Promise<void> {
    set({ placeStatus: 'loading' });
    const result = await geoPort.reverse({ lat: position.lat, lng: position.lng });
    if (myGeneration !== generation) return;
    if (!result.ok) {
      set({ placeStatus: 'error', placeLabel: undefined, inServiceArea: undefined });
      return;
    }
    set({ placeStatus: 'ready', placeLabel: result.data.label, inServiceArea: result.data.inServiceArea });
  }

  async function locate(fresh: boolean): Promise<void> {
    const myGeneration = ++generation;
    set({ status: 'locating' });
    const fix = await port.currentPosition({ fresh });
    if (myGeneration !== generation) return;
    if (!fix.ok) {
      const status: LocationStatus = fix.reason === 'denied' ? 'denied' : fix.reason === 'unavailable' ? 'unavailable' : 'error';
      set({ status, position: undefined, placeStatus: 'idle', placeLabel: undefined, inServiceArea: undefined });
      return;
    }
    const position: DevicePosition = { lat: fix.lat, lng: fix.lng, ...(fix.accuracyM !== undefined ? { accuracyM: fix.accuracyM } : {}) };
    set({ status: 'located', position });
    await lookUpPlace(position, myGeneration);
  }

  return {
    status: 'idle',
    placeStatus: 'idle',

    ensureStarted: () => {
      if (get().status !== 'idle') return;
      const myGeneration = ++generation;
      set({ status: 'checking' });
      port
        .permission()
        .then((permission) => {
          if (myGeneration !== generation) return;
          if (permission === 'granted') void locate(false);
          else if (permission === 'prompt') set({ status: 'needs_permission' });
          else if (permission === 'denied') set({ status: 'denied' });
          else set({ status: 'unavailable' });
        })
        .catch(() => {
          if (myGeneration === generation) set({ status: 'error' });
        });
    },

    requestPermission: () => {
      void locate(false);
    },

    // "Centralizar no meu local" / "Tentar de novo": leitura NOVA, nunca a posição guardada.
    relocate: () => {
      void locate(true);
    },
  };
});

/** A posição como LUGAR de origem, ou `undefined` enquanto não há posição. */
export function currentLocationAsPlace(state: Pick<LocationState, 'status' | 'position' | 'placeLabel'>): Place | undefined {
  if (state.status !== 'located' || !state.position) return undefined;
  return currentLocationPlace(state.position, state.placeLabel, state.position.accuracyM);
}

/**
 * Hook da posição como lugar. Seleciona os campos PRIMITIVOS e monta o lugar com `useMemo`: usar
 * `currentLocationAsPlace` direto como seletor do zustand criaria um objeto novo a cada leitura (re-render sem fim).
 */
export function useCurrentLocationPlace(): Place | undefined {
  const status = useLocationStore((state) => state.status);
  const position = useLocationStore((state) => state.position);
  const placeLabel = useLocationStore((state) => state.placeLabel);
  return useMemo(() => currentLocationAsPlace({ status, position, placeLabel }), [status, position, placeLabel]);
}

/** Ainda pode virar posição (a P04 mostra a origem travada "procurando" em vez de abrir o campo vazio). */
export function isLocationPending(status: LocationStatus): boolean {
  return status === 'idle' || status === 'checking' || status === 'locating';
}
