import { useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Car } from 'lucide-react-native';
import {
  AppShell,
  BottomTabBar,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  MockBadge,
  NetworkBanner,
  ScreenHeader,
  SecondaryButton,
  SectionHeader,
  SegmentedControl,
  formatBRL,
  theme,
} from '@vuumbora/ui';
import { buildDriverTabs } from '../../src/navigation/driverTabs';
import { DriverTripRow } from '../../src/components/history/DriverTripRow';
import {
  filterTripsByPeriod,
  formatTripRoute,
  formatTripTime,
  groupTripsByDay,
  MOCK_DRIVER_TRIP_HISTORY,
  type TripHistoryPeriod,
} from '../../src/components/history/tripHistoryMock';

const COMPACT_WIDTH_BREAKPOINT = 375;

const PERIOD_OPTIONS: readonly { readonly value: TripHistoryPeriod; readonly label: string; readonly compactLabel: string }[] = [
  { value: 'hoje', label: 'Hoje', compactLabel: 'Hoje' },
  { value: 'semana', label: 'Semana', compactLabel: '7 dias' },
  { value: 'mes', label: 'Mês', compactLabel: 'Mês' },
  { value: 'todos', label: 'Todos', compactLabel: 'Tudo' },
];

const EMPTY_PERIOD_LABEL: Record<TripHistoryPeriod, string> = {
  hoje: 'Nenhuma corrida hoje',
  semana: 'Nenhuma corrida nesta semana',
  mes: 'Nenhuma corrida neste mês',
  todos: 'Nenhuma corrida ainda',
};

/**
 * Só de PROVA/QA (`__DEV__`, removido do bundle de produção pelo Metro — mesmo padrão de
 * `?devAprovado=false` da M05): força um dos estados da ficha §5 sem precisar de rede nem de
 * esperar a lista real existir. Nunca alcançável em produção.
 */
type DevState = 'carregando' | 'vazio' | 'vazio-periodo' | 'sem-aprovacao' | 'erro';

function isDevState(value: string | undefined): value is DevState {
  return value === 'carregando' || value === 'vazio' || value === 'vazio-periodo' || value === 'sem-aprovacao' || value === 'erro';
}

/**
 * M12 — Histórico de corridas (motorista), onda 5 do padrão premium, sobre
 * `docs/fichas-de-tela/M12-historico-de-corridas.md`. Sem `DriverTripHistoryPort` real (o
 * contrato existe em `@vuumbora/api-client/driver` desde a PP-12, mas nenhum app faz rede de
 * verdade ainda) — a lista vem de `tripHistoryMock.ts`, TIPADA com o contrato real
 * (`DriverTripHistoryEntry`), pendência de ligação para a Vega.
 *
 * Barra de abas: `buildDriverTabs` (ver `src/navigation/driverTabs.tsx`) — real navegação,
 * `router.replace`, mesma lista de itens que `index.tsx`/`perfil.tsx`.
 */
export default function DriverTripHistoryScreen() {
  const { width } = useWindowDimensions();
  const compact = width < COMPACT_WIDTH_BREAKPOINT;
  const { devEstado } = useLocalSearchParams<{ devEstado?: string }>();
  const forcedState = __DEV__ && isDevState(devEstado) ? devEstado : undefined;

  const [period, setPeriod] = useState<TripHistoryPeriod>('todos');
  const [erroSimulado, setErroSimulado] = useState(forcedState === 'erro');

  const approved = forcedState !== 'sem-aprovacao';
  const loading = forcedState === 'carregando';
  const erro = forcedState === 'erro' ? erroSimulado : false;

  const allTrips = forcedState === 'vazio' || forcedState === 'sem-aprovacao' ? [] : MOCK_DRIVER_TRIP_HISTORY;
  const filtered = useMemo(
    () => (forcedState === 'vazio-periodo' ? [] : filterTripsByPeriod(allTrips, period)),
    [allTrips, period, forcedState]
  );
  const groups = useMemo(() => groupTripsByDay(filtered), [filtered]);

  const tabs = buildDriverTabs('historico');

  return (
    <AppShell scroll glow footer={<BottomTabBar items={tabs} activeKey="historico" testID="driver-tab-bar" />} testID="historico-screen">
      <View style={styles.content}>
        <NetworkBanner testID="historico-network-banner" />
        <ScreenHeader title="Histórico de corridas" testID="historico-header" />

        <SegmentedControl
          options={PERIOD_OPTIONS.map((option) => ({ value: option.value, label: compact ? option.compactLabel : option.label }))}
          value={period}
          onChange={(value) => setPeriod(value as TripHistoryPeriod)}
          accessibilityLabel="Filtrar histórico por período"
          testID="historico-period-filter"
        />

        {loading ? (
          <View style={styles.loading} testID="historico-loading">
            <LoadingSkeleton variant="line" width={120} />
            <LoadingSkeleton variant="block" height={64} />
            <LoadingSkeleton variant="block" height={64} />
            <LoadingSkeleton variant="block" height={64} />
          </View>
        ) : erro ? (
          <ErrorState
            title="Não foi possível carregar suas corridas."
            onRetry={() => setErroSimulado(false)}
            retryLabel="Tentar de novo"
            testID="historico-error"
          />
        ) : !approved ? (
          <EmptyState
            icon={({ size, color }) => <Car size={size} color={color} strokeWidth={1.75} />}
            title="Nenhuma corrida ainda"
            description="O cadastro de motorista é outra etapa e só abre depois que as regras de taxa e repasse forem publicadas."
            testID="historico-sem-aprovacao"
          />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={({ size, color }) => <Car size={size} color={color} strokeWidth={1.75} />}
            title={EMPTY_PERIOD_LABEL[period]}
            description={period === 'todos' ? 'Suas corridas aparecem aqui depois da primeira.' : 'Veja todas as suas corridas.'}
            {...(period !== 'todos'
              ? { action: <SecondaryButton label="Ver todas" onPress={() => setPeriod('todos')} testID="historico-ver-todas" /> }
              : {})}
            testID="historico-vazio"
          />
        ) : (
          <View style={styles.groups}>
            {groups.map((group) => (
              <View key={group.key} style={styles.group}>
                <SectionHeader title={`${group.label} · ${group.entries.length} corrida${group.entries.length > 1 ? 's' : ''}`} />
                <View style={styles.rows}>
                  {group.entries.map((entry) => (
                    <DriverTripRow
                      key={entry.tripId}
                      timeLabel={formatTripTime(entry.endedAt)}
                      routeLabel={formatTripRoute(entry)}
                      amountLabel={entry.payout ? formatBRL(entry.payout.amountCents / 100) : '—'}
                      onPress={() => router.push({ pathname: '/historico-detalhe', params: { id: entry.tripId } })}
                      accessibilityLabel={`${formatTripTime(entry.endedAt)}, de ${formatTripRoute(entry)}, ${
                        entry.payout ? formatBRL(entry.payout.amountCents / 100) : 'sem ganho'
                      }. Abre os detalhes`}
                      testID={`historico-row-${entry.tripId}`}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {approved && !loading && !erro ? <MockBadge label="corridas de exemplo" testID="historico-mock-badge" /> : null}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  loading: { gap: theme.spacing['3'] },
  groups: { gap: theme.spacing['5'] },
  group: { gap: theme.spacing['2'] },
  rows: { gap: theme.spacing['2'] },
});
