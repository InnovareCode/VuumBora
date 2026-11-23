import { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { focusRingStyle, theme, textStyle, useKeyboardFocusRing } from '@vuumbora/ui';

export interface DangerLinkButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/**
 * Link de texto em `role.danger`, centralizado (ficha P13 §2.2: "LinkButton em role.danger,
 * centro" — "Excluir conta"). O `LinkButton` de `packages/ui` não tem variante de tom (sempre
 * `ctaBackground`, o amarelo da marca — errado para uma ação destrutiva), então este composto
 * local usa os MESMOS hooks de foco/alvo de toque exportados de lá, sem duplicar a lógica nem
 * mexer no componente compartilhado. Usado em Configurações e em "Privacidade e termos".
 *
 * `accessibilityRole="button"`, não `"link"`: um `Pressable role="link"` vira
 * `<div role="link" tabindex="0">` no react-native-web, e Enter não ativa (o
 * `PressResponder` do RNW espera um `click` nativo de `<a href>`, que o `div` não gera —
 * ver `bug_rnweb_link_role_div_enter_nao_ativa` na memória da Lyra; a correção de verdade
 * mora em `linkKeyboard.ts`, que não é exportado de `@vuumbora/ui`). `role="button"` sai
 * como `<button>` de verdade, com Enter/Espaço nativos — e esta ação É uma ação (abre a
 * tela de confirmação), não navegação para outro conteúdo, então o papel semântico também
 * bate melhor.
 */
export const DangerLinkButton = memo(function DangerLinkButton({ label, onPress, accessibilityLabel, testID }: DangerLinkButtonProps) {
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${label}, abre a explicação`}
      style={[styles.target, focusVisible && FOCUS_RING]}
      testID={testID}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
});

const FOCUS_RING = focusRingStyle('inside', theme.radius.sm);

const styles = StyleSheet.create({
  target: {
    minHeight: theme.layout.touchTarget,
    minWidth: theme.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing['3'],
  },
  label: { color: theme.role.danger, ...textStyle('semibold', 'body'), textDecorationLine: 'underline' },
});
