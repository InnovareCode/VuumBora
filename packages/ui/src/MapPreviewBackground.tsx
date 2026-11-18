/// <reference path="./assets.d.ts" />
import { memo } from 'react';
import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';
import mapSource from '../assets/map/mapa-escuro-natal.jpg';

export interface MapPreviewBackgroundProps {
  readonly style?: StyleProp<ImageStyle>;
  readonly testID?: string;
}

/**
 * Fundo estático do mapa (direção de arte §7.1/§9 item 7) — placeholder até a escolha do
 * SDK de mapa real (D-11, docs/decisions.md; a especificação `map.*` para o SDK fica só
 * documentada). Malha urbana + orla a leste, nas cores `map.*`. Preenche o contêiner do
 * chamador (`StyleSheet.absoluteFill` já aplicado por padrão) — quem corta/arredonda é o
 * `overflow:'hidden'` do card que envolve este componente.
 */
export const MapPreviewBackground = memo(function MapPreviewBackground({ style, testID }: MapPreviewBackgroundProps) {
  return (
    <Image
      source={mapSource}
      style={[StyleSheet.absoluteFill, style]}
      resizeMode="cover"
      accessibilityIgnoresInvertColors
      testID={testID}
    />
  );
});
