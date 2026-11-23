import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Car, Circle, Clock, CreditCard, HelpCircle, MapPin } from 'lucide-react-native';
import {
  AppShell,
  ErrorState,
  ListRow,
  MockBadge,
  MoneyText,
  ScreenHeader,
  StatusBadge,
  SurfaceRaised,
  theme,
  tokens,
  type StatusBadgeVariant,
} from '@vuumbora/ui';
import { TripDetailRow } from '../../src/components/history/TripDetailRow';
import { findMockTripHistoryEntry, type TripHistoryStatus } from '../../src/data/mockTripHistory';

const STATUS: Record<TripHistoryStatus, { readonly label: string; readonly variant: StatusBadgeVariant }> = {
  completed: { label: 'Concluída', variant: 'success' },
  cancelled: { label: 'Cancelada', variant: 'danger' },
};

/**
 * Comprovante de uma viagem do histórico (P11), `docs/fichas-de-tela/P11-historico.md` §2.2.
 * Lacunas corrigidas aqui (ficha §11): cartões em `role.surface` chapado → `SurfaceRaised`
 * (item 5); origem amarela/destino laranja → `map.pickup` (verde)/`map.destination` (vermelho)
 * (item 6); dois selos na mesma linha do título/seção → UM selo, embaixo do cartão de valor
 * (item 7); linhas de tarifa fabricadas (incluindo "Taxa de serviço") → removidas (item 8,
 * **D-38**: "só total e forma de pagamento até a decisão 7 dizer o que cada lado vê" — pedido
 * explícito desta missão). "Ajuda com esta corrida" agora navega de verdade para a P14 (`/ajuda`),
 * levando o destino e a data da corrida para o cartão "Corrida em questão" (sem código público
 * real: o contrato ainda não tem um, ficha P14 §10).
 */
export default function TripHistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const trip = findMockTripHistoryEntry(id);

  if (!trip) {
    return (
      <AppShell scroll glow testID="trip-detail-screen">
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
    <AppShell scroll glow testID="trip-detail-screen">
      <View style={styles.content}>
        <ScreenHeader title="Comprovante" subtitle={trip.dateLabel} onBack={() => router.back()} testID="trip-detail-header" />

        <SurfaceRaised style={styles.valueCard} testID="trip-detail-value-card">
          <MoneyText value={trip.receipt.total.amountCents / 100} label="Valor total" size="heading" testID="trip-detail-total" />
          <StatusBadge variant={statusInfo.variant} label={statusInfo.label} />
        </SurfaceRaised>

        <SurfaceRaised style={styles.card}>
          <TripDetailRow
            icon={<Circle size={14} color={tokens.color.map.pickup} fill={tokens.color.map.pickup} />}
            label="Origem"
            value={trip.originAddress}
            testID="trip-detail-origin"
          />
          <View style={styles.divider} />
          <TripDetailRow
            icon={<MapPin size={16} color={tokens.color.map.destination} fill={tokens.color.map.destination} strokeWidth={1.5} />}
            label="Destino"
            value={trip.destinationAddress}
            testID="trip-detail-destination"
          />
        </SurfaceRaised>

        <SurfaceRaised style={styles.card}>
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
        </SurfaceRaised>

        <View style={styles.mockRow}>
          <MockBadge label="comprovante de exemplo" testID="trip-detail-mock-badge" />
        </View>

        <ListRow
          icon={<HelpCircle size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
          label="Ajuda com esta corrida"
          onPress={() =>
            router.push({ pathname: '/ajuda', params: { tripDestino: trip.destinationLabel, tripData: trip.dateLabel } })
          }
          testID="trip-detail-help-row"
        />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  valueCard: {
    alignItems: 'center',
    gap: theme.spacing['2'],
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['5'],
  },
  card: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
    gap: theme.spacing['3'],
  },
  divider: { height: 1, backgroundColor: theme.role.border },
  mockRow: { alignItems: 'center' },
});
