import { memo, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { MapPreviewBackground, MockBadge, theme } from '@vuumbora/ui';

// Mesma técnica do `RouteMapBanner` (P05/P06, `src/components/categoria/RouteMapBanner.tsx`):
// mapa placeholder (`MapPreviewBackground`, sem SDK real, C-12) em cima + painel tipo "sheet"
// embaixo. NÃO foi fundido com o `RouteMapBanner` nesta fatia — ele já estava em produção pela
// P05/P06 quando esta tela foi escrita, e extrair um componente comum tocaria telas já aprovadas
// fora do escopo pedido (onda 4). Fica registrado para quem quiser unificar depois (pedido de
// componente da ficha P07 §12: "`RideMapLayout`, uma vez para P05, P06, P07, P08 e P09").
const COMPACT_HEIGHT_BREAKPOINT = 360;
const COMPACT_MAP_HEIGHT = 200;
const MAP_HEIGHT_RATIO = 0.45;
// Mapa menor (ficha P08, opção da Íris): no estado "chegou", o carro já está parado — o mapa
// vale menos que o código de embarque, e o painel ganha o espaço que falta pra "Ligar 190" e
// "Cancelar corrida" (no rodapé fixo) não cobrirem o cartão do código em 320-390px.
const COMPACT_MAP_HEIGHT_SMALL = 130;
const MAP_HEIGHT_RATIO_SMALL = 0.26;

export interface RideMapLayoutProps {
  readonly mapAccessibilityLabel: string;
  /** Pinos, pulso, carro — tudo posicionado em `position: absolute` por dentro da área do mapa. */
  readonly mapContent?: ReactNode;
  /** Conteúdo do painel (sheet) embaixo do mapa. */
  readonly children: ReactNode;
  /** `true`: mapa reduzido (ver `COMPACT_MAP_HEIGHT_SMALL`/`MAP_HEIGHT_RATIO_SMALL`). */
  readonly compactMap?: boolean;
  readonly testID?: string;
}

/**
 * Moldura de mapa + painel (C-02/C-12 até existirem de verdade) usada pelas 3 fases da corrida
 * ativa (P07/P08/P09, unificadas em `/corrida` pela PP-10) — "o mapa não é montado de novo a
 * cada fase" (ficha P07 §12). Quem chama decide o conteúdo do mapa (pulso, carro, pinos) e do
 * painel; esta moldura só resolve tamanho/arredondamento/selo de mock.
 */
export const RideMapLayout = memo(function RideMapLayout({ mapAccessibilityLabel, mapContent, children, compactMap = false, testID }: RideMapLayoutProps) {
  const { width, height: windowHeight } = useWindowDimensions();
  const compactHeight = compactMap ? COMPACT_MAP_HEIGHT_SMALL : COMPACT_MAP_HEIGHT;
  const heightRatio = compactMap ? MAP_HEIGHT_RATIO_SMALL : MAP_HEIGHT_RATIO;
  const minMapHeight = width < COMPACT_HEIGHT_BREAKPOINT ? compactHeight : Math.round(windowHeight * heightRatio);
  // Mesmo corte do `RouteMapBanner`/`categoria.tsx`: o painel (não o `AppShell padded={false}`)
  // aplica o respiro lateral ao próprio conteúdo.
  const panelPadding = width < 375 ? theme.layout.screenPaddingCompact : theme.layout.screenPadding;

  return (
    <View style={styles.root} testID={testID}>
      <View style={[styles.map, { minHeight: minMapHeight }]} accessibilityRole="image" accessibilityLabel={mapAccessibilityLabel}>
        <MapPreviewBackground />
        <View style={styles.mockTag}>
          <MockBadge label="mapa ilustrativo" />
        </View>
        {mapContent}
      </View>

      <View style={[styles.panel, { paddingHorizontal: panelPadding }]}>
        <View style={styles.handle} accessibilityElementsHidden importantForAccessibility="no" />
        {children}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flexGrow: 1 },
  map: {
    overflow: 'hidden',
    borderBottomLeftRadius: theme.radius.xxl,
    borderBottomRightRadius: theme.radius.xxl,
  },
  mockTag: { position: 'absolute', top: theme.spacing['2'], right: theme.spacing['2'], zIndex: 2 },
  // `role.surface` chapado é a exceção prevista pela régua para "painel inferior" (mesma nota de
  // `categoria.tsx`) — os CARDS por dentro dele usam `SurfaceRaised`.
  panel: {
    backgroundColor: theme.role.surface,
    borderTopLeftRadius: theme.radius.xxl,
    borderTopRightRadius: theme.radius.xxl,
    boxShadow: theme.elevation['3'],
    paddingTop: theme.spacing['3'],
    paddingBottom: theme.spacing['5'],
    gap: theme.spacing['4'],
  },
  handle: {
    alignSelf: 'center',
    width: theme.layout.sheetHandleWidth,
    height: theme.layout.sheetHandleHeight,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.role.borderControl,
    marginBottom: theme.spacing['1'],
  },
});
