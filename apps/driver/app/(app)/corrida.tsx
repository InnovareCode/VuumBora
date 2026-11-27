import { memo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Check, MapPin, MoreHorizontal, Navigation } from 'lucide-react-native';
import {
  AppShell,
  Avatar,
  CodeInput,
  ConfirmDialog,
  EmptyState,
  FooterActions,
  InlineAlert,
  LoadingSkeleton,
  MapPreviewBackground,
  MockBadge,
  NetworkBanner,
  PrimaryButton,
  ScreenHeader,
  SecondaryButton,
  SurfaceRaised,
  focusRingStyle,
  tabularNums,
  textStyle,
  theme,
  tokens,
  useKeyboardFocusRing,
  useNetworkStatus,
} from '@vuumbora/ui';
import { MoreOptionsSheet } from '../../src/components/ride/MoreOptionsSheet';
import { useElapsedSeconds } from '../../src/components/ride/useElapsedSeconds';
import { openEmergencyCall } from '../../src/support/openSupportChannel';
import { openNavigation } from '../../src/navigation/openNavigation';
import { formatDistanceKm, formatElapsedClock, formatPickupDistance, formatPickupEta } from '../../src/utils/offerFormat';

const COMPACT_WIDTH_BREAKPOINT = 375;
const NO_SHOW_WAIT_S = 5 * 60; // decisão do dono, 22/11/2026: 5 min de espera no local (README, onda 4)

type RidePhase = 'en_route' | 'arrived' | 'in_progress';

function isPhase(value: string | undefined): value is RidePhase {
  return value === 'en_route' || value === 'arrived' || value === 'in_progress';
}

const MOCK_PASSENGER_NAME = 'Ana';
const MOCK_PICKUP_ADDRESS = 'Av. Prudente de Morais, 1200';
const MOCK_PICKUP_NEIGHBORHOOD = 'Lagoa Nova';
const MOCK_PICKUP_POINT = { latitude: -5.796, longitude: -35.211 };
const MOCK_DESTINATION_LABEL = 'Shopping Midway Mall';
const MOCK_DESTINATION_ADDRESS = 'Av. Bernardo Vieira, 1030';
const MOCK_DESTINATION_NEIGHBORHOOD = 'Tirol';
const MOCK_DESTINATION_POINT = { latitude: -5.805, longitude: -35.205 };
const MOCK_PICKUP_ETA_S = 360; // 6 min
const MOCK_PICKUP_DISTANCE_M = 1800; // 1,8 km
const MOCK_TRIP_DURATION_S = 12 * 60;
const MOCK_TRIP_DISTANCE_M = 4800;

/** Pior caso de texto (ficha §5 "texto longo") — endereço com complemento e nome de 20+ caracteres. */
const LONG_PASSENGER_NAME = 'Maria Aparecida dos Santos Costa';
const LONG_PICKUP_ADDRESS = 'Rua Doutor José Gonçalves, 1580, Bloco B, Apto 302';
const LONG_DESTINATION_LABEL = 'Shopping Midway Mall, Av. Bernardo Vieira';

/**
 * M07+M08+M09 — a corrida depois do aceite, numa rota só com estados (PP-10, decidido pelo Atlas
 * em 22/11/2026, `docs/fichas-de-tela/README.md`): `phase` troca a tela sem remontar o mapa nem
 * trocar de rota. M06 (`oferta.tsx`) chega aqui com `router.replace('/corrida')`; ao finalizar
 * (M09 → M10), `router.replace('/finalizada')` — M10 fica À PARTE (PP-10 só junta M07/M08/M09).
 *
 * Sem rede nova (mesma régua da M05/M06): `DriverTripSnapshot`/`DriverTripPort` ainda não estão
 * ligados a nenhum cliente real aqui — os dados exatos (embarque, destino, nome) são MOCK, tipados
 * pelo formato do contrato (`@vuumbora/api-client/driver`, B4: só aparecem porque o motorista já
 * foi atribuído). `?devFase=`/`?devEstado=`/`?devPerto=` (`__DEV__`) forçam os estados que dependem
 * do servidor ou do GPS, para a ferramenta de qualidade-tela fotografar sem precisar de nenhum dos
 * dois — mesmo padrão de `?devAprovado=`/`?devEstado=` já usado na M05/M08/M12.
 *
 * C-12 (mapa real) e C-02 (`BottomSheet` arrastável) não existem em `packages/ui` ainda: o mapa é
 * `MapPreviewBackground variant="motorista"` (placeholder) e o painel de baixo é um `SurfaceRaised`
 * fixo (sem gesto), mesmo substituto local já usado em `categoria.tsx` do passageiro
 * (`role.surface` + `elevation.3` + `radius.xxl` + `layout.sheetHandle{Width,Height}`).
 */
