import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Car, ChevronRight } from 'lucide-react-native';
import { StatusBadge, SurfaceRaised, theme, textStyle, tabularNums, type StatusBadgeVariant } from '@vuumbora/ui';
import type { TripHistoryStatus } from '../../data/mockTripHistory';

export interface TripHistoryCardProps {
  readonly destinationLabel: string;
  readonly dateLabel: string;
  readonly amountLabel: string;
  readonly status: TripHistoryStatus;
  readonly onPress: () => void;
  readonly testID?: string;
}

const STATUS: Record<TripHistoryStatus, { readonly label: string; readonly variant: StatusBadgeVariant }> = {
  completed: { label: 'Concluída', variant: 'success' },
  cancelled: { label: 'Cancelada', variant: 'danger' },
};

/**
 * Linha de viagem do histórico (P11). O selo de situação fica em LINHA PRÓPRIA, abaixo
 * de data/valor — não ao lado como irmão de largura fixa: mesma causa raiz evitada em
 * bug_flex_fixo_espreme_texto_flex1_vizinho (memória da Lyra), aqui a soma
 * data+valor+selo não cabia numa linha só a 320pt sem espremer o destino.
 */
export const TripHistoryCard = memo(function TripHistoryCard({
  destinationLabel,
  dateLabel,
  amountLabel,
  status,
  onPress,
  testID,
}: TripHistoryCardProps) {
  const statusInfo = STATUS[status];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Viagem para ${destinationLabel}, ${dateLabel}, ${amountLabel}, ${statusInfo.label}`}
      testID={testID}
    >
      {({ pressed }) => (
        <SurfaceRaised style={[styles.card, pressed && styles.cardPressed]}>
          <View style={styles.row}>
            <View style={styles.iconCircle}>
              <Car size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />
            </View>
            <View style={styles.content}>
              <View style={styles.titleRow}>
                <Text style={styles.destination} numberOfLines={1}>
                  {destinationLabel}
                </Text>
                <ChevronRight size={18} color={theme.role.textMuted} strokeWidth={2} />
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.date} numberOfLines={1}>
                  {dateLabel}
                </Text>
                <Text style={styles.amount} numberOfLines={1}>
                  {amountLabel}
                </Text>
              </View>
              <View style={styles.statusRow}>
                <StatusBadge variant={statusInfo.variant} label={statusInfo.label} />
              </View>
            </View>
          </View>
        </SurfaceRaised>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
  },
  cardPressed: { opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing['3'] },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.role.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1, gap: theme.spacing['1'] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['2'] },
  destination: { flex: 1, color: theme.role.textPrimary, ...textStyle('semibold', 'body') },
  detailRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: theme.spacing['2'] },
  date: { flex: 1, color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  amount: { color: theme.role.textPrimary, ...textStyle('bold', 'body'), ...tabularNums },
  statusRow: { marginTop: 2, alignItems: 'flex-start' },
});
