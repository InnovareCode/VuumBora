import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '@vuumbora/ui';

export interface ToggleSwitchProps {
  readonly value: boolean;
  readonly testID?: string;
}

/**
 * Indicador visual de interruptor (trilho + bolinha) — SEM `Pressable` próprio de
 * propósito. Quem usa este componente embute o toque na linha inteira (ex.:
 * `ListMenuRow`), não só na área pequena do interruptor — alvo de toque maior é mais
 * acessível. `accessibilityElementsHidden` evita que o leitor de tela anuncie este nó
 * separado do `accessibilityRole="switch"` que já vive na `Pressable` pai.
 */
export const ToggleSwitch = memo(function ToggleSwitch({ value, testID }: ToggleSwitchProps) {
  return (
    <View
      style={[styles.track, value ? styles.trackOn : styles.trackOff]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <View style={[styles.thumb, value && styles.thumbOn]} />
    </View>
  );
});

const TRACK_WIDTH = 46;
const TRACK_HEIGHT = 26;
const THUMB_SIZE = 20;

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  trackOn: { backgroundColor: theme.role.ctaBackground, borderColor: theme.role.ctaBackground },
  trackOff: { backgroundColor: theme.role.surfaceElevated, borderColor: theme.role.borderControl },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: theme.role.textPrimary,
    alignSelf: 'flex-start',
  },
  thumbOn: { backgroundColor: theme.role.ctaText, alignSelf: 'flex-end' },
});
