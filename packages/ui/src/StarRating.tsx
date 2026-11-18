import { memo, useCallback, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';

export interface StarRatingIconProps {
  readonly filled: boolean;
  readonly size: number;
  readonly color: string;
}

export interface StarRatingProps {
  /** Nota atual (0 a `max`). Fracionária só faz sentido no modo leitura (ex.: 4.8). */
  readonly value: number;
  readonly max?: number;
  /** Presente = interativo (seleção por toque); ausente = só leitura (nota de alguém). */
  readonly onChange?: (value: number) => void;
  readonly size?: number;
  /**
   * Ícone já resolvido pelo app (lib de ícone é decisão do app, não da `ui` — mesmo
   * padrão de `BottomTabBar.icon`/`ButtonCore.icon`). Auditoria F3: a estrela do
   * glifo `★/☆` do sistema destoa do resto do app (lucide); passe `(props) => <Star
   * size={props.size} color={props.color} fill={props.filled ? props.color : 'none'}
   * strokeWidth={1.75} />`. Sem a prop, cai no glifo (compatibilidade com quem ainda
   * não instalou a lib de ícone).
   */
  readonly icon?: (props: StarRatingIconProps) => ReactNode;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

const DEFAULT_MAX = 5;
const DEFAULT_SIZE = 28;

/**
 * Estrelas de avaliação. Modo leitura (`onChange` ausente) arredonda pra estrela
 * inteira mais próxima só visualmente — o rótulo de acessibilidade sempre fala a nota
 * exata. Modo interativo dá 44px de alvo de toque por estrela mesmo com o ícone
 * desenhando bem menor. Cor: cheia em `ctaBackground` (aqui o amarelo É a ação de
 * avaliar — direção de arte F3); vazia em `textMuted` (antes `borderControl`, pouco
 * visível — auditoria F3).
 */
export const StarRating = memo(function StarRating({ value, max = DEFAULT_MAX, onChange, size = DEFAULT_SIZE, icon, accessibilityLabel, testID }: StarRatingProps) {
  const interactive = Boolean(onChange);
  const stars = Array.from({ length: max }, (_, index) => index + 1);
  const glyphLineHeight = Math.round(size * 1.3);

  const handlePress = useCallback(
    (star: number) => {
      onChange?.(star);
    },
    [onChange]
  );

  const renderStar = (filled: boolean) => {
    const color = filled ? theme.role.ctaBackground : theme.role.textMuted;
    if (icon) return icon({ filled, size, color });
    // Glifo (★/☆) de fallback: fonte do sistema de propósito — ver nota em typography.ts.
    return <Text style={[styles.glyph, { fontSize: size, lineHeight: glyphLineHeight, color }]}>{filled ? '★' : '☆'}</Text>;
  };

  if (!interactive) {
    return (
      <View
        style={styles.row}
        testID={testID}
        accessibilityRole="text"
        accessibilityLabel={accessibilityLabel ?? `Avaliação ${value.toFixed(1)} de ${max} estrelas`}
      >
        {stars.map((star) => (
          <View key={star}>{renderStar(star <= Math.round(value))}</View>
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
          {renderStar(star <= value)}
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
