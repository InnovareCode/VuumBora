import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { InputCore, type InputCoreProps } from './InputCore';
import { textStyle } from './typography';
import { focusRingStyle, useKeyboardFocusRing } from './useFocusRing';

export type PasswordInputProps = Omit<
  InputCoreProps,
  'secureTextEntry' | 'rightAccessory' | 'keyboardType' | 'autoCapitalize' | 'autoCorrect'
>;

/**
 * Campo de senha com alternância visível/oculta local (estado de UI, não vai pro global).
 *
 * `autoCorrect={false}` fixo (o `InputCore` o repassa também como `spellCheck`): com "Mostrar" ligado o campo deixa de
 * ser `secureTextEntry`, e aí o teclado pode corrigir a senha e aprender o que foi digitado. Não é prop do chamador
 * (`Omit` acima) — uma tela nova não pode esquecer nem desfazer.
 */
export const PasswordInput = memo(function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const toggle = useCallback(() => setVisible((current) => !current), []);

  return (
    <InputCore
      {...props}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="default"
      rightAccessory={<VisibilityToggle visible={visible} onPress={toggle} disabled={props.disabled === true} />}
    />
  );
});

interface VisibilityToggleProps {
  readonly visible: boolean;
  readonly onPress: () => void;
  readonly disabled: boolean;
}

/** "Mostrar/Ocultar senha": componente à parte para o estado de foco não renderizar o campo inteiro. */
const VisibilityToggle = memo(function VisibilityToggle({ visible, onPress, disabled }: VisibilityToggleProps) {
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={visible ? 'Ocultar senha' : 'Mostrar senha'}
      style={[styles.toggleTarget, focusVisible && FOCUS_RING]}
    >
      <Text style={[styles.toggle, disabled && styles.toggleDisabled]}>{visible ? 'Ocultar' : 'Mostrar'}</Text>
    </Pressable>
  );
});

// Dentro da caixa de 44pt: o alvo mora dentro da borda do campo (que corta o que sai) e o rótulo é pequeno e centrado.
const FOCUS_RING = focusRingStyle('inside', theme.radius.sm);

const styles = StyleSheet.create({
  // Alvo de toque >= 44px mesmo com o rótulo visual pequeno (medido no navegador).
  toggleTarget: {
    minHeight: theme.layout.touchTarget,
    minWidth: theme.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // L3 (`docs/padrao-premium-telas.md` §15): é controle de campo, não ação — `textSecondary`,
  // não `ctaBackground` (amarelo é sinal de ação/seleção, §2).
  toggle: { color: theme.role.textSecondary, ...textStyle('semibold', 'small') },
  toggleDisabled: { color: theme.role.textMuted },
});
