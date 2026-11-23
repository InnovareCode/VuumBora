import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { MapPin, TriangleAlert } from 'lucide-react-native';
import { AppShell, ErrorState, ListRow, MoneyText, ScreenHeader, StatusBadge, SurfaceRaised, theme, textStyle, tabularNums } from '@vuumbora/ui';
import {
  findMockTrip,
  formatTripDateLabel,
  formatTripDistanceKm,
  formatTripTimeRange,
  tripCategoryLabel,
  tripPublicCode,
} from '../../src/components/history/tripHistoryMock';

const STATUS_LABEL = { completed: 'Concluída', cancelled: 'Cancelada' } as const;

/**
 * M12 — Detalhe de uma corrida do histórico. `id` vem da lista (`historico.tsx`); abrir a rota
 * direto com um `id` que não existe no mock (ou depois que a lista real existir e a corrida for
 * de OUTRO motorista — A3) cai no mesmo `ErrorState` de "não encontrada", nunca numa tela em
 * branco.
 */
export default function DriverTripHistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const entry = findMockTrip(id);

  if (!entry) {
    return (
      <AppShell scroll testID="historico-detalhe-screen">
        <View style={styles.content}>
          <ScreenHeader title="Corrida" onBack={() => router.back()} testID="historico-detalhe-header" />
          <ErrorState title="Corrida não encontrada" description="Volte para o histórico e escolha uma corrida da lista." testID="historico-detalhe-nao-encontrada" />
        </View>
      </AppShell>
    );
  }

  const dateLabel = formatTripDateLabel(entry.endedAt);
  const routeLabel = `${entry.pickup.neighborhood} → ${entry.destination.neighborhood}`;

  return (
    <AppShell scroll testID="historico-detalhe-screen">
      <View style={styles.content}>
        <ScreenHeader title={`Corrida de ${dateLabel}`} onBack={() => router.back()} testID="historico-detalhe-header" />

        <SurfaceRaised style={styles.card} testID="historico-detalhe-ganho-card">
          <Text style={styles.cardLabel}>Ganho da corrida</Text>
          {entry.payout ? (
            <MoneyText value={entry.payout.amountCents / 100} size="heading" weight="bold" testID="historico-detalhe-valor" />
          ) : (
            <Text style={styles.semGanho}>—</Text>
          )}
          <StatusBadge
            variant={entry.status === 'completed' ? 'success' : 'danger'}
            label={STATUS_LABEL[entry.status === 'cancelled' ? 'cancelled' : 'completed']}
            testID="historico-detalhe-status"
          />
        </SurfaceRaised>

        <SurfaceRaised style={styles.card} testID="historico-detalhe-trajeto-card">
          <View style={styles.pointRow}>
            <View style={[styles.pointDot, { backgroundColor: theme.color.map.pickup }]} />
            <Text style={styles.pointLabel} numberOfLines={1}>
              {entry.pickup.neighborhood}
            </Text>
          </View>
          <View style={styles.pointRow}>
            <MapPin size={16} color={theme.color.map.destination} strokeWidth={2} />
            <Text style={styles.pointLabel} numberOfLines={1}>
              {entry.destination.neighborhood}
            </Text>
          </View>
          <View style={styles.divider} />
          <Text style={styles.metaLine} numberOfLines={1}>
            {formatTripTimeRange(entry)} · {formatTripDistanceKm(entry.distanceM)}
          </Text>
          <Text style={styles.metaCategory} numberOfLines={1}>
            {tripCategoryLabel(entry.categoryId)}
          </Text>
        </SurfaceRaised>

        <ListRow
          icon={<TriangleAlert size={20} color={theme.role.warning} strokeWidth={1.75} />}
          label="Relatar um problema"
          onPress={() =>
            router.push({
              pathname: '/suporte',
              params: { tripCode: tripPublicCode(entry.tripId), tripRoute: routeLabel, tripDate: dateLabel },
            })
          }
          accessibilityLabel="Relatar um problema com esta corrida"
          testID="historico-detalhe-relatar-problema"
        />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  card: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
    gap: theme.spacing['2'],
    alignItems: 'center',
  },
  cardLabel: { color: theme.role.textSecondary, ...textStyle('medium', 'caption') },
  semGanho: { color: theme.role.textMuted, ...textStyle('bold', 'heading'), ...tabularNums },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['2'], width: '100%', alignSelf: 'flex-start' },
  pointDot: { width: 10, height: 10, borderRadius: 5, marginHorizontal: 3 },
  pointLabel: { flex: 1, color: theme.role.textPrimary, ...textStyle('semibold', 'body') },
  divider: { height: 1, width: '100%', backgroundColor: theme.role.edgeBottom, marginVertical: theme.spacing['1'] },
  metaLine: { alignSelf: 'flex-start', color: theme.role.textSecondary, ...textStyle('regular', 'small'), ...tabularNums },
  metaCategory: { alignSelf: 'flex-start', color: theme.role.textPrimary, ...textStyle('semibold', 'small') },
});
