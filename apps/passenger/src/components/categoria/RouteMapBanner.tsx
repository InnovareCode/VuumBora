import { memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { ChevronLeft, Circle, MapPin } from 'lucide-react-native';
import { decodePolyline } from '@vuumbora/domain';
import type { LatLng } from '@vuumbora/api-client/passenger';
import { MapPreviewBackground, MockBadge, theme, textStyle, tokens, focusRingStyle, useKeyboardFocusRing } from '@vuumbora/ui';
import { RouteOverlay, type RouteOverlayInsets } from '../map/RouteOverlay';

// Ficha P05 §2: "320×568: mapa com 168pt" / "390×844: ~380pt" (45% de 844) / "430×932: o mapa
// GANHA A SOBRA; o painel tem a altura do conteúdo". Por isso isto é um `minHeight` + `flex:1`
// (quem decide se sobra espaço pra crescer é o `ScrollView` do chamador, não um valor fixo).
const COMPACT_HEIGHT_BREAKPOINT = 360;
const COMPACT_MAP_HEIGHT = 168;
const MAP_HEIGHT_RATIO = 0.45;
/** Margem dos balões até a borda do mapa. */
const EDGE = theme.spacing['3'];
/** Espaço livre mínimo entre os balões para a rota aparecer de verdade (não só os dois marcadores encostados). */
const MIN_ROUTE_GAP = 64;
/** Respiro entre um balão e o marcador da rota. */
const ROUTE_CLEARANCE = 10;
const SIDE_INSET = 36;

export interface RouteMapBannerProps {
  readonly originAddress: string;
  readonly destinationAddress: string;
  readonly onBack: () => void;
  readonly originPoint?: LatLng | undefined;
  readonly destinationPoint?: LatLng | undefined;
  /** `route.polyline` da cotação (precisão 5). Sem ela (cotando, erro), só os dois pontos aparecem. */
  readonly polyline?: string | undefined;
  /** Distância e tempo da rota, por extenso, para a descrição do mapa (ficha P05 §8). */
  readonly routeDescription?: string | undefined;
  readonly testID?: string;
}

/**
 * Mapa da P05 (ficha §2/§4) sobre o fundo ILUSTRATIVO (`MapPreviewBackground`, sem Mapbox ainda, C-12) + balões de
 * endereço (`map.balloon`, PP-7). Fica em `apps/passenger` porque os balões são conteúdo desta tela.
 *
 * Fatia G6: a rota é a POLILINHA DA COTAÇÃO (`decodePolyline`, precisão 5), desenhada por `RouteOverlay` entre os pontos
 * confirmados. Os balões ficam em COLUNA (origem em cima; selo e destino embaixo), medidos: a rota é encaixada no vão
 * entre eles, e o mapa cresce se os balões (2 linhas cada) não couberem na altura mínima — nada passa por baixo de nada.
 */
// Anel de foco de teclado em volta do balão inteiro (é ele o alvo), FORA dele.
const BACK_FOCUS_RING = focusRingStyle('outside', theme.radius.pill);

export const RouteMapBanner = memo(function RouteMapBanner({
  originAddress,
  destinationAddress,
  onBack,
  originPoint,
  destinationPoint,
  polyline,
  routeDescription,
  testID,
}: RouteMapBannerProps) {
  const { width, height: windowHeight } = useWindowDimensions();
  const specMinHeight = width < COMPACT_HEIGHT_BREAKPOINT ? COMPACT_MAP_HEIGHT : Math.round(windowHeight * MAP_HEIGHT_RATIO);
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [topHeight, setTopHeight] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(0);

  const minMapHeight = Math.max(specMinHeight, EDGE + topHeight + MIN_ROUTE_GAP + bottomHeight + EDGE);

  const routePoints = useMemo(() => {
    if (polyline) {
      const decoded = decodePolyline(polyline).map((point) => ({ lat: point.latitude, lng: point.longitude }));
      if (decoded.length > 0) return decoded;
    }
    return [originPoint, destinationPoint].filter((point): point is LatLng => point !== undefined);
  }, [polyline, originPoint, destinationPoint]);

  const insets = useMemo<RouteOverlayInsets>(
    () => ({
      top: EDGE + topHeight + ROUTE_CLEARANCE,
      bottom: EDGE + bottomHeight + ROUTE_CLEARANCE,
      left: SIDE_INSET,
      right: SIDE_INSET,
    }),
    [topHeight, bottomHeight],
  );

  function handleLayout(event: LayoutChangeEvent) {
    const { width: layoutWidth, height: layoutHeight } = event.nativeEvent.layout;
    setSize((prev) => (prev.width === layoutWidth && prev.height === layoutHeight ? prev : { width: layoutWidth, height: layoutHeight }));
  }

  return (
    <View style={[styles.root, { minHeight: minMapHeight }]} onLayout={handleLayout} testID={testID}>
      <View
        style={StyleSheet.absoluteFill}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Mapa ilustrativo. Rota de ${originAddress} até ${destinationAddress}${routeDescription ? `, ${routeDescription}` : ''}.`}
      >
        <MapPreviewBackground />
        <RouteOverlay points={routePoints} width={size.width} height={size.height} insets={insets} showRoute={polyline !== undefined} />
      </View>

      <View style={styles.overlayColumn} pointerEvents="box-none">
        <View style={styles.topGroup} onLayout={(event) => setTopHeight(Math.round(event.nativeEvent.layout.height))} pointerEvents="box-none">
          <Pressable
            {...focusProps}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={`Voltar e editar o trajeto. Origem: ${originAddress}`}
            style={[styles.balloon, styles.originBalloon, focusVisible && BACK_FOCUS_RING]}
            testID={testID ? `${testID}-back` : undefined}
          >
            <ChevronLeft size={18} color={theme.role.textPrimary} strokeWidth={2.25} style={styles.balloonIcon} />
            <Circle size={14} color={tokens.color.map.pickup} fill={tokens.color.map.pickup} style={styles.balloonIcon} />
            {/* Ficha, "texto longo": endereço quebra em até 2 linhas antes de truncar (nunca 1). */}
            <Text style={styles.balloonText} numberOfLines={2}>
              {originAddress}
            </Text>
          </Pressable>
        </View>

        <View style={styles.bottomGroup} onLayout={(event) => setBottomHeight(Math.round(event.nativeEvent.layout.height))} pointerEvents="box-none">
          <View style={styles.mockTag}>
            <MockBadge label="mapa ilustrativo" />
          </View>
          <View style={styles.balloon} testID={testID ? `${testID}-destination` : undefined}>
            <MapPin size={16} color={tokens.color.map.destination} fill={tokens.color.map.destination} strokeWidth={1.5} style={styles.balloonIcon} />
            <Text style={styles.balloonText} numberOfLines={2}>
              {destinationAddress}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    borderBottomLeftRadius: theme.radius.xxl,
    borderBottomRightRadius: theme.radius.xxl,
  },
  overlayColumn: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    padding: EDGE,
    justifyContent: 'space-between',
  },
  topGroup: { alignItems: 'flex-start' },
  bottomGroup: { gap: theme.spacing['2'] },
  mockTag: { alignSelf: 'flex-end' },
  balloon: {
    flexDirection: 'row',
    // `flex-start` (não `center`): com o endereço em 2 linhas, os ícones ficam alinhados à PRIMEIRA linha.
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
  originBalloon: { maxWidth: '100%', minHeight: theme.layout.touchTarget },
  // Centraliza o ícone na altura da PRIMEIRA linha do texto (`lineHeight` de `small`, 18pt).
  balloonIcon: { marginTop: 2 },
  balloonText: { flexShrink: 1, color: theme.role.textPrimary, ...textStyle('medium', 'small') },
});
