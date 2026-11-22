import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AppShell, EmptyState, ScreenHeader, theme } from '@vuumbora/ui';
import { formatMoneyBRL } from '../../src/utils/money';
import { TripFilterChip } from '../../src/components/history/TripFilterChip';
import { TripHistoryCard } from '../../src/components/history/TripHistoryCard';
import { MOCK_TRIP_HISTORY, type TripHistoryPeriod } from '../../src/data/mockTripHistory';

type TripFilter = 'all' | TripHistoryPeriod;

const FILTERS: readonly { readonly key: TripFilter; readonly label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'currentMonth', label: 'Mês atual' },
  { key: 'previous', label: 'Anteriores' },
];

const EMPTY_COPY: Record<TripFilter, { readonly title: string; readonly description: string }> = {
  all: {
    title: 'Nenhuma viagem ainda',
    description: 'Suas corridas vão aparecer aqui assim que você fizer a primeira viagem.',
  },
  currentMonth: {
    title: 'Nenhuma viagem neste mês',
    description: 'As corridas feitas no mês atual aparecem aqui.',
  },
  previous: {
    title: 'Nenhuma viagem anterior',
    description: 'Corridas de meses passados aparecem aqui.',
  },
};

/**
 * P11 — Histórico de viagens (VuumBora_Claude_Design_System/referencias/premium/
 * passageiro/P11-historico.webp). Sem `TripHistoryPort` real — toda a lista vem de
 * `mockTripHistory.ts` (pendência para Vega/Cronos). Toque abre o comprovante em
 * `/historico-detalhe`.
 */
export default function TripHistoryScreen() {
  const [filter, setFilter] = useState<TripFilter>('all');

  const trips = useMemo(
    () => (filter === 'all' ? MOCK_TRIP_HISTORY : MOCK_TRIP_HISTORY.filter((trip) => trip.period === filter)),
    [filter]
  );

  const emptyCopy = EMPTY_COPY[filter];

  return (
    <AppShell scroll glow>
      <View style={styles.content}>
        {/* Título curto ("Minhas viagens", não "Histórico de viagens"): medido
            (Playwright, 320px) que a versão longa da referência não cabe numa linha só
            no título do ScreenHeader (numberOfLines={1} fixo no componente) — mesma
            causa raiz já documentada em concluida.tsx ("Concluída" em vez de "Corrida
            concluída"). */}
        <ScreenHeader title="Minhas viagens" onBack={() => router.back()} testID="trip-history-header" />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          testID="trip-history-filters"
        >
          {FILTERS.map((item) => (
            <TripFilterChip
              key={item.key}
              label={item.label}
              selected={filter === item.key}
              onPress={() => setFilter(item.key)}
              testID={`trip-history-filter-${item.key}`}
            />
          ))}
        </ScrollView>

        {trips.length === 0 ? (
          <EmptyState title={emptyCopy.title} description={emptyCopy.description} testID="trip-history-empty" />
        ) : (
          <View style={styles.list}>
            {trips.map((trip) => (
              <TripHistoryCard
                key={trip.id}
                destinationLabel={trip.destinationLabel}
                dateLabel={trip.dateLabel}
                amountLabel={formatMoneyBRL(trip.receipt.total)}
                status={trip.status}
                onPress={() => router.push({ pathname: '/historico-detalhe', params: { id: trip.id } })}
                testID={`trip-history-card-${trip.id}`}
              />
            ))}
          </View>
        )}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  filterRow: { flexDirection: 'row', gap: theme.spacing['2'], paddingVertical: 2 },
  list: { gap: theme.spacing['3'] },
});
