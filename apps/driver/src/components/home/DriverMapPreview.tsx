import { memo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Car, LocateFixed, MapPin, Minus, Plus } from 'lucide-react-native';
import { MapPreviewBackground, MockBadge, theme, textStyle, tokens } from '@vuumbora/ui';

export interface DriverMapPreviewProps {
  readonly cityLabel: string;
  readonly onPressLocate?: () => void;
  readonly onPressZoomIn?: () => void;
  readonly onPressZoomOut?: () => void;
}

const MAP_HEIGHT = 220;
const CAR_RING_SIZE = 40;
const PIN_ICON_SIZE = 24;

// Pontos do trajeto em FRAÇÃO da largura/altura do card (0–1), não pixel fixo — o
// card ocupa a largura inteira do conteúdo (que muda por breakpoint), então um
// pixel fixo (desenho antigo) desalinhava carro/pino/rota fora do card de
// referência. Zigzag com 4 segmentos, igual à geometria da referência
// motorista-home-alvo.webp (item 5): carro embaixo à esquerda, pino em cima à direita.
const ROUTE_POINTS_FRACTION: ReadonlyArray<readonly [number, number]> = [
  [0.2, 0.68],
  [0.38, 0.68],
  [0.47, 0.5],
  [0.6, 0.5],
  [0.68, 0.32],
  [0.78, 0.32],
];

/**
 * Mapa placeholder da Home do motorista — mesma decisão do passageiro (SDK de mapa
 * ainda NÃO escolhido, `docs/decisions.md`). Fundo é o asset estático
 * `mapa-escuro-motorista.jpg` (`MapPreviewBackground` variant="motorista", mesmo
 * componente do passageiro — ver `[[project_vuumbora_overview]]`); rota, pino de
 * embarque e marcador do carro são **SVG** (`react-native-svg`, primeiro uso no
 * projeto) desenhados por cima, calculados a partir da largura real do card — fica
 * dinâmico (refaz o traçado) quando o SDK de mapa de verdade chegar, em vez de ser
 * uma imagem achatada de rota.
 */
export const DriverMapPreview = memo(function DriverMapPreview({
  cityLabel,
  onPressLocate,
  onPressZoomIn,
  onPressZoomOut,
}: DriverMapPreviewProps) {
  const { width: windowWidth } = useWindowDimensions();
  // Largura real do conteúdo dentro do AppShell (padding igual nos dois lados) —
  // mesma conta que o resto do app usa para breakpoint, aqui para geometria de SVG.
  const cardWidth = windowWidth - 2 * theme.layout.screenPadding;

  const points = ROUTE_POINTS_FRACTION.map(([fx, fy]) => [fx * cardWidth, fy * MAP_HEIGHT] as const);
  const pathD = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [carX, carY] = points[0]!;
  const [pinX, pinY] = points[points.length - 1]!;

  return (
    <View
      style={styles.root}
      accessibilityRole="image"
      accessibilityLabel={`Mapa ilustrativo (mock) de ${cityLabel}, com trajeto até o embarque`}
    >
      <MapPreviewBackground variant="motorista" />

      <View style={styles.mockTag}>
        <MockBadge label="mapa ilustrativo" />
      </View>

      <Svg width={cardWidth} height={MAP_HEIGHT} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path d={pathD} stroke={tokens.color.map.route} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>

      <View style={[styles.pickupPin, { left: pinX - PIN_ICON_SIZE / 2, top: pinY - PIN_ICON_SIZE }]}>
        <MapPin size={PIN_ICON_SIZE} color={tokens.color.map.pickup} strokeWidth={2} fill={tokens.color.map.pickup} />
      </View>

      <View style={[styles.carMarkerRing, { left: carX - CAR_RING_SIZE / 2, top: carY - CAR_RING_SIZE / 2 }]}>
        <View style={styles.carMarkerDot}>
          <Car size={14} color={theme.role.ctaText} strokeWidth={2.25} />
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable onPress={onPressLocate} accessibilityRole="button" accessibilityLabel="Centralizar no local atual" style={styles.controlButton}>
          <LocateFixed size={18} color={theme.role.textPrimary} strokeWidth={2} />
        </Pressable>
        <View style={styles.zoomGroup}>
          <Pressable onPress={onPressZoomIn} accessibilityRole="button" accessibilityLabel="Aproximar mapa" style={styles.zoomButton}>
            <Plus size={16} color={theme.role.textPrimary} strokeWidth={2.25} />
          </Pressable>
          <View style={styles.zoomDivider} />
          <Pressable onPress={onPressZoomOut} accessibilityRole="button" accessibilityLabel="Afastar mapa" style={styles.zoomButton}>
            <Minus size={16} color={theme.role.textPrimary} strokeWidth={2.25} />
          </Pressable>
        </View>
      </View>

      <View style={styles.cityChip}>
        <MapPin size={14} color={theme.role.textSecondary} strokeWidth={2} />
        <Text style={styles.cityText} numberOfLines={1}>
          {cityLabel}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    height: MAP_HEIGHT,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.role.surfaceElevated,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.role.border,
  },
  mockTag: { position: 'absolute', top: theme.spacing['2'], left: theme.spacing['2'], zIndex: 2 },
  pickupPin: { position: 'absolute' },
  carMarkerRing: {
    position: 'absolute',
    width: CAR_RING_SIZE,
    height: CAR_RING_SIZE,
    borderRadius: CAR_RING_SIZE / 2,
    backgroundColor: tokens.color.map.userLocation,
    opacity: 0.25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carMarkerDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.color.map.userLocation,
    borderWidth: 2,
    borderColor: theme.role.ctaText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: {
    position: 'absolute',
    top: theme.spacing['3'],
    right: theme.spacing['3'],
    alignItems: 'center',
    gap: theme.spacing['2'],
  },
  controlButton: {
    width: theme.layout.touchTarget,
    height: theme.layout.touchTarget,
    borderRadius: theme.layout.touchTarget / 2,
    backgroundColor: theme.role.glassOnMap,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.role.border,
  },
  zoomGroup: {
    borderRadius: theme.layout.touchTarget / 2,
    backgroundColor: theme.role.glassOnMap,
    borderWidth: 1,
    borderColor: theme.role.border,
    overflow: 'hidden',
  },
  // Largura/altura explícitas no FILHO (não herdadas do pai) — bug já visto: com
  // borderWidth no pai, o filho esticado mede 2px a menos que os 44px exigidos.
  zoomButton: { width: theme.layout.touchTarget, height: theme.layout.touchTarget, alignItems: 'center', justifyContent: 'center' },
  zoomDivider: { height: 1, backgroundColor: theme.role.border },
  cityChip: {
    position: 'absolute',
    bottom: theme.spacing['3'],
    left: theme.spacing['3'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.role.glassOnMap,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing['3'],
    paddingVertical: theme.spacing['2'],
    borderWidth: 1,
    borderColor: theme.role.border,
  },
  cityText: { color: theme.role.textPrimary, ...textStyle('medium', 'small') },
});
