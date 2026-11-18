import type { GradientStop } from '@vuumbora/tokens';

/**
 * Converte um gradiente de `theme.gradient.*` (array de `{color, position}`, formato DTCG)
 * para o par `colors`/`locations` que `expo-linear-gradient` espera. Centralizado aqui para
 * nenhum componente reimplementar o `.map()` — ver docs/direcao-de-arte.md §4/§5.
 */
export function gradientColors(stops: readonly GradientStop[]): readonly [string, string, ...string[]] {
  return stops.map((stop) => stop.color) as unknown as readonly [string, string, ...string[]];
}

export function gradientLocations(stops: readonly GradientStop[]): readonly [number, number, ...number[]] {
  return stops.map((stop) => stop.position) as unknown as readonly [number, number, ...number[]];
}
