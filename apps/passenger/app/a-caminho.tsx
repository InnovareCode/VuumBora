import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Clock, MapPin } from 'lucide-react-native';
import { AppShell, MockBadge, ScreenHeader, StatusBadge, DangerButton, SurfaceRaised, theme, textStyle, tabularNums, type StatusBadgeVariant } from '@vuumbora/ui';
import { DriverInfoCard } from '../src/components/assignedDriver/DriverInfoCard';
import { SafetyActionsRow } from '../src/components/assignedDriver/SafetyActionsRow';
import { formatEtaMinutes } from '../src/utils/time';
import { useRideRequestStore } from '../src/store/useRideRequestStore';

type EnRoutePhase = 'driver_assigned' | 'driver_en_route' | 'driver_arrived';

const SUBPHASE: Record<EnRoutePhase, { readonly label: string; readonly variant: StatusBadgeVariant }> = {
  driver_assigned: { label: 'Motorista encontrado', variant: 'info' },
  driver_en_route: { label: 'Motorista a caminho', variant: 'warning' },
  driver_arrived: { label: 'Motorista chegou', variant: 'success' },
};

/**
 * P08 — Motorista a caminho. Sem mockup de referência (derivada do design system).
 * Cobre as 3 sub-fases (motorista atribuído → a caminho → chegou) numa tela só, que
 * reage à máquina de estados (`@vuumbora/domain/passenger`) — a progressão em si é
 * 100% simulada (`src/sim/rideSimulator.ts`), nunca uma chamada de rede.
 */
export default function DriverEnRouteScreen() {
  const phase = useRideRequestStore((state) => state.phase);
  const destination = useRideRequestStore((state) => state.destination);
  const assignedDriver = useRideRequestStore((state) => state.assignedDriver);
  const pickupEtaMinutes = useRideRequestStore((state) => state.pickupEtaMinutes);
  const cancelSearch = useRideRequestStore((state) => state.cancelSearch);

  useEffect(() => {
    if (phase === 'driver_assigned' || phase === 'driver_en_route' || phase === 'driver_arrived') return;
    if (phase === 'in_progress') {
      router.replace('/em-andamento');
      return;
    }
    if (phase === 'completed') {
      router.replace('/concluida');
      return;
    }
    if (phase === 'searching_driver' || phase === 'requested') {
      router.replace('/buscando');
      return;
    }
    // draft/quoted/cancelled/failed: acesso direto sem corrida em andamento.
    router.replace('/');
  }, [phase]);

  if (!(phase === 'driver_assigned' || phase === 'driver_en_route' || phase === 'driver_arrived') || !assignedDriver) {
    return <AppShell testID="driver-en-route-redirecting">{null}</AppShell>;
  }

  function handleCancel() {
    cancelSearch();
    router.replace('/');
  }

  const sub = SUBPHASE[phase];

  return (
    <AppShell scroll glow>
      <View style={styles.content}>
        <ScreenHeader title="Seu motorista" testID="driver-en-route-header" />
        <View style={styles.mockTag}>
          <MockBadge label="corrida simulada: progresso, ETA e contato" />
        </View>

        {destination ? (
          <View style={styles.destinationRow}>
            <MapPin size={14} color={theme.role.warning} strokeWidth={2} fill={theme.role.warning} />
            {/* numberOfLines={2} (não 1): medido (Playwright) que o endereço completo nunca
                cabe numa linha só, nem a 430px — truncaria informação do destino. */}
            <Text style={styles.destinationText} numberOfLines={2}>
              {destination.address}
            </Text>
          </View>
        ) : null}

        <View style={styles.statusRow}>
          <StatusBadge variant={sub.variant} label={sub.label} testID="driver-status-badge" />
        </View>

        <DriverInfoCard driver={assignedDriver} testID="assigned-driver-card" />

        <SurfaceRaised style={styles.etaCard}>
          <Clock size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />
          <View style={styles.etaTextBlock}>
            <Text style={styles.etaLabel}>Chegada estimada ao embarque</Text>
            <Text style={styles.etaValue}>{pickupEtaMinutes !== undefined ? formatEtaMinutes(pickupEtaMinutes) : '—'}</Text>
          </View>
        </SurfaceRaised>

        <SafetyActionsRow driverName={assignedDriver.name} testID="driver-en-route-safety-actions" />

        <DangerButton
          label="Cancelar corrida"
          onPress={handleCancel}
          accessibilityLabel="Cancelar corrida com motorista a caminho"
          testID="cancel-ride-button"
        />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  mockTag: { alignItems: 'flex-end' },
  destinationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing['2'] },
  destinationText: { flex: 1, color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  etaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['3'],
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    // Borda iluminada de cima (direção de arte §4/§9 item 2). Fundo: item 6
    // (`gradient.surface.raised`, ver SurfaceRaised) — era `theme.role.surface` chapado
    // com `theme.role.border` nos 4 lados (auditoria Apolo, item A1). Padding 16 (era
    // 12): os outros cards do app usam 16.
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
  },
  etaTextBlock: { flex: 1 },
  etaLabel: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  etaValue: { color: theme.role.textPrimary, ...textStyle('bold', 'body'), ...tabularNums, marginTop: 2 },
});
