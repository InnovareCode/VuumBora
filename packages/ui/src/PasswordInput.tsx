import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { InputCore, type InputCoreProps } from './InputCore';
import { textStyle } from './typography';

export type PasswordInputProps = Omit<
  InputCoreProps,
  'secureTextEntry' | 'rightAccessory' | 'keyboardType' | 'autoCapitalize'
>;

/** Campo de senha com alternância visível/oculta local (estado de UI, não vai pro global). */
export const PasswordInput = memo(function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const toggle = useCallback(() => setVisible((current) => !current), []);

  return (
    <InputCore
      {...props}
      secureTextEntry={!visible}
      autoCapitalize="none"
      keyboardType="default"
      rightAccessory={
        <Pressable
          onPress={toggle}
          disabled={props.disabled}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Ocultar senha' : 'Mostrar senha'}
          style={styles.toggleTarget}
        >
          <Text style={[styles.toggle, props.disabled && styles.toggleDisabled]}>
            {visible ? 'Ocultar' : 'Mostrar'}
          </Text>
        </Pressable>
      }
    />
  );
});

const styles = StyleSheet.create({
  // Alvo de toque >= 44px mesmo com o rótulo visual pequeno (medido no navegador).
  toggleTarget: {
    minHeight: theme.layout.touchTarget,
    minWidth: theme.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggle: { color: theme.role.ctaBackground, ...textStyle('semibold', 'small') },
  toggleDisabled: { color: theme.role.textMuted },
});
