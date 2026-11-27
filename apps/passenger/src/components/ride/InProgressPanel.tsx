import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MockBadge, theme, textStyle, tabularNums } from '@vuumbora/ui';
import { DriverInfoCard } from '../assignedDriver/DriverInfoCard';
import { TripProgressBar } from '../trip/TripProgressBar';
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
 * "Ligar 190" (PP-11, decidida em 22/11/2026) NÃO mora aqui: `corrida.tsx` o põe no rodapé fixo
 * (`FooterActions`), como na P08 — no painel que rola, a faixa "Sem conexão" o empurrava para
 * baixo da dobra a 320 (Íris, portão da onda 4). "Compartilhar viagem" continua fora até existir
 * `POST /v1/trips/:id/share` (S4).
 *
 * N2 é "{hh:mm} · em {n} min" (ficha §2: "a hora de chegada ANTES dos minutos" — na viagem a
 * pessoa planeja pela hora, só depois confere o andamento pelos minutos). A revisão da Íris
 * (onda 4, 048b4dd) apontou que uma versão anterior só mostrava os minutos, contra a ficha.
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
        {chegando ? 'Chegando ao destino' : arrivalClock && tripEtaMinutes !== undefined ? `${arrivalClock} · em ${formatEtaMinutes(tripEtaMinutes)}` : '—'}
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
    </View>
  );
});

const styles = StyleSheet.create({
  content: { gap: theme.spacing['3'] },
  caption: { color: theme.role.textSecondary, ...textStyle('medium', 'caption') },
  headline: { color: theme.role.textPrimary, ...textStyle('bold', 'heading'), ...tabularNums },
  destination: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
});
