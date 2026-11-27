import { useEffect, useRef, useState } from 'react';
import type { ApiError } from '@vuumbora/api-client';
import type { GeoSearchResult, GeoSearchSource } from '@vuumbora/api-client/passenger';
import { geoPort } from '../geo/geoClient';

export type AddressSearchStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'offline';

export interface AddressSearchState {
  readonly status: AddressSearchStatus;
  readonly results: readonly GeoSearchResult[];
  /** Erro de uma das buscas. Com `ready`, a lista veio PARCIAL (a outra fonte respondeu). */
  readonly error?: ApiError | undefined;
  /** O dado veio do adaptador `mock` (a tela mostra o selo "endereços de exemplo"). */
  readonly fromMock: boolean;
}

/** Ficha P04 §5: a busca só sai 300 ms depois de a digitação parar. */
const DEBOUNCE_MS = 300;
/** Mesmo teto do servidor (`GET /v1/geo/search`, até 8 resultados). */
const MAX_RESULTS = 8;
const SOURCE_ORDER: readonly GeoSearchSource[] = ['curated', 'geocoding', 'searchbox'];

const IDLE: AddressSearchState = { status: 'idle', results: [], fromMock: false };

/**
 * Busca de endereço PELO SERVIDOR (N6). O contrato escolhe a fonte externa por `kind`: `address` junta os pontos
 * próprios com o Geocoding, `place` junta os pontos próprios com o Search Box. A pessoa digita uma coisa só ("midway",
 * "rua mossoró 500", "ponta negra"), então a tela faz as DUAS e junta: pontos próprios primeiro (sem repetir), depois
 * endereços, depois lugares, até 8.
 *
 * Custo conhecido: duas chamadas por busca contam em dobro no limite por conta (`429 rate_limited`). Reportado ao Atlas
 * como pedido de contrato (`kind` opcional "os dois" numa chamada só).
 */
export function useAddressSearch(query: string, options: { readonly enabled: boolean; readonly online: boolean; readonly nearLat?: number; readonly nearLng?: number }): AddressSearchState & { retry(): void } {
  const [state, setState] = useState<AddressSearchState>(IDLE);
  const [attempt, setAttempt] = useState(0);
  const { enabled, online, nearLat, nearLng } = options;
  // A posição só desempata a ordem: chegar (ou mudar) a posição NÃO refaz a busca — senão a busca recomeça, com o
  // debounce, toda vez que a localização responde depois de a tela abrir. Lida na hora da chamada.
  const nearRef = useRef<{ readonly lat: number; readonly lng: number } | undefined>(undefined);
  nearRef.current = nearLat !== undefined && nearLng !== undefined ? { lat: nearLat, lng: nearLng } : undefined;
  // O debounce é para a DIGITAÇÃO: um texto que já chega preenchido (ao abrir a tela) busca na hora.
  const firstRun = useRef(true);

  useEffect(() => {
    const isFirstRun = firstRun.current;
    firstRun.current = false;
    const trimmed = query.trim();
    if (!enabled || !trimmed) {
      setState(IDLE);
      return;
    }
    let cancelled = false;
    const delay = isFirstRun ? 0 : DEBOUNCE_MS;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      if (!online) {
        setState({ status: 'offline', results: [], fromMock: false });
        return;
      }
      setState({ status: 'loading', results: [], fromMock: false });
      const near = nearRef.current ? { near: nearRef.current } : {};
      const [addresses, places] = await Promise.all([
        geoPort.search({ q: trimmed, kind: 'address', ...near }),
        geoPort.search({ q: trimmed, kind: 'place', ...near }),
      ]);
      if (cancelled) return;

      const lists = [addresses, places].flatMap((result) => (result.ok ? [result.data.results] : []));
      const error = !addresses.ok ? addresses.error : !places.ok ? places.error : undefined;
      const fromMock = [addresses, places].some((result) => result.ok && result.origin === 'mock');

      if (lists.length === 0) {
        setState({ status: 'error', results: [], error, fromMock: false });
        return;
      }
      const merged = mergeResults(lists);
      if (merged.length === 0) {
        // Uma fonte falhou e a outra não achou nada: não dá para dizer "nenhum endereço encontrado".
        setState(error ? { status: 'error', results: [], error, fromMock } : { status: 'empty', results: [], fromMock });
        return;
      }
      setState({ status: 'ready', results: merged, error, fromMock });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, enabled, online, attempt]);

  return { ...state, retry: () => setAttempt((value) => value + 1) };
}

function mergeResults(lists: readonly (readonly GeoSearchResult[])[]): readonly GeoSearchResult[] {
  const seen = new Set<string>();
  const merged: GeoSearchResult[] = [];
  for (const source of SOURCE_ORDER) {
    for (const list of lists) {
      for (const result of list) {
        if (result.source !== source || seen.has(result.id)) continue;
        seen.add(result.id);
        merged.push(result);
      }
    }
  }
  return merged.slice(0, MAX_RESULTS);
}
