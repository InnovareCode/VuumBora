import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  AppShell,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  MockBadge,
  NetworkBanner,
  PrimaryButton,
  ScreenHeader,
  SecondaryButton,
  SegmentedControl,
  theme,
} from '@vuumbora/ui';
import { formatMoneyBRL } from '../../src/utils/money';
import { TripHistoryCard } from '../../src/components/history/TripHistoryCard';
import { MOCK_TRIP_HISTORY, type TripHistoryPeriod } from '../../src/data/mockTripHistory';

type TripFilter = 'all' | TripHistoryPeriod;
type LoadStatus = 'loading' | 'error' | 'ready';

const FILTERS: readonly { readonly value: TripFilter; readonly label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'currentMonth', label: 'Mês atual' },
  { value: 'previous', label: 'Anteriores' },
];

/** Carga simulada (sem `TripHistoryPort` real, ficha §10/§11.1): dá tempo real de ver o esqueleto. */
const SIMULATED_LOAD_MS = 500;

/**
 * P11 — Histórico de viagens (lista), `docs/fichas-de-tela/P11-historico.md`, onda 5 do padrão
 * premium. Lacunas corrigidas (ficha §11): filtro em chip que rola → `SegmentedControl` (C-16,
 * já em `packages/ui`, item 1); carregando/erro de carga que não existiam → simulados aqui
 * mesmo sem porta real (item 2); carro amarelo da linha → corrigido em `TripHistoryCard`
 * (D-30, item 3).
 *
 * `?devEstado=carregando|erro` (só `__DEV__`, removido do bundle de produção): captura dos
 * estados que não têm porta real para provocar de verdade — mesmo padrão de `?devAprovado=false`
 * (M05) e `?devSeed=1` (P05/P06).
 *
 * **"Carregando mais" e "Erro ao carregar mais" (ficha §5) ficam n/a**, com motivo: a lista é um
 * array fixo de 5 viagens (`MOCK_TRIP_HISTORY`), sem paginação nenhuma — não existe "mais" para
 * carregar até o `TripHistoryPort` real (`GET /v1/trips?cursor`) existir.
 */
export default function TripHistoryScreen() {
  const { devEstado } = useLocalSearchParams<{ devEstado?: string }>();
  const [filter, setFilter] = useState<TripFilter>('all');
  const [status, setStatus] = useState<LoadStatus>('loading');

  const load = useCallback(() => {
    if (__DEV__ && devEstado === 'erro') {
      setStatus('error');
      return undefined;
    }
    if (__DEV__ && devEstado === 'carregando') {
      setStatus('loading');
      return undefined;
    }
    setStatus('loading');
    const timer = setTimeout(() => setStatus('ready'), SIMULATED_LOAD_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devEstado]);

  useEffect(() => load(), [load]);

  const trips = useMemo(
    () => (filter === 'all' ? MOCK_TRIP_HISTORY : MOCK_TRIP_HISTORY.filter((trip) => trip.period === filter)),
    [filter]
  );

  return (
    <AppShell scroll glow testID="trip-history-screen">
      <View style={styles.content}>
        <ScreenHeader title="Histórico de viagens" onBack={() => router.back()} testID="trip-history-header" />

        <NetworkBanner testID="trip-history-network-banner" />

        <SegmentedControl
          options={FILTERS}
          value={filter}
          onChange={(value) => setFilter(value as TripFilter)}
          accessibilityLabel="Filtrar por período"
          testID="trip-history-filter"
        />
        <MockBadge label="histórico de exemplo" testID="trip-history-mock-badge" />

        {status === 'loading' ? (
          <View style={styles.list} testID="trip-history-loading">
            <LoadingSkeleton variant="block" height={64} lines={5} />
          </View>
        ) : status === 'error' ? (
          <ErrorState
            title="Não foi possível carregar suas viagens."
            onRetry={load}
            retryLabel="Tentar de novo"
            testID="trip-history-error"
          />
        ) : trips.length === 0 ? (
          <EmptyStateForFilter filter={filter} onChangeFilter={setFilter} />
        ) : (
          <View style={styles.list} testID="trip-history-list">
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

interface EmptyStateForFilterProps {
  readonly filter: TripFilter;
  readonly onChangeFilter: (filter: TripFilter) => void;
}

function EmptyStateForFilter({ filter, onChangeFilter }: EmptyStateForFilterProps) {
  if (filter === 'all') {
    return (
      <EmptyState
        title="Nenhuma viagem ainda"
        description="Suas corridas aparecem aqui depois da primeira viagem."
        action={<PrimaryButton label="Pedir uma corrida" onPress={() => router.push('/')} testID="trip-history-empty-cta" />}
        testID="trip-history-empty"
      />
    );
  }
  return (
    <EmptyState
      title={filter === 'currentMonth' ? 'Nenhuma viagem neste mês' : 'Nenhuma viagem anterior'}
      action={<SecondaryButton label="Ver todas" onPress={() => onChangeFilter('all')} testID="trip-history-empty-filter-cta" />}
      testID="trip-history-empty-filter"
    />
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  list: { gap: theme.spacing['3'] },
});
