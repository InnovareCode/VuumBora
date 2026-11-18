/// <reference path="./assets.d.ts" />
import { memo } from 'react';
import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';
import mapSourceNatal from '../assets/map/mapa-escuro-natal.jpg';
import mapSourceMotorista from '../assets/map/mapa-escuro-motorista.jpg';

export type MapPreviewVariant = 'natal' | 'motorista';

const SOURCES: Record<MapPreviewVariant, number> = {
  natal: mapSourceNatal,
  motorista: mapSourceMotorista,
};

export interface MapPreviewBackgroundProps {
  /** Qual recorte de mapa usar — `natal` (Home do passageiro) ou `motorista` (Home do motorista). */
  readonly variant?: MapPreviewVariant;
  readonly style?: StyleProp<ImageStyle>;
  readonly testID?: string;
}

/**
 * Fundo estático do mapa (direção de arte §7.1/§9 item 7) — placeholder até a escolha do
 * SDK de mapa real (D-11, docs/decisions.md; a especificação `map.*` para o SDK fica só
 * documentada). Malha urbana + orla a leste, nas cores `map.*`. Preenche o contêiner do
 * chamador (`StyleSheet.absoluteFill` já aplicado por padrão) — quem corta/arredonda é o
 * `overflow:'hidden'` do card que envolve este componente. `variant` escolhe o recorte;
 * default `natal` preserva o comportamento anterior (só passageiro usava este componente).
 */
export const MapPreviewBackground = memo(function MapPreviewBackground({ variant = 'natal', style, testID }: MapPreviewBackgroundProps) {
  return (
    <Image
      source={SOURCES[variant]}
      style={[StyleSheet.absoluteFill, style]}
      resizeMode="cover"
      accessibilityIgnoresInvertColors
      testID={testID}
    />
  );
});
