import { memo, useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { theme } from '@vuumbora/tokens';

export type LoadingSkeletonVariant = 'line' | 'block' | 'circle';

export interface LoadingSkeletonProps {
  readonly variant?: LoadingSkeletonVariant;
  readonly width?: number | `${number}%`;
  readonly height?: number;
  /** Número de linhas empilhadas (só para `variant="line"`). */
  readonly lines?: number;
  readonly testID?: string;
}

/**
 * O driver nativo de animação só existe no iOS/Android. No web `useNativeDriver: true` não funciona e o RN Web avisa no
 * console ("Animated: `useNativeDriver` is not supported because the native animated module is missing") a cada esqueleto
 * montado: no web a animação roda em JS, que para um pulso de opacidade é o que se quer (N4 da passada 4 da Íris).
 */
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

/** Pulso de opacidade; respeita "reduzir movimento" do sistema (fica estático se ativo). */
function useAutoPulse() {
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    let loopAnimation: Animated.CompositeAnimation | null = null;
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      loopAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(opacity, { toValue: 0.6, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
        ])
      );
      loopAnimation.start();
    });

    return () => {
      cancelled = true;
      loopAnimation?.stop();
    };
  }, [opacity]);

  return opacity;
}

export const LoadingSkeleton = memo(function LoadingSkeleton({
  variant = 'line',
  width,
  height,
  lines = 1,
  testID,
}: LoadingSkeletonProps) {
  const opacity = useAutoPulse();

  const shape: ViewStyle =
    variant === 'circle'
      ? { width: height ?? 40, height: height ?? 40, borderRadius: 999 }
      : variant === 'block'
        ? { width: width ?? '100%', height: height ?? 96, borderRadius: theme.radius.md }
        : { width: width ?? '100%', height: height ?? 14, borderRadius: theme.radius.sm };

  return (
    <View testID={testID} accessibilityLabel="Carregando" accessibilityRole="progressbar" style={styles.stack}>
      {Array.from({ length: Math.max(1, lines) }).map((_, index) => (
        <Animated.View
          key={index}
          style={[styles.block, shape, { opacity, marginTop: index === 0 ? 0 : theme.spacing['2'] }]}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  stack: { width: '100%' },
  block: { backgroundColor: theme.role.surfaceElevated },
});
