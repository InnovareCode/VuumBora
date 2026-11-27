import { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Circle, MapPin } from 'lucide-react-native';
import { isRideCancellable } from '@vuumbora/domain/passenger';
import { AppShell, ConfirmDialog, DangerButton, FooterActions, NetworkBanner, theme, textStyle, tokens, useNetworkStatus } from '@vuumbora/ui';
import { EmergencyCallRow } from '../../src/components/ride/EmergencyCallRow';
import { RideMapLayout } from '../../src/components/ride/RideMapLayout';
import { RideVehicleMarker } from '../../src/components/ride/RideVehicleMarker';
import { SearchingPanel } from '../../src/components/ride/SearchingPanel';
import { AssignedDriverPanel, type AssignedDriverSubphase } from '../../src/components/ride/AssignedDriverPanel';
import { InProgressPanel } from '../../src/components/ride/InProgressPanel';
import { SearchingPulse } from '../../src/components/search/SearchingPulse';
import { useDevRidePhaseOverride, isDevRidePhaseParam } from '../../src/dev/useDevRidePhaseOverride';
import { useElapsedSeconds } from '../../src/utils/useElapsedSeconds';
import { useRideRequestStore } from '../../src/store/useRideRequestStore';

/**
 * `/corrida` — P07 (buscando) + P08 (motorista a caminho/chegou) + P09 (em andamento) numa
 * rota só, com estados (PP-10, `docs/fichas-de-tela/README.md`). Substitui as antigas
 * `buscando.tsx`/`a-caminho.tsx`/`em-andamento.tsx`, que se redirecionavam entre si — o mapa
 * (`RideMapLayout`) não é desmontado nem remontado entre fases, só o conteúdo do painel troca.
 *
 * D-32: sem cabeçalho e sem seta de voltar em NENHUM estado — em corrida ativa não se volta
 * para a escolha de categoria/destino. No Android, o botão físico de voltar MINIMIZA o app
 * (`BackHandler.exitApp`) em vez de navegar para a tela anterior da pilha.
 */
