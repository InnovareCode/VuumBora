import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { theme, tokens } from '@vuumbora/ui';

export interface RouteOverlayPoint {
  readonly lat: number;
  readonly lng: number;
}

export interface RouteOverlayInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface RouteOverlayProps {
  /** Polilinha JÁ decodificada (`decodePolyline`), ou só os dois pontos enquanto a cotação não chega. */
  readonly points: readonly RouteOverlayPoint[];
  readonly width: number;
  readonly height: number;
  /** Folga das bordas (onde ficam os balões), para a rota nunca passar por baixo deles. */
  readonly insets: RouteOverlayInsets;
  /** `false` enquanto só há origem e destino (sem a rota da cotação): desenha os pontos, sem o traço. */
  readonly showRoute: boolean;
}

/**
 * A ROTA da cotação desenhada sobre o mapa ilustrativo (pedido de componente C-12 `RouteOverlay`, local até existir). O
 * fundo não é georreferenciado: a forma da rota é a real (a polilinha que o servidor devolveu, encaixada na caixa
 * mantendo a proporção entre leste-oeste e norte-sul), mas a posição dela sobre as ruas do desenho não é. Por isso o mapa
 * continua com o selo "mapa ilustrativo".
 *
 * Marcadores: origem = círculo `map.pickup`, destino = círculo `map.destination` (padrão premium §4, nada amarelo além
 * da rota). Puramente decorativo para o leitor de tela: quem chama envolve num `View` `accessible` com a descrição em texto
 * (sem props de acessibilidade no `Svg`: no web o `react-native-svg` as repassa ao DOM e o React reclama).
 */
export const RouteOverlay = memo(function RouteOverlay({ points, width, height, insets, showRoute }: RouteOverlayProps) {
  const projected = useMemo(() => projectPoints(points, width, height, insets), [points, width, height, insets]);
  if (projected.length === 0 || width <= 0 || height <= 0) return null;

  const first = projected[0];
  const last = projected[projected.length - 1];
  const polylinePoints = projected.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {showRoute && projected.length > 1 ? (
        <>
          <Polyline points={polylinePoints} fill="none" stroke={tokens.color.map.balloon} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.6} />
          <Polyline points={polylinePoints} fill="none" stroke={tokens.color.map.route} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {first ? <Circle cx={first.x} cy={first.y} r={7} fill={tokens.color.map.pickup} stroke={theme.role.ctaText} strokeWidth={2.5} /> : null}
      {last && last !== first ? <Circle cx={last.x} cy={last.y} r={7} fill={tokens.color.map.destination} stroke={theme.role.ctaText} strokeWidth={2.5} /> : null}
    </Svg>
  );
});

interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Encaixa os pontos na caixa útil, com a mesma escala nos dois eixos (leste-oeste corrigido pela latitude), com a origem
 * sempre acima do destino (ver o giro abaixo).
 */
function projectPoints(points: readonly RouteOverlayPoint[], width: number, height: number, insets: RouteOverlayInsets): readonly ScreenPoint[] {
  if (points.length === 0) return [];
  const boxWidth = Math.max(1, width - insets.left - insets.right);
  const boxHeight = Math.max(1, height - insets.top - insets.bottom);
  const meanLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const lngFactor = Math.cos((meanLat * Math.PI) / 180);

  // Norte para cima, como num mapa…
  let xs = points.map((point) => point.lng * lngFactor);
  let ys = points.map((point) => -point.lat);
  // …a não ser que a origem fique ABAIXO do destino: aí gira 180° (rotação, não espelho — a forma da rota é a mesma),
  // para a origem cair perto do balão de origem (em cima) e o destino perto do de destino (embaixo). O fundo é
  // ilustrativo, não georreferenciado: a orientação do norte não informa nada a quem olha, a proximidade do balão sim.
  const firstY = ys[0] ?? 0;
  const lastY = ys[ys.length - 1] ?? 0;
  if (firstY > lastY) {
    xs = xs.map((x) => -x);
    ys = ys.map((y) => -y);
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const scaleX = spanX > 0 ? boxWidth / spanX : Number.POSITIVE_INFINITY;
  const scaleY = spanY > 0 ? boxHeight / spanY : Number.POSITIVE_INFINITY;
  const scale = Math.min(scaleX, scaleY);

  if (!Number.isFinite(scale)) {
    // Todos no mesmo lugar: um ponto só, no centro da caixa.
    return points.map(() => ({ x: insets.left + boxWidth / 2, y: insets.top + boxHeight / 2 }));
  }
  const offsetX = insets.left + (boxWidth - spanX * scale) / 2;
  const offsetY = insets.top + (boxHeight - spanY * scale) / 2;
  return points.map((_, index) => ({
    x: offsetX + ((xs[index] ?? minX) - minX) * scale,
    y: offsetY + ((ys[index] ?? minY) - minY) * scale,
  }));
}
