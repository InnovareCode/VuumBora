/**
 * PressableScale (C-13, `docs/padrao-premium-telas.md` §7/§15): resposta de toque do padrão
 * premium — o alvo encolhe para `scaleTo` (padrão 0,97) em `motion.duration.instant` (120ms)
 * ao tocar e volta ao soltar. Com "reduzir movimento" ligado, não escala (a mudança de cor do
 * próprio `Pressable`, feita pelo chamador via `pressed`, continua valendo — regra §7: some o
 * deslocamento/escala, não o feedback inteiro).
 *
 * Não usa `react-native-reanimated` (PP-8 instalado, mas sem o plugin do babel configurado —
 * ver PENDÊNCIAS do handoff): `Animated` do próprio `react-native` já cobre uma escala simples
 * de 120ms sem exigir worklets.
 *
 * ⚠ Este componente NÃO inclui o anel de foco de teclado (`useKeyboardFocusRing`/`focusRingStyle`)
 * — ele só cuida da escala. Achado Q1 da Íris (22/11/2026): todo clicável novo usa o anel
 * compartilhado por padrão. Quem usar `PressableScale` diretamente (em vez de passar por um
 * componente que já o tem, como `ButtonCore`) precisa acrescentar o anel por fora, do mesmo
 * jeito que `ButtonCore` faz (`focusProps` espalhado + `style` condicional ao `focusVisible`).
 */
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { theme } from '@vuumbora/tokens';

export interface PressableScaleRenderState {
  readonly pressed: boolean;
}

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  /** Quanto encolhe (0 a 1). Padrão 0,97 — medido na direção de arte. */
  readonly scaleTo?: number;
  readonly style?: StyleProp<ViewStyle> | ((state: PressableScaleRenderState) => StyleProp<ViewStyle>);
  readonly children?: ReactNode | ((state: PressableScaleRenderState) => ReactNode);
}

// Mesma regra de `LoadingSkeleton.tsx`: o driver nativo não existe no react-native-web.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';
const EASE_OUT = Easing.bezier(...theme.motion.easing.out);

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduced(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value: boolean) => {
      setReduced(value);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

export const PressableScale = memo(function PressableScale({
  scaleTo = 0.97,
  style,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = useCallback(
    (value: number) => {
      if (reducedMotion) return;
      Animated.timing(scale, {
        toValue: value,
        duration: theme.motion.duration.instant,
        easing: EASE_OUT,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
    },
    [reducedMotion, scale]
  );

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      animateTo(scaleTo);
      onPressIn?.(event);
    },
    [animateTo, scaleTo, onPressIn]
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      animateTo(1);
      onPressOut?.(event);
    },
    [animateTo, onPressOut]
  );

  return (
    <Pressable {...rest} onPressIn={handlePressIn} onPressOut={handlePressOut} style={style}>
      {(state: PressableScaleRenderState) => (
        <Animated.View style={{ transform: [{ scale }] }}>
          {typeof children === 'function' ? children(state) : children}
        </Animated.View>
      )}
    </Pressable>
  );
});
