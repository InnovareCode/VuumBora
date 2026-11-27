/**
 * O ÚNICO cliente de GEOGRAFIA E COTAÇÃO do passageiro (M4, fatia G6 do `docs/plano-m3-m4.md`): busca de endereço pelo
 * servidor (N6), ponto do pino (`reverse`), área atendida, categorias ligadas e a cotação assinada (`createQuotes`,
 * `getQuote`). Nenhuma tela monta o próprio cliente; a store da corrida e as telas P03-P06 passam por aqui.
 *
 * **Só existe o adaptador `mock`** no `api-client` (o `http` entra com as rotas G3 e G4). Quando ele existir, troca só a
 * linha do `createMockPassengerGeo`, no mesmo espírito de `src/identity/identityClient.ts`.
 *
 * **Tarifa de teste (N8):** a cotação do mock só sai com a versão de TESTE. Em desenvolvimento (`__DEV__`) ela é aceita e a
 * P06 mostra o selo "tarifa de teste"; em `preview`/`production` o mock responde como a produção responderá enquanto a
 * decisão 7 não sair: `503 fare_not_configured` ("ainda não operamos"). Assim nenhuma build de loja mostra preço de teste.
 *
 * **Convivência com a F08:** a corrida ainda usa `PassengerRidePort` (`src/ride/passengerRideClient.ts`), cuja `request()`
 * só aceita o `quoteId` da cotação ANTIGA. A ponte fica escondida no simulador (`src/sim/rideSimulator.ts`) até o M5; as
 * telas só conhecem a cotação deste módulo.
 *
 * Gancho de prova (só `__DEV__` no web, igual ao `__vuumboraIdentity`): `window.__vuumboraGeo` expõe o `control` do mock
 * (`failNext`, `setAllowTestFares`, `expireQuote`...) e `failNextOn(operação, código)`, que recusa a PRÓXIMA chamada
 * daquela operação com o erro do catálogo (o `failNext` do mock vale para qualquer chamada, e duas buscas em paralelo
 * disputariam quem o consome). Nunca existe no app da loja.
 */
import { Platform } from 'react-native';
import { catalogError, NETWORK_FAILURE, type ApiError, type Result } from '@vuumbora/api-client';
import {
  createMockPassengerGeo,
  GEO_QUOTE_ERRORS,
  type FareQuotePort,
  type GeoPort,
  type GeoQuoteErrorCode,
  type MockPassengerGeoControl,
} from '@vuumbora/api-client/passenger';

/**
 * Atraso simulado por chamada: mantém as respostas assíncronas (a tela passa pelo "carregando"), mas curto. Medido na G6:
 * a ferramenta `tools/qualidade-tela` fotografa ~700 ms depois do `pushState`, e a rota leva ~500 ms para montar no
 * Metro de desenvolvimento — sobram ~250 ms depois de a tela aparecer. Com 350 ms, a P05, a busca e o pino saíam sempre
 * "carregando" na captura. O estado de carregamento tem captura própria (`?devLocal=carregando`).
 */
const MOCK_GEO_LATENCY_MS = 40;

export type GeoOperation = 'search' | 'reverse' | 'serviceArea' | 'categories' | 'createQuotes' | 'getQuote';
export type DevGeoFailure = GeoQuoteErrorCode | 'network';

const mock = createMockPassengerGeo({ delayMs: MOCK_GEO_LATENCY_MS, allowTestFares: __DEV__ });

const devFailures = new Map<GeoOperation, { readonly failure: DevGeoFailure; remaining: number }>();

function takeDevFailure(operation: GeoOperation): ApiError | undefined {
  if (!__DEV__) return undefined;
  const pending = devFailures.get(operation);
  if (pending === undefined) return undefined;
  pending.remaining -= 1;
  if (pending.remaining <= 0) devFailures.delete(operation);
  return pending.failure === 'network' ? NETWORK_FAILURE : catalogError(GEO_QUOTE_ERRORS, pending.failure);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function guarded<A extends readonly unknown[], T>(
  operation: GeoOperation,
  call: (...args: A) => Promise<Result<T>>,
): (...args: A) => Promise<Result<T>> {
  return async (...args: A) => {
    const forced = takeDevFailure(operation);
    if (forced) {
      await wait(MOCK_GEO_LATENCY_MS);
      return { ok: false, error: forced };
    }
    return call(...args);
  };
}

export const geoPort: GeoPort = {
  search: guarded('search', mock.geoPort.search),
  reverse: guarded('reverse', mock.geoPort.reverse),
  serviceArea: guarded('serviceArea', mock.geoPort.serviceArea),
  categories: guarded('categories', mock.geoPort.categories),
};

export const quotePort: FareQuotePort = {
  createQuotes: guarded('createQuotes', mock.quotePort.createQuotes),
  getQuote: guarded('getQuote', mock.quotePort.getQuote),
};

/**
 * Só `__DEV__`: faz as PRÓXIMAS `times` chamadas desta operação falharem com o código do catálogo (ou sem rede). A busca
 * da P04 faz duas chamadas por texto (`address` e `place`): `times: 2` derruba as duas.
 */
export function devFailNextGeo(operation: GeoOperation, failure: DevGeoFailure, times = 1): void {
  if (!__DEV__) return;
  devFailures.set(operation, { failure, remaining: Math.max(1, times) });
}

interface GeoDevHook {
  readonly control: MockPassengerGeoControl;
  readonly failNextOn: (operation: GeoOperation, failure: DevGeoFailure, times?: number) => void;
}

if (__DEV__ && Platform.OS === 'web') {
  const hooks = globalThis as { __vuumboraGeo?: GeoDevHook };
  hooks.__vuumboraGeo = { control: mock.control, failNextOn: devFailNextGeo };
}