export default function RideInProgressScreen() {
  const params = useLocalSearchParams<{ devFase?: string; devEstado?: string; devPerto?: string }>();
  const forcedPhase = __DEV__ && isPhase(params.devFase) ? params.devFase : undefined;
  const devEstado = __DEV__ ? params.devEstado : undefined;
  const { width, height } = useWindowDimensions();
  const compact = width < COMPACT_WIDTH_BREAKPOINT;
  const narrowAddress = width < 360;
  const panelPadding = compact ? theme.layout.screenPaddingCompact : theme.layout.screenPadding;
  const online = useNetworkStatus();
  const offline = devEstado === 'sem-rede' || !online;

  const [phase, setPhase] = useState<RidePhase>(forcedPhase ?? 'en_route');
  const [nearPickup, setNearPickup] = useState(__DEV__ && params.devPerto === '1');
  const [arrivedAtMs, setArrivedAtMs] = useState(() => Date.now() - (devEstado === 'espera-longa' ? 6 * 60 * 1000 : 134 * 1000));
  const [moreOptionsVisible, setMoreOptionsVisible] = useState(false);
  const [cancelDialogVisible, setCancelDialogVisible] = useState(devEstado === 'cancelando');
  const [cancelling, setCancelling] = useState(devEstado === 'cancelando');
  const [arrivingLoading, setArrivingLoading] = useState(devEstado === 'chegando');
  const [navError, setNavError] = useState(devEstado === 'sem-app-navegacao');
  const [startLoading, setStartLoading] = useState(devEstado === 'iniciando');
  const [code, setCode] = useState('');
  const [finishDialogVisible, setFinishDialogVisible] = useState(devEstado === 'confirmar' || devEstado === 'confirmar-longe');
  const [finishLoading, setFinishLoading] = useState(devEstado === 'finalizando');

  const elapsedSinceArrival = useElapsedSeconds(arrivedAtMs);
  const loading = devEstado === 'carregando';
  const textoLongo = devEstado === 'texto-longo';
  const passengerName = textoLongo ? LONG_PASSENGER_NAME : MOCK_PASSENGER_NAME;
  const pickupAddress = textoLongo ? LONG_PICKUP_ADDRESS : MOCK_PICKUP_ADDRESS;
  const destinationLabel = textoLongo ? LONG_DESTINATION_LABEL : MOCK_DESTINATION_LABEL;
  const showCode = devEstado === 'codigo' || devEstado === 'codigo-errado' || devEstado === 'bloqueado';
  const codeError = devEstado === 'codigo-errado' ? 'Código incorreto. Confira com o passageiro.' : undefined;
  const rateLimited = devEstado === 'bloqueado';
  const showNoShow = devEstado === 'espera-longa' || elapsedSinceArrival >= NO_SHOW_WAIT_S;
  const farFromDestination = devEstado === 'confirmar-longe';

  function handleMoreOptions() {
    setMoreOptionsVisible(true);
  }

  function handleEmergencyCall() {
    setMoreOptionsVisible(false);
    void openEmergencyCall();
  }

  function handleSupport() {
    setMoreOptionsVisible(false);
    router.push({ pathname: '/suporte', params: { tripCode: 'ABC123', tripRoute: `${MOCK_PICKUP_NEIGHBORHOOD} → ${MOCK_DESTINATION_NEIGHBORHOOD}`, tripDate: 'hoje' } });
  }

  function handleOpenCancelDialog() {
    setMoreOptionsVisible(false);
    setCancelDialogVisible(true);
  }

  function handleConfirmCancel() {
    if (cancelling) return;
    setCancelling(true);
    setTimeout(() => router.replace('/'), 800); // volta ao painel ONLINE (o motorista não perde o turno)
  }

  async function handleNavigateToPickup() {
    if (devEstado === 'sem-app-navegacao') {
      setNavError(true);
      return;
    }
    const result = await openNavigation(MOCK_PICKUP_POINT, pickupAddress);
    setNavError(!result.ok);
  }

  async function handleNavigateToDestination() {
    const result = await openNavigation(MOCK_DESTINATION_POINT, destinationLabel);
    setNavError(!result.ok);
  }

  function handleArrived() {
    if (arrivingLoading || offline) return;
    setArrivingLoading(true);
    setTimeout(() => {
      setArrivingLoading(false);
      setArrivedAtMs(Date.now());
      setPhase('arrived');
    }, 700);
  }

  function handleStart() {
    if (startLoading || rateLimited || (showCode && code.length < 4) || offline) return;
    setStartLoading(true);
    setTimeout(() => {
      setStartLoading(false);
      setPhase('in_progress');
    }, 700);
  }

  function handleConfirmFinish() {
    if (finishLoading) return;
    setFinishLoading(true);
    setTimeout(() => router.replace('/finalizada'), 900);
  }

  function handleOpenSettings() {
    try {
      void Linking.openSettings?.();
    } catch {
      // nativo sem suporte, ou web (sem ajustes de SO) — nada a fazer.
    }
  }

  const passengerCancelled = devEstado === 'passageiro-cancelou' && phase !== 'in_progress';

  if (passengerCancelled) {
    return (
      <AppShell scroll glow testID="corrida-screen">
        <View style={styles.content}>
          <EmptyState
            title="O passageiro cancelou a corrida."
            action={<PrimaryButton label="Voltar ao painel" onPress={() => router.replace('/')} testID="back-to-panel-button" />}
            testID="corrida-passageiro-cancelou"
          />
        </View>
      </AppShell>
    );
  }

  if (phase === 'en_route') {
    return (
      <AppShell padded={false} scroll testID="corrida-screen">
        <View style={styles.enRouteContent}>
          <NetworkBanner testID="corrida-network-banner" />
          <View style={styles.mapBlock}>
            <MapPreviewBackground variant="motorista" style={styles.mapFill} />
            <View style={styles.topCard} testID="corrida-topo">
              <Text style={styles.topCardLabel}>Embarque</Text>
              <View style={styles.topCardRow}>
                {/* Só 320×568 (ficha §2, ao pé da letra: "endereço em 1 linha + bairro"; o corte de
                    375 usado no resto da tela é largo demais aqui — medido: a 360px o texto
                    COMBINADO ("endereço · bairro") já cabe em 2 linhas sem cortar, só 320 não cabe,
                    nem combinado nem só o endereço sozinho). 1 linha + reticências em 320 é o que a
                    própria ficha pede (mesma classe do corte aceito no M12: endereço real pode ser
                    mais longo que a largura, "1 linha" já assume isso). */}
                <View style={styles.topCardTextBlock}>
                  <Text style={styles.topCardAddress} numberOfLines={narrowAddress ? 1 : 2}>
                    {narrowAddress ? pickupAddress : `${pickupAddress} · ${MOCK_PICKUP_NEIGHBORHOOD}`}
                  </Text>
                  {narrowAddress ? (
                    <Text style={styles.topCardNeighborhood} numberOfLines={1}>
                      {MOCK_PICKUP_NEIGHBORHOOD}
                    </Text>
                  ) : null}
                </View>
                <MoreOptionsButton onPress={handleMoreOptions} />
              </View>
            </View>
          </View>

          <View style={[styles.panel, { paddingHorizontal: panelPadding }]}>
            <View style={styles.handle} accessibilityElementsHidden importantForAccessibility="no" />
            {loading ? (
              <View style={styles.panelLoading} testID="corrida-carregando">
                <LoadingSkeleton variant="line" width={160} />
                <LoadingSkeleton variant="block" height={44} />
              </View>
            ) : (
              <>
                <Text style={styles.panelTitle} testID="corrida-eta">
                  {formatPickupEta(MOCK_PICKUP_ETA_S)} · {formatDistanceKm(MOCK_PICKUP_DISTANCE_M)}
                </Text>
                <View style={styles.passengerRow}>
                  <Avatar name={passengerName} size="md" />
                  <Text style={styles.passengerName} numberOfLines={1}>
                    {passengerName}
                  </Text>
                </View>
                {devEstado === 'sem-permissao' ? (
                  <InlineAlert
                    tone="warning"
                    message="Ative a localização em segundo plano para receber corridas."
                    testID="corrida-sem-permissao"
                  />
                ) : null}
                {navError ? (
                  <InlineAlert tone="info" title="Não encontramos um app de navegação." message={pickupAddress} testID="corrida-sem-app-navegacao" />
                ) : null}
                <MockBadge label="corrida de demonstração" testID="corrida-mock-badge" />
                <View style={styles.actionsColumn}>
                  {nearPickup ? (
                    <>
                      <PrimaryButton
                        label="Cheguei ao embarque"
                        onPress={handleArrived}
                        loading={arrivingLoading}
                        disabled={offline}
                        accessibilityLabel={offline ? 'Cheguei ao embarque, indisponível: sem conexão' : 'Cheguei ao embarque'}
                        testID="arrived-button"
                      />
                      <SecondaryButton label="Navegar até o embarque" onPress={() => void handleNavigateToPickup()} size="prominent" testID="navigate-pickup-button" />
                    </>
                  ) : (
                    <>
                      <PrimaryButton
                        label="Navegar até o embarque"
                        icon={<Navigation size={20} color={theme.role.ctaText} strokeWidth={2.25} />}
                        onPress={() => void handleNavigateToPickup()}
                        testID="navigate-pickup-button"
                      />
                      <SecondaryButton
                        label="Cheguei ao embarque"
                        onPress={handleArrived}
                        loading={arrivingLoading}
                        disabled={offline}
                        size="prominent"
                        accessibilityLabel={offline ? 'Cheguei ao embarque, indisponível: sem conexão' : 'Cheguei ao embarque'}
                        testID="arrived-button"
                      />
                    </>
                  )}
                </View>
              </>
            )}
          </View>
        </View>

        <MoreOptionsSheet
          visible={moreOptionsVisible}
          onClose={() => setMoreOptionsVisible(false)}
          onCancelRide={handleOpenCancelDialog}
          onSupport={handleSupport}
          testID="corrida-mais-opcoes"
        />
        <ConfirmDialog
          visible={cancelDialogVisible}
          title="Cancelar a corrida?"
          description="O passageiro volta para a fila e outro motorista é chamado."
          confirmLabel="Cancelar corrida"
          cancelLabel="Continuar"
          destructive
          loading={cancelling}
          onConfirm={handleConfirmCancel}
          onCancel={() => setCancelDialogVisible(false)}
          testID="corrida-cancelar-dialog"
        />
      </AppShell>
    );
  }

  if (phase === 'arrived') {
    const compactHeight = height < 640;
    return (
      <AppShell
        scroll
        glow
        footer={
          <FooterActions testID="corrida-footer">
            <PrimaryButton
              label="Iniciar corrida"
              onPress={handleStart}
              loading={startLoading}
              disabled={rateLimited || (showCode && code.length < 4) || offline}
              accessibilityLabel={offline ? 'Iniciar corrida, indisponível: sem conexão' : 'Iniciar corrida'}
              testID="start-ride-button"
            />
            {showNoShow ? (
              <SecondaryButton
                label="Passageiro não apareceu"
                onPress={handleOpenCancelDialog}
                {...(compactHeight ? {} : { size: 'prominent' as const })}
                testID="no-show-button"
              />
            ) : null}
          </FooterActions>
        }
        testID="corrida-screen"
      >
        <View style={styles.content}>
          <NetworkBanner testID="corrida-network-banner" />
          <ScreenHeader title="Embarque" rightSlot={<MoreOptionsButton onPress={handleMoreOptions} />} testID="corrida-header" />

          {loading ? (
            <View style={styles.cardLoading} testID="corrida-carregando">
              <LoadingSkeleton variant="circle" height={56} />
              <LoadingSkeleton variant="line" width={160} />
              <LoadingSkeleton variant="block" height={88} />
            </View>
          ) : (
            <>
              <SurfaceRaised style={styles.card} testID="corrida-cartao-passageira">
                <View style={styles.passengerHeaderRow}>
                  <Avatar name={passengerName} size="lg" />
                  <View style={styles.passengerHeaderText}>
                    <Text style={styles.passengerNameLarge} numberOfLines={2}>
                      {passengerName}
                    </Text>
                    <Text style={styles.waitingText} testID="corrida-tempo-espera">
                      Aguardando há {formatElapsedClock(elapsedSinceArrival)}
                    </Text>
                  </View>
                </View>
                <View style={styles.cardDivider} />
                <View style={styles.routeRow}>
                  <View style={[styles.dot, { backgroundColor: tokens.color.map.pickup }]} />
                  <View style={styles.routeTextBlock}>
                    <Text style={styles.routeLabel}>Embarque</Text>
                    <Text style={styles.routeValue} numberOfLines={2}>
                      {pickupAddress} · {MOCK_PICKUP_NEIGHBORHOOD}
                    </Text>
                  </View>
                </View>
                <View style={styles.routeRow}>
                  <MapPin size={16} color={tokens.color.map.destination} strokeWidth={2} />
                  <View style={styles.routeTextBlock}>
                    <Text style={styles.routeLabel}>Destino</Text>
                    <Text style={styles.routeValue} numberOfLines={2}>
                      {destinationLabel}
                    </Text>
                  </View>
                </View>
              </SurfaceRaised>

              {showCode ? (
                <View style={styles.codeBlock} testID="corrida-codigo-embarque">
                  <CodeInput
                    label="Código de embarque"
                    length={4}
                    value={code}
                    onChangeText={setCode}
                    error={Boolean(codeError)}
                    testID="corrida-codigo-input"
                    {...(codeError ? { errorMessage: codeError } : { helperText: 'Peça o código ao passageiro.' })}
                  />
                </View>
              ) : null}

              {rateLimited ? (
                <InlineAlert tone="danger" message="Muitas tentativas. Fale com o suporte." testID="corrida-bloqueado">
                  <PrimaryButton label="Ir para o suporte" onPress={handleSupport} testID="corrida-bloqueado-suporte" />
                </InlineAlert>
              ) : null}

              <MockBadge label="corrida de demonstração" testID="corrida-mock-badge" />
            </>
          )}
        </View>

        <MoreOptionsSheet
          visible={moreOptionsVisible}
          onClose={() => setMoreOptionsVisible(false)}
          onCancelRide={handleOpenCancelDialog}
          onSupport={handleSupport}
          testID="corrida-mais-opcoes"
        />
        <ConfirmDialog
          visible={cancelDialogVisible}
          title="Cancelar a corrida?"
          description="O passageiro volta para a fila e outro motorista é chamado."
          confirmLabel="Cancelar corrida"
          cancelLabel="Continuar"
          destructive
          loading={cancelling}
          onConfirm={handleConfirmCancel}
          onCancel={() => setCancelDialogVisible(false)}
          testID="corrida-cancelar-dialog"
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      scroll
      glow
      footer={
        <FooterActions testID="corrida-footer">
          <PrimaryButton
            label="Navegar até o destino"
            icon={<Navigation size={20} color={theme.role.ctaText} strokeWidth={2.25} />}
            onPress={() => void handleNavigateToDestination()}
            testID="navigate-destination-button"
          />
          <SecondaryButton
            label="Finalizar corrida"
            icon={<Check size={20} color={theme.role.textPrimary} strokeWidth={2.25} />}
            onPress={() => setFinishDialogVisible(true)}
            disabled={offline}
            size="prominent"
            accessibilityLabel={offline ? 'Finalizar corrida, indisponível: sem conexão' : 'Finalizar corrida'}
            testID="finish-ride-button"
          />
        </FooterActions>
      }
      testID="corrida-screen"
    >
      <View style={styles.content}>
        <NetworkBanner testID="corrida-network-banner" />
        <ScreenHeader title="Corrida em andamento" rightSlot={<MoreOptionsButton onPress={handleMoreOptions} />} testID="corrida-header" />

        {devEstado === 'sem-permissao' ? (
          <InlineAlert tone="warning" message="Sem a sua localização, o passageiro não acompanha a corrida." testID="corrida-sem-permissao">
            <SecondaryButton label="Abrir ajustes" onPress={handleOpenSettings} testID="corrida-abrir-ajustes" />
          </InlineAlert>
        ) : null}

        {loading ? (
          <View style={styles.cardLoading} testID="corrida-carregando">
            <LoadingSkeleton variant="circle" height={48} />
            <LoadingSkeleton variant="block" height={88} />
            <LoadingSkeleton variant="block" height={56} />
          </View>
        ) : (
          <>
            <SurfaceRaised style={styles.card} testID="corrida-cartao-destino">
              <View style={styles.passengerHeaderRow}>
                <Avatar name={passengerName} size="md" />
                <Text style={styles.passengerName} numberOfLines={1}>
                  {passengerName}
                </Text>
              </View>
              <View style={styles.cardDivider} />
              <View style={styles.routeRow}>
                <View style={[styles.dot, { backgroundColor: tokens.color.map.pickup, opacity: 0.5 }]} />
                <Text style={styles.routeMuted} numberOfLines={1}>
                  Embarque: {MOCK_PICKUP_NEIGHBORHOOD}
                </Text>
              </View>
              <View style={styles.routeRow}>
                <MapPin size={16} color={tokens.color.map.destination} strokeWidth={2} />
                <Text style={styles.routeValue} numberOfLines={2}>
                  {destinationLabel}
                </Text>
              </View>
              <View style={styles.cardDivider} />
              <View style={styles.valueRow}>
                <Text style={styles.valueLabel}>Tempo estimado</Text>
                <Text style={styles.valueAmount}>{formatPickupEta(MOCK_TRIP_DURATION_S)}</Text>
              </View>
              <View style={styles.valueRow}>
                <Text style={styles.valueLabel}>Distância</Text>
                <Text style={styles.valueAmount}>{formatDistanceKm(MOCK_TRIP_DISTANCE_M)}</Text>
              </View>
            </SurfaceRaised>

            {navError ? (
              <InlineAlert tone="info" title="Não encontramos um app de navegação." message={destinationLabel} testID="corrida-sem-app-navegacao" />
            ) : null}

            <MockBadge label="corrida de demonstração" testID="corrida-mock-badge" />
          </>
        )}
      </View>

      <MoreOptionsSheet
        visible={moreOptionsVisible}
        onClose={() => setMoreOptionsVisible(false)}
        onEmergencyCall={handleEmergencyCall}
        onSupport={handleSupport}
        testID="corrida-mais-opcoes"
      />
      <ConfirmDialog
        visible={finishDialogVisible}
        title="Finalizar a corrida?"
        description={farFromDestination ? `Confirme a chegada ao destino. Você está a ${formatPickupDistance(650)} do destino.` : 'Confirme a chegada ao destino.'}
        confirmLabel="Finalizar"
        cancelLabel="Voltar"
        loading={finishLoading}
        onConfirm={handleConfirmFinish}
        onCancel={() => setFinishDialogVisible(false)}
        testID="corrida-finalizar-dialog"
      />
    </AppShell>
  );
}

const FOCUS_RING = focusRingStyle('inside', theme.radius.md);

const MoreOptionsButton = memo(function MoreOptionsButton({ onPress }: { readonly onPress: () => void }) {
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Mais opções"
      hitSlop={8}
      style={[styles.moreButton, focusVisible && FOCUS_RING]}
    >
      <MoreHorizontal size={24} color={theme.role.textPrimary} strokeWidth={1.75} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  enRouteContent: { flex: 1 },
  mapBlock: { flex: 1, position: 'relative', overflow: 'hidden' },
  mapFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  topCard: {
    position: 'absolute',
    top: theme.spacing['4'],
    left: theme.layout.screenPadding,
    right: theme.layout.screenPadding,
    backgroundColor: theme.role.glassOnMap,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: tokens.color.map.balloonBorderTop,
    borderColor: tokens.color.map.balloonBorderBase,
    boxShadow: theme.elevation['2'],
    padding: theme.spacing['3'],
    gap: 2,
  },
  topCardLabel: { color: theme.role.textMuted, ...textStyle('medium', 'caption') },
  topCardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing['2'] },
  topCardTextBlock: { flex: 1, gap: 2 },
  topCardAddress: { color: theme.role.textPrimary, ...textStyle('semibold', 'subtitle') },
  topCardNeighborhood: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  moreButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  panel: {
    backgroundColor: theme.role.surface,
    borderTopLeftRadius: theme.radius.xxl,
    borderTopRightRadius: theme.radius.xxl,
    boxShadow: theme.elevation['3'],
    paddingTop: theme.spacing['3'],
    paddingBottom: theme.spacing['5'],
    gap: theme.spacing['3'],
  },
  handle: {
    alignSelf: 'center',
    width: theme.layout.sheetHandleWidth,
    height: theme.layout.sheetHandleHeight,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.role.borderControl,
    marginBottom: theme.spacing['1'],
  },
  panelLoading: { gap: theme.spacing['3'] },
  panelTitle: { color: theme.role.textPrimary, ...textStyle('bold', 'title'), ...tabularNums },
  passengerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['3'] },
  passengerName: { flex: 1, color: theme.role.textPrimary, ...textStyle('semibold', 'body') },
  actionsColumn: { gap: theme.spacing['3'] },
  cardLoading: { gap: theme.spacing['3'] },
  card: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
    gap: theme.spacing['3'],
  },
  cardDivider: { height: 1, backgroundColor: theme.role.edgeBottom },
  passengerHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['3'] },
  passengerHeaderText: { flex: 1, gap: 2 },
  passengerNameLarge: { color: theme.role.textPrimary, ...textStyle('bold', 'subtitle') },
  waitingText: { color: theme.role.textSecondary, ...textStyle('medium', 'caption'), ...tabularNums },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing['2'] },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  routeTextBlock: { flex: 1, gap: 2 },
  routeLabel: { color: theme.role.textMuted, ...textStyle('medium', 'caption') },
  routeValue: { flex: 1, color: theme.role.textPrimary, ...textStyle('semibold', 'body') },
  routeMuted: { flex: 1, color: theme.role.textMuted, ...textStyle('regular', 'small') },
  codeBlock: { gap: theme.spacing['2'] },
  valueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  valueLabel: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  valueAmount: { color: theme.role.textPrimary, ...textStyle('bold', 'body'), ...tabularNums },
});
