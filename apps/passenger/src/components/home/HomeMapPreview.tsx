import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LocateFixed, MapPin, Minus, Plus } from 'lucide-react-native';
import { MockBadge, theme, textStyle, tokens } from '@vuumbora/ui';

export interface HomeMapPreviewProps {
  readonly cityLabel: string;
  readonly currentAddress: string;
  readonly landmarkLabel?: string;
  readonly onPressLocate?: () => void;
  readonly onPressZoomIn?: () => void;
  readonly onPressZoomOut?: () => void;
}

/**
 * Mapa placeholder — SDK de mapa ainda NÃO escolhido (docs/decisions.md). Reproduz só a
 * GEOMETRIA do mockup (rótulo de cidade, marco, pino central, controles de zoom/localização,
 * chip de endereço) com formas/tokens, sem nenhum dado geográfico real. Fica em
 * apps/passenger porque os rótulos (cidade, marco) são conteúdo deste mock específico — o
 * adaptador de mapa de verdade (MapView/RouteOverlay/LocationMarker) é decisão futura de
 * arquitetura, não algo a improvisar aqui.
 */
export const HomeMapPreview = memo(function HomeMapPreview({
  cityLabel,
  currentAddress,
  landmarkLabel,
  onPressLocate,
  onPressZoomIn,
  onPressZoomOut,
}: HomeMapPreviewProps) {
  return (
    <View style={styles.root} accessibilityRole="image" accessibilityLabel={`Mapa ilustrativo (mock) de ${cityLabel}`}>
      <View style={styles.mockTag}>
        <MockBadge label="mapa ilustrativo" />
      </View>

      <Text style={styles.cityLabel}>{cityLabel}</Text>

      {landmarkLabel ? (
        <View style={styles.landmark}>
          <MapPin size={16} color={theme.role.warning} strokeWidth={2} fill={theme.role.warning} />
          <Text style={styles.landmarkLabel}>{landmarkLabel}</Text>
        </View>
      ) : null}

      {/* Vias decorativas — só geometria, sem dado real de ruas. */}
      <View style={[styles.road, styles.roadDiagonal]} />
      <View style={[styles.road, styles.roadVertical]} />

      <View style={styles.centerMarkerRing}>
        <View style={styles.centerMarkerDot} />
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
  mockTag: { position: 'absolute', top: theme.spacing['2'], right: theme.spacing['2'], zIndex: 2 },
  cityLabel: {
    position: 'absolute',
    top: theme.spacing['3'],
    left: theme.spacing['3'],
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
  road: { position: 'absolute', backgroundColor: theme.role.border },
  roadDiagonal: {
    width: 220,
    height: 2,
    top: 150,
    left: -30,
    transform: [{ rotate: '-18deg' }],
  },
  roadVertical: { width: 2, height: MAP_HEIGHT, left: 70, top: 0 },
  centerMarkerRing: {
    position: 'absolute',
    top: MAP_HEIGHT / 2 - 18,
    left: '48%',
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
    backgroundColor: theme.role.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.role.border,
  },
  zoomGroup: {
    borderRadius: theme.layout.touchTarget / 2,
    backgroundColor: theme.role.surface,
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
    backgroundColor: theme.role.surface,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing['3'],
    paddingVertical: theme.spacing['2'],
    borderWidth: 1,
    borderColor: theme.role.border,
  },
  addressText: { flex: 1, color: theme.role.textPrimary, ...textStyle('medium', 'small') },
});
