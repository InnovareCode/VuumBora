import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { glyphStyle, textStyle } from './typography';
import { focusRingStyle, useKeyboardFocusRing } from './useFocusRing';

export interface ScreenHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly onBack?: () => void;
  readonly rightSlot?: ReactNode;
  readonly testID?: string;
}

/** Cabeçalho padrão de tela: voltar (opcional) + título/subtítulo + slot de ação. */
export const ScreenHeader = memo(function ScreenHeader({ title, subtitle, onBack, rightSlot, testID }: ScreenHeaderProps) {
  return (
    <View style={styles.row} testID={testID}>
      {onBack ? <BackButton onPress={onBack} /> : null}
      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.rightSlot}>{rightSlot}</View>
    </View>
  );
});

// Dentro da caixa de 44pt: o glifo é pequeno e centrado, e o alvo encosta na borda da tela (um anel de fora seria cortado).
const FOCUS_RING = focusRingStyle('inside', theme.radius.md);

/** "Voltar": estado de foco próprio (componente à parte para o cabeçalho inteiro não renderizar a cada Tab). */
const BackButton = memo(function BackButton({ onPress }: { readonly onPress: () => void }) {
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Voltar"
      hitSlop={8}
      style={[styles.backButton, focusVisible && FOCUS_RING]}
    >
      <Text style={styles.backGlyph}>‹</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: theme.layout.touchTarget, gap: theme.spacing['2'] },
  backButton: {
    width: theme.layout.touchTarget,
    height: theme.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Glifo decorativo (‹): fica na fonte do sistema de propósito, não na da marca
  // (Plus Jakarta Sans não garante cobrir símbolo fora do latim — ver typography.ts).
  backGlyph: { color: theme.role.textPrimary, ...glyphStyle(theme.typography.weight.semibold, 'heading') },
  titleBlock: { flex: 1 },
  title: { color: theme.role.textPrimary, ...textStyle('bold', 'title') },
  subtitle: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), marginTop: theme.spacing['1'] },
  rightSlot: { minWidth: theme.layout.touchTarget, alignItems: 'flex-end' },
});
