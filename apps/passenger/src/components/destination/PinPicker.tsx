import { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Circle, MapPin } from 'lucide-react-native';
import type { Place } from '@vuumbora/domain';
import type { ApiError } from '@vuumbora/api-client';
import type { LatLng, ReverseGeocodeResult } from '@vuumbora/api-client/passenger';
import {
  AppShell,
  FooterActions,
  InlineAlert,
  LinkButton,
  MapPreviewBackground,
  MockBadge,
  NetworkBanner,
  PrimaryButton,
  ScreenHeader,
  focusRingStyle,
  theme,
  textStyle,
  tokens,
  useKeyboardFocusRing,
  useNetworkStatus,
} from '@vuumbora/ui';
import { geoPort } from '../../geo/geoClient';
import { offsetByMeters, placeFromConfirmedPin } from '../../geo/geoFormat';
import { describeGeoProblem } from '../../geo/geoProblems';

/** Passo de cada seta enquanto o mapa é ilustrativo (sem arrastar o mapa de verdade, C-12). */
const NUDGE_STEP_M = 50;
/** Espera depois do último toque nas setas antes de perguntar o endereço ao servidor. */
const REVERSE_DEBOUNCE_MS = 350;
const MAP_HEIGHT_RATIO = 0.38;
const MAP_MIN_HEIGHT = 200;
const MAP_MAX_HEIGHT = 360;
const NUDGE_FOCUS_RING = focusRingStyle('outside', theme.radius.md);

export interface PinPickerProps {
  readonly field: 'origin' | 'destination';
  /** Onde o pino começa. Sem ponto, o centro da área atendida (`geoPort.serviceArea`). */
  readonly initialPoint?: LatLng | undefined;
  /** Lugar de onde o pino partiu (resultado da busca): mantém o endereço completo se o servidor reconhecer o mesmo lugar. */
  readonly startPlace?: Place | undefined;
  readonly onConfirm: (place: Place) => void;
  readonly onCancel: () => void;
  /** "Entrar de novo" quando a sessão expirou no meio da confirmação. */
  readonly onSignIn: () => void;
}

type Lookup =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly result: ReverseGeocodeResult }
  | { readonly status: 'error'; readonly error: ApiError };

/**
 * Confirmação do PONTO no pino (N6 do `docs/plano-m3-m4.md`: pino com confirmação SEMPRE). Todo ponto vindo da busca, e o
 * "Escolher no mapa", passa por aqui: o pino fica no centro, o servidor diz o endereço daquele ponto (`geoPort.reverse`) e
 * só esse endereço confirmado vira origem/destino — nunca só a coordenada, nunca o texto da busca sem conferir.
 *
 * Enquanto o mapa é o fundo ilustrativo (até o Mapbox nativo, C-12), ajustar o ponto é pelas setas (50 m por toque).
 * Isso também é a alternativa acessível ao arrasto que o mapa real vai precisar ter (WCAG 2.5.7).
 *
 * Ponto fora da área atendida (`inServiceArea: false`) não confirma: a pessoa vê o motivo antes de cotar.
 */
