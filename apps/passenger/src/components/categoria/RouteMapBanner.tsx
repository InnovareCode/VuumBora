import { memo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ChevronLeft, Circle, MapPin } from 'lucide-react-native';
import { MapPreviewBackground, MockBadge, theme, textStyle, tokens, focusRingStyle, useKeyboardFocusRing } from '@vuumbora/ui';

// Ficha P05 §2: "320×568: mapa com 168pt" / "390×844: ~380pt" (45% de 844) / "430×932: o mapa
// GANHA A SOBRA; o painel tem a altura do conteúdo". Por isso isto é um `minHeight` + `flex:1`
// (quem decide se sobra espaço pra crescer é o `ScrollView` do chamador, não um valor fixo) —
// mesma técnica do `bleed` do `HomeMapPreview` (P03).
const COMPACT_HEIGHT_BREAKPOINT = 360;
const COMPACT_MAP_HEIGHT = 168;
const MAP_HEIGHT_RATIO = 0.45;

export interface RouteMapBannerProps {
  readonly originAddress: string;
  readonly destinationAddress: string;
  readonly onBack: () => void;
  readonly testID?: string;
}

/**
 * Mapa placeholder da P05/P06 (ficha §2/§4): mesma técnica do `HomeMapPreview` (P03) — fundo
 * ilustrativo (`MapPreviewBackground`, sem SDK de mapa real ainda, C-12) + balões de endereço
 * (`map.balloon`/`balloonBorderTop`/`balloonBorderBase`, PP-7) sobre ele. Fica em
 * `apps/passenger` (não em `packages/ui`) pelo mesmo motivo do `HomeMapPreview`: os balões são
 * conteúdo desta tela, o adaptador de mapa de verdade é decisão futura de arquitetura.
 *
 * A "rota" é só um traço decorativo entre os dois balões (sem coordenada real) — igual ao
 * resto do mock de mapa, nunca finge ser geolocalização.
 */
// Anel de foco de teclado em volta do balão inteiro (é ele o alvo), FORA dele — mesma técnica
// do botão "Voltar" do `ScreenHeader` (`focusRingStyle('outside', ...)`), que este balão
// substitui nesta tela (sem `ScreenHeader`, o mapa ocupa o topo).
const BACK_FOCUS_RING = focusRingStyle('outside', theme.radius.pill);

export const RouteMapBanner = memo(function RouteMapBanner({ originAddress, destinationAddress, onBack, testID }: RouteMapBannerProps) {
  const { width, height: windowHeight } = useWindowDimensions();
  const minMapHeight = width < COMPACT_HEIGHT_BREAKPOINT ? COMPACT_MAP_HEIGHT : Math.round(windowHeight * MAP_HEIGHT_RATIO);
  const { focusVisible, focusProps } = useKeyboardFocusRing();

  return (
    <View
      style={[styles.root, { minHeight: minMapHeight }]}
      accessibilityRole="image"
      accessibilityLabel={`Mapa ilustrativo (mock) da rota de ${originAddress} até ${destinationAddress}`}
      testID={testID}
    >
      <MapPreviewBackground />

      <View style={styles.mockTag}>
        <MockBadge label="mapa ilustrativo" />
      </View>

      {/* Traço de rota decorativo (sem coordenada real) — illustra a ligação entre os balões,
          nunca a trajetória de verdade (essa só com o adaptador de mapa, C-12). */}
      <View style={styles.routeLine} pointerEvents="none" />

      <Pressable
        {...focusProps}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Voltar e editar o trajeto"
        style={[styles.originBalloon, focusVisible && BACK_FOCUS_RING]}
        testID={testID ? `${testID}-back` : undefined}
      >
        <ChevronLeft size={18} color={theme.role.textPrimary} strokeWidth={2.25} style={styles.balloonIcon} />
        <Circle size={14} color={tokens.color.map.pickup} fill={tokens.color.map.pickup} style={styles.balloonIcon} />
        {/* Ficha, "texto longo": endereço quebra em até 2 linhas antes de truncar (nunca 1). */}
        <Text style={styles.balloonText} numberOfLines={2}>
          {originAddress}
        </Text>
      </Pressable>

      <View style={styles.destinationBalloon}>
        <MapPin size={16} color={tokens.color.map.destination} fill={tokens.color.map.destination} strokeWidth={1.5} style={styles.balloonIcon} />
        <Text style={styles.balloonText} numberOfLines={2}>
          {destinationAddress}
        </Text>
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
  mockTag: { position: 'absolute', top: theme.spacing['2'], right: theme.spacing['2'], zIndex: 2 },
  routeLine: {
    position: 'absolute',
    left: '18%',
    right: '22%',
    top: '38%',
    height: 3,
    borderRadius: theme.radius.pill,
    backgroundColor: tokens.color.map.route,
    opacity: 0.85,
    transform: [{ rotate: '8deg' }],
  },
  originBalloon: {
    position: 'absolute',
    top: theme.spacing['3'],
    left: theme.spacing['3'],
    flexDirection: 'row',
    // `flex-start` (não `center`): com o endereço em 2 linhas (ficha, "texto longo"), os ícones
    // ficam alinhados à PRIMEIRA linha (mesma técnica do `RouteSummaryRow`), não flutuando no
    // meio do bloco de texto.
    alignItems: 'flex-start',
    gap: theme.spacing['2'],
    backgroundColor: tokens.color.map.balloon,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderTopColor: tokens.color.map.balloonBorderTop,
    borderColor: tokens.color.map.balloonBorderBase,
    paddingHorizontal: theme.spacing['3'],
    paddingVertical: theme.spacing['2'],
    maxWidth: '82%',
    minHeight: theme.layout.touchTarget,
  },
  destinationBalloon: {
    position: 'absolute',
    bottom: theme.spacing['4'],
    left: theme.spacing['3'],
    right: theme.spacing['3'],
    flexDirection: 'row',
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
  // Centraliza o ícone na altura da PRIMEIRA linha do texto (que tem `lineHeight` de `small`,
  // 18pt) — sem isto, `flex-start` deixava o ícone colado no topo do balão em vez de alinhado
  // ao meio da 1ª linha.
  balloonIcon: { marginTop: 2 },
  balloonText: { flex: 1, color: theme.role.textPrimary, ...textStyle('medium', 'small') },
});
