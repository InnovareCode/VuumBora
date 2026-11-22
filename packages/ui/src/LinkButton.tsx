import { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { linkKeyDownProps } from './linkKeyboard';
import { textStyle } from './typography';
import { focusRingStyle, useKeyboardFocusRing } from './useFocusRing';

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
 *
 * No web (só lá), duas coisas que o react-native-web não entrega num `<div role="link">`:
 *  - Enter ativa o link (ver `linkKeyboard.ts`; Espaço não, como num `<a href>`);
 *  - anel de foco próprio, de teclado apenas (`useFocusRing.ts`): o contorno padrão do navegador some contra o fundo
 *    escuro (no WebKit é preto sobre azul-marinho, 1,08:1). Mesma cor e espessura do foco dos campos (`InputCore`).
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
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  // `onKeyDown` não existe nos tipos do Pressable (é do react-native-web): mesmo cast de `ConsentCheckbox`.
  const keyProps = linkKeyDownProps({ platform: Platform.OS, role, disabled, onPress }) as object;

  return (
    <Pressable
      {...keyProps}
      {...focusProps}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={[styles.target, { alignSelf: align }, focusVisible && FOCUS_RING]}
      testID={testID}
    >
      <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
    </Pressable>
  );
});

// Para DENTRO da caixa de 44pt: o contorno não ocupa espaço e não é cortado por um pai com overflow.
const FOCUS_RING = focusRingStyle('inside', theme.radius.sm);

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
