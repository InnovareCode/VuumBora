import { memo, useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { Car } from 'lucide-react-native';
import { SurfaceRaised, theme } from '@vuumbora/ui';

/**
 * Animação de "procurando motorista" (P07) — dois anéis pulsando ao redor do ícone do
 * carro. Discreta (sem rotação, sem brilho) e respeita "reduzir movimento" do sistema,
 * igual ao `LoadingSkeleton` de `@vuumbora/ui` — aqui não entrou no pacote porque é
 * composição específica desta tela (ícone de carro + 2 anéis), não um primitivo transversal.
 */
export const SearchingPulse = memo(function SearchingPulse() {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let loop1: Animated.CompositeAnimation | null = null;
    let loop2: Animated.CompositeAnimation | null = null;
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;

      const pulse = (value: Animated.Value) =>
        Animated.loop(
          Animated.timing(value, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: Platform.OS !== 'web' })
        );

      loop1 = pulse(ring1);
      loop2 = pulse(ring2);
      loop1.start();
      // Segundo anel começa defasado, pra não pulsar em sincronia perfeita com o primeiro.
      setTimeout(() => {
        if (!cancelled) loop2?.start();
      }, 900);
    });

    return () => {
      cancelled = true;
      loop1?.stop();
      loop2?.stop();
    };
  }, [ring1, ring2]);

  const ringStyle = (value: Animated.Value) => ({
    transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }],
    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
  });

  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel="Procurando motorista">
      <Animated.View style={[styles.ring, ringStyle(ring1)]} />
      <Animated.View style={[styles.ring, ringStyle(ring2)]} />
      <SurfaceRaised style={styles.core}>
        <Car size={32} color={theme.role.ctaBackground} strokeWidth={2} />
      </SurfaceRaised>
    </View>
  );
});

const CORE_SIZE = 76;

const styles = StyleSheet.create({
  root: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center' },
  // Auditoria Apolo (S1): o amarelo era um disco CHEIO de 133/76pt — o maior bloco de
  // cor da tela, decoração pura. Agora é só TRAÇO (borda 2pt, sem preenchimento); o
  // núcleo vira superfície premium (`SurfaceRaised`) com borda 2pt amarela, não mais
  // amarelo cheio.
  ring: {
    position: 'absolute',
    width: CORE_SIZE,
    height: CORE_SIZE,
    borderRadius: CORE_SIZE / 2,
    borderWidth: 2,
    borderColor: theme.role.ctaBackground,
  },
  core: {
    width: CORE_SIZE,
    height: CORE_SIZE,
    borderRadius: CORE_SIZE / 2,
    borderWidth: 2,
    borderColor: theme.role.ctaBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
