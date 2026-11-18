import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme, textStyle, tabularNums, gradientColors, gradientLocations } from '@vuumbora/ui';
import { formatEtaMinutes } from '../../utils/time';

const FILL_COLORS = gradientColors(theme.gradient.cta);
const FILL_LOCATIONS = gradientLocations(theme.gradient.cta);

export interface TripProgressBarProps {
  readonly percent: number;
  readonly etaMinutes?: number;
  readonly destinationLabel: string;
  readonly testID?: string;
}

/**
 * Barra de progresso até o destino (P09) — percentual e ETA são SIMULADOS (ver
 * `MockBadge` na tela que usa este componente). Destino e ETA ficam em linhas
 * SEPARADAS (não lado a lado): medido (Playwright, 320–390px) que o endereço
 * completo truncava quando disputava a mesma linha com o rótulo de ETA.
 */
export const TripProgressBar = memo(function TripProgressBar({ percent, etaMinutes, destinationLabel, testID }: TripProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const roundedPercent = Math.round(clamped);
  return (
    <View
      style={styles.root}
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: roundedPercent }}
      accessibilityLabel={`Progresso da viagem até ${destinationLabel}, ${roundedPercent}%${etaMinutes !== undefined ? `, chegada estimada em ${formatEtaMinutes(etaMinutes)}` : ''}`}
    >
      <View style={styles.track}>
        <LinearGradient colors={FILL_COLORS} locations={FILL_LOCATIONS} style={[styles.fill, { width: `${clamped}%` }]} />
      </View>
      <Text style={styles.destination} numberOfLines={2}>
        Para {destinationLabel}
      </Text>
      {/* Auditoria Apolo (E5): ETA em 28 Bold tabular é a informação que o passageiro
          mais procura nesta fase — antes disputava peso visual com o endereço (14/16). */}
      <View style={styles.etaBlock}>
        <Text style={styles.etaLabel}>Chegada estimada</Text>
        <Text style={styles.eta}>{etaMinutes !== undefined ? formatEtaMinutes(etaMinutes) : '—'}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: theme.spacing['2'] },
  track: { height: 8, borderRadius: theme.radius.pill, backgroundColor: theme.role.surfaceElevated, overflow: 'hidden' },
  // Barra ganha o mesmo gradiente do CTA (direção de arte §9 item 17), em vez do
  // amarelo chapado — reforça que é a mesma marca do botão primário.
  fill: { height: 8, borderRadius: theme.radius.pill },
  destination: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  etaBlock: { gap: 2 },
  etaLabel: { color: theme.role.textMuted, ...textStyle('regular', 'caption') },
  eta: { color: theme.role.textPrimary, ...textStyle('bold', 'heading'), ...tabularNums },
});
