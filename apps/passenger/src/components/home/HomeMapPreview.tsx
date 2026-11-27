import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LocateFixed, MapPin, MapPinOff } from 'lucide-react-native';
import { LinkButton, MapPreviewBackground, MockBadge, focusRingStyle, theme, textStyle, tokens, useKeyboardFocusRing } from '@vuumbora/ui';
import type { LocationStatus, PlaceLookupStatus } from '../../location/useLocationStore';
import { LocationPermissionCard } from './LocationPermissionCard';

// Mesmo corte do `AppShell` (`layout.screenPaddingCompact` abaixo de 375pt) — o sangramento
// horizontal precisa cancelar EXATAMENTE o padding que o `AppShell` aplicou (G-09).
const COMPACT_WIDTH_BREAKPOINT = 375;
const LOCATE_FOCUS_RING = focusRingStyle('outside', theme.layout.touchTarget / 2);

export interface HomeMapPreviewProps {
  readonly status: LocationStatus;
  readonly placeStatus: PlaceLookupStatus;
  /** Nome que o servidor deu à posição (`geoPort.reverse`). */
  readonly placeLabel?: string | undefined;
  readonly inServiceArea?: boolean | undefined;
  readonly onAllowLocation: () => void;
  readonly onRelocate: () => void;
  readonly onTypeAddress: () => void;
  /**
   * Ficha P03 §2: "mapa sangrando até a borda e o pé" — cresce para ocupar a sobra vertical e perde a moldura de baixo.
   */
  readonly bleed?: boolean;
}

/**
 * Mapa da P03 sobre o fundo ILUSTRATIVO (`MapPreviewBackground`) até o Mapbox nativo (C-12). O fundo não é
 * georreferenciado; o que é real é a POSIÇÃO do aparelho (`src/location`) e o nome que o servidor deu a ela.
 *
 * Estados (ficha P03 §5): procurando; localizado ("você está aqui" + endereço, com aviso se estiver fora da área
 * atendida); erro ("Não achamos sua localização" + "Tentar de novo"); pré-permissão e recusa (cartão no lugar do mapa);
 * indisponível (nativo sem `expo-location`). Selo "mapa ilustrativo" no canto de BAIXO, fora dos controles (H1).
 *
 * Os botões de zoom saíram: sobre uma ilustração eles não faziam nada (G-19). "Centralizar no meu local" lê a posição
 * de novo.
 */
