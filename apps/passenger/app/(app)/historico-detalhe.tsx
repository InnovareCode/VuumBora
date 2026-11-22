import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Car, Circle, Clock, CreditCard, MapPin } from 'lucide-react-native';
import { AppShell, ErrorState, MockBadge, ScreenHeader, StatusBadge, theme, textStyle, type StatusBadgeVariant } from '@vuumbora/ui';
import { formatMoneyBRL } from '../../src/utils/money';
import { TripDetailRow } from '../../src/components/history/TripDetailRow';
import { ReceiptBreakdownRow } from '../../src/components/trip/ReceiptBreakdownRow';
import { findMockTripHistoryEntry, type TripHistoryStatus } from '../../src/data/mockTripHistory';

const STATUS: Record<TripHistoryStatus, { readonly label: string; readonly variant: StatusBadgeVariant }> = {
  completed: { label: 'Concluída', variant: 'success' },
  cancelled: { label: 'Cancelada', variant: 'danger' },
};

/**
 * Detalhe/comprovante de uma viagem do histórico (P11) — aberto a partir de
 * `/historico`, lido por `id` (mesmo padrão de `useLocalSearchParams` do `simulated`
 * em `index.tsx`, não rota dinâmica de arquivo). Sem `TripHistoryPort` real: tudo aqui
 * é FABRICADO (`mockTripHistory.ts`), sinalizado com `MockBadge`.
 */
export default function TripHistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const trip = findMockTripHistoryEntry(id);

  if (!trip) {
    return (
      <AppShell scroll glow>
        <View style={styles.content}>
          <ScreenHeader title="Comprovante" onBack={() => router.back()} testID="trip-detail-header" />
          <ErrorState
            title="Viagem não encontrada"
            description="Essa viagem não existe mais no histórico."
            onRetry={() => router.back()}
            retryLabel="Voltar ao histórico"
            testID="trip-detail-not-found"
          />
        </View>
      </AppShell>
    );
  }

  const statusInfo = STATUS[trip.status];

  return (
    <AppShell scroll glow>
      <View style={styles.content}>
        <ScreenHeader title="Comprovante" subtitle={trip.destinationLabel} onBack={() => router.back()} testID="trip-detail-header" />

        <View style={styles.statusRow}>
          <StatusBadge variant={statusInfo.variant} label={statusInfo.label} />
          <MockBadge label="comprovante fabricado" />
        </View>

        <View style={styles.card}>
          <TripDetailRow
            icon={<Circle size={14} color={theme.role.ctaBackground} fill={theme.role.ctaBackground} />}
            label="Origem"
            value={trip.originAddress}
            testID="trip-detail-origin"
          />
          <View style={styles.divider} />
          <TripDetailRow
            icon={<MapPin size={16} color={theme.role.warning} strokeWidth={2} fill={theme.role.warning} />}
            label="Destino"
            value={trip.destinationAddress}
            testID="trip-detail-destination"
          />
        </View>

        <View style={styles.card}>
          <TripDetailRow
            icon={<Car size={18} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Motorista e veículo"
            value={`${trip.driverName} • ${trip.vehicleLabel}`}
            testID="trip-detail-driver"
          />
          <View style={styles.divider} />
          <TripDetailRow
            icon={<CreditCard size={18} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Forma de pagamento"
            value={trip.paymentMethodLabel}
            testID="trip-detail-payment"
          />
          <View style={styles.divider} />
          <TripDetailRow
            icon={<Clock size={18} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Distância e duração"
            value={`${trip.distanceLabel} • ${trip.durationLabel}`}
            testID="trip-detail-duration"
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Valores</Text>
            <MockBadge label="valores fabricados" />
          </View>
          <View style={styles.receiptCard} testID="trip-detail-receipt">
            {trip.receipt.lines.map((line) => (
              <ReceiptBreakdownRow key={line.label} label={line.label} value={formatMoneyBRL(line.amount)} />
            ))}
            <View style={styles.divider} />
            <ReceiptBreakdownRow label="Total" value={formatMoneyBRL(trip.receipt.total)} emphasis testID="trip-detail-total" />
          </View>
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['2'] },
  card: {
    backgroundColor: theme.role.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
    gap: theme.spacing['3'],
  },
  divider: { height: 1, backgroundColor: theme.role.border },
  section: { gap: theme.spacing['2'] },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing['2'] },
  sectionTitle: { color: theme.role.textPrimary, ...textStyle('bold', 'body') },
  receiptCard: {
    backgroundColor: theme.role.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.role.border,
    padding: theme.spacing['4'],
    gap: theme.spacing['2'],
  },
});
