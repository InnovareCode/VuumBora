/**
 * iOS/Android: sem `expo-location` instalado, não há como ler a posição. A porta responde `unavailable` (a P03 mostra
 * "localização indisponível" e a P04 abre a origem como campo de busca) em vez de inventar um ponto. Instalar o módulo é
 * decisão fora desta fatia (módulo nativo exige build nova): quando entrar, só este arquivo muda.
 */
import type { LocationFix, LocationPermission, LocationPort } from './locationPort.types';

export const locationPort: LocationPort = {
  permission: async (): Promise<LocationPermission> => 'unavailable',
  currentPosition: async (): Promise<LocationFix> => ({ ok: false, reason: 'unavailable' }),
};
