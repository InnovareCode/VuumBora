import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Car, LocateFixed, MapPin, Minus, Plus } from 'lucide-react-native';
import { MockBadge, theme, textStyle, tokens } from '@vuumbora/ui';

export interface DriverMapPreviewProps {
  readonly cityLabel: string;
  readonly onPressLocate?: () => void;
  readonly onPressZoomIn?: () => void;
  readonly onPressZoomOut?: () => void;
}

const MAP_HEIGHT = 220;

/**
 * Mapa placeholder da Home do motorista — mesma decisão do passageiro (SDK de mapa
 * ainda NÃO escolhido, `docs/decisions.md`). Reproduz só a GEOMETRIA (carro, pino de
 * embarque, trajeto, controles de zoom/localização, chip de cidade) com formas/tokens,
 * sem nenhum dado geográfico real.
 */
export const DriverMapPreview = memo(function DriverMapPreview({
  cityLabel,
  onPressLocate,
  onPressZoomIn,
  onPressZoomOut,
}: DriverMapPreviewProps) {
  return (
    <View
      style={styles.root}
      accessibilityRole="image"
      accessibilityLabel={`Mapa ilustrativo (mock) de ${cityLabel}, com trajeto até o embarque`}
    >
      <View style={styles.mockTag}>
        <MockBadge label="mapa ilustrativo" />
      </View>

      {/* Vias decorativas — só geometria, sem dado real de ruas. */}
      <View style={[styles.road, styles.roadDiagonal]} />
      <View style={[styles.road, styles.roadVertical]} />

      {/* Trajeto até o embarque — cor de rota do token de mapa, só geometria ilustrativa. */}
      <View style={styles.route} />

      <View style={styles.pickupPin}>
        <MapPin size={24} color={tokens.color.map.pickup} strokeWidth={2} fill={tokens.color.map.pickup} />
      </View>

      <View style={styles.carMarkerRing}>
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
  road: { position: 'absolute', backgroundColor: theme.role.border },
  roadDiagonal: { width: 220, height: 2, top: 70, left: -30, transform: [{ rotate: '-16deg' }] },
  roadVertical: { width: 2, height: MAP_HEIGHT, left: 60, top: 0 },
  route: {
    position: 'absolute',
    width: 140,
    height: 4,
    borderRadius: 2,
    top: MAP_HEIGHT / 2 - 4,
    left: 70,
    backgroundColor: tokens.color.map.route,
    transform: [{ rotate: '-20deg' }],
  },
  pickupPin: { position: 'absolute', top: 56, left: 160 },
  carMarkerRing: {
    position: 'absolute',
    bottom: 54,
    left: 46,
    width: 40,
    height: 40,
    borderRadius: 20,
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
    backgroundColor: theme.role.surface,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing['3'],
    paddingVertical: theme.spacing['2'],
    borderWidth: 1,
    borderColor: theme.role.border,
  },
  cityText: { color: theme.role.textPrimary, ...textStyle('medium', 'small') },
});