export default function RideScreen() {
  const { devPhase } = useLocalSearchParams<{ devPhase?: string }>();
  useDevRidePhaseOverride();

  const phase = useRideRequestStore((state) => state.phase);
  const origin = useRideRequestStore((state) => state.origin);
  const destination = useRideRequestStore((state) => state.destination);
  const requestedCategory = useRideRequestStore((state) => state.requestedCategory);
  const assignedDriver = useRideRequestStore((state) => state.assignedDriver);
  const pickupCode = useRideRequestStore((state) => state.pickupCode);
  const pickupEtaMinutes = useRideRequestStore((state) => state.pickupEtaMinutes);
  const tripEtaMinutes = useRideRequestStore((state) => state.tripEtaMinutes);
  const tripProgressPercent = useRideRequestStore((state) => state.tripProgressPercent);
  const cancelSearch = useRideRequestStore((state) => state.cancelSearch);
  const refreshQuote = useRideRequestStore((state) => state.refreshQuote);

  const [confirmVisible, setConfirmVisible] = useState(false);
  const online = useNetworkStatus();

  // "O motorista cancelou, estamos procurando outro" (ficha P07 §5): detectado comparando a
  // fase ANTERIOR (tinha motorista atribuído) com a ATUAL (voltou para `searching_driver`) —
  // é a MESMA transição que `trip-lifecycle.ts` já produz quando o ATOR motorista cancela
  // antes do embarque, só que o simulador local nunca a dispara hoje (ver `rideSimulator.ts`).
  const previousPhaseRef = useRef(phase);
  const [driverCancelledNotice, setDriverCancelledNotice] = useState(false);
  useEffect(() => {
    const previous = previousPhaseRef.current;
    const wasAssigned = previous === 'driver_assigned' || previous === 'driver_en_route' || previous === 'driver_arrived';
    if (wasAssigned && phase === 'searching_driver') setDriverCancelledNotice(true);
    else if (phase !== 'searching_driver') setDriverCancelledNotice(false);
    previousPhaseRef.current = phase;
  }, [phase]);

  const searching = phase === 'searching_driver' || phase === 'requested';
  const elapsedSearchSeconds = useElapsedSeconds(searching);
  const arrived = phase === 'driver_arrived';
  const waitingSeconds = useElapsedSeconds(arrived);

  // Android: minimiza o app em vez de navegar pra tela anterior da pilha (D-32) — nunca
  // registrado no web (react-native-web não suporta `BackHandler`, ver
  // `ConsentReacceptScreen.tsx`).
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });
    return () => subscription.remove();
  }, []);

  // Pendente de aplicar (devPhase ainda em voo, `useDevRidePhaseOverride`): sem isso, uma tela
  // aberta direto em `/corrida?devPhase=...` (sem passar por `requestRide`) seria mandada pra
  // Home antes do atalho de captura terminar de montar a corrida.
  const devPhasePending = __DEV__ && typeof devPhase === 'string' && isDevRidePhaseParam(devPhase);

  useEffect(() => {
    if (devPhasePending) return;
    if (phase === 'completed') {
      router.replace('/concluida');
      return;
    }
    if (phase === 'draft' || phase === 'quoted') {
      router.replace('/');
      return;
    }
    if ((phase === 'driver_assigned' || phase === 'driver_en_route' || phase === 'driver_arrived' || phase === 'in_progress') && !assignedDriver) {
      router.replace('/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, assignedDriver, devPhasePending]);

  function handleCancelPress() {
    setConfirmVisible(true);
  }

  function handleConfirmCancel() {
    setConfirmVisible(false);
    cancelSearch();
    router.replace('/');
  }

  function handleRetry() {
    cancelSearch();
    refreshQuote();
    router.replace('/categoria');
  }

  function handleBackHome() {
    cancelSearch();
    router.replace('/');
  }

  if (phase === 'failed' || phase === 'cancelled') {
    return (
      <AppShell padded={false} scroll testID="ride-screen-outcome">
        <RideMapLayout mapAccessibilityLabel="Mapa ilustrativo, corrida encerrada">
          <NetworkBanner testID="ride-network-banner" />
          <SearchingPanel
            status={phase}
            origin={origin}
            destination={destination}
            category={requestedCategory}
            elapsedSeconds={elapsedSearchSeconds}
            driverCancelledNotice={false}
            onRetry={handleRetry}
            onBackHome={handleBackHome}
            testID="ride-outcome-panel"
          />
        </RideMapLayout>
      </AppShell>
    );
  }

  if (searching) {
    return (
      <AppShell
        padded={false}
        scroll
        testID="ride-screen-searching"
        footer={
          // Mesma solução da P08 (achado da Íris, onda 4): "Cancelar pedido" ficava abaixo da
          // dobra em 320px dentro do conteúdo que rola.
          <FooterActions testID="searching-footer">
            <DangerButton
              label="Cancelar pedido"
              onPress={handleCancelPress}
              disabled={!online}
              accessibilityLabel={online ? 'Cancelar pedido de corrida' : 'Cancelar pedido de corrida, indisponível: sem conexão'}
              testID="cancel-search-button"
            />
            {!online ? <Text style={footerStyles.offlineHint}>Sem conexão</Text> : null}
          </FooterActions>
        }
      >
        <RideMapLayout
          mapAccessibilityLabel={`Mapa ilustrativo (mock) da rota de ${origin?.address ?? 'sua localização atual'} até ${destination?.address ?? 'o destino'}`}
          mapContent={
            <>
              <View style={mapStyles.searchRouteLine} pointerEvents="none" />
              <View style={mapStyles.pulseAnchor}>
                <SearchingPulse />
              </View>
              <View style={mapStyles.destinationPinAnchor}>
                <MapPin size={18} color={tokens.color.map.destination} fill={tokens.color.map.destination} strokeWidth={1.5} />
              </View>
            </>
          }
        >
          <NetworkBanner testID="ride-network-banner" />
          <SearchingPanel
            status="searching"
            origin={origin}
            destination={destination}
            category={requestedCategory}
            elapsedSeconds={elapsedSearchSeconds}
            driverCancelledNotice={driverCancelledNotice}
            onRetry={handleRetry}
            onBackHome={handleBackHome}
            testID="searching-panel"
          />
        </RideMapLayout>

        <ConfirmDialog
          visible={confirmVisible}
          title="Cancelar o pedido?"
          description="Você ainda não tem motorista. Cancelar não tem custo."
          confirmLabel="Cancelar pedido"
          cancelLabel="Continuar procurando"
          destructive
          onConfirm={handleConfirmCancel}
          onCancel={() => setConfirmVisible(false)}
          testID="cancel-search-dialog"
        />
      </AppShell>
    );
  }

  const assignedSubphase = phase === 'driver_assigned' || phase === 'driver_en_route' || phase === 'driver_arrived';

  if (!((assignedSubphase || phase === 'in_progress') && assignedDriver)) {
    // `draft`/`quoted`/`requested`/`completed`, ou fase de motorista sem motorista atribuído
    // (acesso direto sem corrida real) — o `useEffect` acima já redireciona (Home ou P10).
    return <AppShell padded={false} testID="ride-screen-redirecting">{null}</AppShell>;
  }

  if (phase === 'in_progress') {
    return (
      <AppShell padded={false} scroll testID="ride-screen-in-progress">
        <RideMapLayout
          mapAccessibilityLabel={`Rota até ${destination?.address ?? 'o destino'}`}
          mapContent={
            <>
              <View style={mapStyles.progressRouteLine} pointerEvents="none" />
              <View style={mapStyles.vehicleAnchorProgress}>
                <RideVehicleMarker />
              </View>
              <View style={mapStyles.destinationBalloon}>
                <MapPin size={16} color={tokens.color.map.destination} fill={tokens.color.map.destination} strokeWidth={1.5} style={mapStyles.destinationBalloonIcon} />
                {/* numberOfLines={2} (não 1): medido (sonda de texto) que o endereço completo
                    trunca horizontalmente em 320-390px com 1 linha só — mesma regra já aplicada
                    no balão da P05/P06 (`RouteMapBanner`) e no texto do painel logo abaixo. */}
                <Text style={mapStyles.destinationBalloonText} numberOfLines={2}>
                  {destination?.address ?? 'Destino'}
                </Text>
              </View>
            </>
          }
        >
          <NetworkBanner testID="ride-network-banner" />
          <InProgressPanel
            driver={assignedDriver}
            destinationAddress={destination?.address}
            tripProgressPercent={tripProgressPercent}
            tripEtaMinutes={tripEtaMinutes}
            testID="in-progress-panel"
          />
        </RideMapLayout>
      </AppShell>
    );
  }

  // driver_assigned | driver_en_route | driver_arrived
  const subphase = phase as AssignedDriverSubphase;
  const cancellable = isRideCancellable(phase);
  return (
    <AppShell
      padded={false}
      scroll
      testID="ride-screen-assigned"
      footer={
        // "Ligar 190" e "Cancelar corrida" num rodapé FIXO (G-11-like, achado da Íris onda 4):
        // com o bloco do código de embarque, os dois ficavam abaixo da dobra em 320-390px no
        // estado "chegou" dentro do conteúdo que rola.
        <FooterActions testID="assigned-driver-footer">
          <EmergencyCallRow testID="assigned-driver-emergency-row" />
          {cancellable ? (
            <>
              <DangerButton
                label="Cancelar corrida"
                onPress={handleCancelPress}
                disabled={!online}
                accessibilityLabel={online ? 'Cancelar corrida com motorista a caminho' : 'Cancelar corrida, indisponível: sem conexão'}
                testID="cancel-ride-button"
              />
              {!online ? <Text style={footerStyles.offlineHint}>Sem conexão</Text> : null}
            </>
          ) : null}
        </FooterActions>
      }
    >
      <RideMapLayout
        mapAccessibilityLabel={
          subphase === 'driver_arrived' ? 'Mapa ilustrativo: motorista no local de embarque' : 'Mapa ilustrativo: motorista a caminho do embarque'
        }
        // Mapa menor no "chegou" (achado da Íris, onda 4): o carro já está parado — o código de
        // embarque vale mais que o mapa aqui, e o painel precisa do espaço pra "Ligar 190" e
        // "Cancelar corrida" (rodapé fixo) não cobrirem o cartão do código em 320-390px.
        compactMap={subphase === 'driver_arrived'}
        mapContent={
          subphase === 'driver_arrived' ? (
            <View style={mapStyles.vehicleAnchorArrived}>
              <RideVehicleMarker />
            </View>
          ) : (
            <>
              <View style={mapStyles.assignedRouteLine} pointerEvents="none" />
              <View style={mapStyles.vehicleAnchorAssigned}>
                <RideVehicleMarker />
              </View>
              <View style={mapStyles.pickupPinAnchor}>
                <Circle size={16} color={tokens.color.map.pickup} fill={tokens.color.map.pickup} />
              </View>
            </>
          )
        }
      >
        <NetworkBanner testID="ride-network-banner" />
        <AssignedDriverPanel
          subphase={subphase}
          driver={assignedDriver}
          pickupEtaMinutes={pickupEtaMinutes}
          embarkCode={pickupCode}
          waitingSeconds={waitingSeconds}
          testID="assigned-driver-panel"
        />
      </RideMapLayout>

      <ConfirmDialog
        visible={confirmVisible}
        title="Cancelar a corrida?"
        description={
          subphase === 'driver_arrived'
            ? 'O motorista já chegou ao local de embarque. Cancelar não tem custo.'
            : 'O motorista já está a caminho. Cancelar não tem custo.'
        }
        confirmLabel="Cancelar corrida"
        cancelLabel="Manter corrida"
        destructive
        onConfirm={handleConfirmCancel}
        onCancel={() => setConfirmVisible(false)}
        testID="cancel-ride-dialog"
      />
    </AppShell>
  );
}

const mapStyles = StyleSheet.create({
  searchRouteLine: {
    position: 'absolute',
    left: '20%',
    right: '24%',
    top: '42%',
    height: 3,
    borderRadius: theme.radius.pill,
    backgroundColor: tokens.color.map.route,
    opacity: 0.85,
    transform: [{ rotate: '-6deg' }],
  },
  pulseAnchor: { position: 'absolute', left: '50%', top: '58%', marginLeft: -48, marginTop: -48 },
  destinationPinAnchor: { position: 'absolute', left: '22%', top: '20%' },
  assignedRouteLine: {
    position: 'absolute',
    left: '18%',
    right: '26%',
    top: '48%',
    height: 3,
    borderRadius: theme.radius.pill,
    backgroundColor: tokens.color.map.route,
    opacity: 0.85,
    transform: [{ rotate: '10deg' }],
  },
  vehicleAnchorAssigned: { position: 'absolute', left: '24%', top: '32%' },
  pickupPinAnchor: { position: 'absolute', right: '22%', top: '58%' },
  vehicleAnchorArrived: { position: 'absolute', left: '50%', top: '50%', marginLeft: -16, marginTop: -16 },
  progressRouteLine: {
    position: 'absolute',
    left: '20%',
    right: '20%',
    top: '55%',
    height: 3,
    borderRadius: theme.radius.pill,
    backgroundColor: tokens.color.map.route,
    opacity: 0.85,
    transform: [{ rotate: '-4deg' }],
  },
  vehicleAnchorProgress: { position: 'absolute', left: '28%', top: '62%' },
  destinationBalloon: {
    position: 'absolute',
    // `spacing['9']` (não `['4']`): o selo "mapa ilustrativo" (`RideMapLayout`) ocupa o
    // canto superior direito — medido (captura P09) que um balão de largura total mais
    // acima colidia com ele, cortando visualmente o fim do endereço.
    top: theme.spacing['9'],
    left: theme.spacing['3'],
    right: theme.spacing['3'],
    flexDirection: 'row',
    // `flex-start` (não `center`): com o endereço em até 2 linhas, o ícone fica alinhado à
    // PRIMEIRA linha (mesma técnica do balão da P05/P06, `RouteMapBanner.tsx`), não
    // flutuando no meio do bloco de texto.
    alignItems: 'flex-start',
    gap: theme.spacing['2'],
    backgroundColor: tokens.color.map.balloon,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderTopColor: tokens.color.map.balloonBorderTop,
    borderColor: tokens.color.map.balloonBorderBase,
    paddingHorizontal: theme.spacing['3'],
    paddingVertical: theme.spacing['2'],
  },
  destinationBalloonIcon: { marginTop: 2 },
  destinationBalloonText: { flex: 1, color: theme.role.textPrimary, ...textStyle('medium', 'small') },
});

const footerStyles = StyleSheet.create({
  offlineHint: { color: theme.role.textMuted, ...textStyle('regular', 'caption'), textAlign: 'center' },
});
