import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MockBadge, theme, textStyle, tabularNums } from '@vuumbora/ui';
import { DriverInfoCard } from '../assignedDriver/DriverInfoCard';
import { TripProgressBar } from '../trip/TripProgressBar';
import { EmergencyCallRow } from './EmergencyCallRow';
import type { AssignedDriverInfo } from '../../data/mockDriverAssignment';
import { formatClockTime, formatEtaMinutes } from '../../utils/time';

export interface InProgressPanelProps {
  readonly driver: AssignedDriverInfo;
  readonly destinationAddress?: string | undefined;
  readonly tripProgressPercent: number;
  readonly tripEtaMinutes?: number | undefined;
  readonly testID?: string;
}

/**
 * Painel da P09 (ficha §2/§3/§4) — corrida em andamento. Sem "Cancelar corrida" (D-33: o
 * domínio só permite cancelar até `driver_arrived`, `isRideCancellable` em `corrida.tsx`).
 * "Ligar 190" (PP-11, decidida em 22/11/2026) entra no pé do painel — "Compartilhar viagem"
 * continua fora até existir `POST /v1/trips/:id/share` (S4).
 */
export const InProgressPanel = memo(function InProgressPanel({
  driver,
  destinationAddress,
  tripProgressPercent,
  tripEtaMinutes,
  testID,
}: InProgressPanelProps) {
  const chegando = tripEtaMinutes !== undefined && tripEtaMinutes <= 0;
  const arrivalClock = useMemo(() => {
    if (tripEtaMinutes === undefined || chegando) return undefined;
    return formatClockTime(new Date(Date.now() + tripEtaMinutes * 60_000));
  }, [tripEtaMinutes, chegando]);

  return (
    <View style={styles.content} testID={testID}>
      <Text style={styles.caption}>Chegada ao destino</Text>
      <Text style={styles.headline} accessibilityRole="header">
        {chegando ? 'Chegando ao destino' : arrivalClock ? `${arrivalClock} · ${formatEtaMinutes(tripEtaMinutes ?? 0)}` : '—'}
      </Text>
      <Text style={styles.destination} numberOfLines={2}>
        {destinationAddress ?? 'destino'}
      </Text>

      <DriverInfoCard driver={driver} variant="compact" testID="assigned-driver-compact-card" />

      <TripProgressBar
        percent={tripProgressPercent}
        accessibilityLabel={`Progresso da viagem até ${destinationAddress ?? 'o destino'}, ${Math.round(tripProgressPercent)}%`}
        testID="trip-progress-bar"
      />

      <MockBadge label="trajeto e posição simulados" testID="in-progress-mock-badge" />

      <EmergencyCallRow testID="in-progress-emergency-row" />
    </View>
  );
});

const styles = StyleSheet.create({
  content: { gap: theme.spacing['3'] },
  caption: { color: theme.role.textSecondary, ...textStyle('medium', 'caption') },
  headline: { color: theme.role.textPrimary, ...textStyle('bold', 'heading'), ...tabularNums },
  destination: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
});
