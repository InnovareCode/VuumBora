import { memo, useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { theme, tokens } from '@vuumbora/ui';

/**
 * Animação de "procurando motorista" (P07, ficha §2/§6) — dois anéis traço (sem
 * preenchimento) pulsando em volta do PINO DE EMBARQUE, sobre o mapa. Discreta (sem
 * rotação, sem brilho) e respeita "reduzir movimento" do sistema, igual ao
 * `LoadingSkeleton` de `@vuumbora/ui` — aqui não entrou no pacote porque é composição
 * específica desta tela, não um primitivo transversal.
 *
 * Correção da ficha (§2/§3): o ícone de carro e o preenchimento amarelo saíram — "sobre o
 * mapa, o núcleo vira o próprio pino de embarque" (mesmo círculo `map.pickup` usado nos
 * balões da P05/P06). Posicionamento: quem ancora este componente num ponto do mapa é o
 * CHAMADOR (`position: absolute` em volta dele) — ele só desenha o pulso centrado em si.
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
    // Ficha §8: o pulso é DECORATIVO — o estado ("Procurando motorista") já é dito pelo
    // título da tela. Antes tinha `accessibilityRole="progressbar"` sem `accessibilityValue`
    // (progresso indeterminado e repetido no leitor de tela); saiu.
    <View style={styles.root} accessible={false} importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.ring, ringStyle(ring1)]} />
      <Animated.View style={[styles.ring, ringStyle(ring2)]} />
      <View style={styles.core} />
    </View>
  );
});

const CORE_SIZE = 18;
const RING_SIZE = 44;

const styles = StyleSheet.create({
  root: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  // Auditoria Apolo (S1) + ficha P07 §3: o amarelo era um disco CHEIO de 133/76pt — o
  // maior bloco de cor da tela, decoração pura, com um ícone de carro flutuando no meio
  // do mapa. Agora o anel é só TRAÇO (borda 2pt, sem preenchimento) e o núcleo é o MESMO
  // pino de embarque (`map.pickup`) dos balões da P05/P06/P07 — não inventa um segundo
  // símbolo para o mesmo lugar.
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    borderColor: theme.role.ctaBackground,
  },
  core: {
    width: CORE_SIZE,
    height: CORE_SIZE,
    borderRadius: CORE_SIZE / 2,
    backgroundColor: tokens.color.map.pickup,
    // Contorno escuro (não amarelo, pra não duplicar a cor do anel): separa o pino do
    // fundo de mapa, igual ao balão de origem da P05/P06.
    borderWidth: 2,
    borderColor: theme.role.screen,
  },
});
