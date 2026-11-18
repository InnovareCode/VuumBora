import { memo, type ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import type { StyleProp, ViewStyle } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { gradientColors, gradientLocations } from './gradient';

const RAISED_COLORS = gradientColors(theme.gradient.surfaceRaised);
const RAISED_LOCATIONS = gradientLocations(theme.gradient.surfaceRaised);

export interface SurfaceRaisedProps {
  readonly children?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
  readonly testID?: string | undefined;
}

/**
 * Fundo gradiente sutil de card/atalho/linha de lista (direção de arte §4/§9 item 6,
 * token `gradient.surface.raised`). Quem dá volume ao card é a borda iluminada de
 * cima (`theme.role.edgeTop`/`edgeBottom`, item 2) — este gradiente é quase
 * imperceptível sozinho, de propósito (medição completa em docs/direcao-de-arte.md §0/§4).
 * `style` recebe borderRadius/borderWidth/padding do card chamador.
 */
export const SurfaceRaised = memo(function SurfaceRaised({ children, style, accessibilityLabel, testID }: SurfaceRaisedProps) {
  return (
    <LinearGradient colors={RAISED_COLORS} locations={RAISED_LOCATIONS} style={style} accessibilityLabel={accessibilityLabel} testID={testID}>
      {children}
    </LinearGradient>
  );
});