export const HomeMapPreview = memo(function HomeMapPreview({
  status,
  placeStatus,
  placeLabel,
  inServiceArea,
  onAllowLocation,
  onRelocate,
  onTypeAddress,
  bleed = false,
}: HomeMapPreviewProps) {
  const { width } = useWindowDimensions();
  const bleedMargin = width < COMPACT_WIDTH_BREAKPOINT ? theme.layout.screenPaddingCompact : theme.layout.screenPadding;
  const { focusVisible, focusProps } = useKeyboardFocusRing();

  const needsPermission = status === 'needs_permission' || status === 'denied';
  const located = status === 'located';
  const showLocate = located || status === 'error';

  const mapDescription = located
    ? `Mapa ilustrativo. Você está em ${placeLabel ?? 'um ponto sem nome'}${inServiceArea === false ? ', fora da área atendida' : ''}.`
    : 'Mapa ilustrativo de Natal.';

  return (
    <View
      style={[styles.root, bleed && [styles.rootBleed, { marginHorizontal: -bleedMargin, marginBottom: -bleedMargin }]]}
      testID="home-map"
    >
      <View style={StyleSheet.absoluteFill} accessible accessibilityRole="image" accessibilityLabel={mapDescription}>
        <MapPreviewBackground />
      </View>

      {needsPermission ? (
        <View style={styles.permissionLayer}>
          <LocationPermissionCard
            variant={status === 'denied' ? 'blocked' : 'ask'}
            onAllow={onAllowLocation}
            onTypeAddress={onTypeAddress}
            testID="location-permission-card"
          />
        </View>
      ) : (
        <>
          {located ? (
            <View style={styles.centerMarkerLayer} pointerEvents="none">
              <View style={styles.centerMarkerRing}>
                <View style={styles.centerMarkerDot} />
              </View>
            </View>
          ) : null}

          <View style={styles.statusChip} testID="home-location-chip">
            <LocationChipContent
              status={status}
              placeStatus={placeStatus}
              placeLabel={placeLabel}
              inServiceArea={inServiceArea}
              onRelocate={onRelocate}
            />
          </View>
        </>
      )}

      <View style={styles.bottomRow} pointerEvents="box-none">
        <MockBadge label="mapa ilustrativo" testID="home-map-mock-badge" />
        {showLocate ? (
          <Pressable
            {...focusProps}
            onPress={onRelocate}
            accessibilityRole="button"
            accessibilityLabel="Centralizar no meu local"
            style={[styles.controlButton, focusVisible && LOCATE_FOCUS_RING]}
            testID="home-locate-button"
          >
            <LocateFixed size={18} color={theme.role.textPrimary} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

function LocationChipContent({
  status,
  placeStatus,
  placeLabel,
  inServiceArea,
  onRelocate,
}: Pick<HomeMapPreviewProps, 'status' | 'placeStatus' | 'placeLabel' | 'inServiceArea' | 'onRelocate'>) {
  if (status === 'located') {
    const title = placeStatus === 'ready' && placeLabel ? placeLabel : 'Você está aqui';
    return (
      <View style={styles.chipRow} accessibilityLiveRegion="polite">
        <MapPin size={14} color={theme.role.textSecondary} strokeWidth={2} style={styles.chipIcon} />
        <View style={styles.chipTextBlock}>
          <Text style={styles.chipTitle} numberOfLines={2}>
            {title}
          </Text>
          {placeStatus === 'loading' ? <Text style={styles.chipSupport}>Buscando o endereço…</Text> : null}
          {placeStatus === 'ready' && inServiceArea === false ? (
            <Text style={styles.chipWarning} testID="home-outside-area">
              Fora da área atendida. Por enquanto, atendemos só a Grande Natal.
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.chipColumn} accessibilityLiveRegion="polite">
        <View style={styles.chipRow}>
          <MapPinOff size={14} color={theme.role.textSecondary} strokeWidth={2} style={styles.chipIcon} />
          <Text style={[styles.chipTitle, styles.chipTextBlock]}>Não achamos sua localização.</Text>
        </View>
        <LinkButton label="Tentar de novo" onPress={onRelocate} role="button" align="flex-start" testID="home-location-retry" />
      </View>
    );
  }

  if (status === 'unavailable') {
    return (
      <View style={styles.chipRow}>
        <MapPinOff size={14} color={theme.role.textSecondary} strokeWidth={2} style={styles.chipIcon} />
        <Text style={[styles.chipSupport, styles.chipTextBlock]}>Localização indisponível neste aparelho. Digite o endereço de partida.</Text>
      </View>
    );
  }

  // idle, checking, locating
  return (
    <View style={styles.chipRow} accessibilityLiveRegion="polite">
      <ActivityIndicator size="small" color={theme.role.textSecondary} />
      <Text style={[styles.chipSupport, styles.chipTextBlock]}>Procurando sua localização…</Text>
    </View>
  );
}

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
  // Sangramento (ficha P03 §2): some a moldura de baixo e os cantos de baixo, e cresce para ocupar a sobra vertical —
  // mas nunca abaixo de `MAP_HEIGHT` (320×568, onde não há sobra para crescer).
  rootBleed: {
    height: undefined,
    flex: 1,
    minHeight: MAP_HEIGHT,
    borderBottomWidth: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  permissionLayer: {
    position: 'absolute',
    top: theme.spacing['3'],
    left: theme.spacing['3'],
    right: theme.spacing['3'],
  },
  // Camada cheia + `alignItems`/`justifyContent` centra o pino no meio exato da área visível.
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
  // Chip translúcido sobre o mapa (`glassOnMap`, opaco, sem blur — direção de arte §5).
  statusChip: {
    position: 'absolute',
    top: theme.spacing['3'],
    left: theme.spacing['3'],
    right: theme.spacing['3'],
    backgroundColor: theme.role.glassOnMap,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.role.border,
    paddingHorizontal: theme.spacing['3'],
    paddingVertical: theme.spacing['2'],
  },
  chipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing['2'] },
  chipColumn: { gap: theme.spacing['1'] },
  chipIcon: { marginTop: 2 },
  chipTextBlock: { flex: 1, gap: 2 },
  chipTitle: { color: theme.role.textPrimary, ...textStyle('medium', 'small') },
  chipSupport: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  chipWarning: { color: theme.role.warning, ...textStyle('medium', 'caption') },
  bottomRow: {
    position: 'absolute',
    left: theme.spacing['3'],
    right: theme.spacing['3'],
    bottom: theme.spacing['3'],
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
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
});
