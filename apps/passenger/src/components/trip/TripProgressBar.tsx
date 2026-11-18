import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme, textStyle, tabularNums } from '@vuumbora/ui';
import { formatEtaMinutes } from '../../utils/time';

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
        <View style={[styles.fill, { width: `${clamped}%` }]} />
      </View>
      <Text style={styles.destination} numberOfLines={2}>
        Para {destinationLabel}
      </Text>
      <View style={styles.etaRow}>
        <Text style={styles.etaLabel}>Chegada estimada</Text>
        <Text style={styles.eta}>{etaMinutes !== undefined ? formatEtaMinutes(etaMinutes) : '—'}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: theme.spacing['2'] },
  track: { height: 8, borderRadius: theme.radius.pill, backgroundColor: theme.role.surfaceElevated, overflow: 'hidden' },
  fill: { height: 8, borderRadius: theme.radius.pill, backgroundColor: theme.role.ctaBackground },
  destination: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  etaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing['2'] },
  etaLabel: { color: theme.role.textMuted, ...textStyle('regular', 'caption') },
  eta: { color: theme.role.textPrimary, ...textStyle('bold', 'body'), ...tabularNums },
});
