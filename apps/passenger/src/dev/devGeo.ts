import { useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { Place } from '@vuumbora/domain';
import { GEO_QUOTE_ERRORS } from '@vuumbora/api-client/passenger';
import { devFailNextGeo, type DevGeoFailure, type GeoOperation } from '../geo/geoClient';
import { currentLocationPlace } from '../geo/geoFormat';
import type { LocationPort } from '../location/locationPort.types';
import { setDevLocationPort } from '../location/useLocationStore';

/**
 * SÓ `__DEV__`: cenários de geografia e localização pela URL, para a ferramenta `tools/qualidade-tela` fotografar cada
 * estado da P03-P06 sem clicar (mesmo padrão do `?devCenario=` do motorista e do `?devSeed=`/`?devPhase=` daqui). Em
 * produção `__DEV__` é falso e nada daqui roda.
 *
 * - `?devLocal=ok|pedir|negada|erro|indisponivel|fora|carregando`: a porta de localização responde como o cenário;
 * - `?devGeoErro=<código do catálogo>|network`: a PRIMEIRA chamada da operação da tela recusa com aquele erro
 *   (`devFailNextGeo`, mesmo `catalogError` do mock: a tela recebe exatamente o que receberia do servidor).
 *
 * O ponto de exemplo abaixo só existe para MONTAR o estado; é um dos lugares do próprio mock do contrato
 * (`MOCK_GEO_PLACES`, "Av. Eng. Roberto Freire, 2000"), para o servidor simulado reconhecê-lo no `reverse`.
 */
const DEV_SAMPLE_POSITION = { lat: -5.8778, lng: -35.1792 } as const;
/** Fora do polígono ilustrativo da Grande Natal (`MOCK_SERVICE_AREA`): interior do RN. */
const DEV_OUTSIDE_POSITION = { lat: -5.4, lng: -36.2 } as const;

export const DEV_LOCATION_SCENARIOS = ['ok', 'pedir', 'negada', 'erro', 'indisponivel', 'fora', 'carregando'] as const;
export type DevLocationScenario = (typeof DEV_LOCATION_SCENARIOS)[number];

function parseDevLocation(value: string | string[] | undefined): DevLocationScenario | undefined {
  if (!__DEV__ || typeof value !== 'string') return undefined;
  return (DEV_LOCATION_SCENARIOS as readonly string[]).includes(value) ? (value as DevLocationScenario) : undefined;
}

function parseDevGeoFailure(value: string | string[] | undefined): DevGeoFailure | undefined {
  if (!__DEV__ || typeof value !== 'string') return undefined;
  if (value === 'network') return 'network';
  return Object.prototype.hasOwnProperty.call(GEO_QUOTE_ERRORS, value) ? (value as DevGeoFailure) : undefined;
}

const never = <T,>(): Promise<T> => new Promise<T>(() => undefined);

function devLocationPort(scenario: DevLocationScenario): LocationPort {
  switch (scenario) {
    case 'ok':
      return { permission: async () => 'granted', currentPosition: async () => ({ ok: true, ...DEV_SAMPLE_POSITION, accuracyM: 15 }) };
    case 'pedir':
      return { permission: async () => 'prompt', currentPosition: async () => ({ ok: true, ...DEV_SAMPLE_POSITION, accuracyM: 15 }) };
    case 'negada':
      return { permission: async () => 'denied', currentPosition: async () => ({ ok: false, reason: 'denied' }) };
    case 'erro':
      return { permission: async () => 'granted', currentPosition: async () => ({ ok: false, reason: 'timeout' }) };
    case 'indisponivel':
      return { permission: async () => 'unavailable', currentPosition: async () => ({ ok: false, reason: 'unavailable' }) };
    case 'fora':
      return { permission: async () => 'granted', currentPosition: async () => ({ ok: true, ...DEV_OUTSIDE_POSITION, accuracyM: 30 }) };
    case 'carregando':
      return { permission: async () => 'granted', currentPosition: () => never() };
  }
}

/** Origem de exemplo dos atalhos de captura (`?devSeed=`, `?devPhase=`): a mesma posição do cenário `ok`. */
export function devSampleOrigin(): Place {
  return currentLocationPlace(DEV_SAMPLE_POSITION, 'Av. Eng. Roberto Freire, 2000');
}

/**
 * Aplica `?devLocal=` (antes de a tela começar a ler a posição) e `?devGeoErro=` na operação dada. Declarar ANTES dos
 * outros efeitos da tela: efeitos rodam na ordem em que são declarados.
 */
export function useDevGeoParams(operation: GeoOperation): void {
  const { devLocal, devGeoErro } = useLocalSearchParams<{ devLocal?: string; devGeoErro?: string }>();
  useEffect(() => {
    if (!__DEV__) return;
    const scenario = parseDevLocation(devLocal);
    if (scenario) setDevLocationPort(devLocationPort(scenario));
    const failure = parseDevGeoFailure(devGeoErro);
    // A busca da P04 faz duas chamadas (`address` e `place`): o cenário derruba as duas, senão a tela mostraria a lista parcial.
    if (failure) devFailNextGeo(operation, failure, operation === 'search' ? 2 : 1);
    // Só na montagem: o cenário é da URL com que a tela abriu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
