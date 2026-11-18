import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AppShell, MockBadge, ScreenHeader, theme } from '@vuumbora/ui';
import { TripProgressBar } from '../src/components/trip/TripProgressBar';
import { DriverInfoCard } from '../src/components/assignedDriver/DriverInfoCard';
import { SafetyActionsRow } from '../src/components/assignedDriver/SafetyActionsRow';
import { useRideRequestStore } from '../src/store/useRideRequestStore';

/**
 * P09 — Corrida em andamento. Sem mockup de referência (derivada do design system).
 * Progresso e ETA são 100% simulados (`src/sim/rideSimulator.ts`) — nenhum trajeto real
 * é calculado. Sem botão de cancelar: o domínio (`@vuumbora/domain/passenger`) só permite
 * cancelamento até `driver_arrived` — depois de `in_progress` só restam ações de segurança.
 */
export default function TripInProgressScreen() {
  const phase = useRideRequestStore((state) => state.phase);
  const destination = useRideRequestStore((state) => state.destination);
  const assignedDriver = useRideRequestStore((state) => state.assignedDriver);
  const tripProgressPercent = useRideRequestStore((state) => state.tripProgressPercent);
  const tripEtaMinutes = useRideRequestStore((state) => state.tripEtaMinutes);

  useEffect(() => {
    if (phase === 'in_progress') return;
    if (phase === 'completed') {
      router.replace('/concluida');
      return;
    }
    if (phase === 'driver_assigned' || phase === 'driver_en_route' || phase === 'driver_arrived') {
      router.replace('/a-caminho');
      return;
    }
    if (phase === 'searching_driver' || phase === 'requested') {
      router.replace('/buscando');
      return;
    }
    router.replace('/');
  }, [phase]);

  if (phase !== 'in_progress' || !assignedDriver) {
    return <AppShell testID="trip-in-progress-redirecting">{null}</AppShell>;
  }

  return (
    <AppShell scroll>
      <View style={styles.content}>
        {/* Título curto ("Em andamento", não "Corrida em andamento"): medido (Playwright,
            320/360px) que a versão longa não cabia numa linha só no título do
            ScreenHeader (numberOfLines={1} fixo no componente). */}
        <ScreenHeader title="Em andamento" testID="trip-in-progress-header" />
        <View style={styles.mockTag}>
          <MockBadge label="trajeto simulado" />
        </View>

        <TripProgressBar
          percent={tripProgressPercent}
          {...(tripEtaMinutes !== undefined ? { etaMinutes: tripEtaMinutes } : {})}
          destinationLabel={destination?.address ?? 'destino'}
          testID="trip-progress-bar"
        />

        <DriverInfoCard driver={assignedDriver} variant="compact" testID="assigned-driver-compact-card" />

        <SafetyActionsRow driverName={assignedDriver.name} testID="trip-in-progress-safety-actions" />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  mockTag: { alignItems: 'flex-end' },
});
