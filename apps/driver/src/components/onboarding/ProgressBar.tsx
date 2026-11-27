import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '@vuumbora/ui';

export interface ProgressBarProps {
  /** 0 a 1. Fora disso, é preso no intervalo. */
  readonly fraction: number;
  /** O que a barra mede, em palavras ("Faltam 3 de 7 etapas"): o leitor de tela lê isto e o valor. */
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

/**
 * Barra linear de 6 pt (ficha M03 §2: progresso do cadastro e barra de envio do arquivo). Amarelo no preenchimento:
 * a ficha conta a barra como um dos dois blocos amarelos da tela, junto do CTA. O progresso também vai em TEXTO ao
 * lado, na tela (ficha M03 §8, "progresso como texto, não só a barra"); aqui ele vai também como valor acessível.
 */
export const ProgressBar = memo(function ProgressBar({ fraction, accessibilityLabel, testID }: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const percent = Math.round(clamped * 100);
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      testID={testID}
    >
      <View style={[styles.fill, { width: `${percent}%` }]} />
    </View>
  );
});

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.role.surfaceElevated,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: theme.radius.pill, backgroundColor: theme.role.ctaBackground },
});
