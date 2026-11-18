/// <reference path="./assets.d.ts" />
import { memo } from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';
import economicoSource from '../assets/vehicles/veiculo-economico.png';
import comfortSource from '../assets/vehicles/veiculo-comfort.png';
import plusSource from '../assets/vehicles/veiculo-plus.png';

export type VehicleIllustrationVariant = 'economico' | 'comfort' | 'plus';

export interface VehicleIllustrationProps {
  readonly variant: VehicleIllustrationVariant;
  /** Largura em pt — a altura segue a proporção nativa do recorte (150×65). */
  readonly width?: number;
  readonly style?: StyleProp<ImageStyle>;
  readonly testID?: string;
}

const SOURCE: Record<VehicleIllustrationVariant, number> = {
  economico: economicoSource,
  comfort: comfortSource,
  plus: plusSource,
};

// Proporção nativa do recorte (packages/ui/assets/vehicles, 150×65 @1x; @2x/@3x
// resolvidos automaticamente pelo Metro via convenção de nome de arquivo).
const ASPECT = 150 / 65;
const DEFAULT_WIDTH = 96;

/**
 * Perfil lateral do veículo por categoria (direção de arte §7.1/§9 item 8) — ilustração
 * procedural gerada pelo Apolo (sem foto, sem marca de montadora real), usada nos cards
 * de categoria do passageiro a partir de 360pt de largura de tela. Abaixo disso o
 * chamador deve usar um ícone genérico — ver `RideCategoryCard` (não cabe com
 * legibilidade, medido em docs/direcao-de-arte.md §6).
 */
export const VehicleIllustration = memo(function VehicleIllustration({
  variant,
  width = DEFAULT_WIDTH,
  style,
  testID,
}: VehicleIllustrationProps) {
  return (
    <Image
      source={SOURCE[variant]}
      style={[{ width, height: Math.round(width / ASPECT) }, style]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      testID={testID}
    />
  );
});
