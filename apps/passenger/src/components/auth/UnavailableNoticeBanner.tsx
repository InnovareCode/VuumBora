import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme, textStyle, glyphStyle } from '@vuumbora/ui';

export interface UnavailableNoticeBannerProps {
  readonly message: string;
  readonly testID?: string;
}

/**
 * Aviso inline para ação que ainda não existe de verdade (termos de uso/política de
 * privacidade sem texto publicado, recuperação de senha sem backend) — usado no lugar
 * de navegar para uma rota vazia ou um link morto. `accessibilityLiveRegion` avisa
 * leitor de tela sem interromper como um alerta de erro (não é um erro).
 */
export const UnavailableNoticeBanner = memo(function UnavailableNoticeBanner({
  message,
  testID,
}: UnavailableNoticeBannerProps) {
  return (
    <View
      style={styles.root}
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
      testID={testID}
    >
      <Text style={styles.glyph}>i</Text>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing['2'],
    padding: theme.spacing['3'],
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.role.borderControl,
    backgroundColor: theme.role.surfaceElevated,
  },
  // Glifo (i): fonte do sistema de propósito — ver nota em typography.ts.
  glyph: { color: theme.role.info, ...glyphStyle(theme.typography.weight.bold, 'small'), marginTop: 1 },
  text: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), flexShrink: 1 },
});
