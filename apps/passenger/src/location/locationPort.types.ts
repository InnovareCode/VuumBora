/**
 * Porta da LOCALIZAÇÃO do aparelho (P03 e a origem padrão da P04). Duas implementações escolhidas pelo Metro pela
 * extensão de plataforma, igual ao `documentPicker` do motorista:
 *
 * - `locationPort.web.ts`: API do navegador (`navigator.permissions` + `navigator.geolocation`);
 * - `locationPort.ts` (iOS/Android): `unavailable` até instalarem o `expo-location` (módulo NATIVO, fatia que depende de
 *   decisão do Atlas: exige nova build de desenvolvimento). Nada de fingir uma posição.
 */
export type LocationPermission = 'granted' | 'prompt' | 'denied' | 'unavailable';

export type LocationFix =
  | { readonly ok: true; readonly lat: number; readonly lng: number; readonly accuracyM?: number }
  | { readonly ok: false; readonly reason: 'denied' | 'timeout' | 'position_unavailable' | 'unavailable' };

export interface LocationPort {
  /** Estado da permissão SEM perguntar nada à pessoa (para mostrar a pré-permissão antes do pedido do sistema). */
  permission(): Promise<LocationPermission>;
  /**
   * Pede a posição atual. Com permissão `prompt`, é ESTA chamada que abre a pergunta do sistema/navegador.
   * `fresh: true` ("Centralizar no meu local", "Tentar de novo") exige uma leitura NOVA, sem reaproveitar a última.
   */
  currentPosition(options?: { readonly fresh?: boolean }): Promise<LocationFix>;
}
