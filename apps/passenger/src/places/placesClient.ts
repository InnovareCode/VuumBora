/**
 * Instância ÚNICA da porta de busca de endereço (`@vuumbora/api-client/passenger`,
 * `PlacesPort`). Mesmo espírito de `src/ride/passengerRideClient.ts` e
 * `src/identity/identityClient.ts`: nenhuma tela conhece o adaptador por fora deste módulo.
 *
 * Hoje só existe o adaptador `mock` (sem Mapbox real — D1 do plano dos apps). Quando o
 * adaptador `http` existir (`docs/area-de-servico-natal.md` §5: Geocoding v6 + Search Box),
 * troca só esta linha.
 */
import { createMockPlacesPort } from '@vuumbora/api-client/passenger';
import type { PlacesPort } from '@vuumbora/api-client/passenger';

export const placesClient: PlacesPort = createMockPlacesPort();
