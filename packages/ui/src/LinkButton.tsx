import { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { textStyle } from './typography';

export interface LinkButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  /** `link` para navegar a outra tela/documento; `button` para uma ação (reenviar, tentar de novo). */
  readonly role?: 'link' | 'button';
  readonly align?: 'flex-start' | 'center' | 'flex-end';
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string | undefined;
  readonly testID?: string | undefined;
}

/**
 * Link de texto com alvo de toque real de 44pt (`theme.layout.touchTarget`) — um `<Text onPress>` solto no meio de
 * uma frase mede ~17pt e reprova o mínimo do design system. Sublinhado: o link não se distingue só pela cor.
 */
export const LinkButton = memo(function LinkButton({
  label,
  onPress,
  role = 'link',
  align = 'center',
  disabled = false,
  accessibilityLabel,
  testID,
}: LinkButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={[styles.target, { alignSelf: align }]}
      testID={testID}
    >
      <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  target: {
    minHeight: theme.layout.touchTarget,
    minWidth: theme.layout.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing['2'],
  },
  label: { color: theme.role.ctaBackground, ...textStyle('semibold', 'small'), textDecorationLine: 'underline', textAlign: 'center' },
  labelDisabled: { color: theme.role.textMuted },
});
