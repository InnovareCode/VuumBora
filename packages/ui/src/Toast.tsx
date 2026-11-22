import { memo, useEffect } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { textStyle } from './typography';

export interface ToastProps {
  readonly message: string;
  readonly visible: boolean;
  /** Chamado quando o tempo acaba — quem renderiza decide o que fazer (normalmente `setVisible(false)`). */
  readonly onDismiss: () => void;
  /** ms visível antes de `onDismiss`. Padrão: `theme.motion.duration.toast` (PP-7 — valor de
   * julgamento da Lyra, sem medição na referência, pendente de revisão visual). */
  readonly duration?: number;
  readonly testID?: string;
}

/**
 * Confirmação curta sem mudar de tela (C-05, `docs/padrao-premium-telas.md` §15: "Avaliação
 * enviada", "Endereço salvo"). Controlado por quem chama (`visible`/`onDismiss`) — não há
 * provider/fila ainda; quem precisar de mais de um toast por vez compõe por fora.
 *
 * Não se autoposiciona (sem `position:absolute`): quem renderiza decide onde ele flutua
 * (normalmente por cima do conteúdo, perto do rodapé, dentro do próprio `AppShell`), porque
 * a distância certa do CTA/tab bar varia de tela pra tela e ainda não foi medida.
 */
export const Toast = memo(function Toast({ message, visible, onDismiss, duration = theme.motion.duration.toast, testID }: ToastProps) {
  useEffect(() => {
    if (!visible) return;
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [visible, message, duration, onDismiss]);

  if (!visible) return null;

  return (
    <View
      style={styles.root}
      testID={testID}
      role="status"
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.text} numberOfLines={2}>
        {message}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    alignSelf: 'center',
    maxWidth: '92%',
    backgroundColor: theme.role.glassOnMap,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing['2'],
    paddingHorizontal: theme.spacing['4'],
    boxShadow: theme.elevation['2'],
  },
  text: { color: theme.role.textPrimary, ...textStyle('medium', 'small'), textAlign: 'center' },
});
