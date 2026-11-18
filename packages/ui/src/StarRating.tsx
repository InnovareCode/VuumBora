import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';

export interface StarRatingProps {
  /** Nota atual (0 a `max`). Fracionária só faz sentido no modo leitura (ex.: 4.8). */
  readonly value: number;
  readonly max?: number;
  /** Presente = interativo (seleção por toque); ausente = só leitura (nota de alguém). */
  readonly onChange?: (value: number) => void;
  readonly size?: number;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

const DEFAULT_MAX = 5;
const DEFAULT_SIZE = 28;

/**
 * Estrelas (glifo ★/☆, fonte do sistema de propósito — mesma regra de dingbat/seta de
 * `typography.ts`: Plus Jakarta Sans não garante cobrir o caractere). Modo leitura
 * (`onChange` ausente) arredonda pra estrela inteira mais próxima só visualmente — o
 * rótulo de acessibilidade sempre fala a nota exata. Modo interativo dá 44px de alvo de
 * toque por estrela mesmo com o glifo desenhando bem menor.
 */
export const StarRating = memo(function StarRating({ value, max = DEFAULT_MAX, onChange, size = DEFAULT_SIZE, accessibilityLabel, testID }: StarRatingProps) {
  const interactive = Boolean(onChange);
  const stars = Array.from({ length: max }, (_, index) => index + 1);
  const glyphLineHeight = Math.round(size * 1.3);

  const handlePress = useCallback(
    (star: number) => {
      onChange?.(star);
    },
    [onChange]
  );

  if (!interactive) {
    return (
      <View
        style={styles.row}
        testID={testID}
        accessibilityRole="text"
        accessibilityLabel={accessibilityLabel ?? `Avaliação ${value.toFixed(1)} de ${max} estrelas`}
      >
        {stars.map((star) => (
          <Text
            key={star}
            style={[styles.glyph, { fontSize: size, lineHeight: glyphLineHeight, color: star <= Math.round(value) ? theme.role.ctaBackground : theme.role.borderControl }]}
          >
            {star <= Math.round(value) ? '★' : '☆'}
          </Text>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.row} testID={testID}>
      {stars.map((star) => (
        <Pressable
          key={star}
          onPress={() => handlePress(star)}
          accessibilityRole="button"
          accessibilityState={{ selected: star <= value }}
          accessibilityLabel={`Avaliar com ${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
          style={styles.touchTarget}
        >
          <Text style={[styles.glyph, { fontSize: size, lineHeight: glyphLineHeight, color: star <= value ? theme.role.ctaBackground : theme.role.borderControl }]}>
            {star <= value ? '★' : '☆'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['1'] },
  touchTarget: { minWidth: theme.layout.touchTarget, minHeight: theme.layout.touchTarget, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontWeight: theme.typography.weight.bold },
});
