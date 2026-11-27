import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme, gradientColors, gradientLocations } from '@vuumbora/ui';

const FILL_COLORS = gradientColors(theme.gradient.cta);
const FILL_LOCATIONS = gradientLocations(theme.gradient.cta);

export interface TripProgressBarProps {
  readonly percent: number;
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

/**
 * Sinal de progresso até o destino (P09, ficha §2/§3) — até existir o mapa de verdade
 * (C-12), é o único indício visual de "quanto falta" além do texto. Percentual é SIMULADO
 * (ver `MockBadge` na tela que usa este componente).
 *
 * Reduzido pela ficha (E3/E5): a barra deixou de ser um "bloco" com destino/ETA escritos
 * dentro dela (8pt de altura, competindo com o N2 da tela) — agora é um TRAÇO de sinal, 6pt,
 * sem texto (a hora de chegada e os minutos já são o N2, em destaque, acima deste componente).
 */
export const TripProgressBar = memo(function TripProgressBar({ percent, accessibilityLabel, testID }: TripProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const roundedPercent = Math.round(clamped);
  return (
    <View
      style={styles.track}
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: roundedPercent }}
      accessibilityLabel={accessibilityLabel}
    >
      <LinearGradient colors={FILL_COLORS} locations={FILL_LOCATIONS} style={[styles.fill, { width: `${clamped}%` }]} />
    </View>
  );
});

const BAR_HEIGHT = 6;

const styles = StyleSheet.create({
  track: { height: BAR_HEIGHT, borderRadius: theme.radius.pill, backgroundColor: theme.role.surfaceElevated, overflow: 'hidden' },
  fill: { height: BAR_HEIGHT, borderRadius: theme.radius.pill },
});