export function PinPicker({ field, initialPoint, startPlace, onConfirm, onCancel, onSignIn }: PinPickerProps) {
  const online = useNetworkStatus();
  const { height: windowHeight } = useWindowDimensions();
  const mapHeight = Math.min(MAP_MAX_HEIGHT, Math.max(MAP_MIN_HEIGHT, Math.round(windowHeight * MAP_HEIGHT_RATIO)));

  const [point, setPoint] = useState<LatLng | undefined>(initialPoint);
  const [areaError, setAreaError] = useState<ApiError | undefined>(undefined);
  const [areaAttempt, setAreaAttempt] = useState(0);
  const [lookup, setLookup] = useState<Lookup>({ status: 'loading' });
  const [lookupAttempt, setLookupAttempt] = useState(0);

  // Sem ponto de partida: o centro da área atendida, do servidor.
  useEffect(() => {
    if (point) return;
    let cancelled = false;
    setAreaError(undefined);
    geoPort.serviceArea().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setAreaError(result.error);
        return;
      }
      const [west, south, east, north] = result.data.bbox;
      setPoint({ lat: (south + north) / 2, lng: (west + east) / 2 });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaAttempt]);

  // O endereço do ponto, sempre do servidor; o último toque nas setas é o que vale. A PRIMEIRA leitura sai na hora (não
  // há o que esperar); só as setas esperam a pessoa parar de tocar.
  const firstLookupDone = useRef(false);
  useEffect(() => {
    if (!point) return;
    let cancelled = false;
    setLookup({ status: 'loading' });
    const delay = firstLookupDone.current ? REVERSE_DEBOUNCE_MS : 0;
    firstLookupDone.current = true;
    const timer = setTimeout(async () => {
      const result = await geoPort.reverse(point);
      if (cancelled) return;
      setLookup(result.ok ? { status: 'ready', result: result.data } : { status: 'error', error: result.error });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [point, lookupAttempt]);

  // Android: o voltar físico sai do pino (volta para a busca), não da tela inteira.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => subscription.remove();
  }, [onCancel]);

  function nudge(northM: number, eastM: number) {
    if (!point) return;
    setPoint(offsetByMeters(point, northM, eastM));
  }

  const ready = lookup.status === 'ready' ? lookup.result : undefined;
  const outsideArea = ready !== undefined && !ready.inServiceArea;
  const canConfirm = online && ready !== undefined && ready.inServiceArea;
  const problem = lookup.status === 'error' ? describeGeoProblem(lookup.error, 'pin') : areaError ? describeGeoProblem(areaError, 'pin') : undefined;

  const balloonText = !point
    ? areaError
      ? 'Não conseguimos abrir o mapa.'
      : 'Abrindo o mapa…'
    : lookup.status === 'loading'
      ? 'Buscando o endereço deste ponto…'
      : ready
        ? ready.label
        : 'Endereço não encontrado.';

  const disabledReason = !online
    ? 'sem conexão'
    : outsideArea
      ? 'o ponto está fora da área atendida'
      : lookup.status === 'loading'
        ? 'buscando o endereço'
        : 'o endereço não foi encontrado';

  function handleConfirm() {
    if (!canConfirm || !ready) return;
    onConfirm(placeFromConfirmedPin(ready, startPlace));
  }

  function handleProblemAction() {
    if (!problem) return;
    if (problem.action === 'sign_in') {
      onSignIn();
      return;
    }
    if (areaError) setAreaAttempt((value) => value + 1);
    else setLookupAttempt((value) => value + 1);
  }

  return (
    <AppShell
      scroll
      glow
      footer={
        <FooterActions testID="pin-footer">
          <PrimaryButton
            label="Confirmar este local"
            icon={<MapPin size={20} color={theme.role.ctaText} strokeWidth={2.25} />}
            onPress={handleConfirm}
            disabled={!canConfirm}
            accessibilityLabel={canConfirm ? `Confirmar este local: ${ready?.label ?? ''}` : `Confirmar este local, indisponível: ${disabledReason}`}
            testID="pin-confirm-button"
          />
        </FooterActions>
      }
    >
      <View style={styles.content}>
        <ScreenHeader title="Confirme o local" onBack={onCancel} testID="pin-header" />
        <NetworkBanner testID="pin-network-banner" />

        <View
          style={[styles.map, { height: mapHeight }]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Mapa ilustrativo com o ${field === 'origin' ? 'ponto de partida' : 'destino'} marcado. ${balloonText}`}
          testID="pin-map"
        >
          <MapPreviewBackground />
          <View style={styles.mockTag}>
            <MockBadge label="mapa ilustrativo" />
          </View>
          <View style={styles.markerLayer} pointerEvents="none">
            <View style={styles.balloon} accessibilityLiveRegion="polite">
              <Text style={styles.balloonText} numberOfLines={2} testID="pin-address">
                {balloonText}
              </Text>
            </View>
            {/* A ponta do pino fica no centro exato do mapa. */}
            {field === 'destination' ? (
              <View style={styles.destinationPin}>
                <MapPin size={36} color={tokens.color.map.destination} fill={tokens.color.map.destination} strokeWidth={1.5} />
              </View>
            ) : (
              <View style={styles.originPin}>
                <Circle size={20} color={theme.role.ctaText} fill={tokens.color.map.pickup} strokeWidth={2.5} />
              </View>
            )}
          </View>
        </View>

        <Text style={styles.hint}>Confira o endereço no balão. Se o ponto não estiver certo, ajuste com as setas.</Text>

        {outsideArea ? (
          <InlineAlert
            tone="warning"
            title="Este ponto fica fora da área atendida."
            message="Por enquanto, atendemos só a Grande Natal. Escolha um ponto dentro da cidade."
            testID="pin-outside-area"
          />
        ) : null}

        {problem ? (
          <View style={styles.problem}>
            <InlineAlert tone="danger" title={problem.title} message={problem.description} testID={`pin-problem-${problem.key}`} />
            <LinkButton label={problem.actionLabel} onPress={handleProblemAction} role="button" align="flex-start" testID="pin-problem-action" />
          </View>
        ) : null}

        <View style={styles.nudgeSection}>
          <Text style={styles.nudgeTitle}>Ajustar o ponto</Text>
          <View style={styles.nudgeRow}>
            <NudgeButton label="Mover o ponto para a esquerda" icon={ArrowLeft} onPress={() => nudge(0, -NUDGE_STEP_M)} disabled={!point} testID="pin-nudge-left" />
            <NudgeButton label="Mover o ponto para cima" icon={ArrowUp} onPress={() => nudge(NUDGE_STEP_M, 0)} disabled={!point} testID="pin-nudge-up" />
            <NudgeButton label="Mover o ponto para baixo" icon={ArrowDown} onPress={() => nudge(-NUDGE_STEP_M, 0)} disabled={!point} testID="pin-nudge-down" />
            <NudgeButton label="Mover o ponto para a direita" icon={ArrowRight} onPress={() => nudge(0, NUDGE_STEP_M)} disabled={!point} testID="pin-nudge-right" />
          </View>
        </View>
      </View>
    </AppShell>
  );
}

function NudgeButton({
  label,
  icon: Icon,
  onPress,
  disabled,
  testID,
}: {
  readonly label: string;
  readonly icon: typeof ArrowUp;
  readonly onPress: () => void;
  readonly disabled: boolean;
  readonly testID: string;
}) {
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.nudgeButton, pressed && styles.nudgeButtonPressed, disabled && styles.nudgeButtonDisabled, focusVisible && NUDGE_FOCUS_RING]}
      testID={testID}
    >
      <Icon size={20} color={theme.role.textPrimary} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  map: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.role.border,
    backgroundColor: theme.role.surfaceElevated,
  },
  // Embaixo: em cima fica o balão do endereço, que pode ter 2 linhas.
  mockTag: { position: 'absolute', bottom: theme.spacing['2'], left: theme.spacing['2'], zIndex: 2 },
  // Camada cheia: o balão fica logo acima do centro e o pino aponta para o centro exato.
  markerLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center' },
  balloon: {
    position: 'absolute',
    bottom: '50%',
    marginBottom: 44,
    maxWidth: '86%',
    backgroundColor: tokens.color.map.balloon,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderTopColor: tokens.color.map.balloonBorderTop,
    borderColor: tokens.color.map.balloonBorderBase,
    paddingHorizontal: theme.spacing['3'],
    paddingVertical: theme.spacing['2'],
  },
  balloonText: { color: theme.role.textPrimary, ...textStyle('medium', 'small'), textAlign: 'center' },
  destinationPin: { position: 'absolute', top: '50%', marginTop: -36 },
  originPin: { position: 'absolute', top: '50%', marginTop: -10 },
  hint: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  problem: { gap: theme.spacing['1'] },
  nudgeSection: { gap: theme.spacing['2'] },
  nudgeTitle: { color: theme.role.textPrimary, ...textStyle('semibold', 'small') },
  nudgeRow: { flexDirection: 'row', gap: theme.spacing['2'] },
  nudgeButton: {
    width: theme.layout.touchTarget,
    height: theme.layout.touchTarget,
    borderRadius: theme.radius.md,
    backgroundColor: theme.role.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.role.borderControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeButtonPressed: { backgroundColor: theme.role.surface },
  nudgeButtonDisabled: { opacity: 0.5 },
});
