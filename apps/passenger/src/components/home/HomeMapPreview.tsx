import { memo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LocateFixed, MapPin, Minus, Plus } from 'lucide-react-native';
import { MapPreviewBackground, MockBadge, theme, textStyle, tokens } from '@vuumbora/ui';

// Mesmo corte do `AppShell` (`layout.screenPaddingCompact` abaixo de 375pt) — o sangramento
// horizontal precisa cancelar EXATAMENTE o padding que o `AppShell` aplicou, senão sobra (ou
// falta) 4pt e a borda do mapa não encosta na tela (G-09: elemento vazando a viewport).
const COMPACT_WIDTH_BREAKPOINT = 375;

export interface HomeMapPreviewProps {
  readonly cityLabel: string;
  readonly currentAddress: string;
  readonly landmarkLabel?: string;
  readonly onPressLocate?: () => void;
  readonly onPressZoomIn?: () => void;
  readonly onPressZoomOut?: () => void;
  /**
   * Ficha P03 §2: "mapa sangrando até a borda e o pé" — cresce para ocupar a sobra vertical
   * (`flex`, dentro do `ScrollView` com `flexGrow` do `AppShell`) e perde o raio/moldura de
   * baixo, para colar nas bordas da tela em vez de ficar num cartão fechado. Quem posiciona o
   * sangramento horizontal é o chamador (`index.tsx`, margem negativa = `screenPadding`).
   */
  readonly bleed?: boolean;
}

/**
 * Mapa placeholder — SDK de mapa ainda NÃO escolhido (docs/decisions.md). Fundo:
 * `MapPreviewBackground` (asset `mapa-escuro-natal.jpg`, direção de arte §7.1/§9 item 7) —
 * NÃO é dado geográfico real, é ilustração procedural de malha urbana. Chips sobre o
 * mapa (rótulo de cidade, marco, controles, chip de endereço) usam `theme.role.glassOnMap`
 * (opaco, sem blur — ver docs/direcao-de-arte.md §5) para ficarem legíveis sobre a foto.
 * Fica em apps/passenger porque os rótulos (cidade, marco) são conteúdo deste mock
 * específico — o adaptador de mapa de verdade (MapView/RouteOverlay/LocationMarker) é
 * decisão futura de arquitetura, não algo a improvisar aqui.
 */
export const HomeMapPreview = memo(function HomeMapPreview({
  cityLabel,
  currentAddress,
  landmarkLabel,
  onPressLocate,
  onPressZoomIn,
  onPressZoomOut,
  bleed = false,
}: HomeMapPreviewProps) {
  const { width } = useWindowDimensions();
  const bleedMargin = width < COMPACT_WIDTH_BREAKPOINT ? theme.layout.screenPaddingCompact : theme.layout.screenPadding;

  return (
    <View
      style={[styles.root, bleed && [styles.rootBleed, { marginHorizontal: -bleedMargin, marginBottom: -bleedMargin }]]}
      accessibilityRole="image"
      accessibilityLabel={`Mapa ilustrativo (mock) de ${cityLabel}`}
    >
      <MapPreviewBackground />

      <View style={styles.mockTag}>
        <MockBadge label="mapa ilustrativo" />
      </View>

      <View style={styles.cityChip}>
        <Text style={styles.cityLabel}>{cityLabel}</Text>
      </View>

      {landmarkLabel ? (
        <View style={[styles.landmark, styles.glassChip]}>
          <MapPin size={16} color={theme.role.warning} strokeWidth={2} fill={theme.role.warning} />
          <Text style={styles.landmarkLabel}>{landmarkLabel}</Text>
        </View>
      ) : null}

      <View style={styles.centerMarkerLayer} pointerEvents="none">
        <View style={styles.centerMarkerRing}>
          <View style={styles.centerMarkerDot} />
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

      <View style={styles.addressChip}>
        <MapPin size={14} color={theme.role.textSecondary} strokeWidth={2} />
        <Text style={styles.addressText} numberOfLines={1}>
          {currentAddress}
        </Text>
      </View>
    </View>
  );
});

const MAP_HEIGHT = 260;

const styles = StyleSheet.create({
  root: {
    height: MAP_HEIGHT,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.role.surfaceElevated,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.role.border,
  },
  // Sangramento (ficha P03 §2): some a moldura de baixo e os cantos de baixo, e cresce para
  // ocupar a sobra vertical em vez de uma altura fixa — mas nunca abaixo de `MAP_HEIGHT`
  // (320×568, onde não há sobra para crescer).
  rootBleed: {
    height: undefined,
    flex: 1,
    minHeight: MAP_HEIGHT,
    borderBottomWidth: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  mockTag: { position: 'absolute', top: theme.spacing['2'], right: theme.spacing['2'], zIndex: 2 },
  // Chip translúcido sobre o mapa (direção de arte §5/§9 item 7, `theme.role.glassOnMap`)
  // — opaco, SEM blur. Precisa de fundo próprio porque o mapa agora é foto/ilustração
  // (antes era `surfaceElevated` chapado, e o texto flutuava direto sobre ele).
  glassChip: {
    backgroundColor: theme.role.glassOnMap,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing['2'],
    paddingVertical: 4,
  },
  cityChip: {
    position: 'absolute',
    top: theme.spacing['3'],
    left: theme.spacing['3'],
    backgroundColor: theme.role.glassOnMap,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing['2'],
    paddingVertical: 4,
  },
  cityLabel: {
    color: theme.role.textPrimary,
    ...textStyle('bold', 'subtitle'),
  },
  landmark: {
    position: 'absolute',
    top: theme.spacing['8'],
    left: theme.spacing['3'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  landmarkLabel: { color: theme.role.textSecondary, ...textStyle('medium', 'caption') },
  // Camada cheia + `alignItems`/`justifyContent` centra o pino de verdade (meio exato da área
  // visível), em vez de um `top` fixo em px que só batia com `MAP_HEIGHT`: no sangramento
  // (`bleed`, altura variável por `flex`) o pino ficaria fora do centro.
  centerMarkerLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  centerMarkerRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.color.map.userLocation,
    opacity: 0.25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerMarkerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: tokens.color.map.userLocation,
    borderWidth: 2,
    borderColor: theme.role.ctaText,
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
  // Largura explícita (em vez de herdar do pai): com borderWidth no `zoomGroup`, o
  // conteúdo esticado por `alignItems:stretch` mediria 2px a menos que os 44px exigidos
  // (bug de alvo de toque já visto — ver memória bug_touch_target_hitslop_insuficiente).
  zoomButton: { width: theme.layout.touchTarget, height: theme.layout.touchTarget, alignItems: 'center', justifyContent: 'center' },
  zoomDivider: { height: 1, backgroundColor: theme.role.border },
  addressChip: {
    position: 'absolute',
    bottom: theme.spacing['3'],
    left: theme.spacing['3'],
    right: theme.spacing['3'],
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
  addressText: { flex: 1, color: theme.role.textPrimary, ...textStyle('medium', 'small') },
});
